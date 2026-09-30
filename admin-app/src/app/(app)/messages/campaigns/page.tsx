import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { errorMessage } from "@/lib/core/errors";
import { fetchCampaigns } from "@/lib/shop/messages";
import { fetchAllTags } from "@/lib/shop/customers";
import { Notice } from "@/components/ui/feedback";
import { CampaignsClient } from "./campaigns-client";

export const metadata: Metadata = { title: "Campaigns — OzShine Staff" };

export default async function CampaignsPage() {
  const supabase = await createClient();
  let data;
  try {
    data = await Promise.all([
      fetchCampaigns(supabase),
      fetchAllTags(supabase),
      supabase.from("settings").select("message_provider").limit(1).maybeSingle(),
    ]);
  } catch (e) {
    return <Notice tone="bad" title="Couldn't load campaigns">{errorMessage(e)}</Notice>;
  }
  const [campaigns, tags, settings] = data;
  return <CampaignsClient campaigns={campaigns} tags={tags} live={settings.data?.message_provider === "live"} />;
}
