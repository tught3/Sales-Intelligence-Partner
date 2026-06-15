import { Router, type Request, type Response, type NextFunction } from "express";
import {
  db,
  doctors,
  visitLogs,
  visitLogFeedbackEvents,
  aiGenerationPreferences,
  externalCasePatterns,
  goldenSnippets,
  hospitalProfiles,
  departmentProfiles,
  companyManuals,
} from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

function wrap(fn: (req: Request, res: Response) => Promise<void>) {
  return (req: Request, res: Response, _next: NextFunction) => {
    const timeout = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error("Database request timed out")), 12000);
    });

    Promise.race([fn(req, res), timeout]).catch((e: any) => {
      console.error("DB route error:", e);
      if (!res.headersSent) {
        const isTimeout = e?.message === "Database request timed out";
        res.status(isTimeout ? 503 : 500).json({ error: e.message || "Internal server error" });
      }
    });
  };
}

function toDate(v: any): Date {
  if (v instanceof Date) return v;
  if (typeof v === "string" || typeof v === "number") {
    const d = new Date(v);
    if (!isNaN(d.getTime())) return d;
  }
  return new Date();
}

function stripId<T extends Record<string, any>>(obj: T): Omit<T, 'id'> {
  const { id, ...rest } = obj;
  return rest as any;
}

function getRouteId(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return typeof value === "string" ? value : "";
}

function prepDoctor(d: any) {
  return {
    id: d.id,
    name: d.name || "",
    hospital: d.hospital || "",
    department: d.department || "",
    position: d.position || "교수",
    traits: d.traits || [],
    objections: d.objections || [],
    notes: d.notes || "",
    prescriptionTendency: d.prescriptionTendency ?? d.prescription_tendency ?? "",
    interestAreas: d.interestAreas ?? d.interest_areas ?? "",
    conversationHistory: d.conversationHistory ?? d.conversation_history ?? [],
    createdAt: toDate(d.createdAt ?? d.created_at),
    updatedAt: toDate(d.updatedAt ?? d.updated_at),
  };
}

function prepVisitLog(v: any) {
  return {
    id: v.id,
    doctorId: v.doctorId ?? v.doctor_id ?? "",
    visitDate: v.visitDate ?? v.visit_date ?? "",
    rawNotes: v.rawNotes ?? v.raw_notes ?? "",
    formattedLog: v.formattedLog ?? v.formatted_log ?? "",
    nextStrategy: v.nextStrategy ?? v.next_strategy ?? "",
    aiEditHint: v.aiEditHint ?? v.ai_edit_hint ?? "",
    products: v.products || [],
    createdAt: toDate(v.createdAt ?? v.created_at),
  };
}

function prepFeedbackEvent(v: any) {
  return {
    id: v.id,
    eventType: v.eventType ?? v.event_type ?? "edit",
    visitLogId: v.visitLogId ?? v.visit_log_id ?? "",
    doctorId: v.doctorId ?? v.doctor_id ?? "",
    doctorName: v.doctorName ?? v.doctor_name ?? "",
    hospital: v.hospital ?? "",
    department: v.department ?? "",
    products: v.products || [],
    rawNotes: v.rawNotes ?? v.raw_notes ?? "",
    originalFormattedLog: v.originalFormattedLog ?? v.original_formatted_log ?? "",
    originalNextStrategy: v.originalNextStrategy ?? v.original_next_strategy ?? "",
    editedFormattedLog: v.editedFormattedLog ?? v.edited_formatted_log ?? "",
    editedNextStrategy: v.editedNextStrategy ?? v.edited_next_strategy ?? "",
    diffSummary: v.diffSummary ?? v.diff_summary ?? "",
    createdAt: toDate(v.createdAt ?? v.created_at),
  };
}

function prepPreference(v: any) {
  return {
    id: v.id,
    scope: v.scope ?? "global",
    scopeKey: v.scopeKey ?? v.scope_key ?? "",
    forbiddenPatterns: v.forbiddenPatterns ?? v.forbidden_patterns ?? [],
    preferredPatterns: v.preferredPatterns ?? v.preferred_patterns ?? [],
    avoidedPatientGroups: v.avoidedPatientGroups ?? v.avoided_patient_groups ?? [],
    preferredDetailAxes: v.preferredDetailAxes ?? v.preferred_detail_axes ?? [],
    preferredTone: v.preferredTone ?? v.preferred_tone ?? "",
    averageLength: Number(v.averageLength ?? v.average_length ?? 0) || 0,
    confidence: Number(v.confidence ?? v.confidence ?? 0) || 0,
    summary: v.summary ?? "",
    updatedAt: toDate(v.updatedAt ?? v.updated_at),
  };
}

