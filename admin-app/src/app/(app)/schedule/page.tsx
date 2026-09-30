import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { fetchRange } from "@/lib/shop/queries";
import { addDaysISO, startOfWeekISO, todayISO } from "@/lib/core/time";
import { isoDateSchema } from "@/lib/core/schemas";
import { errorMessage } from "@/lib/core/errors";
import { Notice } from "@/components/ui/feedback";
import { ScheduleClient, type ScheduleView } from "./schedule-client";

export const metadata: Metadata = { title: "Schedule — OzShine Staff" };

export default async function SchedulePage({ searchParams }: PageProps<"/schedule">) {
  const sp = await searchParams;
  const rawDate = typeof sp.date === "string" ? sp.date : "";
  const date = isoDateSchema.safeParse(rawDate).success ? rawDate : todayISO();
  const view: ScheduleView = sp.view === "week" ? "week" : "day";
  const from = view === "week" ? startOfWeekISO(date) : date;
  const to = view === "week" ? addDaysISO(from, 6) : date;

  const supabase = await createClient();
  let bookings;
  try {
    bookings = await fetchRange(supabase, from, to);
  } catch (e) {
    return <Notice tone="bad" title="Couldn't load the schedule">{errorMessage(e)}</Notice>;
  }
  return <ScheduleClient key={`${view}-${from}`} view={view} date={date} from={from} to={to} initial={bookings} />;
}
