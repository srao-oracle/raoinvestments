import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import type { ToolDeps } from "./deps";
import { getAggregates } from "../market/rest/bars";
import { computePlaybit } from "../market/compute/playbit-ema";

const threeYearsAgo = () =>
  new Date(Date.now() - 1000 * 60 * 60 * 24 * 365 * 3).toISOString().slice(0, 10);
const today = () => new Date().toISOString().slice(0, 10);

/** Read the portfolio's current strategy doc. */
export function readStrategyTool(deps: ToolDeps) {
  return betaZodTool({
    name: "read_strategy",
    description:
      "Read the portfolio's current investment strategy: themes, risk limits, active strategy sleeves, target return, and watchlist.",
    inputSchema: z.object({}),
    run: async () => {
      const { data } = await deps.admin
        .from("strategies")
        .select("version, summary, doc")
        .eq("portfolio_id", deps.portfolioId)
        .eq("is_current", true)
        .maybeSingle();
      return JSON.stringify(data ?? { error: "no current strategy" });
    },
  });
}

/** Read open positions (to dedupe / size against the book). */
export function readPositionsTool(deps: ToolDeps) {
  return betaZodTool({
    name: "read_positions",
    description: "List the portfolio's open positions and cash balance.",
    inputSchema: z.object({}),
    run: async () => {
      const [{ data: positions }, { data: pf }] = await Promise.all([
        deps.admin
          .from("positions")
          .select("quantity, avg_cost, multiplier, asset_class, instruments(symbol)")
          .eq("portfolio_id", deps.portfolioId)
          .eq("status", "open"),
        deps.admin
          .from("portfolios")
          .select("cash_balance")
          .eq("id", deps.portfolioId)
          .maybeSingle(),
      ]);
      return JSON.stringify({ cash: pf?.cash_balance ?? 0, positions: positions ?? [] });
    },
  });
}

/** Screen a watchlist: price, PlayBit EMA regime, and trend vs the 200-day EMA. */
export function screenWatchlistTool(deps: ToolDeps) {
  return betaZodTool({
    name: "screen_watchlist",
    description:
      "For up to 30 tickers, return latest close, PlayBit EMA regime (green/red/neutral), and % vs the EMA(close,200). Green = uptrend (favor new longs); red = downtrend (avoid new long-delta). Use this to rank candidates.",
    inputSchema: z.object({ tickers: z.array(z.string()).max(30) }),
    run: async ({ tickers }) => {
      const from = threeYearsAgo();
      const to = today();
      const results = await Promise.all(
        tickers.map(async (raw) => {
          const ticker = raw.toUpperCase();
          try {
            const bars = await getAggregates(deps.market, { ticker, timespan: "day", from, to });
            if (bars.length < 60) return { ticker, error: "insufficient history" };
            const pb = computePlaybit(
              bars.map((b) => ({ time: Math.floor(b.t / 1000), open: b.o, high: b.h, low: b.l, close: b.c })),
            );
            const last = pb.at(-1)!;
            const close = bars.at(-1)!.c;
            return {
              ticker,
              close,
              playbit_regime: last.regime,
              pct_vs_ema_close: Number((((close - last.emaBot) / last.emaBot) * 100).toFixed(2)),
              converged: last.converged,
            };
          } catch (e) {
            return { ticker, error: e instanceof Error ? e.message : "error" };
          }
        }),
      );
      return JSON.stringify({ as_of: new Date().toISOString(), source: "massive", results });
    },
  });
}

/** List the portfolio's opportunities and pipeline status. */
export function listOpportunitiesTool(deps: ToolDeps) {
  return betaZodTool({
    name: "list_opportunities",
    description: "List the portfolio's opportunities with their pipeline status, direction, conviction, and thesis.",
    inputSchema: z.object({}),
    run: async () => {
      const { data } = await deps.admin
        .from("opportunities")
        .select("title, status, direction, conviction, position_size_pct, thesis")
        .eq("portfolio_id", deps.portfolioId)
        .order("updated_at", { ascending: false })
        .limit(30);
      return JSON.stringify(data ?? []);
    },
  });
}
