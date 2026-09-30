import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { addDaysISO, todayISO } from "@/lib/core/time";
import { AdminOnly } from "../admin-only";
import { ClosuresEditor, type Closure } from "./closures-editor";

export const metadata: Metadata = { title: "Closures — OzShine Staff" };

export default async function ClosuresPage() {
  const supabase = await createClient();
  const today = todayISO();
  const { data } = await supabase.from("blackout_dates").select("id, date, reason, start_time, end_time").gte("date", addDaysISO(today, -60)).order("date");
  const closures = (data ?? []) as Closure[];
  const upcoming = closures.filter((c) => c.date >= today).map((c) => c.date);
  let clashes: Record<string, number> = {};
  if (upcoming.length) {
    const { data: b } = await supabase.from("bookings").select("requested_date").in("requested_date", upcoming).in("status", ["pending", "approved"]);
    clashes = ((b ?? []) as Array<{ requested_date: string }>).reduce<Record<string, number>>((acc, r) => ({ ...acc, [r.requested_date]: (acc[r.requested_date] ?? 0) + 1 }), {});
  }
  return (
    <AdminOnly>
      <ClosuresEditor key={closures.map((c) => c.id).join()} closures={closures} clashes={clashes} />
    </AdminOnly>
  );
}
