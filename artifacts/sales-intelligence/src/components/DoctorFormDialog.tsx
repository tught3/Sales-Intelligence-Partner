import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { X, Plus } from "lucide-react";
import { generateId, type Doctor, type DoctorTrait } from "@/lib/storage";

const TRAIT_COLORS: DoctorTrait['color'][] = ['blue', 'green', 'yellow', 'red', 'purple', 'gray'];
const COLOR_CLASSES: Record<DoctorTrait['color'], string> = {
  blue: "bg-blue-100 text-blue-700 hover:bg-blue-200",
  green: "bg-green-100 text-green-700 hover:bg-green-200",
  yellow: "bg-amber-100 text-amber-700 hover:bg-amber-200",
  red: "bg-red-100 text-red-700 hover:bg-red-200",
  purple: "bg-purple-100 text-purple-700 hover:bg-purple-200",
  gray: "bg-gray-100 text-gray-700 hover:bg-gray-200",
};

const PRESET_TRAITS = [
  { label: "학구적/데이터 중시", color: "blue" as const },
  { label: "편의성 중시", color: "green" as const },
  { label: "경쟁사 선호", color: "red" as const },
  { label: "환자 중심적", color: "purple" as const },
  { label: "비용 민감", color: "yellow" as const },
  { label: "혁신 선호", color: "blue" as const },
  { label: "보수적", color: "gray" as const },
  { label: "관계 중시", color: "green" as const },
];

interface Props {
  open: boolean;
  onClose: () => void;
  onSave: (data: Omit<Doctor, "id" | "createdAt" | "updatedAt" | "objections"> & { traits: DoctorTrait[] }) => void;
  initial?: Partial<Doctor>;
  editMode?: boolean;
}

export default function DoctorFormDialog({ open, onClose, onSave, initial, editMode }: Props) {
  const [name, setName] = useState(initial?.name ?? "");
  const [hospital, setHospital] = useState(initial?.hospital ?? "");
  const [department, setDepartment] = useState(initial?.department ?? "");
  const [position, setPosition] = useState(initial?.position ?? "교수");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [traits, setTraits] = useState<DoctorTrait[]>(initial?.traits ?? []);
  const [customTrait, setCustomTrait] = useState("");
  const [selectedColor, setSelectedColor] = useState<DoctorTrait['color']>("blue");

  useEffect(() => {
    if (open) {
      setName(initial?.name ?? "");
      setHospital(initial?.hospital ?? "");
      setDepartment(initial?.department ?? "");
      setPosition(initial?.position ?? "교수");
      setNotes(initial?.notes ?? "");
      setTraits(initial?.traits ?? []);
      setCustomTrait("");
      setSelectedColor("blue");
    }
  }, [open]);

  function addPresetTrait(preset: { label: string; color: DoctorTrait['color'] }) {
    if (traits.find((t) => t.label === preset.label)) return;
    setTraits([...traits, { id: generateId(), label: preset.label, color: preset.color }]);
  }

  function addCustomTrait() {
    if (!customTrait.trim()) return;
    setTraits([...traits, { id: generateId(), label: customTrait.trim(), color: selectedColor }]);
    setCustomTrait("");
  }

  function removeTrait(id: string) {
    setTraits(traits.filter((t) => t.id !== id));
  }

  function handleSave() {
    if (!name.trim() || !hospital.trim() || !department.trim()) return;
    onSave({ name: name.trim(), hospital: hospital.trim(), department: department.trim(), position: position.trim(), notes: notes.trim(), traits });
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editMode ? "교수 프로파일 편집" : "교수 프로파일 추가"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>이름 *</Label>
              <Input placeholder="홍길동" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>직위</Label>
              <Input placeholder="교수" value={position} onChange={(e) => setPosition(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>병원 *</Label>
              <Input placeholder="서울대병원" value={hospital} onChange={(e) => setHospital(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>과 *</Label>
              <Input placeholder="소화기내과" value={department} onChange={(e) => setDepartment(e.target.value)} />
            </div>
          </div>

          <div className="space-y-2">
            <Label>성향 태그</Label>
            <div className="flex flex-wrap gap-1.5">
              {PRESET_TRAITS.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => addPresetTrait(p)}
                  className={`text-xs px-2.5 py-1 rounded-full font-medium transition-all ${COLOR_CLASSES[p.color]} ${traits.find(t => t.label === p.label) ? 'opacity-40' : ''}`}
                >
                  + {p.label}
                </button>
              ))}
            </div>
            {traits.length > 0 && (
              <div className="flex flex-wrap gap-1.5 p-2 bg-muted/50 rounded-lg">
                {traits.map((t) => (
                  <Badge key={t.id} variant="secondary" className="gap-1 pr-1">
                    {t.label}
                    <button onClick={() => removeTrait(t.id)} className="hover:text-destructive">
                      <X className="w-3 h-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <Input
                placeholder="직접 입력..."
                value={customTrait}
                onChange={(e) => setCustomTrait(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addCustomTrait()}
                className="flex-1"
              />
              <div className="flex gap-1">
                {TRAIT_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setSelectedColor(c)}
                    className={`w-5 h-5 rounded-full border-2 transition-all ${
                      c === 'blue' ? 'bg-blue-400' :
                      c === 'green' ? 'bg-green-400' :
                      c === 'yellow' ? 'bg-amber-400' :
                      c === 'red' ? 'bg-red-400' :
                      c === 'purple' ? 'bg-purple-400' : 'bg-gray-400'
                    } ${selectedColor === c ? 'border-foreground scale-110' : 'border-transparent'}`}
                  />
                ))}
              </div>
              <Button size="sm" variant="outline" onClick={addCustomTrait}>
                <Plus className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>추가 메모</Label>
            <Textarea
              placeholder="교수님에 대한 특이사항, 관심사 등을 기록하세요..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>취소</Button>
          <Button onClick={handleSave} disabled={!name.trim() || !hospital.trim() || !department.trim()}>
            {editMode ? "수정 저장" : "저장"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
