import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { createAdminClient } from "../supabase/admin";
import { massive } from "../market/client";
import { client, drainAndLog } from "./anthropic";
import { agentPreflight } from "./budget";
import { AGENT_CONFIG, type AgentCfg } from "./config";
import { validateRecommendation } from "./guardrails";
import { readStrategyTool, readPositionsTool } from "./tools";
import {
  getBarsPlaybitTool,
  getTickerDetailsTool,
  getQuoteTool,
  getOptionChainTool,
} from "./market-tools";
import { valuePortfolioTool, sizePositionTool, checkRiskTool, planAllocationTool } from "./risk-tools";
import { portfolioDeltaTool, emitHedgeTool } from "./hedge-tools";
import { fredSeriesTool } from "./macro-tools";
import { RESEARCH_SYSTEM, RED_TEAM_SYSTEM, PM_SYSTEM, STRATEGIST_SYSTEM, HEDGER_SYSTEM } from "./prompts";
import type { ToolDeps } from "./deps";

const WEB_SEARCH = { type: "web_search_20260209", name: "web_search", max_uses: 4 } as const;

const STRUCT_TO_DIR: Record<string, string> = {
  long_stock: "long_stock",
  long_call: "long_call",
  long_put: "long_put",
  covered_call: "covered_call",
  cash_secured_put: "csp",
  call_debit_spread: "long_call",
};
const CONV: Record<string, number> = { low: 0.33, medium: 0.66, high: 0.9 };

const LegSchema = z.object({
  right: z.enum(["call", "put"]),
  action: z.enum(["buy_to_open", "sell_to_open", "sell_to_close", "buy_to_close"]),
  strike: z.number(),
  expiry: z.string(),
});

async function runAgent(
  role: string,
  cfg: AgentCfg,
  deps: ToolDeps,
  system: string,
  tools: unknown[],
  userMessage: string,
): Promise<{ status: string; refused: boolean }> {
  const runner = client.beta.messages.toolRunner({
    model: cfg.model,
    max_tokens: cfg.maxTokens,
    thinking: { type: "adaptive" },
    output_config: { effort: cfg.effort },
    system,
    tools: tools as never,
    messages: [{ role: "user", content: userMessage }],
  });
  return drainAndLog(runner, {
    role,
    portfolioId: deps.portfolioId,
    admin: deps.admin,
    model: cfg.model,
  });
}

interface ThesisEmit {
  direction: "bullish" | "neutral" | "bearish";
  conviction: "low" | "medium" | "high";
  summary: string;
  analysis: string;
  bull_case: string[];
  bear_case: string[];
  catalysts: string[];
  invalidation: string;
  proposed_structure: string;
  entry_zone?: number;
  fair_value?: number;
}

async function runResearch(oppId: string, symbol: string, deps: ToolDeps) {
  const holder: { value: ThesisEmit | null } = { value: null };
  const writeThesis = betaZodTool({
    name: "write_thesis",
    description: "Submit the final thesis + proposed long-only structure. Call exactly once.",
    inputSchema: z.object({
      direction: z.enum(["bullish", "neutral", "bearish"]),
      conviction: z.enum(["low", "medium", "high"]),
      summary: z.string().max(1200).describe("2-4 sentence executive summary of the thesis."),
      analysis: z
        .string()
        .max(9000)
        .describe(
          "The full deep-dive analysis in GitHub-flavored MARKDOWN. Use headings, tables, and inline ```chart blocks (see system prompt). Cover business/fundamentals, technicals (PlayBit EMA, trend, returns), valuation, the option structure if any, catalysts with dates, and key risks. Ground every number in a tool result.",
        ),
      bull_case: z.array(z.string()).max(6),
      bear_case: z.array(z.string()).max(6),
      catalysts: z.array(z.string()).max(6).default([]),
      invalidation: z.string(),
      proposed_structure: z.enum([
        "long_stock",
        "long_call",
        "long_put",
        "covered_call",
        "cash_secured_put",
      ]),
      entry_zone: z.number().optional(),
      fair_value: z.number().optional(),
    }),
    run: async (t) => {
      holder.value = t;
      await deps.admin
        .from("opportunities")
        .update({
          thesis: t.summary,
          direction: STRUCT_TO_DIR[t.proposed_structure] ?? null,
          conviction: CONV[t.conviction] ?? 0.5,
          entry_target: t.entry_zone ?? null,
        })
        .eq("id", oppId);
      await deps.admin.from("opportunity_events").insert({
        opportunity_id: oppId,
        to_status: "under_investigation",
        event_type: "agent_action",
        actor: "research",
        payload: t,
      });
      return JSON.stringify({ saved: true });
    },
  });

  const { refused } = await runAgent(
    "research",
    AGENT_CONFIG.research,
    deps,
    RESEARCH_SYSTEM,
    [getBarsPlaybitTool(deps), getTickerDetailsTool(deps), getQuoteTool(deps), getOptionChainTool(deps), WEB_SEARCH, writeThesis],
    `Research ${symbol} (opportunity ${oppId}) in depth. Do a rigorous, technical + fundamental deep dive: pull technicals (get_bars_playbit), company reference (get_ticker_details), live quote, and — if proposing options — the option chain; corroborate the narrative and any numbers via web_search. Then call write_thesis once, with a thorough markdown "analysis" that embeds at least one price chart of ${symbol} plus any supporting charts (see the chart-block spec in your instructions).`,
  );
  return { thesis: holder.value, refused };
}

