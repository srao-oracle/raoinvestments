"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type OppState = { error?: string; ok?: string } | null;

export async function rejectOpportunity(_prev: OppState, fd: FormData): Promise<OppState> {
  const portfolioId = String(fd.get("portfolioId") ?? "");
  const oppId = String(fd.get("oppId") ?? "");
  const reason = String(fd.get("reason") ?? "").slice(0, 300) || "Rejected by user";
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };
  const { error } = await supabase
    .from("opportunities")
    .update({ status: "rejected", rejected_reason: reason })
    .eq("id", oppId)
    .eq("portfolio_id", portfolioId);
  if (error) return { error: error.message };
  revalidatePath(`/p/${portfolioId}/opportunities`);
  revalidatePath(`/p/${portfolioId}/opportunities/${oppId}`);
  return { ok: "Rejected." };
}
