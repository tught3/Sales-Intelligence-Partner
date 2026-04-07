import { useState } from "react";
import {
  manualStorage,
  exportAllData,
  importAllData,
  generateId,
  type CompanyManual,
} from "@/lib/storage";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  BookOpen,
  Plus,
  Trash2,
  Download,
  Upload,
  FileText,
  ChevronDown,
  ChevronUp,
  Brain,
  Info,
} from "lucide-react";

const CATEGORY_LABELS: Record<CompanyManual["category"], string> = {
  rule: "회사 규칙",
  product: "제품 정보",
  other: "기타",
};

const CATEGORY_COLORS: Record<CompanyManual["category"], string> = {
  rule: "bg-blue-100 text-blue-700",
  product: "bg-green-100 text-green-700",
  other: "bg-gray-100 text-gray-700",
};

export default function SettingsPage() {
  const { toast } = useToast();
  const [manuals, setManuals] = useState<CompanyManual[]>(() => manualStorage.getAll());
  const [showForm, setShowForm] = useState(false);
  const [editingManual, setEditingManual] = useState<CompanyManual | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [category, setCategory] = useState<CompanyManual["category"]>("rule");

  function resetForm() {
    setTitle("");
    setContent("");
    setCategory("rule");
    setEditingManual(null);
    setShowForm(false);
  }

  function openEdit(manual: CompanyManual) {
    setEditingManual(manual);
    setTitle(manual.title);
    setContent(manual.content);
    setCategory(manual.category);
    setShowForm(true);
  }

  function handleSave() {
    if (!title.trim() || !content.trim()) return;
    const now = new Date().toISOString();
    const manual: CompanyManual = {
      id: editingManual?.id ?? generateId(),
      title: title.trim(),
      content: content.trim(),
      category,
      updatedAt: now,
    };
    manualStorage.save(manual);
    setManuals(manualStorage.getAll());
    resetForm();
    toast({ title: editingManual ? "매뉴얼이 수정되었습니다" : "매뉴얼이 저장되었습니다" });
  }

  function handleDelete(id: string) {
    if (!confirm("이 매뉴얼을 삭제하시겠습니까?")) return;
    manualStorage.delete(id);
    setManuals(manualStorage.getAll());
    toast({ title: "매뉴얼이 삭제되었습니다" });
  }

  function handleExport() {
    const data = exportAllData();
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `jw_영업비서_백업_${new Date().toISOString().split("T")[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: "데이터가 내보내기되었습니다" });
  }

  function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const result = importAllData(text);
      if (result.success) {
        setManuals(manualStorage.getAll());
        toast({ title: "데이터가 가져오기되었습니다. 페이지를 새로고침하세요." });
      } else {
        toast({ title: "가져오기 실패", description: result.error, variant: "destructive" });
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  function handleTextFileImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      setContent(text);
      if (!title) setTitle(file.name.replace(/\.[^/.]+$/, ""));
      setShowForm(true);
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-foreground">설정 & 회사 매뉴얼</h1>
        <p className="text-muted-foreground mt-1">
          AI가 영업 일지를 생성할 때 항상 참고하는 회사 가이드라인과 제품 정보를 관리하세요
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-5">
          <Card className="border-primary/20 bg-primary/5">
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <Brain className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-primary mb-1">AI가 이 매뉴얼을 자동으로 참고합니다</p>
                  <p className="text-xs text-muted-foreground">
                    저장된 매뉴얼 내용은 영업 일지 생성, 반박 대응, 다음 방문 전략 등 모든 AI 기능에 자동으로 반영됩니다.
                    회사의 영업 방식, 제품 강점, 금지 표현 등을 여기에 입력하세요.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {showForm && (
            <Card className="border-primary/30">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">{editingManual ? "매뉴얼 편집" : "새 매뉴얼 추가"}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>제목 *</Label>
                    <Input
                      placeholder="예: 위너프 핵심 강조점"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>카테고리</Label>
                    <select
                      value={category}
                      onChange={(e) => setCategory(e.target.value as CompanyManual["category"])}
                      className="w-full border border-input bg-background rounded-md px-3 py-2 text-sm"
                    >
                      {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                        <option key={k} value={k}>{v}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label>내용 *</Label>
                    <label className="text-xs text-primary cursor-pointer hover:underline flex items-center gap-1">
                      <Upload className="w-3 h-3" />
                      텍스트 파일 불러오기
                      <input type="file" accept=".txt,.md,.csv" className="hidden" onChange={handleTextFileImport} />
                    </label>
                  </div>
                  <Textarea
                    placeholder={`예시:\n- 위너프는 하루 1정으로 편의성이 뛰어나다고 강조할 것\n- 경쟁사 제품을 직접 비교하는 표현은 삼갈 것\n- 임상 데이터 인용시 출처 명시 필수`}
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    rows={10}
                    className="text-sm resize-none font-mono"
                  />
                </div>
                <div className="flex gap-2">
                  <Button onClick={handleSave} disabled={!title.trim() || !content.trim()}>
                    저장
                  </Button>
                  <Button variant="outline" onClick={resetForm}>취소</Button>
                </div>
              </CardContent>
            </Card>
          )}

          {!showForm && (
            <Button onClick={() => setShowForm(true)} className="gap-2">
              <Plus className="w-4 h-4" />
              새 매뉴얼 추가
            </Button>
          )}

          {manuals.length === 0 ? (
            <div className="text-center py-12">
              <BookOpen className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-muted-foreground mb-2">저장된 매뉴얼이 없습니다</p>
              <p className="text-xs text-muted-foreground">
                회사 영업 가이드라인, 제품 정보, 반박 대응법 등을 입력하면 AI가 자동으로 참고합니다
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {manuals.map((manual) => (
                <Card key={manual.id} className="group">
                  <div
                    className="flex items-center justify-between p-4 cursor-pointer hover:bg-muted/30 transition-colors"
                    onClick={() => setExpandedId(expandedId === manual.id ? null : manual.id)}
                  >
                    <div className="flex items-center gap-3">
                      <FileText className="w-4 h-4 text-primary flex-shrink-0" />
                      <div>
                        <p className="font-medium text-sm">{manual.title}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${CATEGORY_COLORS[manual.category]}`}>
                            {CATEGORY_LABELS[manual.category]}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {new Date(manual.updatedAt).toLocaleDateString('ko-KR')} 수정
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={(e) => { e.stopPropagation(); openEdit(manual); }}
                        className="opacity-0 group-hover:opacity-100 p-1.5 rounded hover:bg-primary/10 text-muted-foreground hover:text-primary transition-all"
                      >
                        <FileText className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDelete(manual.id); }}
                        className="opacity-0 group-hover:opacity-100 p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-all"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                      {expandedId === manual.id
                        ? <ChevronUp className="w-4 h-4 text-muted-foreground" />
                        : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                    </div>
                  </div>
                  {expandedId === manual.id && (
                    <div className="px-4 pb-4 border-t">
                      <pre className="text-xs text-foreground whitespace-pre-wrap font-sans leading-relaxed mt-3 bg-muted/30 rounded p-3">
                        {manual.content}
                      </pre>
                    </div>
                  )}
                </Card>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">데이터 백업 / 복원</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button variant="outline" className="w-full justify-start gap-2 text-sm" onClick={handleExport}>
                <Download className="w-4 h-4" />
                전체 데이터 내보내기 (JSON)
              </Button>
              <label className="w-full">
                <div className="flex items-center gap-2 text-sm px-4 py-2 rounded-md border border-input bg-background hover:bg-accent cursor-pointer transition-colors">
                  <Upload className="w-4 h-4" />
                  데이터 가져오기 (JSON)
                </div>
                <input type="file" accept=".json" className="hidden" onChange={handleImport} />
              </label>
              <p className="text-xs text-muted-foreground pt-1">
                교수 프로파일, 방문 기록, 매뉴얼 등 모든 데이터를 JSON 파일로 백업하거나 복원할 수 있습니다.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Info className="w-4 h-4" />
                AI & API 키 안내
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-xs text-muted-foreground">
              <div className="p-2.5 bg-green-50 border border-green-200 rounded-lg">
                <p className="font-medium text-green-700 mb-1">✓ AI가 이미 연결되어 있습니다</p>
                <p className="text-green-600">
                  이 앱은 JW중외제약 전용 AI가 미리 설정되어 있습니다. 별도로 API 키를 입력하실 필요가 없습니다.
                </p>
              </div>
              <div>
                <p className="font-medium text-foreground mb-1">AI가 사용되는 기능:</p>
                <ul className="space-y-0.5 list-disc list-inside">
                  <li>영업 일지 자동 변환 (날것 메모 → 전문 일지)</li>
                  <li>빈 일지 자동 생성 (입력 없이 생성)</li>
                  <li>다음 방문 전략 수립</li>
                  <li>반박 대응책 생성</li>
                  <li>핵심 멘트 분석</li>
                  <li>병원 전략 분석</li>
                </ul>
              </div>
              <div>
                <p className="font-medium text-foreground mb-1">AI 맥락 참조 순서:</p>
                <ol className="space-y-0.5 list-decimal list-inside">
                  <li>회사 매뉴얼 (이 페이지)</li>
                  <li>병원/과 특성 데이터</li>
                  <li>교수 성향 & 반박 패턴</li>
                  <li>최근 방문 기록 (5회)</li>
                </ol>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">매뉴얼 작성 예시</CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground space-y-2">
              <div className="p-2 bg-muted rounded text-foreground">
                <p className="font-medium mb-1">📋 회사 규칙 예시</p>
                <p>- 경쟁사 제품명 직접 언급 금지</p>
                <p>- 임상 자료 인용 시 반드시 출처 명시</p>
                <p>- 방문 보고서는 당일 내 작성 원칙</p>
              </div>
              <div className="p-2 bg-muted rounded text-foreground">
                <p className="font-medium mb-1">💊 제품 정보 예시</p>
                <p>위너프: 하루 1정, 식사와 무관하게 복용, 변비 부작용 낮음</p>
                <p>페린젝트: 1회 최대 1000mg까지 투여 가능, 빠른 Hb 회복</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
