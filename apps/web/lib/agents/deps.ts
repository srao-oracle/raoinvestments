import type { SupabaseClient } from "@supabase/supabase-js";
import type { MassiveClient } from "../market/client";

/** Per-run dependencies injected into every tool's `run`. */
export interface ToolDeps {
  portfolioId: string;
  admin: SupabaseClient; // service-role; tools MUST self-filter by portfolioId
  market: MassiveClient;
}
