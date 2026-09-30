import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { fetchBoard, fetchStats } from "@/lib/shop/queries";
import { todayISO } from "@/lib/core/time";
import { errorMessage } from "@/lib/core/errors";
import { Notice } from "@/components/ui/feedback";
import { FloorClient } from "./floor-client";

export const metadata: Metadata = { title: "Floor — OzShine Staff" };

export default async function FloorPage() {
  const supabase = await createClient();
  const today = todayISO();
  let initial;
  try {
    const [bookings, stats] = await Promise.all([fetchBoard(supabase, today), fetchStats(supabase)]);
    initial = { bookings, stats };
  } catch (e) {
    return (
      <Notice tone="bad" title="Couldn't load today's board">
        {errorMessage(e)} If this keeps happening, check the database upgrade (supabase/upgrade_v2.sql) has been run.
      </Notice>
    );
  }
  return <FloorClient initial={initial} />;
}
