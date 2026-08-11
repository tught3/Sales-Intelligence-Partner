import type http from "node:http";
import { randomUUID } from "node:crypto";
import { WebSocketServer, WebSocket } from "ws";
import { logger } from "../lib/logger";

const CHAT_WS_PATH = "/api/chat/ws";
const HISTORY_LIMIT = 50;
const MAX_TEXT_LENGTH = 4000;
const MAX_NAME_LENGTH = 20;
const DEFAULT_NAME = "이름 없음";
const RATE_LIMIT_WINDOW_MS = 10_000;
const RATE_LIMIT_MAX_MESSAGES = 20;
const HEARTBEAT_INTERVAL_MS = 30_000;

export type ChatMessage = {
  id: string;
  sender: string;
  text: string;
  timestamp: number;
};

type ClientToServerMessage =
  | { type: "join"; name: string }
  | { type: "text"; text: string };

type ServerToClientMessage =
  | { type: "history"; messages: ChatMessage[] }
  | { type: "text"; id: string; sender: string; text: string; timestamp: number }
  | { type: "system"; text: string; timestamp: number }
  | { type: "presence"; users: string[] };

type ChatSession = {
  id: string;
  ws: WebSocket;
  name: string | null;
  isAlive: boolean;
  rateWindowStart: number;
  rateCount: number;
};

// 인메모리 상태 (서버 재시작 시 소실 허용). DB 저장 절대 금지.
const sessions = new Map<string, ChatSession>();
const history: ChatMessage[] = [];

function normalizeName(rawName: unknown): string {
  if (typeof rawName !== "string") {
    return DEFAULT_NAME;
  }
  const trimmed = rawName.trim().slice(0, MAX_NAME_LENGTH);
  return trimmed.length > 0 ? trimmed : DEFAULT_NAME;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseClientMessage(raw: unknown): ClientToServerMessage | null {
  if (typeof raw !== "string") {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (!isPlainObject(parsed)) {
    return null;
  }

  if (parsed["type"] === "join") {
    if (typeof parsed["name"] !== "string") {
      return null;
    }
    return { type: "join", name: parsed["name"] };
  }

  if (parsed["type"] === "text") {
    if (typeof parsed["text"] !== "string") {
      return null;
    }
    return { type: "text", text: parsed["text"] };
  }

  return null;
}

function send(ws: WebSocket, message: ServerToClientMessage): void {
  if (ws.readyState !== WebSocket.OPEN) {
    return;
  }
  try {
    ws.send(JSON.stringify(message));
  } catch (err) {
    logger.warn({ err }, "Failed to send chat message");
  }
}

function broadcast(message: ServerToClientMessage): void {
  for (const session of sessions.values()) {
    send(session.ws, message);
  }
}

function currentPresence(): string[] {
  const names: string[] = [];
  for (const session of sessions.values()) {
    if (session.name) {
      names.push(session.name);
    }
  }
  return names;
}

function broadcastPresence(): void {
  broadcast({ type: "presence", users: currentPresence() });
}

function pushHistory(message: ChatMessage): void {
  history.push(message);
  if (history.length > HISTORY_LIMIT) {
    history.splice(0, history.length - HISTORY_LIMIT);
  }
}

function isRateLimited(session: ChatSession): boolean {
  const now = Date.now();
  if (now - session.rateWindowStart >= RATE_LIMIT_WINDOW_MS) {
    session.rateWindowStart = now;
    session.rateCount = 0;
  }
  session.rateCount += 1;
  return session.rateCount > RATE_LIMIT_MAX_MESSAGES;
}

function handleJoin(session: ChatSession, name: string): void {
  session.name = normalizeName(name);

  send(session.ws, { type: "history", messages: history.slice(-HISTORY_LIMIT) });

  broadcast({
    type: "system",
    text: `${session.name}님이 입장했습니다.`,
    timestamp: Date.now(),
  });

  broadcastPresence();
}

function handleText(session: ChatSession, text: string): void {
  if (!session.name) {
    // join 이전에는 메시지를 처리하지 않는다 (조용히 무시).
    return;
  }
  if (typeof text !== "string" || text.length === 0 || text.length > MAX_TEXT_LENGTH) {
    return;
  }
  if (isRateLimited(session)) {
    return;
  }

  const message: ChatMessage = {
    id: randomUUID(),
    sender: session.name,
    text,
    timestamp: Date.now(),
  };

  pushHistory(message);

  broadcast({
    type: "text",
    id: message.id,
    sender: message.sender,
    text: message.text,
    timestamp: message.timestamp,
  });
}

function handleClose(session: ChatSession): void {
  sessions.delete(session.id);

  if (session.name) {
    broadcast({
      type: "system",
      text: `${session.name}님이 퇴장했습니다.`,
      timestamp: Date.now(),
    });
    broadcastPresence();
  }
}

/** 현재 접속자 수 (헬스체크 등에서 사용) */
export function getOnlineCount(): number {
  return sessions.size;
}

/** 버퍼된 메시지 수 (헬스체크 등에서 사용) */
export function getBufferedMessageCount(): number {
  return history.length;
}

export function attachChatWebSocket(server: http.Server): void {
  const wss = new WebSocketServer({ server, path: CHAT_WS_PATH });

  const heartbeat = setInterval(() => {
    for (const session of sessions.values()) {
      if (!session.isAlive) {
        session.ws.terminate();
        continue;
      }
      session.isAlive = false;
      try {
        session.ws.ping();
      } catch (err) {
        logger.warn({ err }, "Failed to ping chat websocket client");
      }
    }
  }, HEARTBEAT_INTERVAL_MS);

  wss.on("close", () => {
    clearInterval(heartbeat);
  });

  wss.on("connection", (ws: WebSocket) => {
    const session: ChatSession = {
      id: randomUUID(),
      ws,
      name: null,
      isAlive: true,
      rateWindowStart: Date.now(),
      rateCount: 0,
    };
    sessions.set(session.id, session);

    ws.on("pong", () => {
      session.isAlive = true;
    });

    ws.on("message", (data) => {
      let raw: string;
      try {
        raw = data.toString();
      } catch {
        return;
      }

      const message = parseClientMessage(raw);
      if (!message) {
        // 잘못된 형식이면 그 메시지만 무시하고 계속 처리한다.
        return;
      }

      try {
        if (message.type === "join") {
          handleJoin(session, message.name);
        } else if (message.type === "text") {
          handleText(session, message.text);
        }
      } catch (err) {
        logger.warn({ err }, "Error handling chat websocket message");
      }
    });

    ws.on("close", () => {
      handleClose(session);
    });

    ws.on("error", (err) => {
      logger.warn({ err }, "Chat websocket connection error");
    });
  });

  wss.on("error", (err) => {
    logger.error({ err }, "Chat websocket server error");
  });
}
