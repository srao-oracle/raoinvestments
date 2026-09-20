// Placeholder DB types. Replace with generated types once available:
//   supabase gen types typescript --linked > apps/web/lib/supabase/database.types.ts
// (Requires a Supabase access token or Docker.) A permissive type keeps
// SupabaseClient<Database> well-formed in the meantime.

export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Database = any;
