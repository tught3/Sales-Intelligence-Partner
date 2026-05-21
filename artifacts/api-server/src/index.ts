import app from "./app";
import { runDataMigrations } from "./bootstrap";
import { logger } from "./lib/logger";

const rawPort = process.env["API_SERVER_PORT"] ?? process.env["PORT"];

if (!rawPort) {
  throw new Error("PORT environment variable is required but was not provided.");
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, "0.0.0.0", (err?: Error) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port, host: "0.0.0.0" }, "Server listening");
});

runDataMigrations().catch((err) => {
  logger.warn({ err }, "Data migration failed after server startup");
});
