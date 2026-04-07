import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { doctorStorage, Doctor, ConversationRecord } from "@/lib/storage";
import { Upload, CheckCircle, AlertCircle, ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import { analyzePastConversations } from "@/lib/ai";

interface ParsedVisit {
  index: number;
  content: string;
}

interface ParsedDoctor {
  department: string;
  name: string;
  visits: ParsedVisit[];
  existingDoctor?: Doctor;
}

interface ImportResult {
  name: string;
  department: string;
  created: boolean;
  visitsAdded: number;
  error?: string;
}

function parseBulkInput(text: string): ParsedDoctor[] {
  const doctors: ParsedDoctor[] = [];
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = normalized.split("\n").map((l) => l.trim());

  // 진료과 판별: 과/내과/외과 등 키워드 포함, / 없음
  function isDept(line: string): boolean {
    if (!line || line.includes("/")) return false;
    const keywords = ["내과", "외과", "과", "센터", "병동", "의학", "약제"];
    return keywords.some((k) => line.includes(k));
  }

  // 교수 이름 판별: 순수 한글 2~4자, 공백/숫자/특수문자 없음
  function isName(line: string): boolean {
    if (!line || line.includes("/") || line.includes(" ")) return false;
    if (line.length < 2 || line.length > 4) return false;
    return /^[\uAC00-\uD7A3]+$/.test(line);
  }

  let currentDept = "";
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (!line) { i++; continue; }

    // 진료과 먼저 체크 (isName보다 우선)
    if (isDept(line)) {
      currentDept = line;
      i++;
      continue;
    }

    // 교수 이름이면 새 교수 블록 시작
    if (isName(line)) {
      const name = line;
      const dept = currentDept;
      i++;

      // 다음 isName 또는 isDept 줄 전까지 내용 수집
      const contentLines: string[] = [];
      while (i < lines.length) {
        const cl = lines[i];
        if (!cl) { i++; continue; }           // 빈줄은 건너뜀
        if (isDept(cl) || isName(cl)) break;   // 다음 과 또는 다음 교수
        contentLines.push(cl);
        i++;
      }

      const rawContent = contentLines.join(" ");
      const visits = rawContent
        .split("/")
        .map((v) => v.trim())
        .filter((v) => v.length > 5);

      if (visits.length > 0) {
        doctors.push({
          department: dept,
          name,
          visits: visits.map((content, idx) => ({ index: idx, content })),
        });
      }
      continue;
    }

    // 진료과도 이름도 아니면 그냥 넘김
    i++;
  }

  return doctors;
}

