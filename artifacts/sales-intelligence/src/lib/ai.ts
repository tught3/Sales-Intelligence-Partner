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
  const base = `당신은 JW중외제약 MR(의약품 영업사원)의 전문 영업 비서입니다.
JW중외제약의 주요 제품:
- 위너프(Winnerp): 철 결핍성 빈혈 치료제 (경구용 철분제) - 편의성, 부작용 적음
- 페린젝트(Ferinject): 정맥주사용 철 결핍 치료제 (IV 철 보충제) - 빠른 효과, 1회 고용량 투여 가능

당신의 역할:
- 전문적이고 격식 있는 한국어로 응답
- 의약품 영업에 특화된 전문 용어 사용
- 교수/의사의 성향, 병원 특성, 과 특성, 과거 대화 맥락을 반드시 반영
- JW중외제약의 제품 강점을 자연스럽게 강조`;

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

오늘 날것의 방문 메모:
${rawNotes}

위 모든 맥락(과거 방문 이력, 교수 성향, 병원/과 특성, 회사 매뉴얼)을 종합하여 다음을 작성해주세요:

1. [전문 영업 일지]
- 방문목적, 주요 대화 내용, 교수 반응, 제품 논의사항, 특이사항 포함
- 과거 방문 대비 변화/진전 사항 언급
- 300자 이상

2. [다음 방문 전략]  
- 이번 방문의 반응을 반영한 구체적 다음 단계
- 강조할 제품 포인트 (위너프/페린젝트)
- 예상 반박과 대응책
- 200자 이상

응답 형식:
===전문영업일지===
(일지 내용)

===다음방문전략===
(전략 내용)`;

  const response = await callAI(systemPrompt, prompt);
  const logMatch = response.match(/===전문영업일지===\s*([\s\S]*?)(?:===다음방문전략===|$)/);
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
