import { createClient } from "@/lib/supabase/server";
import { QueueClient } from "./queue-client";
import type { BookingWithDetails } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

const BOOKING_SELECT =
  "*, customer:customers(id,name,phone,email), vehicle:vehicles(id,rego,make_model), service:services(id,name,price_from)";

export default async function QueuePage() {
  const supabase = await createClient();

  const { data: staff } = await supabase
    .from("staff")
    .select("location_id")
    .single();

  const { data: bookings } = await supabase
    .from("bookings")
    .select(BOOKING_SELECT)
    .eq("status", "pending")
    .eq("location_id", staff?.location_id ?? "")
    .order("created_at", { ascending: true });

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold tracking-tight">
        Booking Queue
      </h1>
      <p className="mb-6 text-sm text-muted">
        New requests appear here the moment a customer submits them.
      </p>
      <QueueClient
        initialBookings={(bookings as BookingWithDetails[]) ?? []}
        locationId={staff?.location_id ?? ""}
      />
    </div>
  );
}
