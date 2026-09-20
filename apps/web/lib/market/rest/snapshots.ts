import type { MassiveClient } from "../client";

export interface LastTrade {
  p: number; // price
  s: number; // size
  t: number; // sip timestamp (ns)
  x: number; // exchange
}

export async function getLastTrade(
  client: MassiveClient,
  ticker: string,
): Promise<LastTrade | null> {
  const res = await client.get<{ results?: LastTrade }>(
    `/v2/last/trade/${encodeURIComponent(ticker)}`,
  );
  return res.results ?? null;
}

interface RawNbbo {
  P: number; // ask price
  p: number; // bid price
  S: number; // ask size
  s: number; // bid size
  t: number;
}
export interface Quote {
  bid: number;
  ask: number;
  bidSize: number;
  askSize: number;
  t: number;
}

export async function getLastQuote(
  client: MassiveClient,
  ticker: string,
): Promise<Quote | null> {
  const res = await client.get<{ results?: RawNbbo }>(
    `/v2/last/nbbo/${encodeURIComponent(ticker)}`,
  );
  const r = res.results;
  if (!r) return null;
  return { bid: r.p, ask: r.P, bidSize: r.s, askSize: r.S, t: r.t };
}

export interface UniversalSnapshot {
  ticker: string;
  type?: string;
  session?: {
    close?: number;
    previous_close?: number;
    change_percent?: number;
    volume?: number;
  };
  last_trade?: { price?: number; timestamp?: number };
  last_quote?: { bid?: number; ask?: number; midpoint?: number };
}

export async function getUniversalSnapshot(
  client: MassiveClient,
  tickers: string[],
): Promise<UniversalSnapshot[]> {
  if (tickers.length === 0) return [];
  const res = await client.get<{ results?: UniversalSnapshot[] }>(`/v3/snapshot`, {
    query: { "ticker.any_of": tickers.join(","), limit: tickers.length },
  });
  return res.results ?? [];
}
