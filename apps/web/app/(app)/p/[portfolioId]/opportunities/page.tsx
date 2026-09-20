import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { RunAgents } from "./run-agents";

type Opp = {
  id: string;
  title: string | null;
  status: string;
  direction: string | null;
  conviction: number | null;
  thesis: string | null;
  position_size_pct: number | null;
  instruments: { symbol: string } | null;
};

const STATUS_META: { key: string; label: string; hint: string; cls: string }[] = [
  { key: "proposed", label: "Proposed", hint: "awaiting your approval", cls: "text-[var(--color-primary)]" },
  { key: "under_investigation", label: "Investigating", hint: "agents at work", cls: "text-[var(--color-foreground)]" },
  { key: "candidate", label: "Candidates", hint: "scouted", cls: "text-[var(--color-muted-foreground)]" },
  { key: "invested", label: "Invested", hint: "", cls: "text-emerald-600 dark:text-emerald-400" },
  { key: "closed", label: "Closed", hint: "", cls: "text-[var(--color-muted-foreground)]" },
  { key: "rejected", label: "Rejected", hint: "", cls: "text-[var(--color-muted-foreground)]" },
];

export default async function OpportunitiesPage({
  params,
}: {
  params: Promise<{ portfolioId: string }>;
}) {
  const { portfolioId } = await params;
  const supabase = await createClient();
  const { data } = await supabase
    .from("opportunities")
    .select("id, title, status, direction, conviction, thesis, position_size_pct, instruments(symbol)")
    .eq("portfolio_id", portfolioId)
    .order("updated_at", { ascending: false });
  const opps = (data ?? []) as unknown as Opp[];

  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-lg font-semibold">Opportunities</h2>
      <RunAgents portfolioId={portfolioId} />

      {opps.length === 0 ? (
        <p className="text-sm text-[var(--color-muted-foreground)]">
          No opportunities yet. Use “Scout ideas” to find candidates, then “Analyze candidate” to
          run research → red-team → PM.
        </p>
      ) : null}

      {STATUS_META.map(({ key, label, hint, cls }) => {
        const items = opps.filter((o) => o.status === key);
        if (items.length === 0) return null;
        return (
          <section key={key} className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold">
              <span className={cls}>{label}</span>{" "}
              <span className="text-[var(--color-muted-foreground)]">
                {items.length}
                {hint ? ` · ${hint}` : ""}
              </span>
            </h3>
            <div className="grid gap-2 sm:grid-cols-2">
              {items.map((o) => (
                <Link
                  key={o.id}
                  href={`/p/${portfolioId}/opportunities/${o.id}`}
                  className="flex flex-col gap-1 rounded-lg border border-[var(--color-border)] p-3 hover:bg-[var(--color-muted)]"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{o.instruments?.symbol ?? o.title}</span>
                    <span className="text-xs text-[var(--color-muted-foreground)]">
                      {o.direction ? o.direction.replace(/_/g, " ") : ""}
                      {o.position_size_pct != null ? ` · ${o.position_size_pct}% NAV` : ""}
                    </span>
                  </div>
                  {o.thesis ? (
                    <p className="line-clamp-2 text-xs text-[var(--color-muted-foreground)]">
                      {o.thesis}
                    </p>
                  ) : null}
                </Link>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
