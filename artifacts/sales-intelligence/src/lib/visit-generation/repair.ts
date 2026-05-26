import type { VisitContext } from './context';
import type { DetailKey, RepairTarget, ValidationResult } from './types';

export const MAX_REPAIR_ATTEMPTS = 2;

export type RepairOutput = {
  formattedLog: string;
  nextStrategy: string;
  usedFallback: boolean;
};

function limit(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max - 3).replace(/[,\s]+$/g, '') + '...';
}

export function buildFallback(plan: DetailKey, ctx: VisitContext): RepairOutput {
  const formattedLog = limit(
    `${plan.product}의 ${plan.detailAxis}을 ${plan.patientGroup} 중심으로 디테일 진행함. 교수님께서 ${plan.doctorReaction}하셨고, 실제 적용은 ${ctx.doctor.department} 환자 흐름에 맞춰 선별하겠다는 의견 보임`,
    230
  );
  const nextStrategy = limit(`다음방문시에는 ${plan.nextAction}할예정`, 120);
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