function prepExternalCasePattern(v: any) {
  return {
    id: v.id,
    department: v.department ?? "",
    product: normalizeSnippetProduct(v.product || ""),
    patientGroup: v.patientGroup ?? v.patient_group ?? "",
    detailAxis: v.detailAxis ?? v.detail_axis ?? "",
    reactionPattern: v.reactionPattern ?? v.reaction_pattern ?? "",
    nextAction: v.nextAction ?? v.next_action ?? "",
    sourceSummary: v.sourceSummary ?? v.source_summary ?? "",
    styleExampleMemo: v.styleExampleMemo ?? v.style_example_memo ?? "",
    confidence: Math.max(0, Math.min(100, Number(v.confidence ?? 60) || 60)),
    createdAt: toDate(v.createdAt ?? v.created_at),
  };
}

function prepSnippet(s: any) {
  return {
    id: s.id,
    content: cleanPointWord(s.content || ""),
    context: cleanPointWord(s.context || ""),
    tags: Array.isArray(s.tags) ? s.tags.map((tag: any) => cleanPointWord(String(tag))) : [],
    product: normalizeSnippetProduct(s.product || ""),
    effectiveness: s.effectiveness ?? 5,
    analysis: cleanPointWord(s.analysis || ""),
    analyzedAt: s.analyzedAt || s.analyzed_at ? toDate(s.analyzedAt ?? s.analyzed_at) : null,
    createdAt: toDate(s.createdAt ?? s.created_at),
  };
}

function normalizeSnippetProduct(product: string) {
  const compact = product.replace(/\s+/g, "").trim();
  if (!compact) return "";
  if (compact.includes("위너프에이플러스")) return "위너프에이플러스";
  if (compact.includes("위너프")) return "위너프";
  return product.trim();
}

function cleanPointWord(value: string) {
  return value
    .replace(/제품\s*포인트/g, "제품 내용")
    .replace(/처방\s*포인트/g, "처방 관련 내용")
    .replace(/디테일\s*포인트/g, "디테일")
    .replace(/짧은\s*포인트/g, "핵심 내용")
    .replace(/차별화\s*포인트/g, "차별점")
    .replace(/매력\s*포인트/g, "강점")
    .replace(/활용\s*포인트/g, "활용 내용")
    .replace(/포인트를/g, "내용을")
    .replace(/포인트는/g, "내용은")
    .replace(/포인트/g, "내용")
    .replace(/\s{2,}/g, " ")
    .trim();
}

type SnippetLike = {
  id: string;
  content: string;
  context: string;
  tags: string[];
  product: string;
  analysis?: string;
};

