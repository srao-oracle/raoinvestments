import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import type { ToolDeps } from "./deps";

async function navOf(deps: ToolDeps): Promise<{ nav: number; cash: number; investedCost: number }> {
  const [{ data: pf }, { data: positions }] = await Promise.all([
    deps.admin.from("portfolios").select("cash_balance").eq("id", deps.portfolioId).maybeSingle(),
    deps.admin
      .from("positions")
      .select("quantity, avg_cost, multiplier")
      .eq("portfolio_id", deps.portfolioId)
      .eq("status", "open"),
  ]);
  const cash = Number((pf as { cash_balance?: number } | null)?.cash_balance ?? 0);
  const investedCost = ((positions ?? []) as { quantity: number; avg_cost: number; multiplier: number }[]).reduce(
    (s, p) => s + Number(p.quantity) * Number(p.avg_cost) * Number(p.multiplier),
    0,
  );
  return { nav: cash + investedCost, cash, investedCost };
}

/** NAV plus capital already earmarked by pending (proposed-but-not-yet-filled) trades,
 *  and the strategy's deployment limits — used for portfolio-construction sizing. */
async function deploymentOf(deps: ToolDeps): Promise<{
  nav: number;
  cash: number;
  investedCost: number;
  earmarked: number;
  openCount: number;
  proposedCount: number;
  targetInvestedPct: number;
  maxPositionPct: number;
  maxHeatPct: number;
}> {
  const [{ nav, cash, investedCost }, { data: proposed }, { count: openCount }, { data: strat }] =
    await Promise.all([
      navOf(deps),
      deps.admin
        .from("opportunities")
        .select("proposed_notional")
        .eq("portfolio_id", deps.portfolioId)
        .eq("status", "proposed"),
      deps.admin
        .from("positions")
        .select("id", { count: "exact", head: true })
        .eq("portfolio_id", deps.portfolioId)
        .eq("status", "open"),
      deps.admin
        .from("strategies")
        .select("doc")
        .eq("portfolio_id", deps.portfolioId)
        .eq("is_current", true)
        .maybeSingle(),
    ]);
  const proposedRows = (proposed ?? []) as { proposed_notional: number | null }[];
  const earmarked = proposedRows.reduce((s, o) => s + Number(o.proposed_notional ?? 0), 0);
  const doc = ((strat as { doc?: Record<string, unknown> } | null)?.doc ?? {}) as {
    risk?: Record<string, number>;
    target_invested_pct?: number;
  };
  const risk = doc.risk ?? {};
  return {
    nav,
    cash,
    investedCost,
    earmarked,
    openCount: openCount ?? 0,
    proposedCount: proposedRows.length,
    targetInvestedPct: doc.target_invested_pct ?? 90,
    maxPositionPct: risk.max_position_pct ?? 10,
    maxHeatPct: risk.max_heat_pct ?? 95,
  };
}

/** Portfolio deployment state for sizing NEW positions toward full investment. */
export function planAllocationTool(deps: ToolDeps) {
  return betaZodTool({
    name: "plan_allocation",
    description:
      "How much capital is still available to deploy toward the portfolio's TARGET invested level. Returns NAV, cash, capital already invested (open positions) + earmarked (pending proposals), the target invested %, remaining % to deploy, and the per-position cap. Use this to size each proposal so the book fills toward its target — do NOT leave capital idle.",
    inputSchema: z.object({}),
    run: async () => {
      const d = await deploymentOf(deps);
      const investedPct = d.nav > 0 ? (d.investedCost / d.nav) * 100 : 0;
      const earmarkedPct = d.nav > 0 ? (d.earmarked / d.nav) * 100 : 0;
      const committedPct = investedPct + earmarkedPct;
      const remaining = Math.max(0, d.targetInvestedPct - committedPct);
      const suggested = Math.min(d.maxPositionPct, remaining);
      return JSON.stringify({
        nav: d.nav,
        cash: d.cash,
        invested_pct: Number(investedPct.toFixed(2)),
        earmarked_pct: Number(earmarkedPct.toFixed(2)),
        committed_pct: Number(committedPct.toFixed(2)),
        target_invested_pct: d.targetInvestedPct,
        remaining_pct_to_deploy: Number(remaining.toFixed(2)),
        open_positions: d.openCount,
        pending_proposals: d.proposedCount,
        max_position_pct: d.maxPositionPct,
        suggested_pct_this_position: Number(suggested.toFixed(2)),
        note:
          remaining <= 0.5
            ? "Target deployment reached — only add a position if it's clearly superior; otherwise keep sizing small."
            : "Size this position up to the cap to help deploy the remaining capital.",
      });
    },
  });
}

