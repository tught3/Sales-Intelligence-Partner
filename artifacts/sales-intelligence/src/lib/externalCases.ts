export type ExternalCasePatternDraft = {
  department: string;
  product: string;
  patientGroup: string;
  detailAxis: string;
  reactionPattern: string;
  nextAction: string;
  sourceSummary: string;
  styleExampleMemo: string;
  confidence: number;
};

const DEPARTMENT_PATTERNS: Array<[RegExp, string]> = [
  [/혈액\s*종양|혈종|종양혈액|혈액내과|hemato/i, '혈액종양내과'],
  [/종양내과|종양|oncology|항암|암환자|cia/i, '종양내과'],
  [/산부인과|obgy|ob\/gy|산과|부인과|고위험\s*산모|her\s*story|her스토리|her\s*켐페인|her\s*캠페인/i, '산부인과'],
  [/소화기|위장관|ibd|크론|궤양성대장염/i, '소화기내과'],
  [/정형외과|\bos\b|ortho|tka|tha|고관절|슬관절|척추/i, '정형외과'],
  [/흉부외과|흉부|심부전/i, '흉부외과'],
  [/신경외과|neuro|척추/i, '신경외과'],
  [/호흡기|호흡/i, '호흡기내과'],
  [/중환자|icu|micu|sicu/i, '중환자의학과'],
  [/위장관외과|간담췌외과|혈관외과|소아외과|외과|pa팀/i, '외과'],
  [/비뇨기|uro/i, '비뇨기과'],
  [/심장|순환기|cardio/i, '심장내과'],
  [/내과|전공의/i, '내과'],
];

const USEFUL_DETAIL_RE = /빈혈|hb|혈색소|철분|경구|흡수|gi|트러블|수술|pre\s*op|post\s*op|수혈|급여|tsat|1\s*g|1000|500|kg|프로토콜|고단백|아미노산|오메가|포도당|tpn|영양|중증|icu|식이|항암|암환자|심부전|pbm|수급|효과|편의|접목|처방|반응|공감|만족|고려/i;
const NOISE_RE = /심포지엄|학회|모객|참석|등록|좌장|연자|서베이|설문|제품설명회|컨퍼런스|강의|리플렛|기획기사|미니베너|사전\s*f\/?u/i;

function compact(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function cleanNoise(text: string): string {
  return compact(text)
    .replace(/^\s*(?:[-*ㆍ]|\d+[.)]|\d+\))\s*/g, '')
    .replace(/\([^)]*(?:월|백만|내정가|만원|원)[^)]*\)/g, '')
    .replace(/\b\d+\s*월\s*\d*\.?\d*\s*백만\b/g, '')
    .replace(/(?:순천향부천병원|평촌성심|아주대|성빈센트|분당서울대병원|고대안산|길병원|인천성모병원|인하대병원|고대안산병원|평촌성심병원|성빈센트병원|신촌\s*세브란스|원주\s*세브란스|원주기독|강릉아산|신촌|세브란스)\s*/g, '')
    .replace(/(?:교수|의국장|전공의|pa팀|외\s*\d+명)\s*/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeExternalCaseProduct(product: string): string {
  const compacted = product.replace(/\s+/g, '').toLowerCase();
  if (/페린젝트|패린젝트|ferinject|페린젝|페린/.test(compacted)) return '페린젝트';
  if (/위너프/.test(compacted) || /winuf/.test(compacted)) return '위너프에이플러스';
  return '';
}

export function normalizeExternalCaseDepartment(department: string): string {
  const text = compact(department);
  for (const [pattern, normalized] of DEPARTMENT_PATTERNS) {
    if (pattern.test(text)) return normalized;
  }
  return text;
}

function detectDepartment(text: string): string {
  return normalizeExternalCaseDepartment(text);
}

function detectProduct(text: string): string {
  return normalizeExternalCaseProduct(text);
}

function detectProducts(text: string): string[] {
  const products: string[] = [];
  if (/페린젝트|패린젝트|ferinject|페린젝|페린/i.test(text)) products.push('페린젝트');
  if (/위너프|winuf/i.test(text)) products.push('위너프에이플러스');
  return [...new Set(products)];
}

function splitExternalCaseChunks(rawText: string): string[] {
  const lines = rawText
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const chunks: string[] = [];
  let current: string[] = [];
  const startsNew = (line: string) => /^[-*ㆍ]?\s*\d+[.)]\s+|^\d+\)\s*|^[-*ㆍ]\s+/.test(line);
  for (const line of lines) {
    if (startsNew(line) && current.length > 0) {
      chunks.push(current.join(' '));
      current = [line];
    } else {
      current.push(line);
    }
  }
  if (current.length > 0) chunks.push(current.join(' '));
  return chunks
    .map(cleanNoise)
    .filter((chunk) => chunk.length >= 18)
    .filter((chunk) => detectDepartment(chunk) && detectProduct(chunk))
    .filter((chunk) => USEFUL_DETAIL_RE.test(chunk))
    .filter((chunk) => !(NOISE_RE.test(chunk) && !/(빈혈|철분|영양|tpn|급여|수술|수혈|hb|고단백|아미노산|처방|접목|효과)/i.test(chunk)));
}