interface VerdictEmit {
  call: "endorse" | "endorse_with_changes" | "reject";
  confidence: number;
  red_flags: string[];
  required_changes: string[];
  recommended_pct_nav: number;
  max_loss_usd: number;
  data_freshness_ok: boolean;
}

async function runRedTeam(oppId: string, symbol: string, thesis: ThesisEmit, deps: ToolDeps) {
  const holder: { value: VerdictEmit | null } = { value: null };
  const emitVerdict = betaZodTool({
    name: "emit_verdict",
    description: "Submit your adversarial verdict. Call exactly once.",
    inputSchema: z.object({
      call: z.enum(["endorse", "endorse_with_changes", "reject"]),
      confidence: z.number().min(0).max(1),
      red_flags: z.array(z.string()).max(8).default([]),
      required_changes: z.array(z.string()).max(8).default([]),
      recommended_pct_nav: z.number().min(0).max(100),
      max_loss_usd: z.number().min(0),
      data_freshness_ok: z.boolean(),
    }),
    run: async (v) => {
      holder.value = v;
      await deps.admin.from("opportunity_events").insert({
        opportunity_id: oppId,
        to_status: "under_investigation",
        event_type: "agent_action",
        actor: "red_team",
        payload: v,
      });
      return JSON.stringify({ received: true });
    },
  });

  await runAgent(
    "red_team",
    AGENT_CONFIG.red_team,
    deps,
    RED_TEAM_SYSTEM,
    [getQuoteTool(deps), getOptionChainTool(deps), WEB_SEARCH, emitVerdict],
    `Adversarially review this thesis for ${symbol} and call emit_verdict once.\n\nThesis:\n${JSON.stringify(thesis)}`,
  );
  return { verdict: holder.value };
}

