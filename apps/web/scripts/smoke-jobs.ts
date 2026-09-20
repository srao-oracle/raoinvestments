import { createAdminClient } from "../lib/supabase/admin";
import {
  refreshMacro,
  refreshEodBars,
  snapshotIv,
  snapshotBreadth,
  snapshotNavAll,
} from "../lib/market/jobs";

async function main() {
  const admin = createAdminClient();
  console.log("macro:", await refreshMacro(admin));
  console.log("eod bars:", await refreshEodBars(admin));
  console.log("iv:", await snapshotIv(admin));
  console.log("breadth:", await snapshotBreadth(admin));
  console.log("nav:", await snapshotNavAll(admin));

  const { count: macroRows } = await admin
    .from("macro_series")
    .select("*", { count: "exact", head: true });
  const { count: ivRows } = await admin
    .from("iv_history")
    .select("*", { count: "exact", head: true });
  const { data: nav } = await admin
    .from("portfolio_snapshots")
    .select("nav, cash, as_of")
    .order("as_of", { ascending: false })
    .limit(2);
  console.log("macro_series rows:", macroRows, "| iv_history rows:", ivRows);
  console.log("latest NAV snapshots:", nav);
  console.log("SMOKE OK");
}

main().catch((e) => {
  console.error("SMOKE FAILED:", e);
  process.exit(1);
});
