import type { Metadata } from "next";
import { Notice } from "@/components/ui/feedback";
import { loadSettings } from "../load";
import { AdminOnly } from "../admin-only";
import { HoursForm } from "./hours-form";

export const metadata: Metadata = { title: "Hours & booking — OzShine Staff" };

export default async function HoursPage() {
  const settings = await loadSettings();
  if (!settings) return <Notice tone="bad">Settings not found.</Notice>;
  return (
    <AdminOnly>
      <HoursForm key={(settings as unknown as { updated_at?: string }).updated_at ?? settings.id} settings={settings} />
    </AdminOnly>
  );
}
