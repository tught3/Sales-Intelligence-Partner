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
  '처방 전환은 케이스별로 보되 Hb 회복 근거는 참고하겠다는 반응',
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

function hasUsedReaction(reaction: string, ctx: VisitContext): boolean {
  const keys = extractReactionKeys(reaction);
  return keys.length > 0 && keys.some((key) => ctx.batchUsedReactionKeys.includes(key));
}

function selectNonDuplicateReaction(plan: DetailKey, ctx: VisitContext): string {
  if (!hasUsedReaction(plan.doctorReaction, ctx)) return plan.doctorReaction;
  return REACTION_REPLACEMENTS.find((reaction) => !hasUsedReaction(reaction, ctx)) ?? '진료 흐름에 맞춰 케이스별로 판단하겠다는 의견';
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
  const reaction = hasReaction ? '' : ` 교수님께서 관련 케이스는 진료 흐름에 맞춰 보겠다는 의견 보임`;
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
  const formattedLog = limit(
    `${safePlan.product}의 ${safePlan.detailAxis}을 ${safePlan.patientGroup} 상황과 연결해 디테일 진행함. 교수님께서 ${formatDoctorReactionSentence(doctorReaction)}. 다음 처방은 진료 흐름에 맞춰 선별해 보겠다는 의견 보임`,
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
  const formattedLog = limit(
    `${safePlan.product}의 ${safePlan.detailAxis}을 ${safePlan.patientGroup} 상황에 맞춰 설명함. 교수님께서 ${formatDoctorReactionSentence(doctorReaction)}. 급여와 처방 시점은 차트와 당일 진료 흐름을 보고 판단하겠다는 의견 보임`,
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