function patientGroupFrom(text: string, department: string, product: string): string {
  if (product === '페린젝트') {
    if (/종양|혈액종양|항암|암환자|cia/i.test(`${department} ${text}`)) {
      return /gi|트러블|흡수|경구/i.test(text)
        ? '항암치료 중 경구용철분제 흡수 저하나 GI 트러블로 빈혈 조절이 어려운 환자'
        : '항암치료 중 Hb 회복을 빠르게 확인해야 하는 빈혈 환자';
    }
    if (/산부인과|산후|분만|부인과|고위험산모|자궁/i.test(`${department} ${text}`)) {
      return /수술|로봇|자궁|근종|선종/i.test(text)
        ? '부인과 수술 전후 Hb 회복을 추적 중인 빈혈 환자'
        : '산후 빈혈이나 고위험 산모에서 철결핍 교정이 필요한 환자';
    }
    if (/소화기|위장관|ibd|크론|궤양성/i.test(`${department} ${text}`)) {
      return /위장관|출혈/i.test(text)
        ? '위장관 출혈 이후 Hb 회복이 더딘 외래 빈혈 환자'
        : '경구용철분제를 오래 유지하기 어렵거나 반응이 부족한 소화기내과 빈혈 환자';
    }
    if (/정형|신경외과|외과|흉부|비뇨기|수술|pre|post|tka|tha|골절|척추/i.test(`${department} ${text}`)) {
      return /pre|수술전|입원전/i.test(text)
        ? '수술 전 Hb 교정이 필요한 수술 예정 환자'
        : '수술 전후 수혈 부담이나 Hb 회복을 같이 보는 환자';
    }
    if (/심부전|흉부|심장/i.test(`${department} ${text}`)) {
      return '심부전 동반 빈혈에서 철분주사제 적용을 검토하는 환자';
    }
    return '경구용철분제 반응이 부족하거나 빠른 Hb 회복이 필요한 외래 빈혈 환자';
  }

  if (/종양|혈액종양|항암|암환자/i.test(`${department} ${text}`)) {
    return '항암치료 중 식사량 저하와 영양 보충을 같이 보는 암환자';
  }
  if (/중환자|icu|micu|sicu/i.test(`${department} ${text}`)) {
    return 'ICU 장기 입원 중 단백 보충과 혈당 부담을 같이 보는 중증 환자';
  }
  if (/소화기|ibd|식사량|위장관/i.test(`${department} ${text}`)) {
    return 'IBD 악화나 식사량 저하로 영양 보충이 필요한 환자';
  }
  if (/산부인과|산후|부인과|수술/i.test(`${department} ${text}`)) {
    return '분만 후 또는 부인과 수술 후 식이 진행이 늦어지는 회복기 환자';
  }
  if (/외과|정형|신경외과|흉부|수술|post/i.test(`${department} ${text}`)) {
    return '수술 후 식이 지연과 회복기 영양 보충이 필요한 환자';
  }
  return '영양 공급량과 단백 보충을 함께 조정해야 하는 환자';
}

