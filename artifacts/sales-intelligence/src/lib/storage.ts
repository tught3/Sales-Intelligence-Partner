export interface DoctorTrait {
  id: string;
  label: string;
  color: 'blue' | 'green' | 'yellow' | 'red' | 'purple' | 'gray';
}

export interface Objection {
  id: string;
  content: string;
  response: string;
  createdAt: string;
}

export interface VisitLog {
  id: string;
  doctorId: string;
  visitDate: string;
  rawNotes: string;
  formattedLog: string;
  nextStrategy: string;
  products: string[];
  createdAt: string;
}

export interface Doctor {
  id: string;
  name: string;
  hospital: string;
  department: string;
  position: string;
  traits: DoctorTrait[];
  objections: Objection[];
  notes: string;
  prescriptionTendency: string;
  interestAreas: string;
  conversationHistory: ConversationRecord[];
  createdAt: string;
  updatedAt: string;
}

export interface HospitalProfile {
  id: string;
  name: string;
  region: string;
  hospitalType: 'tertiary' | 'secondary' | 'clinic' | 'other';
  characteristics: string;
  keyDepartments: string;
  competitorStrength: string;
  notes: string;
  updatedAt: string;
}

export interface DepartmentProfile {
  id: string;
  hospitalId: string;
  hospitalName: string;
  departmentName: string;
  characteristics: string;
  mainProducts: string[];
  competitorProducts: string;
  notes: string;
  updatedAt: string;
}

export interface GoldenSnippet {
  id: string;
  content: string;
  context: string;
  tags: string[];
  product: string;
  effectiveness: number;
  createdAt: string;
}

export interface CompanyManual {
  id: string;
  title: string;
  content: string;
  category: 'rule' | 'product' | 'other';
  updatedAt: string;
}

export interface ConversationRecord {
  id: string;
  rawText: string;
  period: string;
  aiAnalysis: string;
  detectedTraits: string[];
  nextSuggestions: string;
  createdAt: string;
}

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

const cache: {
  doctors: Doctor[];
  visitLogs: VisitLog[];
  snippets: GoldenSnippet[];
  hospitals: HospitalProfile[];
  departments: DepartmentProfile[];
  manuals: CompanyManual[];
  loaded: boolean;
} = {
  doctors: [],
  visitLogs: [],
  snippets: [],
  hospitals: [],
  departments: [],
  manuals: [],
  loaded: false,
};

