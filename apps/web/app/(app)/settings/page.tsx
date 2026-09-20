import { createAdminClient } from "@/lib/supabase/admin";
import { spentToday, DAILY_BUDGET_USD } from "@/lib/agents/budget";
import { usd } from "@/lib/format";
import { setKillSwitch } from "./actions";

export default async function SettingsPage() {
  // Auth is enforced by the (app) layout.
  const admin = createAdminClient();
  const { data: ks } = await admin
    .from("app_settings")
    .select("value")
    .eq("key", "kill_switch")
    .maybeSingle();
  const killOn = (ks as { value: unknown } | null)?.value === true;
  const spent = await spentToday(admin);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-8">
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>

      <section className="rounded-lg border border-[var(--color-border)] p-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold">Agent kill switch</h2>
            <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
              {killOn
                ? "Agents are HALTED — scouting, research, and proposals will not run."
                : "Agents are active."}
            </p>
          </div>
          <form action={setKillSwitch}>
            <input type="hidden" name="on" value={(!killOn).toString()} />
            <button
              type="submit"
              className={
                "h-10 rounded-md px-4 text-sm font-medium " +
                (killOn
                  ? "bg-emerald-600 text-white"
                  : "bg-red-600 text-white")
              }
            >
              {killOn ? "Resume agents" : "Halt agents"}
            </button>
          </form>
        </div>
      </section>

      <section className="rounded-lg border border-[var(--color-border)] p-4">
        <h2 className="text-sm font-semibold">Agent spend (today)</h2>
        <p className="mt-1 text-2xl font-semibold tabular-nums">{usd(spent)}</p>
        <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">
          Per-portfolio daily cap: {usd(DAILY_BUDGET_USD)}. Runs are blocked once a portfolio hits
          its cap.
        </p>
      </section>

      <p className="text-xs text-[var(--color-muted-foreground)]">
        Autonomous scans (scout, strategy review, EOD valuation, market refresh) run on schedule
        via Vercel Cron once deployed.
      </p>
    </div>
  );
}
