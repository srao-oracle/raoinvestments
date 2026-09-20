"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type FundState = { error?: string; ok?: string } | null;

async function authedClient() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");
  return supabase;
}

export async function deposit(_prev: FundState, fd: FormData): Promise<FundState> {
  const portfolioId = String(fd.get("portfolioId") ?? "");
  const amount = Number(fd.get("amount"));
  if (!Number.isFinite(amount) || amount <= 0) return { error: "Enter a positive amount." };
  const supabase = await authedClient();
  const { error } = await supabase.from("fund_transactions").insert({
    portfolio_id: portfolioId,
    txn_type: "deposit",
    status: "completed",
    amount,
    completed_at: new Date().toISOString(),
  });
  if (error) return { error: error.message };
  revalidatePath(`/p/${portfolioId}/funds`);
  revalidatePath(`/p/${portfolioId}`);
  return { ok: `Deposited ${amount.toLocaleString("en-US", { style: "currency", currency: "USD" })}.` };
}

export async function withdraw(_prev: FundState, fd: FormData): Promise<FundState> {
  const portfolioId = String(fd.get("portfolioId") ?? "");
  const amount = Number(fd.get("amount"));
  if (!Number.isFinite(amount) || amount <= 0) return { error: "Enter a positive amount." };
  const supabase = await authedClient();
  const { data: pf } = await supabase
    .from("portfolios")
    .select("cash_balance")
    .eq("id", portfolioId)
    .maybeSingle();
  if (!pf) return { error: "Portfolio not found." };
  if (amount > Number(pf.cash_balance)) return { error: "Amount exceeds available cash." };
  const { error } = await supabase.from("fund_transactions").insert({
    portfolio_id: portfolioId,
    txn_type: "withdrawal",
    status: "completed",
    amount: -amount,
    completed_at: new Date().toISOString(),
  });
  if (error) return { error: error.message };
  revalidatePath(`/p/${portfolioId}/funds`);
  revalidatePath(`/p/${portfolioId}`);
  return { ok: `Withdrew ${amount.toLocaleString("en-US", { style: "currency", currency: "USD" })}.` };
}

export async function requestLiquidation(_prev: FundState, fd: FormData): Promise<FundState> {
  const portfolioId = String(fd.get("portfolioId") ?? "");
  const notes = String(fd.get("notes") ?? "").slice(0, 500);
  const supabase = await authedClient();
  const { error } = await supabase.from("fund_transactions").insert({
    portfolio_id: portfolioId,
    txn_type: "liquidation_request",
    status: "pending",
    amount: 0,
    notes: notes || "Liquidation requested",
  });
  if (error) return { error: error.message };
  revalidatePath(`/p/${portfolioId}/funds`);
  return { ok: "Liquidation request submitted (pending)." };
}
