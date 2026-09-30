import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { getAddons, getPublicSettings, getServices, UUID_RE } from "@/lib/public";
import { VEHICLE_TYPES, type VehicleType } from "@/lib/core/status";
import { DemoBanner, SiteHeader } from "@/components/site/header";
import { Notice } from "@/components/ui/feedback";
import { BookingWizard } from "./wizard";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Book a wash",
  description: "Choose your service and a time that suits. Real availability, instant confirmation link, no account needed.",
  alternates: { canonical: "/book" },
};

export default async function BookPage({ searchParams }: PageProps<"/book">) {
  const sp = await searchParams;
  const supabase = createClient();
  const [settings, services, addons] = await Promise.all([getPublicSettings(supabase), getServices(supabase), getAddons(supabase)]);
  const pick = (v: unknown) => (typeof v === "string" ? v : "");
  const service = UUID_RE.test(pick(sp.service)) && services.some((s) => s.id === pick(sp.service)) ? pick(sp.service) : null;
  const vehicle = (VEHICLE_TYPES as readonly string[]).includes(pick(sp.vehicle)) ? (pick(sp.vehicle) as VehicleType) : null;
  const ref = /^[A-Z0-9]{4,12}$/i.test(pick(sp.ref)) ? pick(sp.ref).toUpperCase() : "";

  return (
    <>
      {settings?.demo_banner && <DemoBanner />}
      <SiteHeader phone={settings?.phone} bookHref={null} />
      <main className="min-h-[70dvh] bg-canvas">
        {!settings || !settings.online_booking_enabled ? (
          <div className="mx-auto max-w-xl px-4 py-16">
            <Notice tone="warn" title="Online booking is paused">
              We&apos;re not taking online bookings right now.{settings?.phone ? ` Give us a call on ${settings.phone} and we'll sort you out.` : ""}
            </Notice>
          </div>
        ) : (
          <BookingWizard settings={settings} services={services} addons={addons} initialService={service} initialVehicle={vehicle} referral={ref} />
        )}
      </main>
    </>
  );
}
