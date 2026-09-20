"use client";

import { useEffect, useRef, useState } from "react";
import { Markdown } from "@/components/markdown";

export type ChatMsg = { role: "user" | "assistant"; text: string };

export function Chat({ portfolioId, initial }: { portfolioId: string; initial: ChatMsg[] }) {
  const [messages, setMessages] = useState<ChatMsg[]>(initial);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", text }]);
    setBusy(true);
    try {
      const res = await fetch(`/api/chat/${portfolioId}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: text }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setMessages((m) => [...m, { role: "assistant", text: data.reply }]);
    } catch (err) {
      setMessages((m) => [
        ...m,
        { role: "assistant", text: `⚠️ ${err instanceof Error ? err.message : "failed"}` },
      ]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-[calc(100dvh-16rem)] min-h-96 flex-col">
      <div className="flex-1 space-y-3 overflow-y-auto pr-1">
        {messages.length === 0 ? (
          <p className="text-sm text-[var(--color-muted-foreground)]">
            Ask your portfolio manager anything — strategy, positions, an idea, or market context.
          </p>
        ) : null}
        {messages.map((m, i) =>
          m.role === "user" ? (
            <div key={i} className="flex justify-end">
              <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl bg-[var(--color-primary)] px-3 py-2 text-sm text-[var(--color-primary-foreground)]">
                {m.text}
              </div>
            </div>
          ) : (
            <div key={i} className="flex justify-start">
              <div className="max-w-[92%] rounded-2xl border border-[var(--color-border)] px-3 py-2">
                <Markdown content={m.text} />
              </div>
            </div>
          ),
        )}
        {busy ? (
          <div className="flex justify-start">
            <div className="rounded-2xl border border-[var(--color-border)] px-3 py-2 text-sm text-[var(--color-muted-foreground)]">
              thinking…
            </div>
          </div>
        ) : null}
        <div ref={endRef} />
      </div>

      <form onSubmit={send} className="mt-3 flex items-end gap-2">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send(e);
            }
          }}
          rows={1}
          placeholder="Message the PM…"
          className="max-h-32 flex-1 resize-none rounded-md border border-[var(--color-border)] bg-transparent px-3 py-2.5 text-base outline-none focus:border-[var(--color-primary)]"
        />
        <button
          type="submit"
          disabled={busy}
          className="h-11 rounded-md bg-[var(--color-primary)] px-4 font-medium text-[var(--color-primary-foreground)] disabled:opacity-60"
        >
          Send
        </button>
      </form>
    </div>
  );
}
