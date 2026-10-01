// Server-only: hands queued messages to Twilio / Resend. Used by the daily job
// (/api/cron/messages) and the instant send (/api/messages/flush). Nothing is
// ever queued for sending in Demo mode, so both are no-ops there.
import type { SupabaseClient } from "@supabase/supabase-js";
import { providerStatus, sendMessage, type OutgoingMessage } from "./message-adapters.ts";
import type { EmailBrand } from "./email-html.ts";

// Booking site address (logo + "Book online" link in emails). Optional env.
const BOOKING_SITE_URL = (process.env.NEXT_PUBLIC_BOOKING_SITE_URL?.trim() || "https://ozshine-booking.vercel.app").replace(/\/+$/, "");

async function loadBrand(supabase: SupabaseClient): Promise<EmailBrand> {
  const fallback: EmailBrand = { businessName: "OzShine Beenleigh", address: null, phone: null, siteUrl: BOOKING_SITE_URL };
  try {
    const { data } = await supabase.rpc("get_public_settings");
    const s = (data ?? {}) as { business_name?: string | null; address?: string | null; phone?: string | null };
    return { ...fallback, businessName: s.business_name || fallback.businessName, address: s.address || null, phone: s.phone || null };
  } catch {
    return fallback;
  }
}

export type FlushResult = { sent: number; failed: number; simulated: number; retrying: number };

// Resend allows about 2 requests a second on standard plans.
const GAP_MS = 550;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function flushOutbox(supabase: SupabaseClient, key: string, opts: { budgetMs?: number; batch?: number } = {}): Promise<FlushResult> {
  const { budgetMs = 20_000, batch = 25 } = opts;
  const stopAt = Date.now() + budgetMs;
  const ready = providerStatus();
  const out: FlushResult = { sent: 0, failed: 0, simulated: 0, retrying: 0 };
  let brand: EmailBrand | null = null;
  while (Date.now() < stopAt) {
    // Claimed messages are leased to this run for 10 minutes, so a parallel
    // run can't send them too. Anything left unsent comes back after that.
    const claimed = await supabase.rpc("claim_outbox_batch_with_key", { p_key: key, p_limit: batch });
    if (claimed.error) throw new Error(claimed.error.message);
    const messages = (claimed.data ?? []) as OutgoingMessage[];
    for (const m of messages) {
      // Live with only one provider set up: the other channel is "sent (demo)".
      if (!ready[m.channel]) {
        await supabase.rpc("simulate_outbox_message_with_key", { p_key: key, p_id: m.id });
        out.simulated++;
        continue;
      }
      if (Date.now() > stopAt) {
        out.retrying++;
        continue;
      }
      const started = Date.now();
      if (m.channel === "email" && !brand) brand = await loadBrand(supabase);
      const r = await sendMessage(m, brand ?? undefined);
      if (!r.ok && r.retry) {
        out.retrying++;
      } else {
        if (r.ok) out.sent++;
        else out.failed++;
        await supabase.rpc("report_outbox_result_with_key", {
          p_key: key,
          p_id: m.id,
          p_ok: r.ok,
          p_provider: r.provider,
          p_provider_id: r.ok ? r.providerId : null,
          p_error: r.ok ? null : r.error,
        });
      }
      const wait = GAP_MS - (Date.now() - started);
      if (wait > 0) await sleep(wait);
    }
    if (messages.length < batch) break;
  }
  return out;
}
