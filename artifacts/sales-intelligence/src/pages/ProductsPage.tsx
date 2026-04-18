import { useState, useRef } from "react";
import {
  manualStorage,
  snippetStorage,
  generateId,
  type CompanyManual,
  type GoldenSnippet,
} from "@/lib/storage";
import {
  extractTextFromImage,
  reformatAsCompanyRule,
  generateSnippetsForProduct,
  mergeAdditionalFeatures,
} from "@/lib/ai";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Package,
  Plus,
  Trash2,
  FileText,
  ChevronDown,
  ChevronUp,
  Image as ImageIcon,
  Wand2,
  Loader2,
  Sparkles,
  Pencil,
} from "lucide-react";

const PRODUCT_TABS = [
  { key: "위너프", label: "위너프 (3세대 TPN)", color: "bg-blue-100 text-blue-700 border-blue-300" },
  { key: "위너프에이플러스", label: "위너프에이플러스 (4세대 TPN)", color: "bg-indigo-100 text-indigo-700 border-indigo-300" },
  { key: "페린젝트", label: "페린젝트 (IV FCM)", color: "bg-emerald-100 text-emerald-700 border-emerald-300" },
  { key: "플라주OP", label: "플라주OP (균형 전해질 수액)", color: "bg-amber-100 text-amber-700 border-amber-300" },
  { key: "이부프로펜프리믹스", label: "이부프로펜프리믹스 (IV NSAID)", color: "bg-rose-100 text-rose-700 border-rose-300" },
  { key: "포스페넴", label: "포스페넴 (Fosfomycin)", color: "bg-teal-100 text-teal-700 border-teal-300" },
  { key: "프리페넴", label: "프리페넴 (Ertapenem)", color: "bg-cyan-100 text-cyan-700 border-cyan-300" },
  { key: "기타", label: "기타 제품 정보", color: "bg-gray-100 text-gray-700 border-gray-300" },
];

const TEMPLATE_PLACEHOLDER = `예시 구조:

■ 핵심 특장점
- 
- 

■ 임상 데이터/근거
- 

■ 경쟁사 대비 차별점
- 

■ 영업 포인트 (자주 쓰는 어필)
- 

■ 자주 받는 질문/반박과 답변
Q. 
A. `;

function categorizeProduct(title: string): string {
  const t = title.toLowerCase();
  if (title.includes("위너프에이플러스") || t.includes("winuf a")) return "위너프에이플러스";
  if (title.includes("위너프") || t.includes("winuf")) return "위너프";
  if (title.includes("페린젝트") || t.includes("ferinject")) return "페린젝트";
  if (title.includes("플라주") || t.includes("plaju")) return "플라주OP";
  if (title.includes("이부프로펜") || title.includes("프리브로펜") || t.includes("ibuprofen") || t.includes("pribrophen")) return "이부프로펜프리믹스";
  if (title.includes("포스페넴") || title.includes("포스포마이신") || t.includes("fospenem") || t.includes("fosfomycin")) return "포스페넴";
  if (title.includes("프리페넴") || title.includes("에르타페넴") || t.includes("pripenem") || t.includes("ertapenem")) return "프리페넴";
  return "기타";
}

