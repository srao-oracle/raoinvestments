// Deterministic long-only + collateral guard. Runs at the agent layer as defense-in-depth
// alongside the identical in-SQL guard (fn_trades_apply). A proposal that fails here is
// never surfaced to the user.

export interface Violation {
  code: string;
  detail: string;
}

export interface RecommendationInput {
  structure: string;
  legs: Array<{ right: string; action: string; strike: number; expiry: string }>;
  net_debit: number;
  max_loss: number;
  sizing: { shares_or_contracts: number; collateral_required: number };
}

const DEBIT_STRUCTURES = ["long_stock", "long_call", "long_put", "call_debit_spread"];

export function validateRecommendation(p: RecommendationInput): {
  ok: boolean;
  violations: Violation[];
} {
  const v: Violation[] = [];
  const shorts = p.legs.filter((l) => l.action === "sell_to_open");
  const contracts = p.sizing.shares_or_contracts;

  // 1. Long-only: a short leg is legal only inside a covered/defined-risk structure.
  for (const s of shorts) {
    if (s.right === "call") {
      const coveredByShares = p.structure === "covered_call";
      const coveredBySpread =
        p.structure === "call_debit_spread" &&
        p.legs.some(
          (l) =>
            l.action === "buy_to_open" &&
            l.right === "call" &&
            l.strike <= s.strike &&
            l.expiry === s.expiry,
        );
      if (!coveredByShares && !coveredBySpread) {
        v.push({ code: "naked_short_call", detail: `short call ${s.strike} not covered` });
      }
    } else if (s.right === "put") {
      if (p.structure !== "cash_secured_put") {
        v.push({ code: "uncollateralized_short_put", detail: `short put ${s.strike} not cash-secured` });
      }
    }
  }

  // 2. Cash-secured put must post strike x 100 x contracts.
  if (p.structure === "cash_secured_put") {
    const sp = shorts.find((s) => s.right === "put");
    if (sp) {
      const required = sp.strike * 100 * contracts;
      if (p.sizing.collateral_required + 1e-6 < required) {
        v.push({
          code: "insufficient_collateral",
          detail: `need ${required}, have ${p.sizing.collateral_required}`,
        });
      }
    }
  }

  // 3. Debit structures cannot be net credits.
  if (DEBIT_STRUCTURES.includes(p.structure) && p.net_debit < 0) {
    v.push({ code: "unexpected_credit", detail: `${p.structure} produced a net credit` });
  }

  // 4. Max loss must be finite and bounded (long-only => known downside).
  if (!Number.isFinite(p.max_loss) || p.max_loss < 0) {
    v.push({ code: "unbounded_loss", detail: `max_loss=${p.max_loss}` });
  }

  return { ok: v.length === 0, violations: v };
}
