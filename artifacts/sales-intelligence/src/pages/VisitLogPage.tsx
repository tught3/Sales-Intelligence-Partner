import { useState, useMemo } from "react";
import { useLocation, useSearch } from "wouter";
import { useEffect } from "react";
import {
  doctorStorage,
  visitLogStorage,
  getDoctorVisitCount,
  getConversationHistoryVisitCount,
  generateId,
  type Doctor,
  type VisitLog,
} from "@/lib/storage";
import { convertToVisitLog, autoGenerateVisitLog, processImportedRecords, compressTextToLimit } from "@/lib/ai";
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

const PRODUCTS = ["위너프에이플러스", "페린젝트"];
const VISIT_LOG_TAB_STORAGE_KEY = "sip.visitLog.activeTab";
const VISIT_LOG_HOSPITAL_STORAGE_KEY = "sip.visitLog.selectedHospital";
const VISIT_LOG_DEPT_STORAGE_KEY = "sip.visitLog.selectedDept";

type VisitLogTab = 'manual' | 'auto' | 'import';
type BulkFailure = {
  doctorName: string;
  reason: string;
};

function readSessionValue(key: string): string {
  if (typeof window === "undefined") return "";
  return window.sessionStorage.getItem(key) ?? "";
}

function readStoredTab(): VisitLogTab {
  const stored = readSessionValue(VISIT_LOG_TAB_STORAGE_KEY);
  return stored === "auto" || stored === "import" || stored === "manual" ? stored : "manual";
}

function writeSessionValue(key: string, value: string) {
  if (typeof window === "undefined") return;
  if (value) {
    window.sessionStorage.setItem(key, value);
  } else {
    window.sessionStorage.removeItem(key);
  }
}

function classifyGenerationFailure(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/Visit generation failed final validation|final validation/i.test(message)) {
    const match = message.match(/failTypes=([^;]+)/);
    return `검증 실패${match ? ` (${match[1].trim()})` : ""}`;
  }
  if (/AI 호출 실패|OpenAI|rate limit|Too many requests|429/i.test(message)) {
    if (/429|Too many requests|rate limit/i.test(message)) return "AI 호출 실패 (요청이 몰렸습니다)";
    if (/not configured|api key|인증|401|403/i.test(message)) return "AI 호출 실패 (키/권한 확인 필요)";
    if (/model|does not exist|Invalid request|400/i.test(message)) return "AI 호출 실패 (모델 또는 요청 형식)";
    return "AI 호출 실패";
  }
  if (/duplicate|중복/i.test(message)) return "중복 저장";
  if (/timeout|timed out|ETIMEDOUT/i.test(message)) return "AI 호출 실패 (시간 초과)";
  return message.length > 80 ? `${message.slice(0, 77)}...` : message;
}

function getWeekKey(dateString: string): string {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return "";
  const day = (date.getDay() + 6) % 7;
  const monday = new Date(date);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(date.getDate() - day);
  return monday.toISOString().split("T")[0];
}

