import type { Doctor, VisitLog, HospitalProfile, DepartmentProfile } from './storage';
import { manualStorage, hospitalStorage, departmentStorage, snippetStorage, doctorStorage, visitLogStorage } from './storage';

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

async function callAI(systemPrompt: string, userPrompt: string): Promise<string> {
  const res = await fetch(`${API_BASE}/api/ai/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      max_completion_tokens: 8192,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`AI 호출 실패: ${err}`);
  }
  const data = await res.json() as { choices: { message: { content: string } }[] };
  return data.choices[0].message.content;
}

async function callAIWithImage(systemPrompt: string, textPrompt: string, imageBase64: string, mimeType: string): Promise<string> {
  const res = await fetch(`${API_BASE}/api/ai/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: [
            { type: 'text', text: textPrompt },
            { type: 'image_url', image_url: { url: `data:${mimeType};base64,${imageBase64}` } },
          ],
        },
      ],
      max_completion_tokens: 8192,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`AI 이미지 분석 실패: ${err}`);
  }
  const data = await res.json() as { choices: { message: { content: string } }[] };
  return data.choices[0].message.content;
}

export async function extractTextFromImage(imageBase64: string, mimeType: string): Promise<string> {
  const system = `당신은 JW중외제약 MR 영업 비서 시스템의 한국어 문서 분석 AI입니다.
한국어 의약품/임상 자료 이미지에서 텍스트를 정확하게 추출합니다.
한글 한 글자도 임의로 변형하지 말 것.`;
  const prompt = `이 이미지를 매우 신중하게 읽고, 한국어 텍스트를 정확하게 추출해주세요.

★ 절대 규칙:
1. 한글을 절대로 임의로 추측/변형하지 말 것 (예: "혈장보다"를 "혈장염"으로 바꾸면 안 됨)
2. 의학 용어, 제품명, 화학 기호(Acetate, Lactate, Ca2+, Na+, pH 등)는 원문 그대로 보존
3. 글자가 불확실하면 추측하지 말고 [?] 로 표시할 것
4. 분류 라벨/카테고리 태그가 [대괄호] 안에 있으면 그 라벨은 출력에서 제거하고, 본문 내용만 추출할 것 (예: "[NS 대비] 플라주OP는..." → "플라주OP는...")
5. 같은 카테고리 라벨이 여러 줄에 반복되면 한 번만 카테고리 소제목으로 정리하거나 아예 빼고 본문만 정리
6. 표/리스트 구조는 그대로 유지
7. 추출한 텍스트 본문만 출력 (서두 설명, "다음과 같이 추출했습니다" 같은 말 일절 금지)`;
  return callAIWithImage(system, prompt, imageBase64, mimeType);
}

export async function mergeAdditionalFeatures(
  existingContent: string,
  additionalNotes: string,
  productName: string,
): Promise<string> {
  const system = `당신은 JW중외제약 MR 영업 비서 시스템의 제품 정보 통합 AI입니다.
영업사원이 추가로 입력한 특장점/메모를 기존 제품 정보 매뉴얼에 자연스럽게 통합하여
실무에서 바로 활용할 수 있는 깔끔한 매뉴얼로 재작성합니다.`;

  const prompt = `[제품명]: ${productName}

다음은 ${productName}의 기존 제품 정보 매뉴얼입니다:
==== 기존 매뉴얼 시작 ====
${existingContent}
==== 기존 매뉴얼 끝 ====

다음은 영업사원이 추가로 입력한 새로운 특장점/메모/현장 정보입니다 (구조 없는 raw text):
==== 추가 입력 시작 ====
${additionalNotes}
==== 추가 입력 끝 ====

위 두 자료를 통합하여 하나의 깔끔한 제품 정보 매뉴얼로 재작성해주세요.

⭐ 가장 중요한 원칙 (회사 방침):
"추가 입력" 내용은 영업사원/회사가 직접 검증한 1차 자료이며,
"기존 매뉴얼"보다 우선순위가 더 높습니다. 회사가 원하는 영업 방향을 반영하므로
더 비중 있게, 더 앞쪽에, 더 구체적으로 다뤄야 합니다.

반드시 지킬 규칙:
1. 기존 매뉴얼의 구조(■ 섹션 헤더, 【】 소제목 형태)를 그대로 유지할 것
2. 기존 매뉴얼의 모든 핵심 정보를 절대 누락하지 말 것 (정보 손실 금지)
3. 【추가 입력 우선 처리 규칙】
   - 추가 입력에서 나온 특장점/포인트는 해당 섹션의 "맨 앞"에 배치
   - 추가 입력 내용은 축약하지 말고 디테일을 살려서 풍부하게 서술
   - 기존 매뉴얼의 일반론보다 추가 입력의 구체적/현장적 표현을 우선 사용
   - ★, ◎, ◆ 같은 별도의 강조 마크/이모지를 임의로 붙이지 말 것 (기존 매뉴얼에 이미 있는 ■, 【】 같은 구조 기호만 그대로 유지)
4. 추가 입력 내용을 적절한 섹션에 자연스럽게 녹여낼 것
   - 특장점성 내용 → 【제품 핵심 강조점】 섹션 맨 앞에 항목 추가
   - 임상 데이터/논문 → 【임상 근거】 또는 【임상 데이터】 섹션 맨 앞
   - 경쟁사 비교 → 【경쟁 우위】 섹션 맨 앞
   - 영업 화법/현장 팁 → 【핵심 어필 화법】 또는 【주요 처방 시나리오】 맨 앞
   - 주의사항 → 【주의사항】
   - 적합한 섹션이 없으면 새 섹션을 추가해도 됨
5. 추가 입력과 기존 매뉴얼이 충돌/모순되면 → 추가 입력을 정답으로 채택하고 기존 내용을 수정
6. 중복되는 내용은 추가 입력 표현을 살리는 방향으로 통합 (같은 말 반복 금지)
7. 추가 입력의 사실 정보를 임의로 변형/축소/일반화하지 말 것
8. 영업사원이 즉시 활용 가능한 명확하고 구체적인 문장으로
9. 추가 입력 텍스트 안의 [대괄호 안 분류 라벨/카테고리 태그] 형태(예: [NS 대비], [하트만 스위칭 콜플랜], [혈장 유사 조성])는 그대로 옮겨 적지 말 것. 같은 카테고리 라벨이 반복되면 한 번만 소제목으로 정리하거나, 본문 내용만 자연스럽게 풀어서 통합할 것
10. OCR 추출 텍스트라서 깨진 글자/오탈자가 있을 수 있음. 의학적으로/맥락상 명백히 말이 안 되는 경우는 추가 입력에 의존하지 말고, 기존 매뉴얼의 정확한 표현을 우선 신뢰할 것 (단 추측해서 새로 만들지는 말 것)
11. 통합된 매뉴얼 본문만 출력 (서두 설명, 마무리 멘트 없이)`;

  return callAI(system, prompt);
}

