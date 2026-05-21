import type { IncomingMessage, ServerResponse } from "node:http";
import app from "../../api-server/src/app";
import { runDataMigrations } from "../../api-server/src/bootstrap";

export const config = {
  maxDuration: 60,
};

let readyPromise: Promise<void> | undefined;

function ensureReady() {
  readyPromise ??= runDataMigrations();
  return readyPromise;
}

export default async function handler(
  req: IncomingMessage,
  res: ServerResponse,
) {
  await ensureReady();
  return app(req, res);
}
