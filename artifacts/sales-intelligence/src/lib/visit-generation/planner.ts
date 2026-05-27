import type { VisitContext } from './context';
import type { ClinicalDomain } from './clinical-domain';
import { candidateFitsDepartment } from './clinical-domain';
import { collectKeys, extractKeys } from './detailKeys';
import type { DetailKey } from './types';

type PlanCandidate = Omit<DetailKey, 'selectionReason'> & {
  departmentTags: string[];
  clinicalDomains: ClinicalDomain[];
  blockedDepartmentTags?: string[];
};

const WINUF_CANDIDATES: PlanCandidate[] = [
  {
    product: '위너프에이플러스',
    patientGroup: '수술 후 식이 진행이 늦어 정맥영양을 같이 보는 환자',
    detailAxis: '위너프에이플러스의 아미노산 25% 증가와 저포도당 조성',
    doctorReaction: '혈당을 보면서 단백 보충을 같이 가져갈 수 있다는 점에는 동의',
    nextAction: '페린젝트 급여 기준에 맞는 외래 빈혈 케이스 사용 경험 확인',
    narrativeStyle: '환자 케이스 연결형',
    departmentTags: ['외과', '일반외과', '복부외과', '간담췌외과', '흉부외과'],
    clinicalDomains: ['generalSurgery', 'recoveryNutrition'],
  },
  {
    product: '위너프에이플러스',
    patientGroup: '중환자실에서 혈당 변동과 영양 공급을 같이 보는 상황',
    detailAxis: '위너프에이플러스의 오메가3 조성 유지와 단백 보충',
    doctorReaction: '영양 균형을 보되 병동에서 쓰는 기준은 조금 더 보겠다는 의견',
    nextAction: '페린젝트 수혈 회피를 고려하는 퇴원 전 빈혈 케이스 디테일',
    narrativeStyle: '지난 방문 확인형',
    professorQuestion: '중환자에서 혈당 부담은 어느 정도 차이가 나는지 질문 있어',
    departmentTags: ['중환자의학과', '응급의학과', '외상외과', '흉부외과'],
    clinicalDomains: ['criticalCare', 'recoveryNutrition'],
    blockedDepartmentTags: ['산부인과', '산과', '부인과', '호흡기내과', '호흡기'],
  },
  {
    product: '위너프에이플러스',
    patientGroup: '수술 전후로 경구 섭취가 불안정한 환자',
    detailAxis: '위너프에이플러스의 저포도당 조성과 단백 공급량 차이',
    doctorReaction: '기존 TPN 대비 차이는 이해하셨지만 처방 전환은 케이스별로 보겠다는 반응',
    nextAction: '페린젝트 Hb 회복 경과와 수혈 회피 가능 케이스 확인',
    narrativeStyle: '교수 질문 답변형',
    professorQuestion: '기존 위너프와 어떤 차이로 봐야 하는지 질문 있어',
    departmentTags: ['외과', '일반외과', '복부외과', '간담췌외과', '정형외과'],
    clinicalDomains: ['generalSurgery', 'recoveryNutrition'],
  },
  {
    product: '위너프에이플러스',
    patientGroup: '외과 병동에서 수술 후 금식이 길어지는 환자',
    detailAxis: '위너프에이플러스의 단백 공급량과 질소균형 보강',
    doctorReaction: '회복기 영양 공백을 줄이는 접근은 이해하셨지만 병동 프로토콜은 확인해보겠다는 의견',
    nextAction: '수술 후 식이 재개가 지연되는 케이스에서 영양 처방 흐름 확인',
    narrativeStyle: '환자 케이스 연결형',
    departmentTags: ['외과', '일반외과', '복부외과', '간담췌외과'],
    clinicalDomains: ['generalSurgery', 'recoveryNutrition'],
  },
  {
    product: '위너프에이플러스',
    patientGroup: '신경외과 수술 후 의식 회복 지연으로 경구 섭취가 어려운 환자',
    detailAxis: '위너프에이플러스의 고아미노산 조성과 혈당 부담 관리',
    doctorReaction: '장기 입원 환자에서 영양 유지 필요성은 공감하셨고 혈당 관리는 같이 보겠다는 반응',
    nextAction: '신경외과 병동의 경구 섭취 지연 환자 TPN 사용 기준 확인',
    narrativeStyle: '교수 질문 답변형',
    professorQuestion: '혈당 부담이 기존 TPN 대비 어느 정도 차이 나는지 질문 있어',
    departmentTags: ['신경외과'],
    clinicalDomains: ['neurosurgery', 'recoveryNutrition'],
  },
  {
    product: '위너프에이플러스',
    patientGroup: '산부인과 수술 후 오심으로 식이 진행이 불안정한 환자',
    detailAxis: '위너프에이플러스의 저포도당 조성과 단백 보충 균형',
    doctorReaction: '산부인과에서는 사용 케이스가 많지 않지만 회복 지연 환자에서는 검토 가능하다는 의견',
    nextAction: '산부인과 수술 후 식이 지연 케이스에서 영양 처방 가능 상황 확인',
    narrativeStyle: '처방 경험 확인형',
    departmentTags: ['산부인과', '산과', '부인과'],
    clinicalDomains: ['obgyn', 'recoveryNutrition'],
  },
  {
    product: '위너프에이플러스',
    patientGroup: '중환자실 전실 후 영양 공급을 이어가야 하는 환자',
    detailAxis: '위너프에이플러스의 오메가3 조성과 단백 보충 지속성',
    doctorReaction: '중환자실 이후 병동 연결 처방은 의미 있지만 실제 적용 기준은 더 보겠다는 반응',
    nextAction: '전실 후 영양 공급이 끊기는 환자에서 TPN 유지 기준 확인',
    narrativeStyle: '지난 방문 확인형',
    departmentTags: ['중환자의학과', '응급의학과', '외상외과', '흉부외과'],
    clinicalDomains: ['criticalCare', 'recoveryNutrition'],
    blockedDepartmentTags: ['산부인과', '산과', '부인과', '호흡기내과', '호흡기'],
  },
  {
    product: '위너프에이플러스',
    patientGroup: '폐렴 회복기 경구 섭취가 줄어 병동 영양 보강이 필요한 환자',
    detailAxis: '위너프에이플러스의 단백 보충과 저포도당 조성',
    doctorReaction: '감염 회복기 영양 공백을 보완하는 방향은 이해하셨고 혈당은 같이 보겠다는 반응',
    nextAction: '폐렴 회복기 식이 저하 환자에서 TPN 사용 기준 확인',
    narrativeStyle: '환자 케이스 연결형',
    departmentTags: ['호흡기내과', '호흡기', '결핵'],
    clinicalDomains: ['respiratory', 'recoveryNutrition'],
  },
  {
    product: '위너프에이플러스',
    patientGroup: '결핵 치료 중 식욕 저하로 입원 회복기 영양 공급이 필요한 환자',
    detailAxis: '위너프에이플러스의 질소균형 보강과 단백 공급량',
    doctorReaction: '장기 치료 환자에서 영양 유지 필요성은 공감하셨고 처방 기준은 확인해보겠다는 의견',
    nextAction: '결핵 치료 회복기 경구 섭취 저하 환자 영양 처방 흐름 확인',
    narrativeStyle: '처방 경험 확인형',
    departmentTags: ['호흡기내과', '호흡기', '결핵'],
    clinicalDomains: ['respiratory', 'recoveryNutrition'],
  },
];

