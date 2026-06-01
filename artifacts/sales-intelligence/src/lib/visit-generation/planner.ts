import type { VisitContext } from './context';
import { collectKeys, extractKeys, extractReactionKeys } from './detailKeys';
import type { DetailKey } from './types';

type PlanCandidate = Omit<DetailKey, 'selectionReason'>;

const REACTION_FALLBACKS = [
  '급여 기준에 맞는 케이스부터 차트로 확인해보겠다는 의견',
  'Hb 수치와 증상을 같이 보고 필요 시 선별하겠다는 반응',
  '처방 경험이 많지는 않아도 기준에 맞으면 확인해보겠다는 의견',
  '영양 보충 필요성은 공감하지만 처방 시점은 환자 상태를 보고 판단하겠다는 반응',
  '처방 전환은 케이스별로 보되 Hb 회복 근거는 참고하겠다는 반응',
  '수혈 부담을 줄일 수 있는 케이스에서는 검토 여지가 있다는 반응',
];

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
    doctorReaction: '기존 TPN 대비 차이는 이해하셨지만 처방 전환은 케이스별로 보겠다는 반응',
    nextAction: '페린젝트 Hb 회복 경과와 수혈 회피 가능 케이스 확인',
    narrativeStyle: '교수 질문 답변형',
    professorQuestion: '기존 위너프와 어떤 차이로 봐야 하는지 질문 있어',
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
    doctorReaction: '분만 후 외래 재방문이 어려운 환자에서는 편의성은 인정하셨음',
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
  const all = [...WINUF_CANDIDATES, ...FERINJECT_CANDIDATES];
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
      ctx.learnedForbiddenPatterns.filter((pattern) => pattern && aText.includes(pattern.slice(0, 12))).length * 4;
    const bPenalty =
      bKeys.filter((key) => batchKeys.has(key)).length * 10 +
      bReactionKeys.filter((key) => ctx.batchUsedReactionKeys.includes(key)).length * 25 +
      bKeys.filter((key) => recentKeySet.has(key)).length * 3 +
      (ctx.usedProductsRecently.includes(b.product) ? 1 : 0) +
      ctx.learnedForbiddenPatterns.filter((pattern) => pattern && bText.includes(pattern.slice(0, 12))).length * 4;
    const aBonus = ctx.learnedPreferredPatterns.filter((pattern) => pattern && aText.includes(pattern.slice(0, 12))).length;
    const bBonus = ctx.learnedPreferredPatterns.filter((pattern) => pattern && bText.includes(pattern.slice(0, 12))).length;
    const aCarryoverBonus =
      carryoverKeys.filter((key) => aKeys.includes(key)).length * 5 +
      (carryoverProduct && a.product === carryoverProduct ? 3 : 0);
    const bCarryoverBonus =
      carryoverKeys.filter((key) => bKeys.includes(key)).length * 5 +
      (carryoverProduct && b.product === carryoverProduct ? 3 : 0);
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
