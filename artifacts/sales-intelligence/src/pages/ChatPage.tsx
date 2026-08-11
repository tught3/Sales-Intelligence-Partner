import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { copyText } from "@/lib/chat-clipboard";
import { Copy, Send, ShieldAlert, Users, Wifi, WifiOff, Loader2 } from "lucide-react";

const STORAGE_NAME_KEY = "sip-chat-name";
const MAX_BACKOFF_MS = 10000;

type ChatMessage = {
  id: string;
  sender: string;
  text: string;
  timestamp: string;
};

type ConnectionStatus = "connecting" | "connected" | "reconnecting" | "disconnected";

type ServerEvent =
  | { type: "history"; messages: ChatMessage[] }
  | { type: "text"; id: string; sender: string; text: string; timestamp: string }
  | { type: "system"; text: string; timestamp: string }
  | { type: "presence"; users: string[] };

function getWsUrl(): string {
  const envUrl = (import.meta.env as ImportMetaEnv & { VITE_CHAT_WS_URL?: string })
    .VITE_CHAT_WS_URL;
  if (envUrl) return envUrl;
  const proto = location.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${location.host}/api/chat/ws`;
}

export default function ChatPage() {
  const { toast } = useToast();

  const [name, setName] = useState<string>(() => {
    try {
      return localStorage.getItem(STORAGE_NAME_KEY) ?? "";
    } catch {
      return "";
    }
  });
  const [nameInput, setNameInput] = useState("");
  const [showNamePrompt, setShowNamePrompt] = useState(!name);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [presence, setPresence] = useState<string[]>([]);
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const [draft, setDraft] = useState("");

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttemptRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shouldReconnectRef = useRef(true);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const nameRef = useRef(name);
  nameRef.current = name;

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, []);

  const connect = useCallback(() => {
    if (!nameRef.current) return; // 이름이 없으면 연결하지 않음
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }

    setStatus((prev) => (prev === "connected" ? prev : reconnectAttemptRef.current > 0 ? "reconnecting" : "connecting"));

    let ws: WebSocket;
    try {
      ws = new WebSocket(getWsUrl());
    } catch {
      scheduleReconnect();
      return;
    }
    wsRef.current = ws;

    ws.onopen = () => {
      reconnectAttemptRef.current = 0;
      setStatus("connected");
      try {
        ws.send(JSON.stringify({ type: "join", name: nameRef.current }));
      } catch {
        // ignore
      }
    };

    ws.onmessage = (event) => {
      let data: ServerEvent;
      try {
        data = JSON.parse(event.data);
      } catch {
        return;
      }
      switch (data.type) {
        case "history":
          setMessages(data.messages ?? []);
          break;
        case "text":
          setMessages((prev) => [
            ...prev,
            { id: data.id, sender: data.sender, text: data.text, timestamp: data.timestamp },
          ]);
          break;
        case "system":
          setMessages((prev) => [
            ...prev,
            {
              id: `system-${Date.now()}-${Math.random().toString(36).slice(2)}`,
              sender: "system",
              text: data.text,
              timestamp: data.timestamp,
            },
          ]);
          break;
        case "presence":
          setPresence(data.users ?? []);
          break;
      }
    };

    ws.onclose = () => {
      wsRef.current = null;
      if (shouldReconnectRef.current) {
        setStatus("reconnecting");
        scheduleReconnect();
      } else {
        setStatus("disconnected");
      }
    };

    ws.onerror = () => {
      // onclose가 뒤따라 재연결을 처리한다
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const scheduleReconnect = useCallback(() => {
    if (!shouldReconnectRef.current || !nameRef.current) return;
    const attempt = reconnectAttemptRef.current;
    const delay = Math.min(1000 * Math.pow(2, attempt), MAX_BACKOFF_MS);
    reconnectAttemptRef.current = attempt + 1;
    if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    reconnectTimerRef.current = setTimeout(() => {
      connect();
    }, delay);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!name) return;
    shouldReconnectRef.current = true;
    connect();
    return () => {
      shouldReconnectRef.current = false;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [name, connect]);

  // 탭이 다시 보이면 끊긴 연결을 즉시 재시도
  useEffect(() => {
    function handleVisibility() {
      if (document.visibilityState !== "visible") return;
      if (!nameRef.current) return;
      const ws = wsRef.current;
      if (!ws || ws.readyState === WebSocket.CLOSED || ws.readyState === WebSocket.CLOSING) {
        reconnectAttemptRef.current = 0;
        connect();
      }
    }
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [connect]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  function handleSaveName() {
    const trimmed = nameInput.trim();
    if (!trimmed) return;
    try {
      localStorage.setItem(STORAGE_NAME_KEY, trimmed);
    } catch {
      // localStorage 사용 불가 환경 — 그래도 세션 내에서는 진행
    }
    setName(trimmed);
    setShowNamePrompt(false);
  }

  function sendCurrentDraft() {
    const text = draft;
    if (!text.trim()) return;
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      toast({ title: "연결이 끊어져 있습니다", description: "재연결 후 다시 시도해주세요", variant: "destructive" });
      return;
    }
    try {
      ws.send(JSON.stringify({ type: "text", text }));
      setDraft("");
    } catch {
      toast({ title: "전송 실패", variant: "destructive" });
    }
  }

  function handleInputKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendCurrentDraft();
    }
  }

  async function handleCopy(text: string) {
    const result = await copyText(text);
    if (result === "clipboard" || result === "execCommand") {
      toast({ title: "복사됨" });
    } else {
      toast({ title: "길게 눌러 복사하세요", variant: "destructive" });
    }
  }

  const statusInfo: Record<ConnectionStatus, { label: string; icon: React.ReactNode; variant: "default" | "secondary" | "destructive" | "outline" }> = {
    connecting: { label: "연결 중", icon: <Loader2 className="w-3 h-3 animate-spin" />, variant: "secondary" },
    connected: { label: "연결됨", icon: <Wifi className="w-3 h-3" />, variant: "default" },
    reconnecting: { label: "재연결 중", icon: <Loader2 className="w-3 h-3 animate-spin" />, variant: "secondary" },
    disconnected: { label: "끊김", icon: <WifiOff className="w-3 h-3" />, variant: "destructive" },
  };

  if (showNamePrompt) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 flex items-center justify-center min-h-[60vh]">
        <div className="w-full max-w-sm space-y-4 border border-border rounded-lg p-6 bg-card">
          <h1 className="text-xl font-bold text-foreground">채팅 참여</h1>
          <p className="text-sm text-muted-foreground">채팅에서 사용할 이름을 입력해주세요</p>
          <Input
            placeholder="이름"
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSaveName();
            }}
            autoFocus
          />
          <Button onClick={handleSaveName} disabled={!nameInput.trim()} className="w-full">
            입장
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 flex flex-col h-full min-h-[70vh]">
      <div className="mb-4 flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold text-foreground">채팅</h1>
          <p className="text-muted-foreground mt-1 text-sm">{name}(으)로 접속 중</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={statusInfo[status].variant} className="gap-1">
            {statusInfo[status].icon}
            {statusInfo[status].label}
          </Badge>
          {presence.length > 0 && (
            <Badge variant="outline" className="gap-1">
              <Users className="w-3 h-3" />
              {presence.length}명 접속 중
            </Badge>
          )}
        </div>
      </div>

      <div className="mb-3 flex items-center gap-2 text-xs text-orange-700 bg-orange-50 border border-orange-200 rounded-md px-3 py-2">
        <ShieldAlert className="w-3.5 h-3.5 flex-shrink-0" />
        환자·거래처 등 개인/민감 정보는 입력하지 마세요
      </div>

      <div className="flex-1 min-h-0 border border-border rounded-lg bg-card flex flex-col">
        <ScrollArea className="flex-1 p-4">
          <div className="select-text space-y-3">
            {messages.length === 0 && (
              <p className="text-center text-sm text-muted-foreground py-8">아직 메시지가 없습니다</p>
            )}
            {messages.map((msg) => {
              if (msg.sender === "system") {
                return (
                  <div key={msg.id} className="text-center text-xs text-muted-foreground select-text">
                    {msg.text}
                  </div>
                );
              }
              const isMine = msg.sender === name;
              return (
                <div key={msg.id} className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`group max-w-[75%] rounded-lg px-3 py-2 select-text ${
                      isMine
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-foreground"
                    }`}
                  >
                    {!isMine && (
                      <p className="text-xs font-semibold mb-0.5 opacity-80 select-text">{msg.sender}</p>
                    )}
                    <p className="text-sm whitespace-pre-wrap break-words select-text">{msg.text}</p>
                    <div className="flex items-center justify-between gap-2 mt-1">
                      <span className="text-[10px] opacity-60 select-text">
                        {new Date(msg.timestamp).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleCopy(msg.text)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-black/10"
                        title="복사"
                      >
                        <Copy className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>
        </ScrollArea>

        <div className="border-t border-border p-3 flex gap-2 items-end">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleInputKeyDown}
            placeholder="메시지를 입력하세요 (Enter 전송, Shift+Enter 줄바꿈)"
            rows={2}
            className="resize-none text-sm"
          />
          <Button onClick={sendCurrentDraft} disabled={!draft.trim()} size="icon" className="flex-shrink-0">
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
