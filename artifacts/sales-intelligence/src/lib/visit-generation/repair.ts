import type { VisitContext } from './context';
import type { DetailKey, RepairTarget, ValidationResult } from './types';
import { extractReactionKeys } from './detailKeys';

export const MAX_REPAIR_ATTEMPTS = 2;

export type RepairOutput = {
  formattedLog: string;
  nextStrategy: string;
  usedFallback: boolean;
};

const REACTION_REPLACEMENTS = [
  '급여 기준에 맞는 케이스부터 차트로 확인해보겠다는 의견',
  'Hb 수치와 증상을 같이 보고 필요 시 선별하겠다는 반응',
  '경구용철분제 반응이 부족한 경우부터 고려 가능하다는 의견',
  '수혈 부담을 줄일 수 있는 케이스에서는 검토 여지가 있다는 반응',
  '처방 경험이 많지는 않아도 기준에 맞으면 확인해보겠다는 의견',
  '영양 보충 필요성은 공감하지만 처방 시점은 환자 상태를 보고 판단하겠다는 반응',
  '차트상 빈혈 추이와 외래 일정이 맞는 환자부터 확인해보겠다는 의견',
  '처방 전환은 케이스별로 보되 Hb 회복 근거는 차트로 보겠다는 반응',
  '외래 경과와 차트를 보고 적용 가능 케이스를 다시 보겠다는 의견',
  '실제 처방은 환자 추이를 보고 다시 판단하겠다는 반응',
  '반복 내원이 어려운 환자는 편의성은 이해하셨고 급여 기준을 보겠다는 의견',
  '급여 조건과 환자 상태가 맞는지 차트로 보겠다는 반응',
  '환자군이 맞으면 처방 가능성을 살펴보겠다는 의견',
  '실제 사용은 외래 추적 케이스부터 보겠다는 반응',
  '재방문 부담이 큰 환자에서 우선 확인해보겠다는 의견',
];

function formatDoctorReactionSentence(reaction: string): string {
  const cleaned = reaction.trim().replace(/[.。!?]+$/g, '');
  if (/인정하셨음$/.test(cleaned)) {
    return cleaned.replace(/인정하셨음$/, '인정하신 것으로 보임');
  }
  if (/보임$/.test(cleaned)) return cleaned;
  return `${cleaned} 보임`;
}

function limit(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max - 3).replace(/[,\s]+$/g, '') + '...';
}

