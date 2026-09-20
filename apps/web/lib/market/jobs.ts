import type { SupabaseClient } from "@supabase/supabase-js";
import { massive } from "./client";
import { getAggregates, getPreviousClose } from "./rest/bars";
import { getOptionChainSnapshot } from "./rest/options";
import { getFredSeries, MACRO_SERIES } from "./fred";
import { ema } from "./compute/playbit-ema";

const today = () => new Date().toISOString().slice(0, 10);
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);

async function trackedInstruments(
  admin: SupabaseClient,
): Promise<Array<{ id: string; symbol: string }>> {
  const { data } = await admin
    .from("instruments")
    .select("id, symbol")
    .in("asset_class", ["stock", "etf"])
    .eq("active", true)
    .limit(200);
  return (data ?? []) as Array<{ id: string; symbol: string }>;
}

/** Refresh FRED macro series into macro_series. */
export async function refreshMacro(admin: SupabaseClient): Promise<{ series: number }> {
  let count = 0;
  for (const s of MACRO_SERIES) {
    try {
      const obs = await getFredSeries(s, { observationStart: daysAgo(400) });
      const rows = obs
        .filter((o) => o.value !== null)
        .slice(-30)
        .map((o) => ({ series_id: s, as_of: o.date, value: o.value }));
      if (rows.length) {
        await admin.from("macro_series").upsert(rows, { onConflict: "series_id,as_of" });
        count++;
      }
    } catch {
      /* per-series best-effort */
    }
  }
  return { series: count };
}

/** Upsert the latest daily bar for tracked instruments. */
export async function refreshEodBars(admin: SupabaseClient): Promise<{ bars: number }> {
  const m = massive();
  const instruments = await trackedInstruments(admin);
  let bars = 0;
  for (const inst of instruments) {
    try {
      const prev = await getPreviousClose(m, inst.symbol);
      if (!prev) continue;
      await admin.from("ohlc_bars").upsert(
        {
          instrument_id: inst.id,
          timeframe: "1d",
          ts: new Date(prev.t).toISOString(),
          open: prev.o,
          high: prev.h,
          low: prev.l,
          close: prev.c,
          volume: prev.v,
          vwap: prev.vw ?? null,
        },
        { onConflict: "instrument_id,timeframe,ts" },
      );
      bars++;
    } catch {
      /* best-effort */
    }
  }
  return { bars };
}

/** Snapshot ATM ~30-45 DTE IV per tracked underlying into iv_history. */
export async function snapshotIv(admin: SupabaseClient): Promise<{ underlyings: number }> {
  const m = massive();
  const instruments = await trackedInstruments(admin);
  let count = 0;
  for (const inst of instruments) {
    try {
      const snaps = await getOptionChainSnapshot(m, inst.symbol, {
        expirationGte: daysAgo(-25),
        expirationLte: daysAgo(-50),
        limit: 120,
      });
      const spot = snaps.find((s) => s.underlying_asset?.price)?.underlying_asset?.price;
      if (!spot) continue;
      const withIv = snaps.filter((s) => typeof s.implied_volatility === "number");
      if (!withIv.length) continue;
      const atm = withIv.reduce((best, s) =>
        Math.abs(s.details.strike_price - spot) < Math.abs(best.details.strike_price - spot) ? s : best,
      );
      await admin.from("iv_history").upsert(
        {
          instrument_id: inst.id,
          as_of: today(),
          atm_iv: atm.implied_volatility,
          spot_price: spot,
        },
        { onConflict: "instrument_id,as_of" },
      );
      count++;
    } catch {
      /* best-effort */
    }
  }
  return { underlyings: count };
}

/** Breadth proxy: % of tracked instruments above their EMA(close,200). */
export async function snapshotBreadth(admin: SupabaseClient): Promise<{ pct_above_200dma: number | null }> {
  const m = massive();
  const instruments = await trackedInstruments(admin);
  let above = 0;
  let total = 0;
  for (const inst of instruments) {
    try {
      const bars = await getAggregates(m, {
        ticker: inst.symbol,
        timespan: "day",
        from: daysAgo(365 * 2),
        to: today(),
      });
      if (bars.length < 200) continue;
      const emaClose = ema(bars.map((b) => b.c), 200).at(-1)!;
      total++;
      if (bars.at(-1)!.c > emaClose) above++;
    } catch {
      /* best-effort */
    }
  }
  const pct = total > 0 ? Number(((above / total) * 100).toFixed(2)) : null;
  if (pct != null) {
    await admin
      .from("breadth_snapshots")
      .upsert(
        { as_of: today(), pct_above_200dma: pct, metadata: { sample: total, above } },
        { onConflict: "as_of" },
      );
  }
  return { pct_above_200dma: pct };
}

/** EOD NAV snapshot for every active portfolio. */
export async function snapshotNavAll(admin: SupabaseClient): Promise<{ portfolios: number }> {
  const { data } = await admin.from("portfolios").select("id").eq("status", "active");
  const ids = ((data ?? []) as { id: string }[]).map((p) => p.id);
  for (const id of ids) {
    await admin.rpc("fn_snapshot_nav", { p_portfolio: id, p_as_of: today() });
  }
  return { portfolios: ids.length };
}
