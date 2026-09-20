import { describe, it, expect } from "vitest";
import { ema, playbitRegime, computePlaybit } from "./playbit-ema";

describe("ema (TradingView-faithful seeding)", () => {
  it("seeds the first value with the raw source (not an SMA)", () => {
    expect(ema([42], 200)[0]).toBe(42);
    expect(ema([10, 12, 14, 16], 200)[0]).toBe(10);
  });

  it("matches the hand-computed recurrence for length 3 (k = 0.5)", () => {
    // k = 2/(3+1) = 0.5. ema0=10; ema1=12*.5+10*.5=11; ema2=14*.5+11*.5=12.5
    expect(ema([10, 12, 14], 3)).toEqual([10, 11, 12.5]);
  });

  it("is monotonic toward a constant series", () => {
    const out = ema([0, 10, 10, 10, 10, 10], 5);
    expect(out[0]).toBe(0);
    expect(out.at(-1)!).toBeGreaterThan(out[1]!);
    expect(out.at(-1)!).toBeLessThan(10);
  });

  it("throws on invalid length", () => {
    expect(() => ema([1, 2], 0)).toThrow();
  });
});

describe("playbitRegime", () => {
  it("classifies green/red/neutral", () => {
    expect(playbitRegime(105, 100, 90)).toBe("green"); // close > emaTop
    expect(playbitRegime(80, 100, 90)).toBe("red"); // close < emaBot
    expect(playbitRegime(95, 100, 90)).toBe("neutral"); // between
  });
});

describe("computePlaybit", () => {
  it("produces a point per bar with emaTop >= emaBot when highs >= closes", () => {
    const bars = Array.from({ length: 10 }, (_, i) => ({
      time: i,
      open: 100 + i,
      high: 102 + i,
      low: 99 + i,
      close: 100 + i,
    }));
    const pts = computePlaybit(bars, 5);
    expect(pts).toHaveLength(10);
    for (const p of pts) expect(p.emaTop).toBeGreaterThanOrEqual(p.emaBot);
    expect(pts.at(-1)!.converged).toBe(false); // only 10 bars < warmup
  });
});
