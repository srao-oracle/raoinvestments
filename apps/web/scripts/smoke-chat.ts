import { createAdminClient } from "../lib/supabase/admin";
import { runPortfolioChat } from "../lib/agents/chat";

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
  const res = await runPortfolioChat(
    (pf as { id: string }).id,
    "What's my cash balance and what are my top opportunities right now? One short paragraph.",
  );
  console.log("PM REPLY:\n", res.reply);
  console.log("SMOKE OK");
}

main().catch((e) => {
  console.error("SMOKE FAILED:", e);
  process.exit(1);
});