export function valuePortfolioTool(deps: ToolDeps) {
  return betaZodTool({
    name: "value_portfolio",
    description: "Portfolio NAV, cash, invested cost, and current heat (invested/NAV).",
    inputSchema: z.object({}),
    run: async () => {
      const { nav, cash, investedCost } = await navOf(deps);
      return JSON.stringify({
        nav,
        cash,
        invested_cost: investedCost,
        heat_pct: nav > 0 ? Number(((investedCost / nav) * 100).toFixed(2)) : 0,
      });
    },
  });
}

export function sizePositionTool(deps: ToolDeps) {
  return betaZodTool({
    name: "size_position",
    description:
      "Size a position from a target % of NAV. Returns shares/contracts, notional, collateral, and actual % of NAV. Long-only structures only.",
    inputSchema: z.object({
      structure: z.enum(["long_stock", "long_call", "long_put", "covered_call", "cash_secured_put"]),
      target_pct_nav: z.number().min(0).max(100),
      price: z.number().positive().describe("stock price, or option premium per share"),
      strike: z.number().positive().optional().describe("required for cash_secured_put"),
    }),
    run: async ({ structure, target_pct_nav, price, strike }) => {
      const { nav } = await navOf(deps);
      const budget = (target_pct_nav / 100) * nav;
      let units = 0;
      let notional = 0;
      let collateral = 0;
      if (structure === "long_stock") {
        units = Math.floor(budget / price);
        notional = units * price;
      } else if (structure === "long_call" || structure === "long_put") {
        units = Math.floor(budget / (price * 100));
        notional = units * price * 100;
      } else if (structure === "cash_secured_put") {
        if (!strike) return JSON.stringify({ error: "strike required for cash_secured_put" });
        units = Math.floor(budget / (strike * 100));
        collateral = units * strike * 100;
        notional = collateral;
      } else if (structure === "covered_call") {
        units = Math.floor(budget / (price * 100)); // contracts; assumes shares held separately
        notional = units * price * 100;
      }
      return JSON.stringify({
        shares_or_contracts: units,
        notional: Number(notional.toFixed(2)),
        pct_of_nav: nav > 0 ? Number(((notional / nav) * 100).toFixed(2)) : 0,
        collateral_required: Number(collateral.toFixed(2)),
        nav,
      });
    },
  });
}

export function checkRiskTool(deps: ToolDeps) {
  return betaZodTool({
    name: "check_risk",
    description:
      "Check a proposed position against the strategy's risk limits (max position %NAV, cash floor). Returns pass/fail with breaches.",
    inputSchema: z.object({
      pct_of_nav: z.number().min(0),
      collateral_required: z.number().min(0).default(0),
      max_loss: z.number().min(0),
    }),
    run: async ({ pct_of_nav, collateral_required }) => {
      const [{ data: strat }, d] = await Promise.all([
        deps.admin
          .from("strategies")
          .select("doc")
          .eq("portfolio_id", deps.portfolioId)
          .eq("is_current", true)
          .maybeSingle(),
        deploymentOf(deps),
      ]);
      const risk = ((strat as { doc?: { risk?: Record<string, number> } } | null)?.doc?.risk ?? {}) as Record<
        string,
        number
      >;
      const { nav, cash } = d;
      const maxPos = risk.max_position_pct ?? 10;
      const cashFloorPct = risk.cash_floor_pct ?? 5;
      const maxHeat = risk.max_heat_pct ?? 95;
      const breaches: string[] = [];
      if (pct_of_nav > maxPos) breaches.push(`position ${pct_of_nav}% > max_position_pct ${maxPos}%`);
      // Total deployment: open positions + pending proposals + this one must stay within heat cap.
      const committedPct = nav > 0 ? ((d.investedCost + d.earmarked) / nav) * 100 : 0;
      if (committedPct + pct_of_nav > maxHeat + 1e-6) {
        breaches.push(
          `total invested ${(committedPct + pct_of_nav).toFixed(1)}% > max_heat_pct ${maxHeat}% (already committed ${committedPct.toFixed(1)}%)`,
        );
      }
      // Cash floor must survive if every pending proposal (incl. this one's collateral) fills.
      const cashAfter = cash - d.earmarked - collateral_required;
      if (nav > 0 && (cashAfter / nav) * 100 < cashFloorPct) {
        breaches.push(`cash after ${((cashAfter / nav) * 100).toFixed(1)}% < cash_floor ${cashFloorPct}%`);
      }
      return JSON.stringify({
        passes: breaches.length === 0,
        breaches,
        caps: { maxPos, cashFloorPct, maxHeat },
        committed_pct: Number(committedPct.toFixed(2)),
        nav,
      });
    },
  });
}
