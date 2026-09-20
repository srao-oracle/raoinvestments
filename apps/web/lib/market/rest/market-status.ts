import type { MassiveClient } from "../client";

export interface MarketStatus {
  market?: string; // "open" | "closed" | "extended-hours"
  afterHours?: boolean;
  earlyHours?: boolean;
  exchanges?: { nasdaq?: string; nyse?: string; otc?: string };
  serverTime?: string;
}

export async function getMarketStatus(client: MassiveClient): Promise<MarketStatus> {
  return client.get<MarketStatus>(`/v1/marketstatus/now`);
}

export function usEquitiesOpen(s: MarketStatus): boolean {
  return s.exchanges?.nasdaq === "open" || s.exchanges?.nyse === "open";
}
