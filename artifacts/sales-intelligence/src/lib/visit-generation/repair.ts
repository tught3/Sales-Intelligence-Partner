import type { DetailKey, RepairTarget, ValidationResult } from './types';
import type { VisitContext } from './context';

export const MAX_REPAIR_ATTEMPTS = 2;

export type RepairOutput = {
  formattedLog: string;
  nextStrategy: string;
  usedFallback: boolean;
};

export async function repair(
  current: { formattedLog: string; nextStrategy: string },
  _validation: ValidationResult & { pass: false },
  _plan: DetailKey,
  _ctx: VisitContext,
  _target: RepairTarget,
  _attempt: number
): Promise<RepairOutput> {
  // few-shot 프롬프트로 전환됐으므로 AI 출력을 하드코딩 문장으로 교체하지 않고 그대로 반환
  return { formattedLog: current.formattedLog, nextStrategy: current.nextStrategy, usedFallback: false };
}
