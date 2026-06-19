import {
  buildDepartmentSafeVisitOutput,
  normalizeVisitProduct,
  stripDoctorDepartmentPrefix,
} from './departmentProfiles';
import {
  sanitizeNextStrategyText,
  sanitizeVisitLogBody,
  stripBrokenFutureFragments,
  trimAfterReactionSentence,
} from './sanitizer';

export type FinalizeVisitGenerationInput = {
  formattedLog: string;
  nextStrategy: string;
  products: string[];
  department: string;
  doctorName?: string;
  hospital?: string;
};

export type FinalizedVisitGenerationOutput = {
  formattedLog: string;
  nextStrategy: string;
  products: string[];
};

const NEXT_MARKER_RE = /(?:다음\s*(?:방문\s*시(?:에는|엔|에|는)?|방문(?:시)?(?:에는|엔|에|는)?|번에는|번엔|번에|에는|엔|에)|다음방문시에는|다음방문에는|다음번에는|다음에는|다음엔|다음에)/gi;

function compact(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function normalizeProduct(product: string): string {
  return normalizeVisitProduct(product);
}

function splitSentences(text: string): string[] {
  return compact(text)
    .split(/(?<=[.。!?])\s+|(?=다음\s*(?:방문|번|엔|에))|(?=다음방문)/g)
    .map((item) => item.trim())
    .filter(Boolean);
}

function splitBodyAndPlan(text: string): { body: string; leakedPlan: string } {
  const cleaned = compact(stripBrokenFutureFragments(text));
  const match = cleaned.match(NEXT_MARKER_RE);
  if (!match) return { body: cleaned, leakedPlan: '' };
  const first = cleaned.search(NEXT_MARKER_RE);
  if (first < 0) return { body: cleaned, leakedPlan: '' };
  return {
    body: cleaned.slice(0, first).trim(),
    leakedPlan: cleaned.slice(first).trim(),
  };
}

function isForeignProductSentence(sentence: string, primaryProduct: string): boolean {
  const normalized = sentence.replace(/\s+/g, '');
  if (primaryProduct === '위너프에이플러스') {
    return /페린젝트|정맥철|철결핍|경구용철분제|Hb|수혈/.test(normalized);
  }
  if (primaryProduct === '페린젝트') {
    return /위너프|TPN|아미노산|포도당|단백보충|영양수액/.test(normalized);
  }
  if (primaryProduct === '플라주OP') {
    return /페린젝트|위너프|정맥철|철결핍|Hb|아미노산|포도당|TPN/.test(normalized);
  }
  return false;
}

function removeForeignProductSentences(text: string, primaryProduct: string): string {
  const kept = splitSentences(text).filter((sentence) => !isForeignProductSentence(sentence, primaryProduct));
  return compact(kept.join(' '));
}

function normalizeRepeatedNextMarkers(text: string): string {
  const cleaned = compact(stripBrokenFutureFragments(text))
    .replace(/(?:다음\s*방문\s*시에는|다음방문시에는|다음방문에는|다음번에는|다음에는|다음엔|다음에)\s*/gi, '다음방문시에는 ')
    .replace(/(?:다음방문시에는\s*){2,}/g, '다음방문시에는 ')
    .replace(/(?:할예정|확인할예정|예정){2,}$/g, '할예정')
    .replace(/확인해보겠을할예정|확인해보겠음할예정|보겠을할예정/g, '확인할예정');
  const parts = cleaned.split(/다음방문시에는/g).map((part) => part.trim()).filter(Boolean);
  if (parts.length <= 1) return cleaned;
  return `다음방문시에는 ${parts[parts.length - 1]}`;
}


function hasMeaningfulBody(text: string, primaryProduct: string): boolean {
  if (text.length < 30) return false;
  if (!text.includes(primaryProduct)) return false;
  return true;
}

export function finalizeVisitGenerationOutput(input: FinalizeVisitGenerationInput): FinalizedVisitGenerationOutput {
  const products = input.products.map(normalizeProduct).filter(Boolean);
  const primaryProduct = products[0] || '위너프에이플러스';
  const split = splitBodyAndPlan(input.formattedLog);
  const leakedPlan = split.leakedPlan;

  let body = removeForeignProductSentences(split.body, primaryProduct);
  body = stripDoctorDepartmentPrefix(body, {
    department: input.department,
    doctorName: input.doctorName,
    hospital: input.hospital,
  });
  // 제품명 + 교수/선생 패턴 제거: "위너프에이플러스 교수님께서..." → "교수님께서..."
  body = body.replace(/^(위너프에이플러스|플라주OP|페린젝트)\s+(교수님|교수\s*님|선생님|선생)\s*/g, '$2');
  // 제품명이 아무 맥락 없이 문장 첫 단어인 경우 제거
  body = body.replace(/^(위너프에이플러스|플라주OP|페린젝트)\s+(?=[가-힣])/, '');
  body = sanitizeVisitLogBody(body, primaryProduct);
  body = removeForeignProductSentences(body, primaryProduct);
  body = trimAfterReactionSentence(body);
  body = compact(body)
    .replace(/(위너프에이플러스|페린젝트|플라주OP)의\s+/g, '$1 ')
    .replace(/빠르고\s+에\s+/g, '빠른 ')
    .replace(/빠른\s+도움/g, '빠르게 도움')
    .replace(/(Hb\s*회복|혈색소\s*회복|회복)이\s*빠르게\s*도움된다고/g, '$1에 도움된다고')
    .replace(/([가-힣])에\s+도움/g, '$1에 도움')
    .replace(/근거을/g, '근거를')
    .replace(/반응하셨고/g, '반응 보였고');

  // 타과 제품 혼입 감지 — removeForeignProductSentences를 이미 2회 실행했으므로
  // pipeline repair 루프 제거 후에는 빈 문자열로 대체하지 않고 현 body 유지

  let strategySeed = input.nextStrategy || leakedPlan || '';
  strategySeed = normalizeRepeatedNextMarkers(strategySeed);
  let strategy = sanitizeNextStrategyText(strategySeed, primaryProduct);
  strategy = normalizeRepeatedNextMarkers(strategy);
  // 하드코딩 fallbackStrategy 호출 제거 — AI 출력을 그대로 유지
  strategy = normalizeRepeatedNextMarkers(sanitizeNextStrategyText(strategy, primaryProduct));

  const needsSafeFallback =
    !body ||
    !hasMeaningfulBody(body, primaryProduct);

  if (needsSafeFallback) {
    const fallback = buildDepartmentSafeVisitOutput(primaryProduct, input.department || '');
    return {
      formattedLog: fallback.formattedLog,
      nextStrategy: normalizeRepeatedNextMarkers(sanitizeNextStrategyText(fallback.nextStrategy, primaryProduct)),
      products: fallback.products,
    };
  }

  return {
    formattedLog: body,
    nextStrategy: strategy,
    products: products.length > 0 ? products : [primaryProduct],
  };
}
