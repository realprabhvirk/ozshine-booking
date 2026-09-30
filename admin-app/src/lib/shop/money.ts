// Money screens: reads (through RLS) and actions (database functions that
// check permissions, keep totals/GST consistent and write the audit log).
import type { SupabaseClient } from "@supabase/supabase-js";
import { callRpc } from "@/lib/rpc";
import { AppError, toAppError } from "@/lib/core/errors";
import { centsToDbAmount, type Cents } from "@/lib/core/money";
import type { InvoiceStatus, PaymentMethod, VehicleType, BookingStatus } from "@/lib/core/status";
import { addDaysISO } from "@/lib/core/time";
import { announceChange } from "./actions";

const ACTOR = null;

export type InvoiceItem = {
  id: string;
  kind: "service" | "addon" | "custom" | "discount";
  description: string;
  quantity: number | string;
  unit_price: number | string;
  line_total: number | string;
  sort: number;
  created_at: string;
};

export type Payment = {
  id: string;
  amount: number | string;
  method: PaymentMethod;
  reference: string | null;
  note: string | null;
  received_at: string;
  refund_of_payment_id: string | null;
  received_by: { name: string } | null;
};

export type InvoiceDetail = {
  id: string;
  number: string | null;
  status: InvoiceStatus;
  subtotal: number | string;
  discount_total: number | string;
  gst_amount: number | string;
  total: number | string;
  amount_paid: number | string;
  balance_due: number | string;
  public_token: string;
  issued_at: string | null;
  voided_at: string | null;
  void_reason: string | null;
  notes: string | null;
  created_at: string;
  items: InvoiceItem[];
  payments: Payment[];
  customer: { id: string; name: string; phone: string | null; email: string | null; is_walkin_placeholder: boolean } | null;
  created_by: { name: string } | null;
  booking: {
    id: string;
    reference_code: string;
    status: BookingStatus;
    requested_date: string;
    requested_time: string;
    completed_at: string | null;
    vehicle_type: VehicleType | null;
    service: { name: string } | null;
    vehicle: { rego: string | null; make_model: string | null; colour: string | null } | null;
    processed_by: { name: string } | null;
  } | null;
};

export const INVOICE_DETAIL_SELECT = [
  "id, number, status, subtotal, discount_total, gst_amount, total, amount_paid, balance_due, public_token",
  "issued_at, voided_at, void_reason, notes, created_at",
  "items:invoice_items(id, kind, description, quantity, unit_price, line_total, sort, created_at)",
  "payments(id, amount, method, reference, note, received_at, refund_of_payment_id, received_by:staff!received_by_staff_id(name))",
  "customer:customers(id, name, phone, email, is_walkin_placeholder)",
  "created_by:staff!created_by_staff_id(name)",
  "booking:bookings(id, reference_code, status, requested_date, requested_time, completed_at, vehicle_type, service:services(name), vehicle:vehicles(rego, make_model, colour), processed_by:staff!processed_by_staff_id(name))",
].join(", ");

function check<T>(res: { data: T | null; error: unknown }): T {
  if (res.error) throw toAppError(res.error);
  return res.data as T;
}

// Line order: services/extras/custom by `sort`, discounts last.
export function sortItems(items: InvoiceItem[]): InvoiceItem[] {
  return [...items].sort((a, b) => (a.kind === "discount" ? 1 : 0) - (b.kind === "discount" ? 1 : 0) || a.sort - b.sort || a.created_at.localeCompare(b.created_at));
}

export async function fetchInvoice(supabase: SupabaseClient, id: string): Promise<InvoiceDetail | null> {
  const row = check(await supabase.from("invoices").select(INVOICE_DETAIL_SELECT).eq("id", id).maybeSingle());
  if (!row) return null;
  const inv = row as unknown as InvoiceDetail;
  inv.items = sortItems(inv.items);
  inv.payments.sort((a, b) => a.received_at.localeCompare(b.received_at));
  return inv;
}

// Start of a Brisbane calendar day as a UTC instant (QLD is UTC+10 all year).
export function shopDayStart(iso: string): string {
  return new Date(`${iso}T00:00:00+10:00`).toISOString();
}

export type InvoiceListRow = {
  id: string;
  number: string | null;
  status: InvoiceStatus;
  total: number | string;
  balance_due: number | string;
  issued_at: string | null;
  created_at: string;
  customer: { name: string; phone: string | null; is_walkin_placeholder: boolean } | null;
  booking: { id: string; reference_code: string; vehicle: { rego: string | null } | null; service: { name: string } | null } | null;
};

export async function fetchInvoices(supabase: SupabaseClient, from: string, to: string): Promise<InvoiceListRow[]> {
  const res = await supabase
    .from("invoices")
    .select("id, number, status, total, balance_due, issued_at, created_at, customer:customers(name, phone, is_walkin_placeholder), booking:bookings(id, reference_code, vehicle:vehicles(rego), service:services(name))")
    .gte("created_at", shopDayStart(from))
    .lt("created_at", shopDayStart(addDaysISO(to, 1)))
    .order("created_at", { ascending: false })
    .limit(1000);
  return check(res) as unknown as InvoiceListRow[];
}

export type DebtorRow = {
  invoice_id: string | null;
  number: string | null;
  booking_id: string | null;
  customer_id: string;
  customer_name: string;
  phone: string | null;
  total: number | string;
  balance_due: number | string;
  days_old: number;
  bucket: "today" | "1-7" | "8-30" | "30+";
  rego: string | null;
};

