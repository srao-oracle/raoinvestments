import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { InstrumentChart } from "@/components/charts/instrument-chart";
import { usd, pct } from "@/lib/format";
import { RejectForm } from "./reject-form";

type OppEvent = { actor: string | null; event_type: string; payload: Record<string, unknown>; created_at: string };

function approveHref(
  portfolioId: string,
  oppId: string,
  symbol: string,
  direction: string | null,
  qty: number | null,
): string {
  const assetClass = direction === "long_stock" ? "stock" : "option";
  const action =
    direction === "covered_call" || direction === "csp" ? "sell_to_open" : "buy_to_open";
  const q = new URLSearchParams({
    oppId,
    symbol,
    assetClass,
    action,
    ...(qty ? { quantity: String(qty) } : {}),
  });
  return `/p/${portfolioId}/trades?${q.toString()}`;
}

export default async function OpportunityDetail({
  params,
}: {
  params: Promise<{ portfolioId: string; oppId: string }>;
}) {
  const { portfolioId, oppId } = await params;
  const supabase = await createClient();
  const { data: opp } = await supabase
    .from("opportunities")
    .select(
      "id, title, status, direction, conviction, thesis, entry_target, proposed_quantity, proposed_notional, max_risk, position_size_pct, sizing_rationale, rejected_reason, instruments(symbol)",
    )
    .eq("id", oppId)
    .eq("portfolio_id", portfolioId)
    .maybeSingle();
  if (!opp) notFound();

  const symbol =
    (opp.instruments as unknown as { symbol: string } | null)?.symbol ?? opp.title ?? "?";
  const { data: eventsData } = await supabase
    .from("opportunity_events")
    .select("actor, event_type, payload, created_at")
    .eq("opportunity_id", oppId)
    .order("created_at", { ascending: true });
  const events = (eventsData ?? []) as unknown as OppEvent[];
  const research = [...events].reverse().find((e) => e.actor === "research")?.payload;
  const verdict = [...events].reverse().find((e) => e.actor === "red_team")?.payload;
  const bull = (research?.bull_case as string[] | undefined) ?? [];
  const bear = (research?.bear_case as string[] | undefined) ?? [];
  const catalysts = (research?.catalysts as string[] | undefined) ?? [];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href={`/p/${portfolioId}/opportunities`}
          className="text-xs text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
        >
          ← Opportunities
        </Link>
        <div className="mt-1 flex items-center gap-3">
          <h2 className="text-2xl font-semibold">{symbol}</h2>
          <span className="rounded-full bg-[var(--color-muted)] px-2 py-0.5 text-xs capitalize">
            {opp.status.replace(/_/g, " ")}
          </span>
          {opp.direction ? (
            <span className="text-sm text-[var(--color-muted-foreground)]">
              {opp.direction.replace(/_/g, " ")}
              {opp.conviction != null ? ` · conviction ${Math.round(Number(opp.conviction) * 100)}%` : ""}
            </span>
          ) : null}
        </div>
      </div>

      {opp.status === "proposed" ? (
        <div className="rounded-lg border border-[var(--color-primary)] p-4">
          <h3 className="text-sm font-semibold">Proposed trade</h3>
          <div className="mt-2 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <div><div className="text-xs text-[var(--color-muted-foreground)]">Size</div>{opp.position_size_pct != null ? pct(Number(opp.position_size_pct)) : "—"} NAV</div>
            <div><div className="text-xs text-[var(--color-muted-foreground)]">Qty</div>{opp.proposed_quantity ?? "—"}</div>
            <div><div className="text-xs text-[var(--color-muted-foreground)]">Notional</div>{opp.proposed_notional != null ? usd(Number(opp.proposed_notional)) : "—"}</div>
            <div><div className="text-xs text-[var(--color-muted-foreground)]">Max risk</div>{opp.max_risk != null ? usd(Number(opp.max_risk)) : "—"}</div>
          </div>
          {opp.sizing_rationale ? (
            <p className="mt-3 text-sm text-[var(--color-muted-foreground)]">{opp.sizing_rationale}</p>
          ) : null}
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Link
              href={approveHref(portfolioId, oppId, symbol, opp.direction, opp.proposed_quantity as number | null)}
              className="inline-flex h-9 items-center rounded-md bg-[var(--color-primary)] px-4 text-sm font-medium text-[var(--color-primary-foreground)]"
            >
              Approve → record fill
            </Link>
            <RejectForm portfolioId={portfolioId} oppId={oppId} />
          </div>
        </div>
      ) : null}

      {opp.thesis ? (
        <section className="rounded-lg border border-[var(--color-border)] p-4">
          <h3 className="text-sm font-semibold">Thesis</h3>
          <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">{opp.thesis}</p>
          {catalysts.length ? (
            <p className="mt-2 text-xs text-[var(--color-muted-foreground)]">
              Catalysts: {catalysts.join(" · ")}
            </p>
          ) : null}
        </section>
      ) : null}

      {(bull.length > 0 || bear.length > 0) ? (
        <div className="grid gap-4 md:grid-cols-2">
          <section className="rounded-lg border border-[var(--color-border)] p-4">
            <h3 className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">Bull case</h3>
            <ul className="mt-2 list-disc pl-4 text-sm text-[var(--color-muted-foreground)]">
              {bull.map((b, i) => <li key={i}>{b}</li>)}
            </ul>
          </section>
          <section className="rounded-lg border border-[var(--color-border)] p-4">
            <h3 className="text-sm font-semibold text-red-600 dark:text-red-400">Bear case</h3>
            <ul className="mt-2 list-disc pl-4 text-sm text-[var(--color-muted-foreground)]">
              {bear.map((b, i) => <li key={i}>{b}</li>)}
            </ul>
          </section>
        </div>
      ) : null}

      {verdict ? (
        <section className="rounded-lg border border-[var(--color-border)] p-4">
          <h3 className="text-sm font-semibold">Red-team verdict</h3>
          <p className="mt-1 text-sm">
            <span className="capitalize">{String(verdict.call).replace(/_/g, " ")}</span>
            {verdict.confidence != null ? ` · confidence ${Math.round(Number(verdict.confidence) * 100)}%` : ""}
            {verdict.recommended_pct_nav != null ? ` · rec. ${verdict.recommended_pct_nav}% NAV` : ""}
          </p>
          {Array.isArray(verdict.red_flags) && verdict.red_flags.length ? (
            <ul className="mt-2 list-disc pl-4 text-sm text-[var(--color-muted-foreground)]">
              {(verdict.red_flags as string[]).map((f, i) => <li key={i}>{f}</li>)}
            </ul>
          ) : null}
        </section>
      ) : null}

      {opp.rejected_reason ? (
        <p className="text-sm text-red-500">Rejected: {opp.rejected_reason}</p>
      ) : null}

      <section>
        <h3 className="mb-2 text-sm font-semibold">Chart</h3>
        <InstrumentChart initialSymbol={symbol} />
      </section>
    </div>
  );
}
