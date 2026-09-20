import { pct } from "@/lib/format";

export function TargetReturnMeter({
  targetPct,
  actualPct,
  period,
}: {
  targetPct: number | null;
  actualPct?: number | null;
  period?: string;
}) {
  const hasActual = actualPct != null && targetPct != null && targetPct > 0;
  const progress = hasActual
    ? Math.max(0, Math.min(100, (actualPct! / targetPct!) * 100))
    : 0;

  return (
    <div className="rounded-lg border border-[var(--color-border)] p-4">
      <div className="text-xs uppercase tracking-wide text-[var(--color-muted-foreground)]">
        Target return{period ? ` (${period})` : ""}
      </div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">
        {targetPct != null ? pct(targetPct) : "—"}
      </div>
      <div
        className="mt-3 h-2 w-full overflow-hidden rounded-full bg-[var(--color-muted)]"
        role="meter"
        aria-valuenow={progress}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className="h-full rounded-full bg-[var(--color-primary)]"
          style={{ width: `${progress}%` }}
        />
      </div>
      <div className="mt-1 text-xs text-[var(--color-muted-foreground)]">
        {hasActual
          ? `${pct(actualPct!)} realized · ${progress.toFixed(0)}% of target`
          : "Progress accrues as NAV history builds."}
      </div>
    </div>
  );
}
