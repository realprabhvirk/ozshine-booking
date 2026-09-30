// Back-office writes: one audited database function (admin_save) handles
// every settings area with a per-area whitelist of columns; admins only.
import type { SupabaseClient } from "@supabase/supabase-js";
import { callRpc } from "@/lib/rpc";
import { announceChange } from "./actions";

export type AdminEntity =
  | "settings"
  | "services"
  | "addons"
  | "bays"
  | "blackout_dates"
  | "promo_codes"
  | "loyalty_rules"
  | "vouchers"
  | "message_templates"
  | "testimonials";

export async function adminSave(supabase: SupabaseClient, entity: AdminEntity, id: string | null, values: Record<string, unknown>) {
  const r = await callRpc<string>(supabase, "admin_save", { p_entity: entity, p_id: id, p_values: values, p_actor: null });
  announceChange();
  return r;
}

export async function adminDelete(supabase: SupabaseClient, entity: AdminEntity, id: string) {
  await callRpc<void>(supabase, "admin_delete", { p_entity: entity, p_id: id, p_actor: null });
  announceChange();
}

export function regenerateDisplayKey(supabase: SupabaseClient) {
  return callRpc<string>(supabase, "regenerate_display_key", { p_actor: null });
}
