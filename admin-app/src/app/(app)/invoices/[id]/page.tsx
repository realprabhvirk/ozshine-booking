import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { BookingWithInvoiceDetails } from "@/lib/supabase/types";
import { InvoiceView } from "./invoice-view";

export const dynamic = "force-dynamic";

const INVOICE_SELECT =
  "*, customer:customers(id,name,phone,email), vehicle:vehicles(id,rego,make_model), service:services(id,name,price_from), processed_by:staff(id,name), location:locations(id,name,address,phone)";

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

  return <InvoiceView booking={booking as BookingWithInvoiceDetails} />;
}
