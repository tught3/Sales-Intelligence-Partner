import type { DetailKey, RepairTarget, ValidationResult } from './types';
import type { VisitContext } from './context';
import { buildDepartmentSafeVisitOutput } from './departmentProfiles';

export const MAX_REPAIR_ATTEMPTS = 2;

export type RepairOutput = {
  formattedLog: string;
  nextStrategy: string;
  usedFallback: boolean;
};

export function buildFallback(plan: DetailKey, ctx: Pick<VisitContext, 'doctor' | 'batchUsedReactionKeys' | 'learnedPreferredPatterns'>): RepairOutput {
  const fallback = buildDepartmentSafeVisitOutput(plan.product, ctx.doctor.department || '');
  return {
    formattedLog: fallback.formattedLog,
    nextStrategy: fallback.nextStrategy,
    usedFallback: true,
  };
}

export async function repair(
  current: { formattedLog: string; nextStrategy: string },
  _validation: ValidationResult & { pass: false },
  plan: DetailKey,
  ctx: VisitContext,
  target: RepairTarget,
  _attempt: number
): Promise<RepairOutput> {
  const fallback = buildFallback(plan, ctx);
  const requiresFullFallback = target.reasons.some((reason) =>
    reason === 'DEPARTMENT_MISMATCH' ||
    reason === 'MISSING_DETAIL' ||
    reason === 'GENERIC_REACTION' ||
    reason === 'FOREIGN_PRODUCT_MENTION' ||
    reason === 'NEXT_VISIT_LEAK'
  );

  if (requiresFullFallback || target.field === 'both') return fallback;
  if (target.field === 'formattedLog') {
    return {
      formattedLog: fallback.formattedLog,
      nextStrategy: current.nextStrategy || fallback.nextStrategy,
      usedFallback: true,
    };
  }
  if (target.field === 'nextStrategy') {
    return {
      formattedLog: current.formattedLog,
      nextStrategy: fallback.nextStrategy,
      usedFallback: true,
    };
  }
  return fallback;
}
