// Row shapes the V2 staff screens read. Clients are untyped (see
// lib/supabase/types.ts), so query results are cast to these.
import type { BookingSource, BookingStatus, InvoiceStatus, VehicleType } from "@/lib/core/status";

export type DayHours = { open: string; close: string; closed: boolean };

export interface ShopSettings {
  location_id: string;
  business_name: string;
  phone: string | null;
  address: string | null;
  opening_hours: Record<string, DayHours>;
  bay_count: number;
  slot_minutes: number;
  max_concurrent_jobs: number;
  tax_rate: number | string;
  manual_discount_admin_threshold: number | string;
  alert_sound: boolean | null;
  idle_lock_minutes: number;
}

export interface ServiceRow {
  id: string;
  name: string;
  price_from: number | string;
  price_small_wagon: number | string | null;
  price_van: number | string | null;
  price_4wd: number | string | null;
  duration_minutes: number | null;
  active: boolean;
  badge: string | null;
  requires_quote: boolean;
  sort_order: number;
}

export interface AddonRow {
  id: string;
  name: string;
  price: number | string;
  duration_minutes: number;
  active: boolean;
  sort_order: number;
}

export interface BayRow {
  id: string;
  name: string;
  sort_order: number;
  active: boolean;
}

export interface BoardInvoice {
  id: string;
  number: string | null;
  status: InvoiceStatus;
  total: number | string;
  amount_paid: number | string;
  balance_due: number | string;
}

export interface BoardBooking {
  id: string;
  reference_code: string;
  status: BookingStatus;
  source: BookingSource;
  requested_date: string;
  requested_time: string;
  starts_at: string;
  ends_at: string;
  duration_minutes: number;
  vehicle_type: VehicleType | null;
  service_price: number | string | null;
  price_estimate: number | string | null;
  discount_estimate: number | string | null;
  customer_notes: string | null;
  internal_notes: string | null;
  approved_at: string | null;
  checked_in_at: string | null;
  started_at: string | null;
  ready_at: string | null;
  completed_at: string | null;
  created_at: string;
  customer: { id: string; name: string; phone: string | null; email: string | null; is_vip: boolean; is_walkin_placeholder: boolean } | null;
  vehicle: { id: string; rego: string | null; make_model: string | null; colour: string | null; vehicle_type: VehicleType } | null;
  service: { id: string; name: string } | null;
  bay: { id: string; name: string } | null;
  assigned: { id: string; name: string } | null;
  addons: Array<{ name_snapshot: string; price_snapshot: number | string }>;
  invoices: BoardInvoice[];
}

export interface DashboardStats {
  date: string;
  requests_waiting: number;
  scheduled_today: number;
  arrived: number;
  in_bay: number;
  ready: number;
  done_today: number;
  revenue_today: number | string;
  payments_today: number | string;
  outstanding_today: number | string;
  outstanding_total: number | string;
  day_closed: boolean;
}

export interface Catalogue {
  settings: ShopSettings | null;
  services: ServiceRow[];
  addons: AddonRow[];
  bays: BayRow[];
}

// The live (non-void) invoice for a booking, if any.
export function liveInvoice(b: Pick<BoardBooking, "invoices">): BoardInvoice | null {
  return b.invoices.find((i) => i.status !== "void") ?? null;
}
