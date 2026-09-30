import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { errorMessage } from "@/lib/core/errors";
import { fetchAutomations } from "@/lib/shop/messages";
import { Notice } from "@/components/ui/feedback";
import { AutomationsClient } from "./automations-client";

export const metadata: Metadata = { title: "Automatic messages — OzShine Staff" };

export default async function AutomationsPage() {
  const supabase = await createClient();
  let automations;
  try {
    automations = await fetchAutomations(supabase);
  } catch (e) {
    return <Notice tone="bad" title="Couldn't load automatic messages">{errorMessage(e)}</Notice>;
  }
  return <AutomationsClient automations={automations} />;
}
