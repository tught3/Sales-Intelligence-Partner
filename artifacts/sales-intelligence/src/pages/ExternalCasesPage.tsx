import { useRef, useMemo, useState } from "react";
import { analyzeExternalCasePatterns } from "@/lib/ai";
import { parseKakaoTalkExport } from "@/lib/externalCases";
import {
  externalCasePatternStorage,
  generateId,
  type ExternalCasePattern,
} from "@/lib/storage";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  Brain,
  DatabaseZap,
  FileUp,
  Loader2,
  RefreshCw,
  Sparkles,
  Trash2,
} from "lucide-react";

function toPattern(draft: Omit<ExternalCasePattern, "id" | "createdAt">): ExternalCasePattern {
  return {
    ...draft,
    id: generateId(),
    createdAt: new Date().toISOString(),
  };
}

export default function ExternalCasesPage() {
  const { toast } = useToast();
  const [rawText, setRawText] = useState("");
  const [patterns, setPatterns] = useState<ExternalCasePattern[]>(() => externalCasePatternStorage.getAll());
  const [analyzing, setAnalyzing] = useState(false);
  const [lastSkipped, setLastSkipped] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const grouped = useMemo(() => {
    return patterns.reduce<Record<string, ExternalCasePattern[]>>((acc, pattern) => {
      const key = `${pattern.department || "미분류"} ${pattern.product || "품목 없음"}`;
      acc[key] = acc[key] ?? [];
      acc[key].push(pattern);
      return acc;
    }, {});
  }, [patterns]);

  async function analyzeAndSave(text: string) {
    const trimmed = text.trim();
    if (!trimmed) {
      toast({ title: "붙여넣은 사례가 없습니다", variant: "destructive" });
      return;
    }
    setAnalyzing(true);
    setLastSkipped(0);
    try {
      const drafts = await analyzeExternalCasePatterns(trimmed);
      let saved = 0;
      let skipped = 0;
      for (const draft of drafts) {
        const result = externalCasePatternStorage.save(toPattern(draft));
        if (result.saved) saved += 1;
        else skipped += 1;
      }
      setPatterns(externalCasePatternStorage.getAll());
      setLastSkipped(skipped);
      toast({
        title: saved > 0 ? `외부 사례 패턴 ${saved}개 저장` : "저장할 새 패턴이 없습니다",
        description: skipped > 0 ? `유사 중복 ${skipped}개는 제외했습니다.` : "자동생성 후보에 반영됩니다.",
        variant: saved > 0 ? "default" : "destructive",
      });
    } catch (error) {
      toast({
        title: "외부 사례 분석 실패",
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
    } finally {
      setAnalyzing(false);
    }
  }

  function handleFileRead(file: File) {
    if (!file.name.endsWith('.txt')) {
      toast({ title: ".txt 파일만 지원합니다", variant: "destructive" });
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = typeof e.target?.result === 'string' ? e.target.result : '';
      const parsed = parseKakaoTalkExport(text);
      if (!parsed.trim()) {
        toast({ title: "파일에서 메시지를 찾을 수 없습니다", variant: "destructive" });
        return;
      }
      analyzeAndSave(parsed);
    };
    reader.readAsText(file, 'utf-8');
  }

  function handleFileDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileRead(file);
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFileRead(file);
    e.target.value = '';
  }

  function handleDelete(id: string) {
    externalCasePatternStorage.delete(id);
    setPatterns(externalCasePatternStorage.getAll());
    toast({ title: "외부 사례 패턴을 삭제했습니다" });
  }

  async function handleReanalyze(pattern: ExternalCasePattern) {
    const seed = [
      pattern.department,
      pattern.product,
      pattern.patientGroup,
      pattern.detailAxis,
      pattern.reactionPattern,
      pattern.nextAction,
    ].filter(Boolean).join(" / ");
    await analyzeAndSave(seed);
  }

  return (
    <div className="p-3 sm:p-6 lg:p-8">
      <div className="mb-5 sm:mb-6">
        <h1 className="text-2xl font-bold text-foreground">외부 사례 학습</h1>
        <p className="text-muted-foreground mt-1">
          번호, 병원명, 교수명, 금액, 학회 얘기는 버리고 진료과, 품목, 환자군, 디테일 포인트와 익명화 예문만 자동생성 재료로 사용합니다
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="h-4 w-4 text-primary" />
              사례 붙여넣기
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* 카카오톡 파일 업로드 존 */}
            <div
              className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-5 text-center transition-colors ${dragOver ? 'border-primary bg-primary/5' : 'border-muted-foreground/30 hover:border-primary/50 hover:bg-muted/40'}`}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleFileDrop}
              onClick={() => fileInputRef.current?.click()}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && fileInputRef.current?.click()}
            >
              <FileUp className="h-6 w-6 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">카카오톡 대화 내보내기 파일 업로드</p>
                <p className="text-xs text-muted-foreground">.txt 파일을 끌어다 놓거나 클릭 · PC/모바일 내보내기 모두 지원</p>
              </div>
              <input ref={fileInputRef} type="file" accept=".txt" className="hidden" onChange={handleFileInput} />
            </div>
            <p className="text-center text-xs text-muted-foreground">또는 직접 붙여넣기</p>
            <Textarea
              value={rawText}
              onChange={(event) => setRawText(event.target.value)}
              placeholder="다른 사람들이 쓴 방문일지를 그대로 붙여넣으세요. 1. 2. 같은 번호, 다른 병원/교수 이름, 내정가, 심포지엄/학회/제품설명회 문구는 자동으로 제외하고 필요한 패턴만 추출합니다. 원문 전체는 저장하지 않고 익명화 예문만 남깁니다."
              className="min-h-[200px] text-base sm:text-sm"
            />
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-muted-foreground">
                저장 항목: 진료과, 품목, 환자군, 디테일 포인트, 반응, 다음 액션, 익명화 예문. 병원/교수/금액 원문은 저장하지 않습니다.
              </p>
              <Button onClick={() => analyzeAndSave(rawText)} disabled={analyzing || !rawText.trim()} className="gap-2">
                {analyzing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Brain className="h-4 w-4" />}
                분석하기
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <DatabaseZap className="h-4 w-4 text-primary" />
              학습 현황
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="rounded-lg border bg-muted/40 p-3">
              <p className="text-2xl font-bold">{patterns.length}</p>
              <p className="text-muted-foreground">저장된 외부 사례 패턴</p>
            </div>
            <div className="rounded-lg border bg-muted/40 p-3">
              <p className="text-2xl font-bold">{Object.keys(grouped).length}</p>
              <p className="text-muted-foreground">진료과/품목 조합</p>
            </div>
            {lastSkipped > 0 && (
              <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                마지막 분석에서 유사 중복 {lastSkipped}개를 제외했습니다.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="mt-5 space-y-4">
        {patterns.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              아직 학습된 외부 사례 패턴이 없습니다.
            </CardContent>
          </Card>
        ) : (
          Object.entries(grouped).map(([group, rows]) => (
            <Card key={group}>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">{group}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {rows.map((pattern) => (
                  <div key={pattern.id} className="rounded-lg border p-3">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <Badge>{pattern.department}</Badge>
                      <Badge variant="secondary">{pattern.product}</Badge>
                      <Badge variant="outline">신뢰도 {pattern.confidence}</Badge>
                    </div>
                    <p className="text-sm font-medium text-foreground">{pattern.patientGroup}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{pattern.detailAxis}</p>
                    {pattern.reactionPattern && (
                      <p className="mt-2 text-xs text-muted-foreground">반응: {pattern.reactionPattern}</p>
                    )}
                    {pattern.nextAction && (
                      <p className="mt-1 text-xs text-muted-foreground">다음 액션: {pattern.nextAction}</p>
                    )}
                    {pattern.sourceSummary && (
                      <p className="mt-2 rounded-md bg-muted/50 p-2 text-xs text-muted-foreground">{pattern.sourceSummary}</p>
                    )}
                    {pattern.styleExampleMemo && (
                      <p className="mt-2 rounded-md border border-dashed p-2 text-xs text-muted-foreground">예문: {pattern.styleExampleMemo}</p>
                    )}
                    <div className="mt-3 flex justify-end gap-2">
                      <Button variant="outline" size="sm" onClick={() => handleReanalyze(pattern)} disabled={analyzing} className="gap-1">
                        <RefreshCw className="h-3.5 w-3.5" />
                        재분석
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => handleDelete(pattern.id)} className="gap-1 text-destructive">
                        <Trash2 className="h-3.5 w-3.5" />
                        삭제
                      </Button>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