export async function reformatAsCompanyRule(rawText: string, category: string): Promise<string> {
  const categoryLabel = category === 'rule' ? '회사 규칙/영업 지침' : category === 'product' ? '제품 정보' : '기타 매뉴얼';
  const system = `당신은 JW중외제약 MR 영업 비서 시스템의 문서 정리 AI입니다.
주어진 텍스트를 ${categoryLabel} 매뉴얼 형식으로 깔끔하게 재작성합니다.`;
  const prompt = `아래 내용을 ${categoryLabel} 매뉴얼로 재작성해주세요.

규칙:
- 핵심 내용을 항목별로 정리 (글머리 기호 또는 번호 사용)
- 영업사원이 실무에서 바로 활용할 수 있도록 명확하게
- 불필요한 반복 제거, 중요한 내용은 강조
- 원본 내용을 임의로 추가하거나 변형하지 말 것
- 재작성한 내용만 출력 (설명 없이)

원본 내용:
---
${rawText}
---`;
  return callAI(system, prompt);
}

function buildSystemPrompt(): string {
  const manualText = manualStorage.getCombinedText();
  const base = `당신은 JW중외제약 MR(의약품 영업사원)의 영업 비서입니다.
JW중외제약의 주요 제품:
- 위너프(Winuf/위너프페리주): 3세대 3챔버 종합영양수액(TPN) - 정맥 영양제, 포도당+아미노산+지질, 수술 전후 금식, 소화기 불가 환자, 오메가-3 포함, 2024년 매출 789억원
- 위너프에이플러스(Winuf A+): 4세대 TPN - 아미노산 함량 기존 대비 25% 증가, 포도당 감소, 중증/고단백 환자 최적화, 국내 3상 임상 완료(2024년 1월 출시), ASPEN/ESPEN 가이드라인 준수
- 페린젝트(Ferinject): 정맥주사용 철 결핍 치료제(FCM) - 1회 1,000mg 1회 투여, 15분 이내 투여 가능, 2024년 5월 건강보험 급여 적용
- 플라주OP(Plaju OP): 균형 전해질 수액(Balanced Crystalloid) - Mg 함유, 비락테이트, 아세트산/글루콘산 완충, 0.9% NS 대비 고염소 부담 적음, 패혈증/외상/수술 1차 수액
- 이부프로펜프리믹스(프리브로펜주): 즉시 사용 가능한 IV NSAID 프리믹스 백 - 조제 불필요, 이지컷 포장, opioid-sparing, ERAS 프로토콜 적용, 케토롤락 대비 신독성 낮음
- 포스페넴(Fosfomycin Inj.): 에폭사이드 계열 항생제 - 베타락탐과 교차내성 거의 없음, ESBL/MDR 그람음성균 커버, 항바이오필름 효과, 카바페넴 절약 전략(ASP)의 핵심
- 프리페넴(Ertapenem 1g): 카바페넴 중 유일한 1일 1회 투여 - ESBL 1차 선택지, 외래주사실(OPAT)/IM 가능, 복강내 감염 IDSA 1차 권장(녹농균 비커버 주의)

중요 원칙:
- 응답은 자연스러운 한국어로, 너무 딱딱하거나 문어체일 필요 없음
- 영업사원이 실제로 쓰는 말투와 표현을 유지할 것
- 교수/의사의 성향, 병원 특성, 과 특성, 과거 대화 맥락을 반드시 반영
- 회사 규칙과 가이드라인 내에서 내용을 정리할 것
- JW중외제약 제품 강점은 자연스럽게 녹여낼 것
- ★ 절대로 큰따옴표(")와 작은따옴표(')를 모두 사용하지 말 것. 강조가 필요하면 따옴표 없이 그냥 단어만 쓰거나 다른 표현을 사용할 것`;

  let prompt = base;

  if (manualText) {
    prompt += `\n\n===회사 매뉴얼 및 가이드라인===\n${manualText}`;
  }

  return prompt;
}

