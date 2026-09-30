import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { getPublicSettings } from "@/lib/public";
import { DemoBanner, SiteHeader } from "@/components/site/header";
import { SiteFooter } from "@/components/site/footer";
import { AccountClient } from "./account-client";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "My account", robots: { index: false, follow: false } };

export default async function AccountPage() {
  const settings = await getPublicSettings(createClient());
  return (
    <>
      {settings?.demo_banner && <DemoBanner />}
      <SiteHeader phone={settings?.phone} />
      <main className="min-h-[70dvh] bg-canvas">
        <AccountClient settings={settings} />
      </main>
      <SiteFooter settings={settings} />
    </>
  );
}
