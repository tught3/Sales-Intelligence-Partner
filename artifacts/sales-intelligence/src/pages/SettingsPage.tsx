import { useState, useRef } from "react";
import {
  manualStorage,
  exportAllData,
  importAllData,
  refreshCache,
  generateId,
  type CompanyManual,
} from "@/lib/storage";
import { extractTextFromImage, reformatAsCompanyRule } from "@/lib/ai";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
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
  Image,
  Wand2,
  Loader2,
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
  const [aiLoading, setAiLoading] = useState<"image" | "reformat" | null>(null);
  const [imageProgress, setImageProgress] = useState<string>("");
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [migrating, setMigrating] = useState(false);
  const [localDataExists, setLocalDataExists] = useState(() => {
    try {
      const keys = ['jw_doctors', 'jw_visit_logs', 'jw_golden_snippets', 'jw_hospital_profiles', 'jw_department_profiles', 'jw_company_manuals'];
      return keys.some(k => {
        const raw = localStorage.getItem(k);
        if (!raw) return false;
        const arr = JSON.parse(raw);
        return Array.isArray(arr) && arr.length > 0;
      });
    } catch { return false; }
  });

  async function handleMigrateLocalData() {
    setMigrating(true);
    try {
      const data: Record<string, any> = {};
      const keyMap: Record<string, string> = {
        jw_doctors: 'doctors',
        jw_visit_logs: 'visitLogs',
        jw_golden_snippets: 'snippets',
        jw_hospital_profiles: 'hospitals',
        jw_department_profiles: 'departments',
        jw_company_manuals: 'manuals',
      };
      let totalCount = 0;
      for (const [lsKey, jsonKey] of Object.entries(keyMap)) {
        const raw = localStorage.getItem(lsKey);
        if (raw) {
          const arr = JSON.parse(raw);
          if (Array.isArray(arr) && arr.length > 0) {
            data[jsonKey] = arr;
            totalCount += arr.length;
          }
        }
      }
      if (totalCount === 0) {
        toast({ title: "복구할 데이터가 없습니다", variant: "destructive" });
        setMigrating(false);
        return;
      }
      const result = await importAllData(JSON.stringify(data));
      if (result.success) {
        setManuals(manualStorage.getAll());
        setLocalDataExists(false);
        toast({ title: `${totalCount}건의 데이터가 서버로 복구되었습니다!` });
      } else {
        toast({ title: "복구 실패", description: result.error, variant: "destructive" });
      }
    } catch (e: any) {
      toast({ title: "복구 중 오류", description: String(e), variant: "destructive" });
    }
    setMigrating(false);
  }

  function resetForm() {
    setTitle("");
    setContent("");
    setCategory("rule");
    setEditingManual(null);
    setShowForm(false);
    setAiLoading(null);
    setImageProgress("");
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

  async function handleExport() {
    const data = await exportAllData();
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
    reader.onload = async (ev) => {
      const text = ev.target?.result as string;
      const result = await importAllData(text);
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

  // 이미지를 최대 800px로 리사이즈 후 base64 반환 (토큰 절약)
  function resizeAndEncodeImage(file: File, maxPx = 800): Promise<{ base64: string; mimeType: string }> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = reject;
      reader.onload = (ev) => {
        const img = new window.Image();
        img.onerror = reject;
        img.onload = () => {
          let { width, height } = img;
          if (width > maxPx || height > maxPx) {
            if (width >= height) {
              height = Math.round((height * maxPx) / width);
              width = maxPx;
            } else {
              width = Math.round((width * maxPx) / height);
              height = maxPx;
            }
          }
          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          if (!ctx) { reject(new Error("canvas ctx 없음")); return; }
          ctx.drawImage(img, 0, 0, width, height);
          const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
          resolve({ base64: dataUrl.split(",")[1], mimeType: "image/jpeg" });
        };
        img.src = ev.target?.result as string;
      };
      reader.readAsDataURL(file);
    });
  }

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    setShowForm(true);
    setAiLoading("image");
    const results: string[] = [];
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setImageProgress(files.length > 1 ? `이미지 ${i + 1}/${files.length} 분석 중...` : "이미지 분석 중...");
        const { base64, mimeType } = await resizeAndEncodeImage(file);
        const extracted = await extractTextFromImage(base64, mimeType);
        results.push(extracted);
        if (!title && i === 0) setTitle(file.name.replace(/\.[^/.]+$/, "").replace(/_/g, " "));
      }
      const combined = results.length === 1
        ? results[0]
        : results.map((r, i) => `[이미지 ${i + 1}]\n${r}`).join("\n\n---\n\n");
      setContent(combined);
      toast({
        title: `이미지 ${files.length}장 분석 완료`,
        description: files.length > 1 ? 'AI로 깔끔하게 재작성 버튼을 눌러 하나의 매뉴얼로 정리하세요' : '내용을 확인 후 저장하세요',
      });
    } catch (err) {
      toast({
        title: "이미지 분석 실패",
        description: String(err),
        variant: "destructive",
      });
    } finally {
      setAiLoading(null);
      setImageProgress("");
    }
    e.target.value = "";
  }

  async function handleReformat() {
    if (!content.trim()) return;
    setAiLoading("reformat");
    try {
      const reformatted = await reformatAsCompanyRule(content, category);
      setContent(reformatted);
      toast({ title: "AI 재작성 완료" });
    } catch (err) {
      toast({ title: "AI 재작성 실패", description: String(err), variant: "destructive" });
    } finally {
      setAiLoading(null);
    }
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">설정 & 회사 매뉴얼</h1>
        <p className="text-muted-foreground mt-1">
          AI가 영업 일지를 생성할 때 항상 참고하는 회사 가이드라인과 제품 정보를 관리하세요
        </p>
      </div>

      {/* Data persistence warning */}
      <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg">
        <div className="flex items-start gap-3">
          <span className="text-green-600 text-lg leading-none mt-0.5">✓</span>
          <div>
            <p className="text-sm font-semibold text-green-800 mb-1">클라우드 데이터 저장</p>
            <p className="text-xs text-green-700 leading-relaxed">
              모든 데이터(교수 프로파일, 방문 기록, 매뉴얼 등)는 <strong>서버에 저장</strong>됩니다.
              어떤 기기에서 접속해도 동일한 데이터를 볼 수 있습니다.
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
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
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <Label>내용 *</Label>
                    <div className="flex items-center gap-2 flex-wrap">
                      <label className="text-xs text-primary cursor-pointer hover:underline flex items-center gap-1">
                        <Upload className="w-3 h-3" />
                        텍스트 파일
                        <input type="file" accept=".txt,.md,.csv" className="hidden" onChange={handleTextFileImport} />
                      </label>
                      <label className="text-xs text-primary cursor-pointer hover:underline flex items-center gap-1">
                        <Image className="w-3 h-3" />
                        이미지 업로드 (여러 장 가능)
                        <input
                          ref={imageInputRef}
                          type="file"
                          accept="image/*"
                          multiple
                          className="hidden"
                          onChange={handleImageUpload}
                        />
                      </label>
                    </div>
                  </div>

                  {aiLoading === "image" && (
                    <div className="flex items-center gap-2 text-xs text-primary bg-primary/5 rounded-md px-3 py-2">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      {imageProgress || "이미지 분석 중..."}
                    </div>
                  )}

                  <Textarea
                    placeholder={`직접 입력하거나, 이미지를 업로드하면 AI가 자동으로 텍스트를 추출합니다.\n\n예시:\n- 경쟁사 제품명 직접 언급 금지\n- 임상 데이터 인용시 출처 명시 필수`}
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    rows={10}
                    className="text-sm resize-none font-mono"
                    disabled={aiLoading === "image"}
                  />

                  {content.trim() && (
                    <button
                      type="button"
                      onClick={handleReformat}
                      disabled={!!aiLoading}
                      className="flex items-center gap-1.5 text-xs text-purple-600 hover:text-purple-700 disabled:opacity-50"
                    >
                      {aiLoading === "reformat" ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <Wand2 className="w-3 h-3" />
                      )}
                      {aiLoading === "reformat" ? "AI 재작성 중..." : "AI로 깔끔하게 재작성"}
                    </button>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button onClick={handleSave} disabled={!title.trim() || !content.trim() || !!aiLoading}>
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
          {localDataExists && (
            <Card className="border-orange-300 bg-orange-50">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm text-orange-800">이전 브라우저 데이터 발견!</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-xs text-orange-700">
                  이 브라우저에 이전에 저장했던 교수 프로파일, 방문 기록 등이 남아 있습니다.
                  아래 버튼을 누르면 서버 DB로 자동 복구됩니다.
                </p>
                <Button
                  onClick={handleMigrateLocalData}
                  disabled={migrating}
                  className="w-full gap-2 bg-orange-600 hover:bg-orange-700"
                >
                  {migrating ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      복구 중...
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4" />
                      기존 데이터 서버로 복구하기
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          )}

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
