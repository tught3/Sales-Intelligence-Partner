import type { VisitContext } from './context';
import { collectKeys, extractKeys, extractReactionKeys, similarityRatio } from './detailKeys';
import { buildDepartmentFallbackPlan, getDepartmentProfile, isTextAllowedForDepartment } from './departmentProfiles';
import type { ExternalCasePattern } from '../storage';
import type { DetailKey } from './types';
import { getVisitTemplates } from './templates';

type PlanCandidate = Omit<DetailKey, 'selectionReason'>;

// REACTION_FALLBACKS 제거 — 고정 반응 패턴은 기계적 출력의 원인. AI가 자유롭게 생성.

function hashSeed(...parts: string[]): number {
  // 외부 케이스 변형 생성 시에만 사용 (결정론적 중복 방지용으로 한정)
  const joined = parts.filter(Boolean).join('|');
  let hash = 0;
  for (let i = 0; i < joined.length; i++) {
    hash = (hash * 31 + joined.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function pickRandom<T>(values: T[]): T {
  if (values.length === 0) throw new Error('pickRandom requires values');
  return values[Math.floor(Math.random() * values.length)];
}

function uniqueByText<T extends PlanCandidate>(candidates: T[]): T[] {
  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    const key = planText(candidate);
    const compact = key.replace(/\s+/g, ' ').trim().toLowerCase();
    if (seen.has(compact)) return false;
    seen.add(compact);
    return true;
  });
}

function inferNarrativeStyle(pattern: ExternalCasePattern, department: string): DetailKey['narrativeStyle'] {
  const text = `${pattern.sourceSummary} ${pattern.patientGroup} ${pattern.detailAxis} ${pattern.reactionPattern} ${pattern.nextAction} ${department}`;
  if (/질문|문의|\?/.test(text)) return '교수 질문 답변형';
  if (/급여|보험|청구/.test(text)) return '급여 기준 재확인형';
  if (/지난|이전|확인|재확인/.test(text)) return '지난 방문 확인형';
  if (/처방|사용|경험|적용/.test(text)) return '처방 경험 확인형';
  return '환자 케이스 연결형';
}

function externalDetailVariants(pattern: ExternalCasePattern): string[] {
  if (pattern.product === '페린젝트') {
    return [
      pattern.detailAxis || '페린젝트의 1회 투여 편의성과 Hb 회복 근거',
      '페린젝트의 급여 기준과 외래 적용 가능성',
      '페린젝트의 외래 재방문 부담 감소와 빠른 Hb 회복',
      '페린젝트의 수혈 부담 감소와 1회 투여 장점',
      '페린젝트의 경구용철분제 반응 부족 환자에서 적용 근거',
      '페린젝트의 시험투여 부담이 적은 점과 1회 투여 편의성',
    ];
  }
  if (pattern.product === '위너프에이플러스') {
    return [
      pattern.detailAxis || '위너프에이플러스의 아미노산 보충과 단백 공급 이점',
      '위너프에이플러스의 포도당 부담 감소와 혈당 흐름',
      '위너프에이플러스의 오메가3 조성과 균형 영양',
      '위너프에이플러스의 질소균형 유지와 회복기 영양',
      '위너프에이플러스의 수술 후 식이 지연 환자에서 영양 공급',
      '위너프에이플러스의 단백 보충과 회복기 식사 진행',
    ];
  }
  return [pattern.detailAxis || `${pattern.product}의 핵심 디테일`];
}

function externalReactionVariants(pattern: ExternalCasePattern): string[] {
  return [
    pattern.reactionPattern || '환자군이 맞으면 차트로 보겠다는 의견',
    '맞는 케이스에서는 참고해보겠다는 의견',
    '급여 기준을 보고 처방 가능성을 보겠다는 의견',
    '실제 적용은 환자 상태를 보고 판단하겠다는 반응',
    '차트상 조건이 맞으면 검토하겠다는 의견',
    '환자 추이를 보고 다시 판단하겠다는 반응',
  ];
}

function externalNextActionVariants(pattern: ExternalCasePattern): string[] {
  return [
    pattern.nextAction || `${pattern.product} 관련 적용 가능 케이스 확인`,
    `${pattern.product} 사용 경험과 실제 반응 확인`,
    `${pattern.product} 급여 기준과 처방 가능성 확인`,
    `${pattern.product} 환자군과 차트상 조건 확인`,
    `${pattern.product} 다음 방문에서 적용 가능 상황 재확인`,
  ];
}

function professorQuestionFrom(candidate: Pick<PlanCandidate, 'product' | 'detailAxis' | 'patientGroup'>): string {
  const text = `${candidate.product} ${candidate.detailAxis} ${candidate.patientGroup}`;
  if (candidate.product === '페린젝트') {
    if (/급여|TSAT|보험/.test(text)) return '급여 기준은 어떤 환자부터 맞는지 질문';
    if (/수술|수혈|Hb|빈혈/.test(text)) return '수술 전후 어느 시점에 투여하는지 질문';
    return '경구용철분제 반응이 부족한 환자에서 전환 기준을 질문';
  }
  if (candidate.product === '위너프에이플러스') {
    if (/포도당|혈당/.test(text)) return '혈당 부담이 실제로 얼마나 줄어드는지 질문';
    if (/아미노산|단백|영양/.test(text)) return '단백 보충이 필요한 환자 기준을 질문';
    return '기존 TPN과 어떤 환자에서 구분하는지 질문';
  }
  if (candidate.product === '플라주OP') {
    return '기존 수액 프로토콜에서 바꿀 기준을 질문';
  }
  return '차트상 어떤 조건을 먼저 봐야 하는지 질문';
}

function buildExternalCandidateVariants(pattern: ExternalCasePattern, ctx: VisitContext): PlanCandidate[] {
  // Math.random() 사용 — 매 호출마다 다른 조합 생성 (hashSeed 제거)
  const detailVariants = externalDetailVariants(pattern);
  const nextActionVariants = externalNextActionVariants(pattern);
  const styles: DetailKey['narrativeStyle'][] = [
    inferNarrativeStyle(pattern, ctx.doctor.department || ''),
    '환자 케이스 연결형',
    '처방 경험 확인형',
    '교수 질문 답변형',
    '급여 기준 재확인형',
    '지난 방문 확인형',
  ];

  const candidateCount = Math.min(3, Math.max(1, detailVariants.length > 1 ? 2 : 1));
  const variants: PlanCandidate[] = [];
  for (let i = 0; i < candidateCount; i++) {
    const detailAxis = pickRandom(detailVariants);
    // doctorReaction은 빈 문자열 — AI가 자유롭게 생성하도록 (고정 반응 제거)
    const nextAction = pickRandom(nextActionVariants);
    const narrativeStyle = pickRandom(styles);
    const professorQuestion = professorQuestionFrom({ product: pattern.product, detailAxis, patientGroup: pattern.patientGroup });
    variants.push({
      templateId: `external-${pattern.id}-${i}`,
      product: pattern.product,
      patientGroup: pattern.patientGroup,
      detailAxis,
      doctorReaction: '',
      nextAction,
      narrativeStyle,
      professorQuestion,
      allowedDepartments: [pattern.department],
      exampleMemo: pattern.styleExampleMemo,
    });
  }
  return uniqueByText(variants);
}

export function buildDepartmentFallbackPlanCandidate(ctx: VisitContext, product?: string): PlanCandidate {
  const selectedProduct = product ?? ctx.availableProducts[0] ?? '위너프에이플러스';
  const fallback = buildDepartmentFallbackPlan(selectedProduct, ctx.doctor.department || '');
  const profile = getDepartmentProfile(ctx.doctor.department || '');
  return {
    ...fallback,
    templateId: `department-fallback-${profile?.key ?? 'general'}-${fallback.product}`,
  };
}

function buildTemplateCandidates(ctx: VisitContext): PlanCandidate[] {
  const productScope = ctx.availableProducts.length > 0 ? ctx.availableProducts : ['위너프에이플러스', '페린젝트'];
  return getVisitTemplates(ctx.doctor.department || '', productScope).map((template) => ({
    templateId: template.templateId,
    product: template.product,
    patientGroup: template.patientGroup,
    detailAxis: template.detailAxis,
    doctorReaction: template.doctorReaction,
    nextAction: template.nextAxis,
    narrativeStyle: template.narrativeStyle,
    professorQuestion: professorQuestionFrom(template),
    allowedDepartments: [template.department],
    exampleMemo: template.exampleMemo,   // few-shot 예시 — AI 스타일 가이드
  }));
}

// WINUF_CANDIDATES: 하드코딩된 고정 반응/문구 제거. doctorReaction은 AI가 생성.
const WINUF_CANDIDATES: PlanCandidate[] = [
  {
    product: '위너프에이플러스',
    patientGroup: '수술 후 식이 진행이 늦어 정맥영양이 필요한 환자',
    detailAxis: '위너프에이플러스의 단백 보충과 수술 후 회복기 영양',
    doctorReaction: '',
    nextAction: '수술 후 회복기 환자에서 영양 공급 반응 확인',
    narrativeStyle: '환자 케이스 연결형',
    allowedDepartments: ['외과', '흉부외과', '신경외과', '정형외과', '간담췌외과'],
  },
  {
    product: '위너프에이플러스',
    patientGroup: '중환자실에서 혈당 변동을 같이 관리하는 환자',
    detailAxis: '위너프에이플러스의 오메가3 조성과 중증 환자 영양',
    doctorReaction: '',
    nextAction: '중환자 영양 공급 방식과 처방 흐름 확인',
    narrativeStyle: '지난 방문 확인형',
    allowedDepartments: ['중환자의학과', '호흡기내과', '응급의학과', '흉부외과', '신경외과'],
  },
  {
    product: '위너프에이플러스',
    patientGroup: '수술 전후로 경구 섭취가 불안정한 환자',
    detailAxis: '위너프에이플러스의 수액 제한 상황에서 고농도 영양 공급',
    doctorReaction: '',
    nextAction: '적용 가능 케이스와 처방 타이밍 확인',
    narrativeStyle: '교수 질문 답변형',
    allowedDepartments: ['외과', '흉부외과', '신경외과', '정형외과', '간담췌외과', '산부인과'],
  },
  {
    product: '위너프에이플러스',
    patientGroup: 'IBD 악화나 식사량 저하로 영양 보충이 필요한 환자',
    detailAxis: '위너프에이플러스의 장기 영양 불량 환자에서의 단백 보충',
    doctorReaction: '',
    nextAction: '식사량 저하 환자에서 영양 반응과 처방 가능성 확인',
    narrativeStyle: '환자 케이스 연결형',
    allowedDepartments: ['소화기내과'],
  },
  {
    product: '위너프에이플러스',
    patientGroup: '부인과 수술 후 식이 진행이 늦어 영양 공급이 필요한 환자',
    detailAxis: '위너프에이플러스의 수술 후 회복기 영양과 혈당 관리',
    doctorReaction: '',
    nextAction: '분만·수술 후 회복기 환자에서 영양 공급 반응 확인',
    narrativeStyle: '지난 방문 확인형',
    allowedDepartments: ['산부인과', '산과', '부인과'],
  },
];

// FERINJECT_CANDIDATES: 하드코딩된 고정 반응 제거. doctorReaction은 AI가 생성.
const FERINJECT_CANDIDATES: PlanCandidate[] = [
  {
    product: '페린젝트',
    patientGroup: '경구용철분제로 Hb 회복이 충분하지 않은 외래 빈혈 환자',
    detailAxis: '페린젝트의 1회 투여 완결과 반복 내원 부담 감소',
    doctorReaction: '',
    nextAction: '빈혈 환자에서 처방 가능성과 Hb 회복 경과 확인',
    narrativeStyle: '처방 경험 확인형',
    blockedDepartments: ['산부인과'],
  },
  {
    product: '페린젝트',
    patientGroup: '항암치료 중 경구용철분제 흡수가 저하된 빈혈 환자',
    detailAxis: '페린젝트의 정맥 철 공급과 빠른 Hb 교정',
    doctorReaction: '',
    nextAction: '항암 중 빈혈 환자에서 처방 후보와 급여 기준 확인',
    narrativeStyle: '환자 케이스 연결형',
    allowedDepartments: ['종양내과', '혈액종양내과', '종양혈액내과', '혈액내과'],
  },
  {
    product: '페린젝트',
    patientGroup: '수술 전후 Hb 교정이 빠르게 필요한 환자',
    detailAxis: '페린젝트의 수술 전 빈혈 교정과 수혈 부담 감소',
    doctorReaction: '',
    nextAction: '수술 전후 빈혈 환자에서 적용 케이스와 Hb 추이 확인',
    narrativeStyle: '환자 케이스 연결형',
    allowedDepartments: ['외과', '흉부외과', '신경외과', '정형외과', '간담췌외과', '산부인과'],
  },
  {
    product: '페린젝트',
    patientGroup: '분만 후 빈혈 증상이 남아 외래 추적 중인 환자',
    detailAxis: '페린젝트의 산후 빈혈 교정과 1회 투여 완결',
    doctorReaction: '',
    nextAction: '분만 후 빈혈 환자에서 외래 처방 루틴 논의',
    narrativeStyle: '지난 방문 확인형',
    allowedDepartments: ['산부인과', '산과', '부인과'],
  },
  {
    product: '페린젝트',
    patientGroup: '수혈 없이 빠른 철 보충이 필요한 빈혈 환자',
    detailAxis: '페린젝트의 급여 기준과 수혈 대안으로서의 역할',
    doctorReaction: '',
    nextAction: '급여 기준 환자 선별과 처방 가능성 확인',
    narrativeStyle: '급여 기준 재확인형',
    blockedDepartments: ['산부인과'],
  },
  {
    product: '페린젝트',
    patientGroup: '위장관 출혈 후 경구 철분 흡수가 어려운 소화기 빈혈 환자',
    detailAxis: '페린젝트의 위장관 출혈 후 빠른 Hb 회복',
    doctorReaction: '',
    nextAction: '소화기 출혈 후 빈혈 환자에서 처방 타이밍 확인',
    narrativeStyle: '환자 케이스 연결형',
    allowedDepartments: ['소화기내과'],
  },
];

function planText(candidate: PlanCandidate): string {
  return `${candidate.product} ${candidate.patientGroup} ${candidate.detailAxis} ${candidate.doctorReaction} ${candidate.nextAction} ${candidate.narrativeStyle}`;
}

function departmentMatches(department: string, patterns: string[] = []): boolean {
  return patterns.some((pattern) => department.includes(pattern));
}

function isCandidateAllowedForDepartment(candidate: PlanCandidate, department: string): boolean {
  if (candidate.allowedDepartments?.length && !departmentMatches(department, candidate.allowedDepartments)) {
    return false;
  }
  if (candidate.blockedDepartments?.length && departmentMatches(department, candidate.blockedDepartments)) {
    return false;
  }
  if (/소화기/.test(department) && /분만|산후|산부인과|부인과|제왕절개/.test(planText(candidate))) {
    return false;
  }
  if (/산부인과|산과|부인과/.test(department) && /IBD|크론|궤양성대장염|위장관\s*출혈/.test(planText(candidate))) {
    return false;
  }
  // 순수 내과 계열 (수술 안 함) — 수술 회복기 환자군 금지
  if (departmentMatches(department, ['호흡기내과', '호흡기', '종양내과', '혈액종양', '혈액내과', '소화기내과', '내분비내과', '순환기내과', '신장내과'])) {
    if (/수술\s*후\s*회복|절제\s*후\s*회복|수술\s*회복기|수술\s*전후\s*영양/.test(planText(candidate))) return false;
  }
  // 비간담췌외과 — 간절제 표현 금지
  if (!departmentMatches(department, ['간담췌외과', '간담'])) {
    if (/간\s*절제|간절제/.test(planText(candidate))) return false;
  }
  return isTextAllowedForDepartment(planText(candidate), department);
}

function candidatesFor(ctx: VisitContext): PlanCandidate[] {
  const templateCandidates = buildTemplateCandidates(ctx);
  const externalCandidates: PlanCandidate[] = ctx.externalCasePatterns.flatMap((pattern) => buildExternalCandidateVariants(pattern, ctx));
  const manualProducts = ctx.manualRawNotes
    ? ctx.availableProducts.filter((product) => ctx.manualRawNotes?.replace(/\s+/g, '').includes(product.replace(/\s+/g, '')))
    : [];
  const productPool = manualProducts.length > 0 ? manualProducts : ctx.availableProducts;
  const fallbackCandidates = productPool.map((product) => buildDepartmentFallbackPlanCandidate(ctx, product));
  const all = [...externalCandidates, ...templateCandidates, ...fallbackCandidates, ...WINUF_CANDIDATES, ...FERINJECT_CANDIDATES];
  const filtered = all.filter((candidate) =>
    productPool.includes(candidate.product) &&
    isCandidateAllowedForDepartment(candidate, ctx.doctor.department || '')
  );
  return filtered.length > 0 ? filtered : fallbackCandidates;
}

function hasUsedReaction(candidate: PlanCandidate, ctx: VisitContext): boolean {
  const reactionKeys = extractReactionKeys(candidate.doctorReaction);
  return reactionKeys.some((key) => ctx.batchUsedReactionKeys.includes(key));
}

function hasUsedTemplate(candidate: PlanCandidate, ctx: VisitContext): boolean {
  return Boolean(candidate.templateId && ctx.batchUsedTemplateIds.includes(candidate.templateId));
}

function withUnusedReaction<T extends PlanCandidate>(candidate: T, _ctx: VisitContext): T {
  // REACTION_FALLBACKS 제거됨 — 고정 반응 대입 없이 원본 candidate 그대로 반환.
  // AI가 교수 반응을 자유롭게 생성.
  return candidate;
}

function withUnusedTemplate<T extends PlanCandidate>(candidate: T, ctx: VisitContext): T {
  if (!hasUsedTemplate(candidate, ctx)) return candidate;
  const alternative = candidatesFor(ctx).find((item) => item.templateId && !ctx.batchUsedTemplateIds.includes(item.templateId));
  return (alternative ?? candidate) as T;
}

function externalPatternBonus(candidate: PlanCandidate, ctx: VisitContext): number {
  const matched = ctx.externalCasePatterns.find((pattern) =>
    candidate.product === pattern.product &&
    candidate.patientGroup === pattern.patientGroup &&
    candidate.detailAxis === pattern.detailAxis
  );
  if (!matched) return 0;
  return 4 + Math.min(5, Math.max(0, Math.round((matched.confidence || 0) / 20)));
}

function templateFreshnessBonus(candidate: PlanCandidate, ctx: VisitContext): number {
  if (!candidate.templateId) return 0;
  if (ctx.batchUsedTemplateIds.includes(candidate.templateId)) return -120;
  return 6;
}

function batchSimilarityPenalty(candidate: PlanCandidate, texts: string[]): number {
  if (texts.length === 0) return 0;
  const candidateText = planText(candidate);
  return texts.reduce((penalty, text) => {
    const ratio = similarityRatio(candidateText, text);
    if (ratio >= 0.75) return penalty + 120;
    if (ratio >= 0.6) return penalty + 60;
    if (ratio >= 0.45) return penalty + 20;
    return penalty;
  }, 0);
}

function extractBatchProducts(texts: string[]): string[] {
  const products = new Set<string>();
  for (const text of texts) {
    if (/위너프에이플러스|위너프A\+|winuf\s*a\+|winufaplus|winufa/i.test(text)) products.add('위너프에이플러스');
    if (/페린젝트|ferinject/i.test(text)) products.add('페린젝트');
  }
  return [...products];
}

function getMostRecentProduct(ctx: VisitContext): string | undefined {
  const recent = ctx.pastLogs[0];
  return recent?.products?.find((product) => product === '위너프에이플러스' || product === '페린젝트');
}

export function buildPlan(ctx: VisitContext): DetailKey {
  const veryRecentKeys = collectKeys([
    ...ctx.pastLogs.slice(0, 3).flatMap((log) => [log.formattedLog, log.nextStrategy ?? '']),
    ...(ctx.manualRawNotes ? [ctx.manualRawNotes] : []),
  ]);
  const olderRecentKeys = collectKeys([
    ...ctx.pastLogs.slice(3, 15).flatMap((log) => [log.formattedLog, log.nextStrategy ?? '']),
  ]);
  const latestStrategy = ctx.recentStrategies[0]?.trim() ?? '';
  const carryoverKeys = latestStrategy ? extractKeys(latestStrategy) : [];
  const carryoverProduct = latestStrategy
    ? ['위너프에이플러스', '페린젝트'].find((product) => latestStrategy.includes(product))
    : undefined;
  const batchKeys = new Set(ctx.batchUsedDetailKeys);
  const recentKeySet = new Set(veryRecentKeys);
  const olderKeySet = new Set(olderRecentKeys);
  const batchProducts = extractBatchProducts(ctx.batchAvoidTexts);
  const mostRecentProduct = getMostRecentProduct(ctx);
  const canRotateProduct = ctx.availableProducts.filter((product) => product !== mostRecentProduct).length > 0;

  const baseCandidates = candidatesFor(ctx);
  const reactionSafeCandidates = baseCandidates.filter((candidate) => !hasUsedReaction(candidate, ctx));
  const selectableCandidates = reactionSafeCandidates.length > 0
    ? reactionSafeCandidates
    : baseCandidates.map((candidate) => withUnusedReaction(candidate, ctx));
  if (ctx.isObDoctor && !ctx.hasDailyObFerinject && ctx.availableProducts.includes('페린젝트')) {
    const forcedCandidates = baseCandidates.filter((candidate) => candidate.product === '페린젝트');
    const reactionSafeForced = forcedCandidates.filter((candidate) => !hasUsedReaction(candidate, ctx));
    const forced =
      reactionSafeForced[0] ??
      (forcedCandidates[0] ? withUnusedReaction(forcedCandidates[0], ctx) : undefined) ??
      FERINJECT_CANDIDATES[0];
    return {
      ...forced,
      selectionReason: `오늘(${ctx.todayDate}) 산부인과 페린젝트 기록이 아직 없어 1일 1건 보장 규칙으로 선택`,
    };
  }

  const ranked = selectableCandidates
    .map((candidate) => withUnusedTemplate(candidate, ctx))
    .sort((a, b) => {
    const aKeys = extractKeys(planText(a));
    const bKeys = extractKeys(planText(b));
    const aReactionKeys = extractReactionKeys(a.doctorReaction);
    const bReactionKeys = extractReactionKeys(b.doctorReaction);
    const aText = planText(a);
    const bText = planText(b);
    const aPenalty =
      aKeys.filter((key) => batchKeys.has(key)).length * 10 +
      aReactionKeys.filter((key) => ctx.batchUsedReactionKeys.includes(key)).length * 25 +
      aKeys.filter((key) => recentKeySet.has(key)).length * 8 +
      aKeys.filter((key) => olderKeySet.has(key)).length * 4 +
      (ctx.usedProductsRecently.includes(a.product) ? 1 : 0) +
      (ctx.batchUsedProducts.includes(a.product) ? 10 : 0) +
      (batchProducts.includes(a.product) ? 12 : 0) +
      (hasUsedTemplate(a, ctx) ? 50 : 0) +
      ctx.learnedForbiddenPatterns.filter((pattern) => pattern && aText.includes(pattern.slice(0, 12))).length * 4 +
      batchSimilarityPenalty(a, ctx.batchAvoidTexts);
    const bPenalty =
      bKeys.filter((key) => batchKeys.has(key)).length * 10 +
      bReactionKeys.filter((key) => ctx.batchUsedReactionKeys.includes(key)).length * 25 +
      bKeys.filter((key) => recentKeySet.has(key)).length * 8 +
      bKeys.filter((key) => olderKeySet.has(key)).length * 4 +
      (ctx.usedProductsRecently.includes(b.product) ? 1 : 0) +
      (ctx.batchUsedProducts.includes(b.product) ? 10 : 0) +
      (batchProducts.includes(b.product) ? 12 : 0) +
      (hasUsedTemplate(b, ctx) ? 50 : 0) +
      ctx.learnedForbiddenPatterns.filter((pattern) => pattern && bText.includes(pattern.slice(0, 12))).length * 4 +
      batchSimilarityPenalty(b, ctx.batchAvoidTexts);
    const aBonus = ctx.learnedPreferredPatterns.filter((pattern) => pattern && aText.includes(pattern.slice(0, 12))).length;
    const bBonus = ctx.learnedPreferredPatterns.filter((pattern) => pattern && bText.includes(pattern.slice(0, 12))).length;
    const aCarryoverBonus =
      carryoverKeys.filter((key) => aKeys.includes(key)).length * 5 +
      (carryoverProduct && a.product === carryoverProduct ? 3 : 0) +
      (canRotateProduct && mostRecentProduct && a.product !== mostRecentProduct ? 8 : 0) +
      (canRotateProduct && mostRecentProduct && a.product === mostRecentProduct ? -10 : 0) +
      externalPatternBonus(a, ctx) +
      templateFreshnessBonus(a, ctx);
    const bCarryoverBonus =
      carryoverKeys.filter((key) => bKeys.includes(key)).length * 5 +
      (carryoverProduct && b.product === carryoverProduct ? 3 : 0) +
      (canRotateProduct && mostRecentProduct && b.product !== mostRecentProduct ? 8 : 0) +
      (canRotateProduct && mostRecentProduct && b.product === mostRecentProduct ? -10 : 0) +
      externalPatternBonus(b, ctx) +
      templateFreshnessBonus(b, ctx);
    return (aPenalty - aBonus - aCarryoverBonus) - (bPenalty - bBonus - bCarryoverBonus);
  });

  // 상위 3개 중 랜덤 선택 — 같은 입력이라도 매번 다른 결과 (A→A→A 방지 핵심)
  const topN = ranked.slice(0, Math.min(3, ranked.length));
  const selected = topN.length > 0
    ? pickRandom(topN)
    : candidatesFor({ ...ctx, availableProducts: ['위너프에이플러스', '페린젝트'] })[0] ?? buildDepartmentFallbackPlanCandidate(ctx);
  const runnerUp = ranked.find((c) => c !== selected && c.detailAxis !== selected.detailAxis);
  const carryoverNote = latestStrategy
    ? `; 최근 다음방문전략(${latestStrategy.slice(0, 60)})과 이어질 수 있는 후보를 우선 반영`
    : '';
  return {
    ...withUnusedReaction(selected, ctx),
    nextVisitDetailAxis: runnerUp?.detailAxis,
    selectionReason: `과 ${ctx.doctor.department}, 최근 ${veryRecentKeys.join(', ') || '없음'}, 배치 ${ctx.batchUsedDetailKeys.join(', ') || '없음'} 기준으로 중복을 줄여 조합 선택${carryoverNote}`,
  };
}

export function preCheckUniqueness(plan: DetailKey, ctx: VisitContext): DetailKey {
  const planKeys = extractKeys(planText(plan));
  const planReactionKeys = extractReactionKeys(plan.doctorReaction);
  const used = new Set([...ctx.batchUsedDetailKeys, ...collectKeys(ctx.recentStrategies)]);
  const usedReaction = new Set(ctx.batchUsedReactionKeys);
  const templateUsed = plan.templateId ? ctx.batchUsedTemplateIds.includes(plan.templateId) : false;
  if (!planKeys.some((key) => used.has(key)) && !planReactionKeys.some((key) => usedReaction.has(key)) && !templateUsed) return plan;

  const alternative = candidatesFor(ctx).find((candidate) => {
    const keys = extractKeys(planText(candidate));
    const reactionKeys = extractReactionKeys(candidate.doctorReaction);
    return keys.every((key) => !used.has(key)) && reactionKeys.every((key) => !usedReaction.has(key)) && (!candidate.templateId || !ctx.batchUsedTemplateIds.includes(candidate.templateId));
  });

  if (!alternative) return withUnusedReaction(plan, ctx);
  return {
    ...withUnusedReaction(alternative, ctx),
    selectionReason: `${plan.selectionReason}; precheck에서 중복 키 감지 후 대체 조합 선택`,
  };
}
