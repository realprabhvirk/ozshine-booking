import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// For Server Components fetching public data (services, locations) — no
// user session involved yet, so no cookie plumbing needed. Session-based
// server reads (the logged-in customer view) land in a later phase.
export function createClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