function extractCompactKeywords(text: string): string[] {
  const tokens = compact(text)
    .replace(/[()【】\[\]<>]/g, ' ')
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2)
    .filter((token) => !NOISE_RE.test(token))
    .filter((token) => !/^\d+$/.test(token))
    .filter((token) => !/(병원|교수|선생님|좌장|연자|학회|심포지엄|설명회|컨퍼런스|내정가|백만|원)$/i.test(token));
  const preferred = tokens.filter((token) => USEFUL_DETAIL_RE.test(token));
  return [...new Set((preferred.length > 0 ? preferred : tokens).slice(0, 4))];
}

function detailAxisFrom(text: string, product: string): string {
  if (product === '페린젝트') {
    if (/gi|트러블|흡수|경구/i.test(text)) return '페린젝트의 1회 투여와 경구용철분제 대비 Hb 회복 근거';
    if (/pre\s*op|수술전|입원전/i.test(text)) return '페린젝트의 수술 전 투여 이점과 Hb 회복 근거';
    if (/post\s*op|수술후|프로토콜|셋오더/i.test(text)) return '페린젝트의 수술 전후 프로토콜과 1,000mg 투여 근거';
    if (/수혈|pbm/i.test(text)) return '페린젝트의 수혈 부담 감소와 Hb 회복 근거';
    if (/심부전|가이드라인/i.test(text)) return '페린젝트의 심부전 빈혈 환자 권고 근거';
    if (/tsat|급여/i.test(text)) return '페린젝트의 급여 기준과 TSAT 확인 포인트';
    if (/1\s*g|1000|kg|적정용량|상용량/i.test(text)) return '페린젝트의 1,000mg 1회 투여와 체중별 용량 포인트';
    return '페린젝트의 1회 투여 편의성과 Hb 회복 근거';
  }
  if (/고단백|아미노산/i.test(text)) return '위너프에이플러스의 고단백 조성과 아미노산 보충 이점';
  if (/오메가|지질/i.test(text)) return '위너프에이플러스의 지질 조성과 균형 영양 공급 포인트';
  if (/로오스모|경쟁|스위칭|dc|상정/i.test(text)) return '위너프에이플러스의 영양성분 차이와 경쟁품 대비 보충 이점';
  if (/혈당|포도당/i.test(text)) return '위너프에이플러스의 포도당 부담 감소와 단백 보충 이점';
  if (/소용량|낮병동|단시간/i.test(text)) return '위너프에이플러스의 낮병동 영양 공급과 투여 부담 완화 포인트';
  return '위너프에이플러스의 고단백 영양 보충과 회복기 영양 관리 이점';
}

function reactionFrom(text: string, department: string, product: string): string {
  if (/만족|효과\s*좋|효능.*만족|체감/i.test(text)) return '효과를 체감해 관련 케이스에서는 유지하겠다는 반응';
  if (/접목중|처방중|약속\s*처방|루틴|셋오더|사용중/i.test(text)) return '이미 일부 케이스에 사용 중이며 기준에 맞으면 이어가겠다는 반응';
  if (/긍정|공감|인지|메리트/i.test(text)) return '디테일 포인트에는 공감했고 맞는 케이스에서 참고하겠다는 의견';
  if (/금액|부담|실비|본인부담/i.test(text)) return '효과는 이해하지만 환자 비용 부담은 같이 보겠다는 의견';
  if (/케이스.*많지|많이는|기대.*쉽지|제한/i.test(text)) return '포인트는 이해했지만 당장 쓸 케이스는 많지 않다는 의견';
  if (/문의|질문|급여|수급/i.test(text)) return '급여나 수급 조건을 확인한 뒤 처방 상황을 보겠다는 의견';
  if (product === '위너프에이플러스' && /중환자|icu|종양|암/i.test(`${department} ${text}`)) return '영양 보충 필요성은 공감했고 환자 상태에 맞춰 보겠다는 의견';
  return '관련 케이스가 있으면 차트상 조건을 보고 검토하겠다는 의견';
}

