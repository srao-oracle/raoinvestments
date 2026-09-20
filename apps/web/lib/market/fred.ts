// FRED (St. Louis Fed) macro series client for the Strategist agent (M5).

export interface FredObservation {
  date: string;
  value: number | null; // FRED's "." sentinel -> null
}

export const MACRO_SERIES = [
  "DGS2",
  "DGS10",
  "T10Y2Y",
  "FEDFUNDS",
  "CPIAUCSL",
  "PCEPI",
  "DTWEXBGS",
  "VIXCLS",
  "UNRATE",
  "GDPC1",
] as const;

export async function getFredSeries(
  seriesId: string,
  opts: { observationStart?: string; observationEnd?: string; apiKey?: string } = {},
): Promise<FredObservation[]> {
  const apiKey = opts.apiKey ?? process.env.FRED_API_KEY;
  if (!apiKey) throw new Error("FRED_API_KEY is not set");

  const url = new URL("https://api.stlouisfed.org/fred/series/observations");
  url.searchParams.set("series_id", seriesId);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("file_type", "json");
  if (opts.observationStart) url.searchParams.set("observation_start", opts.observationStart);
  if (opts.observationEnd) url.searchParams.set("observation_end", opts.observationEnd);

  const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`FRED ${res.status}: ${(await res.text()).slice(0, 160)}`);
  const data = (await res.json()) as {
    observations?: Array<{ date: string; value: string }>;
  };
  return (data.observations ?? []).map((o) => ({
    date: o.date,
    value: o.value === "." ? null : Number(o.value),
  }));
}
