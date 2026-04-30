import { useState, useMemo, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { doctorStorage, visitLogStorage, snippetStorage, generateId, getDoctorVisitCount, getConversationHistoryVisitCount, type Doctor, type DoctorTrait, type Objection, type ConversationRecord } from "@/lib/storage";
import { generateObjectionResponse, generateNextVisitStrategy, analyzePastConversations } from "@/lib/ai";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import DoctorFormDialog from "@/components/DoctorFormDialog";
import {
  ArrowLeft,
  Building2,
  Calendar,
  FileText,
  Lightbulb,
  Plus,
  Trash2,
  Brain,
  ChevronDown,
  ChevronUp,
  Loader2,
  Shield,
  Pencil,
  MessageSquare,
  Sparkles,
  Clock,
} from "lucide-react";

const TRAIT_COLORS: Record<string, string> = {
  blue: "bg-blue-100 text-blue-700",
  green: "bg-green-100 text-green-700",
  yellow: "bg-amber-100 text-amber-700",
  red: "bg-red-100 text-red-700",
  purple: "bg-purple-100 text-purple-700",
  gray: "bg-gray-100 text-gray-700",
};

export default function DoctorDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const [doctor, setDoctor] = useState(() => doctorStorage.getById(id));
  const [logs, setLogs] = useState(() => visitLogStorage.getByDoctorId(id));
  const snippets = useMemo(() => snippetStorage.getAll(), []);
  const visitCount = getDoctorVisitCount(doctor ?? undefined);
  const conversationCount = getConversationHistoryVisitCount(doctor ?? undefined);

  const [newObjection, setNewObjection] = useState("");
  const [newResponse, setNewResponse] = useState("");
  const [generatingResponse, setGeneratingResponse] = useState(false);
  const [generatingStrategy, setGeneratingStrategy] = useState(false);
  const [strategy, setStrategy] = useState<string | null>(null);
  const [expandedLog, setExpandedLog] = useState<string | null>(null);
  const [showEditForm, setShowEditForm] = useState(false);

  const [convText, setConvText] = useState("");
  const [convPeriod, setConvPeriod] = useState("2025년 2월~현재");
  const [analyzingConv, setAnalyzingConv] = useState(false);
  const [convAnalysisResult, setConvAnalysisResult] = useState<{ analysis: string; detectedTraits: string[]; nextSuggestions: string } | null>(null);
  const [expandedConvId, setExpandedConvId] = useState<string | null>(null);

  useEffect(() => {
    setLogs(visitLogStorage.getByDoctorId(id));
  }, [id]);

  if (!doctor) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 text-center">
        <p className="text-muted-foreground mb-4">교수 프로파일을 찾을 수 없습니다</p>
        <Button variant="outline" onClick={() => setLocation("/doctors")}>목록으로 돌아가기</Button>
      </div>
    );
  }

  async function handleGenerateResponse() {
    if (!newObjection.trim() || !doctor) return;
    setGeneratingResponse(true);
    try {
      const resp = await generateObjectionResponse(newObjection, doctor);
      setNewResponse(resp);
    } catch (e) {
      toast({ title: "AI 생성 실패", description: String(e), variant: "destructive" });
    } finally {
      setGeneratingResponse(false);
    }
  }

  function handleSaveObjection() {
    if (!newObjection.trim() || !doctor) return;
    const obj: Objection = {
      id: generateId(),
      content: newObjection.trim(),
      response: newResponse.trim(),
      createdAt: new Date().toISOString(),
    };
    const updated = { ...doctor, objections: [...doctor.objections, obj] };
    doctorStorage.save(updated);
    setDoctor(doctorStorage.getById(id));
    setLogs(visitLogStorage.getByDoctorId(id));
    setNewObjection("");
    setNewResponse("");
    toast({ title: "반박 패턴이 저장되었습니다" });
  }

  function handleDeleteObjection(objId: string) {
    if (!doctor) return;
    const updated = { ...doctor, objections: doctor.objections.filter((o) => o.id !== objId) };
    doctorStorage.save(updated);
    setDoctor(doctorStorage.getById(id));
    setLogs(visitLogStorage.getByDoctorId(id));
  }

  async function handleGenerateStrategy() {
    if (!doctor) return;
    setGeneratingStrategy(true);
    setStrategy(null);
    try {
      const s = await generateNextVisitStrategy(doctor, logs);
      setStrategy(s);
    } catch (e) {
      toast({ title: "전략 생성 실패", description: String(e), variant: "destructive" });
    } finally {
      setGeneratingStrategy(false);
    }
  }

  function handleEditSave(data: Omit<Doctor, "id" | "createdAt" | "updatedAt" | "objections"> & { traits: DoctorTrait[] }) {
    if (!doctor) return;
    const updated: Doctor = {
      ...doctor,
      ...data,
      updatedAt: new Date().toISOString(),
    };
    doctorStorage.save(updated);
    setDoctor(doctorStorage.getById(id));
    setShowEditForm(false);
    toast({ title: "프로파일이 수정되었습니다" });
  }

  async function handleAnalyzeConversation() {
    if (!doctor || !convText.trim()) return;
    setAnalyzingConv(true);
    setConvAnalysisResult(null);
    try {
      const result = await analyzePastConversations(convText, doctor, convPeriod);
      setConvAnalysisResult(result);
    } catch (e) {
      toast({ title: "분석 실패", description: String(e), variant: "destructive" });
    } finally {
      setAnalyzingConv(false);
    }
  }

  function handleSaveConvAnalysis() {
    if (!doctor || !convAnalysisResult) return;
    const record: ConversationRecord = {
      id: generateId(),
      rawText: convText,
      period: convPeriod,
      aiAnalysis: convAnalysisResult.analysis,
      detectedTraits: convAnalysisResult.detectedTraits,
      nextSuggestions: convAnalysisResult.nextSuggestions,
      createdAt: new Date().toISOString(),
    };
    doctorStorage.addConversationRecord(doctor.id, record);
    setDoctor(doctorStorage.getById(id));
    setLogs(visitLogStorage.getByDoctorId(id));
    setConvText("");
    setConvAnalysisResult(null);
    toast({ title: "과거 대화 기록이 저장되었습니다", description: "AI가 다음 방문 생성 시 자동으로 참고합니다" });
  }

  function handleDeleteConvRecord(recordId: string) {
    if (!doctor) return;
    doctorStorage.deleteConversationRecord(doctor.id, recordId);
    setDoctor(doctorStorage.getById(id));
    setLogs(visitLogStorage.getByDoctorId(id));
    toast({ title: "기록이 삭제되었습니다" });
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-5xl">
      <div className="mb-6">
        <button
          onClick={() => setLocation("/doctors")}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          교수 목록
        </button>
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-foreground">{doctor.name} {doctor.position}</h1>
            <div className="flex items-center gap-1.5 text-muted-foreground mt-1">
              <Building2 className="w-4 h-4" />
              <span>{doctor.hospital}, {doctor.department}</span>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowEditForm(true)}
              className="gap-1.5"
            >
              <Pencil className="w-3.5 h-3.5" />
              편집
            </Button>
            <Button onClick={handleGenerateStrategy} disabled={generatingStrategy} variant="outline" size="sm" className="gap-1.5">
              {generatingStrategy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Brain className="w-3.5 h-3.5" />}
              전략 생성
            </Button>
          </div>
        </div>
        {doctor.traits.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-3">
            {doctor.traits.map((t) => (
              <span key={t.id} className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${TRAIT_COLORS[t.color] ?? TRAIT_COLORS.gray}`}>
                {t.label}
              </span>
            ))}
          </div>
        )}
        {doctor.notes && (
          <p className="text-sm text-muted-foreground mt-2 bg-muted/50 rounded-lg p-3">{doctor.notes}</p>
        )}
      </div>

      {/* AI Strategy */}
      {strategy && (
        <Card className="mb-6 border-primary/30 bg-primary/5">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2 text-primary">
              <Lightbulb className="w-4 h-4" />
              AI 다음 방문 전략
            </CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="text-sm text-foreground whitespace-pre-wrap font-sans leading-relaxed">{strategy}</pre>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Visit History */}
        <div>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-primary" />
                  방문 이력 ({visitCount}회)
                </div>
                <button
                  onClick={() => setLocation(`/visit-log?doctorId=${doctor.id}`)}
                  className="text-xs text-primary hover:underline font-normal"
                >
                  + 일지 작성
                </button>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {logs.length === 0 ? (
                <div className="text-center py-6">
                  <FileText className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">
                    {conversationCount > 0
                      ? `실제 방문 일지는 아직 없지만 상담/분석 기록 ${conversationCount}건이 있습니다`
                      : '방문 기록이 없습니다'}
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {logs.map((log) => (
                    <div key={log.id} className="border rounded-lg overflow-hidden">
                      <button
                        onClick={() => setExpandedLog(expandedLog === log.id ? null : log.id)}
                        className="w-full flex items-center justify-between p-3 hover:bg-muted/50 transition-colors text-left"
                      >
                        <div>
                          <p className="text-sm font-medium">{log.visitDate}</p>
                          <p className="text-xs text-muted-foreground line-clamp-1">{log.formattedLog.slice(0, 60)}...</p>
                        </div>
                        {expandedLog === log.id ? <ChevronUp className="w-4 h-4 text-muted-foreground flex-shrink-0" /> : <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />}
                      </button>
                      {expandedLog === log.id && (
                        <div className="p-3 pt-0 border-t space-y-2 bg-muted/20">
                          <div>
                            <p className="text-xs font-semibold text-muted-foreground mb-1">영업 일지</p>
                            <p className="text-xs text-foreground whitespace-pre-wrap leading-relaxed">{log.formattedLog}</p>
                          </div>
                          {log.nextStrategy && (
                            <div>
                              <p className="text-xs font-semibold text-primary mb-1">다음방문계획</p>
                              <p className="text-xs text-foreground whitespace-pre-wrap leading-relaxed">{log.nextStrategy}</p>
                            </div>
                          )}
                          {log.products.length > 0 && (
                            <div className="flex gap-1">
                              {log.products.map((p) => <Badge key={p} variant="secondary" className="text-xs py-0">{p}</Badge>)}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Objections */}
        <div>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Shield className="w-4 h-4 text-primary" />
                반박 패턴 & 대응책
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2 p-3 bg-muted/30 rounded-lg">
                <p className="text-xs font-semibold text-muted-foreground">새 반박 패턴 추가</p>
                <Input
                  placeholder="교수님이 자주 하시는 반박..."
                  value={newObjection}
                  onChange={(e) => setNewObjection(e.target.value)}
                  className="text-sm"
                />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleGenerateResponse}
                    disabled={!newObjection.trim() || generatingResponse}
                    className="gap-1.5"
                  >
                    {generatingResponse ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Brain className="w-3.5 h-3.5" />}
                    AI 대응책 생성
                  </Button>
                </div>
                {newResponse && (
                  <Textarea
                    value={newResponse}
                    onChange={(e) => setNewResponse(e.target.value)}
                    rows={3}
                    className="text-sm"
                    placeholder="대응책..."
                  />
                )}
                <Button
                  size="sm"
                  onClick={handleSaveObjection}
                  disabled={!newObjection.trim()}
                  className="w-full"
                >
                  <Plus className="w-3.5 h-3.5 mr-1" />
                  저장
                </Button>
              </div>

              {doctor.objections.length === 0 ? (
                <p className="text-center text-sm text-muted-foreground py-3">반박 패턴이 없습니다</p>
              ) : (
                <div className="space-y-2">
                  {doctor.objections.map((obj) => (
                    <div key={obj.id} className="border rounded-lg p-3 relative group">
                      <button
                        onClick={() => handleDeleteObjection(obj.id)}
                        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-all"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                      <p className="text-xs font-medium text-foreground mb-1.5 pr-6">{obj.content}</p>
                      {obj.response && (
                        <div className="bg-primary/5 rounded p-2">
                          <p className="text-xs text-muted-foreground font-medium mb-0.5">대응책</p>
                          <p className="text-xs text-foreground">{obj.response}</p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Conversation History Section */}
      <div className="mt-6">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-primary" />
              과거 대화 기록 & 성향 분석
              <span className="text-xs font-normal text-muted-foreground ml-1">
                ({(doctor.conversationHistory ?? []).length}개 저장됨)
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="p-3 bg-primary/5 border border-primary/20 rounded-lg text-xs text-muted-foreground">
              <p className="font-medium text-primary mb-1">📋 사용법</p>
              <p>2월부터 일했던 내용, 방문 메모, 대화 내용 등을 그대로 붙여넣으세요. AI가 이 교수의 성향을 분석하고 다음 방문 전략을 제안합니다. 저장하면 영업 일지 생성 시 자동으로 참고합니다.</p>
            </div>
            <div className="space-y-2">
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="text-xs text-muted-foreground mb-1 block">기간</label>
                  <input
                    type="text"
                    value={convPeriod}
                    onChange={(e) => setConvPeriod(e.target.value)}
                    className="w-full border border-input bg-background rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    placeholder="예: 2025년 2월~현재"
                  />
                </div>
              </div>
              <Textarea
                placeholder={`이 교수와의 대화 내용, 방문 기록, 메모 등을 자유롭게 붙여넣으세요.\n\n예:\n2월 3일 첫 방문. 페린젝트 얘기했는데 가격 비싸다고 바로 거절. 다음엔 임상 데이터 가져가야할 것 같음.\n2월 17일 두번째 방문. 위너프 처방 패턴 물어보니 경구제는 별로 안 믿는 스타일. IV 선호. 학회지 논문 하나 드렸더니 읽어보겠다고 함...`}
                value={convText}
                onChange={(e) => setConvText(e.target.value)}
                rows={8}
                className="text-sm resize-none"
              />
              <div className="flex gap-2">
                <Button
                  onClick={handleAnalyzeConversation}
                  disabled={!convText.trim() || analyzingConv}
                  className="gap-2 flex-1"
                >
                  {analyzingConv
                    ? <><Loader2 className="w-4 h-4 animate-spin" />AI가 성향 분석 중...</>
                    : <><Sparkles className="w-4 h-4" />AI 성향 분석</>}
                </Button>
              </div>
            </div>

            {convAnalysisResult && (
              <div className="border border-primary/30 rounded-lg overflow-hidden">
                <div className="bg-primary/5 p-3 border-b border-primary/20">
                  <p className="text-xs font-semibold text-primary flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5" />
                    AI 분석 결과
                  </p>
                </div>
                <div className="p-3 space-y-3">
                  {convAnalysisResult.detectedTraits.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground mb-1.5">파악된 성향 태그</p>
                      <div className="flex flex-wrap gap-1.5">
                        {convAnalysisResult.detectedTraits.map((t) => (
                          <span key={t} className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium">{t}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground mb-1">성향 분석</p>
                    <pre className="text-xs text-foreground whitespace-pre-wrap font-sans leading-relaxed bg-muted/30 rounded p-2">{convAnalysisResult.analysis}</pre>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-primary mb-1">다음 방문 전략 제안</p>
                    <pre className="text-xs text-foreground whitespace-pre-wrap font-sans leading-relaxed bg-primary/5 rounded p-2">{convAnalysisResult.nextSuggestions}</pre>
                  </div>
                  <Button onClick={handleSaveConvAnalysis} size="sm" className="w-full gap-1.5">
                    <Plus className="w-3.5 h-3.5" />
                    이 분석 저장 (AI가 다음부터 자동 참고)
                  </Button>
                </div>
              </div>
            )}

            {(doctor.conversationHistory ?? []).length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground">저장된 과거 대화 분석</p>
                {(doctor.conversationHistory ?? []).map((record) => (
                  <div key={record.id} className="border rounded-lg overflow-hidden group">
                    <div
                      onClick={() => setExpandedConvId(expandedConvId === record.id ? null : record.id)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setExpandedConvId(expandedConvId === record.id ? null : record.id);
                        }
                      }}
                      className="w-full flex items-center justify-between p-3 hover:bg-muted/30 transition-colors text-left cursor-pointer"
                    >
                      <div className="flex items-center gap-2">
                        <Clock className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                        <div>
                          <span className="text-sm font-medium">{record.period}</span>
                          {record.detectedTraits.length > 0 && (
                            <div className="flex gap-1 mt-0.5">
                              {record.detectedTraits.slice(0, 3).map((t) => (
                                <span key={t} className="text-xs bg-primary/10 text-primary px-1.5 py-0 rounded-full">{t}</span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDeleteConvRecord(record.id); }}
                          className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-all"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                        {expandedConvId === record.id
                          ? <ChevronUp className="w-4 h-4 text-muted-foreground" />
                          : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                      </div>
                    </div>
                    {expandedConvId === record.id && (
                      <div className="border-t p-3 space-y-2 bg-muted/20 text-xs">
                        <div>
                          <p className="font-semibold text-muted-foreground mb-1">성향 분석</p>
                          <pre className="text-foreground whitespace-pre-wrap font-sans leading-relaxed">{record.aiAnalysis}</pre>
                        </div>
                        {record.nextSuggestions && (
                          <div>
                            <p className="font-semibold text-primary mb-1">다음 방문 전략</p>
                            <pre className="text-foreground whitespace-pre-wrap font-sans leading-relaxed">{record.nextSuggestions}</pre>
                          </div>
                        )}
                        <div className="border-t pt-2">
                          <p className="font-semibold text-muted-foreground mb-1">원본 기록</p>
                          <pre className="text-muted-foreground whitespace-pre-wrap font-sans leading-relaxed line-clamp-3">{record.rawText.slice(0, 300)}{record.rawText.length > 300 ? '...' : ''}</pre>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {showEditForm && doctor && (
        <DoctorFormDialog
          key={`edit-detail-${doctor.id}`}
          open={showEditForm}
          onClose={() => setShowEditForm(false)}
          onSave={handleEditSave}
          initial={doctor}
          editMode
        />
      )}
    </div>
  );
}
