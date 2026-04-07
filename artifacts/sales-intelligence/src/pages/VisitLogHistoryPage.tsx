import { useState, useMemo } from "react";
import {
  doctorStorage,
  visitLogStorage,
  type VisitLog,
} from "@/lib/storage";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  BookOpen,
  Building2,
  Users,
  Trash2,
  FileText,
  Calendar,
} from "lucide-react";

export default function VisitLogHistoryPage() {
  const { toast } = useToast();
  const [doctors] = useState(() => doctorStorage.getAll());
  const [allLogs, setAllLogs] = useState(() => visitLogStorage.getAll());

  const [selectedHospital, setSelectedHospital] = useState("");
  const [selectedDept, setSelectedDept] = useState("");

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

    return logs.sort(
      (a, b) => new Date(b.visitDate).getTime() - new Date(a.visitDate).getTime()
    );
  }, [allLogs, doctors, selectedHospital, selectedDept]);

  function handleDelete(id: string) {
    visitLogStorage.delete(id);
    setAllLogs(visitLogStorage.getAll());
    toast({ title: "일지가 삭제되었습니다" });
  }

  function handleHospitalChange(h: string) {
    setSelectedHospital(h);
    setSelectedDept("");
  }

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">방문 일지 기록</h1>
        <p className="text-muted-foreground mt-1">병원별, 과별로 영업 일지를 조회합니다</p>
      </div>

      <div className="space-y-4 mb-6">
        <div className="flex items-center gap-3">
          <Building2 className="w-4 h-4 text-muted-foreground" />
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => handleHospitalChange("")}
              className={`px-3 py-1.5 text-sm rounded-lg border font-medium transition-all ${
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
        </div>

        {selectedHospital && departments.length > 0 && (
          <div className="flex items-center gap-3 pl-7">
            <Users className="w-4 h-4 text-muted-foreground" />
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setSelectedDept("")}
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
                  onClick={() => setSelectedDept(d)}
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
          </div>
        )}
      </div>

      <div className="mb-4 text-sm text-muted-foreground">
        총 {filteredLogs.length}건의 일지
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
            return (
              <Card key={log.id} className="group">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-2">
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
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {log.visitDate}
                      </span>
                      <button
                        onClick={() => handleDelete(log.id)}
                        className="opacity-0 group-hover:opacity-100 p-1 hover:text-destructive transition-all rounded"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{log.formattedLog}</p>
                  {log.nextStrategy && (
                    <p className="text-sm text-primary/70 mt-1">→ {log.nextStrategy}</p>
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
            );
          })}
        </div>
      )}
    </div>
  );
}