function nextActionFrom(text: string, department: string, product: string, detailAxis: string): string {
  const followUpMatch = text.match(/(?:추후|다음번|다음\s*방문|차주|지속적|주기적)[^.!?。]{4,70}/i);
  if (followUpMatch) return cleanNoise(followUpMatch[0]).replace(/계획\s*$/g, '확인');
  if (product === '페린젝트') {
    if (/급여|tsat/i.test(text + detailAxis)) return '급여 기준에 맞는 처방 경험과 Hb 회복 반응 확인';
    if (/수술|pre|post|정형|외과|신경외과/i.test(`${department} ${text}`)) return '수술 전후 빈혈 환자에서 처방 여부와 Hb 추이 확인';
    if (/종양|혈액종양|항암|암/i.test(`${department} ${text}`)) return '항암 전후 빈혈에서 경구용철분제 한계와 처방 경험 확인';
    if (/산부인과|산후|부인과/i.test(`${department} ${text}`)) return '산후 또는 부인과 수술 전후 빈혈에서 처방 경험 확인';
    return '외래 빈혈 환자에서 처방 경험과 Hb 회복 반응 확인';
  }
  if (/중환자|icu/i.test(`${department} ${text}`)) return 'ICU 영양 공급 상황에서 단백 보충 반응 확인';
  if (/종양|암|항암/i.test(`${department} ${text}`)) return '항암치료 중 영양 보충 필요성과 실제 사용 반응 확인';
  if (/수술|외과|정형|산부인과/i.test(`${department} ${text}`)) return '수술 후 식이 지연 환자에서 영양 공급 반응 확인';
  return '영양 보충이 필요한 환자에서 처방 상황과 반응 확인';
}

function sourceSummaryFrom(department: string, product: string, patientGroup: string, detailAxis: string, chunk: string): string {
  const keywords = extractCompactKeywords(chunk);
  const summaryTail = keywords.length > 0 ? ` - ${keywords.join(' / ')}` : '';
  return `${department} ${product} 패턴 요약${summaryTail}`.trim();
}

