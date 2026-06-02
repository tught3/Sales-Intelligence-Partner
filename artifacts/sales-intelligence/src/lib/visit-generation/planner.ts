import type { VisitContext } from './context';
import { collectKeys, extractKeys, extractReactionKeys, similarityRatio } from './detailKeys';
import type { ExternalCasePattern } from '../storage';
import type { DetailKey } from './types';

type PlanCandidate = Omit<DetailKey, 'selectionReason'>;

const REACTION_FALLBACKS = [
  '급여 기준에 맞는 케이스부터 차트로 확인해보겠다는 의견',
  'Hb 수치와 증상을 같이 보고 필요 시 선별하겠다는 반응',
  '처방 경험이 많지는 않아도 기준에 맞으면 확인해보겠다는 의견',
  '영양 보충 필요성은 공감하지만 처방 시점은 환자 상태를 보고 판단하겠다는 반응',
  '외래 경과와 차트를 보고 적용 가능 케이스를 다시 보겠다는 반응',
  '수혈 부담을 줄일 수 있는 케이스에서는 검토 여지가 있다는 반응',
  '실제 처방은 환자 추이를 보고 다시 판단하겠다는 의견',
  '외래 추적이 촘촘한 환자에서는 편의성은 이해하셨다는 반응',
  '짧은 간격 재방문이 부담되는 환자에서는 고려 가능하다는 의견',
  '기준이 맞는 환자부터 차트로 보겠다는 반응',
];

