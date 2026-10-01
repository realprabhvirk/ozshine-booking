import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError, toAppError } from "@/lib/core/errors";

// Calls a public booking function through this site's /api/rpc route (see
// app/api/rpc/[fn]/route.ts). Lookups retry a couple of times on a network
// blip; anything that changes a booking is sent once, so a retry can never
// book twice.
export async function publicRpc<T>(supabase: SupabaseClient, fn: string, args: Record<string, unknown>, opts: { retry?: boolean } = {}): Promise<T> {
  let token: string | null = null;
  try {
    token = (await supabase.auth.getSession()).data.session?.access_token ?? null;
  } catch {}
  const attempts = opts.retry ? 3 : 1;
  let lastError: unknown = null;
  for (let i = 0; i < attempts; i++) {
    if (i > 0) await new Promise((r) => setTimeout(r, 600 * i));
    let res: Response;
    try {
      res = await fetch(`/api/rpc/${fn}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(args),
      });
    } catch (e) {
      lastError = e;
      continue;
    }
    if (res.status >= 500) {
      lastError = new AppError("NETWORK");
      continue;
    }
    const json = (await res.json().catch(() => null)) as { data?: T; error?: { message?: string; details?: string; code?: string } } | null;
    if (!json) throw new AppError("UNKNOWN");
    if (json.error) throw toAppError(json.error);
    return json.data as T;
  }
  throw toAppError(lastError);
}
