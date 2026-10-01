"use client";

import { createBrowserClient } from "@supabase/ssr";
import { relayFetch } from "./relay";

// Used for the guest booking form (anon insert) and, later, optional
// account sign-up/sign-in. No generated `Database` generic — see types.ts.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { fetch: relayFetch(process.env.NEXT_PUBLIC_SUPABASE_URL!) } }
  );
}
