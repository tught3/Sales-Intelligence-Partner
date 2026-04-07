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
