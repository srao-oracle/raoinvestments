import { createClient } from "@/lib/supabase/server";
import { usd, num, signedUsd } from "@/lib/format";
import { RecordFillForm } from "./record-fill-form";

type TradeRow = {
  action: string;
  asset_class: string;
  quantity: number;
  price: number;
  fees: number;
  multiplier: number;
  realized_pnl: number;
  executed_at: string;
  instruments: { symbol: string } | null;
};

export default async function TradesPage({
  params,
  searchParams,
}: {
  params: Promise<{ portfolioId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { portfolioId } = await params;
  const sp = await searchParams;
  const str = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);
  const prefill =
    str(sp.symbol) || str(sp.oppId)
      ? {
          symbol: str(sp.symbol),
          assetClass: str(sp.assetClass),
          action: str(sp.action),
          quantity: str(sp.quantity),
          oppId: str(sp.oppId),
        }
      : undefined;
  const supabase = await createClient();
  const { data } = await supabase
    .from("trades")
    .select("action, asset_class, quantity, price, fees, multiplier, realized_pnl, executed_at, instruments(symbol)")
    .eq("portfolio_id", portfolioId)
    .order("executed_at", { ascending: false })
    .limit(50);

  const trades = (data ?? []) as unknown as TradeRow[];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="mb-3 text-lg font-semibold">Record a fill</h2>
        <RecordFillForm portfolioId={portfolioId} prefill={prefill} />
      </div>

      <section>
        <h3 className="mb-2 text-sm font-semibold">Recent trades</h3>
        {trades.length === 0 ? (
          <p className="text-sm text-[var(--color-muted-foreground)]">No trades recorded yet.</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {trades.map((t, i) => {
              const isBuy = t.action.startsWith("buy");
              return (
                <li
                  key={i}
                  className="flex items-center justify-between rounded-md border border-[var(--color-border)] px-3 py-2 text-sm"
                >
                  <div>
                    <span
                      className={
                        "font-medium " +
                        (isBuy
                          ? "text-emerald-600 dark:text-emerald-400"
                          : "text-red-600 dark:text-red-400")
                      }
                    >
                      {t.action.replace(/_/g, " ")}
                    </span>{" "}
                    {num(Number(t.quantity))} {t.instruments?.symbol ?? "?"}{" "}
                    <span className="text-xs text-[var(--color-muted-foreground)]">
                      @ {usd(Number(t.price))}
                    </span>
                  </div>
                  <div className="text-right text-xs text-[var(--color-muted-foreground)]">
                    {new Date(t.executed_at).toLocaleDateString()}
                    {Number(t.realized_pnl) !== 0 ? (
                      <span
                        className={
                          "ml-2 " +
                          (Number(t.realized_pnl) > 0
                            ? "text-emerald-600 dark:text-emerald-400"
                            : "text-red-600 dark:text-red-400")
                        }
                      >
                        {signedUsd(Number(t.realized_pnl))}
                      </span>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
