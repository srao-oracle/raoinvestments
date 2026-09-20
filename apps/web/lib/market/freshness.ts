// Freshness envelope attached to every market datum served to agents/UI.

export type FreshnessSource = "realtime" | "delayed15" | "eod" | "cached";

export interface FreshnessEnvelope {
  as_of: string; // ISO-8601 of the datum
  source: FreshnessSource;
  market_status: string;
  staleness_seconds: number;
  is_stale: boolean;
}

export function computeFreshness(input: {
  asOf: string | number | Date;
  source: FreshnessSource;
  marketOpen: boolean;
  marketStatus?: string;
}): FreshnessEnvelope {
  const asOfMs =
    input.asOf instanceof Date
      ? input.asOf.getTime()
      : typeof input.asOf === "number"
        ? input.asOf
        : Date.parse(input.asOf);
  const staleness = Math.max(0, Math.round((Date.now() - asOfMs) / 1000));

  let is_stale = false;
  if (input.source === "cached") {
    is_stale = true;
  } else if (input.source === "realtime") {
    is_stale = input.marketOpen && staleness > 10;
  } else if (input.source === "delayed15") {
    is_stale = input.marketOpen && staleness > 15 * 60 + 30;
  } // "eod" is never "stale" outside market hours

  return {
    as_of: new Date(asOfMs).toISOString(),
    source: input.source,
    market_status: input.marketStatus ?? (input.marketOpen ? "open" : "closed"),
    staleness_seconds: staleness,
    is_stale,
  };
}