export default function ProductsPage() {
  const { toast } = useToast();
  const [manuals, setManuals] = useState<CompanyManual[]>(() =>
    manualStorage.getByCategory("product")
  );
  const [activeTab, setActiveTab] = useState<string>("위너프");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<CompanyManual | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [aiLoading, setAiLoading] = useState<"image" | "reformat" | null>(null);
  const [imageProgress, setImageProgress] = useState("");
  const [generatingFor, setGeneratingFor] = useState<string | null>(null);
  const [mergeNotes, setMergeNotes] = useState<Record<string, string>>({});
  const [mergingId, setMergingId] = useState<string | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const visibleManuals = manuals.filter((m) => categorizeProduct(m.title) === activeTab);

  function refresh() {
    setManuals(manualStorage.getByCategory("product"));
  }

  function resetForm() {
    setTitle("");
    setContent("");
    setEditing(null);
    setShowForm(false);
    setAiLoading(null);
    setImageProgress("");
  }

  function openNew() {
    resetForm();
    const presetTitle =
      activeTab === "기타" ? "" : `${activeTab} - 제품 정보`;
    setTitle(presetTitle);
    setContent(TEMPLATE_PLACEHOLDER);
    setShowForm(true);
  }

  function openEdit(m: CompanyManual) {
    setEditing(m);
    setTitle(m.title);
    setContent(m.content);
    setShowForm(true);
  }

  function handleSave() {
    if (!title.trim() || !content.trim()) return;
    const manual: CompanyManual = {
      id: editing?.id ?? generateId(),
      title: title.trim(),
      content: content.trim(),
      category: "product",
      updatedAt: new Date().toISOString(),
    };
    manualStorage.save(manual);
    refresh();
    resetForm();
    toast({ title: editing ? "제품 정보가 수정되었습니다" : "제품 정보가 저장되었습니다" });
  }

  function handleDelete(id: string) {
    if (!confirm("이 제품 정보를 삭제하시겠습니까?")) return;
    manualStorage.delete(id);
    refresh();
    toast({ title: "삭제되었습니다" });
  }

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
        if (!title && i === 0) {
          setTitle(activeTab === "기타" ? file.name.replace(/\.[^/.]+$/, "") : `${activeTab} - ${file.name.replace(/\.[^/.]+$/, "")}`);
        }
      }
      const combined = results.length === 1
        ? results[0]
        : results.map((r, i) => `[이미지 ${i + 1}]\n${r}`).join("\n\n---\n\n");
      setContent(combined);
      toast({
        title: `이미지 ${files.length}장 분석 완료`,
        description: 'AI로 깔끔하게 재작성 버튼으로 정리할 수 있습니다',
      });
    } catch (err) {
      toast({ title: "이미지 분석 실패", description: String(err), variant: "destructive" });
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
      const reformatted = await reformatAsCompanyRule(content, "product");
      setContent(reformatted);
      toast({ title: "AI 재작성 완료" });
    } catch (err) {
      toast({ title: "AI 재작성 실패", description: String(err), variant: "destructive" });
    } finally {
      setAiLoading(null);
    }
  }

  async function handleMergeFeatures(m: CompanyManual) {
    const notes = (mergeNotes[m.id] ?? "").trim();
    if (!notes) {
      toast({ title: "추가할 특장점을 입력해주세요", variant: "destructive" });
      return;
    }
    setMergingId(m.id);
    try {
      const productName = categorizeProduct(m.title);
      const merged = await mergeAdditionalFeatures(m.content, notes, productName);
      const updated: CompanyManual = {
        ...m,
        content: merged.trim(),
        updatedAt: new Date().toISOString(),
      };
      manualStorage.save(updated);
      setMergeNotes((prev) => ({ ...prev, [m.id]: "" }));
      refresh();
      toast({
        title: "특장점이 통합되었습니다",
        description: "AI가 기존 매뉴얼에 새 내용을 자연스럽게 녹여냈습니다",
      });
    } catch (e: any) {
      toast({
        title: "통합 실패",
        description: e?.message ?? String(e),
        variant: "destructive",
      });
    } finally {
      setMergingId(null);
    }
  }

  async function handleGenerateSnippets(productName: string) {
    setGeneratingFor(productName);
    try {
      const items = await generateSnippetsForProduct(productName);
      let count = 0;
      for (const item of items) {
        const s: GoldenSnippet = {
          id: generateId(),
          content: item.content,
          context: item.context,
          tags: item.tags,
          product: item.product,
          effectiveness: 4,
          createdAt: new Date().toISOString(),
        };
        snippetStorage.save(s);
        count++;
      }
      toast({
        title: `${productName} 멘트 ${count}개 생성 완료`,
        description: '핵심 멘트 라이브러리에서 확인하세요',
      });
    } catch (e: any) {
      toast({
        title: "멘트 생성 실패",
        description: e?.message ?? String(e),
        variant: "destructive",
      });
    } finally {
      setGeneratingFor(null);
    }
  }

  const activeTabInfo = PRODUCT_TABS.find((t) => t.key === activeTab)!;
  const canGenerate = activeTab !== "기타" && visibleManuals.length > 0;

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Package className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">제품 정보</h1>
            <p className="text-muted-foreground text-sm">
              제품의 특장점과 정보를 관리하면 AI가 이걸 보고 핵심 멘트를 만들어줍니다
            </p>
          </div>
        </div>
      </div>

      {/* AI 안내 */}
      <Card className="mb-5 border-primary/20 bg-primary/5">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <Sparkles className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
            <div className="text-sm">
              <p className="font-semibold text-primary mb-1">제품 정보 → 핵심 멘트 자동 연결</p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                여기에 저장한 제품 정보는 영업 일지 작성, 반박 대응, 다음 방문 전략 등 모든 AI 기능에서 자동 참고됩니다.
                또한 각 제품별 [AI 멘트 생성] 버튼을 누르면 그 제품의 특장점만 집중적으로 활용한 핵심 멘트가 라이브러리에 자동 추가됩니다.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 제품 탭 */}
      <div className="flex flex-wrap gap-2 mb-5">
        {PRODUCT_TABS.map((tab) => {
          const cnt = manuals.filter((m) => categorizeProduct(m.title) === tab.key).length;
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`px-3 py-2 rounded-lg border-2 text-sm font-medium transition-all flex items-center gap-2 ${
                isActive
                  ? "border-primary bg-primary text-primary-foreground"
                  : `border-border bg-background text-muted-foreground hover:border-primary/40`
              }`}
            >
              <span>{tab.label}</span>
              <Badge variant={isActive ? "secondary" : "outline"} className="text-xs">
                {cnt}
              </Badge>
            </button>
          );
        })}
      </div>

      {/* 액션 버튼들 */}
      <div className="flex flex-wrap gap-2 mb-5">
        <Button onClick={openNew} className="gap-2">
          <Plus className="w-4 h-4" />
          {activeTab === "기타" ? "정보 추가" : `${activeTab} 정보 추가`}
        </Button>
        {canGenerate && (
          <Button
            variant="outline"
            onClick={() => handleGenerateSnippets(activeTab)}
            disabled={generatingFor === activeTab}
            className="gap-2 border-primary/40 text-primary hover:bg-primary/5"
          >
            {generatingFor === activeTab ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Sparkles className="w-4 h-4" />
            )}
            {generatingFor === activeTab ? "생성 중..." : `${activeTab} AI 멘트 생성`}
          </Button>
        )}
      </div>

      {/* 입력/편집 폼 */}
      {showForm && (
        <Card className="mb-5 border-primary/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              {editing ? "제품 정보 편집" : `새 제품 정보 추가 (${activeTab})`}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label>제목 *</Label>
              <Input
                placeholder="예: 위너프 - 핵심 특장점, 위너프 - 경쟁사 대비"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                제목에 제품명({activeTab !== "기타" ? activeTab : "위너프/위너프에이플러스/페린젝트"})이 포함되어 있어야 자동 분류됩니다
              </p>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <Label>내용 *</Label>
                <label className="text-xs text-primary cursor-pointer hover:underline flex items-center gap-1">
                  <ImageIcon className="w-3 h-3" />
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

              {aiLoading === "image" && (
                <div className="flex items-center gap-2 text-xs text-primary bg-primary/5 rounded-md px-3 py-2">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  {imageProgress || "이미지 분석 중..."}
                </div>
              )}

              <Textarea
                placeholder={TEMPLATE_PLACEHOLDER}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={14}
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

      {/* 제품 정보 목록 */}
      {visibleManuals.length === 0 ? (
        <div className="text-center py-12 border-2 border-dashed border-border rounded-lg">
          <Package className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-muted-foreground mb-2">
            등록된 {activeTab} 정보가 없습니다
          </p>
          <p className="text-xs text-muted-foreground">
            특장점, 임상 데이터, 경쟁사 비교 등을 정리해두면 AI가 자동으로 활용합니다
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {visibleManuals.map((m) => (
            <Card key={m.id} className="group">
              <div
                className="flex items-center justify-between p-4 cursor-pointer hover:bg-muted/30 transition-colors"
                onClick={() => setExpandedId(expandedId === m.id ? null : m.id)}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <FileText className="w-4 h-4 text-primary flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="font-medium text-sm truncate">{m.title}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className={`text-xs px-1.5 py-0.5 rounded font-medium border ${activeTabInfo.color}`}>
                        {activeTab}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {new Date(m.updatedAt).toLocaleDateString("ko-KR")} 수정
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    onClick={(e) => { e.stopPropagation(); openEdit(m); }}
                    className="opacity-50 lg:opacity-0 lg:group-hover:opacity-100 p-1.5 rounded hover:bg-primary/10 text-muted-foreground hover:text-primary transition-all"
                    title="편집"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDelete(m.id); }}
                    className="opacity-50 lg:opacity-0 lg:group-hover:opacity-100 p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-all"
                    title="삭제"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                  {expandedId === m.id
                    ? <ChevronUp className="w-4 h-4 text-muted-foreground" />
                    : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                </div>
              </div>
              {expandedId === m.id && (
                <div className="px-4 pb-4 border-t space-y-3">
                  <pre className="text-xs text-foreground whitespace-pre-wrap font-sans leading-relaxed mt-3 bg-muted/30 rounded p-3">
                    {m.content}
                  </pre>

                  <div className="rounded-lg border-2 border-dashed border-purple-300 bg-purple-50/40 p-3 space-y-2">
                    <div className="flex items-start gap-2">
                      <Wand2 className="w-4 h-4 text-purple-600 mt-0.5 flex-shrink-0" />
                      <div className="text-xs">
                        <p className="font-semibold text-purple-700 mb-0.5">특장점 추가 입력 → AI가 위 매뉴얼에 통합</p>
                        <p className="text-[11px] text-purple-700/70 leading-relaxed">
                          현장에서 알게 된 추가 특장점, 임상 데이터, 경쟁사 비교, 화법 등을 편하게 적어주세요.
                          AI가 위 매뉴얼의 구조를 유지하면서 자연스럽게 녹여 다시 저장합니다 (기존 내용 보존).
                        </p>
                      </div>
                    </div>
                    <Textarea
                      placeholder={`예:
- 최근 ○○병원 △△교수가 위너프 처방시 □□ 부분 특히 만족
- ESPEN 2024 가이드라인에서 4세대 TPN 권고 등급 상향
- 경쟁사 ◇◇ 대비 가격 약 10% 저렴
- "환자 회복 속도가 눈에 띄게 빠릅니다" 어필 효과 좋음`}
                      value={mergeNotes[m.id] ?? ""}
                      onChange={(e) => setMergeNotes((prev) => ({ ...prev, [m.id]: e.target.value }))}
                      rows={6}
                      className="text-xs resize-none bg-white"
                      disabled={mergingId === m.id}
                    />
                    <div className="flex justify-end">
                      <Button
                        size="sm"
                        onClick={() => handleMergeFeatures(m)}
                        disabled={mergingId === m.id || !(mergeNotes[m.id] ?? "").trim()}
                        className="gap-1.5 bg-purple-600 hover:bg-purple-700 text-white"
                      >
                        {mergingId === m.id ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            AI 통합 중...
                          </>
                        ) : (
                          <>
                            <Sparkles className="w-3.5 h-3.5" />
                            AI로 매뉴얼에 통합 저장
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
