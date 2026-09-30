import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import type { AddonRow, BayRow } from "@/lib/shop/types";
import { AdminOnly } from "../admin-only";
import { ExtrasEditor } from "./extras-editor";

export const metadata: Metadata = { title: "Extras & bays — OzShine Staff" };

export default async function ExtrasPage() {
  const supabase = await createClient();
  const [addons, bays] = await Promise.all([
    supabase.from("addons").select("*").order("sort_order").order("name"),
    supabase.from("bays").select("*").order("sort_order").order("name"),
  ]);
  const a = (addons.data ?? []) as Array<AddonRow & { description: string | null }>;
  const b = (bays.data ?? []) as BayRow[];
  return (
    <AdminOnly>
      <ExtrasEditor key={JSON.stringify([a, b]).length + a.map((x) => x.id + x.active + x.price).join() + b.map((x) => x.id + x.active + x.name).join()} addons={a} bays={b} />
    </AdminOnly>
  );
}
