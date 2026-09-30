import type { SupabaseClient } from "@supabase/supabase-js";
import { callRpc } from "@/lib/rpc";
import type { BookingSource, PaymentMethod, VehicleType } from "@/lib/core/status";

export type Overview = {
  from: string;
  to: string;
  cars: number;
  revenue: number | string;
  avg_ticket: number | string;
  customers: number;
  new_customers: number;
  repeat_customers: number;
  by_vehicle_type: Array<{ vehicle_type: VehicleType; count: number; revenue: number | string }>;
  by_source: Array<{ source: BookingSource; count: number }>;
  by_payment_method: Array<{ method: PaymentMethod; total: number | string; count: number }>;
  by_addon: Array<{ name: string; count: number; revenue: number | string }>;
  cancellations: number;
  no_shows: number;
  bookings_total: number;
  ratings: { average: number | string | null; count: number; distribution: Record<string, number> };
  loyalty: { issued: number; redeemed: number; loyal_revenue: number | string };
  promos: Array<{ code: string; uses: number; revenue: number | string }>;
};
export type SeriesPoint = { bucket: string; revenue: number | string; cars: number };
export type ServiceRow = { service_id: string; name: string; count: number; revenue: number | string };
export type HourCell = { dow: number; hour: number; count: number };
export type Bucket = "day" | "week" | "month";

export type ReportData = { overview: Overview; series: SeriesPoint[]; services: ServiceRow[]; hours: HourCell[]; bucket: Bucket };

export function bucketFor(days: number): Bucket {
  return days <= 35 ? "day" : days <= 190 ? "week" : "month";
}

export async function fetchReport(supabase: SupabaseClient, from: string, to: string, bucket: Bucket): Promise<ReportData> {
  const args = { p_from: from, p_to: to };
  const [overview, series, services, hours] = await Promise.all([
    callRpc<Overview>(supabase, "report_overview", args),
    callRpc<SeriesPoint[]>(supabase, "revenue_series", { ...args, p_bucket: bucket }),
    callRpc<ServiceRow[]>(supabase, "service_breakdown", args),
    callRpc<HourCell[]>(supabase, "busiest_hours", args),
  ]);
  return { overview, series, services, hours, bucket };
}