const FERINJECT_CANDIDATES: PlanCandidate[] = [
  {
    product: '페린젝트',
    patientGroup: '경구용철분제로 Hb 회복이 충분하지 않은 외래 빈혈 환자',
    detailAxis: '페린젝트의 1회 투여 편의성과 Hb 회복 근거',
    doctorReaction: '반복 내원이 어려운 환자에서는 설명해볼 수 있겠다는 반응',
    nextAction: '위너프에이플러스 수술 후 식이 지연 환자 영양 보충 반응 확인',
    narrativeStyle: '처방 경험 확인형',
    departmentTags: ['외과', '일반외과', '정형외과', '호흡기내과', '호흡기'],
    clinicalDomains: ['outpatientAnemia'],
  },
  {
    product: '페린젝트',
    patientGroup: '수혈은 피하고 싶지만 빠른 철 보충이 필요한 빈혈 케이스',
    detailAxis: '페린젝트의 급여 기준과 수혈 회피 가능성',
    doctorReaction: '급여 기준에 맞으면 고려하겠지만 Hb 수치와 증상은 같이 보겠다는 의견',
    nextAction: '위너프에이플러스 저포도당 조성을 수술 후 영양 흐름과 연결해 디테일',
    narrativeStyle: '급여 기준 재확인형',
    professorQuestion: '급여 적용 시 Hb 기준을 어디까지 봐야 하는지 질문 있어',
    departmentTags: ['외과', '일반외과', '정형외과', '신경외과'],
    clinicalDomains: ['generalSurgery', 'outpatientAnemia'],
  },
  {
    product: '페린젝트',
    patientGroup: '분만 후 피로감과 빈혈 증상이 남아 외래 추적 중인 환자',
    detailAxis: '페린젝트의 1회 투여 편의성과 시험투여 부담이 적은 점',
    doctorReaction: '분만 후 외래 재방문이 어려운 환자에서는 편의성은 인정하셨음',
    nextAction: '위너프에이플러스 수술 전후 영양 공급 시 혈당 부담 차이 확인',
    narrativeStyle: '지난 방문 확인형',
    departmentTags: ['산부인과', '산과', '부인과'],
    clinicalDomains: ['obgyn', 'outpatientAnemia'],
  },
  {
    product: '페린젝트',
    patientGroup: '산부인과 수술 전 빈혈 교정이 필요한 환자',
    detailAxis: '페린젝트의 급여 기준과 1회 투여 편의성',
    doctorReaction: '수술 일정이 가까운 환자에서는 경구용철분제보다 빠른 보충이 필요할 수 있다는 의견',
    nextAction: '수술 전 Hb 기준과 외래 투여 가능한 빈혈 케이스 확인',
    narrativeStyle: '급여 기준 재확인형',
    departmentTags: ['산부인과', '산과', '부인과'],
    clinicalDomains: ['obgyn', 'outpatientAnemia'],
  },
  {
    product: '페린젝트',
    patientGroup: '신경외과 수술 전후 수혈을 피하고 싶은 빈혈 환자',
    detailAxis: '페린젝트의 수혈 회피 가능성과 Hb 회복 근거',
    doctorReaction: '수혈을 줄일 수 있는 케이스는 관심 보였지만 수술 일정과 Hb 수치를 같이 보겠다는 반응',
    nextAction: '신경외과 수술 전 빈혈 환자에서 철 보충 의사결정 기준 확인',
    narrativeStyle: '환자 케이스 연결형',
    departmentTags: ['신경외과'],
    clinicalDomains: ['neurosurgery', 'outpatientAnemia'],
  },
  {
    product: '페린젝트',
    patientGroup: '외과 외래에서 경구용철분제 복용 지속이 어려운 빈혈 환자',
    detailAxis: '페린젝트의 1회 투여와 외래 추적 편의성',
    doctorReaction: '외래 재방문이 어려운 환자에서는 편의성이 장점이 될 수 있다는 의견',
    nextAction: '외과 외래 빈혈 환자 중 경구용철분제 중단 케이스 확인',
    narrativeStyle: '처방 경험 확인형',
    departmentTags: ['외과', '일반외과', '복부외과', '간담췌외과'],
    clinicalDomains: ['generalSurgery', 'outpatientAnemia'],
  },
  {
    product: '페린젝트',
    patientGroup: '만성 호흡기 질환으로 외래 추적 중 Hb 회복을 같이 보는 빈혈 환자',
    detailAxis: '페린젝트의 1회 투여 편의성과 Hb 회복 근거',
    doctorReaction: '호흡기 증상으로 잦은 내원이 어려운 환자에서는 투여 편의성을 설명해볼 수 있다는 반응',
    nextAction: '호흡기내과 외래 빈혈 환자에서 Hb 회복 경과와 투여 기준 확인',
    narrativeStyle: '처방 경험 확인형',
    departmentTags: ['호흡기내과', '호흡기', '결핵'],
    clinicalDomains: ['respiratory', 'outpatientAnemia'],
  },
  {
    product: '페린젝트',
    patientGroup: '폐렴 회복 후 피로감이 남아 철결핍 빈혈을 확인한 외래 환자',
    detailAxis: '페린젝트의 급여 기준과 빠른 철 보충 근거',
    doctorReaction: '감염 회복 이후 Hb 수치가 낮은 환자는 원내 기준에 맞춰 검토 가능하다는 의견',
    nextAction: '폐렴 회복기 외래 빈혈 케이스에서 페린젝트 급여 기준 디테일',
    narrativeStyle: '급여 기준 재확인형',
    departmentTags: ['호흡기내과', '호흡기'],
    clinicalDomains: ['respiratory', 'outpatientAnemia'],
  },
];

