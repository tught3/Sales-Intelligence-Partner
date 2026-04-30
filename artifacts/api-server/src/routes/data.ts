import { Router, type Request, type Response, type NextFunction } from "express";
import { db, doctors, visitLogs, goldenSnippets, hospitalProfiles, departmentProfiles, companyManuals } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

function wrap(fn: (req: Request, res: Response) => Promise<void>) {
  return (req: Request, res: Response, _next: NextFunction) => {
    fn(req, res).catch((e: any) => {
      console.error("DB route error:", e);
      res.status(500).json({ error: e.message || "Internal server error" });
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

function prepSnippet(s: any) {
  return {
    id: s.id,
    content: s.content || "",
    context: s.context || "",
    tags: s.tags || [],
    product: s.product || "",
    effectiveness: s.effectiveness ?? 5,
    createdAt: toDate(s.createdAt ?? s.created_at),
  };
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
  const seen = new Set<string>();
  for (const record of history ?? []) {
    const key = [
      normalizeDuplicateText(record.rawText),
      normalizeDuplicateText(record.period),
    ].join("::");
    if (seen.has(key)) return true;
    seen.add(key);
  }
  return false;
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

router.get("/snippets", wrap(async (_req, res) => {
  const all = await db.select().from(goldenSnippets);
  res.json(all);
}));

router.post("/snippets", wrap(async (req, res) => {
  const data = prepSnippet(req.body);
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
  const [allDoctors, allVisitLogs, allSnippets, allHospitals, allDepartments, allManuals] = await Promise.all([
    db.select().from(doctors),
    db.select().from(visitLogs),
    db.select().from(goldenSnippets),
    db.select().from(hospitalProfiles),
    db.select().from(departmentProfiles),
    db.select().from(companyManuals),
  ]);
  res.json({
    doctors: allDoctors,
    visitLogs: allVisitLogs,
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
