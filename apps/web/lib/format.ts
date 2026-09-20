export function usd(n: number, opts?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", ...opts }).format(n);
}

export function num(n: number, digits = 2): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: digits }).format(n);
}

export function pct(n: number, digits = 1): string {
  const s = n.toFixed(digits);
  return `${n > 0 ? "+" : ""}${s}%`;
}

export function signedUsd(n: number): string {
  return `${n > 0 ? "+" : n < 0 ? "-" : ""}${usd(Math.abs(n))}`;
}
