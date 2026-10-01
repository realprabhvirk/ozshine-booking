import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { flushOutbox } from "@/lib/outbox-sender";

// Instant send. The staff app calls this right after anything that can queue a
// message (approve, ready, receipt…), and the booking site calls it after a
// customer books, so in Live mode texts/emails go out within seconds instead
// of waiting for the 7am daily job.
//
// Deliberately open (no login): it takes no input and only sends what the
// database has already queued and is due, using the server's own CRON_SECRET.
// Claiming leases each message, so repeated or parallel calls can't double-send.
export const dynamic = "force-dynamic";
export const maxDuration = 30;

let lastRun = 0;

export async function POST() {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ ok: false, error: "CRON_SECRET isn't set, so instant sending is off." }, { status: 503 });
  // Cheap guard against bursts hitting the same warm instance.
  const now = Date.now();
  if (now - lastRun < 2000) return NextResponse.json({ ok: true, skipped: true });
  lastRun = now;

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  try {
    const r = await flushOutbox(supabase, secret);
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Send failed" }, { status: 500 });
  }
}
