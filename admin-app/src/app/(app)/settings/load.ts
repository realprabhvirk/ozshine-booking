import { createClient } from "@/lib/supabase/server";
import type { ShopSettings } from "@/lib/shop/types";

// Settings pages always read fresh from the database (not the cached copy
// in the app layout).
export async function loadSettings(): Promise<ShopSettings | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("settings").select("*").limit(1).maybeSingle();
  return data as ShopSettings | null;
}
