import type { Metadata } from "next";
import { Notice } from "@/components/ui/feedback";
import { loadSettings } from "../load";
import { AdminOnly } from "../admin-only";
import { TvSettings } from "./tv-settings";

export const metadata: Metadata = { title: "Shop TV — OzShine Staff" };

export default async function TvPage() {
  const settings = await loadSettings();
  if (!settings) return <Notice tone="bad">Settings not found. Has the database upgrade been run?</Notice>;
  return (
    <AdminOnly>
      <TvSettings key={settings.display_key + settings.display_messages.join("|")} settingsId={settings.id} displayKey={settings.display_key} messages={settings.display_messages} />
    </AdminOnly>
  );
}
