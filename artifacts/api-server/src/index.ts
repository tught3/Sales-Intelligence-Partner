import app from "./app";
import { logger } from "./lib/logger";
import { db } from "@workspace/db";
import { doctors } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

async function runDataMigrations() {
  try {
    const migrations: Array<{ id: string; field: string; value: string }> = [
      { id: "doc-1775561165326-4", field: "department", value: "간담췌외과" },
      { id: "doc-1775561202710-5", field: "department", value: "간담췌외과" },
    ];

    for (const m of migrations) {
      const [doc] = await db.select().from(doctors).where(eq(doctors.id, m.id));

      if (doc && doc.department !== m.value) {
        await db
          .update(doctors)
          .set({
            department: m.value,
            updatedAt: new Date(),
          })
          .where(eq(doctors.id, m.id));

        logger.info(
          { id: m.id, from: doc.department, to: m.value },
          "Data migration applied",
        );
      }
    }
  } catch (e) {
    logger.warn({ err: e }, "Data migration skipped");
  }
}

const rawPort = process.env["PORT"] ?? process.env["API_SERVER_PORT"];

if (!rawPort) {
  throw new Error("PORT environment variable is required but was not provided.");
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

runDataMigrations().then(() => {
  app.listen(port, "0.0.0.0", (err?: Error) => {
    if (err) {
      logger.error({ err }, "Error listening on port");
      process.exit(1);
    }

    logger.info({ port, host: "0.0.0.0" }, "Server listening");
  });
});