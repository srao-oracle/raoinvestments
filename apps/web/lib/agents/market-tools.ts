import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import type { ToolDeps } from "./deps";
import { getAggregates, getPreviousClose, getGroupedDaily } from "../market/rest/bars";
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

// ---- Market-wide screener (whole US market) --------------------------------
// Grouped-daily returns every US ticker's OHLCV for one date in a single call.
// Pulling ~5 anchor dates lets us compute cross-sectional 1m/3m/6m/12m returns
// for the ENTIRE market cheaply. Past-date snapshots are immutable, so cache them.
type GroupMap = Map<string, { c: number; v: number }>;
const groupedCache = new Map<string, GroupMap>();
const isoDay = (d: Date) => d.toISOString().slice(0, 10);
const minusDays = (base: Date, days: number) => new Date(base.getTime() - days * 86_400_000);

async function groupedNear(
  market: ToolDeps["market"],
  target: Date,
): Promise<{ date: string; map: GroupMap }> {
  // Step back up to 6 calendar days to skip weekends/holidays.
  for (let i = 0; i < 6; i++) {
    const ds = isoDay(minusDays(target, i));
    const cached = groupedCache.get(ds);
    if (cached) return { date: ds, map: cached };
    try {
      const rows = await getGroupedDaily(market, ds);
      if (rows.length > 0) {
        const map: GroupMap = new Map();
        for (const r of rows) map.set(r.T, { c: r.c, v: r.v });
        groupedCache.set(ds, map);
        return { date: ds, map };
      }
    } catch {
      // non-trading day / transient error — step back
    }
  }
  return { date: "", map: new Map() };
}

/** Screen the entire US stock market for long candidates by momentum + liquidity. */
export function scanMarketTool(deps: ToolDeps) {
  return betaZodTool({
    name: "scan_market",
    description:
      "Screen the ENTIRE US stock market (thousands of liquid names) for LONG candidates. Returns a ranked list with last close, daily dollar-volume ($M), and 1m/3m/6m/12m returns. Choose `style` to match the regime/sleeve and run it a few times with different styles + exclusions to build a diverse pool. This is your primary discovery tool — do not rely on a fixed watchlist.",
    inputSchema: z.object({
      style: z
        .enum(["momentum", "breakout", "pullback", "oversold", "most_active"])
        .default("momentum")
        .describe(
          "momentum=strong sustained uptrends; breakout=accelerating recent strength; pullback=strong names dipping recently (buy the dip); oversold=beaten-down names turning up (mean-reversion); most_active=highest dollar volume.",
        ),
      limit: z.number().int().min(5).max(60).default(40),
      min_price: z.number().default(7).describe("Exclude penny/low-priced names below this."),
      max_price: z.number().default(2000),
      min_dollar_vol_m: z
        .number()
        .default(25)
        .describe("Minimum average daily dollar volume in $M (liquidity floor)."),
      exclude: z
        .array(z.string())
        .max(80)
        .default([])
        .describe("Tickers to exclude (e.g. names already held or already pitched)."),
    }),
    run: async ({ style, limit, min_price, max_price, min_dollar_vol_m, exclude }) => {
      const ex = new Set(exclude.map((s) => s.toUpperCase()));
      const t0 = await groupedNear(deps.market, new Date());
      if (t0.map.size === 0)
        return JSON.stringify({ error: "no grouped-daily data available", style });
      const base = new Date(`${t0.date}T00:00:00Z`);
      const [a1, a3, a6, a12] = await Promise.all([
        groupedNear(deps.market, minusDays(base, 31)),
        groupedNear(deps.market, minusDays(base, 92)),
        groupedNear(deps.market, minusDays(base, 183)),
        groupedNear(deps.market, minusDays(base, 365)),
      ]);
      const rc = (m: GroupMap, ticker: string, c: number) => {
        const p = m.get(ticker)?.c;
        return p && p > 0 ? Number((((c - p) / p) * 100).toFixed(1)) : null;
      };
      type Row = {
        ticker: string;
        close: number;
        dvol_m: number;
        ret_1m: number | null;
        ret_3m: number | null;
        ret_6m: number | null;
        ret_12m: number | null;
      };
      const rows: Row[] = [];
      for (const [ticker, { c, v }] of t0.map) {
        if (ex.has(ticker) || !/^[A-Z]{1,5}$/.test(ticker)) continue; // common-stock-ish symbols
        if (c < min_price || c > max_price) continue;
        const dvol_m = Number(((c * v) / 1e6).toFixed(1));
        if (dvol_m < min_dollar_vol_m) continue;
        rows.push({
          ticker,
          close: Number(c.toFixed(2)),
          dvol_m,
          ret_1m: rc(a1.map, ticker, c),
          ret_3m: rc(a3.map, ticker, c),
          ret_6m: rc(a6.map, ticker, c),
          ret_12m: rc(a12.map, ticker, c),
        });
      }
      const n = (x: number | null) => x ?? -1e9;
      let ranked: Row[];
      switch (style) {
        case "most_active":
          ranked = rows.sort((a, b) => b.dvol_m - a.dvol_m);
          break;
        case "breakout":
          ranked = rows
            .filter((r) => n(r.ret_1m) > 5 && n(r.ret_3m) > 10)
            .sort((a, b) => n(b.ret_1m) + n(b.ret_3m) - (n(a.ret_1m) + n(a.ret_3m)));
          break;
        case "pullback":
          ranked = rows
            .filter((r) => n(r.ret_6m) > 10 && n(r.ret_12m) > 0 && n(r.ret_1m) < 0)
            .sort((a, b) => n(b.ret_6m) - n(a.ret_6m));
          break;
        case "oversold":
          ranked = rows
            .filter((r) => n(r.ret_12m) < -20 && n(r.ret_1m) > 0)
            .sort((a, b) => n(b.ret_1m) - n(a.ret_1m));
          break;
        case "momentum":
        default: {
          const composite = (r: Row) => 0.5 * n(r.ret_3m) + 0.3 * n(r.ret_6m) + 0.2 * n(r.ret_12m);
          ranked = rows
            .filter(
              (r) =>
                r.ret_3m !== null &&
                r.ret_6m !== null &&
                n(r.ret_3m) > 0 &&
                n(r.ret_12m) > 0 &&
                n(r.ret_3m) < 200, // drop parabolic pump names
            )
            .sort((a, b) => composite(b) - composite(a));
          break;
        }
      }
      return JSON.stringify({
        style,
        as_of: t0.date,
        source: "massive",
        universe_size: t0.map.size,
        passed_filters: rows.length,
        results: ranked.slice(0, limit),
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
