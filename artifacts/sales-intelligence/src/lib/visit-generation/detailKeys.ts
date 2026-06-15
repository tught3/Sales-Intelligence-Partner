const SYNONYM_PATTERNS: Array<[RegExp, string]> = [
  [/경구\s*철분제?|경구용\s*철분제(?:제+)?|먹는\s*철분제|oral\s*iron|po\s*iron/gi, '경구용철분제'],
  [/헤모글로빈|혈색소/gi, 'Hb'],
  [/정맥\s*철분|고용량\s*철분/gi, '페린젝트'],
  [/더딘|늦는|늦은|느린|불충분|부족|미흡/gi, '반응부족'],
  [/편리성|편리|편의성/gi, '편의'],
  [/급여\s*조건|급여\s*기준/gi, '급여기준'],
];

const KEY_RULES: Array<[string, RegExp]> = [
  ['위너프에이플러스', /위너프에이플러스/],
  ['페린젝트', /페린젝트/],
  ['경구용철분제반응부족', /경구용철분제.*반응부족|반응부족.*경구용철분제/],
  ['1회투여편의', /1회.*투여.*편의|1회.*편의/],
  ['Hb회복', /Hb.*회복|회복.*Hb/],
  ['급여기준', /급여기준/],
  ['외래추적부담', /외래.*추적|추적.*불편|내원.*부담/],
  ['아나필락시스시험투여', /아나필락시스|시험\s*투여/],
  ['수혈부담', /수혈.*부담|수혈.*감소/],
  ['페리틴인산염', /페리틴|인산염/],
  ['아미노산25증가', /아미노산.*25|25.*아미노산/],
  ['포도당부담감소', /포도당.*부담|포도당.*감소|혈당.*부담/],
  ['중증영양', /중증.*영양|ICU|중환자/],
  ['단백보충', /단백.*보충|질소.*보충/],
  ['오메가3조성', /오메가\s*3|omega\s*3/i],
  ['winuf-postop-recovery', /수술후|회복기|식사진행|부인과수술.*(영양|단백|아미노산|TPN)|영양.*(수술후|회복기)/],
  ['winuf-postpartum-nutrition', /분만후|산후.*(단백|영양|회복)/],
  ['winuf-osmolarity', /삼투압|수액제한|고농도.*(영양|공급|부담)/],
  ['postpartum-anemia', /분만후|산후.*(Hb|빈혈|철결핍)/],
  ['preop-hb', /수술전|부인과수술|수술예정.*(Hb|빈혈|철결핍)/],
  ['기존TPN비교', /기존.*TPN|위너프.*비교|3챔버/],
  ['처방상황확인', /처방.*상황|고려.*상황|케이스.*확인|환자.*흐름/],
  ['실제적용판단', /실제.*적용|실제.*처방|환자.*상태.*보고.*판단|차트상.*조건.*보고.*검토|실제.*사용.*반응|실제.*적용.*사례/],
  ['전개방식', /지난방문확인형|교수질문답변형|급여기준재확인형|환자케이스연결형|처방경험확인형/],
  ['사용반응확인', /사용.*반응|써보|처방.*반응/],
];

const REACTION_RULES: Array<[string, RegExp]> = [
  ['반복내원재방문부담', /반복.*내원|재방문.*부담|외래.*재방문.*어려|재방문.*어려|외래.*추적.*어려|추적.*어려|복용.*지속.*어려|지속.*어려|동선.*부담|내원.*어려|방문.*어려|설명해볼수|설명.*수.*있|편의.*인정|편의.*이해|편의.*검토|검토.*가능/],
  ['급여기준확인', /급여기준|급여.*맞|보험.*기준|청구.*기준/],
  ['Hb증상같이봄', /Hb.*증상|증상.*Hb|Hb.*수치|수치.*증상|혈색소.*증상/],
  ['차트확인', /차트.*확인|기록.*확인|차트로.*확인/],
  ['케이스제한적', /케이스.*많지|많지는.*않|제한적|드물|많지.*않/],
  ['영양필요성공감', /영양.*필요성.*공감|영양.*공감|필요성.*공감|영양.*동의/],
  ['처방전환케이스별', /처방전환.*케이스별|전환.*케이스별|케이스별.*처방|케이스별.*전환/],
  ['혈당단백동의', /혈당.*단백.*동의|단백.*혈당.*동의|혈당.*보면서.*단백/],
  ['차트경과확인', /차트.*경과|경과.*차트|차트.*보고|차트상.*(확인|검토|판단)/],
  ['외래추이확인', /외래.*추이|외래.*경과|추적.*경과|경과.*확인/],
  ['환자군선별', /환자군.*(확인|선별|좁혀)|케이스.*(선별|좁혀|확인)/],
  ['진료흐름판단', /진료.*흐름|처방.*흐름|흐름.*보고|흐름.*판단/],
  ['실제적용반응', /실제.*적용.*반응|실제.*처방.*반응|실제.*사용.*반응|환자\s*상태.*보고.*판단|차트상.*조건.*보고.*검토/],
];

export function normalizeText(text: string): string {
  let normalized = text;
  for (const [pattern, replacement] of SYNONYM_PATTERNS) {
    normalized = normalized.replace(pattern, replacement);
  }
  return normalized.replace(/\s+/g, '');
}

export function normalizeKey(key: string): string {
  return normalizeText(key);
}

export function extractKeys(text: string): string[] {
  const compact = normalizeText(text);
  const keys = new Set<string>();
  for (const [key, pattern] of KEY_RULES) {
    if (pattern.test(compact)) keys.add(key);
    pattern.lastIndex = 0;
  }
  return [...keys];
}

export function similarityRatio(textA: string, textB: string): number {
  const a = new Set(extractKeys(textA));
  const b = new Set(extractKeys(textB));
  if (a.size === 0 || b.size === 0) return 0;
  const intersection = [...a].filter((key) => b.has(key)).length;
  const union = new Set([...a, ...b]).size;
  return union === 0 ? 0 : intersection / union;
}

export function isDuplicateOf(textA: string, candidateList: string[], threshold = 0.4): boolean {
  return candidateList.some((candidate) => similarityRatio(textA, candidate) >= threshold);
}

export function collectKeys(texts: string[]): string[] {
  return [...new Set(texts.flatMap(extractKeys))];
}

export function extractReactionKeys(text: string): string[] {
  const compact = normalizeText(text);
  const keys = new Set<string>();
  for (const [key, pattern] of REACTION_RULES) {
    if (pattern.test(compact)) keys.add(key);
    pattern.lastIndex = 0;
  }
  return [...keys];
}

export function collectReactionKeys(texts: string[]): string[] {
  return [...new Set(texts.flatMap(extractReactionKeys))];
}

export function normalizeTerminology(text: string): string {
  return text.replace(/경구\s*철분제?|경구용\s*철분제(?:제+)?|먹는\s*철분제|oral\s*iron|po\s*iron/gi, '경구용철분제');
}
