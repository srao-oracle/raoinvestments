import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import type { ToolDeps } from "./deps";

type PosRow = {
  quantity: number;
  avg_cost: number;
  multiplier: number;
  direction: string;
  asset_class: string;
  instruments: { symbol: string } | null;
};
type OppRow = {
  direction: string | null;
  proposed_notional: number | null;
  instruments: { symbol: string } | null;
};

const LONG_DIRS = new Set(["long_stock", "long_call", "covered_call", "csp"]);
const HEDGE_DIRS = new Set(["short_stock", "short_call", "long_put"]);

/** Net long exposure of the intended book (open positions + proposed longs) and how much
 *  hedge is still needed to hit the strategy's target hedge ratio. */
export function portfolioDeltaTool(deps: ToolDeps) {
  return betaZodTool({
    name: "portfolio_delta",
    description:
      "The book's net long-equity exposure (open positions + pending long proposals), current hedge exposure, the strategy's target hedge ratio, and how much ADDITIONAL hedge notional is needed. Also lists the largest single-name longs (candidates for protective puts). Use this to size the index overlay and single-name hedges.",
    inputSchema: z.object({}),
    run: async () => {
      const [{ data: pf }, { data: pos }, { data: opps }, { data: strat }] = await Promise.all([
        deps.admin.from("portfolios").select("cash_balance").eq("id", deps.portfolioId).maybeSingle(),
        deps.admin
          .from("positions")
          .select("quantity, avg_cost, multiplier, direction, asset_class, instruments(symbol)")
          .eq("portfolio_id", deps.portfolioId)
          .eq("status", "open"),
        deps.admin
          .from("opportunities")
          .select("direction, proposed_notional, instruments(symbol)")
          .eq("portfolio_id", deps.portfolioId)
          .eq("status", "proposed"),
        deps.admin
          .from("strategies")
          .select("doc")
          .eq("portfolio_id", deps.portfolioId)
          .eq("is_current", true)
          .maybeSingle(),
      ]);
      const positions = (pos ?? []) as unknown as PosRow[];
      const proposals = (opps ?? []) as unknown as OppRow[];
      const cash = Number((pf as { cash_balance?: number } | null)?.cash_balance ?? 0);

      const notionalOf = (p: PosRow) => Number(p.quantity) * Number(p.avg_cost) * Number(p.multiplier);
      const longExposure = new Map<string, number>();
      let openLong = 0;
      let openHedge = 0;
      for (const p of positions) {
        const n = notionalOf(p);
        if (p.direction === "long" && p.asset_class === "stock") {
          openLong += n;
          const sym = p.instruments?.symbol ?? "?";
          longExposure.set(sym, (longExposure.get(sym) ?? 0) + n);
        } else if (p.direction === "short" || p.asset_class === "option") {
          openHedge += n;
        }
      }
      let proposedLong = 0;
      let proposedHedge = 0;
      for (const o of proposals) {
        const n = Number(o.proposed_notional ?? 0);
        if (o.direction && LONG_DIRS.has(o.direction)) {
          proposedLong += n;
          if (o.direction === "long_stock") {
            const sym = o.instruments?.symbol ?? "?";
            longExposure.set(sym, (longExposure.get(sym) ?? 0) + n);
          }
        } else if (o.direction && HEDGE_DIRS.has(o.direction)) {
          proposedHedge += n;
        }
      }

      const grossLong = openLong + proposedLong;
      const currentHedge = openHedge + proposedHedge;
      const doc = ((strat as { doc?: { hedge?: { target_ratio?: number } } } | null)?.doc ?? {}) as {
        hedge?: { target_ratio?: number };
      };
      const targetRatio = doc.hedge?.target_ratio ?? 0.5;
      const targetHedge = grossLong * targetRatio;
      const additional = Math.max(0, targetHedge - currentHedge);
      const topLongs = [...longExposure.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
        .map(([symbol, notional]) => ({ symbol, notional: Number(notional.toFixed(2)) }));

      return JSON.stringify({
        nav: Number((cash + openLong + openHedge).toFixed(2)),
        cash: Number(cash.toFixed(2)),
        gross_long_notional: Number(grossLong.toFixed(2)),
        current_hedge_notional: Number(currentHedge.toFixed(2)),
        target_hedge_ratio: targetRatio,
        target_hedge_notional: Number(targetHedge.toFixed(2)),
        additional_hedge_needed: Number(additional.toFixed(2)),
        largest_longs: topLongs,
        note:
          "Hedge ~additional_hedge_needed of notional. Use a broad-index overlay (short SPY/QQQ or index puts) for systemic risk, plus protective puts on the largest_longs.",
      });
    },
  });
}

const HedgeLeg = z.object({
  symbol: z.string().describe("Index ETF (e.g. SPY/QQQ) or the single-name underlying being hedged."),
  direction: z
    .enum(["short_stock", "long_put", "short_call"])
    .describe("short_stock = short the index ETF; long_put = protective/index put; short_call = covered/naked call."),
  quantity: z.number().positive().describe("Shares (short_stock) or contracts (options)."),
  entry_price: z.number().positive().describe("Share price or option premium per share."),
  notional: z.number().min(0).describe("Dollar notional this leg hedges."),
  option_detail: z.string().optional().describe("For options: strike, expiry, and delta, e.g. 'SPY 550P exp 2027-01-15, -0.30Δ'."),
  protects: z.string().describe("What this hedges, e.g. 'book' or 'NVDA'."),
  max_loss: z.number().nullable().describe("Max loss in $, or null if uncapped (short index / naked call)."),
  rationale: z.string().max(400),
});

/** Emit hedge proposals — each becomes a gated 'proposed' opportunity the owner records. */
export function emitHedgeTool(deps: ToolDeps) {
  return betaZodTool({
    name: "emit_hedge",
    description:
      "Submit the hedge overlay: an index hedge plus single-name protective puts. Each leg becomes a gated proposal for the owner to approve and record. Call exactly once.",
    inputSchema: z.object({ hedges: z.array(HedgeLeg).max(10) }),
    run: async ({ hedges }) => {
      let created = 0;
      for (const h of hedges) {
        const symbol = h.symbol.toUpperCase();
        const { data: inst } = await deps.admin
          .from("instruments")
          .upsert({ symbol, asset_class: "stock" }, { onConflict: "symbol,currency" })
          .select("id")
          .single();
        const instrumentId = (inst as { id: string } | null)?.id;
        if (!instrumentId) continue;
        const label =
          h.direction === "short_stock"
            ? `Short ${symbol}`
            : h.direction === "long_put"
              ? `${symbol} protective put`
              : `${symbol} short call`;
        const detail = h.option_detail ? `\n\n**Structure:** ${h.option_detail}` : "";
        await deps.admin.from("opportunities").insert({
          portfolio_id: deps.portfolioId,
          instrument_id: instrumentId,
          status: "proposed",
          direction: h.direction,
          title: `${label} (hedge)`,
          thesis: `**Hedge — protects ${h.protects}.** ${h.rationale}${detail}`,
          sizing_rationale: h.rationale,
          proposed_quantity: h.quantity,
          proposed_notional: h.notional,
          max_risk: h.max_loss,
          source: "hedge",
        });
        created += 1;
      }
      return JSON.stringify({ created });
    },
  });
}
