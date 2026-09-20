import { createClient } from "@supabase/supabase-js";
import { config } from "./config";

// Service-role client (server-only). Bypasses RLS — this process is trusted infra.
export const supabase = createClient(config.supabaseUrl, config.supabaseServiceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
