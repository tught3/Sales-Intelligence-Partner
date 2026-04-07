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

const STORAGE_KEYS = {
  DOCTORS: 'jw_doctors',
  VISIT_LOGS: 'jw_visit_logs',
  GOLDEN_SNIPPETS: 'jw_golden_snippets',
  HOSPITAL_PROFILES: 'jw_hospital_profiles',
  DEPARTMENT_PROFILES: 'jw_department_profiles',
  COMPANY_MANUALS: 'jw_company_manuals',
};

function load<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    return JSON.parse(raw) as T[];
  } catch {
    return [];
  }
}

function loadOne<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function saveAll<T>(key: string, data: T[]): void {
  localStorage.setItem(key, JSON.stringify(data));
}

export const doctorStorage = {
  getAll(): Doctor[] {
    return load<Doctor>(STORAGE_KEYS.DOCTORS).map((d) => ({
      ...d,
      conversationHistory: d.conversationHistory ?? [],
    }));
  },
  getById(id: string): Doctor | undefined {
    return this.getAll().find((d) => d.id === id);
  },
  addConversationRecord(doctorId: string, record: ConversationRecord): void {
    const all = this.getAll();
    const idx = all.findIndex((d) => d.id === doctorId);
    if (idx < 0) return;
    all[idx].conversationHistory = [record, ...(all[idx].conversationHistory ?? [])];
    all[idx].updatedAt = new Date().toISOString();
    saveAll(STORAGE_KEYS.DOCTORS, all);
  },
  deleteConversationRecord(doctorId: string, recordId: string): void {
    const all = this.getAll();
    const idx = all.findIndex((d) => d.id === doctorId);
    if (idx < 0) return;
    all[idx].conversationHistory = (all[idx].conversationHistory ?? []).filter((r) => r.id !== recordId);
    all[idx].updatedAt = new Date().toISOString();
    saveAll(STORAGE_KEYS.DOCTORS, all);
  },
  getByHospital(hospital: string): Doctor[] {
    return this.getAll().filter((d) => d.hospital === hospital);
  },
  getByDepartment(hospital: string, department: string): Doctor[] {
    return this.getAll().filter((d) => d.hospital === hospital && d.department === department);
  },
  save(doctor: Doctor): void {
    const all = this.getAll();
    const idx = all.findIndex((d) => d.id === doctor.id);
    if (idx >= 0) {
      all[idx] = { ...doctor, updatedAt: new Date().toISOString() };
    } else {
      all.push(doctor);
    }
    saveAll(STORAGE_KEYS.DOCTORS, all);
  },
  delete(id: string): void {
    const all = this.getAll().filter((d) => d.id !== id);
    saveAll(STORAGE_KEYS.DOCTORS, all);
  },
};

export const visitLogStorage = {
  getAll(): VisitLog[] {
    return load<VisitLog>(STORAGE_KEYS.VISIT_LOGS);
  },
  getByDoctorId(doctorId: string): VisitLog[] {
    return this.getAll()
      .filter((v) => v.doctorId === doctorId)
      .sort((a, b) => new Date(b.visitDate).getTime() - new Date(a.visitDate).getTime());
  },
  getByHospital(hospital: string, doctors: Doctor[]): VisitLog[] {
    const hospitalDoctorIds = new Set(doctors.filter(d => d.hospital === hospital).map(d => d.id));
    return this.getAll()
      .filter((v) => hospitalDoctorIds.has(v.doctorId))
      .sort((a, b) => new Date(b.visitDate).getTime() - new Date(a.visitDate).getTime());
  },
  getRecent(limit = 10): VisitLog[] {
    return this.getAll()
      .sort((a, b) => new Date(b.visitDate).getTime() - new Date(a.visitDate).getTime())
      .slice(0, limit);
  },
  save(log: VisitLog): void {
    const all = this.getAll();
    const idx = all.findIndex((v) => v.id === log.id);
    if (idx >= 0) {
      all[idx] = log;
    } else {
      all.push(log);
    }
    saveAll(STORAGE_KEYS.VISIT_LOGS, all);
  },
  delete(id: string): void {
    const all = this.getAll().filter((v) => v.id !== id);
    saveAll(STORAGE_KEYS.VISIT_LOGS, all);
  },
};

export const snippetStorage = {
  getAll(): GoldenSnippet[] {
    return load<GoldenSnippet>(STORAGE_KEYS.GOLDEN_SNIPPETS);
  },
  getByProduct(product: string): GoldenSnippet[] {
    return this.getAll().filter((s) => s.product === product);
  },
  save(snippet: GoldenSnippet): void {
    const all = this.getAll();
    const idx = all.findIndex((s) => s.id === snippet.id);
    if (idx >= 0) {
      all[idx] = snippet;
    } else {
      all.push(snippet);
    }
    saveAll(STORAGE_KEYS.GOLDEN_SNIPPETS, all);
  },
  delete(id: string): void {
    const all = this.getAll().filter((s) => s.id !== id);
    saveAll(STORAGE_KEYS.GOLDEN_SNIPPETS, all);
  },
};