function hashSeed(...parts: string[]): number {
  const joined = parts.filter(Boolean).join('|');
  let hash = 0;
  for (let i = 0; i < joined.length; i++) {
    hash = (hash * 31 + joined.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function pickBySeed<T>(values: T[], ...parts: string[]): T {
  if (values.length === 0) throw new Error('pickBySeed requires values');
  const seed = hashSeed(...parts);
  return values[seed % values.length];
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

function buildExternalCandidateVariants(pattern: ExternalCasePattern, ctx: VisitContext): PlanCandidate[] {
  const seed = hashSeed(
    pattern.id,
    ctx.doctor.id,
    ctx.doctor.department || '',
    String(ctx.batchUsedDetailKeys.length),
    String(ctx.batchUsedReactionKeys.length)
  );
  const detailVariants = externalDetailVariants(pattern);
  const reactionVariants = externalReactionVariants(pattern);
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
    const offset = seed + i * 17;
    const detailAxis = detailVariants[offset % detailVariants.length];
    const reactionPattern = reactionVariants[(offset + 5) % reactionVariants.length];
    const nextAction = nextActionVariants[(offset + 11) % nextActionVariants.length];
    const narrativeStyle = styles[(offset + 7) % styles.length];
    variants.push({
      product: pattern.product,
      patientGroup: pattern.patientGroup,
      detailAxis,
      doctorReaction: reactionPattern,
      nextAction,
      narrativeStyle,
      allowedDepartments: [pattern.department],
    });
  }
  return uniqueByText(variants);
}

const WINUF_CANDIDATES: PlanCandidate[] = [
  {
    product: '위너프에이플러스',
    patientGroup: '수술 후 식이 진행이 늦어 정맥영양을 같이 보는 환자',
    detailAxis: '위너프에이플러스의 아미노산 25% 증가와 포도당 부담 감소',
    doctorReaction: '혈당을 보면서 단백 보충을 같이 가져갈 수 있다는 점에는 동의',
    nextAction: '페린젝트 급여 기준에 맞는 외래 빈혈 케이스 사용 경험 확인',
    narrativeStyle: '환자 케이스 연결형',
    allowedDepartments: ['외과', '흉부외과', '신경외과', '정형외과', '간담췌외과'],
  },
  {
    product: '위너프에이플러스',
    patientGroup: '수술 후 회복기에서 식사 진행을 천천히 보는 환자',
    detailAxis: '위너프에이플러스의 단백 보충과 질소균형 유지',
    doctorReaction: '회복 흐름에 맞춰 영양을 같이 볼 수 있다는 점은 이해하셨고 외래보다는 입원 경과를 먼저 보겠다는 의견',
    nextAction: '페린젝트 수술 전후 빈혈 환자에서 급여 기준과 사용 경험 확인',
    narrativeStyle: '처방 경험 확인형',
    allowedDepartments: ['외과', '흉부외과', '신경외과', '정형외과', '간담췌외과', '산부인과'],
  },
  {
    product: '위너프에이플러스',
    patientGroup: '중환자실에서 혈당 변동과 영양 공급을 같이 보는 상황',
    detailAxis: '위너프에이플러스의 오메가3 조성 유지와 단백 보충',
    doctorReaction: '영양 균형을 보되 병동에서 쓰는 기준은 조금 더 보겠다는 의견',
    nextAction: '페린젝트 수혈 부담을 줄이고 싶은 퇴원 전 빈혈 케이스 확인',
    narrativeStyle: '지난 방문 확인형',
    professorQuestion: '중환자에서 혈당 부담은 어느 정도 차이가 나는지 질문 있어',
    allowedDepartments: ['중환자의학과', '호흡기내과', '응급의학과', '흉부외과', '신경외과'],
  },
  {
    product: '위너프에이플러스',
    patientGroup: '수술 전후로 경구 섭취가 불안정한 환자',
    detailAxis: '위너프에이플러스의 포도당 부담 감소와 단백 공급량 차이',
    doctorReaction: '기존 TPN 대비 차이는 이해하셨지만 실제 적용은 회복기 환자부터 보겠다는 반응',
    nextAction: '페린젝트 Hb 회복 경과와 수혈 회피 가능 케이스 확인',
    narrativeStyle: '교수 질문 답변형',
    professorQuestion: '기존 위너프와 어떤 차이로 봐야 하는지 질문 있어',
    allowedDepartments: ['외과', '흉부외과', '신경외과', '정형외과', '간담췌외과', '산부인과'],
  },
  {
    product: '위너프에이플러스',
    patientGroup: '회복기 외래 환자에서 식사 진행이 늦어 영양 보충을 같이 보는 경우',
    detailAxis: '위너프에이플러스의 포도당 부담 감소와 실제 적용 편의성',
    doctorReaction: '회복기 환자에서는 혈당 부담 차이를 먼저 보겠다는 의견',
    nextAction: '페린젝트 외래 빈혈 환자에서 1회 투여와 Hb 회복 경과 확인',
    narrativeStyle: '급여 기준 재확인형',
    allowedDepartments: ['외과', '흉부외과', '신경외과', '정형외과', '간담췌외과', '산부인과'],
  },
  {
    product: '위너프에이플러스',
    patientGroup: 'IBD 악화나 식사량 저하로 영양 보충을 같이 보는 소화기내과 환자',
    detailAxis: '위너프에이플러스의 아미노산 25% 증가와 포도당 부담 감소',
    doctorReaction: '식사량이 떨어지는 환자에서는 영양 보충 필요성은 공감하셨고 혈당 부담은 처방 전 같이 보겠다는 의견',
    nextAction: '페린젝트 위장관 출혈 후 Hb 회복이 더딘 외래 빈혈 케이스 사용 경험 확인',
    narrativeStyle: '환자 케이스 연결형',
    allowedDepartments: ['소화기내과'],
  },
  {
    product: '위너프에이플러스',
    patientGroup: '부인과 수술 후 식이 진행이 늦어 영양 공급을 같이 보는 환자',
    detailAxis: '위너프에이플러스의 아미노산 조성과 혈당 부담 차이',
    doctorReaction: '수술 후 회복기에서는 영양 흐름을 같이 보겠다는 의견',
    nextAction: '페린젝트 분만 후 빈혈 환자의 외래 추이와 급여 기준 확인',
    narrativeStyle: '지난 방문 확인형',
    allowedDepartments: ['산부인과', '산과', '부인과'],
  },
];

const FERINJECT_CANDIDATES: PlanCandidate[] = [
  {
    product: '페린젝트',
    patientGroup: '경구용철분제로 Hb 회복이 충분하지 않은 외래 빈혈 환자',
    detailAxis: '페린젝트의 1회 투여 편의성과 Hb 회복 근거',
    doctorReaction: '반복 내원이 어려운 환자에서는 설명해볼 수 있겠다는 반응',
    nextAction: '위너프에이플러스 수술 후 식이 지연 환자 영양 보충 반응 확인',
    narrativeStyle: '처방 경험 확인형',
    blockedDepartments: ['산부인과'],
  },
  {
    product: '페린젝트',
    patientGroup: '외래 재방문이 부담돼 한 번에 철 보충을 보는 환자',
    detailAxis: '페린젝트의 1회 투여와 외래 추적 부담 감소',
    doctorReaction: '외래 일정이 빡빡한 환자에서는 볼 수 있겠다는 의견',
    nextAction: '위너프에이플러스 산후 회복기 영양 공급 반응 확인',
    narrativeStyle: '교수 질문 답변형',
    professorQuestion: '외래에서 한 번에 넣는 장점이 실제로 있는지 질문 있어',
    blockedDepartments: ['산부인과'],
  },
  {
    product: '페린젝트',
    patientGroup: '항암치료 중 햅시딘 상승과 경구용철분제 흡수 저하로 빈혈이 오래 가는 환자',
    detailAxis: '페린젝트의 1회 투여 편의성과 Hb 회복 근거',
    doctorReaction: '경구용철분제로는 회복이 더딜 수 있어 빠르게 보려는 케이스는 차트로 보겠다는 의견',
    nextAction: '항암 전후 빈혈에서 급여 기준과 처방 후보 확인',
    narrativeStyle: '환자 케이스 연결형',
    allowedDepartments: ['종양내과', '혈액종양내과', '종양혈액내과', '혈액내과'],
  },
  {
    product: '페린젝트',
    patientGroup: '수술 전후 Hb 회복을 빨리 봐야 하는 환자',
    detailAxis: '페린젝트의 1회 투여 편의성과 수혈 부담 감소',
    doctorReaction: '수술 일정이 임박한 환자에서는 검토해볼 수 있겠다는 의견',
    nextAction: '위너프에이플러스 수술 후 식이 지연 환자의 영양 보충 차이 확인',
    narrativeStyle: '환자 케이스 연결형',
    allowedDepartments: ['외과', '흉부외과', '신경외과', '정형외과', '간담췌외과', '산부인과'],
  },
  {
    product: '페린젝트',
    patientGroup: '분만 후 피로감과 빈혈 증상이 남아 외래 추적 중인 환자',
    detailAxis: '페린젝트의 1회 투여 편의성과 시험투여 부담이 적은 점',
    doctorReaction: '산후 외래가 잦지 않은 환자에서는 편의성을 봐줄 수 있겠다는 의견',
    nextAction: '위너프에이플러스 수술 전후 영양 공급 시 혈당 부담 차이 확인',
    narrativeStyle: '지난 방문 확인형',
    allowedDepartments: ['산부인과', '산과', '부인과'],
  },
  {
    product: '페린젝트',
    patientGroup: '수혈은 피하고 싶지만 빠른 철 보충이 필요한 빈혈 케이스',
    detailAxis: '페린젝트의 급여 기준과 수혈 부담 감소 가능성',
    doctorReaction: '급여 기준에 맞으면 고려하겠지만 Hb 수치와 증상은 같이 보겠다는 의견',
    nextAction: '위너프에이플러스 포도당 부담 감소를 수술 후 영양 흐름과 연결해 확인',
    narrativeStyle: '급여 기준 재확인형',
    professorQuestion: '급여 적용 시 Hb 기준을 어디까지 봐야 하는지 질문 있어',
    blockedDepartments: ['산부인과'],
  },
  {
    product: '페린젝트',
    patientGroup: '위장관 출혈 이후 경구용철분제로 Hb 회복이 더딘 소화기내과 외래 빈혈 환자',
    detailAxis: '페린젝트의 1회 투여 편의성과 Hb 회복 근거',
    doctorReaction: '재방문 부담이 있는 환자에서는 1회 투여 장점은 이해하셨고 급여 기준에 맞는지는 차트로 확인해보겠다는 반응',
    nextAction: '위너프에이플러스 IBD 악화나 식사량 저하 환자의 영양 보충 필요성 확인',
    narrativeStyle: '환자 케이스 연결형',
    allowedDepartments: ['소화기내과'],
  },
  {
    product: '페린젝트',
    patientGroup: '분만 후 피로감과 빈혈 증상이 남아 외래 추적 중인 환자',
    detailAxis: '페린젝트의 1회 투여 편의성과 시험투여 부담이 적은 점',
    doctorReaction: '분만 후 외래 재방문이 어려운 환자에서는 편의성을 인정하신 것으로 보임',
    nextAction: '위너프에이플러스 수술 전후 영양 공급 시 혈당 부담 차이 확인',
    narrativeStyle: '지난 방문 확인형',
    allowedDepartments: ['산부인과', '산과', '부인과'],
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
  return true;
}

function candidatesFor(ctx: VisitContext): PlanCandidate[] {
  const externalCandidates: PlanCandidate[] = ctx.externalCasePatterns.flatMap((pattern) => buildExternalCandidateVariants(pattern, ctx));
  const all = [...externalCandidates, ...WINUF_CANDIDATES, ...FERINJECT_CANDIDATES];
  const manualProducts = ctx.manualRawNotes
    ? ctx.availableProducts.filter((product) => ctx.manualRawNotes?.replace(/\s+/g, '').includes(product.replace(/\s+/g, '')))
    : [];
  const productPool = manualProducts.length > 0 ? manualProducts : ctx.availableProducts;
  return all.filter((candidate) =>
    productPool.includes(candidate.product) &&
    isCandidateAllowedForDepartment(candidate, ctx.doctor.department || '')
  );
}

function hasUsedReaction(candidate: PlanCandidate, ctx: VisitContext): boolean {
  const reactionKeys = extractReactionKeys(candidate.doctorReaction);
  return reactionKeys.some((key) => ctx.batchUsedReactionKeys.includes(key));
}

function withUnusedReaction<T extends PlanCandidate>(candidate: T, ctx: VisitContext): T {
  if (!hasUsedReaction(candidate, ctx)) return candidate;
  const replacement = REACTION_FALLBACKS.find((reaction) =>
    extractReactionKeys(reaction).every((key) => !ctx.batchUsedReactionKeys.includes(key))
  );
  return replacement ? { ...candidate, doctorReaction: replacement } : candidate;
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

export function buildPlan(ctx: VisitContext): DetailKey {
  const recentKeys = collectKeys([
    ...ctx.pastLogs.slice(0, 3).flatMap((log) => [log.formattedLog, log.nextStrategy]),
    ...(ctx.manualRawNotes ? [ctx.manualRawNotes] : []),
  ]);
  const latestStrategy = ctx.recentStrategies[0]?.trim() ?? '';
  const carryoverKeys = latestStrategy ? extractKeys(latestStrategy) : [];
  const carryoverProduct = latestStrategy
    ? ['위너프에이플러스', '페린젝트'].find((product) => latestStrategy.includes(product))
    : undefined;
  const batchKeys = new Set(ctx.batchUsedDetailKeys);
  const recentKeySet = new Set(recentKeys);
  const batchProducts = extractBatchProducts(ctx.batchAvoidTexts);

  const baseCandidates = candidatesFor(ctx);
  const reactionSafeCandidates = baseCandidates.filter((candidate) => !hasUsedReaction(candidate, ctx));
  const selectableCandidates = reactionSafeCandidates.length > 0 ? reactionSafeCandidates : baseCandidates.map((candidate) => withUnusedReaction(candidate, ctx));
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

  const ranked = selectableCandidates.sort((a, b) => {
    const aKeys = extractKeys(planText(a));
    const bKeys = extractKeys(planText(b));
    const aReactionKeys = extractReactionKeys(a.doctorReaction);
    const bReactionKeys = extractReactionKeys(b.doctorReaction);
    const aText = planText(a);
    const bText = planText(b);
    const aPenalty =
      aKeys.filter((key) => batchKeys.has(key)).length * 10 +
      aReactionKeys.filter((key) => ctx.batchUsedReactionKeys.includes(key)).length * 25 +
      aKeys.filter((key) => recentKeySet.has(key)).length * 3 +
      (ctx.usedProductsRecently.includes(a.product) ? 1 : 0) +
      (batchProducts.includes(a.product) ? 12 : 0) +
      ctx.learnedForbiddenPatterns.filter((pattern) => pattern && aText.includes(pattern.slice(0, 12))).length * 4 +
      batchSimilarityPenalty(a, ctx.batchAvoidTexts);
    const bPenalty =
      bKeys.filter((key) => batchKeys.has(key)).length * 10 +
      bReactionKeys.filter((key) => ctx.batchUsedReactionKeys.includes(key)).length * 25 +
      bKeys.filter((key) => recentKeySet.has(key)).length * 3 +
      (ctx.usedProductsRecently.includes(b.product) ? 1 : 0) +
      (batchProducts.includes(b.product) ? 12 : 0) +
      ctx.learnedForbiddenPatterns.filter((pattern) => pattern && bText.includes(pattern.slice(0, 12))).length * 4 +
      batchSimilarityPenalty(b, ctx.batchAvoidTexts);
    const aBonus = ctx.learnedPreferredPatterns.filter((pattern) => pattern && aText.includes(pattern.slice(0, 12))).length;
    const bBonus = ctx.learnedPreferredPatterns.filter((pattern) => pattern && bText.includes(pattern.slice(0, 12))).length;
    const aCarryoverBonus =
      carryoverKeys.filter((key) => aKeys.includes(key)).length * 5 +
      (carryoverProduct && a.product === carryoverProduct ? 3 : 0) +
      externalPatternBonus(a, ctx);
    const bCarryoverBonus =
      carryoverKeys.filter((key) => bKeys.includes(key)).length * 5 +
      (carryoverProduct && b.product === carryoverProduct ? 3 : 0) +
      externalPatternBonus(b, ctx);
    return (aPenalty - aBonus - aCarryoverBonus) - (bPenalty - bBonus - bCarryoverBonus);
  });

  const selected = ranked[0] ?? candidatesFor({ ...ctx, availableProducts: ['위너프에이플러스', '페린젝트'] })[0] ?? FERINJECT_CANDIDATES[0];
  const carryoverNote = latestStrategy
    ? `; 최근 다음방문전략(${latestStrategy.slice(0, 60)})과 이어질 수 있는 후보를 우선 반영`
    : '';
  return {
    ...withUnusedReaction(selected, ctx),
    selectionReason: `과 ${ctx.doctor.department}, 최근 ${recentKeys.join(', ') || '없음'}, 배치 ${ctx.batchUsedDetailKeys.join(', ') || '없음'} 기준으로 중복을 줄여 조합 선택${carryoverNote}`,
  };
}

export function preCheckUniqueness(plan: DetailKey, ctx: VisitContext): DetailKey {
  const planKeys = extractKeys(planText(plan));
  const planReactionKeys = extractReactionKeys(plan.doctorReaction);
  const used = new Set([...ctx.batchUsedDetailKeys, ...collectKeys(ctx.recentStrategies)]);
  const usedReaction = new Set(ctx.batchUsedReactionKeys);
  if (!planKeys.some((key) => used.has(key)) && !planReactionKeys.some((key) => usedReaction.has(key))) return plan;

  const alternative = candidatesFor(ctx).find((candidate) => {
    const keys = extractKeys(planText(candidate));
    const reactionKeys = extractReactionKeys(candidate.doctorReaction);
    return keys.every((key) => !used.has(key)) && reactionKeys.every((key) => !usedReaction.has(key));
  });

  if (!alternative) return withUnusedReaction(plan, ctx);
  return {
    ...withUnusedReaction(alternative, ctx),
    selectionReason: `${plan.selectionReason}; precheck에서 중복 키 감지 후 대체 조합 선택`,
  };
}
