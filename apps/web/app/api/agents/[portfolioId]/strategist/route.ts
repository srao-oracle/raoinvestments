import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { runStrategist } from "@/lib/agents/pipeline";

export const maxDuration = 120;

export async function POST(
  _req: Request,
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

  try {
    const result = await runStrategist(portfolioId);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "strategist failed" },
      { status: 500 },
    );
  }
}
