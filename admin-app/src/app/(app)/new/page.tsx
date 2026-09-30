import type { Metadata } from "next";
import { isoDateSchema, timeSchema, uuidSchema } from "@/lib/core/schemas";
import { NewSaleClient } from "./new-sale-client";

export const metadata: Metadata = { title: "New sale — OzShine Staff" };

export default async function NewSalePage({ searchParams }: PageProps<"/new">) {
  const sp = await searchParams;
  const mode = sp.mode === "later" ? "later" : "now";
  const date = typeof sp.date === "string" && isoDateSchema.safeParse(sp.date).success ? sp.date : null;
  const time = typeof sp.time === "string" && timeSchema.safeParse(sp.time).success ? sp.time.slice(0, 5) : null;
  const phone = typeof sp.phone === "string" ? sp.phone.slice(0, 20) : "";
  const customer = typeof sp.customer === "string" && uuidSchema.safeParse(sp.customer).success ? sp.customer : null;
  return <NewSaleClient key={`${mode}-${date}-${time}-${phone}-${customer}`} initialMode={mode} initialDate={date} initialTime={time} initialPhone={phone} initialCustomerId={customer} />;
}