function hashSeed(...parts: string[]): number {
  const joined = parts.filter(Boolean).join('|');
  let hash = 0;
  for (let i = 0; i < joined.length; i++) {
    hash = (hash * 31 + joined.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function hasUsedReaction(reaction: string, ctx: VisitContext): boolean {
  const keys = extractReactionKeys(reaction);
  return keys.length > 0 && keys.some((key) => ctx.batchUsedReactionKeys.includes(key));
}

function selectNonDuplicateReaction(plan: DetailKey, ctx: VisitContext): string {
  if (!hasUsedReaction(plan.doctorReaction, ctx)) return plan.doctorReaction;
  const seed = hashSeed(plan.product, plan.patientGroup, plan.detailAxis, plan.narrativeStyle, ctx.doctor.department);
  const candidates = [...REACTION_REPLACEMENTS].sort((a, b) =>
    Math.abs(hashSeed(seed.toString(), a)) - Math.abs(hashSeed(seed.toString(), b))
  );
  return candidates.find((reaction) => !hasUsedReaction(reaction, ctx)) ?? '차트상 빈혈 추이와 증상을 함께 보고 다시 판단하겠다는 의견';
}

function selectFollowUpClause(plan: DetailKey, ctx: VisitContext): string {
  const department = ctx.doctor.department || '';
  const product = plan.product;
  const seed = hashSeed(plan.product, plan.patientGroup, plan.detailAxis, plan.doctorReaction, plan.narrativeStyle, department);
  const options = (() => {
    if (/산부인과|산과|부인과/.test(department) && product === '페린젝트') {
      return [
        '다음에는 산후 외래나 수술 전후 회복기 환자에서 적용 가능 케이스를 다시 볼예정',
        '다음에는 분만 후 빈혈 환자의 외래 추이를 다시 확인할예정',
        '다음에는 수술 전후 빈혈에서 급여 기준과 적용 케이스를 살펴볼예정',
        '다음에는 산후 회복 환자에서 Hb 추이와 처방 가능성을 다시 볼예정',
        '다음에는 외래 추적이 필요한 빈혈 환자에서 급여 기준을 확인할예정',
      ];
    }
    if (/종양|혈액종양|혈액내과/.test(department) && product === '페린젝트') {
      return [
        '다음에는 항암 전후 빈혈에서 급여 기준과 실제 적용 환자를 다시 확인할예정',
        '다음에는 햅시딘 상승이 의심되는 환자에서 경구용철분제 반응을 다시 볼예정',
        '다음에는 항암치료 중 Hb 추이를 보며 적용 가능 케이스를 살펴볼예정',
        '다음에는 경구용철분제 반응이 더딘 환자에서 외래 처방 가능성을 확인할예정',
        '다음에는 급여 조건과 Hb 회복 속도를 함께 볼예정',
      ];
    }
    if (/소화기/.test(department) && product === '페린젝트') {
      return [
        '다음에는 위장관 출혈 뒤 Hb 회복이 더딘 외래 환자를 다시 확인할예정',
        '다음에는 경구용철분제 반응이 부족한 빈혈 환자를 다시 볼예정',
        '다음에는 급여 기준에 맞는 외래 빈혈 환자를 살펴볼예정',
        '다음에는 외래 추적이 부담되는 환자에서 처방 가능성을 다시 볼예정',
        '다음에는 Hb 회복 경과와 급여 기준을 차트로 확인할예정',
      ];
    }
    if (/소화기/.test(department) && product === '위너프에이플러스') {
      return [
        '다음에는 식사량 저하나 IBD 환자에서 영양 반응을 살펴볼예정',
        '다음에는 장관 영양 부담이 큰 환자에서 혈당 부담 차이를 확인할예정',
        '다음에는 영양 보충이 필요한 외래 환자에서 실제 반응을 볼예정',
        '다음에는 식사 진행이 더딘 환자에서 단백 보충 반응을 확인할예정',
        '다음에는 회복기 외래 환자에서 영양 공급 흐름을 다시 볼예정',
      ];
    }
    if (/산부인과|산과|부인과/.test(department) && product === '위너프에이플러스') {
      return [
        '다음에는 분만 후 식이 지연이나 회복기 환자에서 영양 반응을 확인할예정',
        '다음에는 산후 회복기 환자의 식사 진행과 함께 확인할예정',
        '다음에는 수술 전후 회복기에서 영양 공급 반응을 살펴볼예정',
        '다음에는 산후 빈혈이 아닌 회복기 영양 흐름에서 혈당 부담 차이를 확인할예정',
        '다음에는 부인과 수술 후 식이 진행 환자에서 단백 보충을 볼예정',
      ];
    }
    if (product === '페린젝트') {
      return [
        '다음에는 외래 빈혈 환자에서 급여 기준과 적용 케이스를 다시 볼예정',
        '다음에는 Hb 회복 속도를 보며 적용 가능 환자를 확인할예정',
        '다음에는 수혈 부담이 있는 환자에서 처방 가능성을 살펴볼예정',
        '다음에는 외래 재방문이 부담되는 환자에서 1회 투여 장점을 다시 볼예정',
        '다음에는 급여 기준과 Hb 추이를 함께 확인할예정',
      ];
    }
    return [
      '다음에는 수술 후 식이 지연 환자에서 실제 적용 반응을 살펴볼예정',
      '다음에는 영양 공급이 늦어지는 환자에서 혈당 부담 차이를 확인할예정',
      '다음에는 회복기 환자에서 단백 보충 반응을 볼예정',
      '다음에는 회복기 외래 환자에서 적용 가능 케이스를 다시 볼예정',
      '다음에는 환자 상태와 처방 가능성을 함께 살펴볼예정',
    ];
  })();
  const chosen = options
    .map((item, index) => ({ item, index }))
    .sort((a, b) => Math.abs(hashSeed(seed.toString(), a.index.toString())) - Math.abs(hashSeed(seed.toString(), b.index.toString())))
    .map(({ item }) => item)
    .find((item) => !extractReactionKeys(item).some((key) => ctx.batchUsedReactionKeys.includes(key))) ?? options[0];
  return chosen;
}

function safePlanForDepartment(plan: DetailKey, ctx: VisitContext): DetailKey {
  const department = ctx.doctor.department || '';
  if (/소화기/.test(department) && plan.product === '페린젝트') {
    return {
      ...plan,
      patientGroup: '위장관 출혈 이후 경구용철분제로 Hb 회복이 더딘 소화기내과 외래 빈혈 환자',
      detailAxis: '페린젝트의 1회 투여 편의성과 Hb 회복 근거',
      doctorReaction: '재방문 부담이 있는 환자에서는 편의성은 이해하셨고 급여 기준에 맞는지는 차트로 확인해보겠다는 반응',
      nextAction: '위너프에이플러스 IBD 악화나 식사량 저하 환자의 영양 보충 필요성 확인',
    };
  }
  if (/소화기/.test(department) && plan.product === '위너프에이플러스') {
    return {
      ...plan,
      patientGroup: 'IBD 악화나 식사량 저하로 영양 보충을 같이 보는 소화기내과 환자',
      detailAxis: '위너프에이플러스의 아미노산 25% 증가와 포도당 부담 감소',
      doctorReaction: '식사량이 떨어지는 환자에서는 영양 보충 필요성은 공감하셨고 혈당 부담은 처방 전 같이 보겠다는 의견',
      nextAction: '페린젝트 위장관 출혈 후 Hb 회복이 더딘 외래 빈혈 케이스 사용 경험 확인',
    };
  }
  if (/산부인과|산과|부인과/.test(department) && plan.product === '페린젝트') {
    return {
      ...plan,
      patientGroup: '분만 후 빈혈이나 부인과 수술 전후 Hb 회복을 추적 중인 환자',
      detailAxis: '페린젝트의 1회 투여 편의성과 시험투여 부담이 적은 점',
      doctorReaction: '반복 내원이 어려운 산후 환자나 수술 전후 빈혈 환자에서는 편의성을 인정하신 것으로 보임',
      nextAction: '위너프에이플러스 부인과 수술 전후 영양 공급 시 혈당 부담 차이 확인',
    };
  }
  return plan;
}

function buildManualPreservingFallback(plan: DetailKey, ctx: VisitContext): RepairOutput | null {
  const raw = ctx.manualRawNotes?.trim();
  if (!raw) return null;
  const compactRaw = raw.replace(/\s+/g, '');
  const product = ['페린젝트', '위너프에이플러스'].find((item) => compactRaw.includes(item)) ?? plan.product;
  const normalizedRaw = raw
    .replace(/\s+/g, ' ')
    .replace(/[.。]$/g, '')
    .trim();
  const hasReaction = /공감|반응|의견|질문|하심|보임|고려|확인/.test(normalizedRaw);
  const reactionOptions = [
    ' 교수님께서 관련 케이스는 차트상 먼저 보겠다는 의견 보임',
    ' 교수님께서 환자 상태를 보고 다시 판단하겠다는 의견 보임',
    ' 교수님께서 급여 기준에 맞는지 먼저 보겠다는 의견 보임',
  ];
  const reaction = hasReaction ? '' : reactionOptions[hashSeed(product, normalizedRaw) % reactionOptions.length];
  const preferred = ctx.learnedPreferredPatterns.find((item) => item.includes(product) || /반응|의견|보임/.test(item));
  const preferredTail = preferred && !normalizedRaw.includes(preferred.slice(0, 8))
    ? ` ${preferred.replace(/^추가:\s*/, '').slice(0, 45)}`
    : '';
  const formattedLog = limit(`${normalizedRaw}${reaction}${preferredTail}`, 230);
  const nextSeed = plan.nextAction.includes(product)
    ? plan.nextAction
    : `${product} 관련 처방 가능 상황과 교수님 반응 확인`;
  const nextStrategy = limit(`다음방문시에는 ${nextSeed}할예정`, 120);
  return { formattedLog, nextStrategy, usedFallback: true };
}

export function buildFallback(plan: DetailKey, ctx: VisitContext): RepairOutput {
  const manual = buildManualPreservingFallback(plan, ctx);
  if (manual) return manual;
  const safePlan = safePlanForDepartment(plan, ctx);
  const doctorReaction = selectNonDuplicateReaction(safePlan, ctx);
  const followUp = selectFollowUpClause(safePlan, ctx);
  const leadIns = [
    `${safePlan.product}의 ${safePlan.detailAxis}을 ${safePlan.patientGroup}와 연결해 디테일 진행함`,
    `${safePlan.product}의 ${safePlan.detailAxis}을 ${safePlan.patientGroup} 흐름에 맞춰 설명드림`,
    `${safePlan.product}의 ${safePlan.detailAxis}을 ${safePlan.patientGroup} 맥락에서 정리함`,
  ];
  const opener = leadIns[hashSeed(safePlan.product, safePlan.patientGroup, safePlan.detailAxis, safePlan.narrativeStyle) % leadIns.length];
  const formattedLog = limit(
    `${opener}. 교수님께서 ${formatDoctorReactionSentence(doctorReaction)}. ${followUp}`,
    230
  );
  const nextStrategy = limit(`다음방문시에는 ${safePlan.nextAction}할예정`, 120);
  return { formattedLog, nextStrategy, usedFallback: true };
}

export function buildValidationSafeFallback(plan: DetailKey, ctx: VisitContext): RepairOutput {
  const manual = buildManualPreservingFallback(plan, ctx);
  if (manual) return manual;
  const safePlan = safePlanForDepartment(plan, ctx);
  const doctorReaction = selectNonDuplicateReaction(safePlan, ctx);
  const followUp = selectFollowUpClause(safePlan, ctx);
  const leadIns = [
    `${safePlan.product}의 ${safePlan.detailAxis}을 ${safePlan.patientGroup} 상황에 맞춰 설명함`,
    `${safePlan.product}의 ${safePlan.detailAxis}을 ${safePlan.patientGroup} 기준으로 안내함`,
    `${safePlan.product}의 ${safePlan.detailAxis}을 ${safePlan.patientGroup}에서 실제로 볼 수 있는 흐름으로 설명함`,
  ];
  const opener = leadIns[hashSeed(safePlan.product, safePlan.patientGroup, safePlan.detailAxis, safePlan.narrativeStyle, 'validation') % leadIns.length];
  const formattedLog = limit(
    `${opener}. 교수님께서 ${formatDoctorReactionSentence(doctorReaction)}. ${followUp}`,
    230
  );
  const nextStrategy = limit(`다음방문시에는 ${safePlan.nextAction}할예정`, 120);
  return { formattedLog, nextStrategy, usedFallback: true };
}

export async function repair(
  current: { formattedLog: string; nextStrategy: string },
  validation: ValidationResult & { pass: false },
  plan: DetailKey,
  ctx: VisitContext,
  target: RepairTarget,
  attempt: number
): Promise<RepairOutput> {
  if (attempt >= MAX_REPAIR_ATTEMPTS) return buildFallback(plan, ctx);

  const fallback = buildFallback(plan, ctx);
  if (target.field === 'nextStrategy') {
    return { formattedLog: current.formattedLog, nextStrategy: fallback.nextStrategy, usedFallback: false };
  }
  if (target.field === 'formattedLog') {
    return { formattedLog: fallback.formattedLog, nextStrategy: current.nextStrategy, usedFallback: false };
  }

  return {
    formattedLog: fallback.formattedLog,
    nextStrategy: fallback.nextStrategy,
    usedFallback: validation.failTypes.includes('DUPLICATE_BATCH') || validation.failTypes.includes('DUPLICATE_PAST'),
  };
}