async function runPM(
  oppId: string,
  symbol: string,
  thesis: ThesisEmit,
  verdict: VerdictEmit,
  deps: ToolDeps,
) {
  const holder: { value: { structure: string; sizing: { pct_of_nav: number } } | null } = {
    value: null,
  };
  const emitProposal = betaZodTool({
    name: "emit_proposal",
    description:
      "Submit the final, gated, long-only trade proposal. Enforces guardrails; returns violations if non-compliant (fix and retry). Call once when the trade fits.",
    inputSchema: z.object({
      structure: z.enum([
        "long_stock",
        "long_call",
        "long_put",
        "covered_call",
        "cash_secured_put",
        "call_debit_spread",
      ]),
      legs: z.array(LegSchema).default([]),
      net_debit: z.number(),
      max_loss: z.number().min(0),
      max_gain: z.number().nullable(),
      sizing: z.object({
        shares_or_contracts: z.number().positive(),
        notional: z.number(),
        pct_of_nav: z.number().min(0),
        collateral_required: z.number().min(0),
      }),
      rationale: z.string().max(1200),
    }),
    run: async (p) => {
      const v = validateRecommendation({
        structure: p.structure,
        legs: p.legs,
        net_debit: p.net_debit,
        max_loss: p.max_loss,
        sizing: {
          shares_or_contracts: p.sizing.shares_or_contracts,
          collateral_required: p.sizing.collateral_required,
        },
      });
      if (!v.ok) return JSON.stringify({ ok: false, violations: v.violations });
      holder.value = { structure: p.structure, sizing: { pct_of_nav: p.sizing.pct_of_nav } };
      await deps.admin
        .from("opportunities")
        .update({
          status: "proposed",
          direction: STRUCT_TO_DIR[p.structure] ?? null,
          proposed_quantity: p.sizing.shares_or_contracts,
          proposed_notional: p.sizing.notional,
          max_risk: p.max_loss,
          position_size_pct: p.sizing.pct_of_nav,
          sizing_rationale: p.rationale,
        })
        .eq("id", oppId);
      await deps.admin.from("opportunity_events").insert({
        opportunity_id: oppId,
        to_status: "proposed",
        event_type: "agent_action",
        actor: "portfolio_manager",
        payload: p,
      });
      return JSON.stringify({ ok: true, status: "proposed" });
    },
  });

  await runAgent(
    "portfolio_manager",
    AGENT_CONFIG.portfolio_manager,
    deps,
    PM_SYSTEM,
    [
      readStrategyTool(deps),
      readPositionsTool(deps),
      valuePortfolioTool(deps),
      planAllocationTool(deps),
      sizePositionTool(deps),
      checkRiskTool(deps),
      emitProposal,
    ],
    `Decide whether to propose a trade for ${symbol}, sized to help FULLY INVEST the portfolio. Call plan_allocation to see how much capital remains to deploy toward the target invested %, then size this position (up to the per-position cap, scaled by conviction) to help fill the book — do not leave capital idle. Run check_risk, then call emit_proposal if it fits.\n\nThesis:\n${JSON.stringify(thesis)}\n\nVerdict:\n${JSON.stringify(verdict)}`,
  );
  return { proposal: holder.value, decision: holder.value ? "proposed" : "declined" };
}

export interface PipelineResult {
  processed: number;
  results: Array<{ symbol: string; outcome: string; detail?: unknown }>;
}

export async function runPipeline(
  portfolioId: string,
  opts: { maxCandidates?: number } = {},
): Promise<PipelineResult> {
  const admin = createAdminClient();
  await agentPreflight(admin, portfolioId);
  const deps: ToolDeps = { portfolioId, admin, market: massive() };

  const { data: cands } = await admin
    .from("opportunities")
    .select("id, title, instruments(symbol)")
    .eq("portfolio_id", portfolioId)
    .eq("status", "candidate")
    .order("created_at", { ascending: true })
    .limit(opts.maxCandidates ?? 1);

  const results: PipelineResult["results"] = [];
  for (const opp of (cands ?? []) as unknown as Array<{
    id: string;
    title: string;
    instruments: { symbol: string } | null;
  }>) {
    const symbol = opp.instruments?.symbol ?? opp.title;
    await admin.from("opportunities").update({ status: "under_investigation" }).eq("id", opp.id);

    const { thesis } = await runResearch(opp.id, symbol, deps);
    if (!thesis) {
      results.push({ symbol, outcome: "research_incomplete" });
      continue;
    }
    const { verdict } = await runRedTeam(opp.id, symbol, thesis, deps);
    if (!verdict) {
      results.push({ symbol, outcome: "redteam_incomplete" });
      continue;
    }
    if (verdict.call === "reject") {
      await admin
        .from("opportunities")
        .update({ status: "rejected", rejected_reason: verdict.red_flags[0] ?? "red-team rejected" })
        .eq("id", opp.id);
      results.push({ symbol, outcome: "rejected", detail: verdict.red_flags });
      continue;
    }
    const { decision, proposal } = await runPM(opp.id, symbol, thesis, verdict, deps);
    results.push({ symbol, outcome: decision, detail: proposal });
  }

  return { processed: (cands ?? []).length, results };
}

