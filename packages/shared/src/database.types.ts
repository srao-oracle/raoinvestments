// Placeholder DB types.
//
// The real bindings come from `supabase gen types typescript`, which requires Docker
// (postgres-meta container) or a Supabase access token (`gen types --linked`). Both are
// deferred in M1 — regenerate and replace this file once one is available:
//
//   supabase gen types typescript --linked > packages/shared/src/database.types.ts
//
// Using a permissive type keeps `SupabaseClient<Database>` well-formed in the meantime.

export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Database = any;
