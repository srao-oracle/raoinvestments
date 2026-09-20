// Live Strategist run (macro -> strategy doc refresh). Test tier recommended:
//   AGENT_TIER=test ANTHROPIC_API_KEY=... MASSIVE_API_KEY=... FRED_API_KEY=... \
//   NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
//   pnpm --filter web exec tsx scripts/smoke-strategist.ts
import { createAdminClient } from "../lib/supabase/admin";
import { runStrategist } from "../lib/agents/pipeline";

async function main() {
  const admin = createAdminClient();
  const { data: prof } = await admin
    .from("profiles")
    .select("id")
    .eq("email", "siddhartha.s.rao@gmail.com")
    .single();
  const { data: pf } = await admin
    .from("portfolios")
    .select("id")
    .eq("owner_id", (prof as { id: string }).id)
    .eq("name", "Core")
    .single();
  const portfolioId = (pf as { id: string }).id;

  const res = await runStrategist(portfolioId);
  console.log("STRATEGIST:", res);

  const { data: strat } = await admin
    .from("strategies")
    .select("version, summary, is_current")
    .eq("portfolio_id", portfolioId)
    .eq("is_current", true)
    .single();
  console.log("current strategy:", strat);
  console.log("SMOKE OK");
}

main().catch((e) => {
  console.error("SMOKE FAILED:", e);
  process.exit(1);
});
