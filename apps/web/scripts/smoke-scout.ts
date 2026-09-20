// Live Scout run against Sid's Core portfolio. Persists candidates + candidate-stage
// opportunities. Run with the 4 env vars:
//   ANTHROPIC_API_KEY=... MASSIVE_API_KEY=... NEXT_PUBLIC_SUPABASE_URL=... \
//   SUPABASE_SERVICE_ROLE_KEY=... pnpm --filter web exec tsx scripts/smoke-scout.ts
import { createAdminClient } from "../lib/supabase/admin";
import { runScout } from "../lib/agents/scout";

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
  console.log("running scout for portfolio", portfolioId);
  const res = await runScout(portfolioId);
  console.log("SCOUT RESULT:", res);

  const { data: opps } = await admin
    .from("opportunities")
    .select("title, status, thesis")
    .eq("portfolio_id", portfolioId)
    .eq("status", "candidate")
    .limit(10);
  console.log("candidate opportunities:", opps);
  console.log("SMOKE OK");
}

main().catch((e) => {
  console.error("SMOKE FAILED:", e);
  process.exit(1);
});
