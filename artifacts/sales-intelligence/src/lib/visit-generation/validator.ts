import type { VisitContext } from './context';
import { extractKeys, extractReactionKeys, isDuplicateOf, similarityRatio } from './detailKeys';
import type { DetailKey, RepairTarget, ValidationFailType, ValidationResult } from './types';

const MIN_VISIT_LOG_LENGTH = 75;
const MAX_VISIT_LOG_LENGTH = 230;

// 참고 메모 재작성 방식에서 자연스럽게 나오는 업무노트 표현까지 포함
function hasReaction(text: string): boolean {
  return /공감|관심|의견|반응|고려|확인|긍정|제한적|선별|보임|인정|하심|말씀|답변|질문|물으심|여쭤|하겠다|보겠다|드렸|드렸더니|드렸음|알겠다|설명|안내|전달|소개함|언급|꺼내심|가능하다|없다|없음|됨|하셨|처방함|처방하심|결정하심/.test(text);
}

function hasForbiddenPhrase(text: string): boolean {
  return /실제\s*적용\s*환자군|적용\s*환자군\s*확인|환자군\s*중심으로|추가\s*디테일\s*진행할예정/.test(text);
}

function hasDepartmentMismatch(text: string, department: string): boolean {
  if (/소화기/.test(department) && /분만|산후|산부인과|부인과|제왕절개/.test(text)) {
    return true;
  }
  if (/산부인과|산과|부인과/.test(department) && /IBD|크론|궤양성대장염|위장관\s*출혈/.test(text)) {
    return true;
  }
  return false;
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

  const logKeys = extractKeys(formattedLog);
  const detailKeys = extractKeys(`${plan.detailAxis} ${plan.patientGroup}`);
  if (detailKeys.length > 0 && !detailKeys.some((key) => logKeys.includes(key))) failTypes.push('MISSING_DETAIL');
  if (!hasReaction(formattedLog)) failTypes.push('MISSING_REACTION');

  if (isDuplicateOf(formattedLog, ctx.batchAvoidTexts, 0.4)) failTypes.push('DUPLICATE_BATCH');
  if (isDuplicateOf(formattedLog, ctx.pastLogs.map((log) => `${log.formattedLog} ${log.nextStrategy}`), 0.65)) {
    failTypes.push('DUPLICATE_PAST');
  }
  if (similarityRatio(formattedLog, nextStrategy) >= 0.35) failTypes.push('DUPLICATE_STRATEGY');

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
  if (unique.every((type) => type === 'LENGTH_SHORT' || type === 'LENGTH_LONG')) {
    return { field: 'formattedLog', reasons: unique };
  }
  return { field: 'both', reasons: unique };
}
