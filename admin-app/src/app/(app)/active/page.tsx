import { createClient } from "@/lib/supabase/server";
import { formatMoney, formatTime, todayISODate } from "@/lib/format";
import type { BookingWithDetails } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

export default async function ActivePage() {
  const supabase = await createClient();

  const { data: staff } = await supabase
    .from("staff")
    .select("location_id")
    .single();

  const { data: bookings } = await supabase
    .from("bookings")
    .select(
      "*, customer:customers(id,name,phone,email), vehicle:vehicles(id,rego,make_model), service:services(id,name,price_from)"
    )
    .eq("location_id", staff?.location_id ?? "")
    .eq("status", "approved")
    .eq("requested_date", todayISODate())
    .order("requested_time", { ascending: true });

  const rows = (bookings as BookingWithDetails[]) ?? [];

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold tracking-tight">
        Active Today
      </h1>
      <p className="mb-6 text-sm text-muted">
        Approved bookings for today, in order. Marking a car complete and
        invoicing it is coming in the next phase.
      </p>

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-surface/50 px-6 py-16 text-center text-muted">
          Nothing approved for today yet.
        </div>
      ) : (
        <ul className="flex flex-col gap-4">
          {rows.map((booking) => (
            <li
              key={booking.id}
              className="flex flex-col justify-between gap-4 rounded-2xl border border-border bg-surface p-5 shadow-sm shadow-black/[0.03] sm:flex-row sm:items-center"
            >
              <div>
                <p className="text-lg font-semibold">
                  {formatTime(booking.requested_time)} · {booking.customer?.name}
                </p>
                <p className="text-sm text-muted">
                  {booking.customer?.phone}
                  {booking.vehicle?.rego ? ` · ${booking.vehicle.rego}` : ""}
                </p>
                <p className="mt-1 text-sm">
                  {booking.service?.name} ·{" "}
                  {formatMoney(booking.service?.price_from ?? null)}+
                </p>
              </div>
              <span className="self-start rounded-full bg-brand/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-brand-dark sm:self-center">
                Approved
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
