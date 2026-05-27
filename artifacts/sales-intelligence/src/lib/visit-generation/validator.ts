import type { VisitContext } from './context';
import { extractKeys, isDuplicateOf, similarityRatio } from './detailKeys';
import type { DetailKey, RepairTarget, ValidationFailType, ValidationResult } from './types';

const MIN_VISIT_LOG_LENGTH = 100;
const MAX_VISIT_LOG_LENGTH = 230;

function hasReaction(text: string): boolean {
  return /공감|관심|의견|반응|고려|확인|긍정|제한적|선별/.test(text);
}

function hasForbiddenPhrase(text: string): boolean {
  return /실제\s*적용\s*환자군|적용\s*환자군\s*확인|환자군\s*중심으로|추가\s*디테일\s*진행할예정/.test(text);
}

export function validate(
  formattedLog: string,
  nextStrategy: string,
  plan: DetailKey,
  ctx: VisitContext
): ValidationResult {
  const failTypes: ValidationFailType[] = [];
  const details: string[] = [];

  if (formattedLog.length < MIN_VISIT_LOG_LENGTH) failTypes.push('LENGTH_SHORT');
  if (formattedLog.length > MAX_VISIT_LOG_LENGTH) failTypes.push('LENGTH_LONG');
  if (!formattedLog.includes(plan.product)) failTypes.push('MISSING_PRODUCT');
  if (hasForbiddenPhrase(`${formattedLog} ${nextStrategy}`)) failTypes.push('FORBIDDEN_PHRASE');

  const logKeys = extractKeys(formattedLog);
  const detailKeys = extractKeys(`${plan.detailAxis} ${plan.patientGroup}`);
  if (detailKeys.length > 0 && !detailKeys.some((key) => logKeys.includes(key))) failTypes.push('MISSING_DETAIL');
  if (!hasReaction(formattedLog)) failTypes.push('MISSING_REACTION');

  if (isDuplicateOf(formattedLog, ctx.batchAvoidTexts, 0.4)) failTypes.push('DUPLICATE_BATCH');
  if (isDuplicateOf(formattedLog, ctx.pastLogs.map((log) => `${log.formattedLog} ${log.nextStrategy}`), 0.5)) {
    failTypes.push('DUPLICATE_PAST');
  }
  if (similarityRatio(formattedLog, nextStrategy) >= 0.35) failTypes.push('DUPLICATE_STRATEGY');

  if (failTypes.length === 0) return { pass: true };

  details.push(`failTypes=${[...new Set(failTypes)].join(', ')}`);
  return { pass: false, failTypes: [...new Set(failTypes)], details: details.join('; ') };
}

export function resolveRepairTarget(failTypes: ValidationFailType[]): RepairTarget {
  const unique = [...new Set(failTypes)];
  if (unique.length === 1 && unique[0] === 'DUPLICATE_STRATEGY') {
    return { field: 'nextStrategy', reasons: unique };
  }
  if (unique.every((type) => type === 'LENGTH_SHORT' || type === 'LENGTH_LONG')) {
    return { field: 'formattedLog', reasons: unique };
  }
  return { field: 'both', reasons: unique };
}