export function planText(candidate: PlanCandidate | DetailKey): string {
  return `${candidate.product} ${candidate.patientGroup} ${candidate.detailAxis} ${candidate.doctorReaction} ${candidate.nextAction} ${candidate.narrativeStyle}`;
}

function candidatesFor(ctx: VisitContext): PlanCandidate[] {
  const all = [...WINUF_CANDIDATES, ...FERINJECT_CANDIDATES];
  const productMatched = all.filter((candidate) => ctx.availableProducts.includes(candidate.product));
  const domainMatched = productMatched.filter((candidate) => candidateFitsDepartment(candidate.clinicalDomains, ctx.doctor.department));
  const departmentMatched = domainMatched.filter((candidate) => departmentMatches(candidate.departmentTags, ctx.doctor.department));
  if (departmentMatched.length > 0) return departmentMatched;
  if (domainMatched.length > 0) return domainMatched;
  return productMatched.filter((candidate) => !departmentMatches(candidate.blockedDepartmentTags ?? [], ctx.doctor.department));
}

function normalizeDepartmentName(department: string): string {
  return department.replace(/\s+/g, '').toLowerCase();
}

function departmentMatches(tags: string[], department: string): boolean {
  const normalizedDepartment = normalizeDepartmentName(department);
  return tags.some((tag) => {
    const normalizedTag = normalizeDepartmentName(tag);
    if (normalizedTag === '외과') {
      return ['외과', '일반외과', '복부외과', '대장항문외과', '간담췌외과'].includes(normalizedDepartment);
    }
    return normalizedDepartment.includes(normalizedTag) || normalizedTag.includes(normalizedDepartment);
  });
}

