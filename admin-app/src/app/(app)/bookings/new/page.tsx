import { createClient } from "@/lib/supabase/server";
import { NewBookingForm } from "./new-booking-form";

export const dynamic = "force-dynamic";

export default async function NewBookingPage() {
  const supabase = await createClient();

  const { data: staff } = await supabase
    .from("staff")
    .select("location_id")
    .single();

  const { data: services } = await supabase
    .from("services")
    .select("*")
    .eq("location_id", staff?.location_id ?? "")
    .order("sort_order", { ascending: true });

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold tracking-tight">New Booking</h1>
      <p className="mb-6 max-w-xl text-sm text-muted">
        For phone calls and walk-ins. If the phone number already exists,
        it&apos;s attached to that customer&apos;s history automatically —
        otherwise a new customer is created.
      </p>
      <NewBookingForm
        services={services ?? []}
        locationId={staff?.location_id ?? ""}
      />
    </div>
  );
}
