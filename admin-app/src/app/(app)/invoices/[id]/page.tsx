import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { BookingWithInvoiceDetails } from "@/lib/supabase/types";
import { uuidSchema } from "@/lib/core/schemas";
import { fetchInvoice } from "@/lib/shop/money";
import { LegacyFrame } from "@/components/legacy-frame";
import { InvoiceDetailClient } from "@/components/money/invoice-detail";
import { InvoiceView } from "./invoice-view";

export const metadata: Metadata = { title: "Invoice — OzShine Staff" };

const LEGACY_SELECT =
  "*, customer:customers(id,name,phone,email), vehicle:vehicles(id,rego,make_model), service:services(id,name,price_from), processed_by:staff!processed_by_staff_id(id,name), location:locations(id,name,address,phone)";

// /invoices/<invoice id> is the V2 invoice. Old links used the *booking* id:
// those go to the booking's current invoice, or (for jobs from before the
// upgrade that never got one) the original V1 invoice view.
export default async function InvoicePage({ params }: PageProps<"/invoices/[id]">) {
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) notFound();
  const supabase = await createClient();

  const invoice = await fetchInvoice(supabase, id);
  if (invoice) return <InvoiceDetailClient initial={invoice} />;

  const { data: live } = await supabase.from("invoices").select("id").eq("booking_id", id).neq("status", "void").maybeSingle();
  if (live) redirect(`/invoices/${live.id}`);

  const { data: booking } = await supabase.from("bookings").select(LEGACY_SELECT).eq("id", id).maybeSingle();
  if (!booking) notFound();
  return (
    <LegacyFrame>
      <InvoiceView booking={booking as BookingWithInvoiceDetails} />
    </LegacyFrame>
  );
}
