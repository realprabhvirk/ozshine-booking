// Shapes returned by the public database functions (see upgrade_v2.sql
// §9: get_public_settings, get_booking_by_token, get_receipt_by_token…) and
// the public reads of services / add-ons. Money arrives as numbers or numeric
// strings; convert with toCents() before doing maths.
import type { SupabaseClient } from "@supabase/supabase-js";
import { toCents, type Cents } from "@/lib/core/money";
import type { BookingStatus, VehicleType } from "@/lib/core/status";
import { callRpc } from "@/lib/rpc";
import { publicRpc } from "@/lib/public-rpc";
import { kickOutbox } from "@/lib/site";

export type DayHours = { open: string; close: string; closed: boolean };
export type Money = number | string;

export type PublicSettings = {
  business_name: string;
  abn: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  opening_hours: Record<string, DayHours>;
  slot_minutes: number;
  min_lead_minutes: number;
  max_advance_days: number;
  cancel_cutoff_hours: number;
  require_approval: boolean;
  online_booking_enabled: boolean;
  loyalty_enabled: boolean;
  loyalty_tiers: Array<{ name: string; min_visits: number }>;
  demo_banner: boolean;
  today: string;
  now: string;
  blackouts: Array<{ date: string; reason: string | null; start_time: string | null; end_time: string | null }>;
  loyalty_rule: { name: string; visits_required: number; reward_type: string; reward_value: Money | null } | null;
  referral_rule: { name: string; reward_type: string; reward_value: Money | null } | null;
};

export type PublicService = {
  id: string;
  name: string;
  tagline: string | null;
  description: string | null;
  includes: string[] | null;
  category: string | null;
  price_from: Money;
  price_small_wagon: Money | null;
  price_van: Money | null;
  price_4wd: Money | null;
  duration_minutes: number | null;
  badge: string | null;
  requires_quote: boolean;
  sort_order: number;
};

export type PublicAddon = { id: string; name: string; description: string | null; price: Money; duration_minutes: number; sort_order: number };

export type Testimonial = { name: string; text: string; rating: number | null };

export type BookingView = {
  reference_code: string;
  status: BookingStatus;
  first_name: string;
  service: { id: string; name: string; duration_minutes: number | null; requires_quote: boolean };
  addons: Array<{ name: string; price: Money }>;
  addon_ids: string[];
  vehicle: { rego: string | null; make_model: string | null };
  vehicle_type: VehicleType;
  date: string;
  time: string;
  starts_at: string;
  ends_at: string;
  duration_minutes: number;
  estimated_ready_at: string | null;
  stages: Record<"created_at" | "approved_at" | "checked_in_at" | "started_at" | "ready_at" | "completed_at" | "cancelled_at" | "declined_at", string | null>;
  price_estimate: Money;
  discount_estimate: Money;
  decline_reason: string | null;
  cancel_reason: string | null;
  can_modify: boolean;
  cancel_cutoff_hours: number;
  invoice: { number: string; status: string; total: Money; amount_paid: Money; balance_due: Money; public_token: string } | null;
  feedback: { rating: number } | null;
  shop: { business_name: string; phone: string | null; address: string | null; review_url: string | null };
};

export type Receipt = {
  number: string;
  status: string;
  issued_at: string | null;
  subtotal: Money;
  discount_total: Money;
  gst_amount: Money;
  total: Money;
  amount_paid: Money;
  balance_due: Money;
  customer_first_name: string | null;
  rego: string | null;
  items: Array<{ description: string; quantity: Money; unit_price: Money; line_total: Money }>;
  payments: Array<{ method: string; amount: Money; received_at: string; tendered?: Money | null; change_given?: Money | null }>;
  business: { name: string; abn: string | null; address: string | null; phone: string | null; email: string | null; footer: string | null; tax_rate: Money };
};

export type Slot = { slot_time: string; available: boolean; reason: string | null };

// ---- Reads ------------------------------------------------------------------

export async function getPublicSettings(supabase: SupabaseClient): Promise<PublicSettings | null> {
  const { data } = await supabase.rpc("get_public_settings");
  return (data as PublicSettings | null) ?? null;
}

export async function getServices(supabase: SupabaseClient): Promise<PublicService[]> {
  const { data } = await supabase.from("services").select("*").order("sort_order").order("name");
  return (data ?? []) as PublicService[];
}

