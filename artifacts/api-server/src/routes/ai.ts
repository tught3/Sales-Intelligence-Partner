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
    if (typeof b.max_completion_tokens !== "number" || b.max_completion_tokens <= 0 || b.max_completion_tokens > 16384) return false;
  }
  return true;
}

router.post("/ai/chat", async (req, res) => {
  const origin = req.headers.origin;
  const host = req.headers.host ?? "";

  if (origin) {
    try {
      const originHost = new URL(origin).host;
      if (originHost !== host) {
        res.status(403).json({ error: "Cross-origin requests are not allowed" });
        return;
      }
    } catch {
      res.status(403).json({ error: "Invalid origin" });
      return;
    }
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
