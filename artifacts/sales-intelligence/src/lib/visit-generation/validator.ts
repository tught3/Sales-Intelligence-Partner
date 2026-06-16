import type { VisitContext } from './context';
import { extractKeys, extractReactionKeys, isDuplicateOf, similarityRatio } from './detailKeys';
import { hasDepartmentMismatch } from './departmentProfiles';
import { hasVisitLogProductLeak, hasVisitPlanLeak } from './sanitizer';
import type { DetailKey, RepairTarget, ValidationFailType, ValidationResult } from './types';

const MIN_VISIT_LOG_LENGTH = 75;
const MAX_VISIT_LOG_LENGTH = 230;

// 교수님의 반응·의견·행동을 나타내는 표현만 포함 (MR 액션 표현 제외)
function hasReaction(text: string): boolean {
  return /공감|관심|의견|반응|고려|보임|인정|하심|말씀|답변|질문|물으심|여쭤|하겠다|보겠다|드렸더니|알겠다|언급|꺼내심|하셨|처방하심|결정하심/.test(text);
}

function hasForbiddenPhrase(text: string): boolean {
  return /실제\s*적용\s*환자군|적용\s*환자군\s*확인|환자군\s*중심으로|추가\s*디테일\s*진행할예정/.test(text);
}

function hasLearnedForbidden(text: string, patterns: string[]): boolean {
  const compactText = text.replace(/\s+/g, '');
  return patterns.some((pattern) => {
    const sample = pattern.replace(/\s+/g, '').trim();
    if (sample.length < 16) return false;
    if (compactText.includes(sample)) return true;
    if (sample.length < 32) return false;

    const anchors = [
      sample.slice(0, 24),
      sample.slice(Math.max(0, Math.floor(sample.length / 2) - 12), Math.floor(sample.length / 2) + 12),
      sample.slice(-24),
    ].filter((anchor) => anchor.length >= 16);

    return anchors.filter((anchor) => compactText.includes(anchor)).length >= 2;
  });
}

function hasGenericReaction(text: string): boolean {
  return /실제\s*적용\s*사례\s*위주로\s*보겠다고\s*하심|처방\s*시점은\s*환자\s*상태를\s*보고\s*판단하겠다는\s*반응|차트상\s*조건을\s*보고\s*검토하겠다는\s*의견|실제\s*처방은\s*환자\s*추이를\s*보고\s*다시\s*판단하겠다는\s*반응|실제\s*처방\s*여부와\s*적용\s*가능\s*상황|적용\s*가능\s*케이스를\s*보겠다는\s*의견/.test(text);
}

function hasGenericNextStrategy(text: string): boolean {
  const normalized = text.replace(/\s+/g, '');
  return /실제처방여부|실제처방흐름|실제적용사례|실제적용가능상황|실제처방환자군|처방시점은환자상태를보고판단|차트상조건을보고검토/.test(normalized);
}

function changedManualFacts(formattedLog: string, ctx: VisitContext): boolean {
  if (!ctx.manualRawNotes?.trim()) return false;
  const raw = ctx.manualRawNotes.replace(/\s+/g, '');
  const output = formattedLog.replace(/\s+/g, '');
  const rawProducts = ['페린젝트', '위너프에이플러스'].filter((product) => raw.includes(product));
  if (rawProducts.some((product) => !output.includes(product))) return true;

  const importantKeys = (ctx.manualFactKeys ?? []).filter((key) => key !== '전개방식');
  if (importantKeys.length === 0) return false;
  const outputKeys = new Set(extractKeys(formattedLog));
  return importantKeys.some((key) => !outputKeys.has(key));
}

function hasDuplicateReaction(formattedLog: string, ctx: VisitContext): boolean {
  if (ctx.manualRawNotes?.trim()) return false;
  const currentKeys = extractReactionKeys(formattedLog);
  if (currentKeys.length === 0) return false;
  return currentKeys.some((key) => ctx.batchUsedReactionKeys.includes(key));
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
  if (hasVisitLogProductLeak(formattedLog, plan.product)) failTypes.push('FOREIGN_PRODUCT_MENTION');
  if (hasVisitPlanLeak(formattedLog)) failTypes.push('NEXT_VISIT_LEAK');
  if (hasForbiddenPhrase(`${formattedLog} ${nextStrategy}`)) failTypes.push('FORBIDDEN_PHRASE');
  if (hasDepartmentMismatch(`${formattedLog} ${nextStrategy}`, ctx.doctor.department || '')) {
    failTypes.push('DEPARTMENT_MISMATCH');
  }
  if (hasLearnedForbidden(`${formattedLog} ${nextStrategy}`, ctx.learnedForbiddenPatterns ?? [])) {
    failTypes.push('LEARNED_FORBIDDEN');
  }
  if (changedManualFacts(formattedLog, ctx)) {
    failTypes.push('MANUAL_FACT_CHANGED');
  }
  if (hasDuplicateReaction(formattedLog, ctx)) {
    failTypes.push('DUPLICATE_REACTION');
  }
  if (hasGenericReaction(formattedLog)) {
    failTypes.push('GENERIC_REACTION');
  }

  const logKeys = extractKeys(formattedLog);
  const detailKeys = extractKeys(`${plan.detailAxis} ${plan.patientGroup}`);
  if (detailKeys.length > 0 && !detailKeys.some((key) => logKeys.includes(key))) failTypes.push('MISSING_DETAIL');
  if (!hasReaction(formattedLog)) failTypes.push('MISSING_REACTION');

  if (isDuplicateOf(formattedLog, ctx.batchAvoidTexts, 0.4)) failTypes.push('DUPLICATE_BATCH');
  if (isDuplicateOf(formattedLog, ctx.pastLogs.map((log) => `${log.formattedLog} ${log.nextStrategy}`), 0.65)) {
    failTypes.push('DUPLICATE_PAST');
  }
  if (similarityRatio(formattedLog, nextStrategy) >= 0.35) failTypes.push('DUPLICATE_STRATEGY');
  if (hasGenericNextStrategy(nextStrategy)) failTypes.push('GENERIC_NEXT_STRATEGY');

  if (failTypes.length === 0) return { pass: true };

  details.push(`failTypes=${[...new Set(failTypes)].join(', ')}`);
  return { pass: false, failTypes: [...new Set(failTypes)], details: details.join('; ') };
}

export function resolveRepairTarget(failTypes: ValidationFailType[]): RepairTarget {
  const unique = [...new Set(failTypes)];
  if (unique.length === 1 && unique[0] === 'DUPLICATE_REACTION') {
    return { field: 'formattedLog', reasons: unique };
  }
  if (unique.length === 1 && unique[0] === 'DUPLICATE_STRATEGY') {
    return { field: 'nextStrategy', reasons: unique };
  }
  if (unique.length === 1 && unique[0] === 'GENERIC_NEXT_STRATEGY') {
    return { field: 'nextStrategy', reasons: unique };
  }
  if (unique.length === 1 && unique[0] === 'GENERIC_REACTION') {
    return { field: 'formattedLog', reasons: unique };
  }
  if (unique.every((type) => type === 'FOREIGN_PRODUCT_MENTION' || type === 'NEXT_VISIT_LEAK')) {
    return { field: 'formattedLog', reasons: unique };
  }
  if (unique.every((type) => type === 'LENGTH_SHORT' || type === 'LENGTH_LONG')) {
    return { field: 'formattedLog', reasons: unique };
  }
  return { field: 'both', reasons: unique };
}
