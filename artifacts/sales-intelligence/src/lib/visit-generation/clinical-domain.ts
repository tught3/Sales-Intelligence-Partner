export type ClinicalDomain =
  | 'generalSurgery'
  | 'obgyn'
  | 'respiratory'
  | 'criticalCare'
  | 'neurosurgery'
  | 'orthopedics'
  | 'outpatientAnemia'
  | 'recoveryNutrition';

type DepartmentDomainRule = {
  departmentPatterns: RegExp[];
  allowedDomains: ClinicalDomain[];
};

const DEPARTMENT_DOMAIN_RULES: DepartmentDomainRule[] = [
  {
    departmentPatterns: [/산부인과/, /산과/, /부인과/],
    allowedDomains: ['obgyn', 'outpatientAnemia', 'recoveryNutrition'],
  },
  {
    departmentPatterns: [/호흡기내과/, /호흡기/, /결핵/],
    allowedDomains: ['respiratory', 'outpatientAnemia', 'recoveryNutrition'],
  },
  {
    departmentPatterns: [/신경외과/],
    allowedDomains: ['neurosurgery', 'criticalCare', 'outpatientAnemia', 'recoveryNutrition'],
  },
  {
    departmentPatterns: [/정형외과/],
    allowedDomains: ['orthopedics', 'generalSurgery', 'outpatientAnemia', 'recoveryNutrition'],
  },
  {
    departmentPatterns: [/중환자의학과/, /중환자/, /ICU/, /응급의학과/, /응급/, /외상/],
    allowedDomains: ['criticalCare', 'generalSurgery', 'respiratory', 'recoveryNutrition'],
  },
  {
    departmentPatterns: [/흉부외과/, /심혈관외과/, /심장외과/],
    allowedDomains: ['generalSurgery', 'criticalCare', 'respiratory', 'outpatientAnemia', 'recoveryNutrition'],
  },
  {
    departmentPatterns: [/외과/, /일반외과/, /복부외과/, /대장항문외과/, /간담췌외과/],
    allowedDomains: ['generalSurgery', 'outpatientAnemia', 'recoveryNutrition'],
  },
];

const DEFAULT_ALLOWED_DOMAINS: ClinicalDomain[] = ['outpatientAnemia', 'recoveryNutrition'];

const DOMAIN_TERM_PATTERNS: Record<ClinicalDomain, RegExp[]> = {
  generalSurgery: [/수술/, /수술\s*전후/, /수술\s*후/, /금식/, /병동/, /출혈/, /수혈/],
  obgyn: [/분만/, /산후/, /임신/, /출산/, /산부인과/, /산과/, /부인과/],
  respiratory: [/호흡기/, /폐렴/, /결핵/, /호흡기\s*감염/, /만성\s*호흡기/, /감염\s*회복/],
  criticalCare: [/중환자/, /중증\s*환자/, /ICU/, /중환자실/, /전실/, /혈역학/],
  neurosurgery: [/신경외과/, /뇌수술/, /척추수술/, /의식\s*회복/],
  orthopedics: [/정형외과/, /재활/, /골절/, /관절/, /척추/],
  outpatientAnemia: [/외래/, /빈혈/, /Hb/, /철결핍/, /경구용철분제/, /철\s*보충/],
  recoveryNutrition: [/영양/, /정맥영양/, /TPN/, /경구\s*섭취/, /식이/, /회복기/, /단백/, /질소균형/],
};

const DOMAIN_LABELS: Record<ClinicalDomain, string> = {
  generalSurgery: '수술 전후 회복/출혈/금식',
  obgyn: '산후/분만/부인과 수술 회복',
  respiratory: '폐렴/결핵/호흡기 감염 회복',
  criticalCare: '중환자/ICU/혈역학',
  neurosurgery: '신경외과 수술/의식 회복',
  orthopedics: '정형외과 수술/재활',
  outpatientAnemia: '외래 빈혈/Hb 회복/철 보충',
  recoveryNutrition: '입원 회복기 영양/경구 섭취 저하/TPN',
};

export function getAllowedClinicalDomains(department: string): ClinicalDomain[] {
  const matched = DEPARTMENT_DOMAIN_RULES.find((rule) =>
    rule.departmentPatterns.some((pattern) => pattern.test(department))
  );
  return matched?.allowedDomains ?? DEFAULT_ALLOWED_DOMAINS;
}

export function isClinicalDomainAllowed(domain: ClinicalDomain, department: string): boolean {
  return getAllowedClinicalDomains(department).includes(domain);
}

export function getAllowedClinicalDomainLabels(department: string): string[] {
  return getAllowedClinicalDomains(department).map((domain) => DOMAIN_LABELS[domain]);
}

export function getPrimaryClinicalDomainLabel(department: string): string {
  return getAllowedClinicalDomainLabels(department)[0] ?? '외래 빈혈/Hb 회복/철 보충';
}

export function buildClinicalDomainConstraint(department: string): string {
  const labels = getAllowedClinicalDomainLabels(department);
  return `\n★★★ 진료과 임상 도메인 제한:
- 이 과(${department})에서 실제로 다룰 법한 환자상황만 사용: ${labels.join(', ')}
- 제품 자료에 있더라도 위 임상 도메인 밖의 질환명, 수술/처치 상황, 환자군을 새로 섞지 말 것.
- 사용자가 원 메모에 직접 적은 특이 케이스는 보존하되, 자동생성에서는 허용 도메인 안에서만 작성할 것.\n`;
}

export function candidateFitsDepartment(candidateDomains: ClinicalDomain[], department: string): boolean {
  const allowed = new Set(getAllowedClinicalDomains(department));
  return candidateDomains.every((domain) => allowed.has(domain));
}

export function findMismatchedClinicalDomain(
  text: string,
  department: string,
  manualRawNotes?: string
): { domain: ClinicalDomain; term: string } | null {
  const allowed = new Set(getAllowedClinicalDomains(department));
  const manual = manualRawNotes ?? '';

  for (const [domain, patterns] of Object.entries(DOMAIN_TERM_PATTERNS) as [ClinicalDomain, RegExp[]][]) {
    if (allowed.has(domain)) continue;
    const matched = patterns.find((pattern) => pattern.test(text));
    if (!matched) continue;
    const manualHasSameSpecialCase = matched.test(manual);
    if (manualHasSameSpecialCase) continue;
    return { domain, term: matched.source };
  }

  return null;
}

export function removeMismatchedClinicalDomainSentences(
  text: string,
  department: string,
  manualRawNotes?: string
): string {
  return text
    .split(/(?<=[.。!?])\s+|[,，]\s*|\n+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean)
    .filter((sentence) => !findMismatchedClinicalDomain(sentence, department, manualRawNotes))
    .join(' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}
