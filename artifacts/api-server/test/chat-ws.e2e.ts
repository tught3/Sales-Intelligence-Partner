import assert from "node:assert/strict";
import http from "node:http";
import { WebSocket } from "ws";
import { attachChatWebSocket } from "../src/chat/chat-ws";

const OVERALL_TIMEOUT_MS = 10_000;

type ServerMessage =
  | { type: "history"; messages: Array<{ id: string; sender: string; text: string; timestamp: number }> }
  | { type: "text"; id: string; sender: string; text: string; timestamp: number }
  | { type: "system"; text: string; timestamp: number }
  | { type: "presence"; users: string[] };

function waitForMessage(
  ws: WebSocket,
  predicate: (msg: ServerMessage) => boolean,
  timeoutMs = 4000,
): Promise<ServerMessage> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.off("message", onMessage);
      reject(new Error("waitForMessage timed out"));
    }, timeoutMs);

    function onMessage(data: Buffer | string) {
      let parsed: ServerMessage;
      try {
        parsed = JSON.parse(data.toString());
      } catch {
        return;
      }
      if (predicate(parsed)) {
        clearTimeout(timer);
        ws.off("message", onMessage);
        resolve(parsed);
      }
    }

    ws.on("message", onMessage);
  });
}

function waitOpen(ws: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    ws.once("open", () => resolve());
    ws.once("error", (err) => reject(err));
  });
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main(): Promise<void> {
  const httpServer = http.createServer();
  attachChatWebSocket(httpServer);

  await new Promise<void>((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
  const address = httpServer.address();
  if (address === null || typeof address === "string") {
    throw new Error("Failed to obtain server address");
  }
  const wsUrl = `ws://127.0.0.1:${address.port}/api/chat/ws`;

  const clientA = new WebSocket(wsUrl);
  const clientB = new WebSocket(wsUrl);

  await Promise.all([waitOpen(clientA), waitOpen(clientB)]);

  // join both clients, drain their history/presence noise
  clientA.send(JSON.stringify({ type: "join", name: "Alice" }));
  await waitForMessage(clientA, (m) => m.type === "history");

  clientB.send(JSON.stringify({ type: "join", name: "Bob" }));
  await waitForMessage(clientB, (m) => m.type === "history");
  // Alice observes Bob's system/presence noise; drain it before the real test.
  await delay(200);

  // (a) + (b): A sends a text message, B receives it byte-for-byte identical
  const originalText = "안녕하세요 이모지 테스트 😀\n두번째 줄입니다.";
  const bTextPromise = waitForMessage(clientB, (m) => m.type === "text" && m.text === originalText);
  clientA.send(JSON.stringify({ type: "text", text: originalText }));
  const received = await bTextPromise;
  assert.equal(received.type, "text");
  if (received.type === "text") {
    assert.equal(received.text, originalText, "received text must be byte-for-byte identical to original");
    assert.equal(received.sender, "Alice");
  }

  // second message so history has 2 entries to verify ordering/content
  const secondText = "두 번째 메시지";
  const bSecondPromise = waitForMessage(clientB, (m) => m.type === "text" && m.text === secondText);
  clientA.send(JSON.stringify({ type: "text", text: secondText }));
  await bSecondPromise;

  // (c) a newly joined client C receives history (up to 50) including the messages above
  const clientC = new WebSocket(wsUrl);
  await waitOpen(clientC);
  const historyPromise = waitForMessage(clientC, (m) => m.type === "history");
  clientC.send(JSON.stringify({ type: "join", name: "Carol" }));
  const historyMsg = await historyPromise;
  assert.equal(historyMsg.type, "history");
  if (historyMsg.type === "history") {
    assert.ok(historyMsg.messages.length <= 50, "history must not exceed 50 messages");
    const texts = historyMsg.messages.map((m) => m.text);
    assert.ok(texts.includes(originalText), "history must include first message");
    assert.ok(texts.includes(secondText), "history must include second message");
  }

  // (d) oversized text (>4000 chars) must be rejected, not broadcast to other clients
  const oversized = "x".repeat(4001);
  let oversizedReceived = false;
  const oversizedListener = (data: Buffer | string) => {
    try {
      const parsed: ServerMessage = JSON.parse(data.toString());
      if (parsed.type === "text" && parsed.text === oversized) {
        oversizedReceived = true;
      }
    } catch {
      // ignore
    }
  };
  clientC.on("message", oversizedListener);
  clientA.send(JSON.stringify({ type: "text", text: oversized }));
  await delay(500);
  clientC.off("message", oversizedListener);
  assert.equal(oversizedReceived, false, "oversized message must not be broadcast");

  // (e) malformed JSON must not crash the server; subsequent valid messages still work
  clientA.send("{ this is not valid json");
  clientA.send(JSON.stringify({ type: "text" })); // missing text field, invalid schema
  clientA.send(JSON.stringify({ type: "unknown-type", foo: "bar" })); // unknown type

  await delay(300);

  const recoveryText = "복구 확인 메시지";
  const recoveryPromise = waitForMessage(clientC, (m) => m.type === "text" && m.text === recoveryText);
  clientA.send(JSON.stringify({ type: "text", text: recoveryText }));
  const recovered = await recoveryPromise;
  assert.equal(recovered.type, "text");
  if (recovered.type === "text") {
    assert.equal(recovered.text, recoveryText, "server must keep processing valid messages after malformed input");
  }

  clientA.close();
  clientB.close();
  clientC.close();
  await new Promise<void>((resolve, reject) => {
    httpServer.close((err) => (err ? reject(err) : resolve()));
  });

  console.log("chat-ws.e2e.ts: all assertions passed");
}

const overallTimer = setTimeout(() => {
  console.error(`chat-ws.e2e.ts: overall timeout after ${OVERALL_TIMEOUT_MS}ms`);
  process.exit(1);
}, OVERALL_TIMEOUT_MS);
overallTimer.unref();

main()
  .then(() => {
    clearTimeout(overallTimer);
    process.exit(0);
  })
  .catch((err) => {
    clearTimeout(overallTimer);
    console.error("chat-ws.e2e.ts: FAILED");
    console.error(err);
    process.exit(1);
  });
