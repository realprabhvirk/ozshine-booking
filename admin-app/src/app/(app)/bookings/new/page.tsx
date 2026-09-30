import { redirect } from "next/navigation";

// Replaced by the New sale screen (walk-ins and phone bookings).
export default function NewBookingPage() {
  redirect("/new?mode=later");
}