export function fetchDebtors(supabase: SupabaseClient) {
  return callRpc<DebtorRow[]>(supabase, "debtors_aging");
}

export type DaySummary = {
  date: string;
  cars_completed: number;
  revenue_total: number | string;
  payments_by_method: Partial<Record<PaymentMethod, number | string>>;
  payments_total: number | string;
  expected_cash: number | string;
  eftpos_total: number | string;
  refunds_total: number | string;
  voids_count: number;
  outstanding_created: number | string;
  is_closed: boolean;
  close: {
    counted_cash: number | string | null;
    variance: number | string | null;
    notes: string | null;
    closed_at: string;
    reopened_at: string | null;
    closed_by_staff_id: string | null;
  } | null;
};

export function fetchDaySummary(supabase: SupabaseClient, date: string) {
  return callRpc<DaySummary>(supabase, "day_summary", { p_date: date });
}

export type DayPayment = Payment & { invoice: { id: string; number: string | null; customer: { name: string; is_walkin_placeholder: boolean } | null } | null };

export async function fetchDayPayments(supabase: SupabaseClient, date: string): Promise<DayPayment[]> {
  const res = await supabase
    .from("payments")
    .select("id, amount, method, reference, note, received_at, refund_of_payment_id, received_by:staff!received_by_staff_id(name), invoice:invoices(id, number, customer:customers(name, is_walkin_placeholder))")
    .gte("received_at", shopDayStart(date))
    .lt("received_at", shopDayStart(addDaysISO(date, 1)))
    .order("received_at", { ascending: true });
  return check(res) as unknown as DayPayment[];
}

export type GstSummary = {
  tax_rate: number | string;
  months: Array<{ month: string; sales: number | string; gst: number | string }>;
  total_sales: number | string;
  total_gst: number | string;
};

export function fetchGst(supabase: SupabaseClient, from: string, to: string) {
  return callRpc<GstSummary>(supabase, "gst_summary", { p_from: from, p_to: to });
}

export type AuditRow = { id: string; action: string; before: unknown; after: unknown; created_at: string; actor: { name: string } | null };

export async function fetchInvoiceAudit(supabase: SupabaseClient, invoiceId: string): Promise<AuditRow[]> {
  const res = await supabase
    .from("audit_log")
    .select("id, action, before, after, created_at, actor:staff!actor_staff_id(name)")
    .eq("entity_id", invoiceId)
    .order("created_at", { ascending: false })
    .limit(100);
  // Only admins can read the audit log; staff just don't see the section.
  if (res.error) return [];
  return (res.data ?? []) as unknown as AuditRow[];
}

// ---- Actions ---------------------------------------------------------------
async function run<T>(p: Promise<T>): Promise<T> {
  const r = await p;
  announceChange();
  return r;
}

export function addInvoiceLine(
  supabase: SupabaseClient,
  invoiceId: string,
  line: { kind: "custom" | "discount"; description: string; quantity: number; unitPrice: Cents },
) {
  return run(callRpc<string>(supabase, "add_invoice_item", {
    p_invoice_id: invoiceId,
    p_kind: line.kind,
    p_description: line.description,
    p_quantity: line.quantity,
    p_unit_price: centsToDbAmount(line.unitPrice),
    p_actor: ACTOR,
  }));
}

export function updateInvoiceLine(supabase: SupabaseClient, itemId: string, line: { description: string; quantity: number; unitPrice: Cents }) {
  return run(callRpc<void>(supabase, "update_invoice_item", {
    p_item_id: itemId,
    p_description: line.description,
    p_quantity: line.quantity,
    p_unit_price: centsToDbAmount(line.unitPrice),
    p_actor: ACTOR,
  }));
}

export function removeInvoiceLine(supabase: SupabaseClient, itemId: string) {
  return run(callRpc<void>(supabase, "remove_invoice_item", { p_item_id: itemId, p_actor: ACTOR }));
}

export function refundPayment(supabase: SupabaseClient, paymentId: string, amount: Cents, reason: string) {
  return run(callRpc<{ refund_id: string }>(supabase, "refund_payment", {
    p_payment_id: paymentId,
    p_amount: centsToDbAmount(amount),
    p_reason: reason,
    p_actor: ACTOR,
  }));
}

export function voidInvoice(supabase: SupabaseClient, invoiceId: string, reason: string) {
  return run(callRpc<void>(supabase, "void_invoice", { p_invoice_id: invoiceId, p_reason: reason, p_actor: ACTOR }));
}

export function sendInvoiceMessage(supabase: SupabaseClient, invoiceId: string, kind: "receipt" | "payment_reminder") {
  return run(callRpc<number>(supabase, "send_invoice_message", { p_invoice_id: invoiceId, p_template_key: kind, p_actor: ACTOR }));
}

export function closeDay(supabase: SupabaseClient, date: string, countedCash: Cents, notes: string) {
  return run(callRpc<DaySummary>(supabase, "close_day", {
    p_date: date,
    p_counted_cash: centsToDbAmount(countedCash),
    p_notes: notes,
    p_actor: ACTOR,
  }));
}

export function reopenDay(supabase: SupabaseClient, date: string) {
  return run(callRpc<void>(supabase, "reopen_day", { p_date: date, p_actor: ACTOR }));
}

export function assertFound<T>(v: T | null): T {
  if (!v) throw new AppError("NOT_FOUND");
  return v;
}
