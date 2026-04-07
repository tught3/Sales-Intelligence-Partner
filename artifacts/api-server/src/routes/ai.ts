import { Router } from "express";

const router = Router();

const ALLOWED_MODELS = new Set([
  "claude-sonnet-4-6",
  "claude-haiku-4-5",
  "claude-opus-4-6",
]);

type ContentBlock =
  | string
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

function validateChatBody(body: unknown): body is {
  model: string;
  messages: { role: string; content: ContentBlock | ContentBlock[] }[];
  max_completion_tokens?: number;
} {
  if (!body || typeof body !== "object") return false;
  const b = body as Record<string, unknown>;
  if (typeof b.model !== "string" || !ALLOWED_MODELS.has(b.model)) return false;
  if (!Array.isArray(b.messages) || b.messages.length === 0 || b.messages.length > 20) return false;
  for (const msg of b.messages) {
    if (!msg || typeof msg !== "object") return false;
    const m = msg as Record<string, unknown>;
    const role = m.role as string;
    if (!["system", "user", "assistant"].includes(role)) return false;
    if (typeof m.content !== "string" && !Array.isArray(m.content)) return false;
    if (typeof m.content === "string" && m.content.length > 30000) return false;
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

  // Replit dev 환경 도메인
  const replDomain = process.env["REPLIT_DEV_DOMAIN"] ?? "";
  if (replDomain && originHost.endsWith(replDomain)) {
    return true;
  }

  // Replit 배포(published) 환경 도메인
  if (originHost.endsWith(".replit.app") || originHost.endsWith(".replit.dev")) {
    return true;
  }

  return false;
}

function convertToAnthropicContent(
  content: ContentBlock | ContentBlock[]
): Array<{ type: string; [key: string]: unknown }> {
  const blocks = Array.isArray(content) ? content : [content];
  return blocks.map((block) => {
    if (typeof block === "string") {
      return { type: "text", text: block };
    }
    if (block.type === "image_url") {
      const url = block.image_url.url;
      const match = url.match(/^data:([^;]+);base64,(.+)$/);
      if (match) {
        return {
          type: "image",
          source: {
            type: "base64",
            media_type: match[1] as string,
            data: match[2] as string,
          },
        };
      }
      return { type: "text", text: `[이미지: ${url}]` };
    }
    return block as { type: string; [key: string]: unknown };
  });
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

  const baseUrl = process.env["AI_INTEGRATIONS_ANTHROPIC_BASE_URL"];
  const apiKey = process.env["AI_INTEGRATIONS_ANTHROPIC_API_KEY"];

  if (!baseUrl || !apiKey) {
    res.status(503).json({ error: "AI integration not configured" });
    return;
  }

  const { model, messages, max_completion_tokens } = req.body;

  let systemPrompt: string | undefined;
  const anthropicMessages: Array<{ role: string; content: unknown }> = [];

  for (const msg of messages) {
    if (msg.role === "system") {
      systemPrompt = typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content);
    } else {
      const converted = convertToAnthropicContent(msg.content as ContentBlock | ContentBlock[]);
      anthropicMessages.push({
        role: msg.role,
        content: converted.length === 1 && converted[0].type === "text"
          ? (converted[0] as { type: string; text: string }).text
          : converted,
      });
    }
  }

  const anthropicBody: Record<string, unknown> = {
    model,
    max_tokens: max_completion_tokens ?? 8192,
    messages: anthropicMessages,
  };
  if (systemPrompt) {
    anthropicBody["system"] = systemPrompt;
  }

  try {
    const response = await fetch(`${baseUrl}/v1/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(anthropicBody),
    });

    const data = await response.json() as {
      content?: Array<{ type: string; text?: string }>;
      error?: { message: string };
    };

    if (!response.ok) {
      res.status(response.status).json({ error: data.error?.message ?? "AI request failed" });
      return;
    }

    const textBlock = data.content?.find((b) => b.type === "text");
    const text = textBlock?.text ?? "";

    res.json({
      choices: [{ message: { role: "assistant", content: text } }],
    });
  } catch (err) {
    res.status(500).json({ error: "AI request failed", detail: String(err) });
  }
});

export default router;
