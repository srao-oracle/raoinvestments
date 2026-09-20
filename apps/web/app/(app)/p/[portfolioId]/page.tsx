import { createClient } from "@/lib/supabase/server";
import { usd, signedUsd, pct } from "@/lib/format";

function StatTile({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: "up" | "down";
}) {
  return (
    <div className="rounded-lg border border-[var(--color-border)] p-4">
      <div className="text-xs uppercase tracking-wide text-[var(--color-muted-foreground)]">
        {label}
      </div>
      <div
        className={
          "mt-1 text-2xl font-semibold tabular-nums " +
          (accent === "up"
            ? "text-emerald-600 dark:text-emerald-400"
            : accent === "down"
              ? "text-red-600 dark:text-red-400"
              : "")
        }
      >
        {value}
      </div>
      {sub ? (
        <div className="mt-0.5 text-xs text-[var(--color-muted-foreground)]">{sub}</div>
      ) : null}
    </div>
  );
}

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ portfolioId: string }>;
}) {
  const { portfolioId } = await params;
  const supabase = await createClient();

  const [pf, positions, targets, strat, trades] = await Promise.all([
    supabase.from("portfolios").select("cash_balance").eq("id", portfolioId).maybeSingle(),
    supabase
      .from("positions")
      .select("quantity, avg_cost, multiplier, asset_class")
      .eq("portfolio_id", portfolioId)
      .eq("status", "open"),
    supabase
      .from("portfolio_target_returns")
      .select("target_pct, period")
      .eq("portfolio_id", portfolioId)
      .order("effective_from", { ascending: false })
      .limit(1),
    supabase
      .from("strategies")
      .select("version, summary, doc")
      .eq("portfolio_id", portfolioId)
      .eq("is_current", true)
      .maybeSingle(),
    supabase.from("trades").select("realized_pnl").eq("portfolio_id", portfolioId),
  ]);

  type Pos = { quantity: number; avg_cost: number; multiplier: number; asset_class: string };
  const openPositions = (positions.data ?? []) as Pos[];
  const cash = Number(pf.data?.cash_balance ?? 0);
  const investedCost = openPositions.reduce(
    (s, p) => s + Number(p.quantity) * Number(p.avg_cost) * Number(p.multiplier),
    0,
  );
  const nav = cash + investedCost;
  const realized = ((trades.data ?? []) as { realized_pnl: number }[]).reduce(
    (s, t) => s + Number(t.realized_pnl),
    0,
  );
  const target = (targets.data ?? [])[0] as { target_pct: number; period: string } | undefined;
  const strategy = strat.data as
    | { version: number; summary: string | null; doc: Record<string, unknown> }
    | null;
  const activeStrategies = (strategy?.doc?.active_strategies as string[] | undefined) ?? [];

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatTile label="Net Asset Value" value={usd(nav)} sub="cash + positions (at cost)" />
        <StatTile label="Cash" value={usd(cash)} />
        <StatTile label="Invested (cost)" value={usd(investedCost)} sub={`${openPositions.length} open`} />
        <StatTile
          label="Realized P&L"
          value={signedUsd(realized)}
          accent={realized > 0 ? "up" : realized < 0 ? "down" : undefined}
        />
        <StatTile
          label="Target return"
          value={target ? pct(Number(target.target_pct)) : "—"}
          sub={target ? target.period : undefined}
        />
        <StatTile label="Strategy" value={strategy ? `v${strategy.version}` : "—"} sub="current" />
      </div>

      <section className="rounded-lg border border-[var(--color-border)] p-4">
        <h2 className="text-sm font-semibold">Strategy</h2>
        <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
          {strategy?.summary ?? "No strategy set."}
        </p>
        {activeStrategies.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {activeStrategies.map((s) => (
              <span
                key={s}
                className="rounded-full border border-[var(--color-border)] px-2 py-0.5 text-xs text-[var(--color-muted-foreground)]"
              >
                {s}
              </span>
            ))}
          </div>
        ) : null}
      </section>

      <p className="text-xs text-[var(--color-muted-foreground)]">
        Live mark-to-market P&L and charts arrive with the market-data stream (M4). Values shown
        are at cost basis.
      </p>
    </div>
  );
}
