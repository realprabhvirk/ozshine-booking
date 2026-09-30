import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { uuidSchema } from "@/lib/core/schemas";
import { fetchInvoice } from "@/lib/shop/money";
import type { ShopSettings } from "@/lib/shop/types";
import { A4Invoice, ReceiptSlip } from "@/components/money/printable";
import { PrintControls } from "./print-controls";

export const metadata: Metadata = { title: "Print invoice — OzShine", robots: { index: false } };

// Printable A4 tax invoice / 80mm receipt, outside the app layout so nothing
// but the document prints.
export default async function PrintInvoicePage({ params, searchParams }: PageProps<"/print/invoice/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  const format = sp.format === "receipt" ? "receipt" : "a4";
  const auto = sp.auto === "1";
  if (!uuidSchema.safeParse(id).success) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [invoice, settingsRes] = await Promise.all([fetchInvoice(supabase, id), supabase.from("settings").select("*").limit(1).maybeSingle()]);
  if (!invoice) notFound();
  const settings = settingsRes.data as ShopSettings | null;

  return (
    <div className="min-h-dvh bg-neutral-100 text-black print:bg-white">
      <style>{format === "a4" ? "@page { size: A4; margin: 14mm; }" : "@page { size: 80mm auto; margin: 3mm; }"}</style>
      <PrintControls invoiceId={invoice.id} format={format} auto={auto} />
      {format === "a4" ? <A4Invoice inv={invoice} s={settings} /> : <ReceiptSlip inv={invoice} s={settings} />}
    </div>
  );
}

