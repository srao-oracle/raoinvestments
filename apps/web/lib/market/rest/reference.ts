import type { MassiveClient } from "../client";

export interface TickerDetails {
  ticker: string;
  name: string;
  market: string;
  primary_exchange?: string;
  type?: string;
  active: boolean;
  sic_description?: string;
  market_cap?: number;
  currency_name?: string;
}

export async function getTickerDetails(
  client: MassiveClient,
  ticker: string,
): Promise<TickerDetails | null> {
  const res = await client.get<{ results?: TickerDetails }>(
    `/v3/reference/tickers/${encodeURIComponent(ticker)}`,
  );
  return res.results ?? null;
}
