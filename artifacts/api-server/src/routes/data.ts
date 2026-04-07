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

router.get("/doctors", wrap(async (_req, res) => {
  const all = await db.select().from(doctors);
  res.json(all);
}));

router.get("/doctors/:id", wrap(async (req, res) => {
  const [doc] = await db.select().from(doctors).where(eq(doctors.id, req.params.id));
  if (!doc) { res.status(404).json({ error: "not found" }); return; }
  res.json(doc);
}));

router.post("/doctors", wrap(async (req, res) => {
  const data = req.body;
  await db.insert(doctors).values(data).onConflictDoUpdate({
    target: doctors.id,
    set: { ...data, updatedAt: new Date() },
  });
  res.json({ ok: true });
}));

router.delete("/doctors/:id", wrap(async (req, res) => {
  await db.delete(doctors).where(eq(doctors.id, req.params.id));
  res.json({ ok: true });
}));

router.get("/visit-logs", wrap(async (_req, res) => {
  const all = await db.select().from(visitLogs);
  res.json(all);
}));

router.post("/visit-logs", wrap(async (req, res) => {
  const data = req.body;
  await db.insert(visitLogs).values(data).onConflictDoUpdate({
    target: visitLogs.id,
    set: data,
  });
  res.json({ ok: true });
}));

router.delete("/visit-logs/:id", wrap(async (req, res) => {
  await db.delete(visitLogs).where(eq(visitLogs.id, req.params.id));
  res.json({ ok: true });
}));

router.get("/snippets", wrap(async (_req, res) => {
  const all = await db.select().from(goldenSnippets);
  res.json(all);
}));

router.post("/snippets", wrap(async (req, res) => {
  const data = req.body;
  await db.insert(goldenSnippets).values(data).onConflictDoUpdate({
    target: goldenSnippets.id,
    set: data,
  });
  res.json({ ok: true });
}));

router.delete("/snippets/:id", wrap(async (req, res) => {
  await db.delete(goldenSnippets).where(eq(goldenSnippets.id, req.params.id));
  res.json({ ok: true });
}));

router.get("/hospitals", wrap(async (_req, res) => {
  const all = await db.select().from(hospitalProfiles);
  res.json(all);
}));

router.post("/hospitals", wrap(async (req, res) => {
  const data = req.body;
  await db.insert(hospitalProfiles).values(data).onConflictDoUpdate({
    target: hospitalProfiles.id,
    set: { ...data, updatedAt: new Date() },
  });
  res.json({ ok: true });
}));

router.delete("/hospitals/:id", wrap(async (req, res) => {
  await db.delete(hospitalProfiles).where(eq(hospitalProfiles.id, req.params.id));
  res.json({ ok: true });
}));

router.get("/departments", wrap(async (_req, res) => {
  const all = await db.select().from(departmentProfiles);
  res.json(all);
}));

router.post("/departments", wrap(async (req, res) => {
  const data = req.body;
  await db.insert(departmentProfiles).values(data).onConflictDoUpdate({
    target: departmentProfiles.id,
    set: { ...data, updatedAt: new Date() },
  });
  res.json({ ok: true });
}));

router.delete("/departments/:id", wrap(async (req, res) => {
  await db.delete(departmentProfiles).where(eq(departmentProfiles.id, req.params.id));
  res.json({ ok: true });
}));

router.get("/manuals", wrap(async (_req, res) => {
  const all = await db.select().from(companyManuals);
  res.json(all);
}));

router.post("/manuals", wrap(async (req, res) => {
  const data = req.body;
  await db.insert(companyManuals).values(data).onConflictDoUpdate({
    target: companyManuals.id,
    set: { ...data, updatedAt: new Date() },
  });
  res.json({ ok: true });
}));

router.delete("/manuals/:id", wrap(async (req, res) => {
  await db.delete(companyManuals).where(eq(companyManuals.id, req.params.id));
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
  if (data.doctors) {
    for (const d of data.doctors) {
      await db.insert(doctors).values(d).onConflictDoUpdate({ target: doctors.id, set: { ...d, updatedAt: new Date() } });
    }
  }
  if (data.visitLogs) {
    for (const v of data.visitLogs) {
      await db.insert(visitLogs).values(v).onConflictDoUpdate({ target: visitLogs.id, set: v });
    }
  }
  if (data.snippets) {
    for (const s of data.snippets) {
      await db.insert(goldenSnippets).values(s).onConflictDoUpdate({ target: goldenSnippets.id, set: s });
    }
  }
  if (data.hospitals) {
    for (const h of data.hospitals) {
      await db.insert(hospitalProfiles).values(h).onConflictDoUpdate({ target: hospitalProfiles.id, set: { ...h, updatedAt: new Date() } });
    }
  }
  if (data.departments) {
    for (const d of data.departments) {
      await db.insert(departmentProfiles).values(d).onConflictDoUpdate({ target: departmentProfiles.id, set: { ...d, updatedAt: new Date() } });
    }
  }
  if (data.manuals) {
    for (const m of data.manuals) {
      await db.insert(companyManuals).values(m).onConflictDoUpdate({ target: companyManuals.id, set: { ...m, updatedAt: new Date() } });
    }
  }
  res.json({ ok: true });
}));

export default router;
