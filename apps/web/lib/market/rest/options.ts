import type { MassiveClient } from "../client";

export interface OptionSnapshot {
  details: {
    contract_type: "call" | "put";
    exercise_style?: string;
    expiration_date: string;
    strike_price: number;
    ticker: string; // OCC symbol, e.g. O:AAPL260921C00245000
    shares_per_contract: number;
  };
  greeks?: { delta: number; gamma: number; theta: number; vega: number };
  implied_volatility?: number;
  open_interest?: number;
  break_even_price?: number;
  day?: { close?: number; volume?: number };
  last_quote?: { bid?: number; ask?: number; midpoint?: number };
  underlying_asset?: { price?: number; ticker: string };
}

export async function getOptionChainSnapshot(
  client: MassiveClient,
  underlying: string,
  p: {
    expirationGte?: string;
    expirationLte?: string;
    strikeGte?: number;
    strikeLte?: number;
    contractType?: "call" | "put";
    limit?: number;
    signal?: AbortSignal;
  } = {},
): Promise<OptionSnapshot[]> {
  const target = p.limit ?? 250;
  const query: Record<string, string | number> = { limit: Math.min(target, 250) };
  if (p.expirationGte) query["expiration_date.gte"] = p.expirationGte;
  if (p.expirationLte) query["expiration_date.lte"] = p.expirationLte;
  if (p.strikeGte != null) query["strike_price.gte"] = p.strikeGte;
  if (p.strikeLte != null) query["strike_price.lte"] = p.strikeLte;
  if (p.contractType) query["contract_type"] = p.contractType;

  const out: OptionSnapshot[] = [];
  for await (const page of client.paginate<OptionSnapshot>(
    `/v3/snapshot/options/${encodeURIComponent(underlying)}`,
    { query, signal: p.signal },
  )) {
    out.push(...page);
    if (out.length >= target) break;
  }
  return out.slice(0, target);
}
