import type { SupabaseClient } from "@supabase/supabase-js";
import { toAppError } from "@/lib/core/errors";

// Call a database function and either return its result or throw an AppError
// with a stable code + friendly message (see lib/core/errors.ts).
export async function callRpc<T>(
  supabase: SupabaseClient,
  fn: string,
  args?: Record<string, unknown>,
): Promise<T> {
  let result;
  try {
    result = await supabase.rpc(fn, args);
  } catch (e) {
    throw toAppError(e);
  }
  if (result.error) throw toAppError(result.error);
  return result.data as T;
}
