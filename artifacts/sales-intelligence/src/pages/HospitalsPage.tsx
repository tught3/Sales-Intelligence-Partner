import { useState, useMemo } from "react";
import {
  hospitalStorage,
  departmentStorage,
  doctorStorage,
  visitLogStorage,
  generateId,
  type HospitalProfile,
  type DepartmentProfile,
} from "@/lib/storage";
import { analyzeHospitalContext } from "@/lib/ai";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  Building2,
  Plus,
  Trash2,
  ChevronDown,
  ChevronUp,
  Brain,
  Loader2,
  Users,
  Pencil,
} from "lucide-react";

const HOSPITAL_TYPE_LABELS = {
  tertiary: '상급종합병원',
  secondary: '종합병원',
  clinic: '의원',
  other: '기타',
};

export default function HospitalsPage() {
  const { toast } = useToast();
  const [hospitals, setHospitals] = useState<HospitalProfile[]>(() => hospitalStorage.getAll());
  const [departments, setDepartments] = useState<DepartmentProfile[]>(() => departmentStorage.getAll());
  const allDoctors = useMemo(() => doctorStorage.getAll(), []);
  const allLogs = useMemo(() => visitLogStorage.getAll(), []);

  const [expandedHospitalId, setExpandedHospitalId] = useState<string | null>(null);
  const [showHospitalForm, setShowHospitalForm] = useState(false);
  const [editingHospital, setEditingHospital] = useState<HospitalProfile | null>(null);
  const [showDeptForm, setShowDeptForm] = useState<string | null>(null);
  const [editingDept, setEditingDept] = useState<DepartmentProfile | null>(null);
  const [analyzingId, setAnalyzingId] = useState<string | null>(null);
  const [analysisResults, setAnalysisResults] = useState<Record<string, string>>({});

  const [hName, setHName] = useState("");
  const [hRegion, setHRegion] = useState("");
  const [hType, setHType] = useState<HospitalProfile["hospitalType"]>("secondary");
  const [hCharacteristics, setHCharacteristics] = useState("");
  const [hKeyDepts, setHKeyDepts] = useState("");
  const [hCompetitor, setHCompetitor] = useState("");
  const [hNotes, setHNotes] = useState("");

  const [dName, setDName] = useState("");
  const [dCharacteristics, setDCharacteristics] = useState("");
  const [dCompetitor, setDCompetitor] = useState("");
  const [dNotes, setDNotes] = useState("");

  function resetHospitalForm() {
    setHName(""); setHRegion(""); setHType("secondary");
    setHCharacteristics(""); setHKeyDepts(""); setHCompetitor(""); setHNotes("");
    setEditingHospital(null);
    setShowHospitalForm(false);
  }

  function openEditHospital(h: HospitalProfile) {
    setEditingHospital(h);
    setHName(h.name); setHRegion(h.region); setHType(h.hospitalType);
    setHCharacteristics(h.characteristics); setHKeyDepts(h.keyDepartments);
    setHCompetitor(h.competitorStrength); setHNotes(h.notes);
    setShowHospitalForm(true);
  }

  function handleSaveHospital() {
    if (!hName.trim()) return;
    const profile: HospitalProfile = {
      id: editingHospital?.id ?? generateId(),
      name: hName.trim(),
      region: hRegion.trim(),
      hospitalType: hType,
      characteristics: hCharacteristics.trim(),
      keyDepartments: hKeyDepts.trim(),
      competitorStrength: hCompetitor.trim(),
      notes: hNotes.trim(),
      updatedAt: new Date().toISOString(),
    };
    hospitalStorage.save(profile);
    setHospitals(hospitalStorage.getAll());
    resetHospitalForm();
    toast({ title: editingHospital ? "병원 정보가 수정되었습니다" : "병원이 등록되었습니다" });
  }

  function handleDeleteHospital(id: string, name: string) {
    if (!confirm(`${name} 병원 정보를 삭제하시겠습니까?`)) return;
    hospitalStorage.delete(id);
    departmentStorage.getByHospital(id).forEach((d) => departmentStorage.delete(d.id));
    setHospitals(hospitalStorage.getAll());
    setDepartments(departmentStorage.getAll());
    toast({ title: "병원 정보가 삭제되었습니다" });
  }

  function resetDeptForm() {
    setDName(""); setDCharacteristics(""); setDCompetitor(""); setDNotes("");
    setEditingDept(null);
    setShowDeptForm(null);
  }

  function openEditDept(d: DepartmentProfile) {
    setEditingDept(d);
    setDName(d.departmentName); setDCharacteristics(d.characteristics);
    setDCompetitor(d.competitorProducts); setDNotes(d.notes);
    setShowDeptForm(d.hospitalId);
  }

  function handleSaveDept(hospitalId: string, hospitalName: string) {
    if (!dName.trim()) return;
    const profile: DepartmentProfile = {
      id: editingDept?.id ?? generateId(),
      hospitalId,
      hospitalName,
      departmentName: dName.trim(),
      characteristics: dCharacteristics.trim(),
      mainProducts: ['위너프', '페린젝트'],
      competitorProducts: dCompetitor.trim(),
      notes: dNotes.trim(),
      updatedAt: new Date().toISOString(),
    };
    departmentStorage.save(profile);
    setDepartments(departmentStorage.getAll());
    resetDeptForm();
    toast({ title: "과 정보가 저장되었습니다" });
  }

  async function handleAnalyze(hospital: HospitalProfile) {
    setAnalyzingId(hospital.id);
    try {
      const doctors = allDoctors.filter((d) => d.hospital === hospital.name);
      const logs = allLogs.filter((l) => doctors.some((d) => d.id === l.doctorId));
      const result = await analyzeHospitalContext(hospital.name, doctors, logs);
      setAnalysisResults((prev) => ({ ...prev, [hospital.id]: result }));
    } catch (e) {
      toast({ title: "분석 실패", description: String(e), variant: "destructive" });
    } finally {
      setAnalyzingId(null);
    }
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6 sm:mb-8">
        <div>
          <h1 className="text-2xl font-bold text-foreground">병원 & 과 특성 관리</h1>
          <p className="text-muted-foreground mt-1">병원별, 과별 특성을 저장하면 AI가 더 정확한 영업 전략을 제안합니다</p>
        </div>
        <Button onClick={() => { resetHospitalForm(); setShowHospitalForm(true); }} className="gap-2">
          <Plus className="w-4 h-4" />
          병원 추가
        </Button>
      </div>

      {showHospitalForm && (
        <Card className="mb-6 border-primary/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{editingHospital ? "병원 정보 편집" : "새 병원 등록"}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1.5 col-span-2">
                <Label>병원명 *</Label>
                <Input placeholder="서울대학교병원" value={hName} onChange={(e) => setHName(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>병원 유형</Label>
                <select
                  value={hType}
                  onChange={(e) => setHType(e.target.value as HospitalProfile["hospitalType"])}
                  className="w-full border border-input bg-background rounded-md px-3 py-2 text-sm"
                >
                  {Object.entries(HOSPITAL_TYPE_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>지역</Label>
                <Input placeholder="서울 종로구" value={hRegion} onChange={(e) => setHRegion(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>주요 과</Label>
                <Input placeholder="소화기내과, 산부인과..." value={hKeyDepts} onChange={(e) => setHKeyDepts(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>병원 특성 (분위기, 처방 패턴 등)</Label>
              <Textarea
                placeholder="예: 교수진이 데이터 중심적, 경쟁사 A 제품 사용률 높음, 학술적 접근 선호..."
                value={hCharacteristics}
                onChange={(e) => setHCharacteristics(e.target.value)}
                rows={3}
              />
            </div>
            <div className="space-y-1.5">
              <Label>경쟁사 현황</Label>
              <Input
                placeholder="예: A사 제품 점유율 60%, B사 최근 영업 강화 중"
                value={hCompetitor}
                onChange={(e) => setHCompetitor(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>추가 메모</Label>
              <Textarea
                placeholder="방문 관련 주의사항, 주차 정보, 담당자 연락처 등..."
                value={hNotes}
                onChange={(e) => setHNotes(e.target.value)}
                rows={2}
              />
            </div>
            <div className="flex gap-2">
              <Button onClick={handleSaveHospital} disabled={!hName.trim()}>저장</Button>
              <Button variant="outline" onClick={resetHospitalForm}>취소</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {hospitals.length === 0 ? (
        <div className="text-center py-16">
          <Building2 className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
          <p className="text-muted-foreground mb-2">등록된 병원이 없습니다</p>
          <p className="text-xs text-muted-foreground">병원 특성을 등록하면 AI가 더 정확한 영업 전략을 제안합니다</p>
        </div>
      ) : (
        <div className="space-y-4">
          {hospitals.map((hospital) => {
            const depts = departments.filter((d) => d.hospitalId === hospital.id);
            const doctors = allDoctors.filter((d) => d.hospital === hospital.name);
            const isExpanded = expandedHospitalId === hospital.id;
            const analysis = analysisResults[hospital.id];

            return (
              <Card key={hospital.id} className="group">
                <div
                  className="flex items-center justify-between p-5 cursor-pointer hover:bg-muted/20 transition-colors"
                  onClick={() => setExpandedHospitalId(isExpanded ? null : hospital.id)}
                >
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <Building2 className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold text-foreground">{hospital.name}</h3>
                        <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded">
                          {HOSPITAL_TYPE_LABELS[hospital.hospitalType]}
                        </span>
                        {hospital.region && <span className="text-xs text-muted-foreground">{hospital.region}</span>}
                      </div>
                      <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1"><Users className="w-3 h-3" /> 교수 {doctors.length}명</span>
                        <span>과 {depts.length}개 등록</span>
                        {hospital.keyDepartments && <span>| {hospital.keyDepartments}</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => openEditHospital(hospital)}
                      className="opacity-0 group-hover:opacity-100 p-1.5 rounded hover:bg-primary/10 text-muted-foreground hover:text-primary transition-all"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleAnalyze(hospital)}
                      disabled={analyzingId === hospital.id}
                      className="opacity-0 group-hover:opacity-100 p-1.5 rounded hover:bg-primary/10 text-muted-foreground hover:text-primary transition-all disabled:opacity-50"
                    >
                      {analyzingId === hospital.id
                        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        : <Brain className="w-3.5 h-3.5" />}
                    </button>
                    <button
                      onClick={() => handleDeleteHospital(hospital.id, hospital.name)}
                      className="opacity-0 group-hover:opacity-100 p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-all"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                    {isExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground ml-1" /> : <ChevronDown className="w-4 h-4 text-muted-foreground ml-1" />}
                  </div>
                </div>

                {isExpanded && (
                  <div className="border-t px-5 pb-5">
                    {hospital.characteristics && (
                      <div className="mt-3 p-3 bg-muted/30 rounded-lg text-sm">
                        <p className="text-xs font-semibold text-muted-foreground mb-1">병원 특성</p>
                        <p className="text-foreground">{hospital.characteristics}</p>
                      </div>
                    )}
                    {hospital.competitorStrength && (
                      <div className="mt-2 p-3 bg-red-50 border border-red-100 rounded-lg text-sm">
                        <p className="text-xs font-semibold text-red-600 mb-1">경쟁사 현황</p>
                        <p className="text-foreground">{hospital.competitorStrength}</p>
                      </div>
                    )}

                    {analysis && (
                      <div className="mt-3 p-3 bg-primary/5 border border-primary/20 rounded-lg">
                        <p className="text-xs font-semibold text-primary mb-2 flex items-center gap-1">
                          <Brain className="w-3.5 h-3.5" />
                          AI 병원 전략 분석
                        </p>
                        <pre className="text-xs text-foreground whitespace-pre-wrap font-sans leading-relaxed">{analysis}</pre>
                      </div>
                    )}

                    <div className="mt-4">
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="text-sm font-semibold">과별 특성</h4>
                        <button
                          onClick={() => { resetDeptForm(); setShowDeptForm(hospital.id); }}
                          className="text-xs text-primary hover:underline flex items-center gap-0.5"
                        >
                          <Plus className="w-3 h-3" /> 과 추가
                        </button>
                      </div>

                      {showDeptForm === hospital.id && (
                        <div className="mb-3 p-3 border rounded-lg space-y-2 bg-muted/20">
                          <p className="text-xs font-semibold text-muted-foreground">
                            {editingDept ? "과 정보 편집" : "새 과 등록"}
                          </p>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <div>
                              <Label className="text-xs">과 이름 *</Label>
                              <Input
                                placeholder="소화기내과"
                                value={dName}
                                onChange={(e) => setDName(e.target.value)}
                                className="text-sm mt-1"
                              />
                            </div>
                            <div>
                              <Label className="text-xs">경쟁 제품</Label>
                              <Input
                                placeholder="A사 제품, B사 제품..."
                                value={dCompetitor}
                                onChange={(e) => setDCompetitor(e.target.value)}
                                className="text-sm mt-1"
                              />
                            </div>
                          </div>
                          <div>
                            <Label className="text-xs">과 특성</Label>
                            <Textarea
                              placeholder="예: 철결핍 환자 많음, 데이터 중시, 원내 처방 의존도 높음..."
                              value={dCharacteristics}
                              onChange={(e) => setDCharacteristics(e.target.value)}
                              rows={2}
                              className="text-sm mt-1"
                            />
                          </div>
                          <div className="flex gap-2">
                            <Button size="sm" onClick={() => handleSaveDept(hospital.id, hospital.name)} disabled={!dName.trim()}>
                              저장
                            </Button>
                            <Button size="sm" variant="outline" onClick={resetDeptForm}>취소</Button>
                          </div>
                        </div>
                      )}

                      {depts.length === 0 ? (
                        <p className="text-xs text-muted-foreground py-2">등록된 과가 없습니다</p>
                      ) : (
                        <div className="space-y-2">
                          {depts.map((dept) => (
                            <div key={dept.id} className="p-3 border rounded-lg text-sm group/dept relative">
                              <div className="flex items-center justify-between mb-1">
                                <span className="font-medium">{dept.departmentName}</span>
                                <div className="flex gap-1 opacity-0 group-hover/dept:opacity-100 transition-all">
                                  <button
                                    onClick={() => openEditDept(dept)}
                                    className="p-1 rounded hover:bg-primary/10 text-muted-foreground hover:text-primary"
                                  >
                                    <Pencil className="w-3 h-3" />
                                  </button>
                                  <button
                                    onClick={() => { departmentStorage.delete(dept.id); setDepartments(departmentStorage.getAll()); }}
                                    className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                </div>
                              </div>
                              {dept.characteristics && <p className="text-xs text-muted-foreground">{dept.characteristics}</p>}
                              {dept.competitorProducts && (
                                <p className="text-xs text-red-600 mt-0.5">경쟁: {dept.competitorProducts}</p>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