export async function getAddons(supabase: SupabaseClient): Promise<PublicAddon[]> {
  const { data } = await supabase.from("addons").select("id, name, description, price, duration_minutes, sort_order").order("sort_order").order("name");
  return (data ?? []) as PublicAddon[];
}

export async function getTestimonials(supabase: SupabaseClient): Promise<Testimonial[]> {
  const { data } = await supabase.rpc("get_published_testimonials");
  return (data ?? []) as Testimonial[];
}

// ---- Pricing (display only: the database always re-prices) ----------------

export function servicePriceCents(s: PublicService, vt: VehicleType): Cents {
  const byType = { sedan: s.price_from, small_wagon: s.price_small_wagon, van: s.price_van, "4wd": s.price_4wd }[vt];
  return toCents(byType ?? s.price_from);
}

export function fromPriceCents(s: PublicService): Cents {
  return Math.min(...[s.price_from, s.price_small_wagon, s.price_van, s.price_4wd].filter((v) => v !== null && v !== undefined).map((v) => toCents(v)));
}

export function jobMinutes(s: PublicService, addons: PublicAddon[]): number {
  return (s.duration_minutes ?? 60) + addons.reduce((n, a) => n + (a.duration_minutes ?? 0), 0);
}

// ---- Booking actions (browser) ----------------------------------------------

export type BookingPayload = {
  service_id: string;
  addon_ids: string[];
  vehicle_type: VehicleType;
  date: string;
  time: string;
  name: string;
  phone: string;
  email: string;
  rego: string;
  make_model: string;
  notes: string;
  marketing_opt_in: boolean;
  promo_code: string;
  referral_code: string;
  reward_code: string;
  website: string; // honeypot
};

export type BookingCreated = {
  reference_code: string;
  manage_token: string;
  status: BookingStatus;
  starts_at: string;
  ends_at: string;
  subtotal: Money;
  discount: Money;
  total_estimate: Money;
};

export function fetchSlots(supabase: SupabaseClient, date: string, serviceId: string, addonIds: string[]) {
  return publicRpc<Slot[]>(supabase, "get_available_slots", { p_date: date, p_service_id: serviceId, p_addon_ids: addonIds }, { retry: true });
}

export function checkPromo(supabase: SupabaseClient, code: string, serviceId: string, subtotalCents: Cents) {
  return publicRpc<{ ok: boolean; message: string; code?: string; discount?: Money }>(supabase, "validate_promo", {
    p_code: code,
    p_service_id: serviceId,
    p_subtotal: subtotalCents / 100,
  }, { retry: true });
}

// These can queue a text/email to the customer: ask for it to go out now.
function sendNow<T>(r: T): T {
  kickOutbox();
  return r;
}

export function createBooking(supabase: SupabaseClient, payload: BookingPayload) {
  return publicRpc<BookingCreated>(supabase, "create_public_booking", { payload }).then(sendNow);
}

export function getBookingByToken(supabase: SupabaseClient, token: string) {
  return callRpc<BookingView | null>(supabase, "get_booking_by_token", { p_token: token });
}

export function cancelByToken(supabase: SupabaseClient, token: string, reason: string) {
  return publicRpc<BookingView>(supabase, "cancel_booking_by_token", { p_token: token, p_reason: reason || null }).then(sendNow);
}

export function rescheduleByToken(supabase: SupabaseClient, token: string, date: string, time: string) {
  return publicRpc<BookingView>(supabase, "reschedule_booking_by_token", { p_token: token, p_new_date: date, p_new_time: time }).then(sendNow);
}

export function submitFeedback(supabase: SupabaseClient, token: string, rating: number, comment: string) {
  return publicRpc<{ ok: boolean; low_rating: boolean; review_url: string | null; shop_phone: string | null }>(supabase, "submit_feedback_by_token", {
    p_token: token,
    p_rating: rating,
    p_comment: comment || null,
  });
}

export function joinWaitlist(supabase: SupabaseClient, name: string, phone: string, date: string, serviceId: string | null, note: string) {
  return publicRpc<{ ok: boolean }>(supabase, "join_waitlist", { p_name: name, p_phone: phone, p_date: date, p_service_id: serviceId, p_note: note || null });
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
