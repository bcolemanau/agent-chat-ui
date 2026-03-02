"use client";

import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Message = { id: string; role: "user" | "assistant"; content: string };

export function GcpProxyChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || loading) return;

    setInput("");
    setError(null);
    const userMsg: Message = {
      id: `u-${Date.now()}`,
      role: "user",
      content: text,
    };
    setMessages((prev) => [...prev, userMsg]);
    const assistantId = `a-${Date.now()}`;
    setMessages((prev) => [...prev, { id: assistantId, role: "assistant", content: "" }]);
    setLoading(true);

    try {
      const res = await fetch("/api/gcp-proxy-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, stream: true }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(err.detail || `HTTP ${res.status}`);
      }

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      if (!reader) {
        const data = await res.json().catch(() => ({}));
        const content =
          typeof data.message === "string"
            ? data.message
            : typeof data.content === "string"
              ? data.content
              : typeof data.text === "string"
                ? data.text
                : JSON.stringify(data);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId ? { ...m, content } : m
          )
        );
        return;
      }

      let buffer = "";
      let displayText = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        // Vertex streamQuery returns NDJSON; extract content.parts[0].text from each line
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          try {
            const obj = JSON.parse(trimmed);
            const parts = obj?.content?.parts;
            const text = parts
              ? parts.map((p: { text?: string }) => p?.text).filter(Boolean).join("")
              : obj?.content?.text ??
                (typeof obj?.content === "string" ? obj.content : null);
            if (text) displayText += text;
          } catch {
            // Not JSON; append raw if it looks like plain text
            if (!trimmed.startsWith("{")) displayText += trimmed + "\n";
          }
        }
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId ? { ...m, content: displayText || "…" } : m
          )
        );
      }
      // Flush any remaining buffer
      if (buffer.trim()) {
        try {
          const obj = JSON.parse(buffer.trim());
          const parts = obj?.content?.parts;
          const text = parts
            ? parts.map((p: { text?: string }) => p?.text).filter(Boolean).join("")
            : obj?.content?.text ??
              (typeof obj?.content === "string" ? obj.content : null);
          if (text) displayText += text;
        } catch {
          if (!buffer.startsWith("{")) displayText += buffer;
        }
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId ? { ...m, content: displayText } : m
          )
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? { ...m, content: "(Error: " + (e instanceof Error ? e.message : String(e)) + ")" }
            : m
        )
      );
    } finally {
      setLoading(false);
    }
  }, [input, loading]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <p className="text-muted-foreground text-sm">
            Ask about Reflexion, GCP, or Vertex AI. Messages are sent to the
            deployed Agent Engine via the GCP proxy.
          </p>
        )}
        {messages.map((m) => (
          <div
            key={m.id}
            className={cn(
              "rounded-lg px-3 py-2 max-w-[85%]",
              m.role === "user"
                ? "bg-primary text-primary-foreground ml-auto"
                : "bg-muted"
            )}
          >
            <p className="text-sm whitespace-pre-wrap break-words">{m.content || "…"}</p>
          </div>
        ))}
      </div>
      {error && (
        <div className="px-4 py-2 text-destructive text-sm">{error}</div>
      )}
      <div className="border-t p-4 flex gap-2">
        <textarea
          className="flex-1 min-h-[44px] max-h-32 rounded-md border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground resize-y"
          placeholder="Type a message…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          rows={2}
          disabled={loading}
        />
        <Button onClick={send} disabled={loading || !input.trim()}>
          {loading ? "Sending…" : "Send"}
        </Button>
      </div>
    </div>
  );
}
