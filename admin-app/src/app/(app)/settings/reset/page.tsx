import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { AdminOnly } from "../admin-only";
import { ResetClient } from "./reset-client";

export const metadata: Metadata = { title: "Clear all data — OzShine Staff" };

export default async function ResetPage() {
  const supabase = await createClient();
  const head = (t: string) => supabase.from(t).select("id", { count: "exact", head: true });
  const [customers, bookings, invoices] = await Promise.all([head("customers").eq("is_walkin_placeholder", false), head("bookings"), head("invoices")]);
  return (
    <AdminOnly>
      <ResetClient counts={{ customers: customers.count ?? 0, bookings: bookings.count ?? 0, invoices: invoices.count ?? 0 }} />
    </AdminOnly>
  );
}
