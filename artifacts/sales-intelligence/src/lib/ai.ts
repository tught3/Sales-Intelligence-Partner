import type { Doctor, VisitLog, GoldenSnippet, HospitalProfile, DepartmentProfile } from './storage';
import { manualStorage, hospitalStorage, departmentStorage } from './storage';

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

async function callAI(systemPrompt: string, userPrompt: string): Promise<string> {
  const res = await fetch(`${API_BASE}/api/ai/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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

function buildSystemPrompt(): string {
  const manualText = manualStorage.getCombinedText();
  const base = `당신은 JW중외제약 MR(의약품 영업사원)의 영업 비서입니다.
JW중외제약의 주요 제품:
- 위너프(Winuf/위너프페리주): 3세대 3챔버 종합영양수액(TPN) - 정맥 영양제, 포도당+아미노산+지질, 수술 전후 금식·소화기 불가 환자, 오메가-3 포함, 2024년 매출 789억원
- 위너프에이플러스(Winuf A+): 4세대 TPN - 아미노산 함량 기존 대비 25% 증가, 포도당 감소, 중증/고단백 환자 최적화, 국내 3상 임상 완료(2024년 1월 출시), ASPEN/ESPEN 가이드라인 준수
- 페린젝트(Ferinject): 정맥주사용 철 결핍 치료제(FCM) - 1회 1,000mg 단회 투여, 15분 이내 투여 가능, 2024년 5월 건강보험 급여 적용

중요 원칙:
- 응답은 자연스러운 한국어로, 너무 딱딱하거나 문어체일 필요 없음
- 영업사원이 실제로 쓰는 말투와 표현을 유지할 것
- 교수/의사의 성향, 병원 특성, 과 특성, 과거 대화 맥락을 반드시 반영
- 회사 규칙과 가이드라인 내에서 내용을 정리할 것
- JW중외제약 제품 강점은 자연스럽게 녹여낼 것`;

  if (manualText) {
    return `${base}

===회사 매뉴얼 및 가이드라인===
${manualText}`;
  }
  return base;
}

function buildContextSection(
  doctor: Doctor,
  pastLogs: VisitLog[],
  hospital?: HospitalProfile,
  department?: DepartmentProfile
): string {
  const traitText = doctor.traits.map((t) => t.label).join(', ');
  const objectionText = doctor.objections
    .map((o) => `  - 반박: "${o.content}" → 대응: "${o.response}"`)
    .join('\n');

  const pastContext = pastLogs
    .slice(0, 5)
    .map((log, i) => `  [${i + 1}회 전 방문 - ${log.visitDate}]\n  ${log.formattedLog.slice(0, 400)}\n  다음전략: ${log.nextStrategy.slice(0, 200)}`)
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

  return context;
}

export async function convertToVisitLog(
  rawNotes: string,
  doctor: Doctor,
  pastLogs: VisitLog[]
): Promise<{ formattedLog: string; nextStrategy: string }> {
  const hospital = hospitalStorage.getByName(doctor.hospital);
  const deptProfile = hospital
    ? departmentStorage.getByHospitalAndName(hospital.id, doctor.department)
    : undefined;

  const systemPrompt = buildSystemPrompt();
  const contextSection = buildContextSection(doctor, pastLogs, hospital, deptProfile);

  const prompt = `${contextSection}

오늘 방문 메모 (날것):
${rawNotes}

위 메모를 회사 규칙과 가이드라인에 맞춰 정리해주세요.

작성 기준:
- 너무 딱딱한 문어체나 보고서 형식으로 바꾸지 말 것. 영업사원이 실제로 기록하는 자연스러운 말투 유지
- 내용을 과도하게 부풀리거나 없는 내용을 추가하지 말 것
- 회사 규칙에 어긋나는 표현이 있으면 수정
- 교수 성향과 과거 방문 맥락을 반영하여 빠진 부분 보완
- 다음 방문 전략은 실용적으로: 무엇을 들고 갈지, 어떤 말을 꺼낼지 구체적으로

응답 형식:
===정리된방문일지===
(일지 내용)

===다음방문전략===
(전략 내용)`;

  const response = await callAI(systemPrompt, prompt);
  const logMatch = response.match(/===(?:전문영업일지|정리된방문일지)===\s*([\s\S]*?)(?:===다음방문전략===|$)/);
  const strategyMatch = response.match(/===다음방문전략===\s*([\s\S]*?)$/);

  return {
    formattedLog: logMatch ? logMatch[1].trim() : response,
    nextStrategy: strategyMatch ? strategyMatch[1].trim() : '',
  };
}

export async function autoGenerateVisitLog(
  doctor: Doctor,
  pastLogs: VisitLog[]
): Promise<{ formattedLog: string; nextStrategy: string; visitDate: string; products: string[] }> {
  const hospital = hospitalStorage.getByName(doctor.hospital);
  const deptProfile = hospital
    ? departmentStorage.getByHospitalAndName(hospital.id, doctor.department)
    : undefined;

  const systemPrompt = buildSystemPrompt();
  const contextSection = buildContextSection(doctor, pastLogs, hospital, deptProfile);

  const today = new Date().toISOString().split('T')[0];
  const lastVisitDate = pastLogs[0]?.visitDate ?? '기록 없음';
  const visitCount = pastLogs.length;

  const prompt = `${contextSection}

오늘 날짜: ${today}
마지막 방문일: ${lastVisitDate}
총 방문 횟수: ${visitCount}회

위 교수를 오늘 방문했다고 가정하고, 실제로 있을 법한 영업 방문 내용을 생성해주세요.

생성 기준:
- 교수의 성향, 처방 경향, 과거 방문 패턴을 반드시 반영할 것
- 과거 반박 패턴이 있다면 그것이 자연스럽게 나올 것
- 병원/과 특성에 맞는 현실적 대화 내용
- 전 방문 전략이 있다면 그것을 실행한 방문으로 구성
- 위너프 또는 페린젝트 중 해당 과에 더 적합한 제품 중심

응답 형식:
===제품===
(위너프 또는 페린젝트 또는 두 제품 모두, 쉼표 구분)

===전문영업일지===
(실제 방문한 것처럼 작성한 전문 일지, 300자 이상)

===다음방문전략===
(다음 방문을 위한 전략, 200자 이상)`;

  const response = await callAI(systemPrompt, prompt);

  const productMatch = response.match(/===제품===\s*([\s\S]*?)(?:===전문영업일지===|$)/);
  const logMatch = response.match(/===전문영업일지===\s*([\s\S]*?)(?:===다음방문전략===|$)/);
  const strategyMatch = response.match(/===다음방문전략===\s*([\s\S]*?)$/);

  const productText = productMatch ? productMatch[1].trim() : '';
  const products = productText
    .split(/[,，、]/)
    .map((p) => p.trim())
    .filter((p) => ['위너프', '페린젝트', '기타'].includes(p));

  return {
    visitDate: today,
    products: products.length > 0 ? products : ['위너프'],
    formattedLog: logMatch ? logMatch[1].trim() : response,
    nextStrategy: strategyMatch ? strategyMatch[1].trim() : '',
  };
}

export async function generateNextVisitStrategy(
  doctor: Doctor,
  pastLogs: VisitLog[],
  snippets: GoldenSnippet[]
): Promise<string> {
  const hospital = hospitalStorage.getByName(doctor.hospital);
  const deptProfile = hospital
    ? departmentStorage.getByHospitalAndName(hospital.id, doctor.department)
    : undefined;

  const systemPrompt = buildSystemPrompt();
  const contextSection = buildContextSection(doctor, pastLogs, hospital, deptProfile);

  const relevantSnippets = snippets.slice(0, 5).map((s) => `"${s.content}" (${s.product})`).join('\n');

  const prompt = `${contextSection}

활용 가능한 핵심 멘트:
${relevantSnippets || '없음'}

위 모든 맥락을 종합하여 다음 방문을 위한 상세 시나리오를 작성해주세요:

1. 오프닝 멘트 (교수 성향 맞춤)
2. 핵심 메시지 (제품 강점 포인트 2-3개, 과거 대화 연속성 반영)
3. 예상 반박 시나리오와 준비된 대응책 (과거 반박 패턴 기반)
4. 클로징 전략
5. 다음 방문 전 준비사항 (자료, 데이터 등)`;

  return callAI(systemPrompt, prompt);
}

export async function generateObjectionResponse(
  objection: string,
  doctor: Doctor
): Promise<string> {
  const systemPrompt = buildSystemPrompt();
  const traitText = doctor.traits.map((t) => t.label).join(', ');

  const prompt = `교수: ${doctor.name} (${doctor.hospital} ${doctor.department})
교수 성향: ${traitText || '미기록'}
처방 경향: ${doctor.prescriptionTendency || '미기록'}

교수의 반박:
"${objection}"

이 반박에 대한 효과적인 대응책을 작성해주세요:
- 교수 성향을 고려한 접근법
- 임상 데이터/근거 기반 답변
- JW중외제약 제품(위너프/페린젝트) 강점 연결
- 2-3가지 대응 방안 제시`;

  return callAI(systemPrompt, prompt);
}

export async function analyzeSnippetEffectiveness(
  content: string,
  product: string
): Promise<string> {
  const systemPrompt = buildSystemPrompt();
  const prompt = `다음 영업 멘트를 분석해주세요:
"${content}"
제품: ${product}

분석:
1. 효과적인 이유
2. 어떤 성향의 교수에게 특히 효과적인지
3. 개선 제안
4. 변형 멘트 1-2개`;

  return callAI(systemPrompt, prompt);
}

export async function analyzeHospitalContext(
  hospitalName: string,
  doctors: Doctor[],
  logs: VisitLog[]
): Promise<string> {
  const systemPrompt = buildSystemPrompt();
  const hospitalProfile = hospitalStorage.getByName(hospitalName);
  const deptNames = [...new Set(doctors.map((d) => d.department))].join(', ');
  const recentLogs = logs.slice(0, 5);

  const prompt = `병원: ${hospitalName}
병원 특성: ${hospitalProfile?.characteristics || '미입력'}
담당 교수 수: ${doctors.length}명
담당 과: ${deptNames || '없음'}

최근 방문 요약:
${recentLogs.map((l) => {
  const doc = doctors.find((d) => d.id === l.doctorId);
  return `- ${l.visitDate} ${doc?.name ?? ''} 교수: ${l.formattedLog.slice(0, 100)}...`;
}).join('\n')}

위 병원에 대한 종합 영업 전략 분석을 작성해주세요:
1. 병원 내 JW 제품 현황 및 기회
2. 과별 우선순위 전략
3. 경쟁사 대응 방안
4. 3개월 내 실행 계획`;

  return callAI(systemPrompt, prompt);
}

export async function processImportedRecords(text: string): Promise<string> {
  const systemPrompt = buildSystemPrompt();
  const prompt = `다음은 과거 영업 방문 기록입니다. 이 데이터를 분석하고 구조화된 인사이트를 제공해주세요:

${text.slice(0, 3000)}

분석해주세요:
1. 방문 패턴 요약
2. 각 교수/제품별 주요 인사이트
3. 앞으로의 영업 전략 제안`;

  return callAI(systemPrompt, prompt);
}

export async function analyzePastConversations(
  rawText: string,
  doctor: Doctor,
  period: string
): Promise<{ analysis: string; detectedTraits: string[]; nextSuggestions: string }> {
  const hospital = hospitalStorage.getByName(doctor.hospital);
  const deptProfile = hospital
    ? departmentStorage.getByHospitalAndName(hospital.id, doctor.department)
    : undefined;

  const systemPrompt = buildSystemPrompt();
  const traitText = doctor.traits.map((t) => t.label).join(', ');

  const prompt = `교수 정보:
- 이름: ${doctor.name} (${doctor.position})
- 병원: ${doctor.hospital} / 과: ${doctor.department}
- 기존 파악된 성향: ${traitText || '없음'}
- 처방 경향: ${doctor.prescriptionTendency || '미기록'}
${hospital ? `- 병원 특성: ${hospital.characteristics}` : ''}
${deptProfile ? `- 과 특성: ${deptProfile.characteristics}` : ''}

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
지금까지의 대화를 바탕으로 다음에 어떤 방식으로 접근하면 좋을지 구체적으로 제안해주세요. 어떤 자료를 가져갈지, 어떤 말을 꺼낼지, 어떤 것을 피해야 할지 포함.`;

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
    analysis: analysisMatch ? analysisMatch[1].trim() : response,
    detectedTraits,
    nextSuggestions: strategyMatch ? strategyMatch[1].trim() : '',
  };
}
