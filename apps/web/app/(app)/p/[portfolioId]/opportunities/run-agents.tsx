"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";

export function RunAgents({ portfolioId }: { portfolioId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function run(
    action: string,
    kind: "strategist" | "scout" | "pipeline" | "hedge",
    body?: Record<string, unknown>,
  ) {
    setBusy(action);
    setMsg(null);
    try {
      const res = await fetch(`/api/agents/${portfolioId}/${kind}`, {
        method: "POST",
        ...(body ? { headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : {}),
      });
      // The response may be a non-JSON error page (e.g. a gateway timeout), so
      // parse defensively instead of letting res.json() throw "Unexpected token".
      const raw = await res.text();
      let data: {
        error?: string;
        candidates?: number;
        updated?: boolean;
        queued?: boolean;
        alreadyRunning?: boolean;
      } = {};
      try {
        data = raw ? JSON.parse(raw) : {};
      } catch {
        data = {
          error:
            res.status === 504
              ? "The request timed out. It may still be running — refresh in a minute."
              : raw.slice(0, 160) || `HTTP ${res.status}`,
        };
      }
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setMsg(
        kind === "scout"
          ? `Scout found ${data.candidates} candidates.`
          : kind === "strategist"
            ? `Strategy: ${data.updated ? "updated" : "unchanged"}.`
            : kind === "hedge"
              ? data.alreadyRunning
                ? "A hedge run is already in progress."
                : "Hedging queued — the hedger builds an index overlay + protective puts on the largest longs (runs in the background; refresh to see hedge proposals)."
              : data.alreadyRunning
                ? "An analysis run is already in progress in the background."
                : action === "build"
                  ? "Building the portfolio — the worker deep-analyzes candidates and proposes sized trades to fully invest the book (runs in the background; refresh to watch candidates move to Proposed)."
                  : "Analysis queued — the deep Opus research runs in the background (~15–20 min). Candidates move Investigating → Proposed as it finishes; refresh to check.",
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
  const btnPrimary =
    "inline-flex items-center gap-1.5 rounded-md bg-[var(--color-primary)] px-3 py-1.5 text-sm font-medium text-[var(--color-primary-foreground)] disabled:opacity-50";

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-[var(--color-border)] p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Sparkles className="size-4" aria-hidden />
        <button className={btn} disabled={!!busy} onClick={() => run("strategist", "strategist")}>
          {busy === "strategist" ? "Refreshing…" : "Refresh strategy"}
        </button>
        <button className={btn} disabled={!!busy} onClick={() => run("scout", "scout")}>
          {busy === "scout" ? "Scouting…" : "Scout ideas"}
        </button>
        <button
          className={btn}
          disabled={!!busy}
          onClick={() => run("pipeline", "pipeline", { maxCandidates: 1 })}
        >
          {busy === "pipeline" ? "Queuing…" : "Analyze one"}
        </button>
        <button
          className={btnPrimary}
          disabled={!!busy}
          onClick={() => run("build", "pipeline", { maxCandidates: 15 })}
        >
          {busy === "build" ? "Queuing…" : "Build portfolio"}
        </button>
        <button className={btn} disabled={!!busy} onClick={() => run("hedge", "hedge")}>
          {busy === "hedge" ? "Queuing…" : "Hedge book"}
        </button>
      </div>
      {msg ? <p className="text-xs text-[var(--color-muted-foreground)]">{msg}</p> : null}
      {pending ? <p className="text-xs text-[var(--color-muted-foreground)]">Refreshing…</p> : null}
    </div>
  );
}