export default function BulkImportPage() {
  const { toast } = useToast();
  const [inputText, setInputText] = useState("");
  const [parsed, setParsed] = useState<ParsedDoctor[]>([]);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [results, setResults] = useState<ImportResult[]>([]);
  const [step, setStep] = useState<"input" | "preview" | "done">("input");
  const [importing, setImporting] = useState(false);
  const [analyzingIdx, setAnalyzingIdx] = useState<number | null>(null);

  function handleParse() {
    if (!inputText.trim()) {
      toast({ title: "내용을 먼저 붙여넣어주세요", variant: "destructive" });
      return;
    }
    const result = parseBulkInput(inputText);
    if (result.length === 0) {
      toast({
        title: "인식된 교수 정보가 없습니다",
        description: "형식을 확인해주세요: 첫 줄 진료과, 다음 줄 이름, 그 다음 방문 내역(/로 구분)",
        variant: "destructive",
      });
      return;
    }
    const existing = doctorStorage.getAll();
    const enriched = result.map((p) => ({
      ...p,
      existingDoctor: existing.find((d) => d.name === p.name),
    }));
    setParsed(enriched);
    setExpanded(new Set(enriched.map((_, i) => i)));
    setStep("preview");
  }

  async function handleImport() {
    setImporting(true);
    const importResults: ImportResult[] = [];

    for (let idx = 0; idx < parsed.length; idx++) {
      const p = parsed[idx];
      try {
        let doctor = p.existingDoctor;

        if (!doctor) {
          doctor = {
            id: `doc-${Date.now()}-${idx}`,
            name: p.name,
            hospital: "",
            department: p.department,
            position: "교수",
            traits: [],
            objections: [],
            notes: "",
            prescriptionTendency: "",
            interestAreas: "",
            conversationHistory: [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
          doctorStorage.save(doctor);
        }

        const allVisitsText = p.visits.map((v, i) => `[방문 ${i + 1}]\n${v.content}`).join("\n\n");

        setAnalyzingIdx(idx);
        let analysis: { aiAnalysis: string; detectedTraits: string[]; nextSuggestions: string } = {
          aiAnalysis: "",
          detectedTraits: [],
          nextSuggestions: "",
        };
        try {
          const aiResult = await analyzePastConversations(allVisitsText, doctor, `방문 ${p.visits.length}회`);
          analysis = {
            aiAnalysis: aiResult.analysis,
            detectedTraits: aiResult.detectedTraits,
            nextSuggestions: aiResult.nextSuggestions,
          };
        } catch {
        }

        const record: ConversationRecord = {
          id: `conv-bulk-${Date.now()}-${idx}`,
          rawText: allVisitsText,
          period: `일괄 입력 (${p.visits.length}회 방문)`,
          aiAnalysis: analysis.aiAnalysis,
          detectedTraits: analysis.detectedTraits,
          nextSuggestions: analysis.nextSuggestions,
          createdAt: new Date().toISOString(),
        };

        doctorStorage.addConversationRecord(doctor.id, record);

        importResults.push({
          name: p.name,
          department: p.department,
          created: !p.existingDoctor,
          visitsAdded: p.visits.length,
        });
      } catch (e) {
        importResults.push({
          name: p.name,
          department: p.department,
          created: false,
          visitsAdded: 0,
          error: String(e),
        });
      }
    }

    setAnalyzingIdx(null);
    setResults(importResults);
    setImporting(false);
    setStep("done");
    toast({ title: `${importResults.filter((r) => !r.error).length}명 입력 완료` });
  }

  function toggleExpand(idx: number) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }

  function handleReset() {
    setInputText("");
    setParsed([]);
    setResults([]);
    setStep("input");
    setExpanded(new Set());
  }

  return (
    <div className="p-8 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-foreground">교수 파일 일괄 입력</h1>
        <p className="text-muted-foreground mt-1">
          기존 활동 파일을 그대로 붙여넣으면 교수 등록 + 방문 기록 저장 + AI 성향 분석까지 자동으로 처리합니다
        </p>
      </div>

      {step === "input" && (
        <div className="space-y-5">
          <Card className="border-primary/20 bg-primary/5">
            <CardContent className="p-4">
              <p className="text-sm font-semibold text-primary mb-2">입력 형식</p>
              <div className="bg-white/60 rounded-md p-3 font-mono text-xs text-muted-foreground space-y-0.5">
                <p className="text-foreground font-semibold">대장항문외과</p>
                <p className="text-foreground font-semibold">권혜연</p>
                <p>방문내용 첫번째 / 방문내용 두번째 / 방문내용 세번째</p>
                <p className="mt-2 text-foreground font-semibold">소화기내과</p>
                <p className="text-foreground font-semibold">홍길동</p>
                <p>방문내용 첫번째 / 방문내용 두번째</p>
              </div>
              <ul className="mt-3 space-y-1">
                {[
                  "첫 줄: 진료과명",
                  "둘째 줄: 교수 이름",
                  "셋째 줄: 방문 내역 (/ 로 각 방문 구분)",
                  "여러 명을 한 번에 붙여넣기 가능",
                  "이미 등록된 교수면 방문 기록만 추가됨",
                ].map((t) => (
                  <li key={t} className="text-xs text-muted-foreground flex items-start gap-1.5">
                    <span className="text-primary mt-0.5">•</span>
                    {t}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">파일 내용 붙여넣기</CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="여기에 교수 파일 내용을 붙여넣으세요..."
                className="min-h-[320px] font-mono text-sm resize-none"
              />
              <div className="mt-3 flex justify-between items-center">
                <p className="text-xs text-muted-foreground">
                  {inputText.trim() ? `${inputText.trim().split("\n").length}줄 입력됨` : ""}
                </p>
                <Button onClick={handleParse} disabled={!inputText.trim()}>
                  <Upload className="w-4 h-4 mr-2" />
                  내용 분석하기
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {step === "preview" && (
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-semibold text-foreground">
                {parsed.length}명 인식됨 — 내용 확인 후 저장하세요
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                AI가 방문 기록을 분석해서 교수 성향과 다음 전략도 자동으로 도출합니다
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleReset}>
                다시 입력
              </Button>
              <Button onClick={handleImport} disabled={importing}>
                {importing ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    {analyzingIdx !== null
                      ? `${parsed[analyzingIdx]?.name} AI 분석 중... (${analyzingIdx + 1}/${parsed.length})`
                      : "처리 중..."}
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-4 h-4 mr-2" />
                    전체 저장 ({parsed.length}명)
                  </>
                )}
              </Button>
            </div>
          </div>

          <div className="space-y-3">
            {parsed.map((p, idx) => (
              <Card key={idx} className={p.existingDoctor ? "border-blue-200" : "border-green-200"}>
                <CardHeader className="pb-2 pt-4 px-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-foreground">{p.name}</span>
                      <Badge variant="secondary" className="text-xs">
                        {p.department}
                      </Badge>
                      {p.existingDoctor ? (
                        <Badge className="text-xs bg-blue-100 text-blue-700 border-blue-200">
                          기존 교수 — 기록 추가
                        </Badge>
                      ) : (
                        <Badge className="text-xs bg-green-100 text-green-700 border-green-200">
                          신규 등록
                        </Badge>
                      )}
                      <Badge variant="outline" className="text-xs">
                        {p.visits.length}회 방문
                      </Badge>
                    </div>
                    <button
                      type="button"
                      onClick={() => toggleExpand(idx)}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      {expanded.has(idx) ? (
                        <ChevronUp className="w-4 h-4" />
                      ) : (
                        <ChevronDown className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </CardHeader>
                {expanded.has(idx) && (
                  <CardContent className="px-4 pb-4 pt-0">
                    <div className="space-y-2">
                      {p.visits.map((v) => (
                        <div
                          key={v.index}
                          className="bg-muted/40 rounded-md px-3 py-2 text-xs text-muted-foreground"
                        >
                          <span className="font-semibold text-foreground/70 mr-2">
                            방문 {v.index + 1}
                          </span>
                          {v.content}
                        </div>
                      ))}
                    </div>
                  </CardContent>
                )}
              </Card>
            ))}
          </div>
        </div>
      )}

      {step === "done" && (
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <p className="font-semibold text-foreground">저장 완료</p>
            <Button onClick={handleReset}>추가 입력하기</Button>
          </div>

          <div className="space-y-2">
            {results.map((r, idx) => (
              <Card
                key={idx}
                className={r.error ? "border-red-200 bg-red-50" : "border-green-200 bg-green-50"}
              >
                <CardContent className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    {r.error ? (
                      <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                    ) : (
                      <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0" />
                    )}
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm">{r.name}</span>
                        <Badge variant="secondary" className="text-xs">
                          {r.department}
                        </Badge>
                        {r.created ? (
                          <Badge className="text-xs bg-green-100 text-green-700">신규 등록됨</Badge>
                        ) : (
                          <Badge className="text-xs bg-blue-100 text-blue-700">기존 교수</Badge>
                        )}
                      </div>
                      {r.error ? (
                        <p className="text-xs text-red-600 mt-0.5">{r.error}</p>
                      ) : (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          방문 기록 {r.visitsAdded}회 + AI 성향 분석 저장 완료
                        </p>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card className="border-primary/20 bg-primary/5">
            <CardContent className="p-4">
              <p className="text-sm font-semibold text-primary mb-1">다음 단계</p>
              <p className="text-xs text-muted-foreground">
                교수 프로파일 메뉴에서 각 교수를 클릭하면 AI 분석 결과, 방문 기록, 다음 방문 전략을
                확인할 수 있습니다.
              </p>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
