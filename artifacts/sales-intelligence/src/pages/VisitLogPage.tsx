import { useState, useMemo } from "react";
import { useLocation, useSearch } from "wouter";
import {
  doctorStorage,
  visitLogStorage,
  generateId,
  type Doctor,
  type VisitLog,
} from "@/lib/storage";
import { convertToVisitLog, autoGenerateVisitLog, processImportedRecords } from "@/lib/ai";
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
  Sparkles,
  CheckCircle2,
  Users,
  Calendar,
  ChevronDown,
  Wand2,
  Upload,
  Info,
  Building2,
  ClipboardList,
} from "lucide-react";

const PRODUCTS = ["위너프", "페린젝트", "기타"];

export default function VisitLogPage() {
  const search = useSearch();
  const params = new URLSearchParams(search);
  const preselectedDoctorId = params.get("doctorId") ?? "";

  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [doctors] = useState(() => doctorStorage.getAll());
  const [allLogs, setAllLogs] = useState(() => visitLogStorage.getAll());

  const [selectedHospital, setSelectedHospital] = useState("");
  const [selectedDept, setSelectedDept] = useState("");
  const [selectedDoctorId, setSelectedDoctorId] = useState(preselectedDoctorId);
  const [visitDate, setVisitDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [rawNotes, setRawNotes] = useState("");
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isAutoGenerating, setIsAutoGenerating] = useState(false);
  const [isAnalyzingImport, setIsAnalyzingImport] = useState(false);
  const [result, setResult] = useState<{ formattedLog: string; nextStrategy: string } | null>(null);
  const [isSaved, setIsSaved] = useState(false);
  const [importAnalysis, setImportAnalysis] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'manual' | 'auto' | 'import'>('manual');

  const hospitals = useMemo(() => {
    const set = new Set(doctors.map(d => d.hospital).filter(Boolean));
    return Array.from(set).sort();
  }, [doctors]);

  const departments = useMemo(() => {
    if (!selectedHospital) return [];
    const set = new Set(
      doctors.filter(d => d.hospital === selectedHospital).map(d => d.department).filter(Boolean)
    );
    return Array.from(set).sort();
  }, [doctors, selectedHospital]);

  const filteredDoctors = useMemo(() => {
    let list = doctors;
    if (selectedHospital) list = list.filter(d => d.hospital === selectedHospital);
    if (selectedDept) list = list.filter(d => d.department === selectedDept);
    return list;
  }, [doctors, selectedHospital, selectedDept]);

  const selectedDoctor = useMemo(
    () => doctors.find((d) => d.id === selectedDoctorId),
    [doctors, selectedDoctorId]
  );

  const pastLogs = useMemo(
    () => (selectedDoctorId ? visitLogStorage.getByDoctorId(selectedDoctorId) : []),
    [selectedDoctorId, allLogs]
  );

  function handleHospitalChange(h: string) {
    setSelectedHospital(h);
    setSelectedDept("");
    setSelectedDoctorId("");
    resetResult();
  }

  function handleDeptChange(d: string) {
    setSelectedDept(d);
    setSelectedDoctorId("");
    resetResult();
  }

  function toggleProduct(p: string) {
    setSelectedProducts((prev) =>
      prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]
    );
  }

  function resetResult() {
    setResult(null);
    setIsSaved(false);
  }

  async function handleGenerate() {
    if (!selectedDoctor || !rawNotes.trim()) return;
    const snapshotDoctorId = selectedDoctorId;
    const snapshotRawNotes = rawNotes;
    const snapshotDate = visitDate;
    const snapshotProducts = [...selectedProducts];
    setIsGenerating(true);
    resetResult();
    try {
      const res = await convertToVisitLog(snapshotRawNotes, selectedDoctor, pastLogs);
      if (!res.formattedLog || res.formattedLog.trim().length < 10) {
        toast({ title: "AI 생성 결과가 너무 짧습니다", description: "다시 시도해주세요.", variant: "destructive" });
        return;
      }
      setResult(res);
      let prods = snapshotProducts;
      if (prods.length === 0) {
        const detected = PRODUCTS.filter(
          (p) => snapshotRawNotes.includes(p) || res.formattedLog.includes(p)
        );
        if (detected.length) { setSelectedProducts(detected); prods = detected; }
      }
      if (snapshotDoctorId) {
        const log: VisitLog = {
          id: generateId(), doctorId: snapshotDoctorId, visitDate: snapshotDate,
          rawNotes: snapshotRawNotes, formattedLog: res.formattedLog,
          nextStrategy: res.nextStrategy, products: prods, createdAt: new Date().toISOString(),
        };
        visitLogStorage.save(log);
        setAllLogs(visitLogStorage.getAll());
        setIsSaved(true);
      }
      toast({ title: "영업 일지가 자동 저장되었습니다", description: "방문 일지 기록에서 확인 및 수정할 수 있습니다." });
    } catch (e) {
      toast({ title: "AI 생성 실패", description: String(e), variant: "destructive" });
    } finally {
      setIsGenerating(false);
    }
  }

  async function handleAutoGenerate() {
    if (!selectedDoctor) return;
    const snapshotDoctorId = selectedDoctorId;
    setIsAutoGenerating(true);
    resetResult();
    try {
      const res = await autoGenerateVisitLog(selectedDoctor, pastLogs);
      if (!res.formattedLog || res.formattedLog.trim().length < 10) {
        toast({ title: "AI 생성 결과가 너무 짧습니다", description: "다시 시도해주세요.", variant: "destructive" });
        return;
      }
      setResult({ formattedLog: res.formattedLog, nextStrategy: res.nextStrategy });
      setVisitDate(res.visitDate);
      setSelectedProducts(res.products);
      if (snapshotDoctorId) {
        const log: VisitLog = {
          id: generateId(), doctorId: snapshotDoctorId, visitDate: res.visitDate,
          rawNotes: "", formattedLog: res.formattedLog,
          nextStrategy: res.nextStrategy, products: res.products, createdAt: new Date().toISOString(),
        };
        visitLogStorage.save(log);
        setAllLogs(visitLogStorage.getAll());
        setIsSaved(true);
      }
      toast({ title: "영업 일지가 자동 저장되었습니다", description: "방문 일지 기록에서 확인 및 수정할 수 있습니다." });
    } catch (e) {
      toast({ title: "자동 생성 실패", description: String(e), variant: "destructive" });
    } finally {
      setIsAutoGenerating(false);
    }
  }

  async function handleFileImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    const text = await file.text();

    if (file.name.endsWith('.json')) {
      try {
        const data = JSON.parse(text);
        if (Array.isArray(data)) {
          let saved = 0;
          for (const item of data) {
            if (item.doctorId && item.visitDate && item.formattedLog) {
              visitLogStorage.save({ ...item, id: item.id ?? generateId(), createdAt: item.createdAt ?? new Date().toISOString() });
              saved++;
            }
          }
          setAllLogs(visitLogStorage.getAll());
          toast({ title: `${saved}개의 방문 기록이 가져와졌습니다` });
        }
      } catch {
        toast({ title: "파일 파싱 실패", variant: "destructive" });
      }
      return;
    }

    setIsAnalyzingImport(true);
    try {
      const analysis = await processImportedRecords(text);
      setImportAnalysis(analysis);
    } catch (e) {
      toast({ title: "분석 실패", description: String(e), variant: "destructive" });
    } finally {
      setIsAnalyzingImport(false);
    }
  }

  const tabClass = (tab: typeof activeTab) =>
    `px-4 py-2 text-sm font-medium rounded-lg transition-all ${activeTab === tab
      ? 'bg-primary text-primary-foreground'
      : 'text-muted-foreground hover:bg-muted'
    }`;

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mb-6">
        <h1 className="text-xl sm:text-2xl font-bold text-foreground">영업 일지 작성</h1>
        <p className="text-sm text-muted-foreground mt-1">과거 방문 맥락과 교수 성향을 자동으로 참고합니다</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 sm:gap-6">
        <div className="lg:col-span-3 space-y-4">
          <div className="flex gap-1 p-1 bg-muted rounded-lg w-full sm:w-fit overflow-x-auto">
            <button className={tabClass('manual')} onClick={() => setActiveTab('manual')}>
              <span className="flex items-center gap-1.5"><FileText className="w-3.5 h-3.5" /> 메모 변환</span>
            </button>
            <button className={tabClass('auto')} onClick={() => setActiveTab('auto')}>
              <span className="flex items-center gap-1.5"><Wand2 className="w-3.5 h-3.5" /> 자동 생성</span>
            </button>
            <button className={tabClass('import')} onClick={() => setActiveTab('import')}>
              <span className="flex items-center gap-1.5"><Upload className="w-3.5 h-3.5" /> 기록 가져오기</span>
            </button>
          </div>

          {(activeTab === 'manual' || activeTab === 'auto') && (
            <Card>
              <CardContent className="p-5 space-y-4">
                <div className="space-y-3">
                  <Label className="flex items-center gap-1.5">
                    <Building2 className="w-3.5 h-3.5" />
                    병원 선택
                  </Label>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => handleHospitalChange("")}
                      className={`px-3 py-1.5 text-sm rounded-lg border font-medium transition-all ${
                        !selectedHospital
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border text-muted-foreground hover:border-primary/50"
                      }`}
                    >
                      전체
                    </button>
                    {hospitals.map((h) => (
                      <button
                        key={h}
                        onClick={() => handleHospitalChange(h)}
                        className={`px-3 py-1.5 text-sm rounded-lg border font-medium transition-all ${
                          selectedHospital === h
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border text-muted-foreground hover:border-primary/50"
                        }`}
                      >
                        {h}
                      </button>
                    ))}
                  </div>

                  {selectedHospital && departments.length > 0 && (
                    <>
                      <Label className="flex items-center gap-1.5 mt-2">
                        <Users className="w-3.5 h-3.5" />
                        진료과 선택
                      </Label>
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => handleDeptChange("")}
                          className={`px-3 py-1.5 text-xs rounded-lg border font-medium transition-all ${
                            !selectedDept
                              ? "border-blue-500 bg-blue-500 text-white"
                              : "border-border text-muted-foreground hover:border-blue-400"
                          }`}
                        >
                          전체 과
                        </button>
                        {departments.map((d) => (
                          <button
                            key={d}
                            onClick={() => handleDeptChange(d)}
                            className={`px-3 py-1.5 text-xs rounded-lg border font-medium transition-all ${
                              selectedDept === d
                                ? "border-blue-500 bg-blue-500 text-white"
                                : "border-border text-muted-foreground hover:border-blue-400"
                            }`}
                          >
                            {d}
                          </button>
                        ))}
                      </div>
                    </>
                  )}

                  <Label className="flex items-center gap-1.5 mt-2">
                    <Users className="w-3.5 h-3.5" />
                    교수 선택 *
                  </Label>
                  <div className="relative">
                    <select
                      value={selectedDoctorId}
                      onChange={(e) => { setSelectedDoctorId(e.target.value); resetResult(); }}
                      className="w-full appearance-none border border-input bg-background rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring pr-8"
                    >
                      <option value="">교수를 선택하세요...</option>
                      {filteredDoctors.map((d) => (
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
                        <span className="sm:ml-auto text-muted-foreground">
                          방문 {pastLogs.length}회
                          {pastLogs[0] && ` | 최근: ${pastLogs[0].visitDate}`}
                        </span>
                      </div>
                      {selectedDoctor.traits.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {selectedDoctor.traits.map((t) => (
                            <Badge key={t.id} variant="secondary" className="text-xs py-0">{t.label}</Badge>
                          ))}
                        </div>
                      )}
                      {selectedDoctor.prescriptionTendency && (
                        <p className="text-muted-foreground">처방 경향: {selectedDoctor.prescriptionTendency}</p>
                      )}
                      {selectedDoctor.objections.length > 0 && (
                        <div className="border-t pt-2">
                          <p className="text-xs font-semibold text-muted-foreground mb-1">자주 하시는 반박</p>
                          {selectedDoctor.objections.slice(0, 3).map((obj) => (
                            <p key={obj.id} className="text-muted-foreground">· {obj.content}</p>
                          ))}
                        </div>
                      )}
                      {pastLogs.length > 0 && (pastLogs[0].nextStrategy || pastLogs[0].formattedLog) && (
                        <div className="border-t pt-2">
                          <p className="text-xs font-semibold text-muted-foreground mb-1">최근 방문 일지</p>
                          <p className="text-muted-foreground line-clamp-3">{pastLogs[0].nextStrategy || pastLogs[0].formattedLog}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>

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

                {activeTab === 'manual' && (
                  <>
                    <div className="space-y-1.5">
                      <Label className="flex items-center gap-1.5">
                        <FileText className="w-3.5 h-3.5" />
                        날것의 방문 메모 *
                      </Label>
                      <Textarea
                        placeholder={`구어체로 자유롭게 적어주세요. 예:\n오늘 홍교수 만남. 페린젝트 얘기했는데 가격 비싸다고 함. IV 편의성 강조하니 관심 있어함. 다음엔 임상 데이터 가져가야겠음.`}
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
                        <><Loader2 className="w-4 h-4 animate-spin" />AI가 일지를 생성하는 중...</>
                      ) : (
                        <><Sparkles className="w-4 h-4" />AI 일지 생성</>
                      )}
                    </Button>
                  </>
                )}

                {activeTab === 'auto' && (
                  <div className="p-3 bg-primary/5 border border-primary/20 rounded-lg text-sm space-y-2">
                    <div className="flex items-start gap-2">
                      <Wand2 className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="font-medium text-primary">자동 생성 모드</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          아무것도 입력하지 않아도 됩니다. 교수의 성향, 과거 방문 이력, 병원 특성, 회사 매뉴얼을 종합하여
                          오늘 방문했을 법한 현실적인 영업 일지를 AI가 자동으로 생성합니다.
                        </p>
                      </div>
                    </div>
                    <Button
                      onClick={handleAutoGenerate}
                      disabled={!selectedDoctorId || isAutoGenerating}
                      className="w-full gap-2"
                    >
                      {isAutoGenerating ? (
                        <><Loader2 className="w-4 h-4 animate-spin" />AI가 방문 내용을 생성하는 중...</>
                      ) : (
                        <><Wand2 className="w-4 h-4" />오늘 방문 일지 자동 생성</>
                      )}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {activeTab === 'import' && (
            <Card>
              <CardContent className="p-5 space-y-4">
                <div className="flex items-start gap-3 p-3 bg-muted/50 rounded-lg text-sm">
                  <Info className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="font-medium mb-1">과거 기록 가져오기</p>
                    <p className="text-xs text-muted-foreground">
                      <strong>JSON 형식:</strong> 방문 기록 배열을 바로 데이터베이스에 추가합니다.<br/>
                      <strong>텍스트/CSV:</strong> AI가 내용을 분석하고 인사이트를 제공합니다.
                    </p>
                  </div>
                </div>

                <label className="block w-full">
                  <div className="flex flex-col items-center justify-center p-8 border-2 border-dashed border-border rounded-lg hover:border-primary/50 hover:bg-primary/5 transition-all cursor-pointer">
                    <Upload className="w-8 h-8 text-muted-foreground mb-3" />
                    <p className="text-sm font-medium text-foreground">파일을 클릭하거나 드래그하여 올리세요</p>
                    <p className="text-xs text-muted-foreground mt-1">.json, .txt, .csv 지원</p>
                  </div>
                  <input type="file" accept=".json,.txt,.csv" className="hidden" onChange={handleFileImport} />
                </label>

                {isAnalyzingImport && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    AI가 가져온 기록을 분석하는 중...
                  </div>
                )}

                {importAnalysis && (
                  <div className="p-4 bg-primary/5 border border-primary/20 rounded-lg">
                    <p className="text-xs font-semibold text-primary mb-2 flex items-center gap-1">
                      <Sparkles className="w-3.5 h-3.5" />
                      AI 분석 결과
                    </p>
                    <pre className="text-xs text-foreground whitespace-pre-wrap font-sans leading-relaxed">{importAnalysis}</pre>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        <div className="lg:col-span-2 space-y-4">
          {result && (
            <Card className="border-green-300 bg-green-50/30">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2 text-green-700">
                  <CheckCircle2 className="w-4 h-4" />
                  자동 저장 완료
                  {pastLogs.length > 0 && (
                    <span className="text-xs font-normal text-muted-foreground ml-auto">
                      과거 {pastLogs.length}회 방문 맥락 반영
                    </span>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed bg-white rounded-lg p-3 border">
                  {result.formattedLog}
                </p>
                <p className="text-xs text-muted-foreground">
                  방문 일지 기록 페이지에서 내용을 수정할 수 있습니다. 수정된 말투와 내용은 다음 AI 생성에 반영됩니다.
                </p>
              </CardContent>
            </Card>
          )}

          <Button
            variant="outline"
            className="w-full gap-2"
            onClick={() => setLocation("/visit-log-history")}
          >
            <ClipboardList className="w-4 h-4" />
            방문 일지 기록 전체보기
            <Badge variant="secondary" className="ml-auto text-xs">{allLogs.length}건</Badge>
          </Button>
        </div>
      </div>
    </div>
  );
}
