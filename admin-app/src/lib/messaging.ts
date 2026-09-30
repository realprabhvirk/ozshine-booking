// Pure helpers for the message centre and the provider hand-off. No imports
// from "@/..." so the Node test runner can load this file directly.

export type Channel = "sms" | "email";
export type OutboxStatus = "queued" | "simulated_sent" | "sent" | "failed" | "skipped_opt_out" | "skipped_no_contact";

export const OUTBOX_STATUS: Record<OutboxStatus, { label: string; tone: "ok" | "neutral" | "warn" | "bad" | "info" }> = {
  simulated_sent: { label: "Sent (demo)", tone: "info" },
  sent: { label: "Sent", tone: "ok" },
  queued: { label: "Queued", tone: "neutral" },
  failed: { label: "Failed", tone: "bad" },
  skipped_opt_out: { label: "Opted out", tone: "warn" },
  skipped_no_contact: { label: "No contact", tone: "warn" },
};

// Placeholders the database fills in (see render_template / booking_message_vars
// in upgrade_v2.sql). The sample values drive the live preview in the editor.
export const PLACEHOLDERS: Array<{ key: string; label: string; sample: string }> = [
  { key: "first_name", label: "First name", sample: "Jess" },
  { key: "service", label: "Service", sample: "Platinum Wash" },
  { key: "date", label: "Date", sample: "Sat 4 Oct" },
  { key: "time", label: "Time", sample: "9:30am" },
  { key: "rego", label: "Rego", sample: "123ABC" },
  { key: "reference", label: "Booking ref", sample: "OZ-7K3P" },
  { key: "manage_url", label: "Manage link", sample: "https://book.ozshine.com.au/manage/…" },
  { key: "feedback_url", label: "Feedback link", sample: "https://book.ozshine.com.au/manage/…#feedback" },
  { key: "invoice_number", label: "Invoice no.", sample: "OZ-000041" },
  { key: "amount", label: "Amount", sample: "65.00" },
  { key: "balance", label: "Balance owing", sample: "35.00" },
  { key: "receipt_url", label: "Receipt link", sample: "https://book.ozshine.com.au/r/…" },
  { key: "reward", label: "Reward", sample: "50% off your next wash" },
  { key: "reward_code", label: "Reward code", sample: "RW-8KQ2TD" },
  { key: "reason", label: "Decline reason", sample: "We're fully booked that morning." },
  { key: "business_name", label: "Business name", sample: "OzShine Hand Car Wash" },
  { key: "shop_phone", label: "Shop phone", sample: "0449 558 449" },
  { key: "review_url", label: "Review link", sample: "https://…" },
];

// Same substitution as the database's render_template(): known keys are
// replaced, unknown {{placeholders}} are blanked.
export function renderTemplate(body: string, vars: Record<string, string>): string {
  let out = body ?? "";
  for (const [k, v] of Object.entries(vars)) out = out.split(`{{${k}}}`).join(v ?? "");
  return out.replace(/\{\{[a-z_]+\}\}/g, "");
}

export function sampleVars(overrides: Record<string, string> = {}): Record<string, string> {
  return { ...Object.fromEntries(PLACEHOLDERS.map((p) => [p.key, p.sample])), ...overrides };
}

// Placeholders used in a body that the database doesn't know about.
export function unknownPlaceholders(body: string): string[] {
  const known = new Set(PLACEHOLDERS.map((p) => p.key));
  return [...new Set([...(body ?? "").matchAll(/\{\{\s*([^}]*?)\s*\}\}/g)].map((m) => m[1]))].filter((k) => !known.has(k));
}

// GSM-7 basic set + extension table. Anything else forces UCS-2 (70 chars).
const GSM7 = new Set(
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà",
);
const GSM7_EXT = new Set("^{}\\[~]|€");

// How an SMS will be billed: encoding, length in units, and segment count.
export function smsSegments(text: string): { encoding: "GSM-7" | "UCS-2"; length: number; segments: number; perSegment: number } {
  const chars = [...(text ?? "")];
  const gsm = chars.every((c) => GSM7.has(c) || GSM7_EXT.has(c));
  if (gsm) {
    const length = chars.reduce((n, c) => n + (GSM7_EXT.has(c) ? 2 : 1), 0);
    const perSegment = length <= 160 ? 160 : 153;
    return { encoding: "GSM-7", length, segments: length === 0 ? 0 : Math.ceil(length / perSegment), perSegment };
  }
  // UCS-2 counts UTF-16 code units (emoji take two).
  const length = (text ?? "").length;
  const perSegment = length <= 70 ? 70 : 67;
  return { encoding: "UCS-2", length, segments: Math.ceil(length / perSegment), perSegment };
}

// Australian mobile/landline in the database's format (0412345678) → E.164.
export function toE164(phone: string | null | undefined): string | null {
  const digits = (phone ?? "").replace(/[^\d+]/g, "");
  if (/^\+61[2-478]\d{8}$/.test(digits)) return digits;
  if (/^61[2-478]\d{8}$/.test(digits)) return `+${digits}`;
  if (/^0[2-478]\d{8}$/.test(digits)) return `+61${digits.slice(1)}`;
  return null;
}

// Campaign audience filter, as understood by campaign_audience() in SQL.
export type Segment = {
  min_visits?: number;
  max_visits?: number;
  lapsed_days?: number;
  has_unused_reward?: boolean;
  owes_money?: boolean;
  tag?: string;
  vip_only?: boolean;
};

export function describeSegment(s: Segment): string {
  const parts: string[] = [];
  if (s.vip_only) parts.push("VIPs");
  if (s.min_visits && s.max_visits) parts.push(`${s.min_visits}–${s.max_visits} visits`);
  else if (s.min_visits) parts.push(`${s.min_visits}+ visits`);
  else if (s.max_visits !== undefined) parts.push(`up to ${s.max_visits} visits`);
  if (s.lapsed_days) parts.push(`not seen in ${s.lapsed_days} days`);
  if (s.has_unused_reward) parts.push("with an unused reward");
  if (s.owes_money) parts.push("owing money");
  if (s.tag) parts.push(`tagged “${s.tag}”`);
  return parts.length ? parts.join(", ") : "Everyone who's opted in";
}

// Strip empty/zero fields so the saved segment only holds real filters.
export function cleanSegment(s: Segment): Segment {
  const out: Segment = {};
  if (s.min_visits && s.min_visits > 0) out.min_visits = Math.floor(s.min_visits);
  if (s.max_visits !== undefined && s.max_visits !== null && !Number.isNaN(s.max_visits) && s.max_visits >= 0) out.max_visits = Math.floor(s.max_visits);
  if (s.lapsed_days && s.lapsed_days > 0) out.lapsed_days = Math.floor(s.lapsed_days);
  if (s.has_unused_reward) out.has_unused_reward = true;
  if (s.owes_money) out.owes_money = true;
  if (s.tag && s.tag.trim()) out.tag = s.tag.trim().toLowerCase();
  if (s.vip_only) out.vip_only = true;
  return out;
}
