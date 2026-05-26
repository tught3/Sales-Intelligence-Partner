import type { VisitContext } from './context';
import { collectKeys, extractKeys } from './detailKeys';
import type { DetailKey } from './types';

type PlanCandidate = Omit<DetailKey, 'selectionReason'>;

const WINUF_CANDIDATES: PlanCandidate[] = [
  {
    product: '위너프에이플러스',
    patientGroup: '중증 수술 후 영양 보충 환자',
    detailAxis: '위너프에이플러스의 아미노산 25% 증가와 포도당 부담 감소',
    doctorReaction: '혈당 부담을 줄이면서 단백 보충을 강화할 수 있다는 점은 공감',
    nextAction: '페린젝트 급여 기준과 실제 사용 반응 확인',
  },
  {
    product: '위너프에이플러스',
    patientGroup: '중환자실 또는 섭취 제한 환자',
    detailAxis: '위너프에이플러스의 오메가3 조성 유지와 단백 보충',
    doctorReaction: '염증 부담과 영양 균형을 같이 볼 수 있다는 점에 관심',
    nextAction: '페린젝트 수혈 부담 감소 케이스 확인',
  },
];

const FERINJECT_CANDIDATES: PlanCandidate[] = [
  {
    product: '페린젝트',
    patientGroup: '경구용철분제 반응 부족 환자',
    detailAxis: '페린젝트의 1회 투여 편의성과 Hb 회복 근거',
    doctorReaction: '외래 추적이 어려운 환자에서 투여 부담을 줄일 수 있다는 점에 공감',
    nextAction: '위너프에이플러스 수술 후 영양 보충 환자군 확인',
  },
  {
    product: '페린젝트',
    patientGroup: '수혈 부담을 줄이고 싶은 빈혈 환자',
    detailAxis: '페린젝트의 급여 기준과 수혈 부담 감소 가능성',
    doctorReaction: '급여 기준에 맞는 환자에서는 고려 가능하지만 실제 대상은 선별하겠다는 의견',
    nextAction: '위너프에이플러스 포도당 부담 감소 차별점 확인',
  },
];

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
    const aKeys = extractKeys(`${a.product} ${a.patientGroup} ${a.detailAxis} ${a.nextAction}`);
    const bKeys = extractKeys(`${b.product} ${b.patientGroup} ${b.detailAxis} ${b.nextAction}`);
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
  const planKeys = extractKeys(`${plan.product} ${plan.patientGroup} ${plan.detailAxis} ${plan.nextAction}`);
  const used = new Set([...ctx.batchUsedDetailKeys, ...collectKeys(ctx.recentStrategies)]);
  if (!planKeys.some((key) => used.has(key))) return plan;

  const alternative = candidatesFor(ctx).find((candidate) => {
    const keys = extractKeys(`${candidate.product} ${candidate.patientGroup} ${candidate.detailAxis} ${candidate.nextAction}`);
    return keys.every((key) => !used.has(key));
  });

  if (!alternative) return plan;
  return {
    ...alternative,
    selectionReason: `${plan.selectionReason}; precheck에서 중복 키 감지 후 대체 조합 선택`,
  };
}
