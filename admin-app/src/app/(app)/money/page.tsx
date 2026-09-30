import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { addDaysISO, todayISO } from "@/lib/core/time";
import { isoDateSchema } from "@/lib/core/schemas";
import { errorMessage } from "@/lib/core/errors";
import { fetchInvoices } from "@/lib/shop/money";
import { Notice } from "@/components/ui/feedback";
import { InvoicesClient } from "./invoices-client";

export const metadata: Metadata = { title: "Invoices — OzShine Staff" };

export default async function InvoicesPage({ searchParams }: PageProps<"/money">) {
  const sp = await searchParams;
  const to = typeof sp.to === "string" && isoDateSchema.safeParse(sp.to).success ? sp.to : todayISO();
  const from = typeof sp.from === "string" && isoDateSchema.safeParse(sp.from).success ? sp.from : addDaysISO(to, -30);
  const supabase = await createClient();
  let rows;
  try {
    rows = await fetchInvoices(supabase, from, to);
  } catch (e) {
    return <Notice tone="bad" title="Couldn't load invoices">{errorMessage(e)}</Notice>;
  }
  return <InvoicesClient key={`${from}-${to}`} from={from} to={to} initial={rows} />;
}
