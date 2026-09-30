import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { providerStatus } from "@/lib/message-adapters";
import { SetupClient } from "./setup-client";

export const metadata: Metadata = { title: "Message setup — OzShine Staff" };

export default async function SetupPage() {
  const supabase = await createClient();
  const [settings, auto] = await Promise.all([
    supabase.from("settings").select("id, message_provider, cron_key_hash").limit(1).maybeSingle(),
    supabase.from("automations").select("last_run_at").not("last_run_at", "is", null).order("last_run_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const s = settings.data as { id: string; message_provider: "demo" | "live"; cron_key_hash: string | null } | null;
  // Only booleans leave the server — never the values themselves.
  return (
    <SetupClient
      settingsId={s?.id ?? ""}
      provider={s?.message_provider ?? "demo"}
      keyGenerated={!!s?.cron_key_hash}
      lastRun={(auto.data as { last_run_at: string } | null)?.last_run_at ?? null}
      env={providerStatus()}
    />
  );
}