function normalizeSnippetTextForSimilarity(value: string): string {
  return value
    .toLowerCase()
    .replace(/포인트/g, "디테일")
    .replace(/경구\s*철분제|경구용\s*철분제제+|oral\s*iron/gi, "경구용철분제")
    .replace(/더딘|늦는|불충분|부족한|반응\s*부족/g, "반응부족")
    .replace(/[^\p{L}\p{N}%]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getSnippetMeaningKeys(snippet: SnippetLike): Set<string> {
  const text = normalizeSnippetTextForSimilarity(
    `${snippet.product} ${snippet.content} ${snippet.context} ${snippet.tags.join(" ")}`
  );
  const pairs: Array<[string, RegExp]> = [
    ["경구용철분제반응부족", /경구용철분제.*반응부족|반응부족.*경구용철분제/],
    ["1회투여편의성", /1회|한\s*번|원샷|투여.*편의|편의.*투여/],
    ["급여기준", /급여|보험|기준|청구/],
    ["Hb회복", /hb|혈색소|헤모글로빈|회복/],
    ["시험투여부담", /시험투여|아나필락시스|과민|부담/],
    ["아미노산25증가", /아미노산.*25|25.*아미노산/],
    ["포도당부담감소", /포도당|혈당|당부하|당\s*부담/],
    ["중증영양", /중증|중환자|icu|영양/],
    ["단백보충", /단백|질소균형|보충/],
    ["오메가3조성", /오메가3|omega\s*3|ω\s*3/],
    ["수혈부담", /수혈|transfusion/],
    ["외래추적부담", /외래|추적|내원|재방문/],
  ];
  return new Set(pairs.filter(([, pattern]) => pattern.test(text)).map(([key]) => key));
}

function getSnippetDetailTokens(snippet: SnippetLike): Set<string> {
  const stopWords = new Set([
    "교수", "교수님", "환자", "사용", "처방", "설명", "강조", "디테일", "내용", "근거",
    "제품", "관련", "경우", "가능", "진행", "확인", "안내", "활용", "상황", "비교",
  ]);
  return new Set(
    normalizeSnippetTextForSimilarity(`${snippet.product} ${snippet.content} ${snippet.context} ${snippet.tags.join(" ")}`)
      .split(/\s+/)
      .filter((word) => word.length >= 2 && !stopWords.has(word))
  );
}

function snippetNgramSimilarity(a: string, b: string): number {
  const left = normalizeSnippetTextForSimilarity(a).replace(/\s+/g, "");
  const right = normalizeSnippetTextForSimilarity(b).replace(/\s+/g, "");
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

function snippetDetailSimilarity(a: SnippetLike, b: SnippetLike): number {
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
  const textScore = snippetNgramSimilarity(`${a.content} ${a.context}`, `${b.content} ${b.context}`);
  const sharedKeys = [...aKeys].filter((key) => bKeys.has(key));
  if (sharedKeys.length >= 2) return 1;
  if (sharedKeys.length === 1 && Math.max(tokenScore, textScore) >= 0.46) {
    return Math.max(0.7, tokenScore, textScore);
  }
  return Math.max(tokenScore, textScore);
}

function prepHospital(h: any) {
  return {
    id: h.id,
    name: h.name || "",
    region: h.region || "",
    hospitalType: h.hospitalType ?? h.hospital_type ?? "other",
    characteristics: h.characteristics || "",
    keyDepartments: h.keyDepartments ?? h.key_departments ?? "",
    competitorStrength: h.competitorStrength ?? h.competitor_strength ?? "",
    notes: h.notes || "",
    updatedAt: toDate(h.updatedAt ?? h.updated_at),
  };
}

function prepDepartment(d: any) {
  return {
    id: d.id,
    hospitalId: d.hospitalId ?? d.hospital_id ?? "",
    hospitalName: d.hospitalName ?? d.hospital_name ?? "",
    departmentName: d.departmentName ?? d.department_name ?? "",
    characteristics: d.characteristics || "",
    mainProducts: d.mainProducts ?? d.main_products ?? [],
    competitorProducts: d.competitorProducts ?? d.competitor_products ?? "",
    notes: d.notes || "",
    updatedAt: toDate(d.updatedAt ?? d.updated_at),
  };
}

function prepManual(m: any) {
  return {
    id: m.id,
    title: m.title || "",
    content: m.content || "",
    category: m.category || "other",
    updatedAt: toDate(m.updatedAt ?? m.updated_at),
  };
}

function normalizeDuplicateText(value: any): string {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

function normalizeDuplicateArray(values: any[] | undefined): string {
  return (values ?? [])
    .map((value) => normalizeDuplicateText(value))
    .filter(Boolean)
    .sort()
    .join("|");
}

function normalizeSimilarityText(value: any): string {
  return normalizeDuplicateText(value).toLowerCase();
}

function levenshteinSimilarity(left: any, right: any): number {
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

function isSimilarText(left: any, right: any, threshold = 0.8): boolean {
  if (normalizeSimilarityText(left) === normalizeSimilarityText(right)) return true;
  return levenshteinSimilarity(left, right) >= threshold;
}

function sameVisitLogSignature(a: any, b: any): boolean {
  return (
    normalizeDuplicateText(a.doctorId) === normalizeDuplicateText(b.doctorId) &&
    normalizeDuplicateText(a.visitDate) === normalizeDuplicateText(b.visitDate) &&
    normalizeDuplicateText(a.rawNotes) === normalizeDuplicateText(b.rawNotes) &&
    normalizeDuplicateText(a.formattedLog) === normalizeDuplicateText(b.formattedLog) &&
    normalizeDuplicateText(a.nextStrategy) === normalizeDuplicateText(b.nextStrategy) &&
    normalizeDuplicateArray(a.products) === normalizeDuplicateArray(b.products)
  );
}

function hasDuplicateConversationHistory(history: any[]): boolean {
  const records = history ?? [];
  for (let i = 0; i < records.length; i++) {
    for (let j = i + 1; j < records.length; j++) {
      if (isSimilarText(
        `${records[i].rawText}\n${records[i].period}`,
        `${records[j].rawText}\n${records[j].period}`,
      )) {
        return true;
      }
    }
  }
  return false;
}

function sameVisitLogSimilarity(a: any, b: any): boolean {
  if (normalizeDuplicateText(a.doctorId) !== normalizeDuplicateText(b.doctorId)) return false;
  if (normalizeDuplicateText(a.visitDate) !== normalizeDuplicateText(b.visitDate)) return false;
  return isSimilarText(
    [a.rawNotes, a.formattedLog, a.nextStrategy, ...(a.products ?? [])].join("\n"),
    [b.rawNotes, b.formattedLog, b.nextStrategy, ...(b.products ?? [])].join("\n"),
  );
}

router.get("/doctors", wrap(async (_req, res) => {
  const all = await db.select().from(doctors);
  res.json(all);
}));

router.get("/doctors/:id", wrap(async (req, res) => {
  const id = getRouteId(req.params.id);
  const [doc] = await db.select().from(doctors).where(eq(doctors.id, id));
  if (!doc) { res.status(404).json({ error: "not found" }); return; }
  res.json(doc);
}));

router.post("/doctors", wrap(async (req, res) => {
  const data = prepDoctor(req.body);
  if (hasDuplicateConversationHistory(data.conversationHistory)) {
    res.status(409).json({ error: "duplicate", message: "중복된 내용입니다." });
    return;
  }
  await db.insert(doctors).values(data).onConflictDoUpdate({
    target: doctors.id,
    set: { ...stripId(data), updatedAt: new Date() },
  });
  res.json({ ok: true });
}));

router.delete("/doctors/:id", wrap(async (req, res) => {
  const id = getRouteId(req.params.id);
  await db.delete(doctors).where(eq(doctors.id, id));
  res.json({ ok: true });
}));

router.get("/visit-logs", wrap(async (_req, res) => {
  const all = await db.select().from(visitLogs);
  res.json(all);
}));

router.post("/visit-logs", wrap(async (req, res) => {
  const data = prepVisitLog(req.body);
  const existing = await db
    .select()
    .from(visitLogs)
    .where(eq(visitLogs.doctorId, data.doctorId));
  const duplicate = existing.find((row) => row.id !== data.id && sameVisitLogSignature(row, data));
  if (duplicate) {
    res.status(409).json({ error: "duplicate", message: "중복된 내용입니다." });
    return;
  }
  const fuzzyDuplicate = existing.find((row) => row.id !== data.id && sameVisitLogSimilarity(row, data));
  if (fuzzyDuplicate) {
    res.status(409).json({ error: "duplicate", message: "중복된 내용입니다." });
    return;
  }
  await db.insert(visitLogs).values(data).onConflictDoUpdate({
    target: visitLogs.id,
    set: stripId(data),
  });
  res.json({ ok: true });
}));

router.delete("/visit-logs/:id", wrap(async (req, res) => {
  const id = getRouteId(req.params.id);
  await db.delete(visitLogs).where(eq(visitLogs.id, id));
  res.json({ ok: true });
}));

router.get("/visit-log-feedback-events", wrap(async (_req, res) => {
  const all = await db.select().from(visitLogFeedbackEvents);
  res.json(all);
}));

router.post("/visit-log-feedback-events", wrap(async (req, res) => {
  const data = prepFeedbackEvent(req.body);
  await db.insert(visitLogFeedbackEvents).values(data).onConflictDoUpdate({
    target: visitLogFeedbackEvents.id,
    set: stripId(data),
  });
  res.json({ ok: true });
}));

router.get("/ai-generation-preferences", wrap(async (_req, res) => {
  const all = await db.select().from(aiGenerationPreferences);
  res.json(all);
}));

router.post("/ai-generation-preferences", wrap(async (req, res) => {
  const data = prepPreference(req.body);
  await db.insert(aiGenerationPreferences).values(data).onConflictDoUpdate({
    target: aiGenerationPreferences.id,
    set: { ...stripId(data), updatedAt: new Date() },
  });
  res.json({ ok: true });
}));

router.get("/external-case-patterns", wrap(async (_req, res) => {
  const all = await db.select().from(externalCasePatterns);
  res.json(all);
}));

router.post("/external-case-patterns", wrap(async (req, res) => {
  const data = prepExternalCasePattern(req.body);
  await db.insert(externalCasePatterns).values(data).onConflictDoUpdate({
    target: externalCasePatterns.id,
    set: stripId(data),
  });
  res.json({ ok: true });
}));

router.delete("/external-case-patterns/:id", wrap(async (req, res) => {
  const id = getRouteId(req.params.id);
  await db.delete(externalCasePatterns).where(eq(externalCasePatterns.id, id));
  res.json({ ok: true });
}));

router.get("/snippets", wrap(async (_req, res) => {
  const all = await db.select().from(goldenSnippets);
  res.json(all);
}));

router.post("/snippets", wrap(async (req, res) => {
  const data = prepSnippet(req.body);
  const existing = await db.select().from(goldenSnippets);
  const duplicate = existing.find((row) => row.id !== data.id && snippetDetailSimilarity(
    {
      id: data.id,
      content: data.content,
      context: data.context,
      tags: data.tags as string[],
      product: data.product,
      analysis: data.analysis,
    },
    {
      id: row.id,
      content: row.content,
      context: row.context,
      tags: row.tags as string[],
      product: row.product,
      analysis: row.analysis,
    }
  ) >= 0.68);
  if (duplicate) {
    res.status(409).json({ error: "duplicate", message: "이미 같은 디테일의 핵심멘트가 있습니다." });
    return;
  }
  await db.insert(goldenSnippets).values(data).onConflictDoUpdate({
    target: goldenSnippets.id,
    set: stripId(data),
  });
  res.json({ ok: true });
}));

router.delete("/snippets/:id", wrap(async (req, res) => {
  const id = getRouteId(req.params.id);
  await db.delete(goldenSnippets).where(eq(goldenSnippets.id, id));
  res.json({ ok: true });
}));

router.get("/hospitals", wrap(async (_req, res) => {
  const all = await db.select().from(hospitalProfiles);
  res.json(all);
}));

router.post("/hospitals", wrap(async (req, res) => {
  const data = prepHospital(req.body);
  await db.insert(hospitalProfiles).values(data).onConflictDoUpdate({
    target: hospitalProfiles.id,
    set: { ...stripId(data), updatedAt: new Date() },
  });
  res.json({ ok: true });
}));

router.delete("/hospitals/:id", wrap(async (req, res) => {
  const id = getRouteId(req.params.id);
  await db.delete(hospitalProfiles).where(eq(hospitalProfiles.id, id));
  res.json({ ok: true });
}));

router.get("/departments", wrap(async (_req, res) => {
  const all = await db.select().from(departmentProfiles);
  res.json(all);
}));

router.post("/departments", wrap(async (req, res) => {
  const data = prepDepartment(req.body);
  await db.insert(departmentProfiles).values(data).onConflictDoUpdate({
    target: departmentProfiles.id,
    set: { ...stripId(data), updatedAt: new Date() },
  });
  res.json({ ok: true });
}));

router.delete("/departments/:id", wrap(async (req, res) => {
  const id = getRouteId(req.params.id);
  await db.delete(departmentProfiles).where(eq(departmentProfiles.id, id));
  res.json({ ok: true });
}));

router.get("/manuals", wrap(async (_req, res) => {
  const all = await db.select().from(companyManuals);
  res.json(all);
}));

router.post("/manuals", wrap(async (req, res) => {
  const data = prepManual(req.body);
  await db.insert(companyManuals).values(data).onConflictDoUpdate({
    target: companyManuals.id,
    set: { ...stripId(data), updatedAt: new Date() },
  });
  res.json({ ok: true });
}));

router.delete("/manuals/:id", wrap(async (req, res) => {
  const id = getRouteId(req.params.id);
  await db.delete(companyManuals).where(eq(companyManuals.id, id));
  res.json({ ok: true });
}));

router.post("/export", wrap(async (_req, res) => {
  const [allDoctors, allVisitLogs, allFeedbackEvents, allPreferences, allExternalCasePatterns, allSnippets, allHospitals, allDepartments, allManuals] = await Promise.all([
    db.select().from(doctors),
    db.select().from(visitLogs),
    db.select().from(visitLogFeedbackEvents),
    db.select().from(aiGenerationPreferences),
    db.select().from(externalCasePatterns),
    db.select().from(goldenSnippets),
    db.select().from(hospitalProfiles),
    db.select().from(departmentProfiles),
    db.select().from(companyManuals),
  ]);
  res.json({
    doctors: allDoctors,
    visitLogs: allVisitLogs,
    visitLogFeedbackEvents: allFeedbackEvents,
    aiGenerationPreferences: allPreferences,
    externalCasePatterns: allExternalCasePatterns,
    snippets: allSnippets,
    hospitals: allHospitals,
    departments: allDepartments,
    manuals: allManuals,
    exportedAt: new Date().toISOString(),
  });
}));

router.post("/import", wrap(async (req, res) => {
  const data = req.body;
  const errors: string[] = [];
  if (data.doctors) {
    for (const d of data.doctors) {
      try {
        const row = prepDoctor(d);
        await db.insert(doctors).values(row).onConflictDoUpdate({ target: doctors.id, set: { ...stripId(row), updatedAt: new Date() } });
      } catch (e: any) { errors.push(`doctor ${d.id}: ${e.message}`); }
    }
  }
  if (data.visitLogs) {
    for (const v of data.visitLogs) {
      try {
        const row = prepVisitLog(v);
        await db.insert(visitLogs).values(row).onConflictDoUpdate({ target: visitLogs.id, set: stripId(row) });
      } catch (e: any) { errors.push(`visitLog ${v.id}: ${e.message}`); }
    }
  }
  if (data.visitLogFeedbackEvents) {
    for (const item of data.visitLogFeedbackEvents) {
      try {
        const row = prepFeedbackEvent(item);
        await db.insert(visitLogFeedbackEvents).values(row).onConflictDoUpdate({ target: visitLogFeedbackEvents.id, set: stripId(row) });
      } catch (e: any) { errors.push(`visitLogFeedbackEvent ${item.id}: ${e.message}`); }
    }
  }
  if (data.aiGenerationPreferences) {
    for (const item of data.aiGenerationPreferences) {
      try {
        const row = prepPreference(item);
        await db.insert(aiGenerationPreferences).values(row).onConflictDoUpdate({ target: aiGenerationPreferences.id, set: { ...stripId(row), updatedAt: new Date() } });
      } catch (e: any) { errors.push(`aiGenerationPreference ${item.id}: ${e.message}`); }
    }
  }
  if (data.externalCasePatterns) {
    for (const item of data.externalCasePatterns) {
      try {
        const row = prepExternalCasePattern(item);
        await db.insert(externalCasePatterns).values(row).onConflictDoUpdate({ target: externalCasePatterns.id, set: stripId(row) });
      } catch (e: any) { errors.push(`externalCasePattern ${item.id}: ${e.message}`); }
    }
  }
  if (data.snippets) {
    for (const s of data.snippets) {
      try {
        const row = prepSnippet(s);
        await db.insert(goldenSnippets).values(row).onConflictDoUpdate({ target: goldenSnippets.id, set: stripId(row) });
      } catch (e: any) { errors.push(`snippet ${s.id}: ${e.message}`); }
    }
  }
  if (data.hospitals) {
    for (const h of data.hospitals) {
      try {
        const row = prepHospital(h);
        await db.insert(hospitalProfiles).values(row).onConflictDoUpdate({ target: hospitalProfiles.id, set: { ...stripId(row), updatedAt: new Date() } });
      } catch (e: any) { errors.push(`hospital ${h.id}: ${e.message}`); }
    }
  }
  if (data.departments) {
    for (const d of data.departments) {
      try {
        const row = prepDepartment(d);
        await db.insert(departmentProfiles).values(row).onConflictDoUpdate({ target: departmentProfiles.id, set: { ...stripId(row), updatedAt: new Date() } });
      } catch (e: any) { errors.push(`department ${d.id}: ${e.message}`); }
    }
  }
  if (data.manuals) {
    for (const m of data.manuals) {
      try {
        const row = prepManual(m);
        await db.insert(companyManuals).values(row).onConflictDoUpdate({ target: companyManuals.id, set: { ...stripId(row), updatedAt: new Date() } });
      } catch (e: any) { errors.push(`manual ${m.id}: ${e.message}`); }
    }
  }
  if (errors.length > 0) {
    console.error("Import partial errors:", errors);
  }
  res.json({ ok: true, errors: errors.length > 0 ? errors : undefined });
}));

export default router;
