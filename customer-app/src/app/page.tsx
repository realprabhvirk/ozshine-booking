import { createClient } from "@/lib/supabase/server";
import { getAddons, getPublicSettings, getServices, getTestimonials, type PublicSettings } from "@/lib/public";
import { siteUrl } from "@/lib/site";
import { DemoBanner } from "@/components/site/header";
import { SiteFooter } from "@/components/site/footer";
import { Hero } from "@/components/home/hero";
import { ServicesSection } from "@/components/home/services";
import { Faq, FinalCta, HowItWorks, Rewards, Reviews, Visit } from "@/components/home/sections";

export const dynamic = "force-dynamic";

const DAY_NAMES: Record<string, string> = { mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday", fri: "Friday", sat: "Saturday", sun: "Sunday" };

// schema.org data so search engines show hours, phone and address.
function jsonLd(settings: PublicSettings | null) {
  if (!settings) return null;
  return {
    "@context": "https://schema.org",
    "@type": "AutoWash",
    name: `${settings.business_name} — Beenleigh`,
    url: siteUrl(),
    telephone: settings.phone ?? undefined,
    email: settings.email ?? undefined,
    address: settings.address ? { "@type": "PostalAddress", streetAddress: settings.address, addressLocality: "Beenleigh", addressRegion: "QLD", addressCountry: "AU" } : undefined,
    openingHoursSpecification: Object.entries(settings.opening_hours ?? {})
      .filter(([, h]) => !h.closed)
      .map(([d, h]) => ({ "@type": "OpeningHoursSpecification", dayOfWeek: DAY_NAMES[d], opens: h.open.slice(0, 5), closes: h.close.slice(0, 5) })),
  };
}

export default async function Home() {
  const supabase = createClient();
  const [settings, services, addons, testimonials] = await Promise.all([getPublicSettings(supabase), getServices(supabase), getAddons(supabase), getTestimonials(supabase)]);
  const ld = jsonLd(settings);
  return (
    <>
      {settings?.demo_banner && <DemoBanner />}
      <main>
        <Hero settings={settings} />
        <ServicesSection services={services} addons={addons} />
        <HowItWorks settings={settings} />
        <Rewards settings={settings} />
        <Reviews items={testimonials} />
        <Visit settings={settings} />
        <Faq settings={settings} />
        <FinalCta />
      </main>
      <SiteFooter settings={settings} />
      {ld && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld).replace(/</g, "\\u003c") }} />}
    </>
  );
}
