import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { flushOutbox } from "@/lib/outbox-sender";

// Daily job (vercel.json → crons). Vercel sends "Authorization: Bearer
// <CRON_SECRET>". The same secret must have been generated in the staff app
// (Messages → Setup) — the database only stores its bcrypt hash and checks it,
// so no Supabase service-role key is ever needed.
//
// 1. run_automations_with_key: queues reminders / review requests / win-backs
//    and "sends" anything due in demo mode.
// 2. Only when the shop is set to Live: hands queued messages to Twilio /
//    Resend and records each result (see lib/outbox-sender.ts). Most
//    messages already went out instantly via /api/messages/flush; this
//    catches scheduled reminders and anything a flush missed.
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
  // leaves messages queued in Live mode), so this is a no-op there.
  try {
    const live = await flushOutbox(supabase, secret, { budgetMs: 45_000 });
    return NextResponse.json({ ok: true, automations: run.data, live });
  } catch (e) {
    return NextResponse.json({ ok: false, automations: run.data, error: e instanceof Error ? e.message : "Send failed" }, { status: 500 });
  }
}
