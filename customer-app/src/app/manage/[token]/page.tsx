import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPublicSettings, UUID_RE, type BookingView } from "@/lib/public";
import { DemoBanner, SiteHeader } from "@/components/site/header";
import { ManageClient } from "./manage-client";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Your booking", robots: { index: false, follow: false } };

export default async function ManagePage({ params, searchParams }: PageProps<"/manage/[token]">) {
  const { token } = await params;
  const sp = await searchParams;
  if (!UUID_RE.test(token)) notFound();
  const supabase = createClient();
  const [{ data }, settings] = await Promise.all([supabase.rpc("get_booking_by_token", { p_token: token }), getPublicSettings(supabase)]);
  const booking = data as BookingView | null;
  if (!booking) notFound();
  return (
    <>
      {settings?.demo_banner && <DemoBanner />}
      <SiteHeader phone={booking.shop.phone} bookHref="/book" />
      <main className="min-h-[70dvh] bg-canvas">
        <ManageClient token={token} initial={booking} isNew={sp.new === "1"} settings={settings} />
      </main>
    </>
  );
}
