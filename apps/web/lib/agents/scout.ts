import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { createAdminClient } from "../supabase/admin";
import { massive } from "../market/client";
import {
  client,
  MODELS,
  priceUsd,
  logAgentRun,
  assertNotKilled,
  drainRunner,
  type DrainableRunner,
} from "./anthropic";
import { readStrategyTool, readPositionsTool, screenWatchlistTool } from "./tools";
import { SCOUT_SYSTEM } from "./prompts";
import type { ToolDeps } from "./deps";

const DEFAULT_UNIVERSE = [
  "SPY", "QQQ", "AAPL", "MSFT", "NVDA", "AMZN", "GOOGL", "META", "AVGO", "JPM", "XLE", "XLK",
];

export interface ScoutResult {
  candidates: number;
  costUsd: number;
  status: string;
}

interface EmittedCandidate {
  symbol: string;
  score: number;
  playbit_regime?: string;
  why: string;
  suggested_structures: string[];
}

export async function runScout(portfolioId: string): Promise<ScoutResult> {
  const admin = createAdminClient();
  await assertNotKilled(admin);
  const deps: ToolDeps = { portfolioId, admin, market: massive() };

  const { data: strat } = await admin
    .from("strategies")
    .select("doc")
    .eq("portfolio_id", portfolioId)
    .eq("is_current", true)
    .maybeSingle();
  const doc = ((strat as { doc?: Record<string, unknown> } | null)?.doc ?? {}) as Record<string, unknown>;
  const watchTickers = (doc.watchlist_tickers as string[] | undefined) ?? [];
  const themes = (doc.watchlist_themes as string[] | undefined) ?? [];
  const universe = Array.from(new Set([...watchTickers, ...DEFAULT_UNIVERSE]));

  let emitted: EmittedCandidate[] = [];
  const emitCandidates = betaZodTool({
    name: "emit_candidates",
    description: "Submit your final ranked candidate shortlist. Call exactly once when finished.",
    inputSchema: z.object({
      candidates: z
        .array(
          z.object({
            symbol: z.string(),
            score: z.number().min(0).max(100),
            playbit_regime: z.enum(["green", "red", "neutral"]).optional(),
            why: z.string().max(240),
            suggested_structures: z.array(z.string()).default([]),
          }),
        )
        .max(8),
    }),
    run: async ({ candidates }) => {
      emitted = candidates;
      return JSON.stringify({ received: candidates.length });
    },
  });

  const runner = client.beta.messages.toolRunner({
    model: MODELS.sonnet,
    max_tokens: 8000,
    system: SCOUT_SYSTEM,
    tools: [readStrategyTool(deps), readPositionsTool(deps), screenWatchlistTool(deps), emitCandidates],
    messages: [
      {
        role: "user",
        content: `Screen for long candidates now. Universe to consider: ${universe.join(", ")}. Strategy themes: ${JSON.stringify(themes)}. Read the strategy, screen the watchlist, then emit your ranked shortlist (max 8).`,
      },
    ],
  });

  const { inputTokens, outputTokens, refused } = await drainRunner(
    runner as unknown as DrainableRunner,
  );
  const status = refused ? "failed" : "succeeded";
  await logAgentRun(admin, {
    portfolioId,
    role: "scout",
    model: MODELS.sonnet,
    inputTokens,
    outputTokens,
    status,
  });

  for (const c of emitted) {
    const symbol = c.symbol.toUpperCase();
    const { data: inst } = await admin
      .from("instruments")
      .upsert({ symbol, asset_class: "stock" }, { onConflict: "symbol,currency" })
      .select("id")
      .single();
    const instrumentId = (inst as { id: string } | null)?.id;
    await admin.from("scout_candidates").insert({
      portfolio_id: portfolioId,
      instrument_id: instrumentId ?? null,
      symbol,
      score: c.score,
      signal_type: c.playbit_regime ?? null,
      raw: c,
      status: "new",
    });
    if (instrumentId) {
      const { data: existing } = await admin
        .from("opportunities")
        .select("id")
        .eq("portfolio_id", portfolioId)
        .eq("instrument_id", instrumentId)
        .not("status", "in", "(closed,rejected)")
        .maybeSingle();
      if (!existing) {
        await admin.from("opportunities").insert({
          portfolio_id: portfolioId,
          instrument_id: instrumentId,
          status: "candidate",
          title: symbol,
          thesis: c.why,
          source: "scout",
        });
      }
    }
  }

  return {
    candidates: emitted.length,
    costUsd: priceUsd(MODELS.sonnet, inputTokens, outputTokens),
    status,
  };
}
