import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { uuidSchema } from "@/lib/core/schemas";
import { fetchCustomerProfile } from "@/lib/shop/customers";
import { CustomerProfileClient } from "./profile-client";

export const metadata: Metadata = { title: "Customer — OzShine Staff" };

export default async function CustomerPage({ params }: PageProps<"/customers/[id]">) {
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) notFound();
  const supabase = await createClient();
  const profile = await fetchCustomerProfile(supabase, id);
  if (!profile || profile.customer.is_walkin_placeholder) notFound();
  // A merged duplicate points at the record it was folded into.
  if (profile.customer.merged_into_customer_id) redirect(`/customers/${profile.customer.merged_into_customer_id}`);
  return <CustomerProfileClient key={id} initial={profile} />;
}
