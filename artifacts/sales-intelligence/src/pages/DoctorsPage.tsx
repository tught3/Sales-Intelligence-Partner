import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { doctorStorage, visitLogStorage, generateId, type Doctor, type DoctorTrait } from "@/lib/storage";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import DoctorFormDialog from "@/components/DoctorFormDialog";
import {
  Users,
  Plus,
  Search,
  Building2,
  ChevronRight,
  FileText,
  Trash2,
  Pencil,
} from "lucide-react";

const traitColorMap: Record<string, string> = {
  blue: "bg-blue-100 text-blue-700",
  green: "bg-green-100 text-green-700",
  yellow: "bg-amber-100 text-amber-700",
  red: "bg-red-100 text-red-700",
  purple: "bg-purple-100 text-purple-700",
  gray: "bg-gray-100 text-gray-700",
};

export default function DoctorsPage() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingDoctor, setEditingDoctor] = useState<Doctor | null>(null);
  const [doctors, setDoctors] = useState<Doctor[]>(() => doctorStorage.getAll());
  const logs = useMemo(() => visitLogStorage.getAll(), []);

  const filtered = useMemo(
    () =>
      doctors.filter(
        (d) =>
          d.name.includes(search) ||
          d.hospital.includes(search) ||
          d.department.includes(search)
      ),
    [doctors, search]
  );

  function handleAddSave(data: Omit<Doctor, "id" | "createdAt" | "updatedAt" | "objections"> & { traits: DoctorTrait[] }) {
    const now = new Date().toISOString();
    const doctor: Doctor = {
      id: generateId(),
      ...data,
      objections: [],
      createdAt: now,
      updatedAt: now,
    };
    doctorStorage.save(doctor);
    setDoctors(doctorStorage.getAll());
    setShowForm(false);
    toast({ title: "교수 프로파일이 추가되었습니다" });
  }

  function handleEditSave(data: Omit<Doctor, "id" | "createdAt" | "updatedAt" | "objections"> & { traits: DoctorTrait[] }) {
    if (!editingDoctor) return;
    const updated: Doctor = {
      ...editingDoctor,
      ...data,
      updatedAt: new Date().toISOString(),
    };
    doctorStorage.save(updated);
    setDoctors(doctorStorage.getAll());
    setEditingDoctor(null);
    toast({ title: "프로파일이 수정되었습니다" });
  }

  function handleDelete(id: string, name: string) {
    if (!confirm(`${name} 교수님의 프로파일을 삭제하시겠습니까?`)) return;
    doctorStorage.delete(id);
    setDoctors(doctorStorage.getAll());
    toast({ title: "프로파일이 삭제되었습니다" });
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-foreground">교수 프로파일</h1>
          <p className="text-muted-foreground mt-1">담당 교수님들의 성향과 방문 이력을 관리하세요</p>
        </div>
        <Button onClick={() => setShowForm(true)} className="gap-2">
          <Plus className="w-4 h-4" />
          교수 추가
        </Button>
      </div>

      <div className="mb-5 relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="이름, 병원, 과 검색..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16">
          <Users className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
          <p className="text-muted-foreground mb-4">
            {search ? "검색 결과가 없습니다" : "등록된 교수 프로파일이 없습니다"}
          </p>
          {!search && (
            <Button onClick={() => setShowForm(true)} variant="outline" className="gap-2">
              <Plus className="w-4 h-4" />
              첫 교수 프로파일 추가하기
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((doctor) => {
            const visitCount = logs.filter((l) => l.doctorId === doctor.id).length;
            return (
              <Card key={doctor.id} className="hover:shadow-md transition-shadow group">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <div className="flex items-center gap-2 mb-0.5">
                        <h3 className="font-bold text-foreground text-lg">{doctor.name}</h3>
                        <span className="text-sm text-muted-foreground">{doctor.position}</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                        <Building2 className="w-3.5 h-3.5" />
                        <span>{doctor.hospital}</span>
                        <span>·</span>
                        <span>{doctor.department}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                      <button
                        onClick={() => setEditingDoctor(doctor)}
                        className="p-1.5 rounded-lg hover:bg-primary/10 text-muted-foreground hover:text-primary transition-all"
                        title="편집"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDelete(doctor.id, doctor.name)}
                        className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-all"
                        title="삭제"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {doctor.traits.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-3">
                      {doctor.traits.map((trait) => (
                        <span
                          key={trait.id}
                          className={`text-xs px-2 py-0.5 rounded-full font-medium ${traitColorMap[trait.color] ?? traitColorMap.gray}`}
                        >
                          {trait.label}
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-3 border-t">
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <FileText className="w-3.5 h-3.5" />
                      <span>방문 {visitCount}회</span>
                    </div>
                    <button
                      onClick={() => setLocation(`/doctors/${doctor.id}`)}
                      className="flex items-center gap-1 text-xs text-primary hover:underline font-medium"
                    >
                      프로파일 보기
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <DoctorFormDialog
        key="add-doctor"
        open={showForm}
        onClose={() => setShowForm(false)}
        onSave={handleAddSave}
      />

      {editingDoctor && (
        <DoctorFormDialog
          key={`edit-${editingDoctor.id}`}
          open={!!editingDoctor}
          onClose={() => setEditingDoctor(null)}
          onSave={handleEditSave}
          initial={editingDoctor}
          editMode
        />
      )}
    </div>
  );
}
