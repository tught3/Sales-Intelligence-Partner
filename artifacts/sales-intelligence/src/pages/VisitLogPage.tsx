import { useState, useMemo } from "react";
import { useSearch } from "wouter";
import {
  doctorStorage,
  visitLogStorage,
  snippetStorage,
  generateId,
  type Doctor,
  type VisitLog,
} from "@/lib/storage";
import { convertToVisitLog } from "@/lib/ai";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
  FileText,
  Loader2,
  Save,
  Sparkles,
  CheckCircle2,
  Users,
  Calendar,
  ChevronDown,
  Trash2,
  BookOpen,
} from "lucide-react";

const PRODUCTS = ["위너프", "페린젝트", "기타"];

export default function VisitLogPage() {
  const search = useSearch();
  const params = new URLSearchParams(search);
  const preselectedDoctorId = params.get("doctorId") ?? "";

  const { toast } = useToast();
  const [doctors] = useState(() => doctorStorage.getAll());
  const [allLogs, setAllLogs] = useState(() => visitLogStorage.getAll());
  const allSnippets = useMemo(() => snippetStorage.getAll(), []);

  const [selectedDoctorId, setSelectedDoctorId] = useState(preselectedDoctorId);
  const [visitDate, setVisitDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [rawNotes, setRawNotes] = useState("");
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [result, setResult] = useState<{ formattedLog: string; nextStrategy: string } | null>(null);
  const [isSaved, setIsSaved] = useState(false);
  const [filterDoctorId, setFilterDoctorId] = useState("");

  const selectedDoctor = useMemo(
    () => doctors.find((d) => d.id === selectedDoctorId),
    [doctors, selectedDoctorId]
  );

  const pastLogs = useMemo(
    () => (selectedDoctorId ? visitLogStorage.getByDoctorId(selectedDoctorId) : []),
    [selectedDoctorId, allLogs]
  );

  const filteredLogs = useMemo(() => {
    const sorted = [...allLogs].sort(
      (a, b) => new Date(b.visitDate).getTime() - new Date(a.visitDate).getTime()
    );
    if (!filterDoctorId) return sorted;
    return sorted.filter((l) => l.doctorId === filterDoctorId);
  }, [allLogs, filterDoctorId]);

  function toggleProduct(p: string) {
    setSelectedProducts((prev) =>
      prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]
    );
  }

  async function handleGenerate() {
    if (!selectedDoctor || !rawNotes.trim()) return;
    setIsGenerating(true);
    setResult(null);
    setIsSaved(false);
    try {
      const res = await convertToVisitLog(rawNotes, selectedDoctor, pastLogs);
      setResult(res);
      if (selectedProducts.length === 0) {
        const detected = PRODUCTS.filter(
          (p) => rawNotes.includes(p) || res.formattedLog.includes(p)
        );
        if (detected.length) setSelectedProducts(detected);
      }
    } catch (e) {
      toast({ title: "AI 생성 실패", description: String(e), variant: "destructive" });
    } finally {
      setIsGenerating(false);
    }
  }

  function handleSave() {
    if (!result || !selectedDoctorId) return;
    const log: VisitLog = {
      id: generateId(),
      doctorId: selectedDoctorId,
      visitDate,
      rawNotes,
      formattedLog: result.formattedLog,
      nextStrategy: result.nextStrategy,
      products: selectedProducts,
      createdAt: new Date().toISOString(),
    };
    visitLogStorage.save(log);
    setAllLogs(visitLogStorage.getAll());
    setIsSaved(true);
    toast({ title: "영업 일지가 저장되었습니다" });
  }

  function handleDeleteLog(id: string) {
    visitLogStorage.delete(id);
    setAllLogs(visitLogStorage.getAll());
    toast({ title: "일지가 삭제되었습니다" });
  }

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-foreground">영업 일지 작성</h1>
        <p className="text-muted-foreground mt-1">날것의 방문 메모를 입력하면 AI가 전문 일지로 변환해드립니다</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Form */}
        <div className="lg:col-span-3 space-y-5">
          <Card>
            <CardContent className="p-5 space-y-4">
              {/* Doctor select */}
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5" />
                  교수 선택 *
                </Label>
                <div className="relative">
                  <select
                    value={selectedDoctorId}
                    onChange={(e) => setSelectedDoctorId(e.target.value)}
                    className="w-full appearance-none border border-input bg-background rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring pr-8"
                  >
                    <option value="">교수를 선택하세요...</option>
                    {doctors.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name} 교수 | {d.hospital} {d.department}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                </div>
                {selectedDoctor && (
                  <div className="text-xs bg-muted/50 rounded p-3 space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-foreground">{selectedDoctor.name} 교수님</span>
                      <span className="text-muted-foreground">|</span>
                      <span className="text-muted-foreground">{selectedDoctor.hospital} · {selectedDoctor.department}</span>
                      <span className="ml-auto text-muted-foreground">방문 {pastLogs.length}회</span>
                    </div>
                    {selectedDoctor.traits.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {selectedDoctor.traits.map((t) => (
                          <Badge key={t.id} variant="secondary" className="text-xs py-0">{t.label}</Badge>
                        ))}
                      </div>
                    )}
                    {selectedDoctor.objections.length > 0 && (
                      <div className="border-t pt-2 mt-1">
                        <p className="text-xs font-semibold text-muted-foreground mb-1">자주 하시는 반박</p>
                        <ul className="space-y-0.5">
                          {selectedDoctor.objections.slice(0, 3).map((obj) => (
                            <li key={obj.id} className="text-muted-foreground">· {obj.content}</li>
                          ))}
                          {selectedDoctor.objections.length > 3 && (
                            <li className="text-muted-foreground/60">+ {selectedDoctor.objections.length - 3}개 더...</li>
                          )}
                        </ul>
                      </div>
                    )}
                    {selectedDoctor.notes && (
                      <p className="text-muted-foreground border-t pt-2 italic">{selectedDoctor.notes}</p>
                    )}
                  </div>
                )}
              </div>

              {/* Date */}
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5" />
                  방문일
                </Label>
                <Input
                  type="date"
                  value={visitDate}
                  onChange={(e) => setVisitDate(e.target.value)}
                />
              </div>

              {/* Products */}
              <div className="space-y-1.5">
                <Label>관련 제품</Label>
                <div className="flex gap-2">
                  {PRODUCTS.map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => toggleProduct(p)}
                      className={`px-3 py-1.5 text-sm rounded-lg border-2 font-medium transition-all ${
                        selectedProducts.includes(p)
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border text-muted-foreground hover:border-primary/50"
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>

              {/* Raw notes */}
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5" />
                  날것의 방문 메모 *
                </Label>
                <Textarea
                  placeholder={`구어체로 자유롭게 적어주세요. 예:\n"오늘 홍교수 만남. 페린젝트 얘기했는데 가격 비싸다고 함. IV 편의성 강조하니 관심 있어함. 다음엔 임상 데이터 가져가야겠음."`}
                  value={rawNotes}
                  onChange={(e) => setRawNotes(e.target.value)}
                  rows={6}
                  className="text-sm resize-none"
                />
              </div>

              <Button
                onClick={handleGenerate}
                disabled={!selectedDoctorId || !rawNotes.trim() || isGenerating}
                className="w-full gap-2"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    AI가 일지를 생성하는 중...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    AI 일지 생성
                  </>
                )}
              </Button>
            </CardContent>
          </Card>

          {/* Result */}
          {result && (
            <Card className="border-primary/30">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2 text-primary">
                  <Sparkles className="w-4 h-4" />
                  AI 생성 결과
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="text-xs font-semibold text-muted-foreground mb-2">전문 영업 일지</p>
                  <Textarea
                    value={result.formattedLog}
                    onChange={(e) => setResult({ ...result, formattedLog: e.target.value })}
                    rows={8}
                    className="text-sm resize-none bg-muted/20"
                  />
                </div>
                <div>
                  <p className="text-xs font-semibold text-primary mb-2">다음 방문 전략</p>
                  <Textarea
                    value={result.nextStrategy}
                    onChange={(e) => setResult({ ...result, nextStrategy: e.target.value })}
                    rows={6}
                    className="text-sm resize-none bg-primary/5"
                  />
                </div>
                <Button
                  onClick={handleSave}
                  disabled={isSaved}
                  className="w-full gap-2"
                  variant={isSaved ? "outline" : "default"}
                >
                  {isSaved ? (
                    <>
                      <CheckCircle2 className="w-4 h-4 text-green-600" />
                      저장 완료
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4" />
                      일지 저장
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Log history sidebar */}
        <div className="lg:col-span-2">
          <Card className="sticky top-6">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-primary" />
                  방문 일지 기록
                </span>
                <select
                  value={filterDoctorId}
                  onChange={(e) => setFilterDoctorId(e.target.value)}
                  className="text-xs border border-input bg-background rounded px-2 py-1 focus:outline-none"
                >
                  <option value="">전체</option>
                  {doctors.map((d) => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              </CardTitle>
            </CardHeader>
            <CardContent className="max-h-[600px] overflow-y-auto">
              {filteredLogs.length === 0 ? (
                <p className="text-center text-sm text-muted-foreground py-6">기록이 없습니다</p>
              ) : (
                <div className="space-y-2">
                  {filteredLogs.map((log) => {
                    const doc = doctors.find((d) => d.id === log.doctorId);
                    return (
                      <div key={log.id} className="border rounded-lg p-3 text-xs group relative">
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-semibold text-foreground">
                            {doc ? doc.name : "?"}
                          </span>
                          <div className="flex items-center gap-1">
                            <span className="text-muted-foreground">{log.visitDate}</span>
                            <button
                              onClick={() => handleDeleteLog(log.id)}
                              className="opacity-0 group-hover:opacity-100 p-0.5 hover:text-destructive transition-all"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                        <p className="text-muted-foreground line-clamp-2">{log.formattedLog}</p>
                        {log.products.length > 0 && (
                          <div className="flex gap-1 mt-1.5">
                            {log.products.map((p) => (
                              <Badge key={p} variant="secondary" className="text-xs py-0">{p}</Badge>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
