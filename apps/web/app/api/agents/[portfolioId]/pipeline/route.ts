import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { runPipeline } from "@/lib/agents/pipeline";

// Deep Opus 5 research + red-team + PM can run several minutes; use the Pro ceiling.
export const maxDuration = 800;

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
  try {
    const result = await runPipeline(portfolioId, {
      maxCandidates: Math.min(Math.max(body.maxCandidates ?? 1, 1), 5),
    });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "pipeline failed" },
      { status: 500 },
    );
  }
}
