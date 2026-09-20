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
      const [{ data: strat }, { nav, cash }] = await Promise.all([
        deps.admin
          .from("strategies")
          .select("doc")
          .eq("portfolio_id", deps.portfolioId)
          .eq("is_current", true)
          .maybeSingle(),
        navOf(deps),
      ]);
      const risk = ((strat as { doc?: { risk?: Record<string, number> } } | null)?.doc?.risk ?? {}) as Record<
        string,
        number
      >;
      const maxPos = risk.max_position_pct ?? 10;
      const cashFloorPct = risk.cash_floor_pct ?? 5;
      const breaches: string[] = [];
      if (pct_of_nav > maxPos) breaches.push(`position ${pct_of_nav}% > max_position_pct ${maxPos}%`);
      const cashAfter = cash - collateral_required;
      if (nav > 0 && (cashAfter / nav) * 100 < cashFloorPct) {
        breaches.push(`cash after ${((cashAfter / nav) * 100).toFixed(1)}% < cash_floor ${cashFloorPct}%`);
      }
      return JSON.stringify({ passes: breaches.length === 0, breaches, caps: { maxPos, cashFloorPct }, nav });
    },
  });
}
