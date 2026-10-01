"use client";

import { createBrowserClient } from "@supabase/ssr";
import { relayFetch } from "./relay";

// One browser client per module load — safe to import anywhere in Client
// Components. Auth session lives in cookies so it's shared with the server
// client below.
//
// Not typed with a generated `Database` generic (see types.ts) — queries
// come back untyped and get cast to our own interfaces at the call site.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { fetch: relayFetch(process.env.NEXT_PUBLIC_SUPABASE_URL!) } }
  );
}
