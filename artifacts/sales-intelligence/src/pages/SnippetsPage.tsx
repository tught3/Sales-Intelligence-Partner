import { useState, useMemo } from "react";
import { snippetStorage, generateId, type GoldenSnippet } from "@/lib/storage";
import { analyzeSnippetEffectiveness } from "@/lib/ai";
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
} from "lucide-react";

const PRODUCTS = ["위너프", "페린젝트", "공통"];
const TAG_SUGGESTIONS = [
  "학구적 교수", "편의성 강조", "비용 이슈", "경쟁사 반박",
  "임상 데이터", "환자 경험", "초기 처방", "용량 조절",
];

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
  const [analysisResult, setAnalysisResult] = useState<Record<string, string>>({});

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
    snippetStorage.save(snippet);
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

  async function handleAnalyze(snippet: GoldenSnippet) {
    setAnalyzing(snippet.id);
    try {
      const res = await analyzeSnippetEffectiveness(snippet.content, snippet.product);
      setAnalysisResult((prev) => ({ ...prev, [snippet.id]: res }));
    } catch (e) {
      toast({ title: "분석 실패", description: String(e), variant: "destructive" });
    } finally {
      setAnalyzing(null);
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
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-foreground">핵심 멘트 라이브러리</h1>
          <p className="text-muted-foreground mt-1">효과적인 영업 멘트를 저장하고 AI 분석으로 활용도를 높이세요</p>
        </div>
        <Button onClick={() => setShowForm(!showForm)} className="gap-2">
          <Plus className="w-4 h-4" />
          멘트 추가
        </Button>
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
                placeholder='예: "페린젝트는 단 한 번의 주사로 체내 철분을 충분히 보충할 수 있어, 경구 철분제 복용이 어려운 환자에게 특히 효과적입니다."'
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={3}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
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
      <div className="flex gap-3 mb-5">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="멘트 검색..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setFilterProduct("")}
            className={`px-3 py-1.5 text-sm rounded-lg border-2 font-medium transition-all ${
              !filterProduct ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"
            }`}
          >
            전체
          </button>
          {PRODUCTS.map((p) => (
            <button
              key={p}
              onClick={() => setFilterProduct(filterProduct === p ? "" : p)}
              className={`px-3 py-1.5 text-sm rounded-lg border-2 font-medium transition-all ${
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
        <div className="grid grid-cols-3 gap-3 mb-5">
          {PRODUCTS.map((p) => (
            <div key={p} className="border rounded-lg p-3">
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
                      "{snippet.content}"
                    </blockquote>

                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <Badge variant={snippet.product === "위너프" ? "default" : snippet.product === "페린젝트" ? "secondary" : "outline"} className="text-xs">
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
                    {analysisResult[snippet.id] && (
                      <div className="mt-3 p-3 bg-primary/5 rounded-lg border border-primary/20">
                        <p className="text-xs font-semibold text-primary mb-1 flex items-center gap-1">
                          <Lightbulb className="w-3.5 h-3.5" />
                          AI 분석
                        </p>
                        <pre className="text-xs text-foreground whitespace-pre-wrap font-sans leading-relaxed">{analysisResult[snippet.id]}</pre>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col gap-1.5 flex-shrink-0">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleAnalyze(snippet)}
                      disabled={analyzing === snippet.id}
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
