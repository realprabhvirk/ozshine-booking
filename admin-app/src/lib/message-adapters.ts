// Server-only: real SMS/email providers. Only imported by the sending routes.
// Every provider is OFF unless its env vars are set in Vercel, and the shop's
// "message provider" setting is switched from Demo to Live. See
// docs/UPGRADE_NOTES.md → Env vars.
import { toE164, type Channel } from "./messaging.ts";
import { renderEmailHtml, type EmailBrand } from "./email-html.ts";

// retry: the provider said "slow down" / is briefly down, so leave the message
// queued; it's picked up again when its lease runs out.
export type SendResult = { ok: true; provider: string; providerId: string | null } | { ok: false; provider: string; error: string; retry?: boolean };
const retryable = (status: number) => status === 429 || status >= 500;
export type OutgoingMessage = { id: string; channel: Channel; to: string | null; subject: string | null; body: string };

// Sender used when RESEND_FROM isn't set. The domain must be verified in
// Resend (Domains) or Resend refuses the email.
export const DEFAULT_EMAIL_FROM = "OzShine Beenleigh <beenleigh@ozshinecarwash.com.au>";
const emailFrom = () => process.env.RESEND_FROM?.trim() || DEFAULT_EMAIL_FROM;

export function providerStatus() {
  return {
    sms: !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM),
    email: !!process.env.RESEND_API_KEY,
    cron: !!process.env.CRON_SECRET,
  };
}

async function sendSms(to: string | null, body: string): Promise<SendResult> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM;
  if (!sid || !token || !from) return { ok: false, provider: "twilio", error: "SMS isn't set up (Twilio details missing in Vercel)." };
  const e164 = toE164(to);
  if (!e164) return { ok: false, provider: "twilio", error: "Not a valid Australian phone number." };
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ To: e164, From: from, Body: body }),
    signal: AbortSignal.timeout(15000),
  });
  const json = (await res.json().catch(() => ({}))) as { sid?: string; message?: string };
  return res.ok ? { ok: true, provider: "twilio", providerId: json.sid ?? null } : { ok: false, provider: "twilio", error: json.message ?? `Twilio error ${res.status}`, retry: retryable(res.status) };
}

async function sendEmail(to: string | null, subject: string | null, body: string, id: string, brand?: EmailBrand): Promise<SendResult> {
  const key = process.env.RESEND_API_KEY;
  const from = emailFrom();
  if (!key) return { ok: false, provider: "resend", error: "Email isn't set up (Resend details missing in Vercel)." };
  if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return { ok: false, provider: "resend", error: "Not a valid email address." };
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    // Same outbox id = same email: Resend drops repeats for 24h, so a retry
    // after a timeout can't send it twice.
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "Idempotency-Key": `oz-${id}` },
    body: JSON.stringify({
      from,
      to: [to],
      subject: subject || "A message from OzShine",
      text: body,
      ...(brand ? { html: renderEmailHtml({ subject: subject || "A message from OzShine", body, brand }) } : {}),
    }),
    signal: AbortSignal.timeout(15000),
  });
  const json = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
  return res.ok ? { ok: true, provider: "resend", providerId: json.id ?? null } : { ok: false, provider: "resend", error: json.message ?? `Resend error ${res.status}`, retry: retryable(res.status) };
}

export async function sendMessage(m: OutgoingMessage, brand?: EmailBrand): Promise<SendResult> {
  try {
    return m.channel === "sms" ? await sendSms(m.to, m.body) : await sendEmail(m.to, m.subject, m.body, m.id, brand);
  } catch (e) {
    // Network error / timeout: we can't tell if it went. Email retries safely
    // (idempotency key); a text is marked failed so staff decide on a resend.
    return { ok: false, provider: m.channel === "sms" ? "twilio" : "resend", error: e instanceof Error ? e.message : "Send failed", retry: m.channel === "email" };
  }
}
