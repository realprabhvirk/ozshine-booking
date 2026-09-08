import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// For use in Server Components, Server Actions, and Route Handlers. Reads
// and (where possible) writes the auth cookie so the session stays in sync.
//
// Not typed with a generated `Database` generic (see types.ts) — queries
// come back untyped and get cast to our own interfaces at the call site.
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Called from a Server Component that can't set cookies (no
            // response to attach them to) — middleware.ts refreshes the
            // session on every request, so this is safe to ignore.
          }
        },
      },
    }
  );
}
