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
  products: jsonb("products").notNull().default([]),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const goldenSnippets = pgTable("golden_snippets", {
  id: varchar("id", { length: 100 }).primaryKey(),
  content: text("content").notNull(),
  context: text("context").notNull().default(""),
  tags: jsonb("tags").notNull().default([]),
  product: varchar("product", { length: 200 }).notNull().default(""),
  effectiveness: integer("effectiveness").notNull().default(5),
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
export type GoldenSnippet = typeof goldenSnippets.$inferSelect;
export type InsertGoldenSnippet = typeof goldenSnippets.$inferInsert;
export type HospitalProfile = typeof hospitalProfiles.$inferSelect;
export type InsertHospitalProfile = typeof hospitalProfiles.$inferInsert;
export type DepartmentProfile = typeof departmentProfiles.$inferSelect;
export type InsertDepartmentProfile = typeof departmentProfiles.$inferInsert;
export type CompanyManual = typeof companyManuals.$inferSelect;
export type InsertCompanyManual = typeof companyManuals.$inferInsert;
