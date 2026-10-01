// Read queries for the staff screens. Work with both the server and browser
// Supabase clients; all access goes through RLS (staff read their location).
import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError, toAppError } from "@/lib/core/errors";
import { fetchAllPages } from "@/lib/paginate";
import type { BoardBooking, Catalogue, DashboardStats } from "./types";

export const BOOKING_SELECT = [
  "id, reference_code, status, source, requested_date, requested_time, starts_at, ends_at, duration_minutes",
  "vehicle_type, service_price, price_estimate, discount_estimate, customer_notes, internal_notes",
  "approved_at, checked_in_at, started_at, ready_at, completed_at, created_at",
  "customer:customers(id, name, phone, email, is_vip, is_walkin_placeholder)",
  "vehicle:vehicles(id, rego, make_model, colour, vehicle_type)",
  "service:services(id, name)",
  "bay:bays(id, name)",
  "assigned:staff!assigned_staff_id(id, name)",
  "addons:booking_addons(name_snapshot, price_snapshot)",
  "invoices(id, number, status, total, amount_paid, balance_due)",
].join(", ");

function check<T>(res: { data: T | null; error: unknown }): T {
  if (res.error) throw toAppError(res.error);
  return res.data as T;
}

// Everything the floor needs: every request waiting for approval, today's
// bookings, and any car still on site from an earlier day.
export async function fetchBoard(supabase: SupabaseClient, today: string): Promise<BoardBooking[]> {
  const res = await supabase
    .from("bookings")
    .select(BOOKING_SELECT)
    .or(`status.eq.pending,requested_date.eq.${today},status.in.(checked_in,in_progress,ready)`)
    .order("starts_at", { ascending: true })
    .limit(400);
  return check(res) as unknown as BoardBooking[];
}

export async function fetchRange(
  supabase: SupabaseClient,
  from: string,
  to: string,
  opts: { includeCancelled?: boolean } = {},
): Promise<BoardBooking[]> {
  return fetchAllPages<BoardBooking>((a, b) => {
    let q = supabase
      .from("bookings")
      .select(BOOKING_SELECT)
      .gte("requested_date", from)
      .lte("requested_date", to)
      .order("starts_at", { ascending: true })
      .order("id", { ascending: true });
    if (!opts.includeCancelled) q = q.not("status", "in", "(declined,cancelled,no_show)");
    return q.range(a, b) as unknown as PromiseLike<{ data: BoardBooking[] | null; error: unknown }>;
  });
}

export async function fetchBooking(supabase: SupabaseClient, id: string): Promise<BoardBooking> {
  const res = await supabase.from("bookings").select(BOOKING_SELECT).eq("id", id).maybeSingle();
  const row = check(res);
  if (!row) throw new AppError("NOT_FOUND");
  return row as unknown as BoardBooking;
}

export async function fetchStats(supabase: SupabaseClient): Promise<DashboardStats> {
  const res = await supabase.rpc("dashboard_stats");
  return check(res) as DashboardStats;
}

export async function fetchCatalogue(supabase: SupabaseClient): Promise<Catalogue> {
  const [settings, services, addons, bays] = await Promise.all([
    supabase.from("settings").select("*").limit(1).maybeSingle(),
    supabase.from("services").select("*").order("sort_order"),
    supabase.from("addons").select("*").order("sort_order"),
    supabase.from("bays").select("*").order("sort_order"),
  ]);
  return {
    settings: check(settings) as Catalogue["settings"],
    services: (check(services) ?? []) as Catalogue["services"],
    addons: (check(addons) ?? []) as Catalogue["addons"],
    bays: (check(bays) ?? []) as Catalogue["bays"],
  };
}
