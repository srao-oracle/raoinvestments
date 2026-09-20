"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { InstrumentChart } from "./instrument-chart";

// Spec emitted by agents inside a ```chart fenced block, e.g.
//   {"type":"price","symbol":"NVDA"}
//   {"type":"bar","title":"Revenue ($B)","data":[{"label":"FY23","value":60.9}]}
type ChartSpec = {
  type?: string;
  symbol?: string;
  title?: string;
  unit?: string;
  data?: Array<{ label?: string; name?: string; x?: string | number; value?: number; y?: number }>;
};

function isDark(): boolean {
  if (typeof window === "undefined") return true;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? true;
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <div className="my-3 rounded-md border border-[var(--color-border)] p-3 text-xs text-[var(--color-muted-foreground)]">
      {children}
    </div>
  );
}

export function AnalysisChart({ raw }: { raw: string }) {
  let spec: ChartSpec;
  try {
    spec = JSON.parse(raw) as ChartSpec;
  } catch {
    return <Note>Chart could not be rendered (invalid spec).</Note>;
  }

  const type = (spec.type ?? "").toLowerCase();

  if (type === "price" || type === "price_playbit" || type === "candles") {
    const symbol = (spec.symbol ?? "").toUpperCase();
    if (!symbol) return <Note>Price chart is missing a symbol.</Note>;
    return (
      <div className="my-3">
        <InstrumentChart initialSymbol={symbol} readOnly />
      </div>
    );
  }

  const rows = (spec.data ?? [])
    .map((d) => ({
      label: String(d.label ?? d.name ?? d.x ?? ""),
      value: Number(d.value ?? d.y ?? NaN),
    }))
    .filter((d) => d.label && Number.isFinite(d.value));

  if ((type === "bar" || type === "line") && rows.length === 0)
    return <Note>Chart has no data points.</Note>;
  if (type !== "bar" && type !== "line")
    return <Note>Unsupported chart type “{spec.type}”.</Note>;

  const dark = isDark();
  const ink = dark ? "#e4e4e7" : "#27272a";
  const soft = dark ? "#a1a1aa" : "#6b7280";
  const grid = dark ? "#3f3f46" : "#e4e4e7";

  return (
    <figure className="my-3 rounded-lg border border-[var(--color-border)] p-3">
      {spec.title ? (
        <figcaption className="mb-2 text-xs font-medium text-[var(--color-muted-foreground)]">
          {spec.title}
          {spec.unit ? ` (${spec.unit})` : ""}
        </figcaption>
      ) : null}
      <div className="h-[240px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          {type === "bar" ? (
            <BarChart data={rows} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={grid} strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" tick={{ fill: soft, fontSize: 11 }} stroke={grid} interval={0} />
              <YAxis tick={{ fill: soft, fontSize: 11 }} stroke={grid} width={40} />
              <Tooltip
                contentStyle={{ background: dark ? "#111" : "#fff", border: `1px solid ${grid}`, fontSize: 12 }}
                labelStyle={{ color: soft }}
                cursor={{ fill: dark ? "#ffffff14" : "#00000010" }}
              />
              <Bar dataKey="value" fill={ink} radius={[2, 2, 0, 0]} />
            </BarChart>
          ) : (
            <LineChart data={rows} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={grid} strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" tick={{ fill: soft, fontSize: 11 }} stroke={grid} interval="preserveStartEnd" />
              <YAxis tick={{ fill: soft, fontSize: 11 }} stroke={grid} width={40} />
              <Tooltip
                contentStyle={{ background: dark ? "#111" : "#fff", border: `1px solid ${grid}`, fontSize: 12 }}
                labelStyle={{ color: soft }}
              />
              <Line type="monotone" dataKey="value" stroke={ink} strokeWidth={2} dot={false} />
            </LineChart>
          )}
        </ResponsiveContainer>
      </div>
    </figure>
  );
}
