import type { SupabaseClient } from "@supabase/supabase-js";

export const DAILY_BUDGET_USD = Number(process.env.DAILY_BUDGET_USD ?? 10);

/** Gate before any spend: kill switch + per-portfolio daily agent budget. */
export async function agentPreflight(admin: SupabaseClient, portfolioId: string): Promise<void> {
  const { data: ks } = await admin
    .from("app_settings")
    .select("value")
    .eq("key", "kill_switch")
    .maybeSingle();
  const v = (ks as { value: unknown } | null)?.value;
  if (v === true || v === "true") throw new Error("kill switch is active");

  const today = new Date().toISOString().slice(0, 10);
  const { data: runs } = await admin
    .from("agent_runs")
    .select("cost_usd")
    .eq("portfolio_id", portfolioId)
    .eq("day_key", today);
  const spent = ((runs ?? []) as { cost_usd: number }[]).reduce((s, r) => s + Number(r.cost_usd), 0);
  if (spent >= DAILY_BUDGET_USD) {
    throw new Error(`daily agent budget reached ($${spent.toFixed(2)} / $${DAILY_BUDGET_USD})`);
  }
}

export async function spentToday(admin: SupabaseClient, portfolioId?: string): Promise<number> {
  const today = new Date().toISOString().slice(0, 10);
  let q = admin.from("agent_runs").select("cost_usd").eq("day_key", today);
  if (portfolioId) q = q.eq("portfolio_id", portfolioId);
  const { data } = await q;
  return ((data ?? []) as { cost_usd: number }[]).reduce((s, r) => s + Number(r.cost_usd), 0);
}
