"use client";

import { useActionState, useState } from "react";
import { recordFill, type FillState } from "./actions";

const inputCls =
  "h-11 w-full rounded-md border border-[var(--color-border)] bg-transparent px-3 outline-none focus:border-[var(--color-primary)]";
const labelCls = "flex flex-col gap-1 text-xs text-[var(--color-muted-foreground)]";

const STOCK_ACTIONS = [
  { v: "buy_to_open", l: "Buy" },
  { v: "sell_to_close", l: "Sell" },
];
const OPTION_ACTIONS = [
  { v: "buy_to_open", l: "Buy to open (long)" },
  { v: "sell_to_close", l: "Sell to close" },
  { v: "sell_to_open", l: "Sell to open (covered call / CSP)" },
  { v: "buy_to_close", l: "Buy to close" },
];

export interface FillPrefill {
  symbol?: string;
  assetClass?: string;
  action?: string;
  quantity?: string;
  oppId?: string;
}

export function RecordFillForm({
  portfolioId,
  prefill,
}: {
  portfolioId: string;
  prefill?: FillPrefill;
}) {
  const [assetClass, setAssetClass] = useState<"stock" | "option">(
    prefill?.assetClass === "option" ? "option" : "stock",
  );
  const [state, action, pending] = useActionState<FillState, FormData>(recordFill, null);

  return (
    <form action={action} className="flex flex-col gap-3 rounded-lg border border-[var(--color-border)] p-4">
      <input type="hidden" name="portfolioId" value={portfolioId} />
      <input type="hidden" name="assetClass" value={assetClass} />
      <input type="hidden" name="oppId" value={prefill?.oppId ?? ""} />

      {prefill?.oppId ? (
        <p className="rounded-md bg-[var(--color-muted)] px-3 py-2 text-xs text-[var(--color-muted-foreground)]">
          Recording an approved proposal — confirm the actual executed price/quantity.
        </p>
      ) : null}

      <div className="inline-flex w-fit rounded-md border border-[var(--color-border)] p-0.5 text-sm">
        {(["stock", "option"] as const).map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setAssetClass(c)}
            className={
              "rounded px-3 py-1 capitalize " +
              (assetClass === c
                ? "bg-[var(--color-primary)] text-[var(--color-primary-foreground)]"
                : "text-[var(--color-muted-foreground)]")
            }
          >
            {c}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className={labelCls}>
          {assetClass === "option" ? "Underlying" : "Symbol"}
          <input name="symbol" defaultValue={prefill?.symbol} className={inputCls} placeholder="AAPL" required />
        </label>
        <label className={labelCls}>
          Action
          <select name="action" defaultValue={prefill?.action} className={inputCls} required>
            {(assetClass === "stock" ? STOCK_ACTIONS : OPTION_ACTIONS).map((a) => (
              <option key={a.v} value={a.v}>
                {a.l}
              </option>
            ))}
          </select>
        </label>
      </div>

      {assetClass === "option" ? (
        <div className="grid grid-cols-3 gap-3">
          <label className={labelCls}>
            Type
            <select name="optionType" className={inputCls}>
              <option value="call">Call</option>
              <option value="put">Put</option>
            </select>
          </label>
          <label className={labelCls}>
            Strike
            <input name="strike" type="number" step="0.01" min="0" inputMode="decimal" className={inputCls} />
          </label>
          <label className={labelCls}>
            Expiry
            <input name="expiry" type="date" className={inputCls} />
          </label>
        </div>
      ) : null}

      <div className="grid grid-cols-3 gap-3">
        <label className={labelCls}>
          {assetClass === "option" ? "Contracts" : "Quantity"}
          <input name="quantity" type="number" step="0.0001" min="0" inputMode="decimal" defaultValue={prefill?.quantity} className={inputCls} required />
        </label>
        <label className={labelCls}>
          Fill price
          <input name="price" type="number" step="0.0001" min="0" inputMode="decimal" className={inputCls} required />
        </label>
        <label className={labelCls}>
          Fees
          <input name="fees" type="number" step="0.01" min="0" inputMode="decimal" defaultValue="0" className={inputCls} />
        </label>
      </div>

      <label className={labelCls}>
        Executed at
        <input name="executedAt" type="datetime-local" className={inputCls} />
      </label>

      {state?.error ? <p className="text-sm text-red-500">{state.error}</p> : null}
      {state?.ok ? <p className="text-sm text-emerald-600 dark:text-emerald-400">{state.ok}</p> : null}

      <button
        type="submit"
        disabled={pending}
        className="h-11 rounded-md bg-[var(--color-primary)] px-4 font-medium text-[var(--color-primary-foreground)] disabled:opacity-60"
      >
        {pending ? "Recording…" : "Record fill"}
      </button>
      <p className="text-xs text-[var(--color-muted-foreground)]">
        Records a trade you executed in your brokerage. Long-only + collateral rules are enforced
        by the database; short/naked positions are rejected.
      </p>
    </form>
  );
}
