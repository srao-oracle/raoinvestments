import { createClient } from "@/lib/supabase/server";
import { usd, num, signedUsd } from "@/lib/format";

type PositionRow = {
  quantity: number;
  avg_cost: number;
  multiplier: number;
  direction: string;
  asset_class: string;
  status: string;
  realized_pnl: number;
  instruments: { symbol: string; name: string | null } | null;
};

export default async function PositionsPage({
  params,
}: {
  params: Promise<{ portfolioId: string }>;
}) {
  const { portfolioId } = await params;
  const supabase = await createClient();
  const { data } = await supabase
    .from("positions")
    .select("quantity, avg_cost, multiplier, direction, asset_class, status, realized_pnl, instruments(symbol, name)")
    .eq("portfolio_id", portfolioId)
    .order("status", { ascending: true });

  const rows = (data ?? []) as unknown as PositionRow[];
  const open = rows.filter((r) => r.status === "open");
  const closed = rows.filter((r) => r.status === "closed");

  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-lg font-semibold">Positions</h2>

      {open.length === 0 ? (
        <p className="text-sm text-[var(--color-muted-foreground)]">
          No open positions. Record a fill from the Trades tab.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {open.map((p, i) => (
            <li
              key={i}
              className="flex items-center justify-between rounded-lg border border-[var(--color-border)] p-3"
            >
              <div>
                <div className="font-medium">
                  {p.instruments?.symbol ?? "?"}{" "}
                  <span className="text-xs text-[var(--color-muted-foreground)]">
                    {p.asset_class}
                    {p.direction === "short" ? " · short" : ""}
                  </span>
                </div>
                <div className="text-xs text-[var(--color-muted-foreground)]">
                  {num(Number(p.quantity))} @ {usd(Number(p.avg_cost))} avg
                </div>
              </div>
              <div className="text-right tabular-nums">
                {usd(Number(p.quantity) * Number(p.avg_cost) * Number(p.multiplier))}
                <div className="text-xs text-[var(--color-muted-foreground)]">cost basis</div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {closed.length > 0 ? (
        <section>
          <h3 className="mb-2 text-sm font-semibold text-[var(--color-muted-foreground)]">
            Closed
          </h3>
          <ul className="flex flex-col gap-2">
            {closed.map((p, i) => (
              <li
                key={i}
                className="flex items-center justify-between rounded-lg border border-[var(--color-border)] p-3 text-sm"
              >
                <span>
                  {p.instruments?.symbol ?? "?"}{" "}
                  <span className="text-xs text-[var(--color-muted-foreground)]">
                    {p.asset_class}
                  </span>
                </span>
                <span
                  className={
                    "tabular-nums " +
                    (Number(p.realized_pnl) > 0
                      ? "text-emerald-600 dark:text-emerald-400"
                      : Number(p.realized_pnl) < 0
                        ? "text-red-600 dark:text-red-400"
                        : "")
                  }
                >
                  {signedUsd(Number(p.realized_pnl))}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