export default function VisitLogPage() {
  const search = useSearch();
  const params = new URLSearchParams(search);
  const preselectedDoctorId = params.get("doctorId") ?? "";

  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [doctors] = useState(() => doctorStorage.getAll());
  const [allLogs, setAllLogs] = useState(() => visitLogStorage.getAll());

  const [selectedHospital, setSelectedHospital] = useState(() => readSessionValue(VISIT_LOG_HOSPITAL_STORAGE_KEY));
  const [selectedDept, setSelectedDept] = useState(() => readSessionValue(VISIT_LOG_DEPT_STORAGE_KEY));
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
  const [activeTab, setActiveTab] = useState<VisitLogTab>(() => readStoredTab());
  const [bulkCount, setBulkCount] = useState(3);
  const [bulkProgress, setBulkProgress] = useState<{ current: number; total: number; doctorName: string } | null>(null);
  const [bulkResults, setBulkResults] = useState<Array<{ doctor: Doctor; log: VisitLog }>>([]);
  const [bulkFailures, setBulkFailures] = useState<BulkFailure[]>([]);
  const [savedLogId, setSavedLogId] = useState<string | null>(null);

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
  const autoTargetCount = selectedHospital ? filteredDoctors.length : 0;

  useEffect(() => {
    if (selectedHospital && !hospitals.includes(selectedHospital)) {
      setSelectedHospital("");
      setSelectedDept("");
      writeSessionValue(VISIT_LOG_HOSPITAL_STORAGE_KEY, "");
      writeSessionValue(VISIT_LOG_DEPT_STORAGE_KEY, "");
    }
  }, [hospitals, selectedHospital]);

  useEffect(() => {
    if (selectedDept && !departments.includes(selectedDept)) {
      setSelectedDept("");
      writeSessionValue(VISIT_LOG_DEPT_STORAGE_KEY, "");
    }
  }, [departments, selectedDept]);

  const selectedDoctor = useMemo(
    () => doctors.find((d) => d.id === selectedDoctorId),
    [doctors, selectedDoctorId]
  );
  const selectedDoctorConversationCount = getConversationHistoryVisitCount(selectedDoctor);

  const pastLogs = useMemo(
    () => (selectedDoctorId ? visitLogStorage.getByDoctorId(selectedDoctorId) : []),
    [selectedDoctorId, allLogs]
  );

  function handleHospitalChange(h: string) {
    setSelectedHospital(h);
    setSelectedDept("");
    setSelectedDoctorId("");
    writeSessionValue(VISIT_LOG_HOSPITAL_STORAGE_KEY, h);
    writeSessionValue(VISIT_LOG_DEPT_STORAGE_KEY, "");
    resetResult();
  }

  function handleDeptChange(d: string) {
    setSelectedDept(d);
    setSelectedDoctorId("");
    writeSessionValue(VISIT_LOG_DEPT_STORAGE_KEY, d);
    resetResult();
  }

  function handleTabChange(tab: VisitLogTab) {
    setActiveTab(tab);
    writeSessionValue(VISIT_LOG_TAB_STORAGE_KEY, tab);
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
      const res = await convertToVisitLog(snapshotRawNotes, selectedDoctor, pastLogs, snapshotProducts);
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
        // 최종 글자수 보장: 230자 초과 시 강제 컷 후 저장
        const finalLog = res.formattedLog.length > 230
          ? compressTextToLimit(res.formattedLog, 230)
          : res.formattedLog;
        const log: VisitLog = {
          id: generateId(), doctorId: snapshotDoctorId, visitDate: snapshotDate,
          rawNotes: snapshotRawNotes, formattedLog: finalLog,
          nextStrategy: res.nextStrategy, products: prods, createdAt: new Date().toISOString(),
        };
        const saveResult = visitLogStorage.save(log);
        if (saveResult.duplicate) {
          setIsSaved(false);
          toast({ title: "중복된 내용입니다.", description: "이미 같은 방문 기록이 있어 저장하지 않았습니다.", variant: "destructive" });
          return;
        }
        setAllLogs(visitLogStorage.getAll());
        setIsSaved(true);
        setSavedLogId(log.id);
      }
      toast({ title: "영업 일지가 자동 저장되었습니다", description: "아래 결과를 클릭하면 바로 편집할 수 있습니다." });
    } catch (e) {
      toast({ title: "AI 생성 실패", description: String(e), variant: "destructive" });
    } finally {
      setIsGenerating(false);
    }
  }

  async function handleBulkAutoGenerate() {
    if (!selectedHospital) {
      toast({ title: "자동 생성할 병원을 먼저 선택해주세요", variant: "destructive" });
      return;
    }
    if (filteredDoctors.length === 0) {
      toast({ title: "선택한 범위에 등록된 교수가 없습니다", variant: "destructive" });
      return;
    }
    const count = Math.min(bulkCount, filteredDoctors.length);

    // 오늘 이미 생성된 방문 기록 파악
    const today = new Date().toISOString().split('T')[0];
    const thisWeekKey = getWeekKey(today);
    const todayLogs = visitLogStorage.getAll().filter(l => l.visitDate === today);
    const thisWeekLogs = visitLogStorage.getAll().filter(l => l.createdAt && getWeekKey(l.createdAt) === thisWeekKey);
    const visitedTodayIds = new Set(todayLogs.map(l => l.doctorId));
    const visitedTodayDepts = new Set(
      todayLogs.map(l => doctors.find(d => d.id === l.doctorId)?.department).filter((x): x is string => Boolean(x))
    );
    const visitedThisWeekIds = new Set(thisWeekLogs.map(l => l.doctorId));

    // 교수별 총 방문 기록 수 (적을수록 우선)
    const logCountMap = new Map(filteredDoctors.map(d => [
      d.id, getDoctorVisitCount(d)
    ]));
    const randomTieBreaker = new Map(filteredDoctors.map(d => [d.id, Math.random()]));

    // 우선순위 그룹 분류
    // A: 이번 주 미생성 + 오늘 미방문 + 오늘 방문한 과와 다른 과 (최우선)
    // B: 이번 주 미생성 + 오늘 미방문이지만 오늘 방문한 과와 같은 과
    // C: 이번 주 미생성 + 오늘 이미 방문한 교수
    // D: 이번 주 이미 생성된 교수 (최하순위)
    const groupA = filteredDoctors.filter(d => !visitedThisWeekIds.has(d.id) && !visitedTodayIds.has(d.id) && !visitedTodayDepts.has(d.department));
    const groupB = filteredDoctors.filter(d => !visitedThisWeekIds.has(d.id) && !visitedTodayIds.has(d.id) && visitedTodayDepts.has(d.department));
    const groupC = filteredDoctors.filter(d => !visitedThisWeekIds.has(d.id) && visitedTodayIds.has(d.id));
    const groupD = filteredDoctors.filter(d => visitedThisWeekIds.has(d.id));

    // 그룹 내: 기록 수 오름차순 + 약간의 랜덤
    function sortGroup(g: Doctor[]) {
      return [...g].sort(
        (a, b) =>
          (logCountMap.get(a.id) ?? 0) - (logCountMap.get(b.id) ?? 0) ||
          (randomTieBreaker.get(a.id) ?? 0) - (randomTieBreaker.get(b.id) ?? 0) ||
          a.name.localeCompare(b.name, 'ko')
      );
    }

    const prioritized = [...sortGroup(groupA), ...sortGroup(groupB), ...sortGroup(groupC), ...sortGroup(groupD)];
    const targets = prioritized.slice(0, count);

    setIsAutoGenerating(true);
    resetResult();
    setBulkResults([]);
    setBulkFailures([]);
    const generated: Array<{ doctor: Doctor; log: VisitLog }> = [];
    const failures: BulkFailure[] = [];
    try {
      for (let i = 0; i < targets.length; i++) {
        const doctor = targets[i];
        setBulkProgress({ current: i + 1, total: targets.length, doctorName: doctor.name });
        const docPastLogs = visitLogStorage.getByDoctorId(doctor.id);
        try {
          const batchAvoidTexts = generated.map(({ log }) => `${log.formattedLog} ${log.nextStrategy ?? ""}`);
          const res = await autoGenerateVisitLog(doctor, docPastLogs, [], batchAvoidTexts);
          if (!res.formattedLog || res.formattedLog.trim().length < 10) {
            failures.push({ doctorName: doctor.name, reason: "결과 없음" });
            continue;
          }
          // 최종 글자수 보장: 230자 초과 시 강제 컷 후 저장
          const finalFormattedLog = res.formattedLog.length > 230
            ? compressTextToLimit(res.formattedLog, 230)
            : res.formattedLog;
          const log: VisitLog = {
            id: generateId(),
            doctorId: doctor.id,
            visitDate: res.visitDate,
            rawNotes: "",
            formattedLog: finalFormattedLog,
            nextStrategy: res.nextStrategy,
            products: res.products,
            createdAt: new Date().toISOString(),
          };
          const saveResult = visitLogStorage.save(log);
          if (saveResult.duplicate) {
            failures.push({ doctorName: doctor.name, reason: "중복 저장" });
            continue;
          }
          generated.push({ doctor, log });
          setBulkResults([...generated]);
        } catch (e) {
          failures.push({ doctorName: doctor.name, reason: classifyGenerationFailure(e) });
          console.error(`${doctor.name} 일지 생성 실패`, e);
        }
      }
      setBulkFailures(failures);
      setAllLogs(visitLogStorage.getAll());
      toast({
        title: `${generated.length}건의 영업 일지가 자동 저장되었습니다`,
        description: failures.length
          ? `${failures.length}건 실패: ${failures.slice(0, 2).map((item) => `${item.doctorName} ${item.reason}`).join(", ")}${failures.length > 2 ? "..." : ""}`
          : "방문 일지 기록에서 확인 및 수정할 수 있습니다.",
      });
    } catch (e) {
      setBulkFailures([{ doctorName: "일괄 생성", reason: classifyGenerationFailure(e) }]);
      toast({ title: "자동 생성 실패", description: String(e), variant: "destructive" });
    } finally {
      setIsAutoGenerating(false);
      setBulkProgress(null);
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
          let duplicates = 0;
          for (const item of data) {
            if (item.doctorId && item.visitDate && item.formattedLog) {
              const saveResult = visitLogStorage.save({ ...item, id: item.id ?? generateId(), createdAt: item.createdAt ?? new Date().toISOString() });
              if (saveResult.duplicate) {
                duplicates++;
                continue;
              }
              saved++;
            }
          }
          setAllLogs(visitLogStorage.getAll());
          toast({
            title: `${saved}개의 방문 기록이 가져와졌습니다`,
            description: duplicates > 0 ? `${duplicates}개는 중복된 내용이라 건너뛰었습니다.` : undefined,
          });
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
    <div className="p-3 sm:p-6 lg:p-8">
      <div className="mb-4 sm:mb-6">
        <h1 className="text-xl sm:text-2xl font-bold text-foreground">영업 일지 작성</h1>
        <p className="text-sm text-muted-foreground mt-1">과거 방문 맥락과 교수 성향을 자동으로 참고합니다</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 sm:gap-6">
        <div className="lg:col-span-3 space-y-4">
          <div className="mobile-scroll-row sm:w-fit sm:overflow-visible p-1 bg-muted rounded-lg">
            <button className={tabClass('manual')} onClick={() => handleTabChange('manual')}>
              <span className="flex items-center gap-1.5"><FileText className="w-3.5 h-3.5" /> 메모 변환</span>
            </button>
            <button className={tabClass('auto')} onClick={() => handleTabChange('auto')}>
              <span className="flex items-center gap-1.5"><Wand2 className="w-3.5 h-3.5" /> 자동 생성</span>
            </button>
            <button className={tabClass('import')} onClick={() => handleTabChange('import')}>
              <span className="flex items-center gap-1.5"><Upload className="w-3.5 h-3.5" /> 기록 가져오기</span>
            </button>
          </div>

          {(activeTab === 'manual' || activeTab === 'auto') && (
            <Card>
              <CardContent className="p-3 sm:p-5 space-y-4">
                <div className="space-y-3">
                  <Label className="flex items-center gap-1.5">
                    <Building2 className="w-3.5 h-3.5" />
                    병원 선택
                  </Label>
                  <div className="mobile-scroll-row sm:flex-wrap">
                    {activeTab !== 'auto' && (
                      <button
                        onClick={() => handleHospitalChange("")}
                        className={`shrink-0 min-h-10 px-3 py-1.5 text-sm rounded-lg border font-medium transition-all ${
                          !selectedHospital
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border text-muted-foreground hover:border-primary/50"
                        }`}
                      >
                        전체
                      </button>
                    )}
                    {hospitals.map((h) => (
                      <button
                        key={h}
                        onClick={() => handleHospitalChange(h)}
                        className={`shrink-0 min-h-10 px-3 py-1.5 text-sm rounded-lg border font-medium transition-all ${
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
                      <div className="mobile-scroll-row sm:flex-wrap">
                        <button
                          onClick={() => handleDeptChange("")}
                          className={`shrink-0 min-h-9 px-3 py-1.5 text-xs rounded-lg border font-medium transition-all ${
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
                            className={`shrink-0 min-h-9 px-3 py-1.5 text-xs rounded-lg border font-medium transition-all ${
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

                  {activeTab === 'manual' && (
                    <>
                      <Label className="flex items-center gap-1.5 mt-2">
                        <Users className="w-3.5 h-3.5" />
                        교수 선택 *
                      </Label>
                      <div className="relative">
                        <select
                          value={selectedDoctorId}
                          onChange={(e) => { setSelectedDoctorId(e.target.value); resetResult(); }}
                          className="w-full min-h-11 appearance-none border border-input bg-background rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring pr-8"
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
                    </>
                  )}
                  {activeTab === 'auto' && (
                    <div className="mt-2 text-xs bg-blue-50 border border-blue-200 rounded p-2.5 text-blue-700">
                      {selectedHospital ? (
                        <>
                          💡 일괄 메모 생성은 교수 개별 선택 없이 진행됩니다. 위에서 선택한 병원
                          {selectedDept ? ` ${selectedDept}` : ''}의 교수 {filteredDoctors.length}명 중
                          <strong> 무작위로 N명</strong>을 뽑아 각각 일지를 생성합니다.
                        </>
                      ) : (
                        <>자동 생성은 병원 1개를 먼저 선택해야 진행됩니다.</>
                      )}
                    </div>
                  )}
                  {activeTab === 'manual' && selectedDoctor && (
                    <div className="text-xs bg-muted/50 rounded p-3 space-y-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-foreground">{selectedDoctor.name} 교수</span>
                        <span className="text-muted-foreground">|</span>
                        <span className="text-muted-foreground">{selectedDoctor.hospital}, {selectedDoctor.department}</span>
                        <span className="sm:ml-auto text-muted-foreground">
                          방문 {selectedDoctor ? getDoctorVisitCount(selectedDoctor) : pastLogs.length}회
                          {pastLogs[0] && ` | 최근: ${pastLogs[0].visitDate}`}
                        </span>
                      </div>
                      {!pastLogs.length && selectedDoctorConversationCount > 0 && (
                        <p className="text-[11px] text-amber-600">
                          최근 메모 {selectedDoctorConversationCount}회 분량이 있어 첫 방문으로 처리하지 않습니다
                        </p>
                      )}
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
                            <p key={obj.id} className="text-muted-foreground">- {obj.content}</p>
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

                {activeTab === 'manual' && (
                  <>
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
                      <div className="mobile-scroll-row sm:flex-wrap">
                        {PRODUCTS.map((p) => (
                          <button
                            key={p}
                            type="button"
                            onClick={() => toggleProduct(p)}
                            className={`shrink-0 min-h-10 px-3 py-1.5 text-sm rounded-lg border-2 font-medium transition-all ${
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
                  </>
                )}

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
                        className="min-h-36 text-sm resize-none"
                      />
                    </div>
                    <Button
                      onClick={handleGenerate}
                      disabled={!selectedDoctorId || !rawNotes.trim() || isGenerating}
                      className="w-full min-h-12 gap-2 sm:min-h-9"
                    >
                      {isGenerating ? (
                        <><Loader2 className="w-4 h-4 animate-spin" />일지를 다듬는 중... (약 10-20초)</>
                      ) : (
                        <><Sparkles className="w-4 h-4" />AI 일지 생성</>
                      )}
                    </Button>
                  </>
                )}

                {activeTab === 'auto' && (
                  <div className="p-3 bg-primary/5 border border-primary/20 rounded-lg text-sm space-y-3">
                    <div className="flex items-start gap-2">
                      <Wand2 className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="font-medium text-primary">일괄 메모 생성</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          병원 1개를 선택하고 개수를 정하면, 해당 병원
                          {selectedDept ? ` ${selectedDept}` : ''}의 교수 중 우선순위에 맞춰
                          각자에게 맞춘 영업 일지를 한 번에 생성합니다.
                        </p>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-xs">생성 개수</Label>
                      <div className="flex flex-wrap gap-1.5">
                        {[1, 2, 3, 4, 5, 6].map((n) => (
                          <button
                            key={n}
                            type="button"
                            onClick={() => setBulkCount(n)}
                            disabled={isAutoGenerating}
                            className={`w-10 h-10 rounded-lg border-2 text-sm font-semibold transition-all ${
                              bulkCount === n
                                ? "border-primary bg-primary text-primary-foreground"
                                : "border-border text-muted-foreground hover:border-primary/50"
                            } disabled:opacity-50`}
                          >
                            {n}
                          </button>
                        ))}
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        선택 범위에 등록된 교수: <strong>{autoTargetCount}명</strong>
                        {!selectedHospital && (
                          <span className="text-amber-600"> (병원을 먼저 선택해야 합니다)</span>
                        )}
                        {autoTargetCount > 0 && autoTargetCount < bulkCount && (
                          <span className="text-amber-600"> (요청 {bulkCount}건 중 {autoTargetCount}건만 생성됩니다)</span>
                        )}
                      </p>
                    </div>

                    {bulkProgress && (
                      <div className="flex items-center gap-2 text-xs text-primary bg-white rounded-md px-3 py-2 border border-primary/20">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        {bulkProgress.current}/{bulkProgress.total} - {bulkProgress.doctorName} 교수 일지 생성 중...
                      </div>
                    )}

                    {bulkFailures.length > 0 && !isAutoGenerating && (
                      <div className="rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2 text-xs text-destructive space-y-1">
                        <p className="font-semibold">생성 실패 사유</p>
                        {bulkFailures.slice(0, 6).map((failure, index) => (
                          <p key={`${failure.doctorName}-${index}`}>
                            {failure.doctorName}: {failure.reason}
                          </p>
                        ))}
                        {bulkFailures.length > 6 && <p>외 {bulkFailures.length - 6}건</p>}
                      </div>
                    )}

                    <Button
                      onClick={handleBulkAutoGenerate}
                      disabled={!selectedHospital || filteredDoctors.length === 0 || isAutoGenerating}
                      className="w-full min-h-12 gap-2 sm:min-h-9"
                    >
                      {isAutoGenerating ? (
                        <><Loader2 className="w-4 h-4 animate-spin" />일괄 메모를 다듬는 중...</>
                      ) : (
                        <><Wand2 className="w-4 h-4" />{Math.min(bulkCount, autoTargetCount || bulkCount)}건 자동 생성</>
                      )}
                    </Button>

                    {bulkResults.length > 0 && (
                      <div className="border-t border-primary/20 pt-3 space-y-2">
                        <p className="text-xs font-semibold text-primary">생성 완료 ({bulkResults.length}건)</p>
                        <div className="space-y-2 max-h-96 overflow-y-auto">
                          {bulkResults.map(({ doctor, log }) => (
                            <div
                              key={log.id}
                              className="bg-white rounded-md border border-primary/10 p-2.5 text-xs cursor-pointer hover:border-primary/40 hover:shadow-sm transition-all"
                              onClick={() => setLocation(`/visit-log-history?editId=${log.id}`)}
                            >
                              <div className="flex items-center justify-between mb-1.5 flex-wrap gap-1">
                                <span className="font-semibold text-foreground">
                                  {doctor.name} 교수 <span className="text-muted-foreground font-normal">| {doctor.hospital} {doctor.department}</span>
                                </span>
                                <div className="flex items-center gap-1.5">
                                  <span className="text-[10px] text-muted-foreground">{log.visitDate}</span>
                                  {log.products.length > 0 && log.products.map((p) => (
                                    <Badge key={p} variant="secondary" className="text-[10px] py-0 px-1.5">{p}</Badge>
                                  ))}
                                </div>
                              </div>
                              <p className="text-muted-foreground leading-relaxed whitespace-pre-wrap">{log.formattedLog}</p>
                              {log.nextStrategy && (
                                <p className="text-primary/70 mt-1.5 leading-relaxed">→ {log.nextStrategy}</p>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {activeTab === 'import' && (
            <Card>
              <CardContent className="p-3 sm:p-5 space-y-4">
                <div className="flex items-start gap-3 p-3 bg-muted/50 rounded-lg text-sm">
                  <Info className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="font-medium mb-1">과거 기록 가져오기</p>
                    <p className="text-xs text-muted-foreground">
                      <strong>JSON 형식:</strong> 방문 기록 배열을 바로 데이터베이스에 추가합니다.<br/>
                      <strong>텍스트/CSV:</strong> AI가 내용을 정리하고 요약을 제공합니다.
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
                    가져온 기록을 정리하는 중...
                  </div>
                )}

                {importAnalysis && (
                  <div className="p-4 bg-primary/5 border border-primary/20 rounded-lg">
                    <p className="text-xs font-semibold text-primary mb-2 flex items-center gap-1">
                      <Sparkles className="w-3.5 h-3.5" />
                      메모 요약 결과
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
            <Card
              className="border-green-300 bg-green-50/30 cursor-pointer hover:border-green-400 hover:shadow-md transition-all"
              onClick={() => savedLogId && setLocation(`/visit-log-history?editId=${savedLogId}`)}
            >
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2 text-green-700">
                  <CheckCircle2 className="w-4 h-4" />
                  저장 완료 — 클릭하면 바로 편집
                  {((selectedDoctor ? getDoctorVisitCount(selectedDoctor) : pastLogs.length) > 0) && (
                    <span className="text-xs font-normal text-muted-foreground ml-auto">
                      과거 {selectedDoctor ? getDoctorVisitCount(selectedDoctor) : pastLogs.length}회 방문 맥락 반영
                    </span>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed bg-white rounded-lg p-3 border">
                  {result.formattedLog}
                </p>
                {result.nextStrategy && (
                  <p className="text-sm text-primary/70 whitespace-pre-wrap leading-relaxed px-1">
                    → {result.nextStrategy}
                  </p>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
