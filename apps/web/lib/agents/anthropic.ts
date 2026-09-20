import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";

export const client = new Anthropic();

export const MODELS = {
  opus: "claude-opus-5",
  sonnet: "claude-sonnet-5",
  haiku: "claude-haiku-4-5",
} as const;

const PRICE: Record<string, { in: number; out: number }> = {
  "claude-opus-5": { in: 5e-6, out: 25e-6 },
  "claude-sonnet-5": { in: 2e-6, out: 10e-6 },
  "claude-haiku-4-5": { in: 1e-6, out: 5e-6 },
};

export function priceUsd(model: string, inTok: number, outTok: number): number {
  const p = PRICE[model] ?? PRICE["claude-sonnet-5"]!;
  return Number((inTok * p.in + outTok * p.out).toFixed(6));
}

/** Throw if the global kill switch is on (halts all autonomous agent spend). */
export async function assertNotKilled(admin: SupabaseClient): Promise<void> {
  const { data } = await admin
    .from("app_settings")
    .select("value")
    .eq("key", "kill_switch")
    .maybeSingle();
  const v = (data as { value: unknown } | null)?.value;
  if (v === true || v === "true") throw new Error("kill switch is active");
}

export async function logAgentRun(
  admin: SupabaseClient,
  r: {
    portfolioId: string;
    role: string;
    model: string;
    inputTokens: number;
    outputTokens: number;
    status: string;
    threadId?: string;
  },
): Promise<void> {
  await admin
    .from("agent_runs")
    .insert({
      portfolio_id: r.portfolioId,
      thread_id: r.threadId ?? null,
      agent_role: r.role,
      model: r.model,
      status: r.status,
      input_tokens: r.inputTokens,
      output_tokens: r.outputTokens,
      cost_usd: priceUsd(r.model, r.inputTokens, r.outputTokens),
      usage: { input_tokens: r.inputTokens, output_tokens: r.outputTokens },
      started_at: new Date().toISOString(),
      finished_at: new Date().toISOString(),
    })
    .then(
      () => {},
      () => {},
    );
}

/** Minimal shape of a non-streaming tool runner that we iterate + drain. */
export interface DrainableRunner extends AsyncIterable<Anthropic.Beta.BetaMessage> {
  done(): Anthropic.Beta.BetaMessage;
  pushMessages(message: Anthropic.Beta.BetaMessageParam): void;
}

/** Drive a tool runner to completion, accumulating token usage; handle pause/refusal. */
export async function drainRunner(
  runner: DrainableRunner,
): Promise<{ final: Anthropic.Beta.BetaMessage; inputTokens: number; outputTokens: number; refused: boolean }> {
  let inputTokens = 0;
  let outputTokens = 0;
  let refused = false;
  for await (const message of runner) {
    inputTokens += message.usage?.input_tokens ?? 0;
    outputTokens += message.usage?.output_tokens ?? 0;
    if (message.stop_reason === "refusal") {
      refused = true;
      break;
    }
    if (message.stop_reason === "pause_turn") {
      runner.pushMessages({ role: "assistant", content: message.content });
    }
  }
  return { final: runner.done(), inputTokens, outputTokens, refused };
}

/** Drain a runner and record the run's token cost. Returns terminal status. */
export async function drainAndLog(
  runner: unknown,
  meta: { role: string; portfolioId: string; admin: SupabaseClient; model: string; threadId?: string },
): Promise<{ status: "succeeded" | "failed"; refused: boolean }> {
  const { inputTokens, outputTokens, refused } = await drainRunner(runner as DrainableRunner);
  const status = refused ? "failed" : "succeeded";
  await logAgentRun(meta.admin, {
    portfolioId: meta.portfolioId,
    role: meta.role,
    model: meta.model,
    inputTokens,
    outputTokens,
    status,
    threadId: meta.threadId,
  });
  return { status, refused };
}
