import type { VisitContext } from './context';
import { isDuplicateOf } from './detailKeys';
import { findAlternativePlan } from './planner';
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
    `${plan.patientGroup}에서 ${plan.detailAxis}을 디테일 진행함. 교수님께서 ${plan.doctorReaction} 보임`,
    230
  );
  const nextStrategy = limit(`다음방문시에는 ${plan.nextAction} 디테일 예정`, 120);
  return { formattedLog, nextStrategy, usedFallback: true };
}

function hasOutputConflict(output: RepairOutput, ctx: VisitContext): boolean {
  const combined = `${output.formattedLog} ${output.nextStrategy}`;
  return isDuplicateOf(combined, ctx.batchAvoidTexts, 0.4) ||
    isDuplicateOf(combined, ctx.pastLogs.map((log) => `${log.formattedLog} ${log.nextStrategy}`), 0.5);
}

function buildNonConflictingFallback(plan: DetailKey, ctx: VisitContext): RepairOutput {
  const primary = buildFallback(plan, ctx);
  if (!hasOutputConflict(primary, ctx)) return primary;

  const alternative = findAlternativePlan(ctx, plan);
  if (!alternative) return primary;

  const diversified = buildFallback(alternative, ctx);
  return hasOutputConflict(diversified, ctx) ? primary : diversified;
}

export async function repair(
  current: { formattedLog: string; nextStrategy: string },
  validation: ValidationResult & { pass: false },
  plan: DetailKey,
  ctx: VisitContext,
  target: RepairTarget,
  attempt: number
): Promise<RepairOutput> {
  const shouldReplan = validation.failTypes.includes('DUPLICATE_BATCH') || validation.failTypes.includes('DUPLICATE_PAST');
  const repairPlan = shouldReplan ? findAlternativePlan(ctx, plan) ?? plan : plan;
  if (attempt >= MAX_REPAIR_ATTEMPTS) return buildNonConflictingFallback(repairPlan, ctx);

  const fallback = buildNonConflictingFallback(repairPlan, ctx);
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
