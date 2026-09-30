import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { todayISO } from "@/lib/core/time";
import { isoDateSchema } from "@/lib/core/schemas";
import { errorMessage } from "@/lib/core/errors";
import { fetchDayPayments, fetchDaySummary } from "@/lib/shop/money";
import { Notice } from "@/components/ui/feedback";
import { DayClient } from "./day-client";

export const metadata: Metadata = { title: "End of day — OzShine Staff" };

export default async function DayPage({ searchParams }: PageProps<"/money/day">) {
  const sp = await searchParams;
  const date = typeof sp.date === "string" && isoDateSchema.safeParse(sp.date).success ? sp.date : todayISO();
  const supabase = await createClient();
  let data;
  try {
    const [summary, payments] = await Promise.all([fetchDaySummary(supabase, date), fetchDayPayments(supabase, date)]);
    data = { summary, payments };
  } catch (e) {
    return <Notice tone="bad" title="Couldn't load the day">{errorMessage(e)}</Notice>;
  }
  return <DayClient key={date} date={date} initial={data} />;
}
