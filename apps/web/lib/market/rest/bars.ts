import type { MassiveClient } from "../client";

export type Timespan = "second" | "minute" | "hour" | "day" | "week" | "month";

export interface AggBar {
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
  vw?: number;
  t: number; // ms epoch
  n?: number;
}

export async function getAggregates(
  client: MassiveClient,
  p: {
    ticker: string;
    multiplier?: number;
    timespan?: Timespan;
    from: string;
    to: string;
    adjusted?: boolean;
    sort?: "asc" | "desc";
    limit?: number;
    signal?: AbortSignal;
  },
): Promise<AggBar[]> {
  const { ticker, multiplier = 1, timespan = "day", from, to } = p;
  const res = await client.get<{ results?: AggBar[] }>(
    `/v2/aggs/ticker/${encodeURIComponent(ticker)}/range/${multiplier}/${timespan}/${from}/${to}`,
    {
      query: {
        adjusted: p.adjusted ?? true,
        sort: p.sort ?? "asc",
        limit: p.limit ?? 50000,
      },
      signal: p.signal,
    },
  );
  return res.results ?? [];
}

export async function getPreviousClose(
  client: MassiveClient,
  ticker: string,
  adjusted = true,
): Promise<AggBar | null> {
  const res = await client.get<{ results?: AggBar[] }>(
    `/v2/aggs/ticker/${encodeURIComponent(ticker)}/prev`,
    { query: { adjusted } },
  );
  return res.results?.[0] ?? null;
}

export async function getGroupedDaily(
  client: MassiveClient,
  date: string,
  opts: { adjusted?: boolean; includeOtc?: boolean } = {},
): Promise<Array<AggBar & { T: string }>> {
  const res = await client.get<{ results?: Array<AggBar & { T: string }> }>(
    `/v2/aggs/grouped/locale/us/market/stocks/${date}`,
    { query: { adjusted: opts.adjusted ?? true, include_otc: opts.includeOtc ?? false } },
  );
  return res.results ?? [];
}
