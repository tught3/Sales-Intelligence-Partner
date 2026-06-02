import { useState, useMemo, useRef, useEffect } from "react";
import { useSearch } from "wouter";
import {
  doctorStorage,
  feedbackStorage,
  visitLogStorage,
  type VisitLog,
} from "@/lib/storage";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  Building2,
  Users,
  Trash2,
  FileText,
  Calendar,
  Pencil,
  Check,
  X,
} from "lucide-react";

/** 편집 전후 텍스트를 비교해서 무엇이 삭제/추가됐는지 명확한 힌트 생성 */
function generateEditDiff(original: string, edited: string): string {
  if (!original || original.trim() === edited.trim()) return '';

  // 콤마·줄바꿈 기준으로 의미 단위 청크 분리
  const toChunks = (text: string): string[] =>
    text.split(/(?:,\s*|\n)+/)
      .map(s => s.trim())
      .filter(s => s.length >= 5);

  const origChunks = toChunks(original);
  const editChunks = toChunks(edited);

  // 청크 포함 여부 판단 (앞 10자 기준)
  const isPresent = (chunk: string, list: string[]) => {
    const key = chunk.slice(0, Math.min(10, chunk.length));
    return list.some(item => item.includes(key) || item.startsWith(key));
  };

  const deleted = origChunks.filter(o => !isPresent(o, editChunks));
  const added   = editChunks.filter(e => !isPresent(e, origChunks));

  const parts: string[] = [];

  if (deleted.length > 0) {
    const samples = deleted.slice(0, 2).map(s => `"${s.slice(0, 20)}"`).join(', ');
    parts.push(`삭제: ${samples}`);
  }
  if (added.length > 0) {
    const samples = added.slice(0, 2).map(s => `"${s.slice(0, 20)}"`).join(', ');
    parts.push(`추가: ${samples}`);
  }

  const lenDiff = edited.length - original.length;
  if (deleted.length === 0 && added.length === 0) {
    if (lenDiff < -10) parts.push(`${Math.abs(lenDiff)}자 단축`);
    else if (lenDiff > 10) parts.push(`${lenDiff}자 확장`);
    else parts.push('말투/표현 수정');
  } else if (lenDiff < -20) {
    parts.push(`(${Math.abs(lenDiff)}자 단축)`);
  }

  return parts.join(' / ');
}

