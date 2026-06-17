import type { VisitContext } from './context';
import { inferSnippetPatientGroup, isTextAllowedForDepartment } from './departmentFilters';
import { collectKeys, extractKeys, extractReactionKeys, similarityRatio } from './detailKeys';
import { snippetStorage, type ExternalCasePattern, type GoldenSnippet } from '../storage';
import type { DetailKey } from './types';
import { getVisitTemplates } from './templates';

type PlanCandidate = Omit<DetailKey, 'selectionReason'>;
type SnippetPlanCandidate = PlanCandidate & { snippetId?: string };

// REACTION_FALLBACKS 제거 — 고정 반응 패턴은 기계적 출력의 원인. AI가 자유롭게 생성.

function hashSeed(...parts: string[]): number {
  // 외부 케이스 변형 생성 시에만 사용 (결정론적 중복 방지용으로 한정)
  const joined = parts.filter(Boolean).join('|');
  let hash = 0;
  for (let i = 0; i < joined.length; i++) {
    hash = (hash * 31 + joined.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function pickRandom<T>(values: T[]): T {
  if (values.length === 0) throw new Error('pickRandom requires values');
  return values[Math.floor(Math.random() * values.length)];
}

function uniqueByText<T extends PlanCandidate>(candidates: T[]): T[] {
  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    const key = planText(candidate);
    const compact = key.replace(/\s+/g, ' ').trim().toLowerCase();
    if (seen.has(compact)) return false;
    seen.add(compact);
    return true;
  });
}

function inferNarrativeStyle(pattern: ExternalCasePattern, department: string): DetailKey['narrativeStyle'] {
  const text = `${pattern.sourceSummary} ${pattern.patientGroup} ${pattern.detailAxis} ${pattern.reactionPattern} ${pattern.nextAction} ${department}`;
  if (/질문|문의|\?/.test(text)) return '교수 질문 답변형';
  if (/급여|보험|청구/.test(text)) return '급여 기준 재확인형';
  if (/지난|이전|확인|재확인/.test(text)) return '지난 방문 확인형';
  if (/처방|사용|경험|적용/.test(text)) return '처방 경험 확인형';
  return '환자 케이스 연결형';
}

function externalDetailVariants(pattern: ExternalCasePattern): string[] {
  if (pattern.product === '페린젝트') {
    return [
      pattern.detailAxis || '페린젝트의 1회 투여 편의성과 Hb 회복 근거',
      '페린젝트의 급여 기준과 외래 적용 가능성',
      '페린젝트의 외래 재방문 부담 감소와 빠른 Hb 회복',
      '페린젝트의 수혈 부담 감소와 1회 투여 장점',
      '페린젝트의 경구용철분제 반응 부족 환자에서 적용 근거',
      '페린젝트의 시험투여 부담이 적은 점과 1회 투여 편의성',
    ];
  }
  if (pattern.product === '위너프에이플러스') {
    return [
      pattern.detailAxis || '위너프에이플러스의 아미노산 보충과 단백 공급 이점',
      '위너프에이플러스의 포도당 부담 감소와 혈당 흐름',
      '위너프에이플러스의 오메가3 조성과 균형 영양',
      '위너프에이플러스의 질소균형 유지와 회복기 영양',
      '위너프에이플러스의 수술 후 식이 지연 환자에서 영양 공급',
      '위너프에이플러스의 단백 보충과 회복기 식사 진행',
    ];
  }
  return [pattern.detailAxis || `${pattern.product}의 핵심 디테일`];
}

function externalReactionVariants(pattern: ExternalCasePattern): string[] {
  return [
    pattern.reactionPattern || '환자군이 맞으면 차트로 보겠다는 의견',
    '맞는 케이스에서는 참고해보겠다는 의견',
    '급여 기준을 보고 처방 가능성을 보겠다는 의견',
    '실제 적용은 환자 상태를 보고 판단하겠다는 반응',
    '차트상 조건이 맞으면 검토하겠다는 의견',
    '환자 추이를 보고 다시 판단하겠다는 반응',
  ];
}

function externalNextActionVariants(pattern: ExternalCasePattern): string[] {
  return [
    pattern.nextAction || `${pattern.product} 관련 적용 가능 케이스 확인`,
    `${pattern.product} 사용 경험과 실제 반응 확인`,
    `${pattern.product} 급여 기준과 처방 가능성 확인`,
    `${pattern.product} 환자군과 차트상 조건 확인`,
    `${pattern.product} 다음 방문에서 적용 가능 상황 재확인`,
  ];
}

function professorQuestionFrom(candidate: Pick<PlanCandidate, 'product' | 'detailAxis' | 'patientGroup'>): string {
  const text = `${candidate.product} ${candidate.detailAxis} ${candidate.patientGroup}`;
  if (candidate.product === '페린젝트') {
    if (/급여|TSAT|보험/.test(text)) return '급여 기준은 어떤 환자부터 맞는지 질문';
    if (/수술|수혈|Hb|빈혈/.test(text)) return '수술 전후 어느 시점에 투여하는지 질문';
    return '경구용철분제 반응이 부족한 환자에서 전환 기준을 질문';
  }
  if (candidate.product === '위너프에이플러스') {
    if (/포도당|혈당/.test(text)) return '혈당 부담이 실제로 얼마나 줄어드는지 질문';
    if (/아미노산|단백|영양/.test(text)) return '단백 보충이 필요한 환자 기준을 질문';
    return '기존 TPN과 어떤 환자에서 구분하는지 질문';
  }
  if (candidate.product === '플라주OP') {
    return '기존 수액 프로토콜에서 바꿀 기준을 질문';
  }
  return '차트상 어떤 조건을 먼저 봐야 하는지 질문';
}

function buildExternalCandidateVariants(pattern: ExternalCasePattern, ctx: VisitContext): PlanCandidate[] {
  // Math.random() 사용 — 매 호출마다 다른 조합 생성 (hashSeed 제거)
  const detailVariants = externalDetailVariants(pattern);
  const nextActionVariants = externalNextActionVariants(pattern);
  const styles: DetailKey['narrativeStyle'][] = [
    inferNarrativeStyle(pattern, ctx.doctor.department || ''),
    '환자 케이스 연결형',
    '처방 경험 확인형',
    '교수 질문 답변형',
    '급여 기준 재확인형',
    '지난 방문 확인형',
  ];

  const candidateCount = Math.min(3, Math.max(1, detailVariants.length > 1 ? 2 : 1));
  const variants: PlanCandidate[] = [];
  for (let i = 0; i < candidateCount; i++) {
    const detailAxis = pickRandom(detailVariants);
    // doctorReaction은 빈 문자열 — AI가 자유롭게 생성하도록 (고정 반응 제거)
    const nextAction = pickRandom(nextActionVariants);
    const narrativeStyle = pickRandom(styles);
    const professorQuestion = professorQuestionFrom({ product: pattern.product, detailAxis, patientGroup: pattern.patientGroup });
    variants.push({
      templateId: `external-${pattern.id}-${i}`,
      product: pattern.product,
      patientGroup: pattern.patientGroup,
      detailAxis,
      doctorReaction: '',
      nextAction,
      narrativeStyle,
      professorQuestion,
      allowedDepartments: [pattern.department],
    });
  }
  return uniqueByText(variants);
}

function buildTemplateCandidates(ctx: VisitContext): PlanCandidate[] {
  const productScope = ctx.availableProducts.length > 0 ? ctx.availableProducts : ['위너프에이플러스', '페린젝트'];
  return getVisitTemplates(ctx.doctor.department || '', productScope).map((template) => ({
    templateId: template.templateId,
    product: template.product,
    patientGroup: template.patientGroup,
    detailAxis: template.detailAxis,
    doctorReaction: template.doctorReaction,
    nextAction: template.nextAxis,
    narrativeStyle: template.narrativeStyle,
    professorQuestion: professorQuestionFrom(template),
    allowedDepartments: [template.department],
    exampleMemo: template.exampleMemo,   // few-shot 예시 — AI 스타일 가이드
  }));
}

function inferSnippetNarrativeStyle(snippet: GoldenSnippet): DetailKey['narrativeStyle'] {
  const text = `${snippet.content} ${snippet.context} ${(snippet.tags ?? []).join(' ')} ${snippet.analysis ?? ''}`;
  if (/질문|문의|\?/.test(text)) return '교수 질문 답변형';
  if (/급여|보험|청구/.test(text)) return '급여 기준 재확인형';
  if (/지난|이전|재확인/.test(text)) return '지난 방문 확인형';
  if (/처방|사용|적용/.test(text)) return '처방 경험 확인형';
  return '환자 케이스 연결형';
}

function snippetDetailAxis(snippet: GoldenSnippet): string {
  const source = (snippet.analysis || snippet.content).replace(/\s+/g, ' ').trim();
  if (!source) return `${snippet.product} 핵심 디테일`;
  const firstSentence = source.split(/(?<=[.。!?])\s+|\n+/).map((item) => item.trim()).find(Boolean) ?? source;
  return firstSentence.length > 74 ? `${firstSentence.slice(0, 74)}...` : firstSentence;
}

function buildSnippetCandidates(ctx: VisitContext): SnippetPlanCandidate[] {
  const department = ctx.doctor.department || '';
  const snippets = snippetStorage.getGoldenPlanCandidates(department, ctx.availableProducts);
  return uniqueByText(snippets.map((snippet) => {
    const text = `${snippet.content} ${snippet.context} ${(snippet.tags ?? []).join(' ')} ${snippet.analysis ?? ''}`;
    const detailAxis = snippetDetailAxis(snippet);
    const patientGroup = inferSnippetPatientGroup(text, department);
    return {
      templateId: `snippet-${snippet.id}`,
      snippetId: snippet.id,
      product: snippet.product,
      patientGroup,
      detailAxis,
      doctorReaction: '',
      nextAction: `${snippet.product} 다른 환자군과 실제 처방 반응 확인`,
      narrativeStyle: inferSnippetNarrativeStyle(snippet),
      professorQuestion: professorQuestionFrom({ product: snippet.product, detailAxis, patientGroup }),
      allowedDepartments: snippet.context === department ? [department] : undefined,
      exampleMemo: snippet.content,
    };
  }));
}

// WINUF_CANDIDATES: 하드코딩된 고정 반응/문구 제거. doctorReaction은 AI가 생성.
const WINUF_CANDIDATES: PlanCandidate[] = [
  {
    product: '위너프에이플러스',
    patientGroup: '수술 후 식이 진행이 늦어 정맥영양이 필요한 환자',
    detailAxis: '위너프에이플러스의 단백 보충과 수술 후 회복기 영양',
    doctorReaction: '',
    nextAction: '수술 후 회복기 환자에서 영양 공급 반응 확인',
    narrativeStyle: '환자 케이스 연결형',
    allowedDepartments: ['외과', '흉부외과', '신경외과', '정형외과', '간담췌외과'],
  },
  {
    product: '위너프에이플러스',
    patientGroup: '중환자실에서 혈당 변동을 같이 관리하는 환자',
    detailAxis: '위너프에이플러스의 오메가3 조성과 중증 환자 영양',
    doctorReaction: '',
    nextAction: '중환자 영양 공급 방식과 처방 흐름 확인',
    narrativeStyle: '지난 방문 확인형',
    allowedDepartments: ['중환자의학과', '호흡기내과', '응급의학과', '흉부외과', '신경외과'],
  },
  {
    product: '위너프에이플러스',
    patientGroup: '수술 전후로 경구 섭취가 불안정한 환자',
    detailAxis: '위너프에이플러스의 수액 제한 상황에서 고농도 영양 공급',
    doctorReaction: '',
    nextAction: '적용 가능 케이스와 처방 타이밍 확인',
    narrativeStyle: '교수 질문 답변형',
    allowedDepartments: ['외과', '흉부외과', '신경외과', '정형외과', '간담췌외과', '산부인과'],
  },
  {
    product: '위너프에이플러스',
    patientGroup: 'IBD 악화나 식사량 저하로 영양 보충이 필요한 환자',
    detailAxis: '위너프에이플러스의 장기 영양 불량 환자에서의 단백 보충',
    doctorReaction: '',
    nextAction: '식사량 저하 환자에서 영양 반응과 처방 가능성 확인',
    narrativeStyle: '환자 케이스 연결형',
    allowedDepartments: ['소화기내과'],
  },
  {
    product: '위너프에이플러스',
    patientGroup: '부인과 수술 후 식이 진행이 늦어 영양 공급이 필요한 환자',
    detailAxis: '위너프에이플러스의 수술 후 회복기 영양과 혈당 관리',
    doctorReaction: '',
    nextAction: '분만·수술 후 회복기 환자에서 영양 공급 반응 확인',
    narrativeStyle: '지난 방문 확인형',
    allowedDepartments: ['산부인과', '산과', '부인과'],
  },
];

// FERINJECT_CANDIDATES: 하드코딩된 고정 반응 제거. doctorReaction은 AI가 생성.
const FERINJECT_CANDIDATES: PlanCandidate[] = [
  {
    product: '페린젝트',
    patientGroup: '경구용철분제로 Hb 회복이 충분하지 않은 외래 빈혈 환자',
    detailAxis: '페린젝트의 1회 투여 완결과 반복 내원 부담 감소',
    doctorReaction: '',
    nextAction: '빈혈 환자에서 처방 가능성과 Hb 회복 경과 확인',
    narrativeStyle: '처방 경험 확인형',
    blockedDepartments: ['산부인과'],
  },
  {
    product: '페린젝트',
    patientGroup: '항암치료 중 경구용철분제 흡수가 저하된 빈혈 환자',
    detailAxis: '페린젝트의 정맥 철 공급과 빠른 Hb 교정',
    doctorReaction: '',
    nextAction: '항암 중 빈혈 환자에서 처방 후보와 급여 기준 확인',
    narrativeStyle: '환자 케이스 연결형',
    allowedDepartments: ['종양내과', '혈액종양내과', '종양혈액내과', '혈액내과'],
  },
  {
    product: '페린젝트',
    patientGroup: '수술 전후 Hb 교정이 빠르게 필요한 환자',
    detailAxis: '페린젝트의 수술 전 빈혈 교정과 수혈 부담 감소',
    doctorReaction: '',
    nextAction: '수술 전후 빈혈 환자에서 적용 케이스와 Hb 추이 확인',
    narrativeStyle: '환자 케이스 연결형',
    allowedDepartments: ['외과', '흉부외과', '신경외과', '정형외과', '간담췌외과', '산부인과'],
  },
  {
    product: '페린젝트',
    patientGroup: '분만 후 빈혈 증상이 남아 외래 추적 중인 환자',
    detailAxis: '페린젝트의 산후 빈혈 교정과 1회 투여 완결',
    doctorReaction: '',
    nextAction: '분만 후 빈혈 환자에서 외래 처방 루틴 논의',
    narrativeStyle: '지난 방문 확인형',
    allowedDepartments: ['산부인과', '산과', '부인과'],
  },
  {
    product: '페린젝트',
    patientGroup: '수혈 없이 빠른 철 보충이 필요한 빈혈 환자',
    detailAxis: '페린젝트의 급여 기준과 수혈 대안으로서의 역할',
    doctorReaction: '',
    nextAction: '급여 기준 환자 선별과 처방 가능성 확인',
    narrativeStyle: '급여 기준 재확인형',
    blockedDepartments: ['산부인과'],
  },
  {
    product: '페린젝트',
    patientGroup: '위장관 출혈 후 경구 철분 흡수가 어려운 소화기 빈혈 환자',
    detailAxis: '페린젝트의 위장관 출혈 후 빠른 Hb 회복',
    doctorReaction: '',
    nextAction: '소화기 출혈 후 빈혈 환자에서 처방 타이밍 확인',
    narrativeStyle: '환자 케이스 연결형',
    allowedDepartments: ['소화기내과'],
  },
];

function planText(candidate: PlanCandidate): string {
  return `${candidate.product} ${candidate.patientGroup} ${candidate.detailAxis} ${candidate.doctorReaction} ${candidate.nextAction} ${candidate.narrativeStyle}`;
}

function departmentMatches(department: string, patterns: string[] = []): boolean {
  return patterns.some((pattern) => department.includes(pattern));
}

function isCandidateAllowedForDepartment(candidate: PlanCandidate, department: string): boolean {
  if (candidate.allowedDepartments?.length && !departmentMatches(department, candidate.allowedDepartments)) {
    return false;
  }
  if (candidate.blockedDepartments?.length && departmentMatches(department, candidate.blockedDepartments)) {
    return false;
  }
  return isTextAllowedForDepartment(planText(candidate), department);
}

function candidatesFor(ctx: VisitContext): PlanCandidate[] {
  const templateCandidates = buildTemplateCandidates(ctx);
  const externalCandidates: PlanCandidate[] = ctx.externalCasePatterns.flatMap((pattern) => buildExternalCandidateVariants(pattern, ctx));
  const snippetCandidates = buildSnippetCandidates(ctx);
  const all = [...templateCandidates, ...externalCandidates, ...snippetCandidates, ...WINUF_CANDIDATES, ...FERINJECT_CANDIDATES];
  const manualProducts = ctx.manualRawNotes
    ? ctx.availableProducts.filter((product) => ctx.manualRawNotes?.replace(/\s+/g, '').includes(product.replace(/\s+/g, '')))
    : [];
  const productPool = manualProducts.length > 0 ? manualProducts : ctx.availableProducts;
  return all.filter((candidate) =>
    productPool.includes(candidate.product) &&
    isCandidateAllowedForDepartment(candidate, ctx.doctor.department || '')
  );
}

function hasUsedReaction(candidate: PlanCandidate, ctx: VisitContext): boolean {
  const reactionKeys = extractReactionKeys(candidate.doctorReaction);
  return reactionKeys.some((key) => ctx.batchUsedReactionKeys.includes(key));
}

function hasUsedTemplate(candidate: PlanCandidate, ctx: VisitContext): boolean {
  return Boolean(candidate.templateId && ctx.batchUsedTemplateIds.includes(candidate.templateId));
}

function withUnusedReaction<T extends PlanCandidate>(candidate: T, _ctx: VisitContext): T {
  // REACTION_FALLBACKS 제거됨 — 고정 반응 대입 없이 원본 candidate 그대로 반환.
  // AI가 교수 반응을 자유롭게 생성.
  return candidate;
}

function withUnusedTemplate<T extends PlanCandidate>(candidate: T, ctx: VisitContext): T {
  if (!hasUsedTemplate(candidate, ctx)) return candidate;
  const alternative = candidatesFor(ctx).find((item) => item.templateId && !ctx.batchUsedTemplateIds.includes(item.templateId));
  return (alternative ?? candidate) as T;
}

function externalPatternBonus(candidate: PlanCandidate, ctx: VisitContext): number {
  const matched = ctx.externalCasePatterns.find((pattern) =>
    candidate.product === pattern.product &&
    candidate.patientGroup === pattern.patientGroup &&
    candidate.detailAxis === pattern.detailAxis
  );
  if (!matched) return 0;
  return 4 + Math.min(5, Math.max(0, Math.round((matched.confidence || 0) / 20)));
}

function snippetBonus(candidate: PlanCandidate): number {
  // externalPatternBonus is 4..9; a golden snippet gets a mid-scale +5 and does not overpower high-confidence external cases.
  return candidate.templateId?.startsWith('snippet-') ? 5 : 0;
}

function templateFreshnessBonus(candidate: PlanCandidate, ctx: VisitContext): number {
  if (!candidate.templateId) return 0;
  if (ctx.batchUsedTemplateIds.includes(candidate.templateId)) return -120;
  return 6;
}

function batchSimilarityPenalty(candidate: PlanCandidate, texts: string[]): number {
  if (texts.length === 0) return 0;
  const candidateText = planText(candidate);
  return texts.reduce((penalty, text) => {
    const ratio = similarityRatio(candidateText, text);
    if (ratio >= 0.75) return penalty + 120;
    if (ratio >= 0.6) return penalty + 60;
    if (ratio >= 0.45) return penalty + 20;
    return penalty;
  }, 0);
}

function professorHistoryPenalty(candidate: PlanCandidate, ctx: VisitContext): number {
  // buildContext receives visitLogStorage.getByDoctorId(doctor.id), so ctx.pastLogs
  // is scoped to the current professor/doctorId before this planner is called.
  if (ctx.pastLogs.length === 0) return 0;
  const candidateText = planText(candidate);
  const candidateKeys = extractKeys(candidateText);
  const patientGroupSample = candidate.patientGroup.replace(/\s+/g, '').slice(0, 12);
  return ctx.pastLogs.slice(0, 8).reduce((penalty, log) => {
    const historyText = `${log.formattedLog} ${log.nextStrategy ?? ''}`;
    const historyKeys = extractKeys(historyText);
    const sharedKeys = candidateKeys.filter((key) => historyKeys.includes(key)).length;
    const sameProduct = Boolean(log.products?.includes(candidate.product) || historyText.includes(candidate.product));
    const samePatientGroup = patientGroupSample.length >= 8 && historyText.replace(/\s+/g, '').includes(patientGroupSample);
    const ratio = similarityRatio(candidateText, historyText);
    if (sameProduct && sharedKeys >= 2) return penalty + 35;
    if (samePatientGroup) return penalty + 25;
    if (ratio >= 0.6) return penalty + 45;
    if (ratio >= 0.4) return penalty + 15;
    return penalty;
  }, 0);
}

function hasSameNextActionAxis(candidate: PlanCandidate): boolean {
  const detailKeys = extractKeys(`${candidate.detailAxis} ${candidate.patientGroup}`);
  const nextKeys = extractKeys(candidate.nextAction);
  return detailKeys.length > 0 && nextKeys.some((key) => detailKeys.includes(key));
}

function ensureDistinctNextActionAxis(selected: PlanCandidate, ranked: PlanCandidate[], ctx: VisitContext): PlanCandidate {
  if (!hasSameNextActionAxis(selected)) return selected;
  // Prefer a different product first, then another patient/context axis, then a minimal same-product fallback.
  const alternatives = ranked.filter((candidate) => candidate !== selected && !hasSameNextActionAxis(candidate));
  const productAlternative = alternatives.find((candidate) => candidate.product !== selected.product);
  const axisAlternative = productAlternative ?? alternatives[0];
  if (axisAlternative) {
    return {
      ...selected,
      nextAction: axisAlternative.product !== selected.product
        ? `${axisAlternative.product} ${axisAlternative.patientGroup} 처방 반응 확인할예정`
        : normalizeNextActionEnding(axisAlternative.nextAction),
    };
  }
  const otherProduct = ctx.availableProducts.find((product) => product !== selected.product);
  if (otherProduct) {
    return { ...selected, nextAction: `${otherProduct} 다른 환자군과 처방 반응 확인할예정` };
  }
  return { ...selected, nextAction: `${selected.product} 다른 환자군에서 처방 반응 확인할예정` };
}

function normalizeNextActionEnding(nextAction: string): string {
  const trimmed = nextAction.trim();
  if (!trimmed) return '다른 환자군에서 처방 반응 확인할예정';
  if (/할예정$/.test(trimmed)) return trimmed;
  if (/할 예정$/.test(trimmed)) return trimmed.replace(/할 예정$/, '할예정');
  if (/예정$/.test(trimmed)) return trimmed;
  if (/확인$|논의$|검토$|재확인$/.test(trimmed)) return `${trimmed}할예정`;
  return `${trimmed} 확인할예정`;
}

function extractBatchProducts(texts: string[]): string[] {
  const products = new Set<string>();
  for (const text of texts) {
    if (/위너프에이플러스|위너프A\+|winuf\s*a\+|winufaplus|winufa/i.test(text)) products.add('위너프에이플러스');
    if (/페린젝트|ferinject/i.test(text)) products.add('페린젝트');
  }
  return [...products];
}

function getMostRecentProduct(ctx: VisitContext): string | undefined {
  const recent = ctx.pastLogs[0];
  return recent?.products?.find((product) => product === '위너프에이플러스' || product === '페린젝트');
}

export function buildPlan(ctx: VisitContext): DetailKey {
  const recentKeys = collectKeys([
    ...ctx.pastLogs.slice(0, 3).flatMap((log) => [log.formattedLog, log.nextStrategy]),
    ...(ctx.manualRawNotes ? [ctx.manualRawNotes] : []),
  ]);
  const latestStrategy = ctx.recentStrategies[0]?.trim() ?? '';
  const carryoverKeys = latestStrategy ? extractKeys(latestStrategy) : [];
  const carryoverProduct = latestStrategy
    ? ['위너프에이플러스', '페린젝트'].find((product) => latestStrategy.includes(product))
    : undefined;
  const batchKeys = new Set(ctx.batchUsedDetailKeys);
  const recentKeySet = new Set(recentKeys);
  const batchProducts = extractBatchProducts(ctx.batchAvoidTexts);
  const mostRecentProduct = getMostRecentProduct(ctx);
  const canRotateProduct = ctx.availableProducts.filter((product) => product !== mostRecentProduct).length > 0;

  const baseCandidates = candidatesFor(ctx);
  const reactionSafeCandidates = baseCandidates.filter((candidate) => !hasUsedReaction(candidate, ctx));
  const selectableCandidates = reactionSafeCandidates.length > 0
    ? reactionSafeCandidates
    : baseCandidates.map((candidate) => withUnusedReaction(candidate, ctx));
  if (ctx.isObDoctor && !ctx.hasDailyObFerinject && ctx.availableProducts.includes('페린젝트')) {
    const forcedCandidates = baseCandidates.filter((candidate) => candidate.product === '페린젝트');
    const reactionSafeForced = forcedCandidates.filter((candidate) => !hasUsedReaction(candidate, ctx));
    const forced =
      reactionSafeForced[0] ??
      (forcedCandidates[0] ? withUnusedReaction(forcedCandidates[0], ctx) : undefined) ??
      FERINJECT_CANDIDATES[0];
    return {
      ...forced,
      selectionReason: `오늘(${ctx.todayDate}) 산부인과 페린젝트 기록이 아직 없어 1일 1건 보장 규칙으로 선택`,
    };
  }

  const ranked = selectableCandidates
    .map((candidate) => withUnusedTemplate(candidate, ctx))
    .sort((a, b) => {
    const aKeys = extractKeys(planText(a));
    const bKeys = extractKeys(planText(b));
    const aReactionKeys = extractReactionKeys(a.doctorReaction);
    const bReactionKeys = extractReactionKeys(b.doctorReaction);
    const aText = planText(a);
    const bText = planText(b);
    const aPenalty =
      aKeys.filter((key) => batchKeys.has(key)).length * 10 +
      aReactionKeys.filter((key) => ctx.batchUsedReactionKeys.includes(key)).length * 25 +
      aKeys.filter((key) => recentKeySet.has(key)).length * 3 +
      (ctx.usedProductsRecently.includes(a.product) ? 1 : 0) +
      (ctx.batchUsedProducts.includes(a.product) ? 10 : 0) +
      (batchProducts.includes(a.product) ? 12 : 0) +
      (hasUsedTemplate(a, ctx) ? 50 : 0) +
      professorHistoryPenalty(a, ctx) +
      ctx.learnedForbiddenPatterns.filter((pattern) => pattern && aText.includes(pattern.slice(0, 12))).length * 4 +
      batchSimilarityPenalty(a, ctx.batchAvoidTexts);
    const bPenalty =
      bKeys.filter((key) => batchKeys.has(key)).length * 10 +
      bReactionKeys.filter((key) => ctx.batchUsedReactionKeys.includes(key)).length * 25 +
      bKeys.filter((key) => recentKeySet.has(key)).length * 3 +
      (ctx.usedProductsRecently.includes(b.product) ? 1 : 0) +
      (ctx.batchUsedProducts.includes(b.product) ? 10 : 0) +
      (batchProducts.includes(b.product) ? 12 : 0) +
      (hasUsedTemplate(b, ctx) ? 50 : 0) +
      professorHistoryPenalty(b, ctx) +
      ctx.learnedForbiddenPatterns.filter((pattern) => pattern && bText.includes(pattern.slice(0, 12))).length * 4 +
      batchSimilarityPenalty(b, ctx.batchAvoidTexts);
    const aBonus = ctx.learnedPreferredPatterns.filter((pattern) => pattern && aText.includes(pattern.slice(0, 12))).length;
    const bBonus = ctx.learnedPreferredPatterns.filter((pattern) => pattern && bText.includes(pattern.slice(0, 12))).length;
    const aCarryoverBonus =
      carryoverKeys.filter((key) => aKeys.includes(key)).length * 5 +
      (carryoverProduct && a.product === carryoverProduct ? 3 : 0) +
      (canRotateProduct && mostRecentProduct && a.product !== mostRecentProduct ? 8 : 0) +
      (canRotateProduct && mostRecentProduct && a.product === mostRecentProduct ? -10 : 0) +
      externalPatternBonus(a, ctx) +
      snippetBonus(a) +
      templateFreshnessBonus(a, ctx);
    const bCarryoverBonus =
      carryoverKeys.filter((key) => bKeys.includes(key)).length * 5 +
      (carryoverProduct && b.product === carryoverProduct ? 3 : 0) +
      (canRotateProduct && mostRecentProduct && b.product !== mostRecentProduct ? 8 : 0) +
      (canRotateProduct && mostRecentProduct && b.product === mostRecentProduct ? -10 : 0) +
      externalPatternBonus(b, ctx) +
      snippetBonus(b) +
      templateFreshnessBonus(b, ctx);
    return (aPenalty - aBonus - aCarryoverBonus) - (bPenalty - bBonus - bCarryoverBonus);
  });

  // 상위 3개 중 랜덤 선택 — 같은 입력이라도 매번 다른 결과 (A→A→A 방지 핵심)
  const topN = ranked.slice(0, Math.min(3, ranked.length));
  const selectedRaw = (topN.length > 0 ? pickRandom(topN) : undefined) ??
    candidatesFor({ ...ctx, availableProducts: ['위너프에이플러스', '페린젝트'] })[0] ??
    FERINJECT_CANDIDATES[0];
  const selected = ensureDistinctNextActionAxis(selectedRaw, ranked, ctx);
  const carryoverNote = latestStrategy
    ? `; 최근 다음방문전략(${latestStrategy.slice(0, 60)})과 이어질 수 있는 후보를 우선 반영`
    : '';
  return {
    ...withUnusedReaction(selected, ctx),
    selectionReason: `과 ${ctx.doctor.department}, 최근 ${recentKeys.join(', ') || '없음'}, 배치 ${ctx.batchUsedDetailKeys.join(', ') || '없음'} 기준으로 중복을 줄여 조합 선택${carryoverNote}`,
  };
}

export function preCheckUniqueness(plan: DetailKey, ctx: VisitContext): DetailKey {
  const planKeys = extractKeys(planText(plan));
  const planReactionKeys = extractReactionKeys(plan.doctorReaction);
  const used = new Set([...ctx.batchUsedDetailKeys, ...collectKeys(ctx.recentStrategies)]);
  const usedReaction = new Set(ctx.batchUsedReactionKeys);
  const templateUsed = plan.templateId ? ctx.batchUsedTemplateIds.includes(plan.templateId) : false;
  if (!planKeys.some((key) => used.has(key)) && !planReactionKeys.some((key) => usedReaction.has(key)) && !templateUsed) return plan;

  const alternative = candidatesFor(ctx).find((candidate) => {
    const keys = extractKeys(planText(candidate));
    const reactionKeys = extractReactionKeys(candidate.doctorReaction);
    return keys.every((key) => !used.has(key)) && reactionKeys.every((key) => !usedReaction.has(key)) && (!candidate.templateId || !ctx.batchUsedTemplateIds.includes(candidate.templateId));
  });

  if (!alternative) return withUnusedReaction(plan, ctx);
  return {
    ...withUnusedReaction(alternative, ctx),
    selectionReason: `${plan.selectionReason}; precheck에서 중복 키 감지 후 대체 조합 선택`,
  };
}