function buildSnippetContext(): string {
  const allSnippets = snippetStorage.getAll();
  if (allSnippets.length === 0) return '';

  const sorted = allSnippets
    .sort((a, b) => b.effectiveness - a.effectiveness)
    .slice(0, 10);
  const lines = sorted
    .map((s) => `- [${s.product}] ${s.content}${s.context ? ` (${s.context})` : ''}`)
    .join('\n');
  return `\n활용 가능한 핵심 멘트:\n${lines}\n`;
}

function buildContextSection(
  doctor: Doctor,
  pastLogs: VisitLog[],
  hospital?: HospitalProfile,
  department?: DepartmentProfile
): string {
  const traitText = doctor.traits.map((t) => t.label).join(', ');
  const objectionText = doctor.objections
    .map((o) => `  - 반박: ${o.content} → 대응: ${o.response}`)
    .join('\n');

  const pastContext = pastLogs
    .slice(0, 5)
    .map((log, i) => {
      let entry = `  [${i + 1}회 전 방문 - ${log.visitDate}]\n  ${log.formattedLog.slice(0, 500)}`;
      if (log.nextStrategy) entry += `\n  다음전략: ${log.nextStrategy.slice(0, 200)}`;
      return entry;
    })
    .join('\n\n');

  let context = `교수 정보:
- 이름: ${doctor.name} (${doctor.position})
- 병원: ${doctor.hospital} / 과: ${doctor.department}
- 성향: ${traitText || '미기록'}
- 처방 경향: ${doctor.prescriptionTendency || '미기록'}
- 관심 분야: ${doctor.interestAreas || '미기록'}
- 메모: ${doctor.notes || '없음'}`;

  if (objectionText) {
    context += `\n\n자주 하는 반박 패턴:\n${objectionText}`;
  }

  if (hospital) {
    context += `\n\n병원 특성 (${hospital.name}):
- 유형: ${hospital.hospitalType === 'tertiary' ? '상급종합병원' : hospital.hospitalType === 'secondary' ? '종합병원' : hospital.hospitalType === 'clinic' ? '의원' : '기타'}
- 특성: ${hospital.characteristics}
- 경쟁사 강도: ${hospital.competitorStrength}`;
  }

  if (department) {
    context += `\n\n과 특성 (${department.departmentName}):
- 특성: ${department.characteristics}
- 주요 경쟁 제품: ${department.competitorProducts || '없음'}`;
  }

  if (pastLogs.length > 0) {
    context += `\n\n최근 방문 기록 (${pastLogs.length}회 중 최근 5회):\n${pastContext}`;
  } else {
    context += '\n\n방문 기록: 없음 (첫 방문 또는 기록 없음)';
  }

  const convHistory = doctor.conversationHistory ?? [];
  if (convHistory.length > 0) {
    const latestConv = convHistory[0];
    context += `\n\n과거 대화 패턴 분석 (${latestConv.period}):
성향 태그: ${latestConv.detectedTraits.join(', ') || '없음'}
성향 요약: ${latestConv.aiAnalysis.slice(0, 400)}
이전 전략 제안: ${latestConv.nextSuggestions.slice(0, 300)}`;
  }

  const snippetContext = buildSnippetContext();
  if (snippetContext) {
    context += `\n${snippetContext}`;
  }

  return context;
}

function buildFullContext(doctor: Doctor, pastLogs: VisitLog[]): { systemPrompt: string; contextSection: string } {
  const hospital = hospitalStorage.getByName(doctor.hospital);
  const deptProfile = hospital
    ? departmentStorage.getByHospitalAndName(hospital.id, doctor.department)
    : undefined;
  const systemPrompt = buildSystemPrompt();
  const contextSection = buildContextSection(doctor, pastLogs, hospital, deptProfile);
  return { systemPrompt, contextSection };
}

