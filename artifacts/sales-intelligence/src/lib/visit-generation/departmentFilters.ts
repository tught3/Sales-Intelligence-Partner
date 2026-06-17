type DepartmentMismatchRule = {
  department: RegExp;
  forbidden: RegExp;
};

export const DEPT_DISALLOWED_KEYWORDS = [
  'IBD',
  '크론',
  '궤양성대장염',
  '위장관',
  '장염',
  '장관',
  '대장',
  '소화기내과',
  'GI',
  '분만',
  '산후',
  '산모',
  '산부인과',
  '부인과',
  '제왕절개',
  'TKR/THR',
  '관절 수술',
  '정형외과 환자군',
  '응급·마취 전용 프로토콜',
  '플라주OP 환자군',
  'ICU 전용 환자군',
] as const;

const DIGESTIVE_PATIENT_GROUP = /IBD|크론|궤양성대장염|위장관\s*출혈|소화기내과|GI\b/i;
const OB_PATIENT_GROUP = /분만|산후|산모|산과|산부인과|부인과|제왕절개|부인과\s*수술/i;
const ORTHO_PATIENT_GROUP = /TKR|THR|정형외과|관절|골절|척추|재활|근감소|창상/i;
const ER_ANES_CONTEXT = /응급실|응급의학|응급\s*프로토콜|마취|회복실|수술실|진통|opioid|오피오이드|플라주OP|제이세덱스/i;
const ICU_CONTEXT = /ICU|중환자|중증|인공호흡|ventilator|패혈|혈역학/i;

const RULES: DepartmentMismatchRule[] = [
  { department: /소화기/, forbidden: OB_PATIENT_GROUP },
  { department: /산부인과|산과|부인과/i, forbidden: DIGESTIVE_PATIENT_GROUP },
  { department: /정형외과/, forbidden: DIGESTIVE_PATIENT_GROUP },
  { department: /정형외과/, forbidden: OB_PATIENT_GROUP },
  { department: /호흡기|결핵/, forbidden: new RegExp(`${DIGESTIVE_PATIENT_GROUP.source}|${OB_PATIENT_GROUP.source}|${ORTHO_PATIENT_GROUP.source}`, 'i') },
  { department: /마취통증|마취과|통증의학/, forbidden: new RegExp(`${DIGESTIVE_PATIENT_GROUP.source}|${OB_PATIENT_GROUP.source}`, 'i') },
  { department: /응급의학/, forbidden: new RegExp(`${DIGESTIVE_PATIENT_GROUP.source}|${OB_PATIENT_GROUP.source}`, 'i') },
  { department: /중환자|ICU/i, forbidden: new RegExp(`${OB_PATIENT_GROUP.source}|${ORTHO_PATIENT_GROUP.source}`, 'i') },
  { department: /신경외과/, forbidden: new RegExp(`${DIGESTIVE_PATIENT_GROUP.source}|${OB_PATIENT_GROUP.source}|정형외과`, 'i') },
];

export function hasDepartmentPatientGroupMismatch(text: string, department: string): boolean {
  const normalizedDepartment = department.trim();
  if (!normalizedDepartment || !text.trim()) return false;
  return RULES.some((rule) => rule.department.test(normalizedDepartment) && rule.forbidden.test(text));
}

export function departmentDisallowedThemeLabels(department: string): string[] {
  const normalizedDepartment = department.trim();
  if (!normalizedDepartment) return [];
  const labels: string[] = [];
  if (!/소화기/.test(normalizedDepartment)) labels.push('IBD', '크론', '궤양성대장염', '위장관', '장염', '장관', '대장', '소화기내과', 'GI');
  if (!/산부인과|산과|부인과/i.test(normalizedDepartment)) labels.push('분만', '산후', '산모', '산부인과', '부인과', '제왕절개');
  if (!/정형외과/.test(normalizedDepartment)) labels.push('TKR/THR', '관절 수술', '정형외과 환자군');
  if (!/응급의학|마취통증|마취과|통증의학/.test(normalizedDepartment)) labels.push('응급·마취 전용 프로토콜', '플라주OP 환자군');
  if (!/중환자|ICU|호흡기|신경외과|흉부외과|외상|응급/i.test(normalizedDepartment)) labels.push('ICU 전용 환자군');
  return [...new Set(labels)];
}

export function isTextAllowedForDepartment(text: string, department: string): boolean {
  return !hasDepartmentPatientGroupMismatch(text, department);
}

export function isErOrAnesthesiaDepartment(department: string): boolean {
  return /응급의학|마취통증|마취과|통증의학/.test(department);
}

export function inferSnippetPatientGroup(text: string, department: string): string {
  if (OB_PATIENT_GROUP.test(text)) return '산후·부인과 수술 후 회복 환자';
  if (DIGESTIVE_PATIENT_GROUP.test(text)) return 'IBD 또는 위장관 출혈 이후 회복이 필요한 환자';
  if (ORTHO_PATIENT_GROUP.test(text)) return '정형외과 수술 전후 회복기 환자';
  if (ICU_CONTEXT.test(text)) return '중환자실에서 영양과 회복을 같이 보는 환자';
  if (ER_ANES_CONTEXT.test(text)) return '응급·마취 프로토콜 적용을 검토하는 환자';
  if (/빈혈|Hb|철결핍|수혈/.test(text)) return 'Hb 회복과 철 보충이 필요한 빈혈 환자';
  if (/영양|단백|아미노산|TPN|식이/.test(text)) return '영양 보충과 회복 속도를 같이 보는 환자';
  return `${department || '해당 진료과'}에서 적용 가능성을 볼 환자`;
}
