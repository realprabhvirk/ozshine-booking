import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { AdminOnly } from "../admin-only";
import { loadSettings } from "../load";
import { RewardsEditor, type LoyaltyRule, type Promo, type Voucher } from "./rewards-editor";

export const metadata: Metadata = { title: "Promos & loyalty — OzShine Staff" };

export default async function RewardsPage() {
  const supabase = await createClient();
  const [promos, rules, vouchers, settings] = await Promise.all([
    supabase.from("promo_codes").select("*").order("created_at", { ascending: false }),
    supabase.from("loyalty_rules").select("*").order("kind").order("created_at"),
    supabase.from("vouchers").select("*, customer:customers!issued_to_customer_id(id, name)").order("created_at", { ascending: false }).limit(200),
    loadSettings(),
  ]);
  const data = { promos: (promos.data ?? []) as Promo[], rules: (rules.data ?? []) as LoyaltyRule[], vouchers: (vouchers.data ?? []) as unknown as Voucher[] };
  return (
    <AdminOnly>
      <RewardsEditor key={JSON.stringify(data).length + String(settings?.loyalty_enabled) + JSON.stringify(settings?.loyalty_tiers)} {...data} settingsId={settings?.id ?? ""} loyaltyEnabled={settings?.loyalty_enabled ?? true} tiers={settings?.loyalty_tiers ?? []} />
    </AdminOnly>
  );
}
