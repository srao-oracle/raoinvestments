import { supabase } from "./supabase";
import { config } from "./config";

/** Stock/ETF symbols to stream: default watchlist ∪ active instruments. */
export async function deriveStockSymbols(): Promise<string[]> {
  const set = new Set<string>(config.defaultWatch);
  const { data } = await supabase
    .from("instruments")
    .select("symbol")
    .in("asset_class", ["stock", "etf"])
    .eq("active", true)
    .limit(500);
  for (const row of data ?? []) set.add((row as { symbol: string }).symbol);
  return [...set];
}

/** OCC symbols for option contracts held in open positions (never stream the full chain). */
export async function deriveOptionOccSymbols(): Promise<string[]> {
  const { data: pos } = await supabase
    .from("positions")
    .select("contract_id")
    .eq("status", "open")
    .not("contract_id", "is", null);
  const ids = (pos ?? [])
    .map((r) => (r as { contract_id: string | null }).contract_id)
    .filter((v): v is string => Boolean(v));
  if (ids.length === 0) return [];
  const { data: oc } = await supabase
    .from("option_contracts")
    .select("occ_symbol")
    .in("instrument_id", ids);
  return (oc ?? []).map((r) => (r as { occ_symbol: string }).occ_symbol);
}
