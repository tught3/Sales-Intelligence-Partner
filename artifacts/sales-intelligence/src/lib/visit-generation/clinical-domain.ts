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

export function getAllowedClinicalDomains(department: string): ClinicalDomain[] {
  const matched = DEPARTMENT_DOMAIN_RULES.find((rule) =>
    rule.departmentPatterns.some((pattern) => pattern.test(department))
  );
  return matched?.allowedDomains ?? DEFAULT_ALLOWED_DOMAINS;
}

export function isClinicalDomainAllowed(domain: ClinicalDomain, department: string): boolean {
  return getAllowedClinicalDomains(department).includes(domain);
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
