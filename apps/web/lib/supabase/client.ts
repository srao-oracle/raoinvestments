import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@raoinvestments/shared";

/** Supabase client for Client Components (browser). Uses the publishable/anon key + RLS. */
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
