import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { BookingWithInvoiceDetails } from "@/lib/supabase/types";
import { InvoiceView } from "./invoice-view";
import { LegacyFrame } from "@/components/legacy-frame";

export const dynamic = "force-dynamic";

const INVOICE_SELECT =
  "*, customer:customers(id,name,phone,email), vehicle:vehicles(id,rego,make_model), service:services(id,name,price_from), processed_by:staff!processed_by_staff_id(id,name), location:locations(id,name,address,phone)";

export default async function InvoicePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: booking } = await supabase
    .from("bookings")
    .select(INVOICE_SELECT)
    .eq("id", id)
    .maybeSingle();

  if (!booking) {
    notFound();
  }

  return (
    <LegacyFrame>
      <InvoiceView booking={booking as BookingWithInvoiceDetails} />
    </LegacyFrame>
  );
}