function scoreCandidate(candidate: PlanCandidate, ctx: VisitContext, recentKeys: string[]): number {
  const keys = extractKeys(planText(candidate));
  const batchKeys = new Set(ctx.batchUsedDetailKeys);
  const recentKeySet = new Set(recentKeys);
  return (
    keys.filter((key) => batchKeys.has(key)).length * 10 +
    keys.filter((key) => recentKeySet.has(key)).length * 3 +
    (ctx.usedProductsRecently.includes(candidate.product) ? 1 : 0)
  );
}

function rankedCandidates(ctx: VisitContext, recentKeys: string[]): PlanCandidate[] {
  return candidatesFor(ctx)
    .map((candidate, index) => ({ candidate, index }))
    .sort((a, b) =>
      scoreCandidate(a.candidate, ctx, recentKeys) - scoreCandidate(b.candidate, ctx, recentKeys) ||
      a.index - b.index
    )
    .map(({ candidate }) => candidate);
}

export function findAlternativePlan(ctx: VisitContext, current?: DetailKey): DetailKey | null {
  const recentKeys = collectKeys([
    ...ctx.pastLogs.slice(0, 3).flatMap((log) => [log.formattedLog, log.nextStrategy]),
    ...ctx.recentStrategies,
    ...(ctx.manualRawNotes ? [ctx.manualRawNotes] : []),
  ]);
  const used = new Set([...ctx.batchUsedDetailKeys, ...collectKeys(ctx.recentStrategies)]);
  const currentText = current ? planText(current) : '';

  const alternative = rankedCandidates(ctx, recentKeys).find((candidate) => {
    if (currentText && planText(candidate) === currentText) return false;
    const keys = extractKeys(planText(candidate));
    return keys.every((key) => !used.has(key));
  }) ?? rankedCandidates(ctx, recentKeys).find((candidate) => !currentText || planText(candidate) !== currentText);

  if (!alternative) return null;
  return {
    ...alternative,
    selectionReason: `과=${ctx.doctor.department}, 배치/최근 중복 회피를 위해 대체 조합 선택`,
  };
}

export function buildPlan(ctx: VisitContext): DetailKey {
  const recentKeys = collectKeys([
    ...ctx.pastLogs.slice(0, 3).flatMap((log) => [log.formattedLog, log.nextStrategy]),
    ...(ctx.manualRawNotes ? [ctx.manualRawNotes] : []),
  ]);
  const baseCandidates = rankedCandidates(ctx, recentKeys);
  if (ctx.isObDoctor && !ctx.hasDailyObFerinject && ctx.availableProducts.includes('페린젝트')) {
    const forced = baseCandidates.find((candidate) => candidate.product === '페린젝트') ?? FERINJECT_CANDIDATES[0];
    return {
      ...forced,
      selectionReason: `오늘(${ctx.todayDate}) 산부인과 페린젝트 기록이 아직 없어 1일 1건 보장 규칙으로 선택`,
    };
  }

  const selected = baseCandidates[0] ?? FERINJECT_CANDIDATES[0];
  return {
    ...selected,
    selectionReason: `과=${ctx.doctor.department}, 최근키=${recentKeys.join(', ') || '없음'}, 배치키=${ctx.batchUsedDetailKeys.join(', ') || '없음'} 기준으로 중복이 가장 적은 조합 선택`,
  };
}

export function preCheckUniqueness(plan: DetailKey, ctx: VisitContext): DetailKey {
  const planKeys = extractKeys(planText(plan));
  const used = new Set([...ctx.batchUsedDetailKeys, ...collectKeys(ctx.recentStrategies)]);
  if (!planKeys.some((key) => used.has(key))) return plan;

  const alternative = findAlternativePlan(ctx, plan);

  if (!alternative) return plan;
  return {
    ...alternative,
    selectionReason: `${plan.selectionReason}; precheck에서 중복 키 감지 후 대체 조합 선택`,
  };
}
