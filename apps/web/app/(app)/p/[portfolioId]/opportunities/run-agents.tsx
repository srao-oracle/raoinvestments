"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";

export function RunAgents({ portfolioId }: { portfolioId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function run(kind: "strategist" | "scout" | "pipeline") {
    setBusy(kind);
    setMsg(null);
    try {
      const res = await fetch(`/api/agents/${portfolioId}/${kind}`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setMsg(
        kind === "scout"
          ? `Scout found ${data.candidates} candidates.`
          : kind === "strategist"
            ? `Strategy: ${data.updated ? "updated" : "unchanged"}.`
            : `Pipeline processed ${data.processed}: ${(data.results ?? []).map((r: { symbol: string; outcome: string }) => `${r.symbol}=${r.outcome}`).join(", ")}`,
      );
      startTransition(() => router.refresh());
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "failed");
    } finally {
      setBusy(null);
    }
  }

  const btn =
    "inline-flex items-center gap-1.5 rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm hover:bg-[var(--color-muted)] disabled:opacity-50";

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-[var(--color-border)] p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Sparkles className="size-4 text-[var(--color-primary)]" aria-hidden />
        <button className={btn} disabled={!!busy} onClick={() => run("strategist")}>
          {busy === "strategist" ? "Refreshing…" : "Refresh strategy"}
        </button>
        <button className={btn} disabled={!!busy} onClick={() => run("scout")}>
          {busy === "scout" ? "Scouting…" : "Scout ideas"}
        </button>
        <button className={btn} disabled={!!busy} onClick={() => run("pipeline")}>
          {busy === "pipeline" ? "Analyzing…" : "Analyze candidate"}
        </button>
      </div>
      {msg ? <p className="text-xs text-[var(--color-muted-foreground)]">{msg}</p> : null}
      {pending ? <p className="text-xs text-[var(--color-muted-foreground)]">Refreshing…</p> : null}
    </div>
  );
}
