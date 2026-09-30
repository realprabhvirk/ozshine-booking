import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { errorMessage } from "@/lib/core/errors";
import { fetchOutbox, fetchOutboxStats, type OutboxFilter } from "@/lib/shop/messages";
import { OUTBOX_STATUS, type Channel, type OutboxStatus } from "@/lib/messaging";
import { Notice } from "@/components/ui/feedback";
import { OutboxClient } from "./outbox-client";

export const metadata: Metadata = { title: "Messages — OzShine Staff" };

export default async function MessagesPage({ searchParams }: PageProps<"/messages">) {
  const sp = await searchParams;
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  const status = str(sp.status);
  const filter: OutboxFilter = {
    status: status === "skipped" || status in OUTBOX_STATUS ? (status as OutboxStatus | "skipped") : "",
    channel: str(sp.channel) === "sms" || str(sp.channel) === "email" ? (str(sp.channel) as Channel) : "",
    q: str(sp.q).slice(0, 80),
    page: Math.max(0, Math.min(500, Number.parseInt(str(sp.page), 10) || 0)),
  };
  // eslint-disable-next-line react-hooks/purity -- server component, rendered per request
  const since = new Date(Date.now() - 30 * 86400000).toISOString();
  const supabase = await createClient();
  let data;
  try {
    data = await Promise.all([
      fetchOutbox(supabase, filter),
      fetchOutboxStats(supabase, since),
      supabase.from("settings").select("message_provider").limit(1).maybeSingle(),
    ]);
  } catch (e) {
    return <Notice tone="bad" title="Couldn't load messages">{errorMessage(e)}</Notice>;
  }
  const [list, stats, settings] = data;
  return <OutboxClient filter={filter} rows={list.rows} total={list.total} stats={stats} live={settings.data?.message_provider === "live"} />;
}