export default function VisitLogHistoryPage() {
  const { toast } = useToast();
  const search = useSearch();
  const [doctors] = useState(() => doctorStorage.getAll());
  const [allLogs, setAllLogs] = useState(() => visitLogStorage.getAll());

  const [selectedHospital, setSelectedHospital] = useState("");
  const [selectedDept, setSelectedDept] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const editTargetRef = useRef<HTMLDivElement>(null);

  // URL ?editId= 파라미터로 진입 시 해당 로그 자동 편집 오픈
  useEffect(() => {
    const params = new URLSearchParams(search);
    const editId = params.get("editId");
    if (editId) {
      const log = visitLogStorage.getAll().find(l => l.id === editId);
      if (log) {
        setEditingId(editId);
        const combined = log.nextStrategy
          ? `${log.formattedLog}\n${log.nextStrategy}`
          : log.formattedLog;
        setEditText(combined);
      }
    }
  }, [search]);

  useEffect(() => {
    if (editingId) {
      if (textareaRef.current) {
        textareaRef.current.focus();
        textareaRef.current.selectionStart = textareaRef.current.value.length;
      }
      // 편집 중인 카드로 스크롤
      setTimeout(() => {
        editTargetRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);
    }
  }, [editingId]);

  const hospitals = useMemo(() => {
    const docIds = new Set(allLogs.map(l => l.doctorId));
    const set = new Set(
      doctors.filter(d => docIds.has(d.id)).map(d => d.hospital).filter(Boolean)
    );
    return Array.from(set).sort();
  }, [doctors, allLogs]);

  const departments = useMemo(() => {
    if (!selectedHospital) return [];
    const docIds = new Set(allLogs.map(l => l.doctorId));
    const set = new Set(
      doctors
        .filter(d => docIds.has(d.id) && d.hospital === selectedHospital)
        .map(d => d.department)
        .filter(Boolean)
    );
    return Array.from(set).sort();
  }, [doctors, allLogs, selectedHospital]);

  const filteredLogs = useMemo(() => {
    let logs = [...allLogs];

    if (selectedHospital) {
      const docIds = new Set(
        doctors
          .filter(d => {
            if (d.hospital !== selectedHospital) return false;
            if (selectedDept && d.department !== selectedDept) return false;
            return true;
          })
          .map(d => d.id)
      );
      logs = logs.filter(l => docIds.has(l.doctorId));
    }

    return logs;
  }, [allLogs, doctors, selectedHospital, selectedDept]);

  function handleDelete(id: string) {
    if (!confirm("이 일지를 삭제하시겠습니까?")) return;
    const log = visitLogStorage.getAll().find((item) => item.id === id);
    const doctor = log ? doctors.find((item) => item.id === log.doctorId) : undefined;
    if (log) {
      feedbackStorage.record({
        eventType: 'delete',
        visitLogId: log.id,
        doctorId: log.doctorId,
        doctorName: doctor?.name ?? '',
        hospital: doctor?.hospital ?? '',
        department: doctor?.department ?? '',
        products: log.products ?? [],
        rawNotes: log.rawNotes,
        originalFormattedLog: log.formattedLog,
        originalNextStrategy: log.nextStrategy,
        editedFormattedLog: '',
        editedNextStrategy: '',
        diffSummary: `삭제: "${log.formattedLog.slice(0, 40)}"`,
      });
    }
    visitLogStorage.delete(id);
    setAllLogs(visitLogStorage.getAll());
    if (editingId === id) setEditingId(null);
    toast({ title: "일지가 삭제되었습니다" });
  }

  function handleHospitalChange(h: string) {
    setSelectedHospital(h);
    setSelectedDept("");
  }

  function startEdit(log: VisitLog) {
    setEditingId(log.id);
    // formattedLog + nextStrategy 합쳐서 편집창에 표시 (한 문단으로 복사 가능)
    const combined = log.nextStrategy
      ? `${log.formattedLog}\n${log.nextStrategy}`
      : log.formattedLog;
    setEditText(combined);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditText("");
  }

  function saveEdit(log: VisitLog) {
    const editedText = editText.trim();

    // 다음방문 문장 분리 (다음방문시에는 / 다음번에는 / 다음에는 으로 시작하는 줄)
    const lines = editedText.split('\n');
    const nextMarkers = ['다음방문시에는', '다음번에는', '다음에는'];
    const splitIdx = lines.findIndex(l => nextMarkers.some(m => l.trim().startsWith(m)));
    const newFormattedLog = splitIdx > 0
      ? lines.slice(0, splitIdx).join('\n').trim()
      : editedText;
    const newNextStrategy = splitIdx > 0
      ? lines.slice(splitIdx).join('\n').trim()
      : '';

    const originalText = log.formattedLog + (log.nextStrategy ? '\n' + log.nextStrategy : '');
    const hint = originalText.trim() !== editedText.trim()
      ? generateEditDiff(originalText, editedText)
      : log.aiEditHint;
    const updated = { ...log, formattedLog: newFormattedLog, nextStrategy: newNextStrategy, aiEditHint: hint };
    const saveResult = visitLogStorage.save(updated);
    if (saveResult.duplicate) {
      toast({ title: "중복된 내용입니다.", description: "이미 같은 방문 기록이 있어 저장하지 않았습니다.", variant: "destructive" });
      return;
    }
    if (originalText.trim() !== editedText.trim()) {
      const doctor = doctors.find((item) => item.id === log.doctorId);
      feedbackStorage.record({
        eventType: 'edit',
        visitLogId: log.id,
        doctorId: log.doctorId,
        doctorName: doctor?.name ?? '',
        hospital: doctor?.hospital ?? '',
        department: doctor?.department ?? '',
        products: log.products ?? [],
        rawNotes: log.rawNotes,
        originalFormattedLog: log.formattedLog,
        originalNextStrategy: log.nextStrategy,
        editedFormattedLog: newFormattedLog,
        editedNextStrategy: newNextStrategy,
        diffSummary: hint ?? '',
      });
    }
    setAllLogs(visitLogStorage.getAll());
    setEditingId(null);
    setEditText("");
    toast({ title: "일지가 수정되었습니다", description: "수정된 말투와 내용은 다음 AI 생성에 반영됩니다." });
  }

  return (
    <div className="p-3 sm:p-6 lg:p-8">
      <div className="mb-4 sm:mb-6">
        <h1 className="text-2xl font-bold text-foreground">방문 일지 기록</h1>
        <p className="text-muted-foreground mt-1">병원별, 과별로 영업 일지를 조회하고 수정합니다</p>
      </div>

      <div className="sticky top-[69px] z-20 -mx-3 mb-5 space-y-3 border-y bg-background/95 px-3 py-3 backdrop-blur sm:static sm:mx-0 sm:mb-6 sm:border-0 sm:bg-transparent sm:px-0 sm:py-0">
        <div className="flex items-start gap-2 sm:items-center sm:gap-3">
          <Building2 className="w-4 h-4 text-muted-foreground" />
          <div className="mobile-scroll-row sm:flex-wrap">
            <button
              onClick={() => handleHospitalChange("")}
              className={`shrink-0 min-h-10 px-3 py-1.5 text-sm rounded-lg border font-medium transition-all ${
                !selectedHospital
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border text-muted-foreground hover:border-primary/50"
              }`}
            >
              전체 병원
            </button>
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
        </div>

        {selectedHospital && departments.length > 0 && (
          <div className="flex items-start gap-2 pl-0 sm:items-center sm:gap-3 sm:pl-7">
            <Users className="w-4 h-4 text-muted-foreground" />
            <div className="mobile-scroll-row sm:flex-wrap">
              <button
                onClick={() => setSelectedDept("")}
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
                  onClick={() => setSelectedDept(d)}
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
          </div>
        )}
      </div>

      <div className="mb-4 text-sm text-muted-foreground flex items-center justify-between">
        <span>총 {filteredLogs.length}건의 일지</span>
        <span className="text-xs">일지를 클릭하면 수정할 수 있습니다</span>
      </div>

      {filteredLogs.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <FileText className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">기록이 없습니다</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredLogs.map((log) => {
            const doc = doctors.find((d) => d.id === log.doctorId);
            const isEditing = editingId === log.id;
            return (
              <div key={log.id} ref={isEditing ? editTargetRef : undefined}>
              <Card
                className={`group transition-all ${isEditing ? 'border-primary ring-1 ring-primary/20' : 'cursor-pointer hover:border-primary/30'}`}
                onClick={() => { if (!isEditing) startEdit(log); }}
              >
                <CardContent className="p-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between mb-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm text-foreground">
                        {doc ? doc.name : "?"}
                      </span>
                      {doc && (
                        <>
                          <Badge variant="outline" className="text-xs py-0">{doc.hospital}</Badge>
                          <span className="text-xs text-muted-foreground">{doc.department}</span>
                        </>
                      )}
                    </div>
                    <div className="flex items-center justify-between gap-2 sm:justify-end">
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {log.visitDate}
                      </span>
                      {!isEditing && (
                        <>
                          <Pencil className="w-3 h-3 text-muted-foreground opacity-50 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity" />
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDelete(log.id); }}
                            className="touch-target opacity-70 lg:min-h-0 lg:min-w-0 lg:opacity-0 lg:group-hover:opacity-100 p-1 hover:text-destructive transition-all rounded"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {isEditing ? (
                    <div className="space-y-3" onClick={(e) => e.stopPropagation()}>
                      <Textarea
                        ref={textareaRef}
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        rows={6}
                        className="min-h-40 text-sm resize-none"
                      />
                      <div className="flex gap-2 justify-end">
                        <Button size="sm" variant="ghost" onClick={cancelEdit} className="gap-1">
                          <X className="w-3.5 h-3.5" /> 취소
                        </Button>
                        <Button size="sm" onClick={() => saveEdit(log)} className="min-h-10 gap-1 sm:min-h-8">
                          <Check className="w-3.5 h-3.5" /> 저장
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        수정된 말투와 내용은 다음 AI 일지 생성에 자동으로 반영됩니다.
                      </p>
                    </div>
                  ) : (
                    <>
                      <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">
                        {log.formattedLog}{log.nextStrategy ? `\n${log.nextStrategy}` : ''}
                      </p>
                    </>
                  )}

                  {log.products.length > 0 && (
                    <div className="flex gap-1 mt-2">
                      {log.products.map((p) => (
                        <Badge key={p} variant="secondary" className="text-xs py-0">{p}</Badge>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
