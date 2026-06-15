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
  aiEditHint?: string; // 사용자가 AI 생성 일지를 수정한 패턴 기록
}

export type VisitLogFeedbackEventType = 'edit' | 'delete' | 'regenerate';

export interface VisitLogFeedbackEvent {
  id: string;
  eventType: VisitLogFeedbackEventType;
  visitLogId: string;
  doctorId: string;
  doctorName: string;
  hospital: string;
  department: string;
  products: string[];
  rawNotes: string;
  originalFormattedLog: string;
  originalNextStrategy: string;
  editedFormattedLog: string;
  editedNextStrategy: string;
  diffSummary: string;
  createdAt: string;
}

export type PreferenceScope = 'global' | 'department' | 'doctor' | 'product';

export interface AiGenerationPreference {
  id: string;
  scope: PreferenceScope;
  scopeKey: string;
  forbiddenPatterns: string[];
  preferredPatterns: string[];
  avoidedPatientGroups: string[];
  preferredDetailAxes: string[];
  preferredTone: string;
  averageLength: number;
  confidence: number;
  summary: string;
  updatedAt: string;
}

export interface ExternalCasePattern {
  id: string;
  department: string;
  product: string;
  patientGroup: string;
  detailAxis: string;
  reactionPattern: string;
  nextAction: string;
  sourceSummary: string;
  styleExampleMemo: string;
  confidence: number;
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

export interface GoldenSnippet {
  id: string;
  content: string;
  context: string;
  tags: string[];
  product: string;
  effectiveness: number;
  analysis?: string;
  analyzedAt?: string;
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

export type SaveOutcome = {
  saved: true;
  duplicate?: false;
} | {
  saved: false;
  duplicate: true;
  message: string;
};

export const API_BASE = import.meta.env.VITE_API_SERVER_URL ||
  (import.meta.env.DEV ? 'http://localhost:4201' : '');

const LOCAL_CACHE_KEY = 'jw_sales_intelligence_backup_v1';

const cache: {
  doctors: Doctor[];
  visitLogs: VisitLog[];
  feedbackEvents: VisitLogFeedbackEvent[];
  preferences: AiGenerationPreference[];
  externalCasePatterns: ExternalCasePattern[];
  snippets: GoldenSnippet[];
  manuals: CompanyManual[];
  loaded: boolean;
} = {
  doctors: [],
  visitLogs: [],
  feedbackEvents: [],
  preferences: [],
  externalCasePatterns: [],
  snippets: [],
  manuals: [],
  loaded: false,
};

function serializeCache() {
  return {
    doctors: cache.doctors,
    visitLogs: cache.visitLogs,
    feedbackEvents: cache.feedbackEvents,
    preferences: cache.preferences,
    externalCasePatterns: cache.externalCasePatterns,
    snippets: cache.snippets,
    manuals: cache.manuals,
    savedAt: new Date().toISOString(),
  };
}

function persistLocalCache(): void {
  try {
    window.localStorage.setItem(LOCAL_CACHE_KEY, JSON.stringify(serializeCache()));
  } catch (e) {
    console.error('Failed to persist local data backup:', e);
  }
}

function loadLocalCache(): boolean {
  try {
    const raw = window.localStorage.getItem(LOCAL_CACHE_KEY);
    if (!raw) return false;
    const data = JSON.parse(raw);
    cache.doctors = (data.doctors || []).map(normalizeDoctor);
    cache.visitLogs = (data.visitLogs || []).map(normalizeVisitLog);
    cache.feedbackEvents = (data.feedbackEvents || data.visitLogFeedbackEvents || []).map(normalizeFeedbackEvent);
    cache.preferences = (data.preferences || data.aiGenerationPreferences || []).map(normalizePreference);
    cache.externalCasePatterns = (data.externalCasePatterns || data.external_case_patterns || []).map(normalizeExternalCasePattern);
    cache.snippets = (data.snippets || []).map(normalizeSnippet);
    cache.manuals = (data.manuals || []).map(normalizeManual);
    return true;
  } catch (e) {
    console.error('Failed to load local data backup:', e);
    return false;
  }
}

export function hydrateLocalCache(): boolean {
  if (cache.loaded) return true;
  const restored = loadLocalCache();
  if (restored) {
    cache.loaded = true;
  }
  return restored;
}

async function api(path: string, method = 'GET', body?: any) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 12000);
  try {
    const opts: RequestInit = { method, headers: { 'Content-Type': 'application/json' }, signal: controller.signal };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(`${API_BASE}/api/data${path}`, opts);
    if (!res.ok) throw new Error(`API error: ${res.status}`);
    return res.json();
  } finally {
    window.clearTimeout(timeout);
  }
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

function toVisitDate(v: any): string {
  try {
    return toISOStr(v).split('T')[0];
  } catch {
    return new Date().toISOString().split('T')[0];
  }
}

function normalizeDuplicateText(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

function normalizeDuplicateArray(values: string[]): string {
  return values.map((value) => normalizeDuplicateText(value)).filter(Boolean).sort().join('|');
}

function normalizeSimilarityText(value: string): string {
  return normalizeDuplicateText(value).toLowerCase();
}

function levenshteinSimilarity(left: string, right: string): number {
  const a = normalizeSimilarityText(left);
  const b = normalizeSimilarityText(right);

  if (a === b) return 1;
  if (!a && !b) return 1;
  if (!a || !b) return 0;

  const prev = new Array(b.length + 1);
  const curr = new Array(b.length + 1);

  for (let j = 0; j <= b.length; j++) {
    prev[j] = j;
  }

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    const aChar = a.charCodeAt(i - 1);
    for (let j = 1; j <= b.length; j++) {
      const cost = aChar === b.charCodeAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(
        prev[j] + 1,
        curr[j - 1] + 1,
        prev[j - 1] + cost,
      );
    }
    for (let j = 0; j <= b.length; j++) {
      prev[j] = curr[j];
    }
  }

  const distance = prev[b.length];
  const maxLen = Math.max(a.length, b.length);
  return maxLen === 0 ? 1 : Math.max(0, 1 - (distance / maxLen));
}

function isSimilarText(left: string, right: string, threshold = 0.8): boolean {
  if (normalizeSimilarityText(left) === normalizeSimilarityText(right)) return true;
  return levenshteinSimilarity(left, right) >= threshold;
}

function sameVisitLogSignature(a: VisitLog, b: VisitLog): boolean {
  return (
    a.doctorId === b.doctorId &&
    a.visitDate === b.visitDate &&
    normalizeDuplicateText(a.rawNotes) === normalizeDuplicateText(b.rawNotes) &&
    normalizeDuplicateText(a.formattedLog) === normalizeDuplicateText(b.formattedLog) &&
    normalizeDuplicateText(a.nextStrategy) === normalizeDuplicateText(b.nextStrategy) &&
    normalizeDuplicateArray(a.products ?? []) === normalizeDuplicateArray(b.products ?? [])
  );
}

function hasDuplicateConversationRecord(records: ConversationRecord[]): boolean {
  for (let i = 0; i < records.length; i++) {
    for (let j = i + 1; j < records.length; j++) {
      if (sameConversationRecordSignature(records[i], records[j])) return true;
    }
  }
  return false;
}

function sameConversationRecordSignature(a: ConversationRecord, b: ConversationRecord): boolean {
  const left = `${a.rawText}\n${a.period}`;
  const right = `${b.rawText}\n${b.period}`;
  return isSimilarText(left, right);
}

function hasDuplicateVisitLog(logs: VisitLog[]): boolean {
  for (let i = 0; i < logs.length; i++) {
    for (let j = i + 1; j < logs.length; j++) {
      if (sameVisitLogSimilarity(logs[i], logs[j])) return true;
    }
  }
  return false;
}

function sameVisitLogSimilarity(a: VisitLog, b: VisitLog): boolean {
  if (a.doctorId !== b.doctorId || a.visitDate !== b.visitDate) return false;
  const left = [a.rawNotes, a.formattedLog, a.nextStrategy, ...(a.products ?? [])].join('\n');
  const right = [b.rawNotes, b.formattedLog, b.nextStrategy, ...(b.products ?? [])].join('\n');
  return isSimilarText(left, right);
}

function compareVisitLogsDesc(a: VisitLog, b: VisitLog): number {
  const createdDiff = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  if (createdDiff !== 0) return createdDiff;
  const visitDiff = new Date(b.visitDate).getTime() - new Date(a.visitDate).getTime();
  if (visitDiff !== 0) return visitDiff;
  return b.id.localeCompare(a.id, 'ko');
}

function countVisitsInConversationRecord(record: ConversationRecord): number {
  const periodMatch = record.period.match(/(\d+)\s*회\s*방문/);
  if (periodMatch) {
    const parsed = Number(periodMatch[1]);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }

  const rawText = record.rawText || '';
  const visitMarkers = rawText.match(/^\s*\[방문\s*\d+\]/gm);
  if (visitMarkers && visitMarkers.length > 0) return visitMarkers.length;

  return 1;
}

export function getConversationHistoryVisitCount(doctor: Doctor | undefined): number {
  if (!doctor) return 0;
  return (doctor.conversationHistory ?? []).reduce((total, record) => total + countVisitsInConversationRecord(record), 0);
}

function normalizeVisitLog(v: any): VisitLog {
  return {
    ...v,
    doctorId: v.doctorId ?? v.doctor_id ?? '',
    visitDate: v.visitDate ?? v.visit_date ?? '',
    rawNotes: v.rawNotes ?? v.raw_notes ?? '',
    formattedLog: v.formattedLog ?? v.formatted_log ?? '',
    nextStrategy: v.nextStrategy ?? v.next_strategy ?? '',
    aiEditHint: v.aiEditHint ?? v.ai_edit_hint ?? '',
    products: v.products ?? [],
    createdAt: toISOStr(v.createdAt ?? v.created_at),
  };
}

function normalizeFeedbackEvent(v: any): VisitLogFeedbackEvent {
  return {
    id: v.id,
    eventType: v.eventType ?? v.event_type ?? 'edit',
    visitLogId: v.visitLogId ?? v.visit_log_id ?? '',
    doctorId: v.doctorId ?? v.doctor_id ?? '',
    doctorName: v.doctorName ?? v.doctor_name ?? '',
    hospital: v.hospital ?? '',
    department: v.department ?? '',
    products: v.products ?? [],
    rawNotes: v.rawNotes ?? v.raw_notes ?? '',
    originalFormattedLog: v.originalFormattedLog ?? v.original_formatted_log ?? '',
    originalNextStrategy: v.originalNextStrategy ?? v.original_next_strategy ?? '',
    editedFormattedLog: v.editedFormattedLog ?? v.edited_formatted_log ?? '',
    editedNextStrategy: v.editedNextStrategy ?? v.edited_next_strategy ?? '',
    diffSummary: v.diffSummary ?? v.diff_summary ?? '',
    createdAt: toISOStr(v.createdAt ?? v.created_at),
  };
}

function normalizePreference(v: any): AiGenerationPreference {
  return {
    id: v.id,
    scope: v.scope ?? 'global',
    scopeKey: v.scopeKey ?? v.scope_key ?? '',
    forbiddenPatterns: v.forbiddenPatterns ?? v.forbidden_patterns ?? [],
    preferredPatterns: v.preferredPatterns ?? v.preferred_patterns ?? [],
    avoidedPatientGroups: v.avoidedPatientGroups ?? v.avoided_patient_groups ?? [],
    preferredDetailAxes: v.preferredDetailAxes ?? v.preferred_detail_axes ?? [],
    preferredTone: v.preferredTone ?? v.preferred_tone ?? '',
    averageLength: Number(v.averageLength ?? v.average_length ?? 0) || 0,
    confidence: Number(v.confidence ?? 0) || 0,
    summary: v.summary ?? '',
    updatedAt: toISOStr(v.updatedAt ?? v.updated_at),
  };
}

function normalizeExternalCasePattern(v: any): ExternalCasePattern {
  return {
    id: v.id,
    department: v.department ?? '',
    product: normalizeSnippetProduct(v.product ?? ''),
    patientGroup: v.patientGroup ?? v.patient_group ?? '',
    detailAxis: v.detailAxis ?? v.detail_axis ?? '',
    reactionPattern: v.reactionPattern ?? v.reaction_pattern ?? '',
    nextAction: v.nextAction ?? v.next_action ?? '',
    sourceSummary: v.sourceSummary ?? v.source_summary ?? '',
    styleExampleMemo: v.styleExampleMemo ?? v.style_example_memo ?? '',
    confidence: Math.max(0, Math.min(100, Number(v.confidence ?? 60) || 60)),
    createdAt: toISOStr(v.createdAt ?? v.created_at),
  };
}

function generateClientId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizePatternText(value: string): string {
  return value
    .replace(/경구\s*철분제|경구용\s*철분제제+/g, '경구용철분제')
    .replace(/더딘|늦는|불충분|부족한|반응\s*부족/g, '반응 부족')
    .replace(/\s+/g, ' ')
    .trim();
}

function chunksForLearning(value: string): string[] {
  return normalizePatternText(value)
    .split(/(?:[.!?。]\s*|,\s*|\n)+/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 8)
    .slice(0, 8);
}

function uniqueList(values: string[], limit = 12): string[] {
  const result: string[] = [];
  for (const value of values.map(normalizePatternText).filter(Boolean)) {
    if (result.some((existing) => isSimilarText(existing, value, 0.72))) continue;
    result.push(value);
    if (result.length >= limit) break;
  }
  return result;
}

function preferenceId(scope: PreferenceScope, scopeKey: string): string {
  return `${scope}:${scopeKey || 'global'}`;
}

function doctorForLog(log: Pick<VisitLog, 'doctorId'>): Doctor | undefined {
  return cache.doctors.find((doctor) => doctor.id === log.doctorId);
}

function mergePreferences(primary: AiGenerationPreference[], fallback: AiGenerationPreference[]): AiGenerationPreference[] {
  const byId = new Map<string, AiGenerationPreference>();
  for (const pref of fallback) byId.set(pref.id, pref);
  for (const pref of primary) byId.set(pref.id, pref);
  return [...byId.values()];
}

function buildPreference(scope: PreferenceScope, scopeKey: string, events: VisitLogFeedbackEvent[]): AiGenerationPreference {
  const deletedChunks = events.flatMap((event) => {
    if (event.eventType === 'delete') {
      return chunksForLearning(`${event.originalFormattedLog} ${event.originalNextStrategy}`);
    }
    return chunksForLearning(event.diffSummary)
      .filter((part) => part.includes('삭제'))
      .concat(chunksForLearning(event.originalFormattedLog).filter((part) => !event.editedFormattedLog.includes(part.slice(0, 8))));
  });
  const addedChunks = events.flatMap((event) =>
    chunksForLearning(event.diffSummary)
      .filter((part) => part.includes('추가'))
      .concat(chunksForLearning(event.editedFormattedLog).filter((part) => !event.originalFormattedLog.includes(part.slice(0, 8))))
  );
  const editedLengths = events
    .filter((event) => event.editedFormattedLog.trim())
    .map((event) => event.editedFormattedLog.length);
  const averageLength = editedLengths.length
    ? Math.round(editedLengths.reduce((sum, value) => sum + value, 0) / editedLengths.length)
    : 0;
  const forbiddenPatterns = uniqueList(deletedChunks);
  const preferredPatterns = uniqueList(addedChunks);
  const preferredDetailAxes = uniqueList(
    preferredPatterns.filter((text) => /페린젝트|위너프에이플러스|Hb|급여|경구용철분제|아미노산|포도당|수혈|영양/.test(text)),
    8
  );
  const avoidedPatientGroups = uniqueList(
    forbiddenPatterns.filter((text) => /환자|케이스|분만|산후|IBD|출혈|빈혈|수술/.test(text)),
    8
  );
  const preferredTone = preferredPatterns.some((text) => /보임|하심|의견|반응/.test(text))
    ? '사용자가 추가한 교수 반응 표현을 우선하고, 원문 사실을 바꾸지 않음'
    : '원문 사실을 보존하고 메모체로 자연스럽게 정리';

  return {
    id: preferenceId(scope, scopeKey),
    scope,
    scopeKey,
    forbiddenPatterns,
    preferredPatterns,
    avoidedPatientGroups,
    preferredDetailAxes,
    preferredTone,
    averageLength,
    confidence: Math.min(100, events.length * 20),
    summary: `수정/삭제 이벤트 ${events.length}건 반영. 금지 ${forbiddenPatterns.length}개, 선호 ${preferredPatterns.length}개.`,
    updatedAt: new Date().toISOString(),
  };
}

function rebuildPreferencesFromEvents(): AiGenerationPreference[] {
  const events = cache.feedbackEvents;
  if (events.length === 0) return buildPreferencesFromExistingHints();
  const groups: Array<{ scope: PreferenceScope; key: string; events: VisitLogFeedbackEvent[] }> = [
    { scope: 'global', key: '', events },
  ];
  for (const department of uniqueList(events.map((event) => event.department).filter(Boolean), 100)) {
    groups.push({ scope: 'department', key: department, events: events.filter((event) => event.department === department) });
  }
  for (const doctorId of uniqueList(events.map((event) => event.doctorId).filter(Boolean), 200)) {
    groups.push({ scope: 'doctor', key: doctorId, events: events.filter((event) => event.doctorId === doctorId) });
  }
  for (const product of uniqueList(events.flatMap((event) => event.products ?? []), 50)) {
    groups.push({ scope: 'product', key: product, events: events.filter((event) => event.products?.includes(product)) });
  }
  return groups
    .filter((group) => group.events.length > 0)
    .map((group) => buildPreference(group.scope, group.key, group.events));
}

function buildPreferencesFromExistingHints(): AiGenerationPreference[] {
  const hintEvents = cache.visitLogs
    .filter((log) => log.aiEditHint?.trim())
    .map((log): VisitLogFeedbackEvent => {
      const doctor = doctorForLog(log);
      return {
        id: `hint-${log.id}`,
        eventType: 'edit',
        visitLogId: log.id,
        doctorId: log.doctorId,
        doctorName: doctor?.name ?? '',
        hospital: doctor?.hospital ?? '',
        department: doctor?.department ?? '',
        products: log.products ?? [],
        rawNotes: log.rawNotes,
        originalFormattedLog: '',
        originalNextStrategy: '',
        editedFormattedLog: log.formattedLog,
        editedNextStrategy: log.nextStrategy,
        diffSummary: log.aiEditHint ?? '',
        createdAt: log.createdAt,
      };
    });
  if (hintEvents.length === 0) return [];
  return [buildPreference('global', '', hintEvents)];
}

function syncPreferencesToServer(): void {
  for (const pref of cache.preferences) {
    api('/ai-generation-preferences', 'POST', pref).catch(console.error);
  }
}

function conversationRecordToVisitLog(doctor: Doctor, record: ConversationRecord): VisitLog {
  return {
    id: `migrated-${record.id}`,
    doctorId: doctor.id,
    visitDate: toVisitDate(record.createdAt),
    rawNotes: record.rawText || '',
    formattedLog: record.aiAnalysis || record.rawText || '',
    nextStrategy: record.nextSuggestions || '',
    products: [],
    createdAt: toISOStr(record.createdAt),
  };
}

function normalizeSnippet(s: any): GoldenSnippet {
  return {
    ...s,
    product: normalizeSnippetProduct(s.product ?? ''),
    tags: s.tags ?? [],
    analysis: s.analysis ?? '',
    analyzedAt: s.analyzedAt || s.analyzed_at ? toISOStr(s.analyzedAt ?? s.analyzed_at) : undefined,
    createdAt: toISOStr(s.createdAt ?? s.created_at),
  };
}

function normalizeSnippetProduct(product: string): string {
  const compact = product.replace(/\s+/g, '').trim();
  if (!compact) return '';
  if (compact.includes('위너프에이플러스')) return '위너프에이플러스';
  if (compact.includes('위너프')) return '위너프';
  return product.trim();
}

function normalizeManual(m: any): CompanyManual {
  return {
    ...m,
    updatedAt: toISOStr(m.updatedAt ?? m.updated_at),
  };
}

async function migrateConversationHistoryToVisitLogs(): Promise<void> {
  const migrated: VisitLog[] = [];

  for (const doctor of cache.doctors) {
    const conversationLogs = (doctor.conversationHistory ?? [])
      .map((record) => conversationRecordToVisitLog(doctor, record))
      .filter((log) => log.formattedLog.trim().length > 0);

    for (const log of conversationLogs) {
      if (cache.visitLogs.some((existing) => existing.id === log.id)) continue;
      if (hasDuplicateVisitLog([...cache.visitLogs, ...migrated, log])) continue;
      migrated.push(log);
    }
  }

  if (migrated.length === 0) return;

  const results = await Promise.allSettled(
    migrated.map((log) =>
      api('/visit-logs', 'POST', {
        id: log.id,
        doctorId: log.doctorId,
        visitDate: log.visitDate,
        rawNotes: log.rawNotes,
        formattedLog: log.formattedLog,
        nextStrategy: log.nextStrategy,
        products: log.products,
      }).then(() => log)
    )
  );

  const persistedLogs = results
    .filter((result): result is PromiseFulfilledResult<VisitLog> => result.status === 'fulfilled')
    .map((result) => result.value);

  if (persistedLogs.length > 0) {
    cache.visitLogs.push(...persistedLogs);
  }

  const rejected = results.filter((result): result is PromiseRejectedResult => result.status === 'rejected');
  if (rejected.length > 0) {
    console.error('Some conversation-history visit log migrations failed:', rejected.map((r) => r.reason));
  }
}

export async function initStorage(): Promise<void> {
  const hadLocalCache = hydrateLocalCache();
  try {
    const [docs, logs, feedback, prefs, externalCases, snips, mans] = await Promise.all([
      api('/doctors'),
      api('/visit-logs'),
      api('/visit-log-feedback-events').catch(() => []),
      api('/ai-generation-preferences').catch(() => []),
      api('/external-case-patterns').catch(() => []),
      api('/snippets'),
      api('/manuals'),
    ]);
    cache.doctors = (docs || []).map(normalizeDoctor);
    cache.visitLogs = (logs || []).map(normalizeVisitLog);
    cache.feedbackEvents = (feedback || []).map(normalizeFeedbackEvent);
    cache.preferences = mergePreferences((prefs || []).map(normalizePreference), rebuildPreferencesFromEvents());
    cache.externalCasePatterns = (externalCases || []).map(normalizeExternalCasePattern);
    cache.snippets = (snips || []).map(normalizeSnippet);
    cache.manuals = (mans || []).map(normalizeManual);
    await migrateConversationHistoryToVisitLogs();
    cache.loaded = true;
    persistLocalCache();
  } catch (e) {
    console.error(
      hadLocalCache
        ? 'Failed to load data from server, restored local backup:'
        : 'Failed to load data from server, falling back to empty state:',
      e
    );
    cache.loaded = true;
  }
}

export async function refreshCache(): Promise<void> {
  cache.loaded = false;
  await initStorage();
}

export const doctorStorage = {
  getAll(): Doctor[] {
    return [...cache.doctors];
  },
  getById(id: string): Doctor | undefined {
    return cache.doctors.find((d) => d.id === id);
  },
  addConversationRecord(doctorId: string, record: ConversationRecord): SaveOutcome {
    const idx = cache.doctors.findIndex((d) => d.id === doctorId);
    if (idx < 0) return { saved: false, duplicate: true, message: '중복된 내용입니다.' };

    const doctor = cache.doctors[idx];
    const conversationHistory = doctor.conversationHistory ?? [];
    const nextHistory = [record, ...conversationHistory];
    if (hasDuplicateConversationRecord(nextHistory)) {
      return { saved: false, duplicate: true, message: '중복된 내용입니다.' };
    }
    if (conversationHistory.some((existing) => sameConversationRecordSignature(existing, record))) {
      return { saved: false, duplicate: true, message: '중복된 내용입니다.' };
    }

    const migratedLog = conversationRecordToVisitLog(doctor, record);
    if (cache.visitLogs.some((existing) => sameVisitLogSignature(existing, migratedLog))) {
      return { saved: false, duplicate: true, message: '중복된 내용입니다.' };
    }

    cache.doctors[idx].conversationHistory = [record, ...conversationHistory];
    cache.doctors[idx].updatedAt = new Date().toISOString();
    const visitSave = visitLogStorage.save(migratedLog);
    if (visitSave.duplicate) {
      cache.doctors[idx].conversationHistory = conversationHistory;
      persistLocalCache();
      return { saved: false, duplicate: true, message: visitSave.message };
    }
    persistLocalCache();
    api('/doctors', 'POST', doctorToApi(cache.doctors[idx])).catch(console.error);
    return { saved: true };
  },
  deleteConversationRecord(doctorId: string, recordId: string): void {
    const idx = cache.doctors.findIndex((d) => d.id === doctorId);
    if (idx < 0) return;
    cache.doctors[idx].conversationHistory = (cache.doctors[idx].conversationHistory ?? []).filter((r) => r.id !== recordId);
    cache.doctors[idx].updatedAt = new Date().toISOString();
    visitLogStorage.delete(`migrated-${recordId}`);
    persistLocalCache();
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
    persistLocalCache();
    api('/doctors', 'POST', doctorToApi(doctor)).catch(console.error);
  },
  delete(id: string): void {
    cache.doctors = cache.doctors.filter((d) => d.id !== id);
    persistLocalCache();
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
    return [...cache.visitLogs].sort(compareVisitLogsDesc);
  },
  getByDoctorId(doctorId: string): VisitLog[] {
    return cache.visitLogs
      .filter((v) => v.doctorId === doctorId)
      .sort(compareVisitLogsDesc);
  },
  getByHospital(hospital: string, doctors: Doctor[]): VisitLog[] {
    const hospitalDoctorIds = new Set(doctors.filter(d => d.hospital === hospital).map(d => d.id));
    return cache.visitLogs
      .filter((v) => hospitalDoctorIds.has(v.doctorId))
      .sort(compareVisitLogsDesc);
  },
  getRecent(limit = 10): VisitLog[] {
    return [...cache.visitLogs]
      .sort(compareVisitLogsDesc)
      .slice(0, limit);
  },
  save(log: VisitLog): SaveOutcome {
    const idx = cache.visitLogs.findIndex((v) => v.id === log.id);
    const duplicate = cache.visitLogs.find((existing) => existing.id !== log.id && sameVisitLogSignature(existing, log));
    if (duplicate) {
      return { saved: false, duplicate: true, message: '중복된 내용입니다.' };
    }
    const fuzzyDuplicate = cache.visitLogs.find((existing) => existing.id !== log.id && sameVisitLogSimilarity(existing, log));
    if (fuzzyDuplicate) {
      return { saved: false, duplicate: true, message: '중복된 내용입니다.' };
    }
    if (idx >= 0) {
      cache.visitLogs[idx] = log;
    } else {
      cache.visitLogs.push(log);
    }
    persistLocalCache();
    api('/visit-logs', 'POST', {
      id: log.id,
      doctorId: log.doctorId,
      visitDate: log.visitDate,
      rawNotes: log.rawNotes,
      formattedLog: log.formattedLog,
      nextStrategy: log.nextStrategy,
      aiEditHint: log.aiEditHint ?? '',
      products: log.products,
    }).catch(console.error);
    return { saved: true };
  },
  delete(id: string): void {
    cache.visitLogs = cache.visitLogs.filter((v) => v.id !== id);
    persistLocalCache();
    api(`/visit-logs/${id}`, 'DELETE').catch(console.error);
  },
};

export const feedbackStorage = {
  getAll(): VisitLogFeedbackEvent[] {
    return [...cache.feedbackEvents].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  },
  record(event: Omit<VisitLogFeedbackEvent, 'id' | 'createdAt'> & { id?: string; createdAt?: string }): VisitLogFeedbackEvent {
    const row: VisitLogFeedbackEvent = {
      ...event,
      id: event.id ?? generateClientId('feedback'),
      createdAt: event.createdAt ?? new Date().toISOString(),
    };
    const idx = cache.feedbackEvents.findIndex((item) => item.id === row.id);
    if (idx >= 0) cache.feedbackEvents[idx] = row;
    else cache.feedbackEvents.push(row);
    cache.preferences = rebuildPreferencesFromEvents();
    persistLocalCache();
    api('/visit-log-feedback-events', 'POST', row).catch(console.error);
    syncPreferencesToServer();
    return row;
  },
};

export const preferenceStorage = {
  getAll(): AiGenerationPreference[] {
    return [...cache.preferences];
  },
  getForGeneration(doctor: Doctor, products: string[] = []): AiGenerationPreference[] {
    const productSet = new Set(products);
    return cache.preferences
      .filter((pref) => {
        if (pref.scope === 'global') return true;
        if (pref.scope === 'doctor') return pref.scopeKey === doctor.id;
        if (pref.scope === 'department') return pref.scopeKey === doctor.department;
        if (pref.scope === 'product') return productSet.has(pref.scopeKey);
        return false;
      })
      .sort((a, b) => {
        const rank = (pref: AiGenerationPreference) =>
          pref.scope === 'doctor' ? 0 :
          pref.scope === 'department' ? 1 :
          pref.scope === 'product' ? 2 : 3;
        return rank(a) - rank(b) || b.confidence - a.confidence;
      });
  },
  rebuild(): AiGenerationPreference[] {
    cache.preferences = rebuildPreferencesFromEvents();
    persistLocalCache();
    syncPreferencesToServer();
    return this.getAll();
  },
};

function normalizeExternalCaseComparable(value: string): string {
  return value
    .toLowerCase()
    .replace(/경구\s*철분제|경구용\s*철분제제+|oral\s*iron/gi, '경구용철분제')
    .replace(/더딘|늦는|불충분|부족한|반응\s*부족/g, '반응부족')
    .replace(/헤모글로빈|혈색소/gi, 'hb')
    .replace(/[^\p{L}\p{N}%]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function externalCaseSignature(pattern: Pick<ExternalCasePattern, 'department' | 'product' | 'patientGroup' | 'detailAxis'>): string {
  return [
    normalizeExternalCaseComparable(pattern.department),
    normalizeExternalCaseComparable(pattern.product),
    normalizeExternalCaseComparable(pattern.patientGroup).slice(0, 28),
    normalizeExternalCaseComparable(pattern.detailAxis).slice(0, 36),
  ].join('|');
}

function isSimilarExternalCase(a: ExternalCasePattern, b: ExternalCasePattern): boolean {
  if (a.id === b.id) return false;
  if (normalizeExternalCaseComparable(a.department) !== normalizeExternalCaseComparable(b.department)) return false;
  if (normalizeExternalCaseComparable(a.product) !== normalizeExternalCaseComparable(b.product)) return false;
  return externalCaseSignature(a) === externalCaseSignature(b) ||
    normalizeExternalCaseComparable(`${a.patientGroup} ${a.detailAxis}`) === normalizeExternalCaseComparable(`${b.patientGroup} ${b.detailAxis}`);
}

export const externalCasePatternStorage = {
  getAll(): ExternalCasePattern[] {
    return [...cache.externalCasePatterns].sort((a, b) => b.confidence - a.confidence || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  },
  getForGeneration(department: string, products: string[] = []): ExternalCasePattern[] {
    const productSet = new Set(products.filter(Boolean));
    const dept = normalizeExternalCaseComparable(department);
    return this.getAll()
      .filter((pattern) => {
        const sameDept = normalizeExternalCaseComparable(pattern.department) === dept;
        const sameProduct = productSet.size === 0 || productSet.has(pattern.product);
        return sameDept && sameProduct;
      })
      .slice(0, 8);
  },
  save(pattern: ExternalCasePattern): SaveOutcome {
    const normalized = normalizeExternalCasePattern(pattern);
    const idx = cache.externalCasePatterns.findIndex((item) => item.id === normalized.id);
    const duplicate = cache.externalCasePatterns.find((item) => item.id !== normalized.id && isSimilarExternalCase(normalized, item));
    if (duplicate && duplicate.id !== normalized.id) {
      cache.externalCasePatterns = cache.externalCasePatterns.filter((item) => item.id !== duplicate.id);
      api(`/external-case-patterns/${duplicate.id}`, 'DELETE').catch(console.error);
    }
    if (idx >= 0) cache.externalCasePatterns[idx] = normalized;
    else cache.externalCasePatterns.push(normalized);
    persistLocalCache();
    api('/external-case-patterns', 'POST', normalized).catch(console.error);
    return { saved: true };
  },
  delete(id: string): void {
    cache.externalCasePatterns = cache.externalCasePatterns.filter((pattern) => pattern.id !== id);
    persistLocalCache();
    api(`/external-case-patterns/${id}`, 'DELETE').catch(console.error);
  },
  deleteAll(): void {
    const ids = cache.externalCasePatterns.map((p) => p.id);
    cache.externalCasePatterns = [];
    persistLocalCache();
    ids.forEach((id) => api(`/external-case-patterns/${id}`, 'DELETE').catch(console.error));
  },
};

export function getDoctorVisitCount(doctor: Doctor | undefined): number {
  if (!doctor) return 0;

  const doctorLogs = visitLogStorage.getByDoctorId(doctor.id);
  const migratedCount = doctorLogs.filter((log) => log.id.startsWith('migrated-')).length;
  const realVisitCount = doctorLogs.length - migratedCount;
  const conversationVisitCount = getConversationHistoryVisitCount(doctor);

  if (doctorLogs.length > 0) {
    return realVisitCount + conversationVisitCount;
  }

  return conversationVisitCount;
}

function normalizeSnippetTextForSimilarity(value: string): string {
  return value
    .toLowerCase()
    .replace(/포인트/g, '디테일')
    .replace(/경구\s*철분제|경구용\s*철분제제+|oral\s*iron/gi, '경구용철분제')
    .replace(/더딘|늦는|불충분|부족한|반응\s*부족/g, '반응부족')
    .replace(/[^\p{L}\p{N}%]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getSnippetMeaningKeys(snippet: Pick<GoldenSnippet, 'content' | 'context' | 'tags' | 'product'>): Set<string> {
  const text = normalizeSnippetTextForSimilarity(
    `${snippet.product} ${snippet.content} ${snippet.context} ${(snippet.tags ?? []).join(' ')}`
  );
  const pairs: Array<[string, RegExp]> = [
    ['경구용철분제반응부족', /경구용철분제.*반응부족|반응부족.*경구용철분제/],
    ['1회투여편의성', /1회|한\s*번|원샷|투여.*편의|편의.*투여/],
    ['급여기준', /급여|보험|기준|청구/],
    ['Hb회복', /hb|혈색소|헤모글로빈|회복/],
    ['시험투여부담', /시험투여|아나필락시스|과민|부담/],
    ['아미노산25증가', /아미노산.*25|25.*아미노산/],
    ['포도당부담감소', /포도당|혈당|당부하|당\s*부담/],
    ['중증영양', /중증|중환자|icu|영양/],
    ['단백보충', /단백|질소균형|보충/],
    ['오메가3조성', /오메가3|omega\s*3|ω\s*3/],
    ['수혈부담', /수혈|transfusion/],
    ['외래추적부담', /외래|추적|내원|재방문/],
  ];
  return new Set(pairs.filter(([, pattern]) => pattern.test(text)).map(([key]) => key));
}

function getSnippetDetailTokens(snippet: Pick<GoldenSnippet, 'content' | 'context' | 'tags' | 'product'>): Set<string> {
  const text = normalizeSnippetTextForSimilarity(
    `${snippet.product} ${snippet.content} ${snippet.context} ${(snippet.tags ?? []).join(' ')}`
  );
  const stopWords = new Set([
    '교수', '교수님', '환자', '사용', '처방', '설명', '강조', '디테일', '내용', '근거',
    '제품', '관련', '경우', '가능', '진행', '확인', '안내', '활용', '상황', '비교',
  ]);
  return new Set(
    text
      .split(/\s+/)
      .map((word) => word.trim())
      .filter((word) => word.length >= 2)
      .filter((word) => !stopWords.has(word))
  );
}

function snippetNgramSimilarity(a: string, b: string): number {
  const left = normalizeSnippetTextForSimilarity(a).replace(/\s+/g, '');
  const right = normalizeSnippetTextForSimilarity(b).replace(/\s+/g, '');
  if (!left || !right) return 0;
  if (left === right) return 1;
  const shorter = left.length <= right.length ? left : right;
  const longer = left.length > right.length ? left : right;
  if (shorter.length >= 12 && longer.includes(shorter)) return 1;
  const size = Math.min(3, shorter.length);
  const grams = (value: string) => {
    const result = new Set<string>();
    for (let i = 0; i <= value.length - size; i++) result.add(value.slice(i, i + size));
    return result;
  };
  const leftGrams = grams(left);
  const rightGrams = grams(right);
  let overlap = 0;
  for (const gram of leftGrams) {
    if (rightGrams.has(gram)) overlap++;
  }
  return overlap / Math.max(leftGrams.size, rightGrams.size, 1);
}

export function snippetDetailSimilarity(
  a: Pick<GoldenSnippet, 'content' | 'context' | 'tags' | 'product'>,
  b: Pick<GoldenSnippet, 'content' | 'context' | 'tags' | 'product'>
): number {
  if (normalizeSnippetProduct(a.product) !== normalizeSnippetProduct(b.product)) return 0;
  const aKeys = getSnippetMeaningKeys(a);
  const bKeys = getSnippetMeaningKeys(b);
  const aTokens = getSnippetDetailTokens(a);
  const bTokens = getSnippetDetailTokens(b);
  const union = new Set([...aTokens, ...bTokens]);
  let intersection = 0;
  for (const token of aTokens) {
    if (bTokens.has(token)) intersection++;
  }
  const tokenScore = union.size ? intersection / union.size : 0;
  const textScore = snippetNgramSimilarity(
    `${a.content} ${a.context}`,
    `${b.content} ${b.context}`
  );
  const sharedKeys = [...aKeys].filter((key) => bKeys.has(key));
  if (sharedKeys.length >= 2) return 1;
  if (sharedKeys.length === 1 && Math.max(tokenScore, textScore) >= 0.46) {
    return Math.max(0.7, tokenScore, textScore);
  }
  return Math.max(tokenScore, textScore);
}

export function isLowValueSnippet(snippet: Pick<GoldenSnippet, 'content' | 'context' | 'tags' | 'product'>): boolean {
  const text = normalizeSnippetTextForSimilarity(
    `${snippet.content} ${snippet.context} ${(snippet.tags ?? []).join(' ')}`
  );
  const saysCleanOnly = /깔끔|간단|무난/.test(text);
  if (!saysCleanOnly) return false;

  const hasConcreteBenefit =
    getSnippetMeaningKeys(snippet).size > 0 ||
    /혈당|단백|아미노산|포도당|급여|hb|혈색소|수혈|외래|시험투여|아나필락시스|1회|중환자|영양/.test(text);
  return !hasConcreteBenefit;
}

function findSimilarSnippet(
  snippet: GoldenSnippet,
  pool: GoldenSnippet[],
  threshold = 0.68
): GoldenSnippet | undefined {
  return pool.find((existing) =>
    existing.id !== snippet.id && snippetDetailSimilarity(snippet, existing) >= threshold
  );
}

function chooseSnippetToKeep(a: GoldenSnippet, b: GoldenSnippet): GoldenSnippet {
  if ((a.effectiveness ?? 0) !== (b.effectiveness ?? 0)) {
    return (a.effectiveness ?? 0) > (b.effectiveness ?? 0) ? a : b;
  }
  const aHasAnalysis = (a.analysis ?? '').trim().length > 0 ? 1 : 0;
  const bHasAnalysis = (b.analysis ?? '').trim().length > 0 ? 1 : 0;
  if (aHasAnalysis !== bHasAnalysis) return aHasAnalysis > bHasAnalysis ? a : b;
  const aHasContext = a.context.trim().length > 0 ? 1 : 0;
  const bHasContext = b.context.trim().length > 0 ? 1 : 0;
  if (aHasContext !== bHasContext) return aHasContext > bHasContext ? a : b;
  return a.createdAt <= b.createdAt ? a : b;
}

export const snippetStorage = {
  getAll(): GoldenSnippet[] {
    return [...cache.snippets];
  },
  getByProduct(product: string): GoldenSnippet[] {
    return cache.snippets.filter((s) => s.product === product);
  },
  save(snippet: GoldenSnippet): SaveOutcome {
    const normalized = normalizeSnippet(snippet);
    const idx = cache.snippets.findIndex((s) => s.id === normalized.id);
    const similar = findSimilarSnippet(normalized, cache.snippets);
    if (similar) {
      return { saved: false, duplicate: true, message: '이미 같은 디테일의 핵심멘트가 있습니다.' };
    }
    if (idx >= 0) {
      cache.snippets[idx] = normalized;
    } else {
      cache.snippets.push(normalized);
    }
    persistLocalCache();
    api('/snippets', 'POST', {
      id: normalized.id,
      content: normalized.content,
      context: normalized.context,
      tags: normalized.tags,
      product: normalized.product,
      effectiveness: normalized.effectiveness,
      analysis: normalized.analysis ?? '',
      analyzedAt: normalized.analyzedAt,
    }).catch(console.error);
    return { saved: true };
  },
  saveAnalysis(id: string, analysis: string): GoldenSnippet | undefined {
    const idx = cache.snippets.findIndex((s) => s.id === id);
    if (idx < 0) return undefined;
    const updated = {
      ...cache.snippets[idx],
      analysis: analysis.trim(),
      analyzedAt: new Date().toISOString(),
    };
    cache.snippets[idx] = updated;
    persistLocalCache();
    api('/snippets', 'POST', {
      id: updated.id,
      content: updated.content,
      context: updated.context,
      tags: updated.tags,
      product: updated.product,
      effectiveness: updated.effectiveness,
      analysis: updated.analysis,
      analyzedAt: updated.analyzedAt,
      createdAt: updated.createdAt,
    }).catch(console.error);
    return updated;
  },
  findSimilar(snippet: GoldenSnippet): GoldenSnippet | undefined {
    return findSimilarSnippet(normalizeSnippet(snippet), cache.snippets);
  },
  pruneSimilar(): { removed: GoldenSnippet[]; kept: GoldenSnippet[] } {
    const kept: GoldenSnippet[] = [];
    const removed: GoldenSnippet[] = [];
    for (const snippet of [...cache.snippets].sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
      if (isLowValueSnippet(snippet)) {
        removed.push(snippet);
        continue;
      }
      const similar = findSimilarSnippet(snippet, kept);
      if (!similar) {
        kept.push(snippet);
        continue;
      }
      const winner = chooseSnippetToKeep(similar, snippet);
      const loser = winner.id === similar.id ? snippet : similar;
      if (winner.id !== similar.id) {
        const idx = kept.findIndex((item) => item.id === similar.id);
        if (idx >= 0) kept[idx] = winner;
      }
      removed.push(loser);
    }
    if (removed.length > 0) {
      const removedIds = new Set(removed.map((snippet) => snippet.id));
      cache.snippets = kept.filter((snippet) => !removedIds.has(snippet.id));
      persistLocalCache();
      removed.forEach((snippet) => api(`/snippets/${snippet.id}`, 'DELETE').catch(console.error));
    }
    return { removed, kept: cache.snippets };
  },
  delete(id: string): void {
    cache.snippets = cache.snippets.filter((s) => s.id !== id);
    persistLocalCache();
    api(`/snippets/${id}`, 'DELETE').catch(console.error);
  },
  async getGoldenForGeneration(
    department: string,
    allowedProducts: string[],
  ): Promise<Array<{ content: string; product: string }>> {
    try {
      const allowedSet = new Set(allowedProducts.filter(Boolean));
      return [...cache.snippets]
        .filter((s) => s.context === department || allowedSet.has(s.product))
        .sort((a, b) => {
          const effDiff = (b.effectiveness ?? 0) - (a.effectiveness ?? 0);
          if (effDiff !== 0) return effDiff;
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        })
        .slice(0, 8)
        .map((s) => ({ content: s.content, product: s.product }));
    } catch (e) {
      console.warn('getGoldenForGeneration 실패:', e);
      return [];
    }
  },
};

export const manualStorage = {
  getAll(): CompanyManual[] {
    return [...cache.manuals];
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
    persistLocalCache();
    api('/manuals', 'POST', {
      id: manual.id,
      title: manual.title,
      content: manual.content,
      category: manual.category,
    }).catch(console.error);
  },
  delete(id: string): void {
    cache.manuals = cache.manuals.filter((m) => m.id !== id);
    persistLocalCache();
    api(`/manuals/${id}`, 'DELETE').catch(console.error);
  },
};

export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export async function exportAllData(): Promise<string> {
  try {
    const data = await api('/export', 'POST');
    return JSON.stringify(data, null, 2);
  } catch (e) {
    console.error('Failed to export from server, exporting local backup:', e);
    return JSON.stringify(serializeCache(), null, 2);
  }
}

export async function importAllData(jsonText: string): Promise<{ success: boolean; error?: string }> {
  try {
    const data = JSON.parse(jsonText);
    await api('/import', 'POST', data);
    await refreshCache();
    persistLocalCache();
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
경구 또는 위장관 영양공급이 불가능, 불충분, 제한된 환자에게 수분, 전해질, 아미노산, 칼로리, 필수지방산 및 오메가-3 지방산 보급
- 수술 전후 금식 환자
- 소화기관 기능 저하로 위장관 영양 불가 환자
- 외래, 항암 치료 환자
- 간질환, 중증 환자

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
- 신장, 간 기능 저하 환자 용량 조절 필요`,
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
경구 또는 위장관 영양공급이 불가능, 불충분한 환자 중 특히:
- 음성질소균형으로 체중 감소가 있는 중증 환자
- 단백질 요구량이 높은 수술 후, 외상, 화상 환자
- ICU(중환자실) 입원 환자

【임상 근거】
- 국내 최초 고함량 아미노산 TPN 국내 3상 임상 완료 (국내 제약사 최초)
- ASPEN(미국 비경구영양학회) / ESPEN(유럽 임상영양대사학회) 가이드라인 충족
- 음성질소균형 환자 대상 유효성, 안전성 확인

【영업 핵심 강조점】
1. 위너프(3세대)의 업그레이드 → 기존 위너프 처방 교수 대상 Up-sell 가능
2. 중증, 고단백 요구 환자에게 별도 아미노산 제제 없이 원스톱 처방 → 편의성, 경제성
3. 국내 3상 임상 데이터 → 국산 제품 신뢰성
4. 오메가3 유지 → 항염증 효과 그대로

【영업 타겟 과】
중환자의학과(ICU), 외과, 소화기내과, 종양혈액내과, 간담췌외과

【주의사항】
- 중심정맥 투여 (말초정맥용 제형도 있으나 중심정맥 권장)
- 신장, 간 기능 저하 환자 용량 조절 필요`,
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
- 1회 15분 투여 가능 (기존 IV 철 제제 대비 획기적 단축)
- 정맥(IV)으로만 투여 가능 (피하, 근육주사 불가)
- 체중, Hb 기준으로 누적 필요량 계산

【제품 핵심 강조점 (영업)】
1. 1,000mg 1회 투여 가능 → 내원 횟수 감소
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
  {
    id: 'default-plaju-op-001',
    title: '플라주OP (Plaju OP) - 제품 정보',
    category: 'product',
    updatedAt: '2026-04-18T00:00:00.000Z',
    content: `■ 제품명: 플라주오피주 (Plaju OP Inj.)
■ 분류: [03310] 혈액대용제 / 균형 전해질 수액 (Balanced Crystalloid)
■ 제형: 정맥점적주사용 백 (500mL, 1000mL)
■ 제조/판매: JW생명과학(제조) / JW중외제약(판매)

【성분 (1000mL 기준)】
- 글루콘산나트륨 5.02 g
- 아세트산나트륨수화물 3.68 g
- 염화나트륨 5.26 g
- 염화칼륨 0.37 g
- 염화마그네슘 0.30 g
※ 포도당, 락테이트(Lactate) 없음 — 산증 환자에게 안전한 비락테이트 균형 수액

【적응증】
- 순환혈액량 및 조직간액 감소 시 세포외액의 보급/보정
- 대사성 산증 보정
- 수술 전후 수액 요법, 외상, 화상, 패혈증 등 다양한 임상 상황의 1차 수액

【제품 핵심 강조점 (영업 - 교수 어필)】
1. 균형 전해질 수액(Balanced Crystalloid)
   - Na+, K+, Mg2+, Cl-, 아세트산, 글루콘산을 생리적 농도에 가깝게 설계
   - 0.9% 생리식염수(NS) 대비 고염소 부하(hyperchloremic acidosis) 최소화
   - 대량 수액 공급에서도 산-염기 균형 교란 적음

2. 비락테이트(Lactate-free) 설계
   - 락테이트링거액(Hartmann)과 달리 락테이트 미포함
   - 간기능 저하 환자, 패혈증성 쇼크 환자에서 락테이트 청소 부담 회피
   - 락테이트 농도를 임상 마커로 모니터링하는 ICU 환경에 유리(혼선 없음)

3. 아세트산 + 글루콘산 완충계
   - 빠르게 대사되어 중탄산염(HCO3-)으로 전환 → 대사성 산증의 신속한 보정
   - 락테이트 대비 간 의존도 낮아 다장기부전 환자에게도 적합

4. 마그네슘(Mg2+) 함유
   - NS, Hartmann보다 한 단계 풍부한 전해질 프로파일
   - 수술 후 저마그네슘혈증 예방, 부정맥 위험 감소에 기여
   - 중환자, 외과 환자에게 매력 포인트

5. 광범위한 임상 적용성
   - 수술실(마취 유도/유지), 회복실, ICU, 응급실 모두 1차 라인 수액으로 사용 가능
   - 수혈 전후 수액, 항암 보조 수액, 외상 초기 소생술에 활용

6. JW 수액 제조 인프라 (Non-PVC, 다층 백)
   - JW생명과학 자체 생산 라인 — DEHP-free, 친환경 다층 필름 백
   - 국내 수액 시장 점유율 50% 이상 보유 회사의 품질 신뢰성

【최근 가이드라인 동향 (영업 활용 포인트)】
- 2018년 SMART/SALT-ED 임상 이후 균형 전해질 수액 > 생리식염수 권고 추세
- 2021년 BaSICS, PLUS 임상 등에서 균형 수액의 신부전, 사망률 영향 추가 논의
- 2023년 SCCM 패혈증 가이드라인: 성인 패혈증 환자에서 NS보다 균형 결정질액 선호
- "고염소혈증성 대사성 산증을 줄이고 싶다면 NS 대신 플라주OP" 화법 효과적

【경쟁 우위 (vs 타사 균형 수액)】
- vs 0.9% NS: 고염소 부담 적음, 산-염기 영향 최소
- vs Hartmann(락테이트링거): 락테이트 미포함 → 간기능 저하/쇼크 환자 안전
- vs Plasma-Solution A 등 타사 균형 수액: 마그네슘 추가, 비락테이트, JW 수액 제조 신뢰도

【영업 타겟 과】
마취통증의학과, 외과(일반/정형/흉부/신경), 중환자의학과(ICU), 응급의학과,
산부인과(분만/제왕절개), 소아외과, 화상센터

【주요 처방 시나리오】
- "수술 중 대량 수액 필요 시 NS 대신"
- "패혈증 초기 소생술의 균형 결정질액"
- "락테이트 모니터링 중인 ICU 환자"
- "수술 후 회복실 유지 수액"

【주의사항】
- 고칼륨혈증, 중증 신부전 환자 신중 투여
- 칼슘 함유 제제(혈액제제 등)와 동일 라인 동시 투여 주의
- 부종, 심부전 환자 용량 조절 필요`,
  },
  {
    id: 'default-ibuprofen-premix-001',
    title: '이부프로펜프리믹스 (프리브로펜주) - 제품 정보',
    category: 'product',
    updatedAt: '2026-04-18T00:00:00.000Z',
    content: `■ 제품명: 프리브로펜주 104mL (Pribrophen Inj.)
■ 성분: 이부프로펜(Ibuprofen) 400mg / 104mL (생리식염수 프리믹스)
■ 제형: 즉시 사용 가능한 프리믹스(Pre-mixed) IV 백
■ 제조/판매: JW중외제약
■ 분류: NSAIDs 정맥주사 진통/해열제

【적응증】
- 중등도~중증 통증의 마약성 진통제(opioid) 보조요법
- 정맥 투여로 빠른 해열이 필요한 입원 환자

【용법·용량】
- 통증 조절: 1회 400mg, 6시간 간격, 30분 이상 IV 점적
- 해열: 1회 400mg, 4~6시간 간격, 30분 이상 IV 점적
- 최소 유효용량을 최단 기간 사용 원칙

【제품 핵심 강조점 (영업 - 교수 어필)】
1. 국내 최초 IV 이부프로펜 프리믹스 백
   - 기존 바이알 제형은 사용 직전 생리식염수에 희석 필요 → 조제 단계 발생
   - 프리브로펜주는 이미 희석된 상태 → 백을 걸기만 하면 즉시 IV 주입 가능

2. 조제 오류 위험 제거 (Patient Safety)
   - 희석 농도 오류, 미희석 직접 투여(혈관 자극) 사고 원천 차단
   - 간호사 작업 동선 단축 → 인력 부담 감소
   - 응급실, 회복실, ICU에서 시간 다툼 상황에 강력한 장점

3. 이지컷(EzyCut) 알루미늄 포장
   - 알루미늄 외포장 하단만 절취 → 수액 세트 연결 즉시 가능
   - 흡습 차단성 유지하면서 개봉 편의성 확보

4. Opioid-Sparing Effect (마약성 진통제 절감)
   - NSAID 정맥주사는 multimodal analgesia(다중 약리 진통) 핵심 구성
   - 모르핀, 펜타닐 등 opioid 사용량을 평균 20-30% 감소시키는 임상 보고
   - opioid 부작용(호흡 억제, 변비, 졸림, 의존성) 위험 감소
   - ERAS(Enhanced Recovery After Surgery) 프로토콜의 표준 구성요소

5. 빠른 해열, 진통 효과 (IV 경로의 강점)
   - 경구 이부프로펜 대비 약효 발현 시간 단축 (15~30분 내)
   - 식이 불가, 의식 저하, 위장관 문제 환자에서도 사용 가능
   - 술후 환자, 중환자, 응급환자에게 즉시 진통/해열 효과

6. 비교적 안전한 NSAID 프로파일
   - 케토롤락 대비 신독성 위험 낮음 (단기 사용 시)
   - 위장 출혈 위험 케토롤락보다 낮은 편
   - 간독성 위험 아세트아미노펜보다 낮음

【주요 임상 사용 시나리오】
- 수술 후 진통 (정형외과 인공관절, 외과 복부 수술, 흉부 수술)
- 응급실 외상성 통증, 신장결석 통증
- 입원 환자 발열 조절 (특히 경구 불가 환자)
- ICU 환자 진통/해열 (sedation 보조)
- 분만 후 통증 조절 (모유 수유 가능 약물)

【경쟁 우위】
- vs 케토롤락 IV: 신독성 위험 낮음, 사용 가능 환자군 넓음
- vs 아세트아미노펜 IV(퍼팔간 등): 항염증 효과 추가, 통증 강도 높을 때 유리
- vs 경구 이부프로펜: 식이 불가 환자, 빠른 효과 필요 시 압도적
- vs 기존 바이알 IV 이부프로펜: 조제 불필요, 안전성, 편의성 우위

【영업 타겟 과】
마취통증의학과, 정형외과, 외과(일반/흉부/신경/성형), 응급의학과, 산부인과,
중환자의학과(ICU), 소아과(소아 적응증 별도 확인 필요)

【핵심 어필 화법 예시】
- "수술 후 모르핀 사용량을 줄이고 싶을 때, 즉시 걸 수 있는 IV NSAID입니다"
- "케토롤락의 신독성이 부담스러운 고령 환자에게 더 안전한 대안입니다"
- "응급실에서 희석 조제 시간 없이 바로 통증을 잡을 수 있습니다"
- "ERAS 프로토콜에 그대로 적용 가능한 multimodal analgesia 약제입니다"

【주의사항】
- NSAID 공통 금기: 활동성 소화성 궤양, 중증 심부전, 중증 신부전, 중증 간장애
- 임신 후기(임신 30주 이상) 금기
- 항응고제 병용 시 출혈 위험 평가 필요
- 65세 이상 고령자 신기능 모니터링 권장`,
  },
  {
    id: 'default-fospenem-001',
    title: '포스페넴 (Fospenem / Fosfomycin Inj.) - 제품 정보',
    category: 'product',
    updatedAt: '2026-04-18T00:00:00.000Z',
    content: `■ 제품명: 포스페넴주 (Fosfomycin Injection)
■ 성분: 포스포마이신나트륨 (Fosfomycin Sodium)
■ 계열: 에폭사이드(Epoxide) 항생제 — 카바페넴, 베타락탐과 다른 독자적 계열
■ 제형: 정맥주사제(IV)
■ 제조/판매: JW중외제약

【적응증】
- 복잡성 요로감염, 급성 신우신염
- 다제내성 그람음성균 감염(폐렴, 혈류감염, 복강내 감염)
- ESBL 생성균 감염 시 카바페넴 대체/병용

【제품 핵심 강조점 (영업 - 교수 어필)】
1. 독자적 작용기전 (계열 자체가 다름)
   - 세균 세포벽 합성의 가장 초기 단계(MurA 효소) 억제
   - 베타락탐, 글리코펩타이드와 표적이 달라 교차내성 거의 없음
   - 다제내성균(MDR) 시대의 전략적 선택지

2. 광범위 항균 스펙트럼
   - 그람양성(MRSA 포함) + 그람음성(ESBL E. coli, Enterobacteriaceae)
   - 요로 농축 우수 → 요로감염 1차 후보

3. 항바이오필름(Antibiofilm) 효과
   - 카테터 관련 감염, 인공관절 감염 등 바이오필름 형성 감염에 유의미
   - 단독으로도, 병용으로도 항바이오필름 활성 유지

4. 낮은 내성률, 카바페넴 절약 전략
   - 수십 년 사용에도 내성률 약 3% 수준 유지
   - 카바페넴 사용 압력을 줄여 CRE 발생 억제 (Antimicrobial Stewardship)

5. 다른 항생제와의 강한 시너지
   - 아미노글리코사이드, 카바페넴, 세팔로스포린, 답토마이신과 상승 효과
   - 중증 감염 병용요법의 핵심 파트너

6. ZEUS 임상시험 근거
   - cUTI, 급성 신우신염에서 피페라실린/타조박탐 대비 비열등 입증
   - 6g q8h IV 7일 투여 프로토콜

【JW의 항생제 신뢰도】
- 1969년 국내 최초 합성 항생제 개발 이후 항생제 분야 노하우 축적
- 카바페넴 전 계열(이미페넴/메로페넴/에르타페넴/도리페넴) 자체 원료 합성
- 미국 FDA cGMP 인증, DMF 승인 보유

【영업 타겟 과】
감염내과, 중환자의학과, 신장내과(요로감염), 비뇨의학과, 혈액종양내과(중성구감소성 발열),
정형외과(인공관절 감염), 외과(복강내 감염)

【핵심 어필 화법】
- "카바페넴을 아껴야 하는 ASP 환경에서 ESBL 감염의 든든한 대안입니다"
- "교차내성이 거의 없어 MDR 감염 병용요법의 1순위 파트너입니다"
- "바이오필름 감염, 카테터 감염에서 단독으로도 효과를 기대할 수 있습니다"

【주의사항】
- 나트륨 함량 높음(1g당 약 14.5mEq) → 심부전, 중증 고혈압 환자 주의
- 신기능 저하 시 용량 조절 필요
- 단독 사용 시 내성 발현 가능 → 가능한 한 병용요법 권장`,
  },
  {
    id: 'default-pripenem-001',
    title: '프리페넴 (Pripenem / Ertapenem) - 제품 정보',
    category: 'product',
    updatedAt: '2026-04-18T00:00:00.000Z',
    content: `■ 제품명: 프리페넴주 1g (Pripenem Inj.)
■ 성분: 에르타페넴(Ertapenem) 1g
■ 계열: 카바페넴(Carbapenem)계 베타락탐 항생제
■ 제형: 정맥주사(IV) 또는 근육주사(IM)
■ 제조/판매: JW중외제약

【적응증】
- 복잡성 복강내 감염 (IDSA 1차 권장)
- 지역사회획득 폐렴
- 복잡성 요로감염, 급성 신우신염
- 피부, 연조직 감염
- 급성 골반감염

【제품 핵심 강조점 (영업 - 교수 어필)】
1. 카바페넴 중 유일한 1일 1회 투여
   - 이미페넴(6~8시간), 메로페넴(8시간 간격) 대비 압도적 편의성
   - 외래주사실(OPAT), 가정 정맥주사 치료에서도 운영 가능
   - 입원 단축, 병동 간호 부담 경감

2. ESBL 생성균 1차 선택지
   - 세팔로스포린 내성 그람음성균(ESBL E. coli, K. pneumoniae)에 강력
   - 광범위 베타락탐 항생제 중 그람음성균 커버 최상

3. 혐기성균 커버
   - 거의 모든 Enterobacteriaceae + 혐기성균 동시 커버
   - 복강내 감염 단일 약제 처방 가능

4. JW의 자체 원료 카바페넴 포트폴리오
   - 국내 유일 카바페넴 전 계열(이미페넴/메로페넴/에르타페넴/도리페넴) 자체 합성
   - 미국 FDA cGMP 인증, DMF 승인된 시화공장 페넴 전용동
   - 글로벌 품질 검증 완료된 국산 제품

5. IV/IM 양용
   - 외래 환자 또는 정맥 라인 확보 어려운 환자에게 IM 투여 가능
   - 1일 1회 IM 투여로 통원 치료 가능

【주의 차별화 포인트 (밸런스 어필)】
- 녹농균(Pseudomonas), Acinetobacter 커버 X
  → 녹농균 의심 시 메로페넴/이미페넴 권장
- 따라서 "지역사회 획득 감염 + ESBL 위험"이 가장 강한 적응증

【경쟁 우위】
- vs Meropenem/Imipenem: 1일 1회로 편의성 압도, 외래 가능
- vs Piperacillin/Tazobactam: ESBL 균주 더 안정적 커버
- vs 3세대 세팔로스포린: ESBL 환경에서 신뢰도 우위

【영업 타겟 과】
감염내과, 외과(복강내 감염), 산부인과(골반 감염), 호흡기내과(CAP), 비뇨의학과(cUTI),
정형외과(연조직 감염), 가정의학과(외래 OPAT)

【핵심 어필 화법】
- "1일 1회 투여로 외래 주사실에서도 카바페넴 치료가 가능합니다"
- "ESBL 위험이 있는 복강내 감염에서 IDSA가 1차로 권장하는 약물입니다"
- "녹농균이 의심되지 않는 시나리오에서 메로페넴 대신 입원 부담을 줄여줍니다"

【주의사항】
- 녹농균, 아시네토박터 비커버
- 발프로산 병용 금기 (혈중농도 90%까지 감소)
- IM 제형은 리도카인 포함 → 리도카인 과민증 환자 IM 금기
- 신기능 저하 시 용량 조절 (CrCl <30: 500mg q24h)`,
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
    await Promise.allSettled(DEFAULT_PRODUCT_MANUALS.map((m) =>
      api('/manuals', 'POST', {
        id: m.id,
        title: m.title,
        content: m.content,
        category: m.category,
      })
    ));
  }
}
