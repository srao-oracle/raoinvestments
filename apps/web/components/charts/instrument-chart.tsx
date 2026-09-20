"use client";

import { useEffect, useRef, useState } from "react";
import {
  createChart,
  CandlestickSeries,
  LineSeries,
  ColorType,
  type IChartApi,
  type Time,
} from "lightweight-charts";

type Candle = { time: number; open: number; high: number; low: number; close: number };
type PbPoint = { time: number; emaTop: number; emaBot: number; regime: string };
type BarsResponse = { symbol: string; candles: Candle[]; playbit: PbPoint[] };

function isDark(): boolean {
  if (typeof window === "undefined") return true;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? true;
}

// Resolve a Tailwind v4 theme token (OKLCH) to a color lightweight-charts can parse.
// getComputedStyle returns modern `oklch()`/`lab()` strings that lightweight-charts'
// parser rejects (throws "Failed to parse color"), so normalize via a canvas to
// hex/rgb, and fall back to theme-matched hex if the browser can't normalize it.
function resolveColor(name: string, lightFallback: string, darkFallback: string): string {
  const fallback = isDark() ? darkFallback : lightFallback;
  if (typeof window === "undefined") return fallback;
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  if (!raw) return fallback;
  try {
    const ctx = document.createElement("canvas").getContext("2d");
    if (ctx) {
      ctx.fillStyle = "#000000";
      ctx.fillStyle = raw;
      const resolved = ctx.fillStyle;
      if (/^#[0-9a-f]{3,8}$/i.test(resolved) || /^rgba?\(/i.test(resolved)) return resolved;
    }
  } catch {
    // ignore and use fallback
  }
  return fallback;
}

export function InstrumentChart({
  initialSymbol = "SPY",
  readOnly = false,
}: {
  initialSymbol?: string;
  readOnly?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const [symbol, setSymbol] = useState(initialSymbol);
  const [input, setInput] = useState(initialSymbol);
  const [regime, setRegime] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const text = resolveColor("--color-muted-foreground", "#71717a", "#a1a1aa");
    const grid = resolveColor("--color-border", "#e4e4e7", "#3f3f46");
    // Monochrome EMA lines: strong = EMA(high,200) solid, soft = EMA(close,200) dashed.
    const lineStrong = isDark() ? "#e4e4e7" : "#27272a";
    const lineSoft = isDark() ? "#a1a1aa" : "#6b7280";

    const chart = createChart(el, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: text,
        attributionLogo: true, // Lightweight Charts attribution (Apache-2.0)
      },
      grid: { vertLines: { color: grid }, horzLines: { color: grid } },
      rightPriceScale: { borderColor: grid },
      timeScale: { borderColor: grid },
    });
    chartRef.current = chart;

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: "#16a34a",
      downColor: "#dc2626",
      wickUpColor: "#16a34a",
      wickDownColor: "#dc2626",
      borderVisible: false,
    });
    const emaTopSeries = chart.addSeries(LineSeries, {
      color: lineStrong,
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false,
    });
    const emaBotSeries = chart.addSeries(LineSeries, {
      color: lineSoft,
      lineWidth: 1,
      lineStyle: 2, // dashed
      priceLineVisible: false,
      lastValueVisible: false,
    });

    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/market/${encodeURIComponent(symbol)}/bars`)
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).error ?? `HTTP ${r.status}`);
        return (await r.json()) as BarsResponse;
      })
      .then((data) => {
        if (cancelled) return;
        candleSeries.setData(
          data.candles.map((c) => ({ ...c, time: c.time as Time })),
        );
        emaTopSeries.setData(
          data.playbit.map((p) => ({ time: p.time as Time, value: p.emaTop })),
        );
        emaBotSeries.setData(
          data.playbit.map((p) => ({ time: p.time as Time, value: p.emaBot })),
        );
        chart.timeScale().fitContent();
        setRegime(data.playbit.at(-1)?.regime ?? null);
        setLoading(false);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Failed to load chart");
        setLoading(false);
      });

    return () => {
      cancelled = true;
      chart.remove();
      chartRef.current = null;
    };
  }, [symbol]);

  const regimeColor =
    regime === "green"
      ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
      : regime === "red"
        ? "bg-red-500/15 text-red-600 dark:text-red-400"
        : "bg-neutral-500/15 text-[var(--color-muted-foreground)]";

  return (
    <div className="rounded-lg border border-[var(--color-border)] p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold">{symbol}</h2>
          {regime ? (
            <span className={`rounded-full px-2 py-0.5 text-xs capitalize ${regimeColor}`}>
              PlayBit: {regime}
            </span>
          ) : null}
        </div>
        {readOnly ? null : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const s = input.trim().toUpperCase();
              if (s) setSymbol(s);
            }}
            className="flex items-center gap-1"
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              className="h-8 w-24 rounded-md border border-[var(--color-border)] bg-transparent px-2 text-sm outline-none focus:border-[var(--color-primary)]"
              placeholder="Ticker"
              aria-label="Ticker symbol"
            />
          </form>
        )}
      </div>
      <div ref={containerRef} className="h-[320px] w-full" />
      {loading ? (
        <p className="mt-2 text-xs text-[var(--color-muted-foreground)]">Loading…</p>
      ) : null}
      {error ? <p className="mt-2 text-xs text-red-500">{error}</p> : null}
      <p className="mt-2 text-xs text-[var(--color-muted-foreground)]">
        PlayBit EMA: solid = EMA(high,200), dashed = EMA(close,200). Daily bars.
      </p>
    </div>
  );
}
