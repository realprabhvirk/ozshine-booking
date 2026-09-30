// Booking, invoice and payment vocabularies. The booking flow MUST match the
// SQL function legal_next_statuses() in supabase/upgrade_v2.sql.

export const BOOKING_STATUSES = [
  "pending",
  "approved",
  "checked_in",
  "in_progress",
  "ready",
  "completed",
  "declined",
  "cancelled",
  "no_show",
] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

// Colour families each app maps onto its own palette.
export type Tone = "neutral" | "accent" | "info" | "violet" | "cyan" | "ok" | "warn" | "bad";

export const BOOKING_STATUS_META: Record<
  BookingStatus,
  { label: string; customerLabel: string; tone: Tone; hint: string }
> = {
  pending: { label: "Request", customerLabel: "Awaiting confirmation", tone: "warn", hint: "Waiting for staff to approve" },
  approved: { label: "Booked", customerLabel: "Confirmed", tone: "info", hint: "Confirmed, car not here yet" },
  checked_in: { label: "Checked in", customerLabel: "Checked in", tone: "violet", hint: "Car is here, waiting for a bay" },
  in_progress: { label: "In bay", customerLabel: "Being washed", tone: "cyan", hint: "Being worked on" },
  ready: { label: "Ready", customerLabel: "Ready for pickup", tone: "ok", hint: "Done, waiting for pickup and payment" },
  completed: { label: "Completed", customerLabel: "Completed", tone: "neutral", hint: "Picked up" },
  declined: { label: "Declined", customerLabel: "Declined", tone: "bad", hint: "Request turned down" },
  cancelled: { label: "Cancelled", customerLabel: "Cancelled", tone: "bad", hint: "Cancelled" },
  no_show: { label: "No-show", customerLabel: "Missed", tone: "bad", hint: "Didn't turn up" },
};

const NEXT: Record<BookingStatus, BookingStatus[]> = {
  pending: ["approved", "declined", "cancelled"],
  approved: ["checked_in", "cancelled", "no_show"],
  checked_in: ["in_progress", "cancelled"],
  in_progress: ["ready"],
  ready: ["completed"],
  completed: [],
  declined: [],
  cancelled: [],
  no_show: [],
};

export function legalNextStatuses(status: BookingStatus): BookingStatus[] {
  return NEXT[status] ?? [];
}

// Statuses that take up capacity (same as SQL holds_capacity()).
export const ACTIVE_BOOKING_STATUSES: BookingStatus[] = ["pending", "approved", "checked_in", "in_progress", "ready"];

export function isBookingStatus(value: unknown): value is BookingStatus {
  return typeof value === "string" && (BOOKING_STATUSES as readonly string[]).includes(value);
}

export const INVOICE_STATUSES = ["draft", "issued", "partial", "paid", "void"] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];
export const INVOICE_STATUS_META: Record<InvoiceStatus, { label: string; tone: Tone }> = {
  draft: { label: "Draft", tone: "neutral" },
  issued: { label: "Unpaid", tone: "warn" },
  partial: { label: "Part paid", tone: "warn" },
  paid: { label: "Paid", tone: "ok" },
  void: { label: "Void", tone: "bad" },
};

export const PAYMENT_METHODS = ["eftpos", "cash", "bank_transfer", "voucher", "other"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  eftpos: "EFTPOS / card",
  cash: "Cash",
  bank_transfer: "Bank transfer",
  voucher: "Gift voucher",
  other: "Other",
};

// Labels match SQL vehicle_type_label().
export const VEHICLE_TYPES = ["sedan", "small_wagon", "van", "4wd"] as const;
export type VehicleType = (typeof VEHICLE_TYPES)[number];
export const VEHICLE_TYPE_LABELS: Record<VehicleType, string> = {
  sedan: "Sedan",
  small_wagon: "Small Wagon",
  van: "Van",
  "4wd": "4WD",
};

export type StaffRole = "admin" | "staff";
export type BookingSource = "web" | "walk_in" | "phone" | "admin";
export const BOOKING_SOURCE_LABELS: Record<BookingSource, string> = {
  web: "Online",
  walk_in: "Walk-in",
  phone: "Phone",
  admin: "Staff",
};
