import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { massive } from "@/lib/market/client";
import { getAggregates } from "@/lib/market/rest/bars";
import { computePlaybit } from "@/lib/market/compute/playbit-ema";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ symbol: string }> },
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { symbol } = await params;
  const sym = symbol.toUpperCase().slice(0, 12);
  const to = new Date().toISOString().slice(0, 10);
  const from = new Date(Date.now() - 1000 * 60 * 60 * 24 * 365 * 3)
    .toISOString()
    .slice(0, 10);

  try {
    const bars = await getAggregates(massive(), {
      ticker: sym,
      timespan: "day",
      from,
      to,
    });
    const candles = bars.map((b) => ({
      time: Math.floor(b.t / 1000),
      open: b.o,
      high: b.h,
      low: b.l,
      close: b.c,
    }));
    const pb = computePlaybit(candles);
    return NextResponse.json(
      {
        symbol: sym,
        candles,
        playbit: pb.map((p) => ({
          time: p.time,
          emaTop: p.emaTop,
          emaBot: p.emaBot,
          regime: p.regime,
        })),
      },
      { headers: { "cache-control": "private, max-age=60" } },
    );
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "market data error" },
      { status: 502 },
    );
  }
}
