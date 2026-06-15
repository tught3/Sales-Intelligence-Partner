import type { Doctor, VisitLog } from './storage';
import { manualStorage, snippetStorage, doctorStorage, visitLogStorage, preferenceStorage, externalCasePatternStorage, API_BASE, getConversationHistoryVisitCount, getDoctorVisitCount } from './storage';
import {
  buildExternalCasePromptInput,
  extractExternalCasePatternsFromText,
  mergeExternalCasePatterns,
  normalizeExternalCaseDepartment,
  normalizeExternalCaseProduct,
  type ExternalCasePatternDraft,
} from './externalCases';
import { runVisitGenerationPipeline } from './visit-generation/pipeline';
import { buildContext } from './visit-generation/context';
import { buildPlan, preCheckUniqueness } from './visit-generation/planner';
import { extractReactionKeys as extractVisitReactionKeys } from './visit-generation/detailKeys';
import { hasVisitLogProductLeak, hasVisitPlanLeak, sanitizeVisitLogBody, sanitizeNextStrategyText, stripBrokenFutureFragments, trimAfterReactionSentence } from './visit-generation/sanitizer';
import { finalizeVisitGenerationOutput } from './visit-generation/finalizer';
import type { DetailKey, VisitGenerationInput } from './visit-generation/types';

const OPENAI_DEFAULT_MODEL = 'gpt-5.4-mini';
const VISIT_LOG_MODEL = 'gpt-5.4-mini';
const DEFAULT_MAX_COMPLETION_TOKENS = 1000;
const VISIT_LOG_MAX_COMPLETION_TOKENS = 800;
const VISIT_GENERATION_PRODUCTS = ['위너프에이플러스', '페린젝트', '플라주OP'] as const;
const VISIT_GENERATION_PRODUCT_SET = new Set<string>(VISIT_GENERATION_PRODUCTS);
const MIN_VISIT_LOG_LENGTH = 100;
const MAX_VISIT_LOG_LENGTH = 230;

type AIRequestOptions = {
  temperature?: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
};

function buildVisitGenerationOptions(seedParts: string[]): AIRequestOptions {
  const seed = hashSeed(...seedParts);
  // 한국어 업무 메모 최적값: 낮은 temperature로 문장 안정성 확보, few-shot이 다양성 담당
  const temperature = 0.60 + (seed % 3) * 0.05; // 0.60~0.70
  const topP = 0.90;
  const frequencyPenalty = 0.25 + ((seed >> 3) % 3) * 0.05; // 0.25~0.35
  const presencePenalty = 0.15 + ((seed >> 5) % 3) * 0.05; // 0.15~0.25
  return {
    temperature: Number(temperature.toFixed(2)),
    topP,
    frequencyPenalty: Number(frequencyPenalty.toFixed(2)),
    presencePenalty: Number(presencePenalty.toFixed(2)),
  };
}

async function callAI(
  systemPrompt: string,
  userPrompt: string,
  model = OPENAI_DEFAULT_MODEL,
  maxCompletionTokens?: number,
  options: AIRequestOptions = {}
): Promise<string> {
  const completionTokens = maxCompletionTokens ?? DEFAULT_MAX_COMPLETION_TOKENS;

  async function request(requestModel: string): Promise<string> {
    const body: Record<string, unknown> = {
      model: requestModel,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      max_completion_tokens: completionTokens,
    };
    if (typeof options.temperature === 'number') body.temperature = options.temperature;
    if (typeof options.topP === 'number') body.top_p = options.topP;
    if (typeof options.frequencyPenalty === 'number') body.frequency_penalty = options.frequencyPenalty;
    if (typeof options.presencePenalty === 'number') body.presence_penalty = options.presencePenalty;

    const res = await fetch(`${API_BASE}/api/ai/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`AI 호출 실패(${requestModel}): ${err}`);
    }
    const data = await res.json() as { choices: { message: { content: string } }[] };
    return data.choices[0].message.content;
  }

  try {
    return await request(model);
  } catch (error) {
    throw error;
  }
}

async function callVisitLogAI(
  systemPrompt: string,
  userPrompt: string,
  options: AIRequestOptions = {}
): Promise<string> {
  return callAI(systemPrompt, userPrompt, VISIT_LOG_MODEL, VISIT_LOG_MAX_COMPLETION_TOKENS, options);
}

async function callAIWithImage(systemPrompt: string, textPrompt: string, imageBase64: string, mimeType: string): Promise<string> {
  const res = await fetch(`${API_BASE}/api/ai/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: OPENAI_DEFAULT_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: [
            { type: 'text', text: textPrompt },
            { type: 'image_url', image_url: { url: `data:${mimeType};base64,${imageBase64}` } },
          ],
        },
      ],
      max_completion_tokens: DEFAULT_MAX_COMPLETION_TOKENS,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`AI 이미지 분석 실패: ${err}`);
  }
  const data = await res.json() as { choices: { message: { content: string } }[] };
  return data.choices[0].message.content;
}

export async function extractTextFromImage(imageBase64: string, mimeType: string): Promise<string> {
  const system = `당신은 JW중외제약 MR 영업 비서 시스템의 한국어 문서 분석 AI입니다.
한국어 의약품/임상 자료 이미지에서 텍스트를 정확하게 추출합니다.
한글 한 글자도 임의로 변형하지 말 것.`;
  const prompt = `이 이미지를 매우 신중하게 읽고, 한국어 텍스트를 정확하게 추출해주세요.

★ 절대 규칙:
1. 한글을 절대로 임의로 추측/변형하지 말 것 (예: "혈장보다"를 "혈장염"으로 바꾸면 안 됨)
2. 의학 용어, 제품명, 화학 기호(Acetate, Lactate, Ca2+, Na+, pH 등)는 원문 그대로 보존
3. 글자가 불확실하면 추측하지 말고 [?] 로 표시할 것
4. 분류 라벨/카테고리 태그가 [대괄호] 안에 있으면 그 라벨은 출력에서 제거하고, 본문 내용만 추출할 것 (예: "[NS 대비] 플라주OP는..." → "플라주OP는...")
5. 같은 카테고리 라벨이 여러 줄에 반복되면 한 번만 카테고리 소제목으로 정리하거나 아예 빼고 본문만 정리
6. 표/리스트 구조는 그대로 유지
7. 추출한 텍스트 본문만 출력 (서두 설명, "다음과 같이 추출했습니다" 같은 말 일절 금지)`;
  return callAIWithImage(system, prompt, imageBase64, mimeType);
}

export async function mergeAdditionalFeatures(
  existingContent: string,
  additionalNotes: string,
  productName: string,
): Promise<string> {
  const system = `당신은 JW중외제약 MR 영업 비서 시스템의 제품 정보 통합 AI입니다.
영업사원이 추가로 입력한 특장점/메모를 기존 제품 정보 매뉴얼에 자연스럽게 통합하여
실무에서 바로 활용할 수 있는 깔끔한 매뉴얼로 재작성합니다.`;

  const prompt = `[제품명]: ${productName}

다음은 ${productName}의 기존 제품 정보 매뉴얼입니다:
==== 기존 매뉴얼 시작 ====
${existingContent}
==== 기존 매뉴얼 끝 ====

다음은 영업사원이 추가로 입력한 새로운 특장점/메모/현장 정보입니다 (구조 없는 raw text):
==== 추가 입력 시작 ====
${additionalNotes}
==== 추가 입력 끝 ====

위 두 자료를 통합하여 하나의 깔끔한 제품 정보 매뉴얼로 재작성해주세요.

⭐ 가장 중요한 원칙 (회사 방침):
"추가 입력" 내용은 영업사원/회사가 직접 검증한 1차 자료이며,
"기존 매뉴얼"보다 우선순위가 더 높습니다. 회사가 원하는 영업 방향을 반영하므로
더 비중 있게, 더 앞쪽에, 더 구체적으로 다뤄야 합니다.

반드시 지킬 규칙:
1. 기존 매뉴얼의 구조(■ 섹션 헤더, 【】 소제목 형태)를 그대로 유지할 것
2. 기존 매뉴얼의 모든 핵심 정보를 절대 누락하지 말 것 (정보 손실 금지)
3. 【추가 입력 우선 처리 규칙】
   - 추가 입력에서 나온 특장점/디테일은 해당 섹션의 "맨 앞"에 배치
   - 추가 입력 내용은 축약하지 말고 디테일을 살려서 풍부하게 서술
   - 기존 매뉴얼의 일반론보다 추가 입력의 구체적/현장적 표현을 우선 사용
   - ★, ◎, ◆ 같은 별도의 강조 마크/이모지를 임의로 붙이지 말 것 (기존 매뉴얼에 이미 있는 ■, 【】 같은 구조 기호만 그대로 유지)
4. 추가 입력 내용을 적절한 섹션에 자연스럽게 녹여낼 것
   - 특장점성 내용 → 【제품 핵심 강조점】 섹션 맨 앞에 항목 추가
   - 임상 데이터/논문 → 【임상 근거】 또는 【임상 데이터】 섹션 맨 앞
   - 경쟁사 비교 → 【경쟁 우위】 섹션 맨 앞
   - 영업 화법/현장 팁 → 【핵심 어필 화법】 또는 【주요 처방 시나리오】 맨 앞
   - 주의사항 → 【주의사항】
   - 적합한 섹션이 없으면 새 섹션을 추가해도 됨
5. 추가 입력과 기존 매뉴얼이 충돌/모순되면 → 추가 입력을 정답으로 채택하고 기존 내용을 수정
6. 중복되는 내용은 추가 입력 표현을 살리는 방향으로 통합 (같은 말 반복 금지)
7. 추가 입력의 사실 정보를 임의로 변형/축소/일반화하지 말 것
8. 영업사원이 즉시 활용 가능한 명확하고 구체적인 문장으로
9. 추가 입력 텍스트 안의 [대괄호 안 분류 라벨/카테고리 태그] 형태(예: [NS 대비], [하트만 스위칭 콜플랜], [혈장 유사 조성])는 그대로 옮겨 적지 말 것. 같은 카테고리 라벨이 반복되면 한 번만 소제목으로 정리하거나, 본문 내용만 자연스럽게 풀어서 통합할 것
10. OCR 추출 텍스트라서 깨진 글자/오탈자가 있을 수 있음. 의학적으로/맥락상 명백히 말이 안 되는 경우는 추가 입력에 의존하지 말고, 기존 매뉴얼의 정확한 표현을 우선 신뢰할 것 (단 추측해서 새로 만들지는 말 것)
11. 통합된 매뉴얼 본문만 출력 (서두 설명, 마무리 멘트 없이)`;

  return callAI(system, prompt);
}

export async function reformatAsCompanyRule(rawText: string, category: string): Promise<string> {
  const categoryLabel = category === 'rule' ? '회사 규칙/영업 지침' : category === 'product' ? '제품 정보' : '기타 매뉴얼';
  const system = `당신은 JW중외제약 MR 영업 비서 시스템의 문서 정리 AI입니다.
주어진 텍스트를 ${categoryLabel} 매뉴얼 형식으로 깔끔하게 재작성합니다.`;
  const prompt = `아래 내용을 ${categoryLabel} 매뉴얼로 재작성해주세요.

규칙:
- 핵심 내용을 항목별로 정리 (글머리 기호 또는 번호 사용)
- 영업사원이 실무에서 바로 활용할 수 있도록 명확하게
- 불필요한 반복 제거, 중요한 내용은 강조
- 원본 내용을 임의로 추가하거나 변형하지 말 것
- 재작성한 내용만 출력 (설명 없이)

원본 내용:
---
${rawText}
---`;
  return callAI(system, prompt);
}

export async function analyzeExternalCasePatterns(rawText: string): Promise<ExternalCasePatternDraft[]> {
  const ruleDrafts = extractExternalCasePatternsFromText(rawText);
  const cleanedInput = buildExternalCasePromptInput(rawText);
  const system = `당신은 JW중외제약 MR 방문일지 사례를 구조화하는 분석 AI입니다.
원문 문장을 베끼지 말고 진료과, 품목, 환자군, 디테일 포인트, 교수 반응, 다음 액션만 추출합니다.
병원명, 교수명, 번호, 금액, 심포지엄, 학회, 제품설명회, 모객, 참석, 서베이는 저장 대상이 아닙니다.`;
  const prompt = `아래 방문일지 모음은 다른 병원/다른 교수 사례가 섞인 지저분한 참고 자료입니다.
그대로 요약하지 말고, 우리 자동생성에 쓸 수 있는 "진료과별 제품 디테일 패턴"만 JSON 배열로 추출하세요.

규칙:
- 원문 문장 복사 금지. 내용 의미만 짧게 재구성.
- department가 불명확하거나 제품 디테일이 없는 항목은 제외.
- product는 위너프에이플러스 또는 페린젝트만 허용.
- 위너프, 위너프 241, 위너프 1438, 위너프f는 자동생성 재료에서는 위너프에이플러스로 정규화.
- 페리 제형은 페린젝트가 아니라 말초정맥영양 제형 문맥이므로 페린젝트로 오인하지 말 것.
- 병원명, 교수명, 금액, 일정, 심포지엄, 학회, 제품설명회, 모객, 참석 여부, 서베이는 버리고 환자군/디테일/반응만 남길 것.
- HER story/캠페인은 그대로 저장하지 말고 산부인과 철결핍/산후 빈혈/수술 전후 빈혈 패턴으로만 바꿀 것.
- 각 항목 필드: department, product, patientGroup, detailAxis, reactionPattern, nextAction, sourceSummary, styleExampleMemo, confidence
- confidence는 0-100 정수.
- JSON 배열만 출력.

예시 입력:
종양내과 암환자는 햅시딘이 높아 경구용철분제 흡수가 잘 안 되고 GI 트러블도 있어 페린젝트를 설명함

예시 출력:
[{"department":"종양내과","product":"페린젝트","patientGroup":"항암치료 중 햅시딘 상승과 경구용철분제 흡수 저하로 빈혈 조절이 어려운 환자","detailAxis":"페린젝트의 1회 투여와 Hb 회복 근거","reactionPattern":"경구용철분제로 회복이 더딘 암환자에서는 차트로 보겠다는 의견","nextAction":"항암 전후 빈혈에서 급여 기준과 처방 경험 확인","sourceSummary":"종양내과 암환자 빈혈에서 경구용철분제 한계와 페린젝트 활용 포인트 추출","styleExampleMemo":"페린젝트 1회 투여와 Hb 회복 근거를 항암치료 중 빈혈 환자 상황에 맞춰 말씀드림. 교수님께서 경구용철분제로 회복이 더딘 환자는 차트로 보겠다는 의견 보임","confidence":86}]

전처리된 후보 원문:
${cleanedInput}`;

  try {
    const res = await callVisitLogAI(system, prompt);
    const json = res.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim();
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed)) return ruleDrafts;
    const aiDrafts = parsed
      .map((item): ExternalCasePatternDraft => ({
        department: normalizeExternalCaseDepartment(String(item.department ?? '')),
        product: normalizeExternalCaseProduct(String(item.product ?? '')),
        patientGroup: String(item.patientGroup ?? '').trim(),
        detailAxis: String(item.detailAxis ?? '').trim(),
        reactionPattern: String(item.reactionPattern ?? '').trim(),
        nextAction: String(item.nextAction ?? '').trim(),
        sourceSummary: String(item.sourceSummary ?? '').trim(),
        styleExampleMemo: String(item.styleExampleMemo ?? '').trim(),
        confidence: Math.max(0, Math.min(100, Number(item.confidence ?? 60) || 60)),
      }))
      .filter((item) => item.department && item.product && item.patientGroup && item.detailAxis);
    return mergeExternalCasePatterns(aiDrafts, ruleDrafts);
  } catch {
    return ruleDrafts;
  }
}

function buildSystemPrompt(): string {
  const ruleText = manualStorage.getByCategory('rule')
    .map((m) => `[${m.title}]\n${m.content}`)
    .join('\n\n---\n\n');
  const productText = manualStorage.getByCategory('product')
    .map((m) => `[${m.title}]\n${m.content}`)
    .join('\n\n---\n\n');
  const otherText = manualStorage.getByCategory('other')
    .map((m) => `[${m.title}]\n${m.content}`)
    .join('\n\n---\n\n');
  const base = `당신은 JW중외제약 MR(의약품 영업사원)의 영업 비서입니다.
아래 ===제품 정보===를 1차 참고 자료로 삼을 것. 제품 세부 스펙·임상 근거·경쟁 우위는 해당 섹션에 있음.

중요 원칙:
- 회사 규칙과 매뉴얼이 제품 설명보다 우선
- 결과물은 실무 메모처럼 간결하고 구체적으로 쓸 것
- 응답은 자연스러운 한국어, 영업사원이 실제 쓰는 말투로
- 교수/의사 성향, 병원 특성, 과 특성, 과거 대화 맥락 반드시 반영
- JW중외제약 제품 강점은 자연스럽게 녹여낼 것
- ★ 큰따옴표(")와 작은따옴표(') 절대 금지. 강조는 따옴표 없이
- 페린젝트: 반드시 1회 투여로 표기 (단회투여 금지)
- 위너프와 위너프에이플러스는 구분해서 표기. 같은 제품이라도 디테일 축과 환자군을 섞지 말고, 제품별 특장점은 서로 다른 각도로 쓰기
- 방문일지 본문 230자 이내, 다음 방문 전략은 실무적으로`;

  let prompt = base;

  if (ruleText) {
    prompt += `\n\n===회사 규칙 (최우선)===\n${ruleText}`;
  }

  if (productText) {
    prompt += `\n\n===제품 정보===\n${productText}`;
  }

  if (otherText) {
    prompt += `\n\n===기타 매뉴얼===\n${otherText}`;
  }

  return prompt;
}

function buildSimpleSystemPrompt(): string {
  const ruleText = manualStorage.getByCategory('rule')
    .map((m) => `[${m.title}]\n${m.content}`)
    .join('\n\n---\n\n');
  const productText = manualStorage.getByCategory('product')
    .map((m) => `[${m.title}]\n${m.content}`)
    .join('\n\n---\n\n');

  const base = `JW중외제약 MR 영업 비서. 현장 메모처럼 자연스러운 한국어로 작성.
종결 어미: ~함/~보임/~하심/~예정/~드림. 큰따옴표(") 작은따옴표(') 절대 금지.
주어(MR이/나는/저는) 생략, 서술어로만 작성.`;

  let prompt = base;

  if (ruleText) {
    prompt += `\n\n===회사 규칙 (최우선)===\n${ruleText}`;
  }

  if (productText) {
    prompt += `\n\n===제품 정보===\n${productText}`;
  }

  return prompt;
}

async function buildGoldenFewShot(department: string, allowedProducts: string[]): Promise<string> {
  // 외부사례 styleExampleMemo를 우선 소스로 사용 (이미 검수된 실전 메모)
  const externalExamples = externalCasePatternStorage
    .getForGeneration(department, allowedProducts)
    .filter((p) => p.styleExampleMemo?.trim() && allowedProducts.includes(p.product))
    .slice(0, 6)
    .map((p) => ({ content: p.styleExampleMemo.trim(), product: p.product }));

  // 사용자가 별표한 골든 스니펫으로 보충
  const goldenExamples = await snippetStorage.getGoldenForGeneration(department, allowedProducts);

  const combined = [...externalExamples, ...goldenExamples].slice(0, 8);
  if (combined.length === 0) return '';

  const lines = combined
    .map((e, i) => `예시${i + 1}: ${e.content}`)
    .join('\n');

  return `=== 잘 쓴 일지 예시 (이 말투·길이·구성 그대로) ===\n${lines}`;
}

function buildSnippetContext(department = ''): string {
  const allSnippets = snippetStorage.getAll();
  if (allSnippets.length === 0) return '';

  const isIcu = department && isIcuDepartment(department);
  const allowedProducts = getAllowedProductsForDepartment(department);
  const departmentSnippets = allSnippets.filter(s => allowedProducts.includes(s.product));
  const usableSnippets = isIcu ? departmentSnippets : departmentSnippets.filter(s => !isIcuOnlySnippet(s));
  if (usableSnippets.length === 0) return '';
  let selected;
  if (isIcu) {
    const icuOnes = usableSnippets.filter(s =>
      hasIcuContext(s.content, s.context)
    );
    const others = usableSnippets.filter(s =>
      !hasIcuContext(s.content, s.context)
    );
    const icuPicked = [...icuOnes].sort(() => Math.random() - 0.5).slice(0, 5);
    const otherPicked = [...others].sort(() => Math.random() - 0.5).slice(0, 4);
    selected = [...icuPicked, ...otherPicked].sort(() => Math.random() - 0.5);
  } else {
    selected = [...usableSnippets].sort(() => Math.random() - 0.5).slice(0, 9);
  }

  const lines = selected
    .map((s) => formatSnippetForPrompt(s))
    .join('\n');
  return `\n활용 가능한 핵심 멘트 (오늘 과/맥락에 맞는 것을 골라 원문 복붙이 아니라 변형해서 사용):\n${lines}\n`;
}

