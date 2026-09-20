import { createClient } from "@/lib/supabase/server";
import { usd, signedUsd } from "@/lib/format";
import { FundsForms } from "./funds-forms";

type Txn = {
  txn_type: string;
  status: string;
  amount: number;
  requested_at: string;
  notes: string | null;
};

export default async function FundsPage({
  params,
}: {
  params: Promise<{ portfolioId: string }>;
}) {
  const { portfolioId } = await params;
  const supabase = await createClient();
  const [pf, txns] = await Promise.all([
    supabase.from("portfolios").select("cash_balance").eq("id", portfolioId).maybeSingle(),
    supabase
      .from("fund_transactions")
      .select("txn_type, status, amount, requested_at, notes")
      .eq("portfolio_id", portfolioId)
      .order("requested_at", { ascending: false })
      .limit(25),
  ]);

  const cash = Number(pf.data?.cash_balance ?? 0);
  const rows = (txns.data ?? []) as Txn[];

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-lg border border-[var(--color-border)] p-4">
        <div className="text-xs uppercase tracking-wide text-[var(--color-muted-foreground)]">
          Available cash
        </div>
        <div className="mt-1 text-3xl font-semibold tabular-nums">{usd(cash)}</div>
      </div>

      <FundsForms portfolioId={portfolioId} />

      <section>
        <h3 className="mb-2 text-sm font-semibold">Transactions</h3>
        {rows.length === 0 ? (
          <p className="text-sm text-[var(--color-muted-foreground)]">No transactions yet.</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {rows.map((t, i) => (
              <li
                key={i}
                className="flex items-center justify-between rounded-md border border-[var(--color-border)] px-3 py-2 text-sm"
              >
                <span className="capitalize">
                  {t.txn_type.replace("_", " ")}
                  {t.status !== "completed" ? (
                    <span className="ml-2 rounded-full bg-[var(--color-muted)] px-2 py-0.5 text-xs">
                      {t.status}
                    </span>
                  ) : null}
                </span>
                <span className="tabular-nums text-[var(--color-muted-foreground)]">
                  {t.amount === 0 ? "—" : signedUsd(Number(t.amount))}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
