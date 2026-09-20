// PlayBit EMA — TradingView-faithful. Two EMAs of length 200:
//   emaTop = EMA(high, 200), emaBot = EMA(close, 200)
// Regime: green if close > emaTop, red if close < emaBot, else neutral.

export const PLAYBIT_LENGTH = 200;
// EMA seed residual (1-k)^n < 1% only past ~462 bars, so require a longer warm-up than
// the naive `length` before treating the band as converged for regime decisions.
export const PLAYBIT_WARMUP_BARS = 500;

export type Regime = "green" | "red" | "neutral";

/**
 * Exponential moving average with TradingView's `ta.ema` seeding:
 * ema[0] = src[0]; ema[i] = src[i]*k + ema[i-1]*(1-k), where k = 2/(length+1).
 */
export function ema(values: number[], length: number): number[] {
  if (length <= 0) throw new Error("ema length must be > 0");
  const k = 2 / (length + 1);
  const out: number[] = new Array(values.length);
  let prev = 0;
  for (let i = 0; i < values.length; i++) {
    const v = values[i]!;
    prev = i === 0 ? v : v * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

export function playbitRegime(close: number, emaTop: number, emaBot: number): Regime {
  if (close > emaTop) return "green";
  if (close < emaBot) return "red";
  return "neutral";
}

export interface PlaybitBar {
  time: number; // seconds epoch (Lightweight Charts convention)
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface PlaybitPoint {
  time: number;
  emaTop: number;
  emaBot: number;
  regime: Regime;
  converged: boolean;
}

export function computePlaybit(
  bars: PlaybitBar[],
  length = PLAYBIT_LENGTH,
): PlaybitPoint[] {
  const emaTop = ema(
    bars.map((b) => b.high),
    length,
  );
  const emaBot = ema(
    bars.map((b) => b.close),
    length,
  );
  return bars.map((b, i) => ({
    time: b.time,
    emaTop: emaTop[i]!,
    emaBot: emaBot[i]!,
    regime: playbitRegime(b.close, emaTop[i]!, emaBot[i]!),
    converged: i >= PLAYBIT_WARMUP_BARS - 1,
  }));
}
