/** Build an OCC option symbol, e.g. AAPL 2026-09-21 call 245 -> O:AAPL260921C00245000. */
export function occSymbol(
  underlying: string,
  expiry: string, // YYYY-MM-DD
  type: "call" | "put",
  strike: number,
): string {
  const [y, m, d] = expiry.split("-");
  if (!y || !m || !d) throw new Error(`invalid expiry: ${expiry}`);
  const strikePart = Math.round(strike * 1000)
    .toString()
    .padStart(8, "0");
  return `O:${underlying.toUpperCase()}${y.slice(2)}${m}${d}${type === "call" ? "C" : "P"}${strikePart}`;
}
