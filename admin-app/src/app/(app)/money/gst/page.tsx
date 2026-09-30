import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { todayISO } from "@/lib/core/time";
import { errorMessage } from "@/lib/core/errors";
import { fetchGst } from "@/lib/shop/money";
import { Notice } from "@/components/ui/feedback";
import { GstClient } from "./gst-client";

export const metadata: Metadata = { title: "GST — OzShine Staff" };

// Australian financial year: FY2026 = 1 Jul 2025 – 30 Jun 2026.
function currentFy(today: string) {
  const [y, m] = today.split("-").map(Number);
  return m >= 7 ? y + 1 : y;
}

export default async function GstPage({ searchParams }: PageProps<"/money/gst">) {
  const sp = await searchParams;
  const now = currentFy(todayISO());
  const fy = typeof sp.fy === "string" && /^\d{4}$/.test(sp.fy) ? Math.min(Math.max(Number(sp.fy), 2020), now) : now;
  const from = `${fy - 1}-07-01`;
  const to = `${fy}-06-30`;
  const supabase = await createClient();
  let data;
  try {
    data = await fetchGst(supabase, from, to);
  } catch (e) {
    return <Notice tone="bad" title="Couldn't load GST figures">{errorMessage(e)}</Notice>;
  }
  return <GstClient fy={fy} currentFy={now} data={data} />;
}
