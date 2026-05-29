import { useEffect, useState, useMemo } from "react";
import { snippetDetailSimilarity, snippetStorage, generateId, type GoldenSnippet } from "@/lib/storage";
import { analyzeSnippetEffectiveness, generateSnippetsFromManuals } from "@/lib/ai";
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
  Star,
  Trash2,
  Search,
  Brain,
  Loader2,
  Tag,
  X,
  TrendingUp,
  ChevronDown,
  Lightbulb,
  Wand2,
} from "lucide-react";

const PRODUCTS = ["위너프", "위너프에이플러스", "페린젝트", "플라주OP", "이부프로펜프리믹스", "포스페넴", "프리페넴", "공통"];
const TAG_SUGGESTIONS = [
  "학구적 교수", "편의성 강조", "비용 이슈", "경쟁사 반박",
  "임상 데이터", "환자 경험", "초기 처방", "용량 조절",
];

function isDuplicateSnippet(
  candidate: Pick<GoldenSnippet, "content" | "context" | "product">,
  existing: Array<Pick<GoldenSnippet, "content" | "context" | "product" | "tags">>
): boolean {
  const withTags = { ...candidate, tags: [] };
  return existing.some((snippet) => snippetDetailSimilarity(withTags, snippet) >= 0.68);
}

function StarRating({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          className={`text-lg transition-colors ${n <= value ? "text-amber-400" : "text-muted-foreground/30"} hover:text-amber-400`}
        >
          ★
        </button>
      ))}
    </div>
  );
}

