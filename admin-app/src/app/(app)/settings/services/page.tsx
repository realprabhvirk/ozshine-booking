import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import type { ServiceRow } from "@/lib/shop/types";
import { AdminOnly } from "../admin-only";
import { ServicesEditor } from "./services-editor";

export const metadata: Metadata = { title: "Services & prices — OzShine Staff" };

export default async function ServicesPage() {
  const supabase = await createClient();
  const { data } = await supabase.from("services").select("*").order("sort_order").order("name");
  const services = (data ?? []) as ServiceRow[];
  return (
    <AdminOnly>
      <ServicesEditor key={services.map((s) => `${s.id}:${s.sort_order}:${s.active}:${s.price_from}`).join("|")} initial={services} />
    </AdminOnly>
  );
}
