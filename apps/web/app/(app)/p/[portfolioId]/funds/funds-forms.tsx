"use client";

import { useActionState } from "react";
import { deposit, withdraw, requestLiquidation, type FundState } from "./actions";

const inputCls =
  "h-11 w-full rounded-md border border-[var(--color-border)] bg-transparent px-3 outline-none focus:border-[var(--color-primary)]";
const btnCls =
  "h-11 rounded-md bg-[var(--color-primary)] px-4 font-medium text-[var(--color-primary-foreground)] disabled:opacity-60";

function Msg({ state }: { state: FundState }) {
  if (!state) return null;
  if (state.error) return <p className="text-sm text-red-500">{state.error}</p>;
  return <p className="text-sm text-emerald-600 dark:text-emerald-400">{state.ok}</p>;
}

export function FundsForms({ portfolioId }: { portfolioId: string }) {
  const [dep, depAction, depP] = useActionState<FundState, FormData>(deposit, null);
  const [wd, wdAction, wdP] = useActionState<FundState, FormData>(withdraw, null);
  const [lq, lqAction, lqP] = useActionState<FundState, FormData>(requestLiquidation, null);

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <form
        action={depAction}
        className="flex flex-col gap-2 rounded-lg border border-[var(--color-border)] p-4"
      >
        <h3 className="font-medium">Deposit</h3>
        <input type="hidden" name="portfolioId" value={portfolioId} />
        <input name="amount" type="number" step="0.01" min="0" inputMode="decimal" placeholder="Amount (USD)" className={inputCls} required />
        <button className={btnCls} disabled={depP}>{depP ? "Depositing…" : "Deposit"}</button>
        <Msg state={dep} />
      </form>

      <form
        action={wdAction}
        className="flex flex-col gap-2 rounded-lg border border-[var(--color-border)] p-4"
      >
        <h3 className="font-medium">Withdraw</h3>
        <input type="hidden" name="portfolioId" value={portfolioId} />
        <input name="amount" type="number" step="0.01" min="0" inputMode="decimal" placeholder="Amount (USD)" className={inputCls} required />
        <button className={btnCls} disabled={wdP}>{wdP ? "Withdrawing…" : "Withdraw"}</button>
        <Msg state={wd} />
      </form>

      <form
        action={lqAction}
        className="flex flex-col gap-2 rounded-lg border border-[var(--color-border)] p-4 sm:col-span-2"
      >
        <h3 className="font-medium">Request liquidation</h3>
        <p className="text-xs text-[var(--color-muted-foreground)]">
          Flags the portfolio for wind-down. The agent proposes the sells; you execute and record
          them. No cash moves until you record fills.
        </p>
        <input type="hidden" name="portfolioId" value={portfolioId} />
        <input name="notes" type="text" placeholder="Notes (optional)" className={inputCls} />
        <button className={btnCls} disabled={lqP}>{lqP ? "Submitting…" : "Request liquidation"}</button>
        <Msg state={lq} />
      </form>
    </div>
  );
}
