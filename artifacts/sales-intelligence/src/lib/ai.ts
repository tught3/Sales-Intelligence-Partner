import type { Doctor, VisitLog, GoldenSnippet } from './storage';

const BASE_URL = import.meta.env.VITE_AI_INTEGRATIONS_OPENAI_BASE_URL;
const API_KEY = import.meta.env.VITE_AI_INTEGRATIONS_OPENAI_API_KEY;

async function callAI(systemPrompt: string, userPrompt: string): Promise<string> {
  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({
      model: 'gpt-5',
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

const JW_SYSTEM_PROMPT = `당신은 JW중외제약 MR(의약품 영업사원)의 전문 영업 비서입니다.
JW중외제약의 주요 제품:
- 위너프(Winnerp): 철 결핍성 빈혈 치료제 (경구용 철분제)
- 페린젝트(Ferinject): 정맥주사용 철 결핍 치료제 (IV 철 보충제)

당신의 역할:
- 전문적이고 격식 있는 한국어로 응답할 것
- 의약품 영업에 특화된 전문 용어 사용
- 교수/의사의 개인 성향과 과거 대화 맥락을 반드시 반영할 것
- JW중외제약의 제품 강점을 자연스럽게 강조할 것`;

export async function convertToVisitLog(
  rawNotes: string,
  doctor: Doctor,
  pastLogs: VisitLog[]
): Promise<{ formattedLog: string; nextStrategy: string }> {
  const traitText = doctor.traits.map((t) => t.label).join(', ');
  const pastContext = pastLogs
    .slice(0, 3)
    .map(
      (log, i) =>
        `[이전 방문 ${i + 1} - ${log.visitDate}]\n${log.formattedLog}\n다음 전략: ${log.nextStrategy}`
    )
    .join('\n\n');

  const objectionText = doctor.objections
    .map((o) => `반박: ${o.content} / 대응: ${o.response}`)
    .join('\n');

  const prompt = `
교수 정보:
- 이름: ${doctor.name} 교수님 (${doctor.position})
- 병원: ${doctor.hospital} ${doctor.department}
- 성향: ${traitText || '미기록'}
- 비고: ${doctor.notes || '없음'}

주요 반박 패턴:
${objectionText || '없음'}

최근 방문 기록:
${pastContext || '없음'}

오늘 날것의 방문 메모:
${rawNotes}

위 정보를 바탕으로 다음 두 가지를 작성해주세요:

1. [전문 영업 일지]
형식: 방문목적, 주요 대화 내용, 교수 반응, 제품 관련 논의사항, 특이사항을 포함한 전문 일지 (300자 이상)

2. [다음 방문 전략]
- 교수 성향과 이전 대화 맥락을 반영한 구체적 접근법
- 강조해야 할 제품 포인트 (위너프/페린젝트 중 해당 과와 연관성 있는 것)
- 예상 반박과 대응책
(200자 이상)

응답 형식:
===전문영업일지===
(일지 내용)

===다음방문전략===
(전략 내용)
`;

  const response = await callAI(JW_SYSTEM_PROMPT, prompt);

  const logMatch = response.match(/===전문영업일지===\s*([\s\S]*?)(?:===다음방문전략===|$)/);
  const strategyMatch = response.match(/===다음방문전략===\s*([\s\S]*?)$/);

  return {
    formattedLog: logMatch ? logMatch[1].trim() : response,
    nextStrategy: strategyMatch ? strategyMatch[1].trim() : '',
  };
}

export async function generateNextVisitStrategy(
  doctor: Doctor,
  pastLogs: VisitLog[],
  snippets: GoldenSnippet[]
): Promise<string> {
  const traitText = doctor.traits.map((t) => t.label).join(', ');
  const lastLog = pastLogs[0];
  const relevantSnippets = snippets.slice(0, 5).map((s) => `"${s.content}" (${s.product})`).join('\n');

  const prompt = `
교수: ${doctor.name} (${doctor.hospital} ${doctor.department}, ${doctor.position})
성향: ${traitText || '미기록'}

마지막 방문 일지:
${lastLog?.formattedLog || '방문 기록 없음'}

이전 다음방문 전략:
${lastLog?.nextStrategy || '없음'}

활용 가능한 핵심 멘트:
${relevantSnippets || '없음'}

위 정보를 바탕으로 다음 방문을 위한 상세 시나리오를 작성해주세요:
1. 오프닝 멘트 (교수 성향에 맞게)
2. 핵심 메시지 (제품 강점 포인트 2-3개)
3. 예상 반박 시나리오와 대응책
4. 클로징 전략

전문적이고 실용적으로 작성해주세요.
`;

  return callAI(JW_SYSTEM_PROMPT, prompt);
}

export async function generateObjectionResponse(
  objection: string,
  doctor: Doctor
): Promise<string> {
  const traitText = doctor.traits.map((t) => t.label).join(', ');
  const prompt = `
교수: ${doctor.name} (${doctor.hospital} ${doctor.department})
교수 성향: ${traitText || '미기록'}

교수의 반박:
"${objection}"

위 반박에 대한 효과적인 대응책을 작성해주세요.
- 교수 성향을 고려한 접근법
- 임상 데이터나 근거 기반 답변
- JW중외제약 제품(위너프/페린젝트)의 강점을 자연스럽게 연결
- 2-3가지 대응 방안 제시
`;
  return callAI(JW_SYSTEM_PROMPT, prompt);
}

export async function analyzeSnippetEffectiveness(
  content: string,
  product: string
): Promise<string> {
  const prompt = `
다음 영업 멘트를 분석해주세요:
"${content}"
제품: ${product}

분석 항목:
1. 이 멘트가 효과적인 이유
2. 어떤 성향의 교수에게 특히 효과적인지
3. 개선 제안 (선택사항)
4. 유사 상황에서 활용할 수 있는 변형 멘트 1-2개

간결하고 실용적으로 작성해주세요.
`;
  return callAI(JW_SYSTEM_PROMPT, prompt);
}