async function trimToLimit(systemPrompt: string, text: string, limit: number): Promise<string> {
  const prompt = `아래 영업일지가 ${text.length}자입니다. ${limit}자 이내로 줄여주세요.

규칙:
- 핵심 내용과 의미를 최대한 보존
- 말투와 톤을 그대로 유지
- 큰따옴표("), 작은따옴표(') 모두 사용 금지
- 줄인 일지 본문만 출력. 설명이나 글자수 표기 등 절대 붙이지 말 것

원문:
${text}`;

  const result = await callAI(systemPrompt, prompt);
  let trimmed = result.replace(/^===.*===\s*/gm, '').replace(/['"]/g, '').trim();
  if (trimmed.length > limit) {
    trimmed = trimmed.slice(0, limit);
  }
  return trimmed;
}

export async function convertToVisitLog(
  rawNotes: string,
  doctor: Doctor,
  pastLogs: VisitLog[]
): Promise<{ formattedLog: string; nextStrategy: string }> {
  const { systemPrompt, contextSection } = buildFullContext(doctor, pastLogs);
  const visitCount = pastLogs.length;
  const visitOrdinal = visitCount + 1;

  const visitContextNote = visitCount > 0
    ? `\n★ 중요: 이 교수와는 이미 ${visitCount}회 방문 기록이 있습니다. 오늘은 ${visitOrdinal}번째 방문입니다. 절대로 첫 방문, 첫 인사, 처음 뵙겠습니다, 두 번째 방문 같은 잘못된 표현을 쓰지 말 것. 이전 방문에서 나눴던 대화의 연속선에서 작성하세요.\n`
    : '';

  const prompt = `${contextSection}
${visitContextNote}
오늘 방문 메모 (날것):
${rawNotes}

위 메모를 바탕으로 영업일지를 하나의 글로 작성해주세요.

작성 기준:
- 입력된 메모의 말투와 톤을 그대로 유지할 것. 보고서 형식으로 바꾸지 말 것
- 내용을 과도하게 부풀리거나 없는 내용을 추가하지 말 것
- 교수 성향, 처방 경향 등은 일지 본문에 직접 언급/서술하지 말 것 (입력 메모에 명시된 경우만 그대로 사용). 성향은 어조와 접근법에만 반영하고 텍스트로는 적지 말 것
- 위에 제공된 핵심 멘트가 있다면, 메모 내용과 관련된 멘트의 화법이나 포인트를 자연스럽게 반영할 것 (멘트 원문을 그대로 복붙하지 말고 맥락에 맞게 녹여낼 것)
- 앞부분에 오늘 방문의 반응근거(교수가 보인 반응의 해석), 뒷부분에 다음방문계획(다음에 뭘 들고 갈지/어떤 말을 꺼낼지)을 자연스럽게 이어서 작성
- 반응근거와 다음방문계획 사이에 빈 줄 없이 바로 다음 줄에 이어서 쓸 것. 별도 제목이나 구분선 붙이지 말 것

★ 절대 규칙:
1. 반응근거 + 다음방문계획을 합쳐서 반드시 230자(한글 기준) 이내로 작성할 것. 230자를 초과하면 안 됨.
2. 큰따옴표("), 작은따옴표(') 모두 절대 사용하지 말 것. 강조는 따옴표 없이 단어만 쓸 것.

응답은 영업일지 본문만 출력하세요. 제목, 구분선, 라벨 등은 절대 붙이지 마세요.`;

  const response = await callAI(systemPrompt, prompt);
  let cleaned = response.replace(/^===.*===\s*/gm, '').replace(/['"]/g, '').trim();

  if (cleaned.length > 230) {
    cleaned = await trimToLimit(systemPrompt, cleaned, 230);
  }

  return {
    formattedLog: cleaned,
    nextStrategy: '',
  };
}

export async function autoGenerateVisitLog(
  doctor: Doctor,
  pastLogs: VisitLog[]
): Promise<{ formattedLog: string; nextStrategy: string; visitDate: string; products: string[] }> {
  const { systemPrompt, contextSection } = buildFullContext(doctor, pastLogs);

  const today = new Date().toISOString().split('T')[0];
  const lastVisitDate = pastLogs[0]?.visitDate ?? '기록 없음';
  const visitCount = pastLogs.length;
  const visitOrdinal = visitCount + 1;

  const visitContextNote = visitCount > 0
    ? `\n★ 중요: 이 교수와는 이미 ${visitCount}회 방문 기록이 있습니다. 오늘은 ${visitOrdinal}번째 방문입니다. 절대로 첫 방문, 첫 인사, 처음 뵙겠습니다, 두 번째 방문 같은 잘못된 표현을 쓰지 말 것. 이전 방문에서 나눴던 대화의 연속선에서 작성하세요.\n`
    : '';

  const prompt = `${contextSection}
${visitContextNote}
오늘 날짜: ${today}
마지막 방문일: ${lastVisitDate}
총 방문 횟수: ${visitCount}회 (오늘이 ${visitOrdinal}번째)

위 교수를 오늘 방문했다고 가정하고, 실제로 있을 법한 영업 방문 내용을 생성해주세요.

생성 기준:
- 교수의 성향/처방 경향/과거 방문 패턴은 일지의 어조와 접근법에만 녹여낼 것. "데이터중시 성향이라" "보수적 성향이라" 같이 성향을 텍스트로 직접 서술하지 말 것
- 위에 제공된 핵심 멘트가 있다면, 관련된 멘트의 화법이나 포인트를 자연스럽게 반영할 것 (원문 복붙 금지, 맥락에 맞게 녹여낼 것)
- 과거 반박 패턴이 있다면 그것이 자연스럽게 나올 것
- 병원/과 특성에 맞는 현실적 대화 내용
- 전 방문 전략이 있다면 그것을 실행한 방문으로 구성
- 위너프 또는 페린젝트 중 해당 과에 더 적합한 제품 중심

응답 형식:
===제품===
(위너프 또는 페린젝트 또는 두 제품 모두, 쉼표 구분)

===영업일지===
(실제 방문한 것처럼 작성한 일지. 앞부분에 반응근거, 뒷부분에 다음방문계획을 자연스럽게 이어서 작성. 빈 줄 없이 바로 다음 줄에 이어서 쓸 것. 별도 제목이나 구분선 붙이지 말 것. 반드시 230자 이내. 큰따옴표("), 작은따옴표(') 모두 사용 금지)`;

  const response = await callAI(systemPrompt, prompt);

  const productMatch = response.match(/===제품===\s*([\s\S]*?)(?:===(?:영업일지|전문영업일지)===|$)/);
  const logMatch = response.match(/===(?:영업일지|전문영업일지)===\s*([\s\S]*?)(?:===다음방문전략===|$)/);
  const strategyMatch = response.match(/===다음방문전략===\s*([\s\S]*?)$/);

  const productText = productMatch ? productMatch[1].trim() : '';
  const products = productText
    .split(/[,，、]/)
    .map((p) => p.trim())
    .filter((p) => ['위너프', '페린젝트', '기타'].includes(p));

  let fullLog = logMatch ? logMatch[1].trim() : response.replace(/===제품===[\s\S]*?(?=\n\n|$)/, '').trim();
  if (strategyMatch) {
    fullLog = fullLog + '\n\n' + strategyMatch[1].trim();
  }

  fullLog = fullLog.replace(/['"]/g, '');

  if (fullLog.length > 230) {
    fullLog = await trimToLimit(buildSystemPrompt(), fullLog, 230);
  }

  return {
    visitDate: today,
    products: products.length > 0 ? products : ['위너프'],
    formattedLog: fullLog,
    nextStrategy: '',
  };
}

export async function generateNextVisitStrategy(
  doctor: Doctor,
  pastLogs: VisitLog[]
): Promise<string> {
  const { systemPrompt, contextSection } = buildFullContext(doctor, pastLogs);

  const prompt = `${contextSection}

위 모든 맥락을 종합하여 다음 방문을 위한 상세 시나리오를 작성해주세요:

1. 오프닝 멘트 (교수 성향 맞춤)
2. 핵심 메시지 (제품 강점 포인트 2-3개, 과거 대화 연속성 반영)
3. 예상 반박 시나리오와 준비된 대응책 (과거 반박 패턴 기반)
4. 클로징 전략
5. 다음 방문 전 준비사항 (자료, 데이터 등)

★ 큰따옴표("), 작은따옴표(') 모두 사용 금지.`;

  return callAI(systemPrompt, prompt);
}

export async function generateObjectionResponse(
  objection: string,
  doctor: Doctor
): Promise<string> {
  const pastLogs = visitLogStorage.getByDoctorId(doctor.id);
  const { systemPrompt, contextSection } = buildFullContext(doctor, pastLogs);

  const prompt = `${contextSection}

교수의 반박:
${objection}

이 반박에 대한 효과적인 대응책을 작성해주세요:
- 교수 성향과 과거 방문 맥락을 고려한 접근법
- 임상 데이터/근거 기반 답변
- 핵심 멘트 중 활용할 수 있는 포인트 반영
- JW중외제약 제품(위너프/페린젝트) 강점 연결
- 2-3가지 대응 방안 제시
- 큰따옴표("), 작은따옴표(') 모두 사용 금지`;

  return callAI(systemPrompt, prompt);
}

export async function analyzeSnippetEffectiveness(
  content: string,
  product: string
): Promise<string> {
  const systemPrompt = buildSystemPrompt();
  const snippetContext = buildSnippetContext();

  const allDoctors = doctorStorage.getAll();
  const doctorSummary = allDoctors.length > 0
    ? allDoctors.slice(0, 10).map(d => `- ${d.name} (${d.hospital} ${d.department}): 성향=${d.traits.map(t => t.label).join(',') || '미기록'}, 처방경향=${d.prescriptionTendency || '미기록'}`).join('\n')
    : '등록된 교수 없음';

  const prompt = `현재 담당 교수 현황:
${doctorSummary}
${snippetContext}

분석 대상 멘트:
${content}
제품: ${product}

위 멘트를 현재 담당 교수들의 성향과 맥락을 고려해서 분석해주세요:
1. 효과적인 이유
2. 어떤 성향의 교수에게 특히 효과적인지 (현재 담당 교수 중 누구에게 잘 먹힐지)
3. 개선 제안
4. 변형 멘트 1-2개
- 큰따옴표("), 작은따옴표(') 모두 사용 금지`;

  return callAI(systemPrompt, prompt);
}

export async function generateSnippetsFromManuals(): Promise<Array<{
  content: string;
  context: string;
  product: string;
  tags: string[];
}>> {
  const systemPrompt = buildSystemPrompt();
  const snippetContext = buildSnippetContext();

  const allDoctors = doctorStorage.getAll();
  const traitSummary = [...new Set(allDoctors.flatMap(d => d.traits.map(t => t.label)))].join(', ');

  const prompt = `당신은 JW중외제약 MR의 영업 코치입니다.
시스템 프롬프트에 포함된 제품 정보와 회사 매뉴얼을 모두 읽고, 영업 현장에서 실제로 교수/의사에게 말할 수 있는 핵심 세일즈 멘트를 생성해주세요.

현재 담당 교수들의 주요 성향: ${traitSummary || '아직 파악 안 됨'}
${snippetContext ? `\n기존에 등록된 멘트:\n${snippetContext}\n위 멘트들과 중복되지 않는 새로운 멘트를 생성해주세요.\n` : ''}

생성 규칙:
- 제품별로 최소 3개씩, 총 10개 이상의 멘트 생성
- 각 멘트는 영업사원이 교수 앞에서 바로 말할 수 있는 자연스러운 화법으로
- 너무 길지 않게, 1~2문장으로 간결하게
- 다양한 상황(첫 처방 유도, 가격 반박, 경쟁사 비교, 임상 데이터 어필, 편의성 강조 등)을 커버할 것
- 담당 교수들의 성향을 고려한 멘트도 포함할 것
- 멘트 본문(content)에는 큰따옴표("), 작은따옴표(') 모두 사용 금지 (단, 아래 JSON 구조의 키와 값 구분자는 예외)

응답 형식 (반드시 이 JSON 배열 형식만 출력, 다른 텍스트 없이):
[
  {
    'content': '멘트 내용',
    'context': '활용 상황 (예: 첫 처방 유도, 가격 반박 시)',
    'product': '위너프' 또는 '페린젝트' 또는 '공통',
    'tags': ['태그1', '태그2']
  }
]`;

  const response = await callAI(systemPrompt, prompt);

  const jsonMatch = response.match(/\[[\s\S]*\]/);
  if (!jsonMatch) throw new Error('AI 응답에서 멘트 데이터를 추출할 수 없습니다');

  const cleaned = jsonMatch[0].replace(/'/g, '"');
  const parsed = JSON.parse(cleaned) as Array<{
    content: string;
    context: string;
    product: string;
    tags: string[];
  }>;

  return parsed.map(item => ({
    content: (item.content || '').replace(/['"]/g, ''),
    context: (item.context || '').replace(/['"]/g, ''),
    product: ['위너프', '페린젝트', '공통'].includes(item.product) ? item.product : '공통',
    tags: Array.isArray(item.tags) ? item.tags : [],
  }));
}

export async function generateSnippetsForProduct(productName: string): Promise<Array<{
  content: string;
  context: string;
  product: string;
  tags: string[];
}>> {
  const systemPrompt = buildSystemPrompt();
  const allManuals = manualStorage.getAll();

  const detectKey = (title: string): string => {
    const t = title.toLowerCase();
    if (title.includes('위너프에이플러스') || t.includes('winuf a')) return '위너프에이플러스';
    if (title.includes('위너프') || t.includes('winuf')) return '위너프';
    if (title.includes('페린젝트') || t.includes('ferinject')) return '페린젝트';
    if (title.includes('플라주') || t.includes('plaju')) return '플라주OP';
    if (title.includes('이부프로펜') || title.includes('프리브로펜') || t.includes('ibuprofen') || t.includes('pribrophen')) return '이부프로펜프리믹스';
    if (title.includes('포스페넴') || title.includes('포스포마이신') || t.includes('fospenem') || t.includes('fosfomycin')) return '포스페넴';
    if (title.includes('프리페넴') || title.includes('에르타페넴') || t.includes('pripenem') || t.includes('ertapenem')) return '프리페넴';
    return '기타';
  };

  const productManuals = allManuals.filter(
    (m) => m.category === 'product' && detectKey(m.title) === productName
  );

  if (productManuals.length === 0) {
    throw new Error(`${productName} 제품 정보가 등록되어 있지 않습니다. 먼저 제품 정보를 추가해주세요.`);
  }

  const productContext = productManuals
    .map((m) => `[${m.title}]\n${m.content}`)
    .join('\n\n---\n\n');

  const allDoctors = doctorStorage.getAll();
  const traitSummary = [
    ...new Set(allDoctors.flatMap((d) => d.traits.map((t) => t.label))),
  ].join(', ');

  const existingForProduct = snippetStorage
    .getAll()
    .filter((s) => s.product === productName)
    .slice(0, 10)
    .map((s) => `- ${s.content}`)
    .join('\n');

  const prompt = `당신은 JW중외제약 MR의 영업 코치입니다.
아래 [${productName}] 제품 정보와 특장점만 집중적으로 참고해서, 영업 현장에서 교수/의사에게 바로 말할 수 있는 핵심 세일즈 멘트를 생성해주세요.

[${productName} 제품 정보]
${productContext}

현재 담당 교수들의 주요 성향: ${traitSummary || '아직 파악 안 됨'}
${existingForProduct ? `\n[이미 등록된 ${productName} 멘트 (중복 금지)]\n${existingForProduct}\n` : ''}

생성 규칙:
- ${productName}에 특화된 멘트만 5~8개 생성 (다른 제품 언급 최소화)
- 각 멘트는 영업사원이 교수 앞에서 자연스럽게 말할 수 있는 화법
- 1~2문장으로 간결하게
- 제품의 특장점, 임상 데이터, 차별점, 편의성 등 다양한 각도에서 커버
- 다양한 상황(첫 처방 유도, 가격 반박, 경쟁사 비교, 임상 데이터 어필 등) 포함
- 멘트 본문(content)에는 큰따옴표("), 작은따옴표(') 모두 사용 금지

응답 형식 (반드시 이 JSON 배열 형식만 출력, 다른 텍스트 없이):
[
  {
    'content': '멘트 내용',
    'context': '활용 상황',
    'product': '${productName}',
    'tags': ['태그1', '태그2']
  }
]`;

  const response = await callAI(systemPrompt, prompt);

  const jsonMatch = response.match(/\[[\s\S]*\]/);
  if (!jsonMatch) throw new Error('AI 응답에서 멘트 데이터를 추출할 수 없습니다');

  const cleaned = jsonMatch[0].replace(/'/g, '"');
  const parsed = JSON.parse(cleaned) as Array<{
    content: string;
    context: string;
    product: string;
    tags: string[];
  }>;

  return parsed.map((item) => ({
    content: (item.content || '').replace(/['"]/g, ''),
    context: (item.context || '').replace(/['"]/g, ''),
    product: productName,
    tags: Array.isArray(item.tags) ? item.tags : [],
  }));
}

export async function analyzeHospitalContext(
  hospitalName: string,
  doctors: Doctor[],
  logs: VisitLog[]
): Promise<string> {
  const systemPrompt = buildSystemPrompt();
  const hospitalProfile = hospitalStorage.getByName(hospitalName);
  const hospital = hospitalProfile;
  const deptNames = [...new Set(doctors.map((d) => d.department))];
  const recentLogs = logs.slice(0, 10);
  const snippetContext = buildSnippetContext();

  const deptDetails = deptNames.map(deptName => {
    const dept = hospital ? departmentStorage.getByHospitalAndName(hospital.id, deptName) : undefined;
    const deptDoctors = doctors.filter(d => d.department === deptName);
    return `  - ${deptName}: ${dept?.characteristics || '특성 미입력'} / 교수 ${deptDoctors.length}명 (${deptDoctors.map(d => d.name).join(', ')})`;
  }).join('\n');

  const doctorDetails = doctors.map(d => {
    const traits = d.traits.map(t => t.label).join(', ');
    return `- ${d.name} (${d.department}, ${d.position}): 성향=${traits || '미기록'}, 처방경향=${d.prescriptionTendency || '미기록'}`;
  }).join('\n');

  const prompt = `병원: ${hospitalName}
병원 특성: ${hospitalProfile?.characteristics || '미입력'}
경쟁사 강도: ${hospitalProfile?.competitorStrength || '미입력'}
담당 교수 수: ${doctors.length}명
과별 현황:
${deptDetails}

교수별 정보:
${doctorDetails}
${snippetContext}
최근 방문 기록:
${recentLogs.map((l) => {
  const doc = doctors.find((d) => d.id === l.doctorId);
  return `- ${l.visitDate} ${doc?.name ?? ''} 교수: ${l.formattedLog.slice(0, 150)}`;
}).join('\n')}

위 병원에 대한 종합 영업 전략 분석을 작성해주세요:
1. 병원 내 JW 제품 현황 및 기회
2. 과별 우선순위 전략
3. 경쟁사 대응 방안
4. 3개월 내 실행 계획
- 큰따옴표("), 작은따옴표(') 모두 사용 금지`;

  return callAI(systemPrompt, prompt);
}

export async function autoInferHospitalProfile(
  hospitalName: string
): Promise<{ characteristics: string; competitorStrength: string }> {
  const systemPrompt = buildSystemPrompt();
  const allDoctors = doctorStorage.getAll().filter(d => d.hospital === hospitalName);
  const allLogs = visitLogStorage.getAll();
  const hospitalLogs = allLogs.filter(l => allDoctors.some(d => d.id === l.doctorId));
  const snippetContext = buildSnippetContext();

  const deptNames = [...new Set(allDoctors.map(d => d.department))];

  const doctorInfo = allDoctors.map(d => {
    const traits = d.traits.map(t => t.label).join(', ');
    const objections = d.objections.map(o => `반박: ${o.content}`).join('; ');
    return `- ${d.name} (${d.department}, ${d.position}): 성향=${traits || '미기록'}, 처방경향=${d.prescriptionTendency || '미기록'}, 관심분야=${d.interestAreas || '미기록'}${objections ? `, 반박패턴: ${objections}` : ''}`;
  }).join('\n');

  const recentLogs = hospitalLogs
    .sort((a, b) => new Date(b.visitDate).getTime() - new Date(a.visitDate).getTime())
    .slice(0, 10);

  const logInfo = recentLogs.map(l => {
    const doc = allDoctors.find(d => d.id === l.doctorId);
    return `- ${l.visitDate} ${doc?.name ?? ''} (${doc?.department ?? ''}): ${l.formattedLog.slice(0, 200)}`;
  }).join('\n');

  const prompt = `병원명: ${hospitalName}
소속 과: ${deptNames.join(', ') || '정보 없음'}
담당 교수 ${allDoctors.length}명:
${doctorInfo || '등록된 교수 없음'}
${snippetContext}
최근 방문 기록:
${logInfo || '방문 기록 없음'}

위 정보를 종합하여 이 병원의 특성을 유추해주세요.

응답 형식:
===병원특성===
(이 병원의 영업 관점에서의 특성. 예: 어떤 제품에 관심이 높은지, 교수들의 전반적 성향, 처방 환경, 영업 접근 시 유의사항 등. 3-5줄로 간결하게)

===경쟁사강도===
(상/중/하 중 하나. 방문 기록과 교수 반응에서 경쟁사 언급 빈도를 기반으로 판단)

★ 큰따옴표("), 작은따옴표(') 모두 사용 금지.`;

  const response = await callAI(systemPrompt, prompt);

  const charMatch = response.match(/===병원특성===\s*([\s\S]*?)(?:===경쟁사강도===|$)/);
  const compMatch = response.match(/===경쟁사강도===\s*([\s\S]*?)$/);

  const characteristics = charMatch ? charMatch[1].replace(/['"]/g, '').trim() : '';
  const rawStrength = compMatch ? compMatch[1].trim() : '중';
  const competitorStrength = rawStrength.includes('상') ? '상' : rawStrength.includes('하') ? '하' : '중';

  return { characteristics, competitorStrength };
}

export async function autoInferDepartmentProfile(
  hospitalName: string,
  departmentName: string
): Promise<{ characteristics: string; competitorProducts: string }> {
  const systemPrompt = buildSystemPrompt();
  const allDoctors = doctorStorage.getAll().filter(d => d.hospital === hospitalName && d.department === departmentName);
  const allLogs = visitLogStorage.getAll();
  const deptLogs = allLogs.filter(l => allDoctors.some(d => d.id === l.doctorId));
  const snippetContext = buildSnippetContext();

  const doctorInfo = allDoctors.map(d => {
    const traits = d.traits.map(t => t.label).join(', ');
    const objections = d.objections.map(o => `반박: ${o.content} → 대응: ${o.response}`).join('; ');
    return `- ${d.name} (${d.position}): 성향=${traits || '미기록'}, 처방경향=${d.prescriptionTendency || '미기록'}, 관심분야=${d.interestAreas || '미기록'}${objections ? `, 반박패턴: ${objections}` : ''}`;
  }).join('\n');

  const recentLogs = deptLogs
    .sort((a, b) => new Date(b.visitDate).getTime() - new Date(a.visitDate).getTime())
    .slice(0, 10);

  const logInfo = recentLogs.map(l => {
    const doc = allDoctors.find(d => d.id === l.doctorId);
    return `- ${l.visitDate} ${doc?.name ?? ''}: ${l.formattedLog.slice(0, 200)}`;
  }).join('\n');

  const prompt = `병원: ${hospitalName}
과: ${departmentName}
소속 교수 ${allDoctors.length}명:
${doctorInfo || '등록된 교수 없음'}
${snippetContext}
최근 방문 기록:
${logInfo || '방문 기록 없음'}

위 정보를 종합하여 이 과의 영업 관련 특성을 유추해주세요.

응답 형식:
===과특성===
(이 과의 영업 관점에서의 특성. 예: 주로 어떤 환자를 보는지, TPN/FCM 수요가 있는지, 교수들의 공통 성향, 영업 포인트 등. 3-5줄로 간결하게)

===경쟁제품===
(이 과에서 경쟁하는 제품명이 있다면 쉼표로 구분. 방문 기록에서 언급된 경쟁사/경쟁 제품 기반. 없으면 없음)

★ 큰따옴표("), 작은따옴표(') 모두 사용 금지.`;

  const response = await callAI(systemPrompt, prompt);

  const charMatch = response.match(/===과특성===\s*([\s\S]*?)(?:===경쟁제품===|$)/);
  const compMatch = response.match(/===경쟁제품===\s*([\s\S]*?)$/);

  const characteristics = charMatch ? charMatch[1].replace(/['"]/g, '').trim() : '';
  const competitorProducts = compMatch ? compMatch[1].replace(/['"]/g, '').trim() : '없음';

  return { characteristics, competitorProducts };
}

export async function processImportedRecords(text: string): Promise<string> {
  const systemPrompt = buildSystemPrompt();
  const snippetContext = buildSnippetContext();

  const allDoctors = doctorStorage.getAll();
  const doctorSummary = allDoctors.length > 0
    ? `현재 담당 교수: ${allDoctors.map(d => `${d.name}(${d.hospital} ${d.department})`).join(', ')}`
    : '';

  const prompt = `${doctorSummary}
${snippetContext}

다음은 과거 영업 방문 기록입니다. 이 데이터를 분석하고 구조화된 인사이트를 제공해주세요:

${text.slice(0, 3000)}

분석해주세요:
1. 방문 패턴 요약
2. 각 교수/제품별 주요 인사이트
3. 앞으로의 영업 전략 제안
- 큰따옴표("), 작은따옴표(') 모두 사용 금지`;

  return callAI(systemPrompt, prompt);
}

export async function analyzePastConversations(
  rawText: string,
  doctor: Doctor,
  period: string
): Promise<{ analysis: string; detectedTraits: string[]; nextSuggestions: string }> {
  const pastLogs = visitLogStorage.getByDoctorId(doctor.id);
  const { systemPrompt, contextSection } = buildFullContext(doctor, pastLogs);

  const prompt = `${contextSection}

아래는 ${period} 동안의 이 교수와의 방문/대화 기록입니다:
---
${rawText.slice(0, 4000)}
---

위 내용을 바탕으로 다음을 분석해주세요:

응답 형식:
===성향분석===
이 교수의 성격, 의사결정 스타일, 제품에 대한 태도, 영업 접근법에서 통했던 것과 안 통했던 것을 자연스럽게 정리해주세요.

===파악된성향태그===
성향을 나타내는 태그를 쉼표로 구분해서 5개 이내로 작성 (예: 데이터중시, 바쁨, 경쟁사충성도높음, 임상관심많음, 가격민감)

===다음방문전략===
지금까지의 대화를 바탕으로 다음에 어떤 방식으로 접근하면 좋을지 구체적으로 제안해주세요. 어떤 자료를 가져갈지, 어떤 말을 꺼낼지, 어떤 것을 피해야 할지 포함.

★ 큰따옴표("), 작은따옴표(') 모두 사용 금지.`;

  const response = await callAI(systemPrompt, prompt);

  const analysisMatch = response.match(/===성향분석===\s*([\s\S]*?)(?:===파악된성향태그===|$)/);
  const tagsMatch = response.match(/===파악된성향태그===\s*([\s\S]*?)(?:===다음방문전략===|$)/);
  const strategyMatch = response.match(/===다음방문전략===\s*([\s\S]*?)$/);

  const tagsText = tagsMatch ? tagsMatch[1].trim() : '';
  const detectedTraits = tagsText
    .split(/[,，、\n]/)
    .map((t) => t.trim().replace(/^[-·•]\s*/, ''))
    .filter(Boolean)
    .slice(0, 5);

  return {
    analysis: analysisMatch ? analysisMatch[1].replace(/['"]/g, '').trim() : response.replace(/['"]/g, ''),
    detectedTraits,
    nextSuggestions: strategyMatch ? strategyMatch[1].replace(/['"]/g, '').trim() : '',
  };
}
