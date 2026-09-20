import { createClient } from "@supabase/supabase-js";
import type { Database } from "@raoinvestments/shared";

/**
 * Service-role client — bypasses RLS. SERVER-ONLY. Only use in Server Actions / route
 * handlers AFTER verifying the caller owns the resource. Never import from a Client Component.
 */
export function createAdminClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