/** Hedger: protect the long book with an index overlay + single-name protective puts. */
export async function runHedge(portfolioId: string): Promise<{ hedges: number }> {
  const admin = createAdminClient();
  await agentPreflight(admin, portfolioId);
  const deps: ToolDeps = { portfolioId, admin, market: massive() };

  const countHedges = async () => {
    const { count } = await admin
      .from("opportunities")
      .select("id", { count: "exact", head: true })
      .eq("portfolio_id", portfolioId)
      .eq("source", "hedge")
      .eq("status", "proposed");
    return count ?? 0;
  };
  const before = await countHedges();

  await runAgent(
    "hedger",
    AGENT_CONFIG.hedger,
    deps,
    HEDGER_SYSTEM,
    [
      valuePortfolioTool(deps),
      readPositionsTool(deps),
      portfolioDeltaTool(deps),
      getBarsPlaybitTool(deps),
      getQuoteTool(deps),
      getOptionChainTool(deps),
      emitHedgeTool(deps),
    ],
    "Hedge the book now. Call portfolio_delta to see net long exposure and how much hedge is needed, read positions, pull the index (SPY/QQQ) and single-name option chains you need, then call emit_hedge once with a broad-index overlay plus protective puts on the largest longs.",
  );
  const after = await countHedges();
  return { hedges: after - before };
}

/** Strategist: read macro + regime, then autonomously refresh the strategy doc (version bump). */
export async function runStrategist(
  portfolioId: string,
): Promise<{ updated: boolean; summary: string }> {
  const admin = createAdminClient();
  await agentPreflight(admin, portfolioId);
  const deps: ToolDeps = { portfolioId, admin, market: massive() };
  let updated = false;
  let summary = "";

  const proposeUpdate = betaZodTool({
    name: "propose_strategy_update",
    description:
      "Persist the updated strategy (posture, themes, watchlist, active sleeves). Call exactly once.",
    inputSchema: z.object({
      risk_posture: z.enum(["risk_on", "risk_off", "neutral"]),
      regime_note: z.string().max(600),
      themes: z
        .array(
          z.object({
            id: z.string(),
            label: z.string(),
            rationale: z.string(),
            conviction: z.number().min(0).max(1),
            example_tickers: z.array(z.string()).default([]),
          }),
        )
        .max(6),
      watchlist_tickers: z.array(z.string()).max(30),
      active_strategies: z.array(z.string()).max(10),
      target_invested_pct: z
        .number()
        .min(0)
        .max(100)
        .default(90)
        .describe("Target % of NAV to keep invested (deploy toward full investment; leave a small cash buffer)."),
      max_position_pct: z.number().min(1).max(30).default(12).describe("Per-position cap as % of NAV."),
      max_heat_pct: z.number().min(10).max(100).default(95).describe("Max total invested as % of NAV."),
      change_reason: z.string().max(300),
    }),
    run: async (p) => {
      const { data: cur } = await admin
        .from("strategies")
        .select("doc")
        .eq("portfolio_id", portfolioId)
        .eq("is_current", true)
        .maybeSingle();
      const curDoc = ((cur as { doc?: Record<string, unknown> } | null)?.doc ?? {}) as Record<
        string,
        unknown
      >;
      const curRisk = (curDoc.risk ?? {}) as Record<string, number>;
      const newDoc = {
        ...curDoc,
        risk_posture: p.risk_posture,
        regime_note: p.regime_note,
        themes: p.themes,
        watchlist_themes: p.themes.map((t) => t.id),
        watchlist_tickers: p.watchlist_tickers,
        active_strategies: p.active_strategies,
        target_invested_pct: p.target_invested_pct,
        risk: {
          ...curRisk,
          max_position_pct: p.max_position_pct,
          max_heat_pct: p.max_heat_pct,
        },
      };
      summary = `${p.risk_posture} — ${p.regime_note.slice(0, 160)}`;
      const { error } = await admin.rpc("set_current_strategy", {
        p_portfolio: portfolioId,
        p_doc: newDoc,
        p_summary: summary,
        p_change_reason: p.change_reason,
        p_changed_by: "strategist",
      });
      if (error) return JSON.stringify({ ok: false, error: error.message });
      updated = true;
      return JSON.stringify({ ok: true });
    },
  });

  await runAgent(
    "strategist",
    AGENT_CONFIG.strategist,
    deps,
    STRATEGIST_SYSTEM,
    [fredSeriesTool(), getBarsPlaybitTool(deps), WEB_SEARCH, readStrategyTool(deps), proposeUpdate],
    "Refresh the strategy now. Read macro (DGS10, T10Y2Y, CPIAUCSL, VIXCLS, UNRATE, FEDFUNDS), read SPY and sector ETFs (XLK, XLF, XLE) regime via get_bars_playbit, read the current strategy, then call propose_strategy_update once.",
  );
  return { updated, summary };
}
