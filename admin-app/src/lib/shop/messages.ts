import type { SupabaseClient } from "@supabase/supabase-js";
import { callRpc } from "@/lib/rpc";
import type { Channel, OutboxStatus, Segment } from "@/lib/messaging";
import { announceChange } from "./actions";

export type OutboxRow = {
  id: string;
  channel: Channel;
  template_key: string | null;
  to_address: string | null;
  subject: string | null;
  body: string;
  status: OutboxStatus;
  provider: string | null;
  error: string | null;
  scheduled_for: string;
  sent_at: string | null;
  created_at: string;
  customer: { id: string; name: string } | null;
  campaign: { id: string; name: string } | null;
};

export type TemplateRow = {
  id: string;
  key: string;
  channel: Channel;
  name: string;
  category: "transactional" | "marketing";
  subject: string | null;
  body: string;
  active: boolean;
  updated_at: string;
};

export type AutomationRow = {
  key: string;
  name: string;
  enabled: boolean;
  config: Record<string, number | string | boolean>;
  last_run_at: string | null;
  last_run_count: number;
};

export type CampaignRow = {
  id: string;
  name: string;
  channel: Channel;
  subject: string | null;
  body: string | null;
  segment: Segment;
  status: "draft" | "scheduled" | "sent";
  sent_at: string | null;
  created_at: string;
  stats: Partial<Record<OutboxStatus, number>>;
  created_by: { name: string } | null;
};

export const OUTBOX_SELECT =
  "id, channel, template_key, to_address, subject, body, status, provider, error, scheduled_for, sent_at, created_at, customer:customers(id, name), campaign:campaigns(id, name)";

export type OutboxFilter = { status?: OutboxStatus | "skipped" | ""; channel?: Channel | ""; q?: string; page?: number };
export const OUTBOX_PAGE = 50;

export async function fetchOutbox(supabase: SupabaseClient, f: OutboxFilter): Promise<{ rows: OutboxRow[]; total: number | null }> {
  const page = f.page ?? 0;
  let q = supabase
    .from("message_outbox")
    .select(OUTBOX_SELECT, { count: "estimated" })
    .order("created_at", { ascending: false })
    .range(page * OUTBOX_PAGE, page * OUTBOX_PAGE + OUTBOX_PAGE - 1);
  if (f.status === "skipped") q = q.in("status", ["skipped_opt_out", "skipped_no_contact"]);
  else if (f.status) q = q.eq("status", f.status);
  if (f.channel) q = q.eq("channel", f.channel);
  const term = (f.q ?? "").trim().replace(/[%_,()*\\]/g, " ").trim();
  if (term) q = q.or(`to_address.ilike.%${term}%,body.ilike.%${term}%,subject.ilike.%${term}%`);
  const { data, error, count } = await q;
  if (error) throw error;
  return { rows: (data ?? []) as unknown as OutboxRow[], total: count ?? null };
}

// Message counts by status over the last N days (one small count query each).
export async function fetchOutboxStats(supabase: SupabaseClient, sinceIso: string) {
  const statuses: OutboxStatus[] = ["simulated_sent", "sent", "queued", "failed", "skipped_opt_out", "skipped_no_contact"];
  const counts = await Promise.all(
    statuses.map(async (s) => {
      const { count, error } = await supabase.from("message_outbox").select("id", { count: "exact", head: true }).eq("status", s).gte("created_at", sinceIso);
      if (error) throw error;
      return [s, count ?? 0] as const;
    }),
  );
  return Object.fromEntries(counts) as Record<OutboxStatus, number>;
}

export async function fetchTemplates(supabase: SupabaseClient): Promise<TemplateRow[]> {
  const { data, error } = await supabase.from("message_templates").select("*").order("key").order("channel");
  if (error) throw error;
  return (data ?? []) as TemplateRow[];
}

export async function fetchAutomations(supabase: SupabaseClient): Promise<AutomationRow[]> {
  const { data, error } = await supabase.from("automations").select("key, name, enabled, config, last_run_at, last_run_count").order("key");
  if (error) throw error;
  return (data ?? []) as AutomationRow[];
}

export async function fetchCampaigns(supabase: SupabaseClient): Promise<CampaignRow[]> {
  const { data, error } = await supabase
    .from("campaigns")
    .select("id, name, channel, subject, body, segment, status, sent_at, created_at, stats, created_by:staff!created_by(name)")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return (data ?? []) as unknown as CampaignRow[];
}

export function retryMessage(supabase: SupabaseClient, id: string) {
  return callRpc<void>(supabase, "retry_outbox_message", { p_id: id, p_actor: null });
}

export async function sendOneOff(supabase: SupabaseClient, customerId: string, channel: Channel, subject: string | null, body: string) {
  const ok = await callRpc<boolean>(supabase, "send_one_off_message", { p_customer_id: customerId, p_channel: channel, p_subject: subject, p_body: body, p_actor: null });
  announceChange();
  return ok;
}

export type SegmentPreview = { count: number; sample: Array<{ id: string; name: string; phone: string | null; email: string | null }> };
export function previewSegment(supabase: SupabaseClient, segment: Segment & { channel: Channel }) {
  return callRpc<SegmentPreview>(supabase, "preview_campaign_segment", { p_segment: segment });
}

export function sendCampaign(supabase: SupabaseClient, payload: { name: string; channel: Channel; subject: string | null; body: string; segment: Segment }) {
  return callRpc<{ campaign_id: string; stats: Partial<Record<OutboxStatus, number>> }>(supabase, "send_campaign", { payload, p_actor: null });
}

export type AutomationRun = { reminders: number; review_requests: number; winbacks: number; due_sent: number; rewards_expired: number; ran_at: string };
export function runAutomations(supabase: SupabaseClient) {
  return callRpc<AutomationRun>(supabase, "run_automations");
}

export function saveAutomation(supabase: SupabaseClient, key: string, enabled: boolean | null, config: Record<string, unknown> | null) {
  return callRpc<void>(supabase, "save_automation", { p_key: key, p_enabled: enabled, p_config: config, p_actor: null });
}

export function generateCronKey(supabase: SupabaseClient) {
  return callRpc<string>(supabase, "generate_cron_key", { p_actor: null });
}
