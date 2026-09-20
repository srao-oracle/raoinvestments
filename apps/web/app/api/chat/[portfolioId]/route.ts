import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { runPortfolioChat } from "@/lib/agents/chat";

export const maxDuration = 60;

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

  const body = (await req.json().catch(() => ({}))) as { message?: string };
  const message = (body.message ?? "").trim().slice(0, 4000);
  if (!message) return NextResponse.json({ error: "empty message" }, { status: 400 });

  try {
    const result = await runPortfolioChat(portfolioId, message);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "chat failed" },
      { status: 500 },
    );
  }
}
