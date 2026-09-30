import type { Metadata } from "next";
import { Notice } from "@/components/ui/feedback";
import { loadSettings } from "./load";
import { AdminOnly } from "./admin-only";
import { BusinessForm } from "./business-form";

export const metadata: Metadata = { title: "Settings — OzShine Staff" };

export default async function BusinessSettingsPage() {
  const settings = await loadSettings();
  if (!settings) return <Notice tone="bad">Settings not found. Has the database upgrade been run?</Notice>;
  return (
    <AdminOnly>
      <BusinessForm key={settings.id + (settings as unknown as { updated_at?: string }).updated_at} settings={settings} />
    </AdminOnly>
  );
}
