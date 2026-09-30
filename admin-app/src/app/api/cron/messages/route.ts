import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendMessage, type OutgoingMessage } from "@/lib/message-adapters";

// Daily job (vercel.json → crons). Vercel sends "Authorization: Bearer
// <CRON_SECRET>". The same secret must have been generated in the staff app
// (Messages → Setup) — the database only stores its bcrypt hash and checks it,
// so no Supabase service-role key is ever needed.
//
// 1. run_automations_with_key: queues reminders / review requests / win-backs
//    and "sends" anything due in demo mode.
// 2. Only when the shop is set to Live: hands queued messages to Twilio /
//    Resend and records each result.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ ok: false, error: "CRON_SECRET isn't set, so the daily job is off." }, { status: 503 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ ok: false, error: "Unauthorised" }, { status: 401 });

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const run = await supabase.rpc("run_automations_with_key", { p_key: secret });
  if (run.error) return NextResponse.json({ ok: false, error: run.error.message }, { status: 500 });

  // Nothing is claimed while the shop is in Demo mode (the database only
  // leaves messages queued in Live mode), so this loop is a no-op there.
  let sent = 0;
  let failed = 0;
  for (let round = 0; round < 4; round++) {
    const batch = await supabase.rpc("claim_outbox_batch_with_key", { p_key: secret, p_limit: 50 });
    if (batch.error) return NextResponse.json({ ok: false, automations: run.data, error: batch.error.message }, { status: 500 });
    const messages = (batch.data ?? []) as OutgoingMessage[];
    if (messages.length === 0) break;
    for (const m of messages) {
      const r = await sendMessage(m);
      if (r.ok) sent++;
      else failed++;
      await supabase.rpc("report_outbox_result_with_key", {
        p_key: secret,
        p_id: m.id,
        p_ok: r.ok,
        p_provider: r.provider,
        p_provider_id: r.ok ? r.providerId : null,
        p_error: r.ok ? null : r.error,
      });
    }
    if (messages.length < 50) break;
  }

  return NextResponse.json({ ok: true, automations: run.data, live: { sent, failed } });
}
