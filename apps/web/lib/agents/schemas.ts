import { z } from "zod";

// ── shared vocabulary ─────────────────────────────────────────────────────────
export const Regime = z.enum(["risk_on", "risk_off", "neutral", "transition"]);
export const Conviction = z.enum(["low", "medium", "high"]);
export const Sentiment = z.enum(["bullish", "neutral", "bearish"]);
export const OptionRight = z.enum(["call", "put"]);
export const LegAction = z.enum(["buy_to_open", "sell_to_open", "sell_to_close", "buy_to_close"]);
export const VerdictCall = z.enum(["endorse", "endorse_with_changes", "reject"]);
export const Structure = z.enum([
  "long_stock",
  "long_call",
  "long_put",
  "covered_call",
  "cash_secured_put",
  "call_debit_spread",
]);
export const AgentRole = z.enum([
  "strategist",
  "scout",
  "research",
  "red_team",
  "portfolio_manager",
]);

/** Every quantitative datum carries where it came from and when it was valid. */
export const Provenance = z.object({
  source: z.string(),
  as_of: z.string(),
});

/** Stamped on every handoff for optimistic concurrency against the strategy doc. */
export const HandoffMeta = z.object({
  strategy_version: z.string(),
  produced_by: AgentRole,
  produced_at: z.string(),
});

// ── option leg (single source of truth) ───────────────────────────────────────
export const OptionLeg = z.object({
  right: OptionRight,
  action: LegAction,
  strike: z.number().positive(),
  expiry: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dte: z.number().int().nonnegative(),
  delta: z.number().min(-1).max(1),
  mid: z.number().nonnegative(),
  iv: z.number().nonnegative(),
  iv_rank: z.number().min(0).max(100),
  oi: z.number().int().nonnegative(),
  as_of: z.string(),
});
export type OptionLeg = z.infer<typeof OptionLeg>;

// ── 1) Strategist → Scout / strategy doc ──────────────────────────────────────
export const Theme = z.object({
  id: z.string(),
  label: z.string(),
  rationale: z.string(),
  conviction: z.number().min(0).max(1),
  example_tickers: z.array(z.string()).default([]),
});
export const Screen = z.object({
  theme_id: z.string(),
  sectors: z.array(z.string()).default([]),
  min_dollar_volume: z.number().default(20_000_000),
  trend: z.enum(["above_200dma", "any"]).default("above_200dma"),
  optionable: z.boolean().default(true),
});
export const MacroBrief = HandoffMeta.extend({
  kind: z.literal("macro_brief"),
  regime: Regime,
  risk_posture: z.enum(["risk_on", "risk_off", "neutral"]),
  regime_rationale: z.string(),
  themes: z.array(Theme).max(8),
  screens: z.array(Screen).max(8),
  recommended_strategies: z.array(z.string()).default([]),
  provenance: z.array(Provenance).default([]),
});
export type MacroBrief = z.infer<typeof MacroBrief>;

// ── 2) Scout → Research ────────────────────────────────────────────────────────
export const Candidate = z.object({
  symbol: z.string(),
  theme_id: z.string().optional(),
  score: z.number().min(0).max(100),
  playbit_regime: z.enum(["green", "red", "neutral"]).optional(),
  why: z.string(),
  suggested_structures: z.array(Structure).default([]),
  provenance: z.array(Provenance).default([]),
});
export const CandidateSet = HandoffMeta.extend({
  kind: z.literal("candidate_set"),
  candidates: z.array(Candidate).max(50),
});
export type Candidate = z.infer<typeof Candidate>;

// ── 3) Research → Red-Team ─────────────────────────────────────────────────────
export const Thesis = HandoffMeta.extend({
  kind: z.literal("thesis"),
  symbol: z.string(),
  direction: Sentiment,
  conviction: Conviction,
  summary: z.string(),
  bull_case: z.array(z.string()),
  bear_case: z.array(z.string()),
  catalysts: z.array(z.string()).default([]),
  fair_value: z.number().optional(),
  entry_zone: z.number().optional(),
  invalidation: z.string(),
  proposed_structure: Structure,
  proposed_legs: z.array(OptionLeg).default([]),
  provenance: z.array(Provenance).default([]),
});
export type Thesis = z.infer<typeof Thesis>;

// ── 4) Red-Team → PM ───────────────────────────────────────────────────────────
export const Verdict = HandoffMeta.extend({
  kind: z.literal("verdict"),
  symbol: z.string(),
  call: VerdictCall,
  confidence: z.number().min(0).max(1),
  red_flags: z.array(z.string()).default([]),
  required_changes: z.array(z.string()).default([]),
  recommended_pct_nav: z.number().min(0).max(100),
  max_loss_usd: z.number().nonnegative(),
  data_freshness_ok: z.boolean(),
  provenance: z.array(Provenance).default([]),
});
export type Verdict = z.infer<typeof Verdict>;

// ── 5) PM → human (gated) ──────────────────────────────────────────────────────
export const TradeProposal = HandoffMeta.extend({
  kind: z.literal("trade_proposal"),
  symbol: z.string(),
  structure: Structure,
  legs: z.array(OptionLeg).default([]),
  net_debit: z.number(),
  max_loss: z.number().nonnegative(),
  max_gain: z.number().nullable(),
  sizing: z.object({
    shares_or_contracts: z.number().positive(),
    notional: z.number(),
    pct_of_nav: z.number().min(0),
    collateral_required: z.number().nonnegative(),
  }),
  rationale: z.string(),
});
export type TradeProposal = z.infer<typeof TradeProposal>;
