"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { occSymbol } from "@/lib/occ";

export type FillState = { error?: string; ok?: string } | null;

type TradeAction = "buy_to_open" | "sell_to_close" | "sell_to_open" | "buy_to_close";

async function upsertInstrument(
  admin: SupabaseClient,
  symbol: string,
  assetClass: "stock" | "option",
  underlyingId?: string,
): Promise<string> {
  const { data, error } = await admin
    .from("instruments")
    .upsert(
      { symbol, asset_class: assetClass, underlying_instrument_id: underlyingId ?? null },
      { onConflict: "symbol,currency" },
    )
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return (data as { id: string }).id;
}

export async function recordFill(_prev: FillState, fd: FormData): Promise<FillState> {
  const portfolioId = String(fd.get("portfolioId") ?? "");
  const assetClass = (String(fd.get("assetClass") ?? "stock") as "stock" | "option");
  const action = String(fd.get("action") ?? "") as TradeAction;
  const symbol = String(fd.get("symbol") ?? "").trim().toUpperCase();
  const quantity = Number(fd.get("quantity"));
  const price = Number(fd.get("price"));
  const fees = Number(fd.get("fees") ?? 0) || 0;
  const executedAt = String(fd.get("executedAt") ?? "") || new Date().toISOString();
  const oppId = String(fd.get("oppId") ?? "") || null;

  if (!symbol) return { error: "Symbol is required." };
  if (!(quantity > 0)) return { error: "Quantity must be positive." };
  if (!(price >= 0)) return { error: "Price is invalid." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };
  const { data: pf } = await supabase
    .from("portfolios")
    .select("id")
    .eq("id", portfolioId)
    .maybeSingle();
  if (!pf) return { error: "Portfolio not found." };

  const admin = createAdminClient();

  try {
    if (assetClass === "stock") {
      const instrumentId = await upsertInstrument(admin, symbol, "stock");
      const { error } = await admin.from("trades").insert({
        portfolio_id: portfolioId,
        asset_class: "stock",
        instrument_id: instrumentId,
        action,
        quantity,
        price,
        fees,
        multiplier: 1,
        executed_at: executedAt,
        created_by: user.id,
        opportunity_id: oppId,
      });
      if (error) return { error: error.message };
    } else {
      const optionType = String(fd.get("optionType") ?? "call") as "call" | "put";
      const strike = Number(fd.get("strike"));
      const expiry = String(fd.get("expiry") ?? "");
      if (!(strike > 0) || !expiry) return { error: "Strike and expiry are required for options." };
      const occ = occSymbol(symbol, expiry, optionType, strike);
      const underlyingId = await upsertInstrument(admin, symbol, "stock");
      const optionInstrumentId = await upsertInstrument(admin, occ, "option", underlyingId);
      const { error: ocErr } = await admin.from("option_contracts").upsert(
        {
          instrument_id: optionInstrumentId,
          underlying_instrument_id: underlyingId,
          occ_symbol: occ,
          option_type: optionType,
          strike,
          expiration_date: expiry,
          contract_multiplier: 100,
        },
        { onConflict: "instrument_id" },
      );
      if (ocErr) return { error: ocErr.message };
      const { error } = await admin.from("trades").insert({
        portfolio_id: portfolioId,
        asset_class: "option",
        instrument_id: optionInstrumentId,
        contract_id: optionInstrumentId,
        action,
        quantity,
        price,
        fees,
        multiplier: 100,
        executed_at: executedAt,
        created_by: user.id,
        opportunity_id: oppId,
      });
      if (error) return { error: error.message };
    }
    if (oppId) {
      // Link the fill to the opportunity and mark it invested (best-effort).
      await admin
        .from("opportunities")
        .update({ status: "invested" })
        .eq("id", oppId)
        .eq("portfolio_id", portfolioId);
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to record fill." };
  }

  revalidatePath(`/p/${portfolioId}/trades`);
  revalidatePath(`/p/${portfolioId}/positions`);
  revalidatePath(`/p/${portfolioId}/opportunities`);
  revalidatePath(`/p/${portfolioId}`);
  return { ok: `Recorded ${action.replace(/_/g, " ")} ${quantity} ${symbol}.` };
}
