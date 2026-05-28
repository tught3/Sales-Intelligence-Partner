import { pool } from "@workspace/db";

export async function ensureDatabaseSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS doctors (
      id varchar(100) PRIMARY KEY,
      name varchar(100) NOT NULL,
      hospital varchar(200) NOT NULL DEFAULT '',
      department varchar(200) NOT NULL DEFAULT '',
      position varchar(100) NOT NULL DEFAULT '교수',
      traits jsonb NOT NULL DEFAULT '[]'::jsonb,
      objections jsonb NOT NULL DEFAULT '[]'::jsonb,
      notes text NOT NULL DEFAULT '',
      prescription_tendency text NOT NULL DEFAULT '',
      interest_areas text NOT NULL DEFAULT '',
      conversation_history jsonb NOT NULL DEFAULT '[]'::jsonb,
      created_at timestamp NOT NULL DEFAULT now(),
      updated_at timestamp NOT NULL DEFAULT now()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS visit_logs (
      id varchar(100) PRIMARY KEY,
      doctor_id varchar(100) NOT NULL,
      visit_date varchar(50) NOT NULL,
      raw_notes text NOT NULL DEFAULT '',
      formatted_log text NOT NULL DEFAULT '',
      next_strategy text NOT NULL DEFAULT '',
      ai_edit_hint text NOT NULL DEFAULT '',
      products jsonb NOT NULL DEFAULT '[]'::jsonb,
      created_at timestamp NOT NULL DEFAULT now()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS visit_log_feedback_events (
      id varchar(100) PRIMARY KEY,
      event_type varchar(50) NOT NULL,
      visit_log_id varchar(100) NOT NULL DEFAULT '',
      doctor_id varchar(100) NOT NULL DEFAULT '',
      doctor_name varchar(100) NOT NULL DEFAULT '',
      hospital varchar(200) NOT NULL DEFAULT '',
      department varchar(200) NOT NULL DEFAULT '',
      products jsonb NOT NULL DEFAULT '[]'::jsonb,
      raw_notes text NOT NULL DEFAULT '',
      original_formatted_log text NOT NULL DEFAULT '',
      original_next_strategy text NOT NULL DEFAULT '',
      edited_formatted_log text NOT NULL DEFAULT '',
      edited_next_strategy text NOT NULL DEFAULT '',
      diff_summary text NOT NULL DEFAULT '',
      created_at timestamp NOT NULL DEFAULT now()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ai_generation_preferences (
      id varchar(160) PRIMARY KEY,
      scope varchar(50) NOT NULL,
      scope_key varchar(200) NOT NULL DEFAULT '',
      forbidden_patterns jsonb NOT NULL DEFAULT '[]'::jsonb,
      preferred_patterns jsonb NOT NULL DEFAULT '[]'::jsonb,
      avoided_patient_groups jsonb NOT NULL DEFAULT '[]'::jsonb,
      preferred_detail_axes jsonb NOT NULL DEFAULT '[]'::jsonb,
      preferred_tone text NOT NULL DEFAULT '',
      average_length integer NOT NULL DEFAULT 0,
      confidence integer NOT NULL DEFAULT 0,
      summary text NOT NULL DEFAULT '',
      updated_at timestamp NOT NULL DEFAULT now()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS golden_snippets (
      id varchar(100) PRIMARY KEY,
      content text NOT NULL,
      context text NOT NULL DEFAULT '',
      tags jsonb NOT NULL DEFAULT '[]'::jsonb,
      product varchar(200) NOT NULL DEFAULT '',
      effectiveness integer NOT NULL DEFAULT 5,
      analysis text NOT NULL DEFAULT '',
      analyzed_at timestamp,
      created_at timestamp NOT NULL DEFAULT now()
    );
  `);

  await pool.query(`
    ALTER TABLE golden_snippets
      ADD COLUMN IF NOT EXISTS analysis text NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS analyzed_at timestamp;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS hospital_profiles (
      id varchar(100) PRIMARY KEY,
      name varchar(200) NOT NULL,
      region varchar(100) NOT NULL DEFAULT '',
      hospital_type varchar(50) NOT NULL DEFAULT 'other',
      characteristics text NOT NULL DEFAULT '',
      key_departments text NOT NULL DEFAULT '',
      competitor_strength text NOT NULL DEFAULT '',
      notes text NOT NULL DEFAULT '',
      updated_at timestamp NOT NULL DEFAULT now()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS department_profiles (
      id varchar(100) PRIMARY KEY,
      hospital_id varchar(100) NOT NULL,
      hospital_name varchar(200) NOT NULL DEFAULT '',
      department_name varchar(200) NOT NULL,
      characteristics text NOT NULL DEFAULT '',
      main_products jsonb NOT NULL DEFAULT '[]'::jsonb,
      competitor_products text NOT NULL DEFAULT '',
      notes text NOT NULL DEFAULT '',
      updated_at timestamp NOT NULL DEFAULT now()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS company_manuals (
      id varchar(100) PRIMARY KEY,
      title varchar(500) NOT NULL,
      content text NOT NULL,
      category varchar(50) NOT NULL DEFAULT 'other',
      updated_at timestamp NOT NULL DEFAULT now()
    );
  `);
}

export async function runDataMigrations() {
  try {
    await ensureDatabaseSchema();

    const migrations: Array<{ id: string; value: string }> = [
      { id: "doc-1775561165326-4", value: "간담췌외과" },
      { id: "doc-1775561202710-5", value: "간담췌외과" },
    ];

    for (const m of migrations) {
      const { rows } = await pool.query<{ department: string }>(
        "SELECT department FROM doctors WHERE id = $1",
        [m.id],
      );
      const doc = rows[0];

      if (doc && doc.department !== m.value) {
        await pool.query(
          "UPDATE doctors SET department = $1, updated_at = now() WHERE id = $2",
          [m.value, m.id],
        );

        console.info(
          { id: m.id, from: doc.department, to: m.value },
          "Data migration applied",
        );
      }
    }
  } catch (e) {
    console.warn({ err: e }, "Data migration skipped");
  }
}