function styleExampleMemoFrom(
  department: string,
  product: string,
  patientGroup: string,
  detailAxis: string,
  reactionPattern: string,
  nextAction: string,
  chunk: string
): string {
  const cleanedChunk = cleanNoise(chunk)
    .replace(/(?:심포지엄|학회|모객|참석|등록|좌장|연자|서베이|설문|제품설명회|컨퍼런스|강의|리플렛|기획기사|미니베너)[^.!?。]{0,40}/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  const detail = detailAxis.replace(new RegExp(`^${product}의\\s*`), '');
  const reaction = reactionPattern.replace(/^교수님(?:께서|께|은|이)?\s*/, '');
  const next = nextAction
    .replace(/^(?:다음\s*방문(?:시)?에는|추후|차주|지속적|주기적)\s*/g, '')
    .replace(/(?:확인|검토|예정|계획)\s*$/g, '')
    .trim();

  const opener = `${product} ${detail}을 ${patientGroup} 상황과 연결해 말씀드림`;
  const memo = `${opener}. 교수님께서 ${reaction}. 다음방문시에는 ${next || `${department} 환자군 반응`} 확인할예정`;
  const fallback = `${product} ${detail} 말씀드림. 교수님께서 ${reaction}. 다음방문시에는 ${next || '환자 반응'} 확인할예정`;
  return compact(memo.length <= 230 ? memo : fallback)
    .replace(/백만|만원|내정가|고대안산|아주대|신촌\s*세브란스|신촌/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim() || cleanedChunk.slice(0, 220);
}

function normalizeComparable(value: string): string {
  return value
    .toLowerCase()
    .replace(/경구\s*철분제|경구용\s*철분제제+|oral\s*iron/gi, '경구용철분제')
    .replace(/더딘|늦는|불충분|부족한|반응\s*부족/g, '반응부족')
    .replace(/헤모글로빈|혈색소/gi, 'hb')
    .replace(/[^\p{L}\p{N}%]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function mergeExternalCasePatterns(...groups: ExternalCasePatternDraft[][]): ExternalCasePatternDraft[] {
  const merged: ExternalCasePatternDraft[] = [];
  const seen = new Set<string>();
  for (const pattern of groups.flat()) {
    const normalized: ExternalCasePatternDraft = {
      ...pattern,
      department: normalizeExternalCaseDepartment(pattern.department),
      product: normalizeExternalCaseProduct(pattern.product),
      confidence: Math.max(0, Math.min(100, Number(pattern.confidence ?? 60) || 60)),
      styleExampleMemo: pattern.styleExampleMemo ?? '',
    };
    if (!normalized.department || !normalized.product || !normalized.patientGroup || !normalized.detailAxis) continue;
    const key = [
      normalizeComparable(normalized.department),
      normalizeComparable(normalized.product),
      normalizeComparable(normalized.patientGroup).slice(0, 28),
      normalizeComparable(normalized.detailAxis).slice(0, 40),
    ].join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(normalized);
  }
  return merged;
}

export function extractExternalCasePatternsFromText(rawText: string): ExternalCasePatternDraft[] {
  const chunks = splitExternalCaseChunks(rawText);
  const drafts = chunks.flatMap((chunk) => {
    const department = detectDepartment(chunk);
    const products = detectProducts(chunk);
    return products.map((product) => {
      const patientGroup = patientGroupFrom(chunk, department, product);
      const detailAxis = detailAxisFrom(chunk, product);
      const reactionPattern = reactionFrom(chunk, department, product);
      const nextAction = nextActionFrom(chunk, department, product, detailAxis);
      return {
        department,
        product,
        patientGroup,
        detailAxis,
        reactionPattern,
        nextAction,
        sourceSummary: sourceSummaryFrom(department, product, patientGroup, detailAxis, chunk),
        styleExampleMemo: styleExampleMemoFrom(department, product, patientGroup, detailAxis, reactionPattern, nextAction, chunk),
        confidence: NOISE_RE.test(chunk) ? 68 : 78,
      };
    });
  });
  return mergeExternalCasePatterns(drafts);
}

export function buildExternalCasePromptInput(rawText: string): string {
  const chunks = splitExternalCaseChunks(rawText).slice(0, 80);
  if (chunks.length === 0) return rawText.slice(0, 12000);
  return chunks.map((chunk, index) => `${index + 1}. ${chunk}`).join('\n');
}

// 진료과 키워드 패턴 (병원+과+이름 헤더 감지용)
const DEPT_KEYWORD_RE = /내과|외과|의학과|혈종|혈액|종양|정형|신경|흉부|산부인과|비뇨기|소화기|심장|호흡기|중환자|응급|약제팀/i;

// 번호/대시 항목 줄에서 "병원명 진료과 이름, 내용" 또는 "병원명 진료과 이름 - 내용" 헤더 제거
// → 내용 부분만 반환. 헤더만 있고 내용 없으면 빈 문자열 반환.
function stripCaseHeader(line: string): string {
  const withoutPrefix = line.replace(/^(?:\d+[.)]\s*|[-•·]\s*)/, '');

  // 패턴 1: "병원명 진료과 이름, 내용" — 콤마 앞에 진료과 키워드
  const commaIdx = withoutPrefix.indexOf(',');
  if (commaIdx > 0) {
    const beforeComma = withoutPrefix.slice(0, commaIdx);
    if (DEPT_KEYWORD_RE.test(beforeComma)) {
      return withoutPrefix.slice(commaIdx + 1).trim();
    }
  }

  // 패턴 2: "병원명 진료과 이름 - 내용" — 대시 앞에 진료과 키워드
  const dashMatch = withoutPrefix.match(/^(.{4,25})\s+-\s+([\s\S]+)/);
  if (dashMatch && DEPT_KEYWORD_RE.test(dashMatch[1])) {
    return dashMatch[2].trim();
  }

  // 헤더만 있는 줄: "병원명 진료과 이름" (내용 없음, 짧음) → 빈 문자열
  if (withoutPrefix.length <= 20 && DEPT_KEYWORD_RE.test(withoutPrefix)) {
    return '';
  }

  return withoutPrefix;
}

// 카카오톡 대화 내보내기 .txt 파일 → 외부사례 관련 메시지만 추출
// sinceDate가 있으면 그 날짜 이후 섹션만 처리 (증분 파싱)
export function parseKakaoTalkExport(
  fileText: string,
  sinceDate?: Date | null,
): { text: string; latestDate: Date | null } {
  const lines = fileText.split(/\r?\n/);
  const messages: string[] = [];

  // PC 버전: [이름] [오전/오후 HH:MM] 메시지
  const pcLineRe = /^\[.+?\]\s*\[(?:오전|오후)\s*\d{1,2}:\d{2}\]\s*/;
  // 모바일 버전: YYYY년 M월 D일 오전/오후 HH:MM, 이름 : 메시지
  const mobileLineRe = /^\d{4}년\s*\d{1,2}월\s*\d{1,2}일\s*(?:오전|오후)\s*\d{1,2}:\d{2},\s*.+?\s*:\s*/;
  // 날짜 구분선: ----- 날짜 -----
  const dateDividerRe = /^-{3,}\s*\d{4}년.+-{3,}\s*$/;
  // 날짜 구분선에서 날짜 추출
  const dateDividerExtractRe = /^-{3,}\s*(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일/;
  // 파일 헤더
  const headerRe = /^(?:카카오톡\s*대화\s*내보내기|저장한\s*날짜\s*:|방\s*이름\s*:|참여자\s*:)/;
  // 미디어 전용 라인 (이미지/파일/이모티콘 등)
  const mediaRe = /^(?:사진|동영상|이모티콘|파일|음성메시지|연락처|지도|일정|투표)\s*$/;
  // 결산 보고 노이즈: SAP 목표·실적·달성률·제품설명회·핵심품목 등
  const reportNoiseRe = /^(?:SAP\s*\d|현\s*실적\s*[:：]|달성률\s*[:：]|제품설명회\s*횟수|\d+월\s*\d+일.*결산|영업일수|\*\s*핵심품목|\*\s*주요\s*한일|\*\s*주요활동|주요\s*활동$|-페린젝트$|-위너프[fF]?$|목표\s*[:：]|@\S+$|.+님이\s.+(?:초대|나갔))/i;
  // 번호/대시로 시작하는 항목 줄
  const caseItemRe = /^(?:\d+[.)]\s*|[-•·]\s*)/;

  let currentSectionDate: Date | null = null;
  let latestDate: Date | null = null;

  // sinceDate를 자정 기준으로 정규화 (시간 무시 비교용)
  const sinceMidnight = sinceDate
    ? new Date(sinceDate.getFullYear(), sinceDate.getMonth(), sinceDate.getDate())
    : null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (headerRe.test(trimmed)) continue;

    // 날짜 구분선: 현재 섹션 날짜 업데이트
    if (dateDividerRe.test(trimmed)) {
      const m = trimmed.match(dateDividerExtractRe);
      if (m) {
        currentSectionDate = new Date(+m[1], +m[2] - 1, +m[3]);
        if (!latestDate || currentSectionDate > latestDate) {
          latestDate = new Date(currentSectionDate);
        }
      }
      continue;
    }

    // 증분 파싱: sinceDate 이하인 섹션은 스킵
    if (sinceMidnight && currentSectionDate) {
      const sectionMidnight = new Date(
        currentSectionDate.getFullYear(),
        currentSectionDate.getMonth(),
        currentSectionDate.getDate(),
      );
      if (sectionMidnight <= sinceMidnight) continue;
    }

    let msg = trimmed;
    if (pcLineRe.test(msg)) {
      msg = msg.replace(pcLineRe, '').trim();
    } else if (mobileLineRe.test(msg)) {
      msg = msg.replace(mobileLineRe, '').trim();
    }

    if (!msg || mediaRe.test(msg)) continue;
    if (reportNoiseRe.test(msg)) continue;

    // 번호/대시 항목: 병원+과+이름 헤더 제거하고 내용만 남기기
    if (caseItemRe.test(msg)) {
      msg = stripCaseHeader(msg);
    }

    if (!msg) continue;
    messages.push(msg);
  }

  return { text: messages.join('\n'), latestDate };
}