function summarizeSnippetAnalysis(analysis = ''): string {
  return analysis
    .replace(/\s+/g, ' ')
    .replace(/["']/g, '')
    .trim()
    .slice(0, 260);
}

function formatSnippetForPrompt(s: ReturnType<typeof snippetStorage.getAll>[number]): string {
  const parts = [`- [${s.product}] ${s.content}`];
  if (s.context) parts.push(`상황: ${s.context}`);
  const analysis = summarizeSnippetAnalysis(s.analysis);
  if (analysis) parts.push(`분석 활용: ${analysis}`);
  return parts.join(' / ');
}

function getSnippetKeywords(text: string): string[] {
  const normalized = text
    .replace(/[^\p{L}\p{N}%]+/gu, ' ')
    .split(/\s+/)
    .map((word) => word.trim())
    .filter((word) => word.length >= 2);
  const important = normalized.filter((word) =>
    /[0-9%]/.test(word) ||
    /아미노산|포도당|오메가|질소|단백|고함량|저인산|철결핍|빈혈|수혈|외래|내원|급여|혈색소|Hb|페리틴|통증|진통|해열|수술|회복|감염|항생|균형|수액|락테이트|마그네슘|세덱스|진정|호흡|ICU|중환|패혈/i.test(word)
  );
  return [...new Set(important)].slice(0, 10);
}

function buildRecentDetailMemory(pastLogs: VisitLog[]): string {
  const recentText = pastLogs
    .slice(0, 12)
    .map((log) => `${log.formattedLog} ${log.nextStrategy ?? ''}`)
    .join(' ');
  const keywords = getSnippetKeywords(recentText);
  const detailKeys = extractDetailKeys(recentText);
  if (keywords.length === 0 && detailKeys.length === 0) return '';

  return `\n★★★ 최근 사용한 디테일:
- 최근에 이미 쓴 키워드: ${keywords.join(', ') || '없음'}
- 최근에 이미 쓴 디테일 축: ${detailKeys.join(', ') || '없음'}
- 위 키워드/디테일 축과 같은 내용은 반복하지 말고, 아래 핵심멘트 후보 중 다른 디테일을 우선 사용할 것
- 최근 방문과 같은 수치/근거/환자군/오브젝션 흐름으로 돌아가지 말 것\n`;
}

function buildPreviousStrategyCarryoverNote(
  pastLogs: VisitLog[],
  activeProducts: string[],
  department: string
): string {
  if (Math.random() >= 0.5) return '';
  const latestStrategy = pastLogs[0]?.nextStrategy?.trim();
  if (!latestStrategy) return '';

  const normalizedStrategy = normalizeNextStrategy(latestStrategy, department)
    .replace(/^다음방문시에는\s*/g, '')
    .trim();
  if (!normalizedStrategy || normalizedStrategy.length < 8) return '';

  const allowedProducts = activeProducts.length > 0 ? activeProducts : getAllowedProductsForDepartment(department);
  const relatedProducts = allowedProducts.filter((product) => normalizedStrategy.includes(product));
  if (relatedProducts.length === 0 && !/급여|재\s*디테일|재디테일|처방|반응|확인|빈혈|철분|Hb|아미노산|포도당|영양/.test(normalizedStrategy)) {
    return '';
  }

  return `\n★★★ 이전 다음방문전략 연결 후보:
- 가장 최근 기록의 다음방문전략: ${normalizedStrategy.slice(0, 140)}
- 이번 일지는 지난 전략을 복붙하지 말고, 같은 제품이면 다른 디테일 축으로 바꿔 쓰세요. 가능하면 다른 품목으로 전환하고, 전환이 불가하면 환자군·상황·근거 중 하나를 확실히 바꿔 주세요.
- 본문에는 "다음방문시에는", "다음 방문에는" 같은 계획 문구를 직접 넣지 말고, 이번 방문에서 실행한 내용으로 바꿔 쓰세요.
- 권장 흐름: 지난 방문에 어떤 디테일을 설명드렸는지 -> 교수님께서 무엇을 기준으로 반응하셨는지 -> 오늘은 그와 다른 각도의 디테일을 이어가기.
- 절대 금지: "실제 처방 여부", "실제 처방 흐름", "실제 적용 가능 상황", "차트상 조건"처럼 뜻만 같은 말로 돌려막기.
- 올바른 형식 예: "지난 방문에 페린젝트 1회 투여와 Hb 회복 근거를 설명드렸고, 교수님께서 경구용철분제 반응이 더딘 환자부터 보겠다고 하심. 오늘은 GI 트러블 있는 환자 전환 가능성을 확인함"
- 올바른 형식 예: "지난 방문에 위너프에이플러스 단백 보충을 설명드렸고, 교수님께서 수술 후 회복기 환자에서 볼 만하다고 하심. 오늘은 혈관 통증이나 삼투압 비교를 이어서 확인함"
- 부정적 반응을 만들 때는 이유까지 같이 쓰세요. 예: "교수님께서 비용 부담으로 외래 적용은 제한적이라고 하심. 급여 기준에 맞는 철결핍 빈혈 케이스부터 보시면 된다고 안내함"
- 처방을 직접 늘려달라는 표현 대신, "다른 환자군", "다른 적용 상황", "다른 특장점"처럼 구체적으로 바꿔 마무리하세요.
- 모순되거나 과와 맞지 않으면 억지로 이어 쓰지 말고 오늘 과에 맞는 다른 디테일로 전환하세요.\n`;
}

function snippetOverlapScore(snippet: ReturnType<typeof snippetStorage.getAll>[number], recentTexts: string[]): number {
  const content = `${snippet.content} ${snippet.context ?? ''}`.toLowerCase();
  const keywords = getSnippetKeywords(content);
  const keywordHits = keywords.filter((keyword) =>
    recentTexts.some((text) => text.includes(keyword.toLowerCase()))
  ).length;
  const phrase = snippet.content.replace(/\s+/g, ' ').slice(0, 28).toLowerCase();
  const phraseHit = phrase.length >= 12 && recentTexts.some((text) => text.includes(phrase)) ? 4 : 0;
  const analyzedFreshnessBonus = (snippet.analysis ?? '').trim().length > 0 ? -0.25 : 0;
  return keywordHits + phraseHit + analyzedFreshnessBonus;
}

function buildContextAwareSnippets(
  pastLogs: VisitLog[],
  selectedProducts: string[] = [],
  count = 8,
  department = ''
): string {
  const allSnippets = selectedProducts.length > 0
    ? snippetStorage.getAll().filter(s => normalizeSelectedProductsForDepartment(selectedProducts, department).includes(s.product))
    : snippetStorage.getAll();
  const isIcu = department && isIcuDepartment(department);
  const allowedProducts = getAllowedProductsForDepartment(department);
  const departmentSnippets = allSnippets.filter(s => allowedProducts.includes(s.product));
  const usableSnippets = isIcu ? departmentSnippets : departmentSnippets.filter(s => !isIcuOnlySnippet(s));
  if (usableSnippets.length === 0) return '';

  // 최근 방문 일지+다음전략 텍스트를 넓게 보고, 같은 디테일 재사용을 뒤로 보낸다.
  const recentTexts = pastLogs.slice(0, 16)
    .map(l => `${l.formattedLog} ${l.nextStrategy ?? ''}`.toLowerCase());

  const shuffle = <T>(arr: T[]) => [...arr].sort(() => Math.random() - 0.5);
  const sortByFreshness = (pool: typeof allSnippets) =>
    shuffle(pool).sort((a, b) => snippetOverlapScore(a, recentTexts) - snippetOverlapScore(b, recentTexts));
  const notUsed = (s: typeof allSnippets[number]) => snippetOverlapScore(s, recentTexts) === 0;
  const wasUsed = (s: typeof allSnippets[number]) => snippetOverlapScore(s, recentTexts) > 0;

  // ICU 과인 경우: ICU 스니펫 ~60% + 일반 ~40% 비율로 선택
  if (isIcu) {
    const icuOnes = usableSnippets.filter(s =>
      hasIcuContext(s.content, s.context)
    );
    const others = usableSnippets.filter(s =>
      !hasIcuContext(s.content, s.context)
    );
    const icuCount = Math.ceil(count * 0.6);
    const generalCount = count - icuCount;

    const selectedIcu = [...sortByFreshness(icuOnes.filter(notUsed)), ...sortByFreshness(icuOnes.filter(wasUsed))].slice(0, icuCount);
    const selectedGen = [...sortByFreshness(others.filter(notUsed)), ...sortByFreshness(others.filter(wasUsed))].slice(0, generalCount);
    const selected = shuffle([...selectedIcu, ...selectedGen]);
    return selected
      .map(s => `  ${formatSnippetForPrompt(s)}`)
      .join('\n');
  }

  // 일반 과: 과별 주력 제품 우선, 그 외 제품은 보조
  const { primary, secondary } = getDeptFocusProducts(department);
  const allProducts = [...primary, ...secondary];

  // 선택된 스니펫 풀: primary 제품 우선, secondary 그 다음, 나머지는 뒤로
  const primarySnippets = usableSnippets.filter(s => primary.includes(s.product));
  const secondarySnippets = usableSnippets.filter(s => secondary.includes(s.product));
  const otherSnippets = allProducts.length > 0
    ? usableSnippets.filter(s => !allProducts.includes(s.product))
    : [];

  // 각 그룹 내에서 미사용 우선 셔플
  const pickFrom = (pool: typeof allSnippets) => [
    ...sortByFreshness(pool.filter(notUsed)),
    ...sortByFreshness(pool.filter(wasUsed)),
  ];

  // primary가 지나치게 후보를 독점하지 않게 하고, 보조 제품/기타 후보도 조금 열어둔다.
  const primaryCount = Math.ceil(count * 0.5);
  const secondaryCount = secondary.length > 0 ? Math.min(2, count - primaryCount) : 0;
  const otherCount = count - primaryCount - secondaryCount;

  const selected = [
    ...pickFrom(primarySnippets).slice(0, primaryCount),
    ...pickFrom(secondarySnippets).slice(0, secondaryCount),
    ...pickFrom(otherSnippets).slice(0, otherCount),
  ];
  return selected
    .map(s => `  ${formatSnippetForPrompt(s)}`)
    .join('\n');
}

function buildUserMemoStyleSection(): string {
  const recentLogs = visitLogStorage.getRecent(30);
  const styleExamples = recentLogs
    .map((log) => reducePointWordUsage(log.formattedLog?.trim() || log.rawNotes?.trim() || ''))
    .filter((text) => text.length > 30)
    .filter((text) => text.length <= 300)
    .filter((text) => !/분석|정리하면|전반적으로|프로토콜|보고서|첫 방문|데이터중시|보수적 성향|겠습니다|포인트/.test(text))
    .slice(0, 6);

  if (styleExamples.length === 0) return '';

  return `[실제 작성된 방문일지 예시 - 이 말투/어미/형식으로 작성]
${styleExamples.map((text, i) => `예시${i + 1}: ${text}`).join('\n')}`;
}

function buildVisitLogRules(): string {
  return `━━━ 작성 규칙 ━━━
말투: ~함, ~보임, ~있음, ~확인함, ~드림 형태로만 종결
금지 어미: ~겠습니다, ~했습니다, ~합니다, ~입니다, ~드립니다 (어떤 형태든 금지)
금지 기호: 중간점(·), 불릿(•), 화살표(↑↓→←), 물결표 2개 연속(~~) 모두 금지. 증감은 "증가", "감소"로, 문장 구분은 콤마(,)만
금지 표현: 짚음, 언급함, 설명함 → 대신 "디테일함", "말씀드렸더니" 사용
금지 표현: ~흐름으로 정리함, ~흐름이어서, ~흐름으로, 정리함, 다시 봄, 다시 말씀드림 → 절대 금지. 대신 "말씀드렸더니", "디테일했더니" 사용
금지 표현: 제품 내용, 특장점 반응 확인, 반응 확인 요청, 특장점 반응 확인 요청, 요청 드림, 특장점 디테일 진행, 교수님께서 메모
금지 표현: "~중심으로 정리함", "~환자 흐름으로 정리함", "~흐름으로 정리함" — 금지. 대신 "~말씀드렸더니", "~디테일했더니" 사용
금지 표현: "추가로" — 문서체이므로 절대 금지. 이어서 자연스럽게 쓸 것
금지 표현: "교수님께서 보임" 단독 문장 — 불완전 문장 금지. 반드시 "교수님께서 [구체적 반응] 보임" 형태로 완성
과별 특장점: 해당 과와 직접 연결되는 환자군/상황만 사용. 다른 과 전용 질환명은 절대 쓰지 말 것. 같은 문장에 비슷한 테마를 두 개 이상 라벨처럼 이어 붙이지 말 것
페린젝트: 반드시 "1회 투여"로만 표기 (단회투여, 단회 투여 모두 금지)
철분제 표현: 경구 철분, 경구 철분제, 경구용 철분제, 경구용철분제제, 경구용철분제제제, 먹는 철분제, oral iron, PO iron 등 경구 복용 철분제를 뜻하는 표현은 반드시 "경구용철분제"로 통일
제품명: 제품 특장점 문장에는 반드시 제품명을 함께 쓸 것. 예: "제품명 없이 성분만 쓰는 문장" 금지, "위너프에이플러스의 실제 강점"처럼 제품명을 앞에 두어 작성
제품 집중: 본문에는 오늘의 중심 품목 1개만 사용. 다른 제품명은 본문에 넣지 말고, 비교가 필요하면 다음방문전략에만 적을 것
디테일 내용: 무엇을 말했는지 구체적으로 적고, 제품명과 환자 맥락을 함께 써야 함. 내용 없는 라벨형 문장 금지
교수 반응: 반응을 쓸 때는 교수님께서 보인 실제 의견 형태로만 작성. 반응을 교수에게 요청하는 문장 금지
교수 성향/처방 경향: 텍스트 직접 서술 금지, 어조에만 반영
형식: 보고서체, 설명문, 교육자료체 금지. 현장에서 적은 메모처럼
글자수: 본문 100자 이상 230자 이내 / 다음방문전략 120자 이내
다음방문전략: 다음 방문에서 할 액션을 딱 1개만 쓰고, 가능하면 오늘과 다른 품목으로 전환, 불가하면 오늘과 다른 디테일 축으로 마무리할 것. 끝은 "~할예정"으로 자연스럽게 끝낼 것
본문 금지: 다음 방문 계획, 다음엔/다음번에는/다음방문시에는 시작 문장, 다음 전략형 표현(예정/볼 예정/확인할 예정)은 본문에 넣지 말 것
본문 종료: 교수님 반응이 한 번 나오면 그 문장에서 끝내고, 그 뒤에 안내문이나 확인문을 추가로 붙이지 말 것
본문 종결: 영업일지 본문에는 다음 방문 계획을 넣지 말 것. "다음 방문에는", "다음번에는", "다음방문시에는" 문장은 다음방문전략에만 작성
미도입 제품: 대부분은 실제 제품 근거/환자군 디테일만 쓰고, 10% 정도만 본문 중 "신약여부검토 요청"을 1회 넣을 것. 증량/증액/처방 늘려달라/지속 처방 부탁 표현 금지
따옴표: 큰따옴표("), 작은따옴표(') 절대 금지`;
}

function buildVisitLogFlow(): string {
  return `━━━ 일지 흐름 (이 순서로 자연스럽게 이어서 작성) ━━━
① [이전 연결 - 선택] 지난 방문 기록에서 실제로 이어 확인할 내용이 있을 때만 사용. 있으면 확인 결과나 교수 반응까지 한 번에 마무리.
② [오늘 핵심] MR(나)은 제품의 특장점을 쉽게 설명. 교수님은 환자군이나 임상 상황을 언급하며 반응하거나 질문함.
   ★ 역할 구분 필수:
   - MR(나): "~특장점 설명드렸더니", "~장점 말씀드렸더니" — 쉬운 제품 언어. 복잡한 수술명·병명 직접 언급 금지.
   - 교수님: "수술 후 환자에게 써볼 수 있겠다", "이런 경우에도 되냐?" — 환자군·임상 상황은 교수가 언급.
   ★ 좋은 예: "위너프에이플러스 단백 보충 빠른 장점 설명드렸더니 수술 후 환자 있으면 써보겠다 하심"
   ★ 나쁜 예: "위너프에이플러스의 복강 내 감염 회복기 단백 보충을 복막염 후 환자와 연결해 디테일함" (MR이 교수 말투)
   ★ 제품 제한: 본문은 오늘 중심 품목 1개만 사용. 다른 제품명은 넣지 말 것.
   ★ 종료 규칙: 교수님 반응이 한 번 나오면 본문은 거기서 끝낸다. 뒤에 안내문을 덧붙이지 말 것.
③ [오브젝션 핸들링] 30% 확률로 포함. 포함 시 교수님께서 하신 질문/반대 의견과 그에 대한 답변을 함께 작성. 반응이 나오면 본문은 그 문장에서 끝내고 뒤에 안내문을 붙이지 말 것.
④ [교수 반응] 교수 반응은 한 줄로만 정리.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;
}

function buildObjectionInstruction(includeObjection: boolean, department: string, products: string[]): string {
  if (!includeObjection) {
    return `\n★ 오브젝션 핸들링: 이번 일지에서는 생략. 질문/반대 의견을 새로 만들지 말 것.\n`;
  }

  return `\n★★★ 오브젝션 핸들링 필수:
- 순서: 먼저 제품 설명 → 교수님께서 질문/반대의견 → 답변. 이 순서로만 작성.
- 주어(MR이, 나는, 저는) 없이 서술어로만 작성.
- 교수님이 먼저 제품 특장점을 꺼내거나 설명하며 질문을 시작하는 구조 절대 금지.
- 이번 일지에는 교수님께서 하신 질문 또는 반대 의견 1개를 반드시 포함.
- 이어서 그 질문/반대 의견에 대한 내 답변도 반드시 포함.
- 과(${department})와 품목(${products.join(', ')})에 현실적으로 맞는 내용만 사용.
- 형식 예: [MR 설명] 페린젝트 1회 투여 장점 말씀드렸더니 [교수 질문] 급여 기준에 맞는 환자가 있냐고 하심. [MR 답변] 철결핍 빈혈 Hb 기준 충족 케이스부터 말씀드림.
- 교수님 문장 시작은 반드시 교수님께서 로 시작하고, 교수는 / 교수님은 / 교수는 말씀하심 같은 시작은 쓰지 말 것.
- 위너프에이플러스를 디테일하는 경우 기존 비교 대상은 위너프 또는 기존 3챔버 TPN이어야 하며, 위너프에이플러스 자체와 비교하지 말 것.
- 본문에는 오늘 품목 1개만 사용하고, 다른 제품명이나 다음 방문 계획은 넣지 말 것.
- 오브젝션과 답변을 포함해도 영업일지 본문 전체는 반드시 230자 이내.\n`;
}

function hasObjectionHandling(text: string): boolean {
  const hasObjection = /질문|문의|우려|부담|반대|어렵|비싸|필요.*없|굳이|라고\s*하심|말씀하심/.test(text);
  const hasAnswer = /안내함|말씀드림|답변드림|전달함|공감하심|납득하심/.test(text);
  const hasRespectfulSpeaker = /교수님께서/.test(text);
  return hasObjection && hasAnswer && hasRespectfulSpeaker;
}

function normalizeObjectionLanguage(text: string, activeProducts: string[] = []): string {
  const requiresWinufContrast = activeProducts.includes('위너프에이플러스');
  const objectionCue = /라고\s*하심|말씀|질문|문의|반대|우려|부담|비싸|어렵|필요|굳이|비교|차이|공감|납득|없다고|있다고|괜찮다고/;

  return text
    .split(/(?<=[.。!?])\s+|\n+/)
    .map((sentence) => {
      let result = sentence.trim();
      if (!result) return result;

      const hasProfessorStart = /^교수(?:님)?\s*(?:께서는|께서|은|는|이|가)?\s*/.test(result);
      if (hasProfessorStart && objectionCue.test(result)) {
        result = result.replace(/^교수(?:님)?\s*(?:께서는|께서|은|는|이|가)?\s*/, '교수님께서 ');
      }

      if (requiresWinufContrast) {
        result = result
          .replace(/기존\s*위너프에이플러스\s*(?:와|와의|랑|하고)?/gi, '기존 위너프와')
          .replace(/위너프에이플러스\s*(?:와|와의|랑|하고)?\s*실제\s*차이/gi, '위너프와의 차이')
          .replace(/위너프에이플러스\s*비교/gi, '위너프와 비교');
      }

      return result.replace(/\s{2,}/g, ' ').trim();
    })
    .join(' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function normalizeOralIronTerminology(text: string): string {
  return text
    .replace(/\b(?:oral|p\.?\s*o\.?)\s*(?:iron|fe)\b/gi, '경구용철분제')
    .replace(/먹는\s*철분(?:제)?/g, '경구용철분제')
    .replace(/경구용\s*철분\s*제{1,4}/g, '경구용철분제')
    .replace(/경구용철분제{2,5}/g, '경구용철분제')
    .replace(/경구\s*용\s*철분\s*제/g, '경구용철분제')
    .replace(/경구\s*철분\s*제/g, '경구용철분제')
    .replace(/경구\s*철분/g, '경구용철분제')
    .replace(/경구용\s*철분/g, '경구용철분제')
    .replace(/경구용철분제으로/gi, '경구용철분제로');
}

function normalizeMemoTone(text: string): string {
  const replacements: Array<[RegExp, string]> = [
    [/단회\s*투여/gi, '1회 투여'],
    [/단회투여/gi, '1회 투여'],
    [/플라주(?!OP)/g, '플라주OP'],
  ];
  return replacements.reduce((acc, [pattern, replacement]) => acc.replace(pattern, replacement), text);
}

function reducePointWordUsage(text: string): string {
  // few-shot 방식으로 전환 — AI가 자연스럽게 쓴 텍스트를 강제 변환하지 않음
  return text;
}

function normalizeSnippetProductName(product: string): string {
  const compact = product.replace(/\s+/g, '').trim();
  if (!compact) return '공통';
  const lower = compact.toLowerCase();
  if (compact.includes('위너프에이플러스')) return '위너프에이플러스';
  if (compact.includes('위너프A+') || compact.includes('위너프에이+') || lower.includes('winufa+') || lower.includes('winufaplus') || lower.includes('winufa')) return '위너프에이플러스';
  if (compact.includes('페린젝트') || lower.includes('ferinject')) return '페린젝트';
  if (compact.includes('위너프')) return '위너프';
  return product.trim();
}

function inferSnippetProduct(item: { content?: string; context?: string; product?: string; tags?: string[] }): string {
  const explicit = normalizeSnippetProductName(item.product || '');
  if (['위너프에이플러스', '페린젝트'].includes(explicit)) return explicit;

  const text = `${item.product || ''} ${item.content || ''} ${item.context || ''} ${(item.tags || []).join(' ')}`;
  const compact = text.replace(/\s+/g, '');
  const lower = compact.toLowerCase();
  if (
    compact.includes('위너프에이플러스') ||
    compact.includes('위너프A+') ||
    lower.includes('winufa') ||
    /아미노산.*25|25.*아미노산|포도당.*감소|고함량아미노산|4세대/.test(text)
  ) {
    return '위너프에이플러스';
  }
  if (
    compact.includes('페린젝트') ||
    lower.includes('ferinject') ||
    /1회\s*투여|철결핍|Hb|혈색소|경구용철분제|경구\s*철분|수혈/.test(text)
  ) {
    return '페린젝트';
  }
  return '공통';
}

function buildDoctorRosterForSnippetAnalysis(doctors: Doctor[]): string {
  if (doctors.length === 0) return '등록된 교수 없음';

  const byDepartment = new Map<string, Map<string, Doctor[]>>();
  for (const doctor of doctors) {
    const department = doctor.department || '진료과 미기록';
    const hospital = doctor.hospital || '병원 미기록';
    if (!byDepartment.has(department)) byDepartment.set(department, new Map());
    const hospitalMap = byDepartment.get(department)!;
    if (!hospitalMap.has(hospital)) hospitalMap.set(hospital, []);
    hospitalMap.get(hospital)!.push(doctor);
  }

  return [...byDepartment.entries()]
    .sort(([a], [b]) => a.localeCompare(b, 'ko'))
    .map(([department, hospitalMap]) => {
      const coverageLine = [...hospitalMap.entries()]
        .sort(([a], [b]) => a.localeCompare(b, 'ko'))
        .map(([hospital, items]) => {
          const names = items
            .sort((a, b) => a.name.localeCompare(b.name, 'ko'))
            .map((doctor) => doctor.name)
            .join(', ');
          return `${hospital}(${names})`;
        })
        .join(' / ');
      const hospitals = [...hospitalMap.entries()]
        .sort(([a], [b]) => a.localeCompare(b, 'ko'))
        .map(([hospital, items]) => {
          const names = items
            .sort((a, b) => a.name.localeCompare(b.name, 'ko'))
            .map((doctor) => {
              const traits = doctor.traits.map((t) => t.label).join(',') || '성향 미기록';
              const tendency = doctor.prescriptionTendency || '처방경향 미기록';
              return `${doctor.name}(성향=${traits}, 처방경향=${tendency})`;
            })
            .join(', ');
          return `  - ${hospital}: ${names}`;
        })
        .join('\n');
      return `[${department}]\n- 전체 후보: ${coverageLine}\n${hospitals}`;
    })
    .join('\n\n');
}

function cleanPreviousVisitConnection(text: string): string {
  // few-shot 방식으로 전환 — 지난 방문 연결 문장을 강제 편집하지 않음
  return text;
}

function normalizeProductKey(text: string): string {
  const compact = text.replace(/\s+/g, '');
  if (compact.includes('위너프에이플러스')) return '위너프에이플러스';
  if (compact.includes('위너프')) return '위너프';
  if (compact.includes('페린젝트')) return '페린젝트';
  if (compact.includes('프리페넴')) return '프리페넴';
  if (compact.includes('플라주')) return '플라주OP';
  if (compact.includes('이부프로펜')) return '이부프로펜프리믹스';
  if (compact.includes('제이세덱스')) return '제이세덱스';
  if (compact.includes('포스페넴')) return '포스페넴';
  return compact;
}

function containsProductKey(text: string, productKey: string): boolean {
  const compact = text.replace(/\s+/g, '');
  if (productKey === '위너프에이플러스') return compact.includes('위너프에이플러스');
  if (productKey === '위너프') return compact.includes('위너프') && !compact.includes('위너프에이플러스');
  if (productKey === '플라주OP') return compact.includes('플라주');
  if (productKey === '이부프로펜프리믹스') return compact.includes('이부프로펜');
  return compact.includes(productKey);
}

function cleanRedundantPreviousUseFocus(text: string): string {
  // few-shot 방식으로 전환 — 이전 방문 연결 표현을 강제 교체하지 않음
  return text;
}

function normalizeGeneratedMemoText(text: string, department = ''): string {
  const cleaned = cleanRedundantPreviousUseFocus(cleanPreviousVisitConnection(reducePointWordUsage(normalizeMemoTone(text))))
    .replace(/근거을/g, '근거를')
    .replace(/반응하셨고/g, '반응 보였고')
    .replace(/반응하셨음/g, '반응 보임')
    .replace(/의견하셨고/g, '의견 보였고')
    .replace(/경구용철분제로\s*Hb\s*회복이\s*충분하지\s*않은/gi, '경구용철분제 반응이 충분하지 않은')
    .replace(/경구용철분제로\s*Hb\s*회복이\s*충분치\s*않은/gi, '경구용철분제 반응이 충분치 않은')
    .replace(/경구용철분제로\s*Hb\s*회복이\s*더딘/gi, '경구용철분제 반응이 더딘')
    .replace(/Hb\s*회복\s*도움\s*말씀드렸더니/gi, 'Hb 회복에 도움된다고 말씀드렸더니')
    .replace(/교수님께서\s+([^。.!?]{2,120}?)(?:라는\s*)?반응\s*보임\s*보임/g, '교수님께서 $1라는 반응 보임')
    .replace(/교수님께서\s+([^。.!?]{2,120}?)(?:라는\s*)?의견\s*보임\s*보임/g, '교수님께서 $1라는 의견 보임');
  return department ? normalizeDepartmentThemeStacks(cleaned, department) : cleaned;
}

function trimIncompleteTrailingClause(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return trimmed;

  const lastSentenceEnd = Math.max(
    trimmed.lastIndexOf('.'),
    trimmed.lastIndexOf('。'),
    trimmed.lastIndexOf('!'),
    trimmed.lastIndexOf('?')
  );
  if (lastSentenceEnd < 0 || lastSentenceEnd >= trimmed.length - 1) return trimmed;

  const tail = trimmed.slice(lastSentenceEnd + 1).trim();
  if (!tail) return trimmed;
  if (/[.!?。]$/.test(tail)) return trimmed;
  if (/(보임|하심|하셨|확인함|검토함|드림|예정|가능함|관심보이심|의견보임)$/.test(tail)) return trimmed;
  if (tail.length > 45) return trimmed;
  return trimmed.slice(0, lastSentenceEnd + 1).trim();
}

function removeNextVisitPlanFromLog(text: string, department = ''): string {
  const cleaned = text
    .split(/(?<=[.。!?])\s+|[,，]\s*|\n+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean)
    .filter((sentence) => !/^(다음\s*방문에는|다음방문시에는|다음번에는|다음에는)/.test(sentence))
    .join(' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return department ? normalizeDepartmentThemeStacks(cleaned, department) : cleaned;
}

function stripEmbeddedNextVisitPlan(text: string, department = ''): string {
  let cleaned = removeNextVisitPlanFromLog(text, department);
  const markers = ['다음방문시에는', '다음방문에는', '다음번에는', '다음에는'];
  const markerPositions = markers
    .map((marker) => cleaned.indexOf(marker))
    .filter((index) => index >= 0)
    .sort((a, b) => a - b);

  if (markerPositions.length > 0) {
    const idx = markerPositions[0];
    const prefix = cleaned.slice(0, idx).trim();
    const suffix = cleaned.slice(idx).trim();
    if (/^다음(?:\s*방문(?:시)?에는|\s*번에는|\s*에는|방문(?:시)?에는|번에는|에는)/.test(suffix)) {
      cleaned = prefix;
    }
  }

  return department ? normalizeDepartmentThemeStacks(cleaned, department) : cleaned;
}

function getThemeVariants(theme: string): string[] {
  const base = theme.trim();
  if (!base) return [];

  const variants = new Set<string>([base, base.replace(/\s+/g, '')]);
  if (base.includes('/')) {
    const [leftRaw, ...rightParts] = base.split('/');
    const left = leftRaw.trim();
    const right = rightParts.join('/').trim();
    if (left && right) {
      variants.add(`${left} ${right}`.trim());
      variants.add(`${left}${right}`.trim());
      const rightTokens = right.split(/\s+/).filter(Boolean);
      if (rightTokens.length > 0) {
        variants.add(`${left} ${rightTokens.join(' ')}`.trim());
        variants.add(`${left}${rightTokens.join('')}`.trim());
      }
    }
  }

  return [...variants].filter(Boolean).sort((a, b) => b.length - a.length);
}

function findThemeMatches(sentence: string, rule: DeptFeatureRule): Array<{ theme: string; index: number; variant: string }> {
  const matches: Array<{ theme: string; index: number; variant: string }> = [];
  for (const theme of rule.allowedThemes) {
    for (const variant of getThemeVariants(theme)) {
      const index = sentence.indexOf(variant);
      if (index >= 0) {
        matches.push({ theme, index, variant });
        break;
      }
    }
  }
  return matches.sort((a, b) => a.index - b.index || b.variant.length - a.variant.length);
}

function normalizeDepartmentThemeStacks(text: string, department: string): string {
  const rule = getDeptFeatureRule(department);
  if (!rule) return text;

  return text
    .split(/(?<=[.。!?])\s+|[,，]\s*|\n+/)
    .map((sentence) => {
      let result = sentence.trim();
      if (!result) return result;

      const matches = findThemeMatches(result, rule);
      if (matches.length <= 1) return result;

      const first = matches[0];
      const second = matches[1];
      const between = result.slice(first.index + first.variant.length, second.index);
      if (/[,，;；:：/·•]|(?:및|그리고|또는|와|과|함께)/.test(between)) {
        return result;
      }

      for (const match of matches.slice(1)) {
        for (const variant of getThemeVariants(match.theme)) {
          result = result.split(variant).join(' ');
        }
      }

      return result
        .replace(/\s{2,}/g, ' ')
        .replace(/\s+([.。!?])/g, '$1')
        .replace(/\s+([,，])/g, '$1')
        .trim();
    })
    .filter(Boolean)
    .join(' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function normalizeNextStrategy(text: string, department = ''): string {
  if (!text.trim()) return '';
  const normalized = stripBrokenFutureFragments(
    reducePointWordUsage(normalizeMemoTone(text))
  )
    .replace(/^(다음\s*방문에는|다음번에는|다음에는)\s*/g, '다음방문시에는 ')
    .replace(/^다음방문시\s*에는\s*/g, '다음방문시에는 ')
    .replace(/하겠다/gi, '할예정')
    .replace(/\n+/g, ' ')
    .trim();
  const themed = department ? normalizeDepartmentThemeStacks(normalized, department) : normalized;
  const markerRegex = /다음방문시에는|다음방문시|다음방문에는|다음번에는|다음에는/g;
  const matches = [...themed.matchAll(markerRegex)];
  let clipped = themed;
  if (matches.length > 1 && matches[1].index !== undefined) {
    clipped = themed.slice(0, matches[1].index).trim();
  }
  clipped = clipped
    .replace(/(?:확인|살펴|검토|진행|안내|여쭤|보여드려|가져가|보)\s*해?\s*보겠을(?=\s*할예정|$)/gi, '')
    .replace(/(?:확인|살펴|검토|진행|안내|여쭤|보여드려|가져가|보)\s*해?\s*보겠음(?=\s*할예정|$)/gi, '')
    .replace(/보겠을(?=\s*할예정|$)/gi, '')
    .replace(/(볼예정|확인예정|살펴볼예정|확인할예정|진행할예정|안내할예정)(?:\s*\1)+/g, '$1')
    .replace(/(?:할예정){2,}/g, '할예정')
    .replace(/(?:볼예정){2,}/g, '볼예정')
    .replace(/(?:다음방문시에는\s*){2,}/g, '다음방문시에는 ')
    .replace(/(?:다음방문시에는\s*)+$/g, '다음방문시에는')
    .replace(/\s{2,}/g, ' ')
    .trim();
  if (/예정$/.test(clipped)) {
    return clipped.startsWith('다음방문시에는')
      ? clipped
      : `다음방문시에는 ${clipped}`.trim();
  }
  return clipped.startsWith('다음방문시에는')
    ? clipped
    : `다음방문시에는 ${clipped}`.trim();
}

function finalizeVisitLogBody(text: string, activeProducts: string[], department: string): string {
  const primaryProduct = activeProducts[0] || getAllowedProductsForDepartment(department)[0] || '위너프에이플러스';
  let body = normalizeGeneratedMemoText(text, department);
  body = normalizeObjectionLanguage(body, activeProducts);
  body = normalizeIntroProductLanguage(body, activeProducts, false);
  body = removeDisallowedDepartmentThemeSentences(body, department);
  body = removeNextVisitPlanFromLog(body, department);
  body = removeDisallowedProductSentences(body, department) || body;
  body = sanitizeVisitLogBody(body, primaryProduct);
  body = trimAfterReactionSentence(body);
  body = stripEmbeddedNextVisitPlan(body, department);
  body = body.replace(/\s{2,}/g, ' ').trim();

  const bodyLooksLikePlan = hasVisitPlanLeak(body) || /^다음(?:방문|번|엔|에)/.test(body);
  const bodyLooksLikeLeak = hasVisitLogProductLeak(body, primaryProduct);
  if (!body || body.length < 12 || hasVacuousDetailLanguage(body) || bodyLooksLikePlan || bodyLooksLikeLeak) {
    const fallback = buildFallbackVisitLog(primaryProduct, department, body);
    body = stripEmbeddedNextVisitPlan(fallback, department);
  }

  body = normalizeGeneratedMemoText(body, department);
  body = removeDisallowedDepartmentThemeSentences(body, department);
  body = removeNextVisitPlanFromLog(body, department);
  body = stripEmbeddedNextVisitPlan(body, department);
  body = sanitizeVisitLogBody(body, primaryProduct);
  body = trimAfterReactionSentence(body);
  body = trimIncompleteTrailingClause(body);
  body = body
    .replaceAll('경구용철분제로 Hb 회복이 충분치 않은', '경구용철분제 반응이 충분치 않은')
    .replaceAll('경구용철분제로 Hb 회복이 충분하지 않은', '경구용철분제 반응이 충분하지 않은')
    .replaceAll('경구용철분제로 Hb 회복이 더딘', '경구용철분제 반응이 더딘')
    .replaceAll('편할예정며', '편하다고 하시며')
    .replace(/경구용철분제로\s*Hb\s*회복이\s*충분치\s*않은/gi, '경구용철분제 반응이 충분치 않은')
    .replace(/경구용철분제로\s*Hb\s*회복이\s*충분하지\s*않은/gi, '경구용철분제 반응이 충분하지 않은')
    .replace(/경구용철분제로\s*Hb\s*회복이\s*더딘/gi, '경구용철분제 반응이 더딘')
    .replace(/경구용철분제로\s*Hb\s*회복\s*가능하다고/gi, '경구용철분제 Hb 회복에 도움된다고')
    .replace(/(위너프에이플러스|페린젝트|플라주OP)의\s+/g, '$1 ');
  body = sanitizeVisitLogBody(body, primaryProduct);
  body = trimAfterReactionSentence(body);
  body = trimIncompleteTrailingClause(body);
  return body.replace(/\s{2,}/g, ' ').trim();
}

function finalizeVisitStrategy(
  text: string,
  activeProducts: string[],
  department: string,
  body: string = ''
): string {
  const primaryProduct = activeProducts[0] || getAllowedProductsForDepartment(department)[0] || '위너프에이플러스';
  let strategy = sanitizeNextStrategyText(normalizeNextStrategy(text, department), primaryProduct);
  const avoidedKeys = body ? detailKeysFromTexts([body]) : new Set<string>();
  const hasConflict = body
    ? hasRepeatedDetailBetweenLogAndStrategy(body, strategy, avoidedKeys) || hasVisitLogProductLeak(strategy, primaryProduct)
    : false;

  if (hasConflict || hasGenericFollowUpAxis(strategy)) {
    strategy = sanitizeNextStrategyText(
      buildFollowUpStrategyWithoutRepeatingDetail(body || strategy, primaryProduct, department, avoidedKeys),
      primaryProduct
    );
  }

  if (!strategy || strategy.trim().length < 5) {
    const themeRule = getDeptFeatureRule(department);
    const theme = themeRule?.allowedThemes[0] || '환자군';
    strategy = sanitizeNextStrategyText(`다음방문시에는 ${primaryProduct} ${theme} 처방 상황 확인할예정`, primaryProduct);
  }

  return strategy
    .replace(/\s{2,}/g, ' ')
    .replace(/(?:할예정){2,}/g, '할예정')
    .replace(/(?:볼예정){2,}/g, '볼예정')
    .trim();
}

function hasGenericFollowUpAxis(text: string): boolean {
  const compact = text.replace(/\s+/g, '');
  return /실제처방여부|실제처방흐름|실제적용사례|실제적용가능상황|실제적용환자군|실제처방환자군|처방시점은환자상태를보고판단|차트상조건을보고검토|차트상환자부터보겠|적용가능케이스|환자상확인|환자군확인|처방경험여부/.test(compact);
}

function hasIntroProducts(products: string[]): boolean {
  return products.some((p) => INTRO_PRODUCTS.has(p));
}

function normalizeIntroProductLanguage(
  text: string,
  activeProducts: string[] = [],
  allowNewDrugReview = false
): string {
  const activeIntroProducts = activeProducts.filter((product) => INTRO_PRODUCTS.has(product));
  const finalAllowNewDrugReview = allowNewDrugReview && activeIntroProducts.length > 0;
  const mainProduct = activeProducts[0] || '위너프에이플러스';
  const concreteDetail = `${mainProduct} 실제 적용 근거`;
  const replacement = finalAllowNewDrugReview ? '신약여부검토 요청' : concreteDetail;
  const activeIntroducedProducts = activeProducts.filter((product) => !INTRO_PRODUCTS.has(product));

  const cleaned = text
    .replace(/처방\s*늘려달라/gi, replacement)
    .replace(/지속\s*처방\s*부탁/gi, replacement)
    .replace(/한\s*번\s*써봐달라/gi, replacement)
    .replace(/신약\s*신청/gi, replacement)
    .replace(/신약\s*도입\s*여부\s*검토/gi, replacement)
    .replace(/신약\s*도입\s*여부/gi, replacement)
    .replace(/신약\s*여부\s*검토/gi, replacement)
    .replace(/신약여부검토 요청\s*요청/gi, '신약여부검토 요청')
    .replace(/증량/gi, '')
    .replace(/증액/gi, '');

  const sentences = cleaned
    .split(/(?<=[.。!?])\s+|[,，]\s*|\n+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean)
    .map((sentence) => {
      if (!sentence.includes('신약여부검토 요청')) return sentence;
      if (!finalAllowNewDrugReview) return sentence.replace(/신약여부검토 요청/g, concreteDetail);
      const hasIntroProductInSentence = activeIntroProducts.some((product) => sentence.includes(product));
      const hasIntroducedProductInSentence = activeIntroducedProducts.some((product) => sentence.includes(product));
      if (hasIntroducedProductInSentence && !hasIntroProductInSentence) {
        return sentence.replace(/신약여부검토 요청/g, concreteDetail);
      }
      return sentence;
    });

  return sentences.join(' ').replace(/\s{2,}/g, ' ').trim();
}

function buildContextSection(doctor: Doctor, pastLogs: VisitLog[]): string {
  const traitText = doctor.traits.map((t) => t.label).join(', ');
  const objectionText = doctor.objections
    .map((o) => `  - 반박: ${o.content} → 대응: ${o.response}`)
    .join('\n');

  const pastContext = pastLogs
    .slice(0, 8)
    .map((log, i) => {
      let entry = `  [${i + 1}회 전 방문 - ${log.visitDate}]\n  ${log.formattedLog.slice(0, 500)}`;
      if (log.nextStrategy) entry += `\n  다음전략: ${log.nextStrategy.slice(0, 200)}`;
      return entry;
    })
    .join('\n\n');

  let context = `교수 정보:
- 이름: ${doctor.name} (${doctor.position})
- 병원: ${doctor.hospital} / 과: ${doctor.department}
- 성향: ${traitText || '미기록'}
- 처방 경향: ${doctor.prescriptionTendency || '미기록'}
- 관심 분야: ${doctor.interestAreas || '미기록'}
- 메모: ${doctor.notes || '없음'}`;

  if (objectionText) {
    context += `\n\n자주 하는 반박 패턴:\n${objectionText}`;
  }

  if (pastLogs.length > 0) {
    context += `\n\n최근 방문 기록 (${pastLogs.length}회 중 최근 5회):\n${pastContext}`;
  } else {
    const convVisitCount = getConversationHistoryVisitCount(doctor);
    if (convVisitCount > 0) {
      context += `\n\n방문 기록: 없음. 대신 과거 상담/분석 기록 ${convVisitCount}회 분량이 있습니다. 첫 방문으로 쓰지 마세요.`;
    } else {
      context += '\n\n방문 기록: 없음 (첫 방문 또는 기록 없음)';
    }
  }

  const convHistory = doctor.conversationHistory ?? [];
  if (convHistory.length > 0) {
    const convSummary = convHistory
      .slice(0, 5)
      .map((record, index) => {
        const traitText = record.detectedTraits.join(', ') || '없음';
        const analysisText = record.aiAnalysis.slice(0, 220);
        const strategyText = record.nextSuggestions.slice(0, 180);
        return `  [${index + 1}] ${record.period}\n  성향 태그: ${traitText}\n  요약: ${analysisText}\n  다음전략: ${strategyText}`;
      })
      .join('\n\n');

    context += `\n\n과거 상담/분석 기록 (${getConversationHistoryVisitCount(doctor)}회 분량, 최근 3개):\n${convSummary}`;
  }

  // 사용자 편집 패턴 수집 (최근 10개 로그)
  const editHintLogs = pastLogs.filter(l => l.aiEditHint).slice(0, 10);

  if (editHintLogs.length > 0) {
    const recentHints = editHintLogs.slice(0, 5)
      .map((l, i) => `  ${i + 1}. [${l.visitDate}] ${l.aiEditHint}`)
      .join('\n');

    // ── 반복 패턴 감지 ──────────────────────────────────────
    const allHintTexts = editHintLogs.map(l => l.aiEditHint ?? '');

    // 삭제 반복 감지: 같은 키워드가 2번 이상 삭제됨
    const deletedPhrases: string[] = [];
    allHintTexts.forEach(h => {
      for (const m of h.matchAll(/삭제:\s*"([^"]+)"/g)) {
        deletedPhrases.push(m[1].slice(0, 12));
      }
    });
    const deletionCount = new Map<string, { count: number; sample: string }>();
    deletedPhrases.forEach(phrase => {
      const key = phrase.slice(0, 8);
      const existing = deletionCount.get(key);
      if (existing) existing.count++;
      else deletionCount.set(key, { count: 1, sample: phrase });
    });
    const recurringDeletions = [...deletionCount.values()]
      .filter(v => v.count >= 2)
      .map(v => v.sample);

    // 단축 반복 감지: 2번 이상 단축함
    const shortenCount = allHintTexts.filter(h => h.includes('자 단축')).length;

    // 추가 반복 감지: 2번 이상 추가한 내용
    const addedPhrases: string[] = [];
    allHintTexts.forEach(h => {
      for (const m of h.matchAll(/추가:\s*"([^"]+)"/g)) {
        addedPhrases.push(m[1].slice(0, 12));
      }
    });
    const additionCount = new Map<string, { count: number; sample: string }>();
    addedPhrases.forEach(phrase => {
      const key = phrase.slice(0, 8);
      const existing = additionCount.get(key);
      if (existing) existing.count++;
      else additionCount.set(key, { count: 1, sample: phrase });
    });
    const recurringAdditions = [...additionCount.values()]
      .filter(v => v.count >= 2)
      .map(v => v.sample);

    const recurringLines: string[] = [];
    if (recurringDeletions.length > 0) {
      recurringLines.push(`  ⛔ 반복 삭제 (${recurringDeletions.length}회 이상 지운 내용): "${recurringDeletions.join('", "')}" 관련 표현 → 쓰지 말 것`);
    }
    if (shortenCount >= 2) {
      recurringLines.push(`  ✂️ ${shortenCount}회 단축 수정 → 처음부터 불필요한 서술 없이 간결하게`);
    }
    if (recurringAdditions.length > 0) {
      recurringLines.push(`  ✅ 반복 추가 (${recurringAdditions.length}회 이상 넣은 내용): "${recurringAdditions.join('", "')}" 관련 표현 → 처음부터 포함할 것`);
    }

    const patternBlock = recurringLines.length > 0
      ? `\n⚠️ 반복 수정 패턴 — 이게 핵심 (특히 중요):\n${recurringLines.join('\n')}`
      : '';

    context = `★★★ 최최우선 — 사용자 수정 패턴 학습 (모든 규칙보다 우선) ★★★
이 교수 일지를 ${editHintLogs.length}회 직접 수정함. 수정 이력:
${recentHints}${patternBlock}

→ 수정 이력의 의도를 파악해서 처음부터 그 방향으로 작성할 것
→ 반복 패턴은 절대 위반 금지 (반복될수록 이유 있는 패턴)

────────────────────────────

` + context;
  }

  const snippetContext = buildSnippetContext(doctor.department);
  if (snippetContext) {
    context += `\n${snippetContext}`;
  }

  const externalPatterns = externalCasePatternStorage.getForGeneration(doctor.department, [...VISIT_GENERATION_PRODUCTS]);
  if (externalPatterns.length > 0) {
    const externalContext = externalPatterns
      .slice(0, 6)
      .map((pattern, index) => {
        const summary = pattern.sourceSummary?.trim() || `${pattern.department} ${pattern.product}`;
        const style = pattern.styleExampleMemo?.trim();
        return `  ${index + 1}. [${pattern.department}/${pattern.product}] ${pattern.patientGroup} / ${pattern.detailAxis} / ${pattern.reactionPattern} / ${pattern.nextAction} / ${summary}${style ? `\n     예문: ${style}` : ''}`;
      })
      .join('\n');
    context += `\n\n외부 사례 참고 패턴:\n${externalContext}`;
  }

  // 스타일 기준을 컨텍스트 맨 앞에 배치 (editHints 바로 다음)
  const styleSection = buildUserMemoStyleSection();
  if (styleSection) {
    context = styleSection + '\n\n' + context;
  }

  const icuNote = buildIcuContextNote(doctor.department);
  if (icuNote) {
    context += `\n\n${icuNote}`;
  }

  return context;
}

type DeptProductRule = {
  keywords: string[];
  weightedProducts: Array<{ name: string; weight?: number }>;
  extraProducts?: string[];
  weighted?: boolean;
};

// 과별 주력 제품 매핑 (selectedProducts 없을 때 AI 제품 포커스 결정)
const DEPT_PRODUCT_MAP: DeptProductRule[] = [
  { keywords: ['정형외과'], weightedProducts: [{ name: '페린젝트', weight: 100 }], weighted: true },
  { keywords: ['산부인과', '산과', '부인과'], weightedProducts: [{ name: '페린젝트', weight: 100 }], weighted: true },
  { keywords: ['소화기내과', '소화기', 'IBD', '위장관'], weightedProducts: [{ name: '위너프에이플러스', weight: 50 }, { name: '페린젝트', weight: 50 }], weighted: true },
  { keywords: ['호흡기내과', '호흡기', '결핵'], weightedProducts: [{ name: '위너프에이플러스', weight: 70 }, { name: '페린젝트', weight: 30 }], weighted: true },
  { keywords: ['마취통증의학과', '마취통증', '마취과', '통증의학'], weightedProducts: [{ name: '플라주OP', weight: 100 }], weighted: true },
  { keywords: ['응급의학과', '응급의학'], weightedProducts: [{ name: '플라주OP', weight: 100 }], weighted: true },
  { keywords: ['외과', '일반외과', '복부외과', '대장항문외과'], weightedProducts: [{ name: '위너프에이플러스', weight: 55 }, { name: '페린젝트', weight: 45 }], weighted: true },
  { keywords: ['흉부외과', '심혈관외과', '심장외과'], weightedProducts: [{ name: '위너프에이플러스', weight: 50 }, { name: '페린젝트', weight: 50 }], weighted: true },
  { keywords: ['간담췌외과', '간담'], weightedProducts: [{ name: '위너프에이플러스', weight: 50 }, { name: '페린젝트', weight: 50 }], weighted: true },
  { keywords: ['중환자의학과', '중환자', 'ICU'], weightedProducts: [{ name: '위너프에이플러스', weight: 80 }, { name: '페린젝트', weight: 20 }], weighted: true },
  { keywords: ['신경외과'], weightedProducts: [{ name: '위너프에이플러스', weight: 50 }, { name: '페린젝트', weight: 50 }], weighted: true },
];

function getDeptProductRule(department: string): DeptProductRule {
  return DEPT_PRODUCT_MAP.find((rule) => rule.keywords.some(k => department.includes(k))) ??
    { keywords: [], weightedProducts: VISIT_GENERATION_PRODUCTS.map((name) => ({ name })), weighted: false };
}

function getDeptFocusProducts(department: string): { primary: string[]; secondary: string[] } {
  const products = getDeptProductRule(department).weightedProducts.map((product) => product.name);
  return { primary: products, secondary: [] };
}

function getAllowedProductsForDepartment(department: string): string[] {
  const rule = getDeptProductRule(department);
  // 진료과별 명시 라우팅이 있으면 그것만 사용 — VISIT_GENERATION_PRODUCTS 전체를 추가하지 않음
  // 기존 코드의 ...VISIT_GENERATION_PRODUCTS 때문에 응급의학과도 페린젝트가 허용되던 버그 수정
  if (rule.weightedProducts.length > 0) {
    const products = [
      ...rule.weightedProducts.map((product) => product.name),
      ...(rule.extraProducts ?? []),
    ].filter((product) => VISIT_GENERATION_PRODUCT_SET.has(product));
    return [...new Set(products)];
  }
  // 명시 라우팅 없으면 전체 허용
  return [...VISIT_GENERATION_PRODUCTS];
}

function pickWeightedProductForDepartment(department: string): string {
  const rule = getDeptProductRule(department);
  const products = rule.weightedProducts.filter((product) => VISIT_GENERATION_PRODUCT_SET.has(product.name));
  const totalWeight = products.reduce((sum, product) => sum + (product.weight ?? 1), 0);
  let cursor = Math.random() * totalWeight;
  for (const product of products) {
    cursor -= product.weight ?? 1;
    if (cursor <= 0) return product.name;
  }
  return products[0]?.name ?? '위너프에이플러스';
}

function inferProductsFromRawNotes(rawNotes: string, department: string): string[] {
  const compact = rawNotes.replace(/\s+/g, '');
  if (!compact) return [];

  if (/위너프에이플러스|winuf\s*a\+|winufa\+|winuf\+|winuf/.test(compact)) return ['위너프에이플러스'];
  if (/페린젝트|ferinject/.test(compact)) return ['페린젝트'];

  const hasWinufSignals = /위너프|winuf|아미노산|단백|질소|포도당|TPN|삼투압|고농도/.test(compact);
  const hasFerinjectSignals = /페린젝트|ferinject|Hb|혈색소|빈혈|철결핍|수혈|경구용철분제|철보충|산후|분만/.test(compact);

  if (/산부인과|산과|부인과/.test(department)) {
    if (hasWinufSignals && !hasFerinjectSignals) {
      if (/위너프|winuf|TPN|아미노산|단백|질소|포도당|삼투압|고농도/.test(compact)) return ['위너프에이플러스'];
    }
    if (hasFerinjectSignals && !hasWinufSignals) return ['페린젝트'];
    if (/위너프|winuf/.test(compact)) return ['위너프에이플러스'];
    if (/페린젝트|ferinject/.test(compact)) return ['페린젝트'];
  }

  if (hasFerinjectSignals && !hasWinufSignals) return ['페린젝트'];
  if (hasWinufSignals && !hasFerinjectSignals) return ['위너프에이플러스'];
  return [];
}

function getActiveProductsForGeneration(selectedProducts: string[], department: string, rawNotes = ''): string[] {
  const selected = normalizeSelectedProductsForDepartment(selectedProducts, department);
  if (selectedProducts.length > 0) return selected;
  const inferred = inferProductsFromRawNotes(rawNotes, department);
  if (inferred.length > 0) return inferred;
  const rule = getDeptProductRule(department);
  if (rule.weighted) return [pickWeightedProductForDepartment(department)];
  const allowed = getAllowedProductsForDepartment(department);
  return allowed.slice(0, Math.min(2, allowed.length));
}

function getFallbackDetailForProduct(product: string, department: string, seed = ''): string {
  if (product === '페린젝트') {
    const variants = [
      /정형외과|산부인과|산과|부인과|외과/.test(department)
        ? '수술 전후 빈혈에서 1회 투여로 Hb 회복과 수혈 부담을 함께 보는 근거'
        : '외래 빈혈에서 1회 투여 편의성과 빠른 Hb 회복을 함께 보는 근거',
      /종양내과|혈액종양내과|종양혈액내과|혈액내과/.test(department)
        ? '항암치료 중 경구용철분제 반응이 부족한 환자에서 철 보충을 빠르게 보는 근거'
        : '경구용철분제 반응이 부족한 환자에서 철 보충을 빠르게 보는 근거',
      /산부인과|산과|부인과/.test(department)
        ? '분만 후 Hb 10 이하 산모에서 빠른 회복과 외래 편의성을 함께 보는 근거'
        : '외래 재방문이 부담되는 환자에서 빠른 회복과 편의성을 함께 보는 근거',
      /산부인과|산과|부인과/.test(department)
        ? '산후 빈혈 환자에서 경구용철분제 전환 부담을 줄이는 근거'
        : '수혈 부담이 있는 환자에서 철 보충 대안을 함께 보는 근거',
      /소화기|IBD|위장관/.test(department)
        ? '위장관 출혈이나 IBD 빈혈에서 외래 추적과 Hb 회복을 같이 보는 근거'
        : '외래 추적이 필요한 빈혈 환자에서 Hb 회복을 같이 보는 근거',
      '철결핍 빈혈에서 1회 투여 편의성과 급여 기준을 함께 보는 근거',
    ];
    return pickVariant(variants, `${product}|${department}|${seed}`);
  }

  const variants = [
    /산부인과|산과|부인과/.test(department)
      ? '분만 후 식이 진행이 늦은 환자에서 단백 보충과 회복기 영양을 같이 보는 차이'
      : '회복기 식사 진행이 늦은 환자에서 단백 보충과 영양 흐름을 같이 보는 차이',
    /중환자|ICU|호흡기|외과|간담|흉부|신경/.test(department)
      ? '중증 환자 영양에서 회복 부담을 줄이면서 단백과 열량을 같이 보는 차이'
      : '회복기 영양에서 단백 보충과 열량 부담을 같이 보는 차이',
    /소화기|IBD|위장관/.test(department)
      ? '장관 영양 부담이 큰 환자에서 영양 공급과 혈당 부담을 같이 보는 차이'
      : '영양 공급과 혈당 부담을 같이 보는 차이',
    /산부인과|산과|부인과/.test(department)
      ? '부인과 수술 후 회복기에서 단백 보충과 식이 재개 속도를 같이 보는 차이'
      : '수술 후 회복기에서 단백 보충과 식이 재개 속도를 같이 보는 차이',
    /산부인과|산과|부인과/.test(department)
      ? '산후 회복기 환자에서 아미노산 보충과 영양 유지 부담을 같이 보는 차이'
      : '회복기 환자에서 아미노산 보충과 영양 유지 부담을 같이 보는 차이',
    '회복기 환자에서 단백 보충과 질소균형을 같이 보는 차이',
  ];
  return pickVariant(variants, `${product}|${department}|${seed}`);
}

function hashSeed(...parts: string[]): number {
  const joined = parts.filter(Boolean).join('|');
  let hash = 0;
  for (let i = 0; i < joined.length; i++) {
    hash = (hash * 31 + joined.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function pickVariant<T>(variants: T[], seed: string): T {
  return variants[Math.abs(hashSeed(seed)) % variants.length];
}

function buildFallbackVisitLog(product: string, department: string, seed = ''): string {
  const detail = getFallbackDetailForProduct(product, department, seed);
  const variants = [
    `${product} ${detail} 중심으로 디테일 진행함`,
    `${product} ${detail}을 환자 상황과 연결해 설명드림`,
    `${product} ${detail}을 실제 처방 맥락에 맞춰 정리함`,
  ];
  return pickVariant(variants, `${product}|${department}|${detail}|${seed}`);
}

function buildDetailedVisitLog(product: string, department: string, seed = ''): string {
  const detail = getFallbackDetailForProduct(product, department, seed);
  const variantSeed = `${product}|${department}|${detail}|${seed}`;
  if (product === '페린젝트') {
    if (/종양내과|혈액종양내과|종양혈액내과|혈액내과/.test(department)) {
      return pickVariant([
        `${product} ${detail}을 항암치료 중 경구용철분제 반응이 부족한 환자와 연결해 디테일 진행함. 교수님께서 빠르게 보려는 케이스는 차트로 확인하겠다는 의견 보임`,
        `${product} ${detail}을 항암치료 중 Hb 회복이 늦는 환자와 연결해 설명드림. 교수님께서 외래에서 우선 볼 환자부터 보겠다는 의견 보임`,
        `${product} ${detail}을 항암치료 중 철 보충이 필요한 환자와 연결해 디테일 진행함. 교수님께서 차트상 조건을 보며 판단하겠다는 의견 보임`,
      ], variantSeed);
    }
    if (/산부인과|산과|부인과/.test(department)) {
      return pickVariant([
        `${product} ${detail}을 분만 후 Hb 10 이하 산모와 연결해 디테일 진행함. 교수님께서 산후 외래에서는 차트상 빈혈부터 보겠다는 의견 보임`,
        `${product} ${detail}을 산후 빈혈 환자와 연결해 설명드림. 교수님께서 경구용철분제 반응이 더딘 케이스부터 보겠다는 의견 보임`,
        `${product} ${detail}을 부인과 수술 전후 환자와 연결해 디테일 진행함. 교수님께서 실제 적용은 수술 일정 보며 판단하겠다는 의견 보임`,
      ], variantSeed);
    }
    return pickVariant([
      `${product} ${detail}을 외래 빈혈 환자와 연결해 디테일 진행함. 교수님께서 1회 투여 편의성은 공감하셨고 급여 기준을 같이 보겠다는 의견 보임`,
      `${product} ${detail}을 반복 내원이 부담되는 환자와 연결해 설명드림. 교수님께서 적용 가능 케이스부터 보겠다는 의견 보임`,
      `${product} ${detail}을 Hb 회복이 늦는 외래 환자와 연결해 디테일 진행함. 교수님께서 실제 사용은 차트상 환자부터 보겠다는 의견 보임`,
    ], variantSeed);
  }
  if (/산부인과|산과|부인과/.test(department)) {
    return pickVariant([
      `${product} ${detail}을 분만 후 식이 진행이 늦은 환자와 연결해 디테일 진행함. 교수님께서 회복기 환자에서는 살펴볼 수 있겠다는 의견 보임`,
      `${product} ${detail}을 산후 회복기 영양 관리와 연결해 설명드림. 교수님께서 실제 적용은 회복기 환자부터 보겠다는 의견 보임`,
      `${product} ${detail}을 수술 전후 영양 공급 흐름과 연결해 디테일 진행함. 교수님께서 차트상 환자부터 보겠다는 의견 보임`,
    ], variantSeed);
  }
  return pickVariant([
    `${product} ${detail}을 회복기 환자와 연결해 디테일 진행함. 교수님께서 실제 적용은 환자 흐름을 같이 보겠다는 의견 보임`,
    `${product} ${detail}을 차트상 맞는 케이스와 연결해 설명드림. 교수님께서 적용 가능 환자부터 보겠다는 의견 보임`,
    `${product} ${detail}을 회복기 환자 영양 보충과 연결해 디테일 진행함. 교수님께서 실제 적용은 환자 흐름을 같이 보겠다는 의견 보임`,
    `${product} ${detail}을 수술 후 영양 관리 관점에서 설명드림. 교수님께서 회복 흐름을 보며 판단하겠다는 의견 보임`,
    `${product} ${detail}을 일반 회복기 환자와 연결해 디테일 진행함. 교수님께서 처방 가능 상황을 차트로 보겠다는 의견 보임`,
  ], variantSeed);
}

function pickProductForLog(log: string, activeProducts: string[], department: string): string {
  const allowedProducts = activeProducts.length > 0 ? activeProducts : getAllowedProductsForDepartment(department);
  const mentionedProduct = allowedProducts.find((product) => log.includes(product));
  if (mentionedProduct) return mentionedProduct;
  const compact = log.replace(/\s+/g, '');
  if (allowedProducts.includes('위너프에이플러스') && /아미노산|포도당|영양|중증|단백/.test(compact)) return '위너프에이플러스';
  if (allowedProducts.includes('페린젝트') && /1회|Hb|빈혈|철결핍|급여|수혈/.test(compact)) return '페린젝트';
  return allowedProducts[0] || '위너프에이플러스';
}

function expandVisitLogIfTooBrief(text: string, activeProducts: string[], department: string): string {
  const normalized = text.replace(/\s{2,}/g, ' ').trim();
  if (normalized.length >= MIN_VISIT_LOG_LENGTH) return normalized;
  const product = pickProductForLog(normalized, activeProducts, department);
  const detailed = buildDetailedVisitLog(product, department, normalized);
  return detailed.length > MAX_VISIT_LOG_LENGTH ? compressTextToLimit(detailed, MAX_VISIT_LOG_LENGTH) : detailed;
}

function normalizeDetailComparableText(text: string): string {
  return normalizeOralIronTerminology(text)
    .replace(/더딘|늦는|늦은|느린|불충분|부족|미흡/g, '반응부족')
    .replace(/편리성|편리|편의성/g, '편의')
    .replace(/혈색소/g, 'Hb')
    .replace(/급여\s*조건/g, '급여기준')
    .replace(/급여\s*기준/g, '급여기준')
    .replace(/\s+/g, '');
}

function extractDetailKeys(text: string): string[] {
  const compact = normalizeDetailComparableText(text);
  const keys = new Set<string>();

  if (/경구용철분제/.test(compact) && /반응부족|반응|효과/.test(compact)) keys.add('oral-iron-response');
  if (/1회/.test(compact) && /투여|편의/.test(compact)) keys.add('ferric-once-convenience');
  if (/Hb/.test(compact) && /회복|상승|개선/.test(compact)) keys.add('hb-recovery');
  if (/급여기준|급여|보험/.test(compact)) keys.add('reimbursement-criteria');
  if (/외래/.test(compact) && /추적|내원|불편|부담|적용/.test(compact)) keys.add('outpatient-followup');
  if (/아나필락시스|시험투여|테스트도즈/.test(compact)) keys.add('anaphylaxis-test-dose');
  if (/수혈/.test(compact) && /부담|감소|회피|줄/.test(compact)) keys.add('transfusion-burden');
  if (/페리틴|저인산|인산/.test(compact)) keys.add('ferritin-phosphate');

  if (/아미노산/.test(compact) && /25%|증가|고함량/.test(compact)) keys.add('winuf-amino-acid');
  if (/포도당/.test(compact) && /부담|감소|혈당/.test(compact)) keys.add('winuf-glucose-burden');
  if (/중증|중환|ICU/.test(compact) && /영양|환자/.test(compact)) keys.add('critical-nutrition');
  if (/단백|질소/.test(compact) && /보충|균형|강화/.test(compact)) keys.add('protein-nitrogen');
  if (/오메가3|어유|염증/.test(compact)) keys.add('omega3-composition');
  if (/3챔버|위너프와|기존위너프|비교|차이/.test(compact)) keys.add('winuf-comparison');
  if (/실제(처방|적용|사용|투여|반영)/.test(compact) || /차트상(조건|환자|케이스)/.test(compact) || /적용가능/.test(compact)) {
    keys.add('real-world-application');
  }
  if (/처방흐름|처방시점|시작타이밍|시작시점|언제부터|언제시작/.test(compact)) keys.add('prescribing-timing');
  if (/반응|의견|검토|판단|관심/.test(compact) && /(보임|하심|주심|보겠|살펴보|확인)/.test(compact)) keys.add('response-stance');

  return [...keys];
}

function detailKeysFromTexts(texts: string[]): Set<string> {
  return new Set(texts.flatMap(extractDetailKeys));
}

function hasAnyDetailKeyOverlap(text: string, usedKeys: Set<string>): boolean {
  return extractDetailKeys(text).some((key) => usedKeys.has(key));
}

function getDetailKeyOverlap(a: string, b: string): string[] {
  const bKeys = new Set(extractDetailKeys(b));
  return extractDetailKeys(a).filter((key) => bKeys.has(key));
}

function getReactionKeyOverlap(a: string, b: string): string[] {
  const bKeys = new Set(extractVisitReactionKeys(b));
  return extractVisitReactionKeys(a).filter((key) => bKeys.has(key));
}

function getTextSimilarity(a: string, b: string): number {
  const tokenize = (value: string) => normalizeOralIronTerminology(value)
    .replace(/더딘|늦는|늦은|느린|불충분|부족|미흡/g, '반응부족')
    .replace(/편리성|편리|편의성/g, '편의')
    .replace(/혈색소/g, 'Hb')
    .replace(/급여\s*조건/g, '급여기준')
    .replace(/급여\s*기준/g, '급여기준')
    .replace(/[^\p{L}\p{N}%]+/gu, ' ')
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);
  const left = new Set(tokenize(a));
  const right = new Set(tokenize(b));
  if (left.size === 0 || right.size === 0) return 0;
  const intersection = [...left].filter((token) => right.has(token)).length;
  const union = new Set([...left, ...right]).size;
  return intersection / union;
}

function hasBatchConflict(text: string, avoidTexts: string[]): boolean {
  return avoidTexts.some((avoidText) =>
    getDetailKeyOverlap(text, avoidText).length > 0 ||
    getReactionKeyOverlap(text, avoidText).length > 0 ||
    getTextSimilarity(text, avoidText) >= 0.4
  );
}

function buildDiversifiedVisitLog(
  currentText: string,
  activeProducts: string[],
  department: string,
  avoidTexts: string[]
): string {
  const allowedProducts = activeProducts.length > 0 ? activeProducts : getAllowedProductsForDepartment(department);
  const usedKeys = new Set([
    ...detailKeysFromTexts(avoidTexts),
    ...extractDetailKeys(currentText),
  ]);
  const usedReactionKeys = new Set(avoidTexts.flatMap(extractVisitReactionKeys));
  const candidates = [
    {
      product: '위너프에이플러스',
      keys: ['protein-nitrogen'],
      text: '위너프에이플러스의 단백 보충과 질소균형 유지 측면을 회복기 식사 진행이 늦는 환자와 연결해 디테일 진행함. 교수님께서 회복기 환자에서 영양 공급 반응을 확인해보겠다는 의견 보임',
    },
    {
      product: '위너프에이플러스',
      keys: ['omega3-composition'],
      text: '위너프에이플러스의 오메가3 조성과 영양 흐름 차이를 회복기 환자와 연결해 디테일 진행함. 교수님께서 실제 적용은 차트상 환자부터 보겠다는 의견 보임',
    },
    {
      product: '위너프에이플러스',
      keys: ['postop-recovery-nutrition'],
      text: '위너프에이플러스의 수술 후 회복기 영양 공급 속도를 부인과 수술 뒤 식이 지연 환자와 연결해 디테일 진행함. 교수님께서 산후나 수술 후 환자에서 살펴볼 수 있겠다는 의견 보임',
    },
    {
      product: '위너프에이플러스',
      keys: ['postpartum-protein'],
      text: '위너프에이플러스의 분만 후 단백 보충과 회복기 영양 유지 효과를 산후 회복 환자와 연결해 디테일 진행함. 교수님께서 식사 진행이 늦는 산모부터 보겠다는 의견 보임',
    },
    {
      product: '위너프에이플러스',
      keys: ['tpn-osmolarity'],
      text: '위너프에이플러스의 고농도 영양 공급과 삼투압 부담 차이를 수액 제한이 있는 환자와 연결해 디테일 진행함. 교수님께서 실제 적용은 수술 후 차트부터 보겠다는 의견 보임',
    },
    {
      product: '페린젝트',
      keys: ['transfusion-burden'],
      text: '페린젝트의 수술 전후 철결핍 빈혈에서 수혈 부담을 줄일 수 있는 근거 중심으로 디테일 진행함. 교수님께서 수혈을 피하고 싶은 케이스부터 확인해보겠다는 의견 보임',
    },
    {
      product: '페린젝트',
      keys: ['hb-recovery'],
      text: '페린젝트의 Hb 회복 근거를 경구용철분제 반응이 부족한 철결핍 빈혈 상황과 연결해 디테일 진행함. 교수님께서 급여 기준에 맞는 환자부터 차트로 확인해보겠다는 의견 보임',
    },
    {
      product: '페린젝트',
      keys: ['postpartum-anemia'],
      text: '페린젝트의 분만 후 Hb 10 이하 산모에서 1회 투여 완결성과 외래 편의성을 연결해 디테일 진행함. 교수님께서 산후 빈혈은 차트상 먼저 보겠다는 의견 보임',
    },
    {
      product: '페린젝트',
      keys: ['preop-hb'],
      text: '페린젝트의 수술 전 Hb 교정 속도를 부인과 수술 예정 환자와 연결해 디테일 진행함. 교수님께서 수술 일정에 맞는 케이스부터 보겠다는 의견 보임',
    },
  ].filter((candidate) => allowedProducts.includes(candidate.product));

  const selected = candidates.find((candidate) =>
    candidate.keys.every((key) => !usedKeys.has(key)) &&
    extractVisitReactionKeys(candidate.text).every((key) => !usedReactionKeys.has(key))
  ) || candidates.find((candidate) => extractVisitReactionKeys(candidate.text).every((key) => !usedReactionKeys.has(key))) || candidates[0];
  if (!selected) return expandVisitLogIfTooBrief(currentText, allowedProducts, department);
  return selected.text.length > MAX_VISIT_LOG_LENGTH ? compressTextToLimit(selected.text, MAX_VISIT_LOG_LENGTH) : selected.text;
}

function hasVacuousDetailLanguage(text: string): boolean {
  const compact = text.replace(/\s+/g, '');
  return /(?:특장점|제품디테일|제품내용)(?:을|를)?(?:중심으로)?(?:디테일|안내|진행|전달)/.test(compact);
}

function removeUnrealisticProfessorMetaSentences(text: string): string {
  return text
    .split(/(?<=[.。!?])\s+|[,，]\s*|\n+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean)
    .filter((sentence) => !/교수님께서.*(?:메모|기록|적어|필기)/.test(sentence))
    .filter((sentence) => !/(?:반응\s*확인|확인\s*요청|요청\s*드림)/.test(sentence))
    .join(' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function hasRepeatedDetailBetweenLogAndStrategy(log: string, strategy: string, usedKeys: Set<string> = new Set()): boolean {
  if (getDetailKeyOverlap(log, strategy).length > 0) return true;
  if (hasAnyDetailKeyOverlap(strategy, usedKeys)) return true;
  const normalizedLog = normalizeDetailComparableText(log);
  const normalizedStrategy = normalizeDetailComparableText(strategy);
  const pairs = [
    ['1회', '편의'],
    ['1회', '투여'],
    ['Hb', '회복'],
    ['급여', '조건'],
    ['아미노산', '25%'],
    ['포도당', '부담'],
    ['경구용철분제', '비교'],
    ['수혈', '부담'],
  ];
  const semanticPairs = [
    ['real-world-application'],
    ['prescribing-timing'],
    ['response-stance'],
  ];
  const pairOverlap = pairs.some((pair) =>
    pair.every((keyword) => normalizedLog.includes(keyword.replace(/\s+/g, ''))) &&
    pair.every((keyword) => normalizedStrategy.includes(keyword.replace(/\s+/g, '')))
  );
  const semanticOverlap = semanticPairs.some((keys) => {
    const left = extractDetailKeys(normalizedLog);
    const right = extractDetailKeys(normalizedStrategy);
    return keys.every((key) => left.includes(key) && right.includes(key));
  });
  return pairOverlap || semanticOverlap;
}

function buildFollowUpStrategyWithoutRepeatingDetail(
  log: string,
  product: string,
  department: string,
  usedKeys: Set<string> = new Set()
): string {
  const allowedProducts = getAllowedProductsForDepartment(department);
  const otherProduct = allowedProducts.find((allowedProduct) => allowedProduct !== product);
  const themeRule = getDeptFeatureRule(department);
  const theme = themeRule?.allowedThemes[0] || '환자군';
  const seed = Math.abs(hashSeed(log, product, department, [...usedKeys].join('|')));
  const logKeys = new Set(extractDetailKeys(log));
  const productCandidates = product === '페린젝트'
    ? [
        `다음방문시에는 페린젝트 경구용철분제 반응이 더딘 환자에서 전환 포인트 확인할예정`,
        `다음방문시에는 페린젝트 수술 전 빈혈 환자 Hb 회복 속도 확인할예정`,
        `다음방문시에는 페린젝트 분만 후 Hb 10 이하 산모군 반응 확인할예정`,
        `다음방문시에는 페린젝트 외래 재방문 부담 있는 환자에서 1회 투여 장점 확인할예정`,
        `다음방문시에는 페린젝트 수혈 부담이 있는 케이스에서 철 보충 반응 확인할예정`,
        `다음방문시에는 페린젝트 산후 빈혈 환자에서 경구용철분제 전환 여부 확인할예정`,
        `다음방문시에는 페린젝트 부인과 수술 예정 환자에서 수술 전 Hb 교정 타이밍 확인할예정`,
      ]
    : [
        `다음방문시에는 위너프에이플러스 TPN 셋오더 환자에서 삼투압 차이 확인할예정`,
        `다음방문시에는 위너프에이플러스 수술 후 회복기 환자에서 단백 보충 반응 확인할예정`,
        `다음방문시에는 위너프에이플러스 식사 진행이 늦은 환자에서 영양 공급 흐름 확인할예정`,
        `다음방문시에는 위너프에이플러스 혈관 통증이나 정맥 자극성 피드백 확인할예정`,
        `다음방문시에는 위너프에이플러스 오메가3 조성 관련 반응 확인할예정`,
        `다음방문시에는 위너프에이플러스 분만 후 식이 지연 환자에서 단백 보충 반응 확인할예정`,
        `다음방문시에는 위너프에이플러스 부인과 수술 후 회복기 환자에서 영양 공급 속도 확인할예정`,
      ];

  const crossProductCandidates = otherProduct === '위너프에이플러스'
    ? [
        '다음방문시에는 위너프에이플러스 수술 후 회복기 단백 보충 반응 확인할예정',
        '다음방문시에는 위너프에이플러스 혈관 통증과 삼투압 차이 확인할예정',
        '다음방문시에는 위너프에이플러스 산후 회복기 환자에서 영양 공급 차이 확인할예정',
      ]
    : otherProduct === '페린젝트'
      ? [
          '다음방문시에는 페린젝트 경구용철분제 못 쓰는 환자 전환 포인트 확인할예정',
          '다음방문시에는 페린젝트 수술 전후 빈혈 환자 Hb 회복 속도 확인할예정',
          '다음방문시에는 페린젝트 산후 빈혈 환자에서 외래 편의성 확인할예정',
        ]
      : [];

  const themeCandidates = [
    `다음방문시에는 ${product} ${theme} 환자에서 투여 시점과 반응 확인할예정`,
    `다음방문시에는 ${product} ${theme} 환자에서 처방 경험 여부 확인할예정`,
    `다음방문시에는 ${product} ${theme} 환자에서 다른 특장점 확인할예정`,
  ];

  const candidates = [...productCandidates, ...crossProductCandidates, ...themeCandidates].filter((candidate) =>
    getDetailKeyOverlap(log, candidate).length === 0 &&
    !hasAnyDetailKeyOverlap(candidate, usedKeys)
  );

  if (candidates.length > 0) {
    const preferred = crossProductCandidates.filter((candidate) =>
      getDetailKeyOverlap(log, candidate).length === 0 &&
      !hasAnyDetailKeyOverlap(candidate, usedKeys) &&
      !hasRepeatedDetailBetweenLogAndStrategy(log, candidate, usedKeys) &&
      extractDetailKeys(candidate).some((key) => !logKeys.has(key))
    );
    const weighted = preferred.length > 0
      ? [...preferred, ...preferred, ...candidates]
      : candidates;
    const chosen = weighted[seed % weighted.length];
    if (hasRepeatedDetailBetweenLogAndStrategy(log, chosen, usedKeys) || getDetailKeyOverlap(log, chosen).length > 0) {
      return `다음방문시에는 ${product} ${theme} 환자에서 다른 디테일 확인할예정`;
    }
    return chosen;
  }

  return `다음방문시에는 ${product} ${theme} 환자에서 투여 시점과 반응 확인할예정`;
}

function ensureProductNameInLog(text: string, activeProducts: string[], department: string): string {
  const products = activeProducts.length > 0 ? activeProducts : getAllowedProductsForDepartment(department);
  const mentioned = products.some((product) => text.includes(product));
  if (mentioned) return text;
  const product = products[0] || '위너프에이플러스';
  return `${product} ${text}`.trim();
}

function ensureProductFeatureOwnership(text: string, activeProducts: string[] = [], department = ''): string {
  let result = text.trim();
  const winnerFeature = /(아미노산\s*25%\s*증가|포도당\s*(?:부담\s*)?감소|고아미노산|저포도당|오메가3|질소균형)/;
  const ferricFeature = /(1회\s*투여|Hb\s*회복|철결핍\s*빈혈|수혈\s*부담\s*감소)/;
  const primaryProduct = activeProducts[0] || getAllowedProductsForDepartment(department)[0] || '위너프에이플러스';

  if (primaryProduct === '위너프에이플러스' && winnerFeature.test(result) && !result.includes('위너프에이플러스')) {
    result = `위너프에이플러스 ${result}`;
  }
  if (primaryProduct === '페린젝트' && ferricFeature.test(result) && !result.includes('페린젝트')) {
    result = `페린젝트 ${result}`;
  }
  return result.replace(/\s{2,}/g, ' ').trim();
}

function removeEmptyReactionRequests(text: string): string {
  return text
    .replace(/반응\s*확인\s*요청도\s*드림/g, '')
    .replace(/반응\s*확인\s*요청도드림/g, '')
    .replace(/반응\s*확인\s*드림/g, '')
    .replace(/반응확인\s*요청도\s*드림/g, '')
    .replace(/반응확인\s*요청도드림/g, '')
    .replace(/반응확인\s*요청/g, '')
    .replace(/반응확인/g, '')
    .replace(/특장점\s*반응\s*확인\s*드림/g, '')
    .replace(/특장점\s*반응\s*확인함/g, '')
    .replace(/특장점\s*반응\s*확인/g, '')
    .replace(/특장점\s*반응\s*확인\s*요청\s*드림/g, '')
    .replace(/특장점\s*반응\s*확인\s*요청함/g, '')
    .replace(/특장점\s*반응\s*확인\s*요청/g, '')
    .replace(/반응\s*확인\s*요청\s*드림/g, '')
    .replace(/반응\s*확인\s*요청함/g, '')
    .replace(/반응\s*확인\s*요청/g, '')
    .replace(/요청\s*드림/g, '')
    .replace(/제품\s*내용/g, '제품 디테일')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s*[,，]\s*$/g, '')
    .trim();
}

function formatProductWeights(department: string): string {
  const rule = getDeptProductRule(department);
  if (!rule.weighted) return '별도 가중치 없음';
  return rule.weightedProducts
    .map((product) => `${product.name} ${product.weight ?? 0}%`)
    .join(', ');
}

function normalizeSelectedProductsForDepartment(selectedProducts: string[], department: string): string[] {
  const allowedProducts = getAllowedProductsForDepartment(department);
  const normalized = selectedProducts
    .map((product) => {
      if (product === '플라주') return '플라주OP';
      return product;
    })
    .filter((product) => VISIT_GENERATION_PRODUCT_SET.has(product))
    .filter((product) => allowedProducts.includes(product));
  return normalized.length > 0 ? normalized : allowedProducts;
}

function buildProductFitConstraint(department: string, selectedProducts: string[] = [], activeProductsOverride?: string[]): string {
  const allowedProducts = getAllowedProductsForDepartment(department);
  const activeProducts = activeProductsOverride ?? getActiveProductsForGeneration(selectedProducts, department);
  const weightLine = formatProductWeights(department);
  const ignoredProducts = selectedProducts
    .map((product) => {
      if (product === '플라주') return '플라주OP';
      return product;
    })
    .filter((product) => !allowedProducts.includes(product));
  const ignoredLine = ignoredProducts.length > 0
    ? `\n- 제외된 품목: ${[...new Set(ignoredProducts)].join(', ')}. 이 과(${department})에 맞지 않으므로 출력 금지.`
    : '';

  return `\n★★★ 과별 품목 제한:
- 이 과(${department})에서 사용할 수 있는 품목만 출력: ${allowedProducts.join(', ')}
- 기본 생성 가중치: ${weightLine}
- 오늘 작성 후보 품목: ${activeProducts.join(', ')}
- 위 목록 밖 품목은 제품 목록, 영업일지, 다음방문전략 어디에도 새로 넣지 말 것.${ignoredLine}\n`;
}

type DeptFeatureRule = {
  keywords: string[];
  allowedThemes: string[];
  disallowedThemes: string[];
};

const DEPT_FEATURE_RULES: DeptFeatureRule[] = [
  {
    keywords: ['정형외과'],
    allowedThemes: ['수술 전후 빈혈', 'Hb 회복', '수혈 부담 감소', '재활 회복', '통증 관리', '염증 관리', '출혈 관리', '외래 투여 편의'],
    disallowedThemes: ['IBD', '크론', '궤양성대장염', '위장관', '장염', '장관', '대장', '소화기내과', 'GI'],
  },
  {
    keywords: ['산부인과', '산과', '부인과'],
    allowedThemes: ['산후 빈혈', '수술 전후 빈혈', '출혈 후 회복', 'Hb 회복', '수혈 부담 감소', '외래 편의'],
    disallowedThemes: ['IBD', '크론', '궤양성대장염', '위장관', '장염', '장관', '대장', '소화기내과', 'GI'],
  },
  {
    keywords: ['소화기내과', '소화기', 'IBD', '위장관'],
    allowedThemes: ['IBD', '위장관 출혈', '장관 영양', '수술 전후 빈혈', '수혈 부담 감소', '회복', '외래 편의'],
    disallowedThemes: ['정형외과 환자군', '산부인과 환자군'],
  },
  {
    keywords: ['호흡기내과', '호흡기', '결핵'],
    allowedThemes: ['호흡기 감염', '폐렴', '결핵', '항생제 치료', '경구 섭취 어려움', '회복'],
    disallowedThemes: ['IBD', '크론', '궤양성대장염', '대장', '장염', '정형외과', '산부인과'],
  },
  {
    keywords: ['마취통증의학과', '마취통증', '마취과', '통증의학'],
    allowedThemes: ['수술 전후 통증 조절', '마취 후 회복', '진통', 'opioid-sparing', '회복실', '수술실'],
    disallowedThemes: ['IBD', '크론', '궤양성대장염', '위장관', '대장', '정형외과 환자군'],
  },
  {
    keywords: ['외과', '일반외과', '복부외과', '대장항문외과'],
    allowedThemes: ['수술 전후', '출혈 관리', '회복', '위장관', '장관 영양', '대장항문', 'IBD', '복부 수술', '영양'],
    disallowedThemes: [],
  },
  {
    keywords: ['흉부외과', '심혈관외과', '심장외과'],
    allowedThemes: ['흉부 수술', '심장 수술', '수술 전후 회복', '출혈 관리', 'ICU', '혈역학', '영양'],
    disallowedThemes: ['IBD', '크론', '궤양성대장염', '정형외과'],
  },
  {
    keywords: ['간담췌외과', '간담'],
    allowedThemes: ['간담췌 수술', '복부 대수술', '수술 전후', '출혈 관리', '영양', '회복'],
    disallowedThemes: ['IBD', '크론', '궤양성대장염', '정형외과'],
  },
  {
    keywords: ['중환자의학과', '중환자', 'ICU'],
    allowedThemes: ['ICU', '중증 환자', '혈역학', '감염', '영양', '회복', '수술 후'],
    disallowedThemes: ['IBD', '크론', '궤양성대장염', '정형외과'],
  },
  {
    keywords: ['신경외과'],
    allowedThemes: ['뇌수술', '척추수술', '수술 전후', 'ICU', '회복', '출혈 관리', '중증 환자'],
    disallowedThemes: ['IBD', '크론', '궤양성대장염', '위장관', '대장', '소화기내과', '정형외과'],
  },
];

function getDeptFeatureRule(department: string): DeptFeatureRule | undefined {
  const normalized = department.trim();
  return DEPT_FEATURE_RULES.find((rule) => rule.keywords.some((k) => normalized.includes(k)));
}

function buildDepartmentFeatureConstraint(department: string): string {
  const rule = getDeptFeatureRule(department);

  // 응급의학과/마취과 전용 추가 제약
  const isEr = /응급의학과|응급의학/.test(department);
  const isAnes = /마취과|마취통증|통증의학/.test(department);
  const noOutpatientNote = (isEr || isAnes)
    ? '\n- ★ 이 과는 외래 진료를 하지 않음. "외래", "외래 환자", "외래 추적", "외래 재방문" 표현 절대 금지.'
    : '';
  const erNote = isEr
    ? '\n- 응급의학과 방문은 플라주OP 신규사입(병원 코딩 등재) 목적. 프로토콜 도입/검토 방향으로 작성.'
    : '';

  if (!rule) return noOutpatientNote + erNote ? `\n★★★ 과별 제한:${noOutpatientNote}${erNote}\n` : '';

  return `\n★★★ 과별 특장점 제한:
- 이 과(${department})에서는 다음 테마만 중심적으로 사용: ${rule.allowedThemes.join(', ')}
- 이 과(${department})에 맞지 않는 테마는 쓰지 말 것: ${rule.disallowedThemes.join(', ') || '없음'}
- 허용 테마는 참고용이며, 한 문장에 테마는 하나만 사용.${noOutpatientNote}${erNote}\n`;
}

function removeDisallowedProductSentences(text: string, department: string): string {
  const allowedProducts = getAllowedProductsForDepartment(department);
  const disallowedProducts = ['위너프에이플러스', '위너프', '페린젝트', '플라주OP', '플라주', '이부프로펜프리믹스', '포스페넴', '프리페넴', '제이세덱스']
    .filter((product) => {
      const normalized = product === '플라주'
          ? '플라주OP'
          : product;
      return !allowedProducts.includes(normalized);
    });
  if (!disallowedProducts.some((product) => text.includes(product))) return text;

  const kept = text
    .split(/(?<=[.。!?])\s+|[,，]\s*|\n+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean)
    .filter((sentence) => !disallowedProducts.some((product) => sentence.includes(product)));
  return kept.join(' ').trim();
}

function removeDisallowedDepartmentThemeSentences(text: string, department: string): string {
  const rule = getDeptFeatureRule(department);
  if (!rule) return text;

  const disallowedThemes = rule.disallowedThemes.filter(Boolean);
  if (disallowedThemes.length === 0) return text;

  const kept = text
    .split(/(?<=[.。!?])\s+|[,，]\s*|\n+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean)
    .filter((sentence) => !disallowedThemes.some((theme) => sentence.includes(theme)));
  return kept.join(' ').trim();
}

const ICU_DEPTS = [
  '중환자의학과', '중환자외과', '외상중환자외과', '응급외상중환자외과',
  '호흡기내과', '호흡기', '신경외과', '흉부외과', '심혈관외과', '심장외과',
  '응급의학과', '응급', '외상외과', '외상', 'GS', '일반외과'
];
const NON_ICU_DEPTS = ['정형외과', 'OS', '재활의학과', '피부과', '안과', '이비인후과'];
const ICU_KEYWORDS = ['icu', '중환', '중증', '패혈', '외상', '인공호흡', 'ventilator'];

function isIcuDepartment(department: string): boolean {
  const normalized = department.trim();
  const upper = normalized.toUpperCase();
  if (NON_ICU_DEPTS.some(d => upper.includes(d.toUpperCase()))) return false;
  return ICU_DEPTS.some(d => upper.includes(d.toUpperCase()));
}

function hasIcuContext(content: string, context = ''): boolean {
  const text = `${content} ${context}`.toLowerCase();
  return ICU_KEYWORDS.some(k => text.includes(k.toLowerCase()));
}

function isIcuOnlySnippet(snippet: { content: string; context?: string }): boolean {
  return hasIcuContext(snippet.content, snippet.context);
}

function buildIcuContextNote(department: string): string {
  if (!isIcuDepartment(department)) return '';
  return `[중요] 이 과(${department})는 ICU/중증 환자를 담당합니다.
제품 디테일 중 ICU/중증/수술/감염 관련 내용을 다른 내용보다 비중 있게 활용할 것.
단, ICU 내용만 고집하지 말고 환자군과 맥락에 따라 적절히 섞어서 사용할 것.`;
}

function buildFullContext(doctor: Doctor, pastLogs: VisitLog[]): { systemPrompt: string; contextSection: string } {
  const systemPrompt = buildSystemPrompt();
  const contextSection = buildContextSection(doctor, pastLogs);
  return { systemPrompt, contextSection };
}

async function trimToLimit(systemPrompt: string, text: string, limit: number, attempt = 0, label = '영업일지'): Promise<string> {
  if (text.length <= limit) return text;

  const retryNote = attempt > 0
    ? `★★ ${attempt}번 시도했지만 아직 ${text.length}자입니다. 반드시 이번엔 ${limit}자 이내로 완성된 문장으로 끝낼 것.\n`
    : '';
  const prompt = `${retryNote}아래 ${label}가 ${text.length}자입니다. 반드시 ${limit}자 이내로 줄여주세요.

규칙:
- 핵심 내용 보존, 말투/톤 유지
- 문장 중간에 자르지 말고 완성된 문장으로 끝낼 것
- 큰따옴표("), 작은따옴표(') 금지
- 본문만 출력. 글자수 표기, 설명 붙이지 말 것

원문:
${text}`;

  const result = await callAI(systemPrompt, prompt);
  let trimmed = result.replace(/^===.*===\s*/gm, '').replace(/['"]/g, '').trim();
  trimmed = normalizeMemoTone(trimmed);

  if (trimmed.length <= limit) return trimmed;

  // 최대 2회 AI 재시도
  if (attempt < 2) {
    return trimToLimit(systemPrompt, trimmed, limit, attempt + 1, label);
  }

  // 최후 수단: 마지막 완성된 문장에서 컷
  return compressTextToLimit(trimmed, limit);
}

// 외부 사례 패턴을 자연스러운 예시 메모 문장으로 변환 (few-shot 추가 예시용)
function buildExampleMemoFromExternalCase(pattern: { product: string; detailAxis: string; reactionPattern?: string; nextAction?: string; styleExampleMemo?: string }): string {
  if (pattern.styleExampleMemo?.trim()) return pattern.styleExampleMemo.trim();
  const parts: string[] = [];
  parts.push(`${pattern.product} ${pattern.detailAxis} 말씀드렸더니`);
  if (pattern.reactionPattern) parts.push(`교수님 ${pattern.reactionPattern}`);
  if (pattern.nextAction) parts.push(`다음엔 ${pattern.nextAction}`);
  return parts.join('. ') + '.';
}

// 배치 내 이미 사용한 특장점 표현 추출 — 반복 방지용
function buildBatchDiversityNote(avoidTexts: string[], product: string): string {
  if (!avoidTexts.length) return '';
  const fullText = avoidTexts.join(' ');
  const used: string[] = [];

  if (product === '위너프에이플러스') {
    if (/아미노산\s*25%/.test(fullText)) used.push('아미노산 25% 증가');
    if (/포도당\s*부담\s*감소/.test(fullText)) used.push('포도당 부담 감소');
    if (/단백\s*보충/.test(fullText)) used.push('단백 보충');
    if (/혈당\s*추이/.test(fullText)) used.push('혈당 추이');
    if (/고단백/.test(fullText)) used.push('고단백 조성');
  }
  if (product === '페린젝트') {
    if (/1회\s*투여/.test(fullText)) used.push('1회 투여');
    if (/Hb\s*회복/.test(fullText)) used.push('Hb 회복');
    if (/급여\s*기준/.test(fullText)) used.push('급여 기준');
    if (/재방문\s*부담/.test(fullText)) used.push('재방문 부담');
    if (/GI\s*트러블/.test(fullText)) used.push('GI 트러블');
  }
  if (!used.length) return '';
  return `\n★★ 이번 배치에서 이미 사용한 특장점 — 단어를 바꿔도 절대 반복 금지: ${used.join(', ')}. 완전히 다른 특장점이나 디테일로 작성할 것.\n`;
}

// 다른 제품의 고유 표현이 섞이지 않도록 batchAvoidTexts 필터링
function filterBatchAvoidTextsForProduct(avoidTexts: string[], product: string): string[] {
  if (product === '위너프에이플러스') {
    // 페린젝트 전용 표현(GI 트러블, 경구용철분제, Hb, 빈혈 등) 제거
    return avoidTexts.map((text) =>
      text
        .split(/(?<=[.。])\s+/)
        .filter((s) => !/GI\s*트러블|경구용철분제|철결핍|빈혈|Hb\s*\d/.test(s))
        .join(' ')
        .trim()
    ).filter(Boolean);
  }
  if (product === '페린젝트') {
    // 위너프에이플러스 전용 표현(아미노산, 포도당, TPN 등) 제거
    return avoidTexts.map((text) =>
      text
        .split(/(?<=[.。])\s+/)
        .filter((s) => !/아미노산\s*\d+%|포도당\s*부담\s*감소|TPN|단백\s*보충/.test(s))
        .join(' ')
        .trim()
    ).filter(Boolean);
  }
  return avoidTexts;
}

function buildBatchAvoidanceNote(avoidTexts: string[]): string {
  const compact = avoidTexts
    .map((text) => reducePointWordUsage(text).replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .slice(-5);
  if (compact.length === 0) return '';
  const detailKeys = [...detailKeysFromTexts(compact)];

  return `\n★★★ 이번 일괄 생성 중 이미 사용한 표현:
${compact.map((text, index) => `${index + 1}. ${text.slice(0, 180)}`).join('\n')}
- 이미 사용한 디테일 축: ${detailKeys.join(', ') || '없음'}
- 위 문장과 같은 오브젝션/답변/디테일 흐름 반복 금지
- 위 디테일 축과 같은 내용은 단어를 바꿔도 반복 금지. 예: "경구용철분제 반응이 더딘 케이스"와 "경구용철분제 반응이 늦는 케이스"는 같은 내용
- 이번 일괄 생성에서 이미 사용한 교수 반응과 같은 의미의 반응 반복 금지. 반복 내원 어려움, 재방문 부담, 외래 재방문 불편, 편의성 인정은 같은 반응으로 간주
- 특히 "비용 부담" + "필요한 케이스부터 보자" 같은 조합을 연속 생성 금지
- 다른 제품 또는 다른 환자군, 다른 반응, 다른 디테일로 작성\n`;
}

function normalizeBatchRepeatedLanguage(text: string, avoidTexts: string[]): string {
  if (avoidTexts.length === 0) return text;
  const joined = avoidTexts.join(' ');
  let result = text;
  if (joined.includes('비용 부담') && result.includes('비용 부담')) {
    result = result
      .replace(/비용\s*부담\s*언급\s*있어/gi, '처방 상황 문의 있어')
      .replace(/비용\s*부담/gi, '처방 상황')
      .replace(/필요한\s*케이스부터\s*보자고\s*안내함/gi, '처방을 고려할 상황부터 안내함');
  }
  if (joined.includes('필요한 케이스부터') && result.includes('필요한 케이스부터')) {
    result = result.replace(/필요한\s*케이스부터/gi, '처방을 고려할 상황부터');
  }
  return result.replace(/\s{2,}/g, ' ').trim();
}

async function ensureObjectionHandling(
  systemPrompt: string,
  formattedLog: string,
  doctor: Doctor,
  activeProducts: string[],
  allowNewDrugReview = false,
  avoidTexts: string[] = []
): Promise<string> {
  if (hasObjectionHandling(formattedLog)) return formattedLog;
  const avoidNote = buildBatchAvoidanceNote(avoidTexts);

  const prompt = `아래 영업일지에 교수님의 질문/반대 의견 1개와 그에 대한 내 답변을 자연스럽게 넣어 다시 작성하세요.

규칙:
- 과: ${doctor.department}
- 허용 품목: ${getAllowedProductsForDepartment(doctor.department).join(', ')}
- 이번 중심 품목: ${activeProducts.join(', ')}
- 과별 특장점 제한: ${buildDepartmentFeatureConstraint(doctor.department).replace(/\n+/g, ' ').trim()}
- 신약여부검토 요청 허용 여부: ${allowNewDrugReview ? '허용. 단, 미도입 품목 문맥에만 1회 가능' : '불허. 미도입 품목이어도 이번에는 특장점 디테일만 진행'}
- 품목 목록 밖 제품 언급 금지
- 질문/반대 의견 + 답변을 둘 다 포함
- 비용 부담 예시는 반복되기 쉬우므로 최근/일괄 생성에 이미 있으면 쓰지 말 것
- 말투는 ~함, ~하심, ~안내함, ~말씀드림 형태
- 전체 230자 이내
- 큰따옴표("), 작은따옴표(') 금지
- 본문만 출력
${avoidNote}

원문:
${formattedLog}`;

  const result = await callAI(systemPrompt, prompt);
  let cleaned = normalizeGeneratedMemoText(result.replace(/['"]/g, '').trim(), doctor.department);
  cleaned = normalizeObjectionLanguage(cleaned, activeProducts);
  cleaned = normalizeIntroProductLanguage(cleaned, activeProducts, allowNewDrugReview);
  cleaned = removeDisallowedProductSentences(cleaned, doctor.department) || cleaned;
  if (cleaned.length > 230) {
    cleaned = await trimToLimit(systemPrompt, cleaned, 230, 0, '영업일지');
  }
  if (cleaned.length > 230) cleaned = compressTextToLimit(cleaned, 230);
  return cleaned;
}

function extractSection(response: string, sectionNames: string[]): string {
  for (let i = 0; i < sectionNames.length; i++) {
    const current = sectionNames[i];
    const next = sectionNames[i + 1];
    const pattern = new RegExp(
      `${current}\\s*([\\s\\S]*?)${next ? `(?:${next})` : '$'}`,
      'i'
    );
    const match = response.match(pattern);
    if (match) {
      return match[1].trim();
    }
  }
  return '';
}

export function compressTextToLimit(text: string, limit: number): string {
  const source = text.trim().replace(/\s+/g, ' ');
  if (source.length <= limit) return source;

  const appendSegments = (granularity: 'sentence' | 'word' | 'grapheme'): string => {
    if (typeof Intl === 'undefined' || typeof Intl.Segmenter !== 'function') return '';
    const segmenter = new Intl.Segmenter('ko', { granularity });
    let result = '';
    for (const { segment } of segmenter.segment(source)) {
      if (!segment) continue;
      const next = result + segment;
      if (next.length <= limit) {
        result = next;
      } else {
        break;
      }
    }
    return result.trim();
  };

  const sentenceTrimmed = appendSegments('sentence');
  if (sentenceTrimmed.length > 0 && sentenceTrimmed.length <= limit) return sentenceTrimmed;

  const wordTrimmed = appendSegments('word');
  if (wordTrimmed.length > 0 && wordTrimmed.length <= limit) return wordTrimmed;

  const graphemeTrimmed = appendSegments('grapheme');
  if (graphemeTrimmed.length > 0 && graphemeTrimmed.length <= limit) return graphemeTrimmed;

  return source.slice(0, limit);
}

// 병원에 아직 미도입된 제품 — 특장점 중심, 가끔만 신약여부검토 요청
const INTRO_PRODUCTS = new Set(['플라주OP', '이부프로펜프리믹스', '제이세덱스', '포스페넴']);

function buildIntroNote(focusProducts: string[], includeNewDrugReview = false): string {
  const introOnes = focusProducts.filter(p => INTRO_PRODUCTS.has(p));
  if (introOnes.length === 0) return '';
  return includeNewDrugReview
    ? `\n★ 미도입 제품 주의 (${introOnes.join(', ')}):
이 제품은 병원에 아직 없는 상태입니다.
→ "처방 늘려달라" / "증량" / "증액" / "지속 처방 부탁" 표현 절대 금지
→ 특장점 1개만 간단히 디테일한 뒤, 본문 중 "신약여부검토 요청"을 1회만 자연스럽게 넣을 것
→ 요청은 자주 넣지 말고, 오늘은 특장점 1개와 요청 1개만 섞어서 마무리`
    : `\n★ 미도입 제품 주의 (${introOnes.join(', ')}):
이 제품은 병원에 아직 없는 상태입니다.
→ "처방 늘려달라" / "증량" / "증액" / "지속 처방 부탁" 표현 절대 금지
→ 1~2개 특장점만 간단히 디테일하고, 신약여부검토 요청은 넣지 말 것
→ 도입 의향은 직접 묻지 말고 특장점만 자연스럽게 전달`;
}

// 응급의학과 신규사입(병원 코딩) 멘트 — 10% 확률로 삽입
function buildProductForbiddenNote(product: string): string {
  if (product === '페린젝트') {
    return `\n★ 페린젝트 맥락: 철결핍 빈혈 + 1회 투여 + Hb 회복. 경구용철분제 GI 트러블 환자 대안.
★ 금지: 아미노산 증가, 포도당 부담 감소, TPN, 단백 보충 — 위너프에이플러스 전용 표현. 절대 쓰지 말 것.\n`;
  }
  if (product === '위너프에이플러스') {
    return `\n★ 위너프에이플러스 맥락: 수술 후/ICU 회복기 단백 보충. 아미노산 25% 증가, 혈당 부담 감소.
★ 금지 — GI 트러블: 이는 경구용철분제 복용 환자의 부작용 표현. 위너프 문장에 절대 쓰지 말 것. 경장영양이 어려운 상황은 반드시 식이 불가, 경장영양 어려운으로만 표현.
★ 금지 — 경구용철분제, 철결핍, 빈혈, Hb 수치: 페린젝트/철분제 전용 맥락. 절대 쓰지 말 것.\n`;
  }
  if (product === '플라주OP') {
    return `\n★ 플라주OP 맥락: 응급/마취 진정 프로토콜 신규사입(병원 코딩 등재). 신규사입 = 약제과 또는 병원 내부 프로세스 통해 코딩 등재하는 절차.
★ 교수 반응 예시: 약제과에 확인해보겠다 / 다른 스탭들과 상의해보겠다 / 마취과랑 협의가 필요할 것 같다 / 병원 내 프로토콜 검토해보겠다. 단순히 담당자 확인이라는 표현 금지.
★ 금지: Hb, 빈혈, 철결핍, 아미노산, 포도당 부담, TPN — 다른 제품 맥락. 절대 쓰지 말 것.\n`;
  }
  return '';
}

function buildDeptContextNote(department: string): string {
  if (/응급의학과|응급의학/.test(department)) {
    return `\n★ 응급의학과 진료 특성: 응급실 = 응급처치 후 해당과 transfer. 외래 진료 없음. 퇴원 전 보충, 외래 재방문, 외래 추적 표현 절대 금지. 플라주OP는 응급실 프로토콜 도입/신규사입 검토 목적으로 디테일.\n`;
  }
  return '';
}

function buildErNewDrugCodeNote(department: string): string {
  if (!/응급의학과|응급의학/.test(department)) return '';
  if (Math.random() >= 0.1) return '';
  return `\n★ 이번 방문에 플라주OP 신규사입(병원 코딩 등재) 검토 부탁 멘트를 자연스럽게 1회 포함할 것.
예: "플라주OP 신규사입 검토 부탁드렸더니 검토해보겠다 하심", "병원 코딩 건 여쭤봤더니 담당자와 확인해보겠다 하심"
→ 강요하거나 반복하지 말고 자연스럽게 1번만.\n`;
}

function buildLearningPreferenceNote(doctor: Doctor, products: string[], mode: 'auto' | 'manual'): string {
  const preferences = preferenceStorage.getForGeneration(doctor, products).filter((pref) => pref.confidence > 0);
  if (preferences.length === 0) return '';
  const forbidden = [...new Set(preferences.flatMap((pref) => pref.forbiddenPatterns ?? []))].slice(0, 8);
  const preferred = [...new Set(preferences.flatMap((pref) => pref.preferredPatterns ?? []))].slice(0, 8);
  const detailAxes = [...new Set(preferences.flatMap((pref) => pref.preferredDetailAxes ?? []))].slice(0, 5);
  const summaries = preferences
    .slice(0, 4)
    .map((pref) => `${pref.scope}:${pref.scopeKey || '전체'}(${pref.confidence}) ${pref.summary}`)
    .join(' / ');
  const modeRule = mode === 'manual'
    ? '메모편집에서는 사용자 원문에 있는 제품명, 수치, 환자 상황, 교수 반응을 절대 다른 내용으로 바꾸지 말고, 원문에 없는 연결과 다음방문전략만 보강.'
    : '자동생성에서는 금지 패턴을 후보에서 제외하고 선호 패턴은 과/제품 맥락에 맞을 때만 반영.';
  return `\n★★★ 사용자 수정 학습 반영:
- 적용 범위: ${summaries}
- 사용자가 지우거나 버린 표현/흐름: ${forbidden.length ? forbidden.join(' / ') : '없음'}
- 사용자가 추가하거나 선호한 표현/흐름: ${preferred.length ? preferred.join(' / ') : '없음'}
- 선호 디테일 축: ${detailAxes.length ? detailAxes.join(' / ') : '없음'}
- ${modeRule}
`;
}

// ──────────────────────────────────────────────────────────────────
// 참고 메모 선택 — 우선순위: 이 교수 저장 로그 → 외부 사례 → 템플릿 exampleMemo
// ──────────────────────────────────────────────────────────────────
function findBestReferenceMemo(
  doctor: Doctor,
  product: string,
  pastLogs: VisitLog[],
  templateExampleMemo?: string
): string {
  // 1순위: 외부 사례 패턴 (같은 진료과 + 같은 품목) — 직접 큐레이션된 가장 신뢰할 수 있는 스타일 예시
  // 여러 개 있으면 랜덤 선택 → 매번 다른 스타일 참고, 다양성 확보
  const externalPatterns = externalCasePatternStorage.getForGeneration(doctor.department, [product]);
  const goodExternal = externalPatterns.filter(
    (p: { product: string; reactionPattern?: string; styleExampleMemo?: string }) => p.product === product && (p.styleExampleMemo || p.reactionPattern)
  );
  if (goodExternal.length > 0) {
    const picked = goodExternal[Math.floor(Math.random() * goodExternal.length)];
    return buildExampleMemoFromExternalCase(picked);
  }

  // 2순위: 이 교수의 같은 품목 저장 방문일지 중 가장 최근 것
  const sameDocSameProd = pastLogs
    .filter(l => l.formattedLog && l.formattedLog.length >= 50 && l.products?.includes(product))
    .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
  if (sameDocSameProd.length > 0) return sameDocSameProd[0].formattedLog;

  // 3순위: 이 교수의 방문일지 (품목 무관)
  const sameDoc = pastLogs
    .filter(l => l.formattedLog && l.formattedLog.length >= 50)
    .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
  if (sameDoc.length > 0) return sameDoc[0].formattedLog;

  // 4순위: 템플릿 exampleMemo (최후 fallback)
  if (templateExampleMemo) return templateExampleMemo;

  return '';
}

async function convertToVisitLogBase(
  rawNotes: string,
  doctor: Doctor,
  pastLogs: VisitLog[],
  selectedProducts: string[] = [],
  pipelinePlan?: DetailKey
): Promise<{ formattedLog: string; nextStrategy: string }> {
  const systemPrompt = buildSimpleSystemPrompt();
  const activeProducts = getActiveProductsForGeneration(selectedProducts, doctor.department, rawNotes);
  const lastLog = pastLogs[0];

  const goldenFewShot = await buildGoldenFewShot(doctor.department, getAllowedProductsForDepartment(doctor.department));

  const prompt = `교수: ${doctor.name} (${doctor.department}, ${doctor.hospital})
${doctor.notes ? `특이사항: ${doctor.notes}` : ''}
${lastLog ? `지난 방문(${lastLog.visitDate}): ${lastLog.formattedLog.slice(0, 80)}` : ''}
오늘 품목: ${activeProducts[0]}

[원본 메모]
{{RAW_MEMO}}
${goldenFewShot ? `\n${goldenFewShot}\n` : ''}
[작성 지침 — 원본 메모의 내용(상황·반응·제품명)을 유지하면서 예시와 같은 문체·길이로 다듬기]
- 흐름: 제품 특장점 설명 → 교수님 반응 → (가끔) 다음 방향 한 줄
- 본문 100~230자, 다음방문전략 120자 이내
- 오늘 품목(${activeProducts[0]})만 사용, 다른 과 질환·제품 섞지 말 것
- 페린젝트는 1회 투여, 따옴표 금지
- 종결: ~함/~하심/~예정/~드림

응답 형식:
===영업일지===
(메모 본문)

===다음방문전략===
(다음방문시에는 으로 시작, 120자 이내)`;

  const response = await callVisitLogAI(
    systemPrompt,
    prompt.replace('{{RAW_MEMO}}', rawNotes),
    buildVisitGenerationOptions([doctor.id, doctor.department, 'convert', String(pastLogs.length), String(selectedProducts.length)])
  );
  let cleaned = extractSection(response, ['===영업일지===', '===다음방문전략===']);
  let nextStrategy = extractSection(response, ['===다음방문전략===']);

  cleaned = cleaned.replace(/['"]/g, '').trim();
  nextStrategy = nextStrategy.replace(/['"]/g, '').trim();

  // nextStrategy에 "다음방문시에는" 문장이 2개 이상이면 첫 번째만 유지
  const nextStrategyDupMatches = [...nextStrategy.matchAll(/다음\s*방문(?:시에는|에는)/g)];
  if (nextStrategyDupMatches.length > 1 && nextStrategyDupMatches[1].index !== undefined) {
    nextStrategy = nextStrategy.slice(0, nextStrategyDupMatches[1].index).trim();
  }

  cleaned = normalizeGeneratedMemoText(cleaned, doctor.department);
  cleaned = normalizeObjectionLanguage(cleaned, activeProducts);
  cleaned = finalizeVisitLogBody(cleaned, activeProducts, doctor.department);
  nextStrategy = reducePointWordUsage(nextStrategy);
  nextStrategy = finalizeVisitStrategy(nextStrategy, activeProducts, doctor.department, cleaned);

  // nextStrategy 누락 시: formattedLog 끝에 묻혀있는 경우 분리
  if (!nextStrategy) {
    const markers = ['다음방문시에는', '다음번에는', '다음에는'];
    const lines = cleaned.split('\n');
    const splitIdx = lines.findIndex(l => markers.some(m => l.trim().startsWith(m)));
    if (splitIdx > 0) {
      nextStrategy = lines.slice(splitIdx).join('\n').trim();
      cleaned = lines.slice(0, splitIdx).join('\n').trim();
    }
  }

  // 그래도 없으면 별도 호출로 생성
  if (!nextStrategy) {
    nextStrategy = await generateNextVisitStrategy(doctor, pastLogs);
  }

  if (cleaned.length > 230) {
    cleaned = await trimToLimit(systemPrompt, cleaned, 230, 0, '영업일지');
  }
  if (cleaned.length > 230) cleaned = compressTextToLimit(cleaned, 230);

  cleaned = finalizeVisitLogBody(cleaned, activeProducts, doctor.department);

  nextStrategy = finalizeVisitStrategy(nextStrategy, activeProducts, doctor.department, cleaned);
  if (nextStrategy.length > 120) {
    nextStrategy = await trimToLimit(systemPrompt, nextStrategy, 120, 0, '다음방문전략');
  }
  nextStrategy = finalizeVisitStrategy(nextStrategy, activeProducts, doctor.department, cleaned);
  if (nextStrategy.length > 120) nextStrategy = compressTextToLimit(nextStrategy, 120);

  // 최종 폴백: 여전히 비어있으면 하드코딩
  if (!nextStrategy) {
    const prod = activeProducts[0] || '위너프에이플러스';
    nextStrategy = `다음방문시에는 ${prod} 추가 디테일 및 처방 여부 확인할예정`;
  }

  const finalLog = stripEmbeddedNextVisitPlan(cleaned, doctor.department);
  const finalStrategy = finalizeVisitStrategy(nextStrategy, activeProducts, doctor.department, finalLog);

  return {
    formattedLog: finalLog,
    nextStrategy: finalStrategy,
  };
}

async function autoGenerateVisitLogBase(
  doctor: Doctor,
  pastLogs: VisitLog[],
  selectedProducts: string[] = [],
  batchAvoidTexts: string[] = [],
  pipelinePlan?: DetailKey
): Promise<{ formattedLog: string; nextStrategy: string; visitDate: string; products: string[] }> {
  const systemPrompt = buildSimpleSystemPrompt();
  const activeProducts = getActiveProductsForGeneration(selectedProducts, doctor.department);

  const today = new Date().toISOString().split('T')[0];
  // 다른 제품의 고유 표현이 이번 생성 맥락을 오염시키지 않도록 필터링 후 전달
  const filteredBatchAvoidTexts = filterBatchAvoidTextsForProduct(batchAvoidTexts, activeProducts[0]);
  const lastLog = pastLogs[0];

  const goldenFewShot = await buildGoldenFewShot(doctor.department, getAllowedProductsForDepartment(doctor.department));

  const prompt = `교수: ${doctor.name} (${doctor.department}, ${doctor.hospital})
${doctor.notes ? `특이사항: ${doctor.notes}` : ''}
${lastLog ? `지난 방문(${lastLog.visitDate}): ${lastLog.formattedLog.slice(0, 80)}` : '첫 방문'}
오늘(${today}) 이 교수를 방문했다고 가정하고 실제로 있을 법한 영업 현장 메모를 작성하세요.

오늘 품목: ${activeProducts[0]}
${pipelinePlan ? `오늘 주제: ${pipelinePlan.detailAxis}
다음 방향: ${pipelinePlan.nextAction}` : ''}
${goldenFewShot ? `\n${goldenFewShot}\n` : ''}
[작성 지침]
- 흐름: 제품 특장점 설명 → 교수님 반응 → (30% 확률 오브젝션+답변) → 다음 방향 한 줄
- 본문 100~230자, 다음방문전략 120자 이내
- 오늘 품목(${activeProducts[0]})만 사용, 다른 과 질환·제품 섞지 말 것
- 페린젝트는 1회 투여, 따옴표 금지
- 종결: ~함/~하심/~예정/~드림

응답 형식:
===제품===
(해당 제품명)

===영업일지===
(메모 본문)

===다음방문전략===
(다음방문시에는 으로 시작, 120자 이내)`;

  const response = await callVisitLogAI(
    systemPrompt,
    prompt,
    buildVisitGenerationOptions([doctor.id, doctor.department, 'auto', String(pastLogs.length), batchAvoidTexts.join('|').slice(0, 120)])
  );

  const productMatch = response.match(/===제품===\s*([\s\S]*?)(?:===(?:영업일지|전문영업일지)===|$)/);
  const logMatch = response.match(/===(?:영업일지|전문영업일지)===\s*([\s\S]*?)(?:===다음방문전략===|$)/);
  const strategyMatch = response.match(/===다음방문전략===\s*([\s\S]*?)$/);

  const productText = productMatch ? productMatch[1].trim() : '';
  const KNOWN_PRODUCTS = ['위너프에이플러스', '페린젝트', '플라주OP'];
  const allowedProducts = getAllowedProductsForDepartment(doctor.department);
  const products = productText
    .split(/[,，、]/)
    .map((p) => p.trim())
    .filter((p) => KNOWN_PRODUCTS.some(k => p === k || p.startsWith(k) || k.startsWith(p)))
    .filter((p) => VISIT_GENERATION_PRODUCT_SET.has(p))
    .filter((p) => allowedProducts.includes(p));

  let fullLog = logMatch
    ? logMatch[1].trim()
    : extractSection(response, ['===영업일지===', '===다음방문전략===']);
  let nextStrategy = strategyMatch
    ? strategyMatch[1].trim()
    : extractSection(response, ['===다음방문전략===']);

  fullLog = fullLog.replace(/['"]/g, '').trim();
  nextStrategy = nextStrategy.replace(/['"]/g, '').trim();

  // nextStrategy에 "다음방문시에는" 문장이 2개 이상이면 첫 번째만 유지
  const autoStrategyDupMatches = [...nextStrategy.matchAll(/다음\s*방문(?:시에는|에는)/g)];
  if (autoStrategyDupMatches.length > 1 && autoStrategyDupMatches[1].index !== undefined) {
    nextStrategy = nextStrategy.slice(0, autoStrategyDupMatches[1].index).trim();
  }

  fullLog = normalizeGeneratedMemoText(fullLog, doctor.department);
  fullLog = finalizeVisitLogBody(fullLog, activeProducts, doctor.department);
  nextStrategy = reducePointWordUsage(nextStrategy);
  nextStrategy = finalizeVisitStrategy(nextStrategy, activeProducts, doctor.department, fullLog);

  // nextStrategy 누락 시: formattedLog 끝에 묻혀있는 경우 분리
  if (!nextStrategy) {
    const markers = ['다음방문시에는', '다음번에는', '다음에는'];
    const lines = fullLog.split('\n');
    const splitIdx = lines.findIndex(l => markers.some(m => l.trim().startsWith(m)));
    if (splitIdx > 0) {
      nextStrategy = lines.slice(splitIdx).join('\n').trim();
      fullLog = lines.slice(0, splitIdx).join('\n').trim();
    }
  }

  // 그래도 없으면 별도 호출로 생성
  if (!nextStrategy) {
    nextStrategy = await generateNextVisitStrategy(doctor, pastLogs);
  }

  if (fullLog.length > 230) {
    fullLog = await trimToLimit(buildSystemPrompt(), fullLog, 230, 0, '영업일지');
  }
  if (fullLog.length > 230) fullLog = compressTextToLimit(fullLog, 230);

  fullLog = normalizeGeneratedMemoText(fullLog, doctor.department);
  fullLog = normalizeObjectionLanguage(fullLog, activeProducts);
  fullLog = normalizeBatchRepeatedLanguage(fullLog, filteredBatchAvoidTexts);
  fullLog = finalizeVisitLogBody(fullLog, activeProducts, doctor.department);

  nextStrategy = finalizeVisitStrategy(nextStrategy, activeProducts, doctor.department, fullLog);
  if (nextStrategy.length > 120) {
    nextStrategy = await trimToLimit(buildSystemPrompt(), nextStrategy, 120, 0, '다음방문전략');
  }
  nextStrategy = finalizeVisitStrategy(nextStrategy, activeProducts, doctor.department, fullLog);
  if (nextStrategy.length > 120) nextStrategy = compressTextToLimit(nextStrategy, 120);

  // 최종 폴백: 여전히 비어있으면 하드코딩
  if (!nextStrategy) {
    const prod = activeProducts[0] || '위너프에이플러스';
    nextStrategy = `다음방문시에는 ${prod} 추가 디테일 및 처방 여부 확인할예정`;
  }

  const finalLog = stripEmbeddedNextVisitPlan(fullLog, doctor.department);
  const finalStrategy = finalizeVisitStrategy(nextStrategy, activeProducts, doctor.department, finalLog);

  return {
    visitDate: today,
    products: products.length > 0 ? products : activeProducts,
    formattedLog: normalizeBatchRepeatedLanguage(finalLog, batchAvoidTexts),
    nextStrategy: normalizeBatchRepeatedLanguage(finalStrategy, batchAvoidTexts),
  };
}

function logPipelineTrace(result: { trace?: unknown }) {
  if (import.meta.env.DEV && result.trace) {
    console.debug('[PipelineTrace]', result.trace);
  }
}

async function generateBaseFromExistingFlow(
  input: VisitGenerationInput,
  _plan: DetailKey
) {
  if (input.mode === 'manual') {
    return convertToVisitLogBase(
      input.manualRawNotes ?? '',
      input.doctor,
      input.pastLogs,
      input.selectedProducts,
      _plan
    );
  }

  return autoGenerateVisitLogBase(
    input.doctor,
    input.pastLogs,
    input.selectedProducts,
    input.batchAvoidTexts,
    _plan
  );
}

export async function convertToVisitLog(
  rawNotes: string,
  doctor: Doctor,
  pastLogs: VisitLog[],
  selectedProducts: string[] = []
): Promise<{ formattedLog: string; nextStrategy: string; templateId?: string }> {
  const result = await runVisitGenerationPipeline(
    {
      mode: 'manual',
      doctor,
      pastLogs,
      selectedProducts,
      batchAvoidTexts: [],
      manualRawNotes: rawNotes,
    },
    { generateBase: generateBaseFromExistingFlow }
  );
  logPipelineTrace(result);
  return {
    formattedLog: result.formattedLog,
    nextStrategy: result.nextStrategy,
    templateId: result.templateId,
  };
}

export async function autoGenerateVisitLog(
  doctor: Doctor,
  pastLogs: VisitLog[],
  selectedProducts: string[] = [],
  batchAvoidTexts: string[] = [],
  batchUsedTemplateIds: string[] = [],
  batchUsedProducts: string[] = []
): Promise<{ formattedLog: string; nextStrategy: string; visitDate: string; products: string[]; templateId?: string }> {
  const result = await runVisitGenerationPipeline(
    {
      mode: 'auto',
      doctor,
      pastLogs,
      selectedProducts,
      batchAvoidTexts,
      batchUsedTemplateIds,
      batchUsedProducts,
    },
    { generateBase: generateBaseFromExistingFlow }
  );
  logPipelineTrace(result);
  return {
    formattedLog: result.formattedLog,
    nextStrategy: result.nextStrategy,
    visitDate: result.visitDate,
    products: result.products,
    templateId: result.templateId,
  };
}

export async function generateNextVisitStrategy(
  doctor: Doctor,
  pastLogs: VisitLog[]
): Promise<string> {
  const ctx = buildContext(doctor, pastLogs, [], [], [], [], undefined);
  const plan = preCheckUniqueness(buildPlan(ctx), ctx);
  const allowedProducts = getAllowedProductsForDepartment(doctor.department);
  const themeRule = getDeptFeatureRule(doctor.department);
  const theme = themeRule?.allowedThemes[0] || '환자군';

  const base = (plan.nextAction || plan.detailAxis || `${plan.product} ${theme} 적용 가능 케이스 확인`).trim();
  const normalizedBase = base
    .replace(/^다음방문시에는\s*/g, '')
    .replace(/^다음에는\s*/g, '')
    .replace(/(?:할예정|볼예정|예정)$/g, '')
    .trim();
  let cleaned = `다음방문시에는 ${normalizedBase || `${plan.product} ${theme} 적용 가능 케이스 확인`}할예정`;
  cleaned = finalizeVisitStrategy(cleaned, allowedProducts, doctor.department);
  cleaned = removeDisallowedDepartmentThemeSentences(cleaned, doctor.department);
  if (cleaned.length > 120) cleaned = compressTextToLimit(cleaned, 120);
  cleaned = finalizeVisitStrategy(cleaned, allowedProducts, doctor.department);
  return cleaned;
}

export async function validateAndFixVisitLog(
  systemPrompt: string,
  formattedLog: string,
  nextStrategy: string,
  doctor: Doctor,
  activeProducts: string[] = getAllowedProductsForDepartment(doctor.department),
  allowNewDrugReview = false,
  avoidTexts: string[] = []
): Promise<{ formattedLog: string; nextStrategy: string }> {
  const finalAllowedProducts = getAllowedProductsForDepartment(doctor.department);
  let log = stripEmbeddedNextVisitPlan(formattedLog, doctor.department);
  let strategy = normalizeNextStrategy(nextStrategy, doctor.department);

  log = normalizeGeneratedMemoText(log, doctor.department);
  log = normalizeObjectionLanguage(log, activeProducts);
  log = removeEmptyReactionRequests(log);
  log = removeUnrealisticProfessorMetaSentences(log);
  log = ensureProductFeatureOwnership(log, activeProducts, doctor.department);
  log = removeDisallowedDepartmentThemeSentences(log, doctor.department);
  log = removeNextVisitPlanFromLog(log, doctor.department);
  log = stripEmbeddedNextVisitPlan(log, doctor.department);
  log = normalizeIntroProductLanguage(log, activeProducts, allowNewDrugReview);
  log = removeEmptyReactionRequests(log);
  log = removeUnrealisticProfessorMetaSentences(log);
  log = ensureProductFeatureOwnership(log, activeProducts, doctor.department);
  log = ensureProductNameInLog(log, activeProducts.length > 0 ? activeProducts : finalAllowedProducts, doctor.department);
  log = removeDisallowedProductSentences(log, doctor.department) || log;
  log = sanitizeVisitLogBody(log, (activeProducts[0] || finalAllowedProducts[0] || '위너프에이플러스'));
  log = trimAfterReactionSentence(log);
  log = stripEmbeddedNextVisitPlan(log, doctor.department);

  if (!log || log.length < 12 || hasVacuousDetailLanguage(log)) {
    log = buildFallbackVisitLog(finalAllowedProducts[0] || '위너프에이플러스', doctor.department, log);
    log = stripEmbeddedNextVisitPlan(log, doctor.department);
  }

  if (hasBatchConflict(log, avoidTexts)) {
    log = buildDiversifiedVisitLog(log, activeProducts.length > 0 ? activeProducts : finalAllowedProducts, doctor.department, avoidTexts);
    log = stripEmbeddedNextVisitPlan(log, doctor.department);
  }

  log = expandVisitLogIfTooBrief(log, activeProducts.length > 0 ? activeProducts : finalAllowedProducts, doctor.department);
  log = stripEmbeddedNextVisitPlan(log, doctor.department);

  strategy = removeDisallowedDepartmentThemeSentences(strategy, doctor.department);
  strategy = removeEmptyReactionRequests(strategy);
  strategy = removeDisallowedProductSentences(strategy, doctor.department) || '';

  const avoidedDetailKeys = detailKeysFromTexts(avoidTexts);
  if (hasRepeatedDetailBetweenLogAndStrategy(log, strategy, avoidedDetailKeys) || hasBatchConflict(strategy, avoidTexts)) {
    strategy = buildFollowUpStrategyWithoutRepeatingDetail(
      log,
      (activeProducts.length > 0 ? activeProducts[0] : finalAllowedProducts[0]) || '위너프에이플러스',
      doctor.department,
      avoidedDetailKeys
    );
  }

  strategy = finalizeVisitStrategy(strategy, activeProducts.length > 0 ? activeProducts : finalAllowedProducts, doctor.department, log);
  if (strategy.length > 120) strategy = compressTextToLimit(strategy, 120);
  strategy = finalizeVisitStrategy(strategy, activeProducts.length > 0 ? activeProducts : finalAllowedProducts, doctor.department, log);
  if (!strategy || strategy.trim().length < 5) {
    const themeRule = getDeptFeatureRule(doctor.department);
    const theme = themeRule?.allowedThemes[0] || '환자군';
    strategy = finalizeVisitStrategy(`다음방문시에는 ${finalAllowedProducts[0] || '위너프에이플러스'} ${theme} 처방 상황 확인할예정`, activeProducts.length > 0 ? activeProducts : finalAllowedProducts, doctor.department, log);
  }

  log = stripEmbeddedNextVisitPlan(log, doctor.department);
  if (log.length > MAX_VISIT_LOG_LENGTH) log = compressTextToLimit(log, MAX_VISIT_LOG_LENGTH);
  strategy = finalizeVisitStrategy(strategy, activeProducts.length > 0 ? activeProducts : finalAllowedProducts, doctor.department, log);
  if (strategy.length > 120) strategy = compressTextToLimit(strategy, 120);
  strategy = finalizeVisitStrategy(strategy, activeProducts.length > 0 ? activeProducts : finalAllowedProducts, doctor.department, log);

  const finalPrimaryProduct = activeProducts[0] || finalAllowedProducts[0] || '위너프에이플러스';
  log = sanitizeVisitLogBody(log, finalPrimaryProduct);
  log = trimAfterReactionSentence(log);
  log = trimIncompleteTrailingClause(log);
  log = log.replace(/(위너프에이플러스|페린젝트|플라주OP)의\s+/g, '$1 ').trim();
  if (!log || log.length < 12 || hasVisitPlanLeak(log) || hasVisitLogProductLeak(log, finalPrimaryProduct)) {
    log = buildFallbackVisitLog(finalPrimaryProduct, doctor.department, log);
    log = sanitizeVisitLogBody(log, finalPrimaryProduct);
    log = trimAfterReactionSentence(log);
    log = trimIncompleteTrailingClause(log);
    log = log.replace(/(위너프에이플러스|페린젝트|플라주OP)의\s+/g, '$1 ').trim();
  }

  const finalized = finalizeVisitGenerationOutput({
    formattedLog: log,
    nextStrategy: strategy,
    products: activeProducts.length > 0 ? activeProducts : finalAllowedProducts,
    department: doctor.department,
  });
  return { formattedLog: finalized.formattedLog, nextStrategy: finalized.nextStrategy };
}

export async function generateObjectionResponse(
  objection: string,
  doctor: Doctor
): Promise<string> {
  const pastLogs = visitLogStorage.getByDoctorId(doctor.id);
  const { systemPrompt, contextSection } = buildFullContext(doctor, pastLogs);

  const prompt = `${contextSection}

교수의 반박:
${objection}

이 반박에 대한 효과적인 대응책을 작성해주세요:
- 교수 성향과 과거 방문 맥락을 고려한 접근법
- 임상 데이터/근거 기반 답변
- 핵심 멘트 중 활용할 수 있는 내용 반영
- JW중외제약 제품(위너프에이플러스/페린젝트) 강점 연결
- 2-3가지 대응 방안 제시
- 큰따옴표("), 작은따옴표(') 모두 사용 금지`;

  return callAI(systemPrompt, prompt);
}

export async function analyzeSnippetEffectiveness(
  content: string,
  product: string
): Promise<string> {
  const systemPrompt = buildSystemPrompt();
  const snippetContext = buildSnippetContext();

  const allDoctors = doctorStorage.getAll();
  const doctorRoster = buildDoctorRosterForSnippetAnalysis(allDoctors);

  const prompt = `현재 담당 교수 현황 (진료과별/병원별 전체 목록):
${doctorRoster}
${snippetContext}

분석 대상 멘트:
${content}
제품: ${product}

위 멘트를 현재 담당 교수들의 성향과 맥락을 고려해서 분석해주세요:
1. 효과적인 이유
2. 어떤 성향의 교수에게 특히 효과적인지 (현재 담당 교수 중 누구에게 잘 먹힐지)
3. 개선 제안
4. 변형 멘트 최대 5개
- 잘 맞는 교수를 쓸 때는 먼저 진료과 적합성을 판단하고, 해당 진료과가 여러 병원에 있으면 모든 병원의 해당 진료과 교수를 빠짐없이 함께 나열할 것
- 같은 진료과가 강릉아산과 원주세브란스 양쪽에 있으면 반드시 둘 다 써야 하고, 한 병원만 적으면 잘못된 분석으로 간주할 것
- 예: 흉부외과가 잘 맞으면 강릉아산 흉부외과와 원주세브란스 흉부외과를 모두 확인해 누락하지 말 것
- 예: 산부인과가 잘 맞으면 강릉아산 산부인과와 원주세브란스 산부인과를 모두 확인해 누락하지 말 것
- 병원 한 곳의 특정 과와 다른 병원의 다른 과를 섞어 쓰지 말 것. 과 적합성 기준이면 같은 과 전체를 병원별로 모두 적고, 특정 교수 성향 기준이면 그 이유를 따로 적을 것
- 변형 멘트는 1~5개 작성하되, 중복되지 않고 실제 현장에서 말할 법한 내용만 쓸 것
- 억지로 5개를 채우지 말고, 새 디테일이나 화법 차이가 없으면 적게 작성할 것
- 변형 멘트는 교수에게 돌아가는 실제 이득이 드러나야 함
- 큰따옴표("), 작은따옴표(') 모두 사용 금지`;

  return callAI(systemPrompt, prompt);
}

export async function generateSnippetsFromManuals(): Promise<Array<{
  content: string;
  context: string;
  product: string;
  tags: string[];
}>> {
  const systemPrompt = buildSystemPrompt();
  const snippetContext = buildSnippetContext();

  const allDoctors = doctorStorage.getAll();
  const traitSummary = [...new Set(allDoctors.flatMap(d => d.traits.map(t => t.label)))].join(', ');

  const prompt = `당신은 JW중외제약 MR의 영업 코치입니다.
시스템 프롬프트에 포함된 제품 정보와 회사 매뉴얼을 모두 읽고, 영업 현장에서 실제로 교수/의사에게 말할 수 있는 핵심 세일즈 멘트를 생성해주세요.

현재 담당 교수들의 주요 성향: ${traitSummary || '아직 파악 안 됨'}
${snippetContext ? `\n기존에 등록된 멘트:\n${snippetContext}\n위 멘트들과 중복되지 않는 새로운 멘트를 생성해주세요.\n` : ''}

생성 규칙:
- 제품은 반드시 위너프에이플러스 또는 페린젝트만 사용. 공통, 위너프, 플라주OP, 기타 제품 생성 금지
- 위너프에이플러스 3개 이상, 페린젝트 3개 이상을 우선 생성하되, 새 디테일이 없으면 빈 배열 허용
- 각 멘트는 영업사원이 교수 앞에서 바로 말할 수 있는 자연스러운 화법으로
- 다양한 상황(첫 처방 유도, 가격 반박, 경쟁사 비교, 임상 데이터 어필, 편의성 강조 등)을 커버하되 같은 디테일포인트를 표현만 바꿔 반복하지 말 것
- 디테일포인트는 수치, 환자군, 임상 근거, 경쟁 비교 축, 투여 편의성처럼 서로 구분되는 근거 단위여야 함
- 기존 멘트와 같은 디테일포인트면 새 문장으로 만들지 말고 제외할 것
- 단, 제품명이나 큰 주제 하나만 같다고 중복으로 보지 말 것. 환자 상황, 수치 근거, 반박 포인트, 처방 이득 중 2개 이상이 달라지면 새 멘트로 생성할 것
- 제품정보에 새 수치, 새 환자군, 새 급여/투여 조건, 새 반박 대응이 있으면 기존 멘트와 일부 단어가 겹쳐도 반드시 활용할 것
- 분석에서 잘 맞는 진료과가 여러 병원에 걸치면, 강릉아산과 원주세브란스 양쪽 교수들을 모두 자동생성 후보로 같이 고려할 것. 한 병원만 참고하지 말 것
- 담당 교수들의 성향을 고려한 멘트도 포함할 것
- 교수 입장에서 이득이 모호한 "깔끔합니다", "무난합니다", "쓰기 좋습니다" 수준의 문장은 만들지 말 것
- 더 이상 새로운 디테일이 없으면 억지로 말투만 바꿔 채우지 말고 빈 JSON 배열 []을 출력할 것
- "포인트"라는 단어는 content, context, tags 어디에도 절대 쓰지 말 것. 필요하면 "내용", "디테일", "근거", "차별점"으로 바꿀 것
- 멘트 본문(content)에는 큰따옴표("), 작은따옴표(') 모두 사용 금지 (단, 아래 JSON 구조의 키와 값 구분자는 예외)

응답 형식 (반드시 이 JSON 배열 형식만 출력, 다른 텍스트 없이):
[
  {
    'content': '멘트 내용',
    'context': '활용 상황 (예: 첫 처방 유도, 가격 반박 시)',
    'product': '위너프에이플러스' 또는 '페린젝트',
    'tags': ['태그1', '태그2']
  }
]`;

  const response = await callAI(systemPrompt, prompt);

  const jsonMatch = response.match(/\[[\s\S]*\]/);
  if (!jsonMatch) throw new Error('AI 응답에서 멘트 데이터를 추출할 수 없습니다');

  const cleaned = jsonMatch[0].replace(/'/g, '"');
  const parsed = JSON.parse(cleaned) as Array<{
    content: string;
    context: string;
    product: string;
    tags: string[];
  }>;

  return parsed
    .map(item => ({
      content: reducePointWordUsage((item.content || '').replace(/['"]/g, '')),
      context: reducePointWordUsage((item.context || '').replace(/['"]/g, '')),
      product: inferSnippetProduct(item),
      tags: Array.isArray(item.tags) ? item.tags.map((tag) => reducePointWordUsage(String(tag))) : [],
    }))
    .filter((item) => item.product === '위너프에이플러스' || item.product === '페린젝트');
}

export async function generateSnippetsForProduct(productName: string): Promise<Array<{
  content: string;
  context: string;
  product: string;
  tags: string[];
}>> {
  const systemPrompt = buildSystemPrompt();
  const allManuals = manualStorage.getAll();

  const detectKey = (manual: { title: string; content: string }): string => {
    const source = `${manual.title} ${manual.content}`.toLowerCase();
    if (source.includes('위너프에이플러스') || source.includes('winuf a')) return '위너프에이플러스';
    if (source.includes('페린젝트') || source.includes('ferinject')) return '페린젝트';
    if (source.includes('위너프') || source.includes('winuf')) return '위너프';
    if (source.includes('플라주') || source.includes('plaju')) return '플라주OP';
    if (source.includes('이부프로펜') || source.includes('프리브로펜') || source.includes('ibuprofen') || source.includes('pribrophen')) return '이부프로펜프리믹스';
    if (source.includes('포스페넴') || source.includes('포스포마이신') || source.includes('fospenem') || source.includes('fosfomycin')) return '포스페넴';
    if (source.includes('프리페넴') || source.includes('에르타페넴') || source.includes('pripenem') || source.includes('ertapenem')) return '프리페넴';
    return '기타';
  };

  const productManuals = allManuals.filter(
    (m) => m.category === 'product' && detectKey(m) === productName
  );

  if (productManuals.length === 0) {
    throw new Error(`${productName} 제품 정보가 등록되어 있지 않습니다. 먼저 제품 정보를 추가해주세요.`);
  }

  const productContext = productManuals
    .map((m) => `[${m.title}]\n${m.content}`)
    .join('\n\n---\n\n');

  const allDoctors = doctorStorage.getAll();
  const traitSummary = [
    ...new Set(allDoctors.flatMap((d) => d.traits.map((t) => t.label))),
  ].join(', ');

  const existingForProduct = snippetStorage
    .getAll()
    .filter((s) => s.product === normalizeSnippetProductName(productName))
    .slice(0, 10)
    .map((s) => formatSnippetForPrompt(s))
    .join('\n');

  const prompt = `당신은 JW중외제약 MR의 영업 코치입니다.
아래 [${productName}] 제품 정보와 특장점만 집중적으로 참고해서, 영업 현장에서 교수/의사에게 바로 말할 수 있는 핵심 세일즈 멘트를 생성해주세요.

[${productName} 제품 정보]
${productContext}

현재 담당 교수들의 주요 성향: ${traitSummary || '아직 파악 안 됨'}
${existingForProduct ? `\n[이미 등록된 ${productName} 멘트 (중복 금지)]\n${existingForProduct}\n` : ''}

생성 규칙:
- ${productName}에 특화된 멘트만 5~8개 생성 (다른 제품 언급 최소화)
- 각 멘트는 영업사원이 교수 앞에서 자연스럽게 말할 수 있는 화법
- 1~2문장으로 간결하게
- 제품의 특장점, 임상 데이터, 차별점, 편의성 등 다양한 각도에서 커버하되 같은 디테일포인트를 말만 바꿔 반복하지 말 것
- 디테일포인트는 수치, 환자군, 임상 근거, 경쟁 비교 축, 투여 편의성처럼 서로 구분되는 근거 단위여야 함
- 이미 등록된 ${productName} 멘트와 같은 디테일포인트면 새 문장으로 만들지 말고 제외할 것
- 단, ${productName}이라는 제품명이나 큰 주제 하나만 같다고 중복으로 보지 말 것. 환자 상황, 수치 근거, 반박 포인트, 처방 이득 중 2개 이상이 달라지면 새 멘트로 생성할 것
- 제품정보에 새 수치, 새 환자군, 새 급여/투여 조건, 새 반박 대응이 있으면 기존 멘트와 일부 단어가 겹쳐도 반드시 활용할 것
- 다양한 상황(첫 처방 유도, 가격 반박, 경쟁사 비교, 임상 데이터 어필 등) 포함
- 교수 입장에서 이득이 모호한 "깔끔합니다", "무난합니다", "쓰기 좋습니다" 수준의 문장은 만들지 말 것
- 더 이상 새로운 디테일이 없으면 억지로 말투만 바꿔 채우지 말고 빈 JSON 배열 []을 출력할 것
- "포인트"라는 단어는 content, context, tags 어디에도 절대 쓰지 말 것. 필요하면 "내용", "디테일", "근거", "차별점"으로 바꿀 것
- 멘트 본문(content)에는 큰따옴표("), 작은따옴표(') 모두 사용 금지

응답 형식 (반드시 이 JSON 배열 형식만 출력, 다른 텍스트 없이):
[
  {
    'content': '멘트 내용',
    'context': '활용 상황',
    'product': '${productName}',
    'tags': ['태그1', '태그2']
  }
]`;

  const response = await callAI(systemPrompt, prompt);

  const jsonMatch = response.match(/\[[\s\S]*\]/);
  if (!jsonMatch) throw new Error('AI 응답에서 멘트 데이터를 추출할 수 없습니다');

  const cleaned = jsonMatch[0].replace(/'/g, '"');
  const parsed = JSON.parse(cleaned) as Array<{
    content: string;
    context: string;
    product: string;
    tags: string[];
  }>;

  return parsed.map((item) => ({
    content: reducePointWordUsage((item.content || '').replace(/['"]/g, '')),
    context: reducePointWordUsage((item.context || '').replace(/['"]/g, '')),
    product: normalizeSnippetProductName(productName),
    tags: Array.isArray(item.tags) ? item.tags.map((tag) => reducePointWordUsage(String(tag))) : [],
  }));
}

export async function processImportedRecords(text: string): Promise<string> {
  const systemPrompt = buildSystemPrompt();
  const snippetContext = buildSnippetContext();

  const allDoctors = doctorStorage.getAll();
  const doctorSummary = allDoctors.length > 0
    ? `현재 담당 교수: ${allDoctors.map(d => `${d.name}(${d.hospital} ${d.department})`).join(', ')}`
    : '';

  const prompt = `${doctorSummary}
${snippetContext}

다음은 과거 영업 방문 기록입니다. 이 데이터를 분석하고 구조화된 인사이트를 제공해주세요:

${text.slice(0, 3000)}

분석해주세요:
1. 방문 패턴 요약
2. 각 교수/제품별 주요 인사이트
3. 앞으로의 영업 전략 제안
- 큰따옴표("), 작은따옴표(') 모두 사용 금지`;

  return callAI(systemPrompt, prompt);
}

export async function analyzePastConversations(
  rawText: string,
  doctor: Doctor,
  period: string
): Promise<{ analysis: string; detectedTraits: string[]; nextSuggestions: string }> {
  const pastLogs = visitLogStorage.getByDoctorId(doctor.id);
  const { systemPrompt, contextSection } = buildFullContext(doctor, pastLogs);

  const prompt = `${contextSection}

아래는 ${period} 동안의 이 교수와의 방문/대화 기록입니다:
---
${rawText.slice(0, 4000)}
---

위 내용을 바탕으로 다음을 분석해주세요:

응답 형식:
===성향분석===
이 교수의 성격, 의사결정 스타일, 제품에 대한 태도, 영업 접근법에서 통했던 것과 안 통했던 것을 자연스럽게 정리해주세요.

===파악된성향태그===
성향을 나타내는 태그를 쉼표로 구분해서 5개 이내로 작성 (예: 데이터중시, 바쁨, 경쟁사충성도높음, 임상관심많음, 가격민감)

===다음방문전략===
지금까지의 대화를 바탕으로 다음에 어떤 방식으로 접근하면 좋을지 구체적으로 제안해주세요. 어떤 자료를 가져갈지, 어떤 말을 꺼낼지, 어떤 것을 피해야 할지 포함.

★ 큰따옴표("), 작은따옴표(') 모두 사용 금지.`;

  const response = await callAI(systemPrompt, prompt);

  const analysisMatch = response.match(/===성향분석===\s*([\s\S]*?)(?:===파악된성향태그===|$)/);
  const tagsMatch = response.match(/===파악된성향태그===\s*([\s\S]*?)(?:===다음방문전략===|$)/);
  const strategyMatch = response.match(/===다음방문전략===\s*([\s\S]*?)$/);

  const tagsText = tagsMatch ? tagsMatch[1].trim() : '';
  const detectedTraits = tagsText
    .split(/[,，、\n]/)
    .map((t) => t.trim().replace(/^[-·•]\s*/, '').replace(/[·•]/g, ','))
    .filter(Boolean)
    .slice(0, 5);

  return {
    analysis: analysisMatch ? analysisMatch[1].replace(/['"]/g, '').trim() : response.replace(/['"]/g, ''),
    detectedTraits,
    nextSuggestions: strategyMatch ? strategyMatch[1].replace(/['"]/g, '').trim() : '',
  };
}