async function api(path: string, method = 'GET', body?: any) {
  const opts: RequestInit = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${API_BASE}/api/data${path}`, opts);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

function toISOStr(v: any): string {
  if (!v) return new Date().toISOString();
  if (typeof v === 'string') return v;
  if (v instanceof Date) return v.toISOString();
  return new Date(v).toISOString();
}

function normalizeDoctor(d: any): Doctor {
  return {
    ...d,
    traits: d.traits ?? [],
    objections: d.objections ?? [],
    conversationHistory: d.conversationHistory ?? d.conversation_history ?? [],
    prescriptionTendency: d.prescriptionTendency ?? d.prescription_tendency ?? '',
    interestAreas: d.interestAreas ?? d.interest_areas ?? '',
    createdAt: toISOStr(d.createdAt ?? d.created_at),
    updatedAt: toISOStr(d.updatedAt ?? d.updated_at),
  };
}

function normalizeVisitLog(v: any): VisitLog {
  return {
    ...v,
    doctorId: v.doctorId ?? v.doctor_id ?? '',
    visitDate: v.visitDate ?? v.visit_date ?? '',
    rawNotes: v.rawNotes ?? v.raw_notes ?? '',
    formattedLog: v.formattedLog ?? v.formatted_log ?? '',
    nextStrategy: v.nextStrategy ?? v.next_strategy ?? '',
    products: v.products ?? [],
    createdAt: toISOStr(v.createdAt ?? v.created_at),
  };
}

function normalizeSnippet(s: any): GoldenSnippet {
  return {
    ...s,
    tags: s.tags ?? [],
    createdAt: toISOStr(s.createdAt ?? s.created_at),
  };
}

function normalizeHospital(h: any): HospitalProfile {
  return {
    ...h,
    hospitalType: h.hospitalType ?? h.hospital_type ?? 'other',
    keyDepartments: h.keyDepartments ?? h.key_departments ?? '',
    competitorStrength: h.competitorStrength ?? h.competitor_strength ?? '',
    updatedAt: toISOStr(h.updatedAt ?? h.updated_at),
  };
}

function normalizeDepartment(d: any): DepartmentProfile {
  return {
    ...d,
    hospitalId: d.hospitalId ?? d.hospital_id ?? '',
    hospitalName: d.hospitalName ?? d.hospital_name ?? '',
    departmentName: d.departmentName ?? d.department_name ?? '',
    mainProducts: d.mainProducts ?? d.main_products ?? [],
    competitorProducts: d.competitorProducts ?? d.competitor_products ?? '',
    updatedAt: toISOStr(d.updatedAt ?? d.updated_at),
  };
}

function normalizeManual(m: any): CompanyManual {
  return {
    ...m,
    updatedAt: toISOStr(m.updatedAt ?? m.updated_at),
  };
}

export async function initStorage(): Promise<void> {
  if (cache.loaded) return;
  try {
    const [docs, logs, snips, hosps, depts, mans] = await Promise.all([
      api('/doctors'),
      api('/visit-logs'),
      api('/snippets'),
      api('/hospitals'),
      api('/departments'),
      api('/manuals'),
    ]);
    cache.doctors = (docs || []).map(normalizeDoctor);
    cache.visitLogs = (logs || []).map(normalizeVisitLog);
    cache.snippets = (snips || []).map(normalizeSnippet);
    cache.hospitals = (hosps || []).map(normalizeHospital);
    cache.departments = (depts || []).map(normalizeDepartment);
    cache.manuals = (mans || []).map(normalizeManual);
    cache.loaded = true;
  } catch (e) {
    console.error('Failed to load data from server, falling back to empty state:', e);
    cache.loaded = true;
  }
}

export async function refreshCache(): Promise<void> {
  cache.loaded = false;
  await initStorage();
}

export const doctorStorage = {
  getAll(): Doctor[] {
    return cache.doctors;
  },
  getById(id: string): Doctor | undefined {
    return cache.doctors.find((d) => d.id === id);
  },
  addConversationRecord(doctorId: string, record: ConversationRecord): void {
    const idx = cache.doctors.findIndex((d) => d.id === doctorId);
    if (idx < 0) return;
    cache.doctors[idx].conversationHistory = [record, ...(cache.doctors[idx].conversationHistory ?? [])];
    cache.doctors[idx].updatedAt = new Date().toISOString();
    api('/doctors', 'POST', doctorToApi(cache.doctors[idx])).catch(console.error);
  },
  deleteConversationRecord(doctorId: string, recordId: string): void {
    const idx = cache.doctors.findIndex((d) => d.id === doctorId);
    if (idx < 0) return;
    cache.doctors[idx].conversationHistory = (cache.doctors[idx].conversationHistory ?? []).filter((r) => r.id !== recordId);
    cache.doctors[idx].updatedAt = new Date().toISOString();
    api('/doctors', 'POST', doctorToApi(cache.doctors[idx])).catch(console.error);
  },
  getByHospital(hospital: string): Doctor[] {
    return cache.doctors.filter((d) => d.hospital === hospital);
  },
  getByDepartment(hospital: string, department: string): Doctor[] {
    return cache.doctors.filter((d) => d.hospital === hospital && d.department === department);
  },
  save(doctor: Doctor): void {
    const idx = cache.doctors.findIndex((d) => d.id === doctor.id);
    const now = new Date().toISOString();
    if (idx >= 0) {
      cache.doctors[idx] = { ...doctor, updatedAt: now };
    } else {
      cache.doctors.push({ ...doctor, updatedAt: now });
    }
    api('/doctors', 'POST', doctorToApi(doctor)).catch(console.error);
  },
  delete(id: string): void {
    cache.doctors = cache.doctors.filter((d) => d.id !== id);
    api(`/doctors/${id}`, 'DELETE').catch(console.error);
  },
};

function doctorToApi(d: Doctor) {
  return {
    id: d.id,
    name: d.name,
    hospital: d.hospital || '',
    department: d.department || '',
    position: d.position || '교수',
    traits: d.traits || [],
    objections: d.objections || [],
    notes: d.notes || '',
    prescriptionTendency: d.prescriptionTendency || '',
    interestAreas: d.interestAreas || '',
    conversationHistory: d.conversationHistory || [],
  };
}

export const visitLogStorage = {
  getAll(): VisitLog[] {
    return cache.visitLogs;
  },
  getByDoctorId(doctorId: string): VisitLog[] {
    return cache.visitLogs
      .filter((v) => v.doctorId === doctorId)
      .sort((a, b) => new Date(b.visitDate).getTime() - new Date(a.visitDate).getTime());
  },
  getByHospital(hospital: string, doctors: Doctor[]): VisitLog[] {
    const hospitalDoctorIds = new Set(doctors.filter(d => d.hospital === hospital).map(d => d.id));
    return cache.visitLogs
      .filter((v) => hospitalDoctorIds.has(v.doctorId))
      .sort((a, b) => new Date(b.visitDate).getTime() - new Date(a.visitDate).getTime());
  },
  getRecent(limit = 10): VisitLog[] {
    return [...cache.visitLogs]
      .sort((a, b) => new Date(b.visitDate).getTime() - new Date(a.visitDate).getTime())
      .slice(0, limit);
  },
  save(log: VisitLog): void {
    const idx = cache.visitLogs.findIndex((v) => v.id === log.id);
    if (idx >= 0) {
      cache.visitLogs[idx] = log;
    } else {
      cache.visitLogs.push(log);
    }
    api('/visit-logs', 'POST', {
      id: log.id,
      doctorId: log.doctorId,
      visitDate: log.visitDate,
      rawNotes: log.rawNotes,
      formattedLog: log.formattedLog,
      nextStrategy: log.nextStrategy,
      products: log.products,
    }).catch(console.error);
  },
  delete(id: string): void {
    cache.visitLogs = cache.visitLogs.filter((v) => v.id !== id);
    api(`/visit-logs/${id}`, 'DELETE').catch(console.error);
  },
};

export const snippetStorage = {
  getAll(): GoldenSnippet[] {
    return cache.snippets;
  },
  getByProduct(product: string): GoldenSnippet[] {
    return cache.snippets.filter((s) => s.product === product);
  },
  save(snippet: GoldenSnippet): void {
    const idx = cache.snippets.findIndex((s) => s.id === snippet.id);
    if (idx >= 0) {
      cache.snippets[idx] = snippet;
    } else {
      cache.snippets.push(snippet);
    }
    api('/snippets', 'POST', {
      id: snippet.id,
      content: snippet.content,
      context: snippet.context,
      tags: snippet.tags,
      product: snippet.product,
      effectiveness: snippet.effectiveness,
    }).catch(console.error);
  },
  delete(id: string): void {
    cache.snippets = cache.snippets.filter((s) => s.id !== id);
    api(`/snippets/${id}`, 'DELETE').catch(console.error);
  },
};

export const hospitalStorage = {
  getAll(): HospitalProfile[] {
    return cache.hospitals;
  },
  getById(id: string): HospitalProfile | undefined {
    return cache.hospitals.find((h) => h.id === id);
  },
  getByName(name: string): HospitalProfile | undefined {
    return cache.hospitals.find((h) => h.name === name);
  },
  save(profile: HospitalProfile): void {
    const now = new Date().toISOString();
    const idx = cache.hospitals.findIndex((h) => h.id === profile.id);
    if (idx >= 0) {
      cache.hospitals[idx] = { ...profile, updatedAt: now };
    } else {
      cache.hospitals.push({ ...profile, updatedAt: now });
    }
    api('/hospitals', 'POST', {
      id: profile.id,
      name: profile.name,
      region: profile.region,
      hospitalType: profile.hospitalType,
      characteristics: profile.characteristics,
      keyDepartments: profile.keyDepartments,
      competitorStrength: profile.competitorStrength,
      notes: profile.notes,
    }).catch(console.error);
  },
  delete(id: string): void {
    cache.hospitals = cache.hospitals.filter((h) => h.id !== id);
    api(`/hospitals/${id}`, 'DELETE').catch(console.error);
  },
};

export const departmentStorage = {
  getAll(): DepartmentProfile[] {
    return cache.departments;
  },
  getByHospital(hospitalId: string): DepartmentProfile[] {
    return cache.departments.filter((d) => d.hospitalId === hospitalId);
  },
  getByHospitalAndName(hospitalId: string, departmentName: string): DepartmentProfile | undefined {
    return cache.departments.find((d) => d.hospitalId === hospitalId && d.departmentName === departmentName);
  },
  save(profile: DepartmentProfile): void {
    const now = new Date().toISOString();
    const idx = cache.departments.findIndex((d) => d.id === profile.id);
    if (idx >= 0) {
      cache.departments[idx] = { ...profile, updatedAt: now };
    } else {
      cache.departments.push({ ...profile, updatedAt: now });
    }
    api('/departments', 'POST', {
      id: profile.id,
      hospitalId: profile.hospitalId,
      hospitalName: profile.hospitalName,
      departmentName: profile.departmentName,
      characteristics: profile.characteristics,
      mainProducts: profile.mainProducts,
      competitorProducts: profile.competitorProducts,
      notes: profile.notes,
    }).catch(console.error);
  },
  delete(id: string): void {
    cache.departments = cache.departments.filter((d) => d.id !== id);
    api(`/departments/${id}`, 'DELETE').catch(console.error);
  },
};

export const manualStorage = {
  getAll(): CompanyManual[] {
    return cache.manuals;
  },
  getByCategory(category: CompanyManual['category']): CompanyManual[] {
    return cache.manuals.filter((m) => m.category === category);
  },
  getCombinedText(): string {
    if (cache.manuals.length === 0) return '';
    return cache.manuals.map((m) => `[${m.title}]\n${m.content}`).join('\n\n---\n\n');
  },
  save(manual: CompanyManual): void {
    const now = new Date().toISOString();
    const idx = cache.manuals.findIndex((m) => m.id === manual.id);
    if (idx >= 0) {
      cache.manuals[idx] = { ...manual, updatedAt: now };
    } else {
      cache.manuals.push({ ...manual, updatedAt: now });
    }
    api('/manuals', 'POST', {
      id: manual.id,
      title: manual.title,
      content: manual.content,
      category: manual.category,
    }).catch(console.error);
  },
  delete(id: string): void {
    cache.manuals = cache.manuals.filter((m) => m.id !== id);
    api(`/manuals/${id}`, 'DELETE').catch(console.error);
  },
};

export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export async function exportAllData(): Promise<string> {
  const data = await api('/export', 'POST');
  return JSON.stringify(data, null, 2);
}

export async function importAllData(jsonText: string): Promise<{ success: boolean; error?: string }> {
  try {
    const data = JSON.parse(jsonText);
    await api('/import', 'POST', data);
    await refreshCache();
    return { success: true };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

const DEFAULT_PRODUCT_MANUALS: CompanyManual[] = [
  {
    id: 'default-winuf-001',
    title: '위너프 (Winuf) - 제품 정보',
    category: 'product',
    updatedAt: '2025-04-07T00:00:00.000Z',
    content: `■ 제품명: 위너프페리주 (Winuf Peri Inj.) / 위너프페리주(3C)
■ 성분: 포도당 + 아미노산 + 지질 복합 영양수액 (3챔버 구조)
■ 제형: 정맥주사제 (TPN - Total Parenteral Nutrition)
■ 제조사: JW중외제약 / JW생명과학

【적응증】
경구 또는 위장관 영양공급이 불가능·불충분·제한된 환자에게 수분, 전해질, 아미노산, 칼로리, 필수지방산 및 오메가-3 지방산 보급
- 수술 전후 금식 환자
- 소화기관 기능 저하로 위장관 영양 불가 환자
- 외래·항암 치료 환자
- 간질환·중증 환자

【제품 특징 (영업 강조점)】
- 3세대 3챔버 구조: 포도당/아미노산/지질을 분리 보관 → 사용 시 혼합
- 국내 최초 3챔버 TPN 출시 (2003년)
- 오메가-3 지방산 포함으로 염증 억제 효과
- 다양한 용량(654mL, 1085mL 등) 선택 가능
- 2024년 매출 789억원 (전년비 +2.6% 성장)

【영업 타겟 과】
외과, 소화기내과, 중환자의학과, 종양혈액내과, 간담췌외과

【주의사항】
- 정맥 투여만 가능 (경구/근육 투여 불가)
- 신장·간 기능 저하 환자 용량 조절 필요`,
  },
  {
    id: 'default-winuf-aplus-001',
    title: '위너프에이플러스 (Winuf A+) - 제품 정보',
    category: 'product',
    updatedAt: '2025-04-07T00:00:00.000Z',
    content: `■ 제품명: 위너프에이플러스주 (Winuf A Plus Injection)
■ 성분: 포도당 + 고함량 아미노산 + 지질 복합 영양수액 (3챔버 구조)
■ 제형: 정맥주사제 (TPN - Total Parenteral Nutrition)
■ 제조/판매: JW생명과학(제조) / JW중외제약(영업)
■ 세대: 4세대 TPN (고함량 아미노산 TPN)
■ 출시: 2024년 1월 4일

【3세대(위너프) vs 4세대(위너프에이플러스) 차이】
- 아미노산 함량: 기존 위너프 대비 25% 증가 (1L 기준)
- 포도당 함량: 감소 (중증환자 혈당 관리에 유리)
- 지질 조성: 오메가6:오메가3 비율 2.1:1 동일 유지
- 음성질소균형(negative nitrogen balance) 환자에게 별도 아미노산 보충제 없이 처방 가능

【적응증】
경구 또는 위장관 영양공급이 불가능·불충분한 환자 중 특히:
- 음성질소균형으로 체중 감소가 있는 중증 환자
- 단백질 요구량이 높은 수술 후·외상·화상 환자
- ICU(중환자실) 입원 환자

【임상 근거】
- 국내 최초 고함량 아미노산 TPN 국내 3상 임상 완료 (국내 제약사 최초)
- ASPEN(미국 비경구영양학회) / ESPEN(유럽 임상영양대사학회) 가이드라인 충족
- 음성질소균형 환자 대상 유효성·안전성 확인

【영업 핵심 강조점】
1. 위너프(3세대)의 업그레이드 → 기존 위너프 처방 교수 대상 Up-sell 가능
2. 중증·고단백 요구 환자에게 별도 아미노산 제제 없이 원스톱 처방 → 편의성·경제성
3. 국내 3상 임상 데이터 → 국산 제품 신뢰성
4. 오메가3 유지 → 항염증 효과 그대로

【영업 타겟 과】
중환자의학과(ICU), 외과, 소화기내과, 종양혈액내과, 간담췌외과

【주의사항】
- 중심정맥 투여 (말초정맥용 제형도 있으나 중심정맥 권장)
- 신장·간 기능 저하 환자 용량 조절 필요`,
  },
  {
    id: 'default-ferinject-001',
    title: '페린젝트 (Ferinject) - 제품 정보',
    category: 'product',
    updatedAt: '2025-04-07T00:00:00.000Z',
    content: `■ 제품명: 페린젝트주 (Ferinject Inj.)
■ 성분: 카르복시말토오스수산화제이철착염 (Ferric Carboxymaltose, FCM)
■ 농도: 1mL당 철 50mg
■ 규격: 2mL(100mg Fe), 10mL(500mg Fe), 20mL(1,000mg Fe)
■ 제형: 정맥주사제 (IV)
■ 제조/판매: JW중외제약 (스위스 Vifor Pharma 도입)
■ 건강보험 급여: 2024년 5월 1일부터 적용 (2011년 출시 후 약 13년 만)

【적응증】
경구용 철분제 효과가 불충분하거나 복용이 불가능한 철 결핍 환자
(철 결핍성 빈혈, 수술 전후, 만성신부전, IBD, 산후 빈혈 등)

【투여 방법】
- 최대 1일 투여량: 1,000mg
- 단회 15분 투여 가능 (기존 IV 철 제제 대비 획기적 단축)
- 정맥(IV)으로만 투여 가능 (피하·근육주사 불가)
- 체중·Hb 기준으로 누적 필요량 계산

【제품 핵심 강조점 (영업)】
1. 1회 1,000mg 고용량 단회 투여 가능 → 내원 횟수 감소
2. 15분 이내 빠른 투여 → 외래 효율성
3. 2024년 5월 급여 적용 → 환자 부담 대폭 감소
4. 빠른 Hb 회복 (1~2주 내 유의미한 상승)
5. 아나필락시스 위험 낮음 (시험투여 불필요)
6. Ganzoni 공식 또는 간편법으로 총 필요량 계산

【경쟁 우위】
- 기존 철 덱스트란 대비 안전성 우수
- 1회 고용량 투여 가능한 국내 유일 FCM 제제
- 2024년 급여로 가격 경쟁력 확보

【영업 타겟 과】
산부인과, 소화기내과(IBD), 신장내과, 혈액종양내과, 외과(수술 전처치)`,
  },
];

export async function initDefaultData(): Promise<void> {
  const existing = manualStorage.getAll();
  const existingMap = new Map(existing.map((m) => [m.id, m]));
  let changed = false;

  for (const def of DEFAULT_PRODUCT_MANUALS) {
    const stored = existingMap.get(def.id);
    if (!stored) {
      existingMap.set(def.id, def);
      changed = true;
    } else if (stored.updatedAt < def.updatedAt) {
      existingMap.set(def.id, def);
      changed = true;
    }
  }

  if (changed) {
    const newManuals = Array.from(existingMap.values());
    cache.manuals = newManuals;
    for (const m of DEFAULT_PRODUCT_MANUALS) {
      await api('/manuals', 'POST', {
        id: m.id,
        title: m.title,
        content: m.content,
        category: m.category,
      }).catch(console.error);
    }
  }
}
