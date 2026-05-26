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
  ['기존TPN비교', /기존.*TPN|위너프.*비교|3챔버/],
  ['적용환자군', /적용.*환자군|환자군.*확인/],
  ['사용반응확인', /사용.*반응|써보|처방.*반응/],
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

export function normalizeTerminology(text: string): string {
  return text.replace(/경구\s*철분제?|경구용\s*철분제(?:제+)?|먹는\s*철분제|oral\s*iron|po\s*iron/gi, '경구용철분제');
}
