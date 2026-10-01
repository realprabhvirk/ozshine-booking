import { test } from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { flushOutbox } from "./outbox-sender.ts";

type Call = { fn: string; args: Record<string, unknown> };

// Fake database: hands out the queue once, records every report.
function fakeDb(queue: Array<{ id: string; channel: "sms" | "email"; to: string; subject: string | null; body: string }>) {
  const calls: Call[] = [];
  let handed = false;
  const db = {
    rpc: async (fn: string, args: Record<string, unknown>) => {
      calls.push({ fn, args });
      if (fn === "get_public_settings") return { data: { business_name: "OzShine Hand Car Wash", address: "114-118 George St, Beenleigh", phone: "0449 558 449" }, error: null };
      if (fn === "claim_outbox_batch_with_key") {
        const data = handed ? [] : queue;
        handed = true;
        return { data, error: null };
      }
      return { data: null, error: null };
    },
  } as unknown as SupabaseClient;
  return { db, calls };
}

function withEnv(env: Record<string, string | undefined>, fn: () => Promise<void>) {
  const old: Record<string, string | undefined> = {};
  for (const k of Object.keys(env)) {
    old[k] = process.env[k];
    if (env[k] === undefined) delete process.env[k];
    else process.env[k] = env[k];
  }
  return fn().finally(() => {
    for (const k of Object.keys(old)) {
      if (old[k] === undefined) delete process.env[k];
      else process.env[k] = old[k];
    }
  });
}

const queue = [
  { id: "e1", channel: "email" as const, to: "jess@example.test", subject: "Booked", body: "See you" },
  { id: "s1", channel: "sms" as const, to: "0412345678", subject: null, body: "See you" },
  { id: "e2", channel: "email" as const, to: "sam@example.test", subject: "Booked", body: "See you" },
];

test("email-only live: emails go through Resend once each, texts are marked demo", async () => {
  const sent: Array<{ headers: Record<string, string>; body: { from: string; to: string[]; html?: string } }> = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (_url: string, init: RequestInit) => {
    sent.push({ headers: init.headers as Record<string, string>, body: JSON.parse(String(init.body)) });
    return new Response(JSON.stringify({ id: `re-${sent.length}` }), { status: 200 });
  }) as typeof fetch;
  try {
    await withEnv({ RESEND_API_KEY: "test", RESEND_FROM: undefined, TWILIO_ACCOUNT_SID: undefined }, async () => {
      const { db, calls } = fakeDb(queue);
      const r = await flushOutbox(db, "k");
      assert.deepEqual(r, { sent: 2, failed: 0, simulated: 1, retrying: 0 });
      assert.equal(sent.length, 2);
      assert.equal(sent[0].body.from, "OzShine Beenleigh <beenleigh@ozshinecarwash.com.au>");
      assert.equal(sent[0].headers["Idempotency-Key"], "oz-e1");
      assert.ok(sent[0].body.html?.includes("email-logo.png") && sent[0].body.html.includes("114-118 George St, Beenleigh"), "branded HTML sent");
      assert.deepEqual(calls.filter((c) => c.fn === "simulate_outbox_message_with_key").map((c) => c.args.p_id), ["s1"]);
      assert.deepEqual(calls.filter((c) => c.fn === "report_outbox_result_with_key").map((c) => [c.args.p_id, c.args.p_ok]), [["e1", true], ["e2", true]]);
    });
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("rate-limited by Resend: left queued for a retry, not marked failed", async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify({ message: "Too many requests" }), { status: 429 })) as typeof fetch;
  try {
    await withEnv({ RESEND_API_KEY: "test" }, async () => {
      const { db, calls } = fakeDb([queue[0]]);
      const r = await flushOutbox(db, "k");
      assert.deepEqual(r, { sent: 0, failed: 0, simulated: 0, retrying: 1 });
      assert.equal(calls.filter((c) => c.fn === "report_outbox_result_with_key").length, 0);
    });
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("a bad address is a real failure and is reported", async () => {
  await withEnv({ RESEND_API_KEY: "test" }, async () => {
    const { db, calls } = fakeDb([{ ...queue[0], to: "not-an-email" }]);
    const r = await flushOutbox(db, "k");
    assert.equal(r.failed, 1);
    assert.equal(calls.find((c) => c.fn === "report_outbox_result_with_key")?.args.p_ok, false);
  });
});
