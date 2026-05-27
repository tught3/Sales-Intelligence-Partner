import type { VisitContext } from './context';
import { collectKeys, extractKeys } from './detailKeys';
import type { DetailKey } from './types';

type PlanCandidate = Omit<DetailKey, 'selectionReason'>;

const WINUF_CANDIDATES: PlanCandidate[] = [
  {
    product: '위너프에이플러스',
    patientGroup: '수술 후 식이 진행이 늦어 정맥영양을 같이 보는 환자',
    detailAxis: '위너프에이플러스의 아미노산 25% 증가와 포도당 부담 감소',
    doctorReaction: '혈당을 보면서 단백 보충을 같이 가져갈 수 있다는 점에는 동의',
    nextAction: '페린젝트 급여 기준에 맞는 외래 빈혈 케이스 사용 경험 확인',
    narrativeStyle: '환자 케이스 연결형',
  },
  {
    product: '위너프에이플러스',
    patientGroup: '중환자실에서 혈당 변동과 영양 공급을 같이 보는 상황',
    detailAxis: '위너프에이플러스의 오메가3 조성 유지와 단백 보충',
    doctorReaction: '영양 균형을 보되 병동에서 쓰는 기준은 조금 더 보겠다는 의견',
    nextAction: '페린젝트 수혈 부담을 줄이고 싶은 퇴원 전 빈혈 케이스 확인',
    narrativeStyle: '지난 방문 확인형',
    professorQuestion: '중환자에서 혈당 부담은 어느 정도 차이가 나는지 질문 있어',
  },
  {
    product: '위너프에이플러스',
    patientGroup: '수술 전후로 경구 섭취가 불안정한 환자',
    detailAxis: '위너프에이플러스의 포도당 부담 감소와 단백 공급량 차이',
    doctorReaction: '기존 TPN 대비 차이는 이해하셨지만 처방 전환은 케이스별로 보겠다는 반응',
    nextAction: '페린젝트 Hb 회복 경과와 수혈 회피 가능 케이스 확인',
    narrativeStyle: '교수 질문 답변형',
    professorQuestion: '기존 위너프와 어떤 차이로 봐야 하는지 질문 있어',
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
  },
  {
    product: '페린젝트',
    patientGroup: '수혈은 피하고 싶지만 빠른 철 보충이 필요한 빈혈 케이스',
    detailAxis: '페린젝트의 급여 기준과 수혈 부담 감소 가능성',
    doctorReaction: '급여 기준에 맞으면 고려하겠지만 Hb 수치와 증상은 같이 보겠다는 의견',
    nextAction: '위너프에이플러스 포도당 부담 감소를 수술 후 영양 흐름과 연결해 확인',
    narrativeStyle: '급여 기준 재확인형',
    professorQuestion: '급여 적용 시 Hb 기준을 어디까지 봐야 하는지 질문 있어',
  },
  {
    product: '페린젝트',
    patientGroup: '분만 후 피로감과 빈혈 증상이 남아 외래 추적 중인 환자',
    detailAxis: '페린젝트의 1회 투여 편의성과 시험투여 부담이 적은 점',
    doctorReaction: '분만 후 외래 재방문이 어려운 환자에서는 편의성은 인정하셨음',
    nextAction: '위너프에이플러스 수술 전후 영양 공급 시 혈당 부담 차이 확인',
    narrativeStyle: '지난 방문 확인형',
  },
];

function planText(candidate: PlanCandidate): string {
  return `${candidate.product} ${candidate.patientGroup} ${candidate.detailAxis} ${candidate.doctorReaction} ${candidate.nextAction} ${candidate.narrativeStyle}`;
}

function candidatesFor(ctx: VisitContext): PlanCandidate[] {
  const all = [...WINUF_CANDIDATES, ...FERINJECT_CANDIDATES];
  return all.filter((candidate) => ctx.availableProducts.includes(candidate.product));
}

export function buildPlan(ctx: VisitContext): DetailKey {
  const recentKeys = collectKeys([
    ...ctx.pastLogs.slice(0, 3).flatMap((log) => [log.formattedLog, log.nextStrategy]),
    ...(ctx.manualRawNotes ? [ctx.manualRawNotes] : []),
  ]);
  const batchKeys = new Set(ctx.batchUsedDetailKeys);
  const recentKeySet = new Set(recentKeys);

  const baseCandidates = candidatesFor(ctx);
  if (ctx.isObDoctor && !ctx.hasDailyObFerinject && ctx.availableProducts.includes('페린젝트')) {
    const forced = baseCandidates.find((candidate) => candidate.product === '페린젝트') ?? FERINJECT_CANDIDATES[0];
    return {
      ...forced,
      selectionReason: `오늘(${ctx.todayDate}) 산부인과 페린젝트 기록이 아직 없어 1일 1건 보장 규칙으로 선택`,
    };
  }

  const ranked = baseCandidates.sort((a, b) => {
    const aKeys = extractKeys(planText(a));
    const bKeys = extractKeys(planText(b));
    const aPenalty =
      aKeys.filter((key) => batchKeys.has(key)).length * 10 +
      aKeys.filter((key) => recentKeySet.has(key)).length * 3 +
      (ctx.usedProductsRecently.includes(a.product) ? 1 : 0);
    const bPenalty =
      bKeys.filter((key) => batchKeys.has(key)).length * 10 +
      bKeys.filter((key) => recentKeySet.has(key)).length * 3 +
      (ctx.usedProductsRecently.includes(b.product) ? 1 : 0);
    return aPenalty - bPenalty;
  });

  const selected = ranked[0] ?? FERINJECT_CANDIDATES[0];
  return {
    ...selected,
    selectionReason: `과=${ctx.doctor.department}, 최근키=${recentKeys.join(', ') || '없음'}, 배치키=${ctx.batchUsedDetailKeys.join(', ') || '없음'} 기준으로 중복이 가장 적은 조합 선택`,
  };
}

export function preCheckUniqueness(plan: DetailKey, ctx: VisitContext): DetailKey {
  const planKeys = extractKeys(planText(plan));
  const used = new Set([...ctx.batchUsedDetailKeys, ...collectKeys(ctx.recentStrategies)]);
  if (!planKeys.some((key) => used.has(key))) return plan;

  const alternative = candidatesFor(ctx).find((candidate) => {
    const keys = extractKeys(planText(candidate));
    return keys.every((key) => !used.has(key));
  });

  if (!alternative) return plan;
  return {
    ...alternative,
    selectionReason: `${plan.selectionReason}; precheck에서 중복 키 감지 후 대체 조합 선택`,
  };
}
