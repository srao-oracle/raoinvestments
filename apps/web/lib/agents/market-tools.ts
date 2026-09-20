import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import type { ToolDeps } from "./deps";
import { getAggregates, getPreviousClose } from "../market/rest/bars";
import { getLastTrade } from "../market/rest/snapshots";
import { getTickerDetails } from "../market/rest/reference";
import { getOptionChainSnapshot } from "../market/rest/options";
import { computePlaybit } from "../market/compute/playbit-ema";

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);
const today = () => new Date().toISOString().slice(0, 10);
const ret = (bars: { c: number }[], n: number) => {
  if (bars.length <= n) return null;
  const now = bars.at(-1)!.c;
  const then = bars[bars.length - 1 - n]!.c;
  return Number((((now - then) / then) * 100).toFixed(2));
};

/** Compact technical + PlayBit summary for one ticker. */
export function getBarsPlaybitTool(deps: ToolDeps) {
  return betaZodTool({
    name: "get_bars_playbit",
    description:
      "Technical summary for a ticker: last close, PlayBit EMA band + regime, 52-week high/low, and 1m/3m/12m returns. Use to judge trend and entry.",
    inputSchema: z.object({ ticker: z.string() }),
    run: async ({ ticker }) => {
      const sym = ticker.toUpperCase();
      const bars = await getAggregates(deps.market, {
        ticker: sym,
        timespan: "day",
        from: daysAgo(365 * 3),
        to: today(),
      });
      if (bars.length < 60) return JSON.stringify({ ticker: sym, error: "insufficient history" });
      const pb = computePlaybit(
        bars.map((b) => ({ time: Math.floor(b.t / 1000), open: b.o, high: b.h, low: b.l, close: b.c })),
      );
      const last = pb.at(-1)!;
      const close = bars.at(-1)!.c;
      const win = bars.slice(-252);
      const high52 = Math.max(...win.map((b) => b.h));
      const low52 = Math.min(...win.map((b) => b.l));
      return JSON.stringify({
        ticker: sym,
        as_of: new Date(bars.at(-1)!.t).toISOString(),
        source: "massive",
        last_close: close,
        playbit: { emaTop: last.emaTop, emaBot: last.emaBot, regime: last.regime, converged: last.converged },
        high_52w: high52,
        low_52w: low52,
        pct_off_52w_high: Number((((close - high52) / high52) * 100).toFixed(2)),
        ret_1m: ret(bars, 21),
        ret_3m: ret(bars, 63),
        ret_12m: ret(bars, 252),
      });
    },
  });
}

export function getTickerDetailsTool(deps: ToolDeps) {
  return betaZodTool({
    name: "get_ticker_details",
    description: "Company reference: name, sector, exchange, market cap.",
    inputSchema: z.object({ ticker: z.string() }),
    run: async ({ ticker }) => {
      const d = await getTickerDetails(deps.market, ticker.toUpperCase());
      return JSON.stringify(d ?? { error: "not found" });
    },
  });
}

export function getQuoteTool(deps: ToolDeps) {
  return betaZodTool({
    name: "get_quote",
    description: "Latest trade price and previous close for a ticker (re-verify pricing).",
    inputSchema: z.object({ ticker: z.string() }),
    run: async ({ ticker }) => {
      const sym = ticker.toUpperCase();
      const [lt, prev] = await Promise.all([
        getLastTrade(deps.market, sym),
        getPreviousClose(deps.market, sym),
      ]);
      return JSON.stringify({
        ticker: sym,
        last: lt?.p ?? null,
        prev_close: prev?.c ?? null,
        as_of: lt ? new Date(Math.floor(lt.t / 1e6)).toISOString() : null,
        source: "massive",
      });
    },
  });
}

/** Near-the-money option chain slice with greeks/IV for the given DTE window. */
export function getOptionChainTool(deps: ToolDeps) {
  return betaZodTool({
    name: "get_option_chain",
    description:
      "Near-the-money option contracts (greeks, IV, open interest, bid/ask) for an underlying and DTE window. Use to design an option structure.",
    inputSchema: z.object({
      underlying: z.string(),
      min_dte: z.number().int().default(25),
      max_dte: z.number().int().default(60),
      contract_type: z.enum(["call", "put"]).optional(),
    }),
    run: async ({ underlying, min_dte, max_dte, contract_type }) => {
      const snaps = await getOptionChainSnapshot(deps.market, underlying.toUpperCase(), {
        expirationGte: daysAgo(-min_dte),
        expirationLte: daysAgo(-max_dte),
        contractType: contract_type,
        limit: 250,
      });
      const spot = snaps.find((s) => s.underlying_asset?.price)?.underlying_asset?.price;
      const near = spot
        ? snaps.filter((s) => Math.abs(s.details.strike_price - spot) / spot <= 0.15)
        : snaps;
      const trimmed = near.slice(0, 16).map((s) => ({
        ticker: s.details.ticker,
        type: s.details.contract_type,
        strike: s.details.strike_price,
        expiry: s.details.expiration_date,
        delta: s.greeks?.delta,
        iv: s.implied_volatility,
        oi: s.open_interest,
        bid: s.last_quote?.bid,
        ask: s.last_quote?.ask,
        mid: s.last_quote?.midpoint,
        break_even: s.break_even_price,
      }));
      return JSON.stringify({ underlying: underlying.toUpperCase(), spot, contracts: trimmed, source: "massive" });
    },
  });
}
