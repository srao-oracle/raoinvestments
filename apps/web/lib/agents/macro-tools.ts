import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { getFredSeries } from "../market/fred";

/** Recent observations for a FRED macro series. */
export function fredSeriesTool() {
  return betaZodTool({
    name: "fred_series",
    description:
      "Latest values for a FRED macro series (e.g. DGS10, DGS2, T10Y2Y, CPIAUCSL, PCEPI, VIXCLS, UNRATE, FEDFUNDS, DTWEXBGS).",
    inputSchema: z.object({
      series_id: z.string(),
      limit: z.number().int().min(1).max(24).default(6),
    }),
    run: async ({ series_id, limit }) => {
      const start = new Date(Date.now() - 1000 * 60 * 60 * 24 * 500).toISOString().slice(0, 10);
      const obs = await getFredSeries(series_id, { observationStart: start });
      const recent = obs.filter((o) => o.value !== null).slice(-limit);
      return JSON.stringify({ series_id, observations: recent, source: "fred" });
    },
  });
}
