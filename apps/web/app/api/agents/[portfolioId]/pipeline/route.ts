import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Enqueue only — returns immediately. The deep Opus pipeline runs for ~15-20 min,
// which exceeds any Vercel function limit, so the always-on Fly worker executes it.
export const maxDuration = 30;

export async function POST(
  req: Request,
  { params }: { params: Promise<{ portfolioId: string }> },
) {
  const { portfolioId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { data: pf } = await supabase
    .from("portfolios")
    .select("id")
    .eq("id", portfolioId)
    .maybeSingle();
  if (!pf) return NextResponse.json({ error: "not found" }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as { maxCandidates?: number };
  const maxCandidates = Math.min(Math.max(body.maxCandidates ?? 1, 1), 5);
  const admin = createAdminClient();

  // Avoid piling up duplicate work: if one is already pending, return it.
  const { data: existing } = await admin
    .from("agent_jobs")
    .select("id")
    .eq("portfolio_id", portfolioId)
    .eq("kind", "pipeline")
    .in("status", ["queued", "running"])
    .maybeSingle();
  if (existing) {
    return NextResponse.json({ queued: true, alreadyRunning: true, jobId: existing.id });
  }

  const { data: job, error } = await admin
    .from("agent_jobs")
    .insert({
      portfolio_id: portfolioId,
      kind: "pipeline",
      params: { maxCandidates },
      requested_by: user.id,
    })
    .select("id")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ queued: true, jobId: job.id });
}
