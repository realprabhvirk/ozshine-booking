import { createClient } from "@/lib/supabase/server";
import { todayISODate } from "@/lib/format";
import type { BookingWithDetails } from "@/lib/supabase/types";
import { ActiveList } from "./active-list";

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

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold tracking-tight">
        Active Today
      </h1>
      <p className="mb-6 text-sm text-muted">
        Approved bookings for today. Mark a car complete once it&apos;s done
        to charge and invoice it.
      </p>
      <ActiveList initialBookings={(bookings as BookingWithDetails[]) ?? []} />
    </div>
  );
}
