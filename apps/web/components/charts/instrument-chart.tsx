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

function cssVar(name: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

export function InstrumentChart({ initialSymbol = "SPY" }: { initialSymbol?: string }) {
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

    const text = cssVar("--color-muted-foreground", "#8a8a8a");
    const grid = cssVar("--color-border", "#2a2a2a");

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
      color: "#2563eb",
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
    });
    const emaBotSeries = chart.addSeries(LineSeries, {
      color: "#f59e0b",
      lineWidth: 1,
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
      </div>
      <div ref={containerRef} className="h-[320px] w-full" />
      {loading ? (
        <p className="mt-2 text-xs text-[var(--color-muted-foreground)]">Loading…</p>
      ) : null}
      {error ? <p className="mt-2 text-xs text-red-500">{error}</p> : null}
      <p className="mt-2 text-xs text-[var(--color-muted-foreground)]">
        PlayBit EMA: teal = EMA(high,200), amber = EMA(close,200). Daily bars.
      </p>
    </div>
  );
}
