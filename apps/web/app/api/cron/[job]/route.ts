import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { runScout } from "@/lib/agents/scout";
import { runStrategist } from "@/lib/agents/pipeline";
import {
  refreshMacro,
  refreshEodBars,
  snapshotIv,
  snapshotBreadth,
  snapshotNavAll,
} from "@/lib/market/jobs";

export const maxDuration = 300;

async function forEachPortfolio(
  admin: SupabaseClient,
  fn: (portfolioId: string) => Promise<unknown>,
) {
  const { data } = await admin.from("portfolios").select("id").eq("status", "active");
  const ids = ((data ?? []) as { id: string }[]).map((p) => p.id);
  const results: Array<{ id: string; ok?: unknown; error?: string }> = [];
  for (const id of ids) {
    try {
      results.push({ id, ok: await fn(id) });
    } catch (e) {
      results.push({ id, error: e instanceof Error ? e.message : "error" });
    }
  }
  return { processed: ids.length, results };
}

export async function GET(req: Request, { params }: { params: Promise<{ job: string }> }) {
  const auth = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { job } = await params;
  const admin = createAdminClient();
  try {
    switch (job) {
      case "scout":
        return NextResponse.json(await forEachPortfolio(admin, runScout));
      case "strategy-review":
        return NextResponse.json(await forEachPortfolio(admin, runStrategist));
      case "eod-valuation":
        return NextResponse.json(await snapshotNavAll(admin));
      case "market-refresh": {
        const macro = await refreshMacro(admin);
        const bars = await refreshEodBars(admin);
        const iv = await snapshotIv(admin);
        const breadth = await snapshotBreadth(admin);
        return NextResponse.json({ macro, bars, iv, breadth });
      }
      default:
        return NextResponse.json({ error: `unknown job: ${job}` }, { status: 404 });
    }
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "cron failed" },
      { status: 500 },
    );
  }
}
