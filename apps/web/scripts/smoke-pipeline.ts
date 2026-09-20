// Live pipeline run (Research -> Red-Team -> PM) on one candidate. Use AGENT_TIER=test for a
// cheap/fast run:
//   AGENT_TIER=test ANTHROPIC_API_KEY=... MASSIVE_API_KEY=... NEXT_PUBLIC_SUPABASE_URL=... \
//   SUPABASE_SERVICE_ROLE_KEY=... pnpm --filter web exec tsx scripts/smoke-pipeline.ts
import { createAdminClient } from "../lib/supabase/admin";
import { runPipeline } from "../lib/agents/pipeline";

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

  console.log(`running pipeline (tier=${process.env.AGENT_TIER ?? "prod"}) for`, portfolioId);
  const res = await runPipeline(portfolioId, { maxCandidates: 1 });
  console.log("PIPELINE RESULT:", JSON.stringify(res, null, 2));

  const { data: proposed } = await admin
    .from("opportunities")
    .select("title, status, direction, position_size_pct, sizing_rationale")
    .eq("portfolio_id", portfolioId)
    .in("status", ["proposed", "under_investigation", "rejected"])
    .order("updated_at", { ascending: false })
    .limit(5);
  console.log("pipeline opportunities:", JSON.stringify(proposed, null, 2));
  console.log("SMOKE OK");
}

main().catch((e) => {
  console.error("SMOKE FAILED:", e);
  process.exit(1);
});
