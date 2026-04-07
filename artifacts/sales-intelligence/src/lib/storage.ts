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
  createdAt: string;
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

const STORAGE_KEYS = {
  DOCTORS: 'jw_doctors',
  VISIT_LOGS: 'jw_visit_logs',
  GOLDEN_SNIPPETS: 'jw_golden_snippets',
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

function save<T>(key: string, data: T[]): void {
  localStorage.setItem(key, JSON.stringify(data));
}

export const doctorStorage = {
  getAll(): Doctor[] {
    return load<Doctor>(STORAGE_KEYS.DOCTORS);
  },
  getById(id: string): Doctor | undefined {
    return this.getAll().find((d) => d.id === id);
  },
  save(doctor: Doctor): void {
    const all = this.getAll();
    const idx = all.findIndex((d) => d.id === doctor.id);
    if (idx >= 0) {
      all[idx] = { ...doctor, updatedAt: new Date().toISOString() };
    } else {
      all.push(doctor);
    }
    save(STORAGE_KEYS.DOCTORS, all);
  },
  delete(id: string): void {
    const all = this.getAll().filter((d) => d.id !== id);
    save(STORAGE_KEYS.DOCTORS, all);
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
  save(log: VisitLog): void {
    const all = this.getAll();
    const idx = all.findIndex((v) => v.id === log.id);
    if (idx >= 0) {
      all[idx] = log;
    } else {
      all.push(log);
    }
    save(STORAGE_KEYS.VISIT_LOGS, all);
  },
  delete(id: string): void {
    const all = this.getAll().filter((v) => v.id !== id);
    save(STORAGE_KEYS.VISIT_LOGS, all);
  },
};

export const snippetStorage = {
  getAll(): GoldenSnippet[] {
    return load<GoldenSnippet>(STORAGE_KEYS.GOLDEN_SNIPPETS);
  },
  save(snippet: GoldenSnippet): void {
    const all = this.getAll();
    const idx = all.findIndex((s) => s.id === snippet.id);
    if (idx >= 0) {
      all[idx] = snippet;
    } else {
      all.push(snippet);
    }
    save(STORAGE_KEYS.GOLDEN_SNIPPETS, all);
  },
  delete(id: string): void {
    const all = this.getAll().filter((s) => s.id !== id);
    save(STORAGE_KEYS.GOLDEN_SNIPPETS, all);
  },
};

export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}