export const hospitalStorage = {
  getAll(): HospitalProfile[] {
    return load<HospitalProfile>(STORAGE_KEYS.HOSPITAL_PROFILES);
  },
  getById(id: string): HospitalProfile | undefined {
    return this.getAll().find((h) => h.id === id);
  },
  getByName(name: string): HospitalProfile | undefined {
    return this.getAll().find((h) => h.name === name);
  },
  save(profile: HospitalProfile): void {
    const all = this.getAll();
    const idx = all.findIndex((h) => h.id === profile.id);
    if (idx >= 0) {
      all[idx] = { ...profile, updatedAt: new Date().toISOString() };
    } else {
      all.push(profile);
    }
    saveAll(STORAGE_KEYS.HOSPITAL_PROFILES, all);
  },
  delete(id: string): void {
    const all = this.getAll().filter((h) => h.id !== id);
    saveAll(STORAGE_KEYS.HOSPITAL_PROFILES, all);
  },
};

export const departmentStorage = {
  getAll(): DepartmentProfile[] {
    return load<DepartmentProfile>(STORAGE_KEYS.DEPARTMENT_PROFILES);
  },
  getByHospital(hospitalId: string): DepartmentProfile[] {
    return this.getAll().filter((d) => d.hospitalId === hospitalId);
  },
  getByHospitalAndName(hospitalId: string, departmentName: string): DepartmentProfile | undefined {
    return this.getAll().find((d) => d.hospitalId === hospitalId && d.departmentName === departmentName);
  },
  save(profile: DepartmentProfile): void {
    const all = this.getAll();
    const idx = all.findIndex((d) => d.id === profile.id);
    if (idx >= 0) {
      all[idx] = { ...profile, updatedAt: new Date().toISOString() };
    } else {
      all.push(profile);
    }
    saveAll(STORAGE_KEYS.DEPARTMENT_PROFILES, all);
  },
  delete(id: string): void {
    const all = this.getAll().filter((d) => d.id !== id);
    saveAll(STORAGE_KEYS.DEPARTMENT_PROFILES, all);
  },
};

export const manualStorage = {
  getAll(): CompanyManual[] {
    return load<CompanyManual>(STORAGE_KEYS.COMPANY_MANUALS);
  },
  getByCategory(category: CompanyManual['category']): CompanyManual[] {
    return this.getAll().filter((m) => m.category === category);
  },
  getCombinedText(): string {
    const all = this.getAll();
    if (all.length === 0) return '';
    return all.map((m) => `[${m.title}]\n${m.content}`).join('\n\n---\n\n');
  },
  save(manual: CompanyManual): void {
    const all = this.getAll();
    const idx = all.findIndex((m) => m.id === manual.id);
    if (idx >= 0) {
      all[idx] = { ...manual, updatedAt: new Date().toISOString() };
    } else {
      all.push(manual);
    }
    saveAll(STORAGE_KEYS.COMPANY_MANUALS, all);
  },
  delete(id: string): void {
    const all = this.getAll().filter((m) => m.id !== id);
    saveAll(STORAGE_KEYS.COMPANY_MANUALS, all);
  },
};

export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function exportAllData(): string {
  const data = {
    doctors: doctorStorage.getAll(),
    visitLogs: visitLogStorage.getAll(),
    snippets: snippetStorage.getAll(),
    hospitals: hospitalStorage.getAll(),
    departments: departmentStorage.getAll(),
    manuals: manualStorage.getAll(),
    exportedAt: new Date().toISOString(),
  };
  return JSON.stringify(data, null, 2);
}

export function importAllData(jsonText: string): { success: boolean; error?: string } {
  try {
    const data = JSON.parse(jsonText);
    if (data.doctors) saveAll(STORAGE_KEYS.DOCTORS, data.doctors);
    if (data.visitLogs) saveAll(STORAGE_KEYS.VISIT_LOGS, data.visitLogs);
    if (data.snippets) saveAll(STORAGE_KEYS.GOLDEN_SNIPPETS, data.snippets);
    if (data.hospitals) saveAll(STORAGE_KEYS.HOSPITAL_PROFILES, data.hospitals);
    if (data.departments) saveAll(STORAGE_KEYS.DEPARTMENT_PROFILES, data.departments);
    if (data.manuals) saveAll(STORAGE_KEYS.COMPANY_MANUALS, data.manuals);
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

export function initDefaultData(): void {
  const existing = manualStorage.getAll();
  const hasDefault = existing.some((m) => m.id.startsWith('default-'));
  if (!hasDefault) {
    const all = [...existing, ...DEFAULT_PRODUCT_MANUALS];
    saveAll(STORAGE_KEYS.COMPANY_MANUALS, all);
  }
}
