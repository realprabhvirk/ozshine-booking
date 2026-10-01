// Staff actions. Every one is a database function that checks permissions,
// the booking status flow and money rules, and records who did it. The shop
// runs on one owner login, so the actor is the login itself (null token).
import type { SupabaseClient } from "@supabase/supabase-js";
import { callRpc } from "@/lib/rpc";
import { centsToDbAmount, type Cents } from "@/lib/core/money";
import type { BookingStatus, PaymentMethod } from "@/lib/core/status";

const ACTOR = null;

// Lets open screens refresh straight away after this tablet changes
// something (realtime covers changes from other devices).
export const BOOKINGS_CHANGED = "oz:bookings-changed";
export function announceChange() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(BOOKINGS_CHANGED));
  kickOutbox();
}

// Live mode: ask the server to send whatever this action queued (confirmation,
// "car's ready", receipt…) right now instead of at the 7am daily job. Bursts
// collapse into one call; in Demo mode the server finds nothing to send.
let kickTimer: ReturnType<typeof setTimeout> | null = null;
export function kickOutbox() {
  if (typeof window === "undefined") return;
  if (kickTimer) clearTimeout(kickTimer);
  kickTimer = setTimeout(() => {
    kickTimer = null;
    fetch("/api/messages/flush", { method: "POST", keepalive: true }).catch(() => {});
  }, 1500);
}

async function run<T>(p: Promise<T>): Promise<T> {
  const r = await p;
  announceChange();
  return r;
}

export function advanceBooking(
  supabase: SupabaseClient,
  bookingId: string,
  to: BookingStatus,
  opts: { bayId?: string | null; reason?: string | null; allowNoInvoice?: boolean } = {},
) {
  return run(
    callRpc<{ id: string; status: BookingStatus; bay_id: string | null }>(supabase, "advance_booking", {
      p_booking_id: bookingId,
      p_to_status: to,
      p_actor: ACTOR,
      p_bay_id: opts.bayId ?? null,
      p_assigned_staff_id: null,
      p_reason: opts.reason ?? null,
      p_allow_no_invoice: opts.allowNoInvoice ?? false,
    }),
  );
}

export function updateBookingDetails(
  supabase: SupabaseClient,
  bookingId: string,
  payload: { requested_date?: string; requested_time?: string; bay_id?: string | null; internal_notes?: string; force?: boolean },
) {
  return run(callRpc<{ ok: boolean; forced: boolean }>(supabase, "update_booking_details", {
    p_booking_id: bookingId,
    payload,
    p_actor: ACTOR,
  }));
}

export type NewBookingPayload = {
  // An existing customer picked from search. The database uses them as-is
  // (and falls back to phone/rego/name matching if the id is unusable).
  customer_id?: string;
  vehicle_type: string;
  service_id: string;
  addon_ids: string[];
  name?: string;
  phone?: string;
  email?: string;
  rego?: string;
  make_model?: string;
  notes?: string;
  customer_notes?: string;
  promo_code?: string;
  reward_code?: string;
};

export function createWalkin(supabase: SupabaseClient, payload: NewBookingPayload & { start_now: boolean; bay_id?: string | null }) {
  return run(callRpc<{ booking_id: string; reference_code: string; status: BookingStatus; total_estimate: number }>(
    supabase,
    "create_walkin_order",
    { payload, p_actor: ACTOR },
  ));
}

export function createStaffBooking(supabase: SupabaseClient, payload: NewBookingPayload & { date: string; time: string; force?: boolean }) {
  return run(callRpc<{ booking_id: string; reference_code: string; status: BookingStatus; forced: boolean }>(
    supabase,
    "create_staff_booking",
    { payload, p_actor: ACTOR },
  ));
}

export function issueInvoice(supabase: SupabaseClient, bookingId: string) {
  return run(callRpc<string>(supabase, "issue_invoice", { p_booking_id: bookingId, p_actor: ACTOR }));
}

export function applyInvoiceCode(supabase: SupabaseClient, invoiceId: string, code: string) {
  return run(callRpc<{ discount: number }>(supabase, "apply_invoice_code", { p_invoice_id: invoiceId, p_code: code, p_actor: ACTOR }));
}

export function recordPayment(
  supabase: SupabaseClient,
  invoiceId: string,
  amount: Cents,
  method: PaymentMethod,
  opts: { reference?: string | null; voucherCode?: string | null; idempotencyKey?: string } = {},
) {
  return run(callRpc<{ payment_id: string; status: string; balance_due: number }>(supabase, "record_payment", {
    p_invoice_id: invoiceId,
    p_amount: centsToDbAmount(amount),
    p_method: method,
    p_reference: opts.reference ?? null,
    p_actor: ACTOR,
    p_voucher_code: opts.voucherCode ?? null,
    p_idempotency_key: opts.idempotencyKey ?? null,
  }));
}

// Cash: save what was handed over so the receipt shows the change. Never
// blocks a payment: if it fails (e.g. the patch isn't run yet) the payment
// itself is already recorded.
export async function setPaymentTendered(supabase: SupabaseClient, paymentId: string, tendered: Cents) {
  try {
    await callRpc(supabase, "set_payment_tendered", { p_payment_id: paymentId, p_tendered: centsToDbAmount(tendered), p_actor: ACTOR });
    return true;
  } catch {
    return false;
  }
}
