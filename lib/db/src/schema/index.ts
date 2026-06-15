import { pgTable, text, serial, timestamp, jsonb, integer, varchar } from "drizzle-orm/pg-core";

export const doctors = pgTable("doctors", {
  id: varchar("id", { length: 100 }).primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  hospital: varchar("hospital", { length: 200 }).notNull().default(""),
  department: varchar("department", { length: 200 }).notNull().default(""),
  position: varchar("position", { length: 100 }).notNull().default("교수"),
  traits: jsonb("traits").notNull().default([]),
  objections: jsonb("objections").notNull().default([]),
  notes: text("notes").notNull().default(""),
  prescriptionTendency: text("prescription_tendency").notNull().default(""),
  interestAreas: text("interest_areas").notNull().default(""),
  conversationHistory: jsonb("conversation_history").notNull().default([]),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const visitLogs = pgTable("visit_logs", {
  id: varchar("id", { length: 100 }).primaryKey(),
  doctorId: varchar("doctor_id", { length: 100 }).notNull(),
  visitDate: varchar("visit_date", { length: 50 }).notNull(),
  rawNotes: text("raw_notes").notNull().default(""),
  formattedLog: text("formatted_log").notNull().default(""),
  nextStrategy: text("next_strategy").notNull().default(""),
  aiEditHint: text("ai_edit_hint").notNull().default(""),
  products: jsonb("products").notNull().default([]),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const visitLogFeedbackEvents = pgTable("visit_log_feedback_events", {
  id: varchar("id", { length: 100 }).primaryKey(),
  eventType: varchar("event_type", { length: 50 }).notNull(),
  visitLogId: varchar("visit_log_id", { length: 100 }).notNull().default(""),
  doctorId: varchar("doctor_id", { length: 100 }).notNull().default(""),
  doctorName: varchar("doctor_name", { length: 100 }).notNull().default(""),
  hospital: varchar("hospital", { length: 200 }).notNull().default(""),
  department: varchar("department", { length: 200 }).notNull().default(""),
  products: jsonb("products").notNull().default([]),
  rawNotes: text("raw_notes").notNull().default(""),
  originalFormattedLog: text("original_formatted_log").notNull().default(""),
  originalNextStrategy: text("original_next_strategy").notNull().default(""),
  editedFormattedLog: text("edited_formatted_log").notNull().default(""),
  editedNextStrategy: text("edited_next_strategy").notNull().default(""),
  diffSummary: text("diff_summary").notNull().default(""),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const aiGenerationPreferences = pgTable("ai_generation_preferences", {
  id: varchar("id", { length: 160 }).primaryKey(),
  scope: varchar("scope", { length: 50 }).notNull(),
  scopeKey: varchar("scope_key", { length: 200 }).notNull().default(""),
  forbiddenPatterns: jsonb("forbidden_patterns").notNull().default([]),
  preferredPatterns: jsonb("preferred_patterns").notNull().default([]),
  avoidedPatientGroups: jsonb("avoided_patient_groups").notNull().default([]),
  preferredDetailAxes: jsonb("preferred_detail_axes").notNull().default([]),
  preferredTone: text("preferred_tone").notNull().default(""),
  averageLength: integer("average_length").notNull().default(0),
  confidence: integer("confidence").notNull().default(0),
  summary: text("summary").notNull().default(""),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const externalCasePatterns = pgTable("external_case_patterns", {
  id: varchar("id", { length: 100 }).primaryKey(),
  department: varchar("department", { length: 200 }).notNull().default(""),
  product: varchar("product", { length: 200 }).notNull().default(""),
  patientGroup: text("patient_group").notNull().default(""),
  detailAxis: text("detail_axis").notNull().default(""),
  reactionPattern: text("reaction_pattern").notNull().default(""),
  nextAction: text("next_action").notNull().default(""),
  sourceSummary: text("source_summary").notNull().default(""),
  styleExampleMemo: text("style_example_memo").notNull().default(""),
  confidence: integer("confidence").notNull().default(60),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const goldenSnippets = pgTable("golden_snippets", {
  id: varchar("id", { length: 100 }).primaryKey(),
  content: text("content").notNull(),
  context: text("context").notNull().default(""),
  tags: jsonb("tags").notNull().default([]),
  product: varchar("product", { length: 200 }).notNull().default(""),
  effectiveness: integer("effectiveness").notNull().default(5),
  analysis: text("analysis").notNull().default(""),
  analyzedAt: timestamp("analyzed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const hospitalProfiles = pgTable("hospital_profiles", {
  id: varchar("id", { length: 100 }).primaryKey(),
  name: varchar("name", { length: 200 }).notNull(),
  region: varchar("region", { length: 100 }).notNull().default(""),
  hospitalType: varchar("hospital_type", { length: 50 }).notNull().default("other"),
  characteristics: text("characteristics").notNull().default(""),
  keyDepartments: text("key_departments").notNull().default(""),
  competitorStrength: text("competitor_strength").notNull().default(""),
  notes: text("notes").notNull().default(""),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const departmentProfiles = pgTable("department_profiles", {
  id: varchar("id", { length: 100 }).primaryKey(),
  hospitalId: varchar("hospital_id", { length: 100 }).notNull(),
  hospitalName: varchar("hospital_name", { length: 200 }).notNull().default(""),
  departmentName: varchar("department_name", { length: 200 }).notNull(),
  characteristics: text("characteristics").notNull().default(""),
  mainProducts: jsonb("main_products").notNull().default([]),
  competitorProducts: text("competitor_products").notNull().default(""),
  notes: text("notes").notNull().default(""),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const companyManuals = pgTable("company_manuals", {
  id: varchar("id", { length: 100 }).primaryKey(),
  title: varchar("title", { length: 500 }).notNull(),
  content: text("content").notNull(),
  category: varchar("category", { length: 50 }).notNull().default("other"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type Doctor = typeof doctors.$inferSelect;
export type InsertDoctor = typeof doctors.$inferInsert;
export type VisitLog = typeof visitLogs.$inferSelect;
export type InsertVisitLog = typeof visitLogs.$inferInsert;
export type VisitLogFeedbackEvent = typeof visitLogFeedbackEvents.$inferSelect;
export type InsertVisitLogFeedbackEvent = typeof visitLogFeedbackEvents.$inferInsert;
export type AiGenerationPreference = typeof aiGenerationPreferences.$inferSelect;
export type InsertAiGenerationPreference = typeof aiGenerationPreferences.$inferInsert;
export type ExternalCasePattern = typeof externalCasePatterns.$inferSelect;
export type InsertExternalCasePattern = typeof externalCasePatterns.$inferInsert;
export type GoldenSnippet = typeof goldenSnippets.$inferSelect;
export type InsertGoldenSnippet = typeof goldenSnippets.$inferInsert;
export type HospitalProfile = typeof hospitalProfiles.$inferSelect;
export type InsertHospitalProfile = typeof hospitalProfiles.$inferInsert;
export type DepartmentProfile = typeof departmentProfiles.$inferSelect;
export type InsertDepartmentProfile = typeof departmentProfiles.$inferInsert;
export type CompanyManual = typeof companyManuals.$inferSelect;
export type InsertCompanyManual = typeof companyManuals.$inferInsert;