export default function SnippetsPage() {
  const { toast } = useToast();
  const [snippets, setSnippets] = useState<GoldenSnippet[]>(() => snippetStorage.getAll());

  const [showForm, setShowForm] = useState(false);
  const [content, setContent] = useState("");
  const [context, setContext] = useState("");
  const [product, setProduct] = useState("공통");
  const [effectiveness, setEffectiveness] = useState(3);
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");

  const [search, setSearch] = useState("");
  const [filterProduct, setFilterProduct] = useState("");
  const [analyzing, setAnalyzing] = useState<string | null>(null);
  const [analysisResult, setAnalysisResult] = useState<Record<string, string>>(() =>
    Object.fromEntries(snippetStorage.getAll().filter((s) => s.analysis).map((s) => [s.id, s.analysis || ""]))
  );
  const [generating, setGenerating] = useState(false);
  const [analyzingAll, setAnalyzingAll] = useState(false);

  useEffect(() => {
    const result = snippetStorage.pruneSimilar();
    if (result.removed.length > 0) {
      setSnippets(snippetStorage.getAll());
      toast({
        title: `유사 핵심멘트 ${result.removed.length}건을 정리했습니다`,
        description: "같은 디테일을 말만 바꾼 항목과 구체적 이득이 없는 항목은 정리했습니다.",
      });
    }
  }, [toast]);

  const filtered = useMemo(() => {
    return snippets
      .filter((s) => {
        const matchSearch =
          !search ||
          s.content.includes(search) ||
          s.context.includes(search) ||
          s.tags.some((t) => t.includes(search));
        const matchProduct = !filterProduct || s.product === filterProduct;
        return matchSearch && matchProduct;
      })
      .sort((a, b) => b.effectiveness - a.effectiveness);
  }, [snippets, search, filterProduct]);

  function addTag() {
    if (!tagInput.trim() || tags.includes(tagInput.trim())) return;
    setTags([...tags, tagInput.trim()]);
    setTagInput("");
  }

  function handleSave() {
    if (!content.trim()) return;
    const snippet: GoldenSnippet = {
      id: generateId(),
      content: content.trim(),
      context: context.trim(),
      tags,
      product,
      effectiveness,
      createdAt: new Date().toISOString(),
    };
    const saveResult = snippetStorage.save(snippet);
    if (saveResult.duplicate) {
      toast({ title: "유사한 핵심멘트입니다", description: saveResult.message, variant: "destructive" });
      return;
    }
    setSnippets(snippetStorage.getAll());
    setContent("");
    setContext("");
    setProduct("공통");
    setEffectiveness(3);
    setTags([]);
    setShowForm(false);
    toast({ title: "핵심 멘트가 저장되었습니다" });
  }

  function handleDelete(id: string) {
    snippetStorage.delete(id);
    setSnippets(snippetStorage.getAll());
    toast({ title: "삭제되었습니다" });
  }

  async function handleAutoGenerate() {
    setGenerating(true);
    try {
      const items = await generateSnippetsFromManuals();
      const existing = snippetStorage.getAll();
      const accepted: GoldenSnippet[] = [];
      let count = 0;
      let duplicateCount = 0;
      for (const item of items) {
        const snippet: GoldenSnippet = {
          id: generateId(),
          content: item.content,
          context: item.context,
          tags: item.tags,
          product: item.product,
          effectiveness: 4,
          createdAt: new Date().toISOString(),
        };
        if (isDuplicateSnippet(snippet, [...existing, ...accepted])) {
          duplicateCount++;
          continue;
        }
        const saveResult = snippetStorage.save(snippet);
        if (saveResult.duplicate) {
          duplicateCount++;
          continue;
        }
        accepted.push(snippet);
        count++;
      }
      setSnippets(snippetStorage.getAll());
      if (count === 0) {
        toast({
          title: items.length === 0 ? "더 이상 생성할 핵심멘트가 없습니다" : "핵심 멘트 저장 0개",
          description: items.length === 0
            ? "AI가 현재 제품 정보에서 기존 멘트와 다른 디테일을 찾지 못했습니다. 새 수치, 환자군, 급여 조건, 반박 대응을 더 구체적으로 넣어주세요."
            : `AI가 ${items.length}개를 만들었지만 유사 중복 ${duplicateCount}개가 제외되었습니다. 중복 기준을 완화했으니 다시 생성해보세요.`,
        });
      } else {
        toast({
          title: `${count}개 핵심 멘트가 자동 생성되었습니다`,
          description: duplicateCount > 0 ? `유사 중복 ${duplicateCount}개는 제외했습니다.` : undefined,
        });
      }
    } catch (e) {
      toast({ title: "자동 생성 실패", description: String(e), variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  }

  async function handleAnalyze(snippet: GoldenSnippet) {
    setAnalyzing(snippet.id);
    try {
      const res = await analyzeSnippetEffectiveness(snippet.content, snippet.product);
      snippetStorage.saveAnalysis(snippet.id, res);
      setSnippets(snippetStorage.getAll());
      setAnalysisResult((prev) => ({ ...prev, [snippet.id]: res }));
    } catch (e) {
      toast({ title: "분석 실패", description: String(e), variant: "destructive" });
    } finally {
      setAnalyzing(null);
    }
  }

  async function handleAnalyzeAll() {
    const targets = snippetStorage.getAll().filter((snippet) => !(snippet.analysis ?? "").trim());
    if (targets.length === 0) {
      toast({ title: "분석할 핵심멘트가 없습니다", description: "이미 모든 핵심멘트에 AI 분석이 저장되어 있습니다." });
      return;
    }

    setAnalyzingAll(true);
    let success = 0;
    let failed = 0;
    try {
      for (const snippet of targets) {
        setAnalyzing(snippet.id);
        try {
          const res = await analyzeSnippetEffectiveness(snippet.content, snippet.product);
          snippetStorage.saveAnalysis(snippet.id, res);
          setAnalysisResult((prev) => ({ ...prev, [snippet.id]: res }));
          success++;
        } catch (e) {
          console.error(e);
          failed++;
        }
      }
      setSnippets(snippetStorage.getAll());
      toast({
        title: `핵심멘트 ${success}건 분석 완료`,
        description: failed > 0 ? `${failed}건은 분석에 실패했습니다.` : "분석 결과를 자동생성 컨텍스트에 활용할 수 있습니다.",
      });
    } finally {
      setAnalyzing(null);
      setAnalyzingAll(false);
    }
  }

  const topByProduct = useMemo(() => {
    const result: Record<string, GoldenSnippet[]> = {};
    PRODUCTS.forEach((p) => {
      result[p] = snippets
        .filter((s) => s.product === p)
        .sort((a, b) => b.effectiveness - a.effectiveness)
        .slice(0, 3);
    });
    return result;
  }, [snippets]);

  return (
    <div className="p-3 sm:p-6 lg:p-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 sm:mb-8">
        <div>
          <h1 className="text-2xl font-bold text-foreground">핵심 멘트 라이브러리</h1>
          <p className="text-muted-foreground mt-1">효과적인 영업 멘트를 저장하고 AI 분석으로 활용도를 높이세요</p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex">
          <Button onClick={handleAnalyzeAll} disabled={analyzingAll || snippets.length === 0} variant="outline" className="min-h-11 w-full min-w-0 gap-1.5 px-2 text-xs sm:min-h-9 sm:gap-2 sm:px-4 sm:text-sm">
            {analyzingAll ? <Loader2 className="w-4 h-4 animate-spin" /> : <Brain className="w-4 h-4" />}
            {analyzingAll ? "전체 분석 중..." : "전체 분석"}
          </Button>
          <Button onClick={handleAutoGenerate} disabled={generating} variant="outline" className="min-h-11 w-full min-w-0 gap-1.5 px-2 text-xs sm:min-h-9 sm:gap-2 sm:px-4 sm:text-sm">
            {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
            {generating ? "생성 중..." : "AI 자동 생성"}
          </Button>
          <Button onClick={() => setShowForm(!showForm)} className="min-h-11 w-full min-w-0 gap-1.5 px-2 text-xs sm:min-h-9 sm:gap-2 sm:px-4 sm:text-sm">
            <Plus className="w-4 h-4" />
            멘트 추가
          </Button>
        </div>
      </div>

      {/* Add form */}
      {showForm && (
        <Card className="mb-6 border-primary/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2 text-primary">
              <Star className="w-4 h-4" />
              새 핵심 멘트 등록
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label>멘트 내용 *</Label>
              <Textarea
                placeholder='예: 페린젝트는 단 한 번의 주사로 체내 철분을 충분히 보충할 수 있어, 경구 철분제 복용이 어려운 환자에게 특히 효과적입니다.'
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={3}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>활용 상황/맥락</Label>
                <Input
                  placeholder="예: 가격 반박 시, 첫 처방 시..."
                  value={context}
                  onChange={(e) => setContext(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>관련 제품</Label>
                <div className="flex gap-2">
                  {PRODUCTS.map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setProduct(p)}
                      className={`flex-1 py-1.5 text-sm rounded-lg border-2 font-medium transition-all ${
                        product === p
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border text-muted-foreground"
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>효과도</Label>
              <StarRating value={effectiveness} onChange={setEffectiveness} />
            </div>

            <div className="space-y-2">
              <Label>태그</Label>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {TAG_SUGGESTIONS.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => !tags.includes(t) && setTags([...tags, t])}
                    className={`text-xs px-2.5 py-1 rounded-full border transition-all ${
                      tags.includes(t)
                        ? "bg-primary/10 border-primary text-primary"
                        : "border-border text-muted-foreground hover:border-primary/50"
                    }`}
                  >
                    # {t}
                  </button>
                ))}
              </div>
              {tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {tags.map((t) => (
                    <Badge key={t} variant="secondary" className="gap-1 pr-1">
                      {t}
                      <button onClick={() => setTags(tags.filter((x) => x !== t))}>
                        <X className="w-3 h-3 hover:text-destructive" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <Input
                  placeholder="태그 직접 입력..."
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addTag()}
                  className="flex-1"
                />
                <Button size="sm" variant="outline" onClick={addTag}>
                  <Plus className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>

            <div className="flex gap-2">
              <Button onClick={handleSave} disabled={!content.trim()} className="flex-1">
                저장
              </Button>
              <Button variant="outline" onClick={() => setShowForm(false)}>취소</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Search & filter */}
      <div className="sticky top-[69px] z-20 -mx-3 mb-5 flex flex-col gap-3 border-y bg-background/95 px-3 py-3 backdrop-blur sm:static sm:mx-0 sm:flex-row sm:border-0 sm:bg-transparent sm:px-0 sm:py-0">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="멘트 검색..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="min-h-11 pl-9"
          />
        </div>
        <div className="mobile-scroll-row sm:flex-wrap">
          <button
            onClick={() => setFilterProduct("")}
            className={`shrink-0 min-h-10 px-3 py-1.5 text-sm rounded-lg border-2 font-medium transition-all ${
              !filterProduct ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"
            }`}
          >
            전체
          </button>
          {PRODUCTS.map((p) => (
            <button
              key={p}
              onClick={() => setFilterProduct(filterProduct === p ? "" : p)}
              className={`shrink-0 min-h-10 px-3 py-1.5 text-sm rounded-lg border-2 font-medium transition-all ${
                filterProduct === p ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* Stats row */}
      {snippets.length > 0 && (
        <div className="mobile-scroll-row mb-5 sm:grid sm:grid-cols-3 sm:gap-3 sm:overflow-visible lg:grid-cols-4">
          {PRODUCTS.map((p) => (
            <div key={p} className="min-w-32 shrink-0 border rounded-lg p-3 sm:min-w-0">
              <p className="text-xs text-muted-foreground mb-1">{p}</p>
              <p className="text-2xl font-bold text-foreground">{topByProduct[p].length > 0 ? snippets.filter(s => s.product === p).length : 0}</p>
              <p className="text-xs text-muted-foreground">개 멘트</p>
            </div>
          ))}
        </div>
      )}

      {/* Snippet cards */}
      {filtered.length === 0 ? (
        <div className="text-center py-16">
          <BookOpen className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
          <p className="text-muted-foreground mb-4">
            {search || filterProduct ? "검색 결과가 없습니다" : "핵심 멘트를 추가하세요"}
          </p>
          {!search && !filterProduct && (
            <Button onClick={() => setShowForm(true)} variant="outline" className="gap-2">
              <Plus className="w-4 h-4" />
              첫 멘트 추가하기
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((snippet) => (
            <Card key={snippet.id} className="hover:shadow-md transition-shadow group">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <blockquote className="text-sm font-medium text-foreground mb-2 border-l-2 border-primary pl-3">
                      {snippet.content}
                    </blockquote>

                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <Badge variant={snippet.product === "위너프" || snippet.product === "위너프에이플러스" ? "default" : snippet.product === "페린젝트" ? "secondary" : "outline"} className="text-xs">
                        {snippet.product}
                      </Badge>
                      {snippet.context && (
                        <span className="text-xs text-muted-foreground">
                          <Tag className="w-3 h-3 inline mr-0.5" />
                          {snippet.context}
                        </span>
                      )}
                      <div className="flex text-amber-400 text-xs">
                        {"★".repeat(snippet.effectiveness)}
                        <span className="text-muted-foreground/30">{"★".repeat(5 - snippet.effectiveness)}</span>
                      </div>
                    </div>

                    {snippet.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {snippet.tags.map((t) => (
                          <span key={t} className="text-xs bg-muted px-2 py-0.5 rounded-full text-muted-foreground">
                            #{t}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* AI analysis result */}
                    {(analysisResult[snippet.id] || snippet.analysis) && (
                      <div className="mt-3 p-3 bg-primary/5 rounded-lg border border-primary/20">
                        <p className="text-xs font-semibold text-primary mb-1 flex items-center gap-1">
                          <Lightbulb className="w-3.5 h-3.5" />
                          AI 분석
                        </p>
                        <pre className="text-xs text-foreground whitespace-pre-wrap font-sans leading-relaxed">{analysisResult[snippet.id] || snippet.analysis}</pre>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col gap-1.5 flex-shrink-0">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleAnalyze(snippet)}
                      disabled={analyzing === snippet.id || analyzingAll}
                      className="gap-1 text-xs h-7"
                    >
                      {analyzing === snippet.id ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <Brain className="w-3 h-3" />
                      )}
                      분석
                    </Button>
                    <button
                      onClick={() => handleDelete(snippet.id)}
                      className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-all self-end"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
