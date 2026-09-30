import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { addDaysISO, daysBetweenISO, todayISO } from "@/lib/core/time";
import { isoDateSchema } from "@/lib/core/schemas";
import { errorMessage } from "@/lib/core/errors";
import { bucketFor, fetchReport } from "@/lib/shop/reports";
import { Notice } from "@/components/ui/feedback";
import { ReportsClient } from "./reports-client";

export const metadata: Metadata = { title: "Reports — OzShine Staff" };

export default async function ReportsPage({ searchParams }: PageProps<"/reports">) {
  const sp = await searchParams;
  const today = todayISO();
  let to = typeof sp.to === "string" && isoDateSchema.safeParse(sp.to).success ? sp.to : today;
  let from = typeof sp.from === "string" && isoDateSchema.safeParse(sp.from).success ? sp.from : addDaysISO(to, -29);
  if (from > to) [from, to] = [to, from];
  if (daysBetweenISO(from, to) > 800) from = addDaysISO(to, -800);
  const bucket = bucketFor(daysBetweenISO(from, to) + 1);
  const supabase = await createClient();
  let data;
  try {
    data = await fetchReport(supabase, from, to, bucket);
  } catch (e) {
    return <Notice tone="bad" title="Couldn't load reports">{errorMessage(e)}</Notice>;
  }
  return <ReportsClient key={`${from}-${to}`} from={from} to={to} data={data} />;
}
