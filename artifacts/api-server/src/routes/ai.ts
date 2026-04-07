import { Router } from "express";

const router = Router();

const ALLOWED_ROLES = new Set(["system", "user", "assistant"]);

function validateChatBody(body: unknown): body is {
  model: string;
  messages: { role: string; content: string }[];
  max_completion_tokens?: number;
} {
  if (!body || typeof body !== "object") return false;
  const b = body as Record<string, unknown>;
  if (typeof b.model !== "string" || b.model.length > 64) return false;
  if (!Array.isArray(b.messages) || b.messages.length === 0 || b.messages.length > 20) return false;
  for (const msg of b.messages) {
    if (!msg || typeof msg !== "object") return false;
    const m = msg as Record<string, unknown>;
    if (!ALLOWED_ROLES.has(m.role as string)) return false;
    if (typeof m.content !== "string" || m.content.length > 20000) return false;
  }
  if (b.max_completion_tokens !== undefined) {
    if (
      typeof b.max_completion_tokens !== "number" ||
      b.max_completion_tokens <= 0 ||
      b.max_completion_tokens > 16384
    ) return false;
  }
  return true;
}

const requestCounts = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 20;
const RATE_WINDOW_MS = 60_000;

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = requestCounts.get(ip);
  if (!entry || entry.resetAt <= now) {
    requestCounts.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return false;
  }
  if (entry.count >= RATE_LIMIT) return true;
  entry.count++;
  return false;
}

function isAllowedOrigin(origin: string): boolean {
  let originHost: string;
  try {
    originHost = new URL(origin).hostname;
  } catch {
    return false;
  }

  if (originHost === "localhost" || originHost === "127.0.0.1") {
    return true;
  }

  const replDomain = process.env["REPLIT_DEV_DOMAIN"] ?? "";
  if (replDomain && originHost.endsWith(replDomain)) {
    return true;
  }

  return false;
}

router.post("/ai/chat", async (req, res) => {
  const origin = req.headers.origin;

  if (!origin) {
    res.status(403).json({ error: "Origin header is required" });
    return;
  }

  if (!isAllowedOrigin(origin)) {
    res.status(403).json({ error: "Origin not allowed" });
    return;
  }

  const clientIp =
    (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ??
    req.socket.remoteAddress ??
    "unknown";

  if (isRateLimited(clientIp)) {
    res.status(429).json({ error: "Too many requests — please wait before retrying" });
    return;
  }

  if (!validateChatBody(req.body)) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  const baseUrl = process.env["AI_INTEGRATIONS_OPENAI_BASE_URL"];
  const apiKey = process.env["AI_INTEGRATIONS_OPENAI_API_KEY"];

  if (!baseUrl || !apiKey) {
    res.status(503).json({ error: "AI integration not configured" });
    return;
  }

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: req.body.model,
        messages: req.body.messages,
        ...(req.body.max_completion_tokens !== undefined
          ? { max_completion_tokens: req.body.max_completion_tokens }
          : {}),
      }),
    });

    const data = await response.json();
    res.status(response.status).json(data);
  } catch (err) {
    res.status(500).json({ error: "AI request failed", detail: String(err) });
  }
});

export default router;
