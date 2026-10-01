import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { errorMessage } from "@/lib/core/errors";
import { Notice } from "@/components/ui/feedback";
import { FeedbackClient, type FeedbackRow, type TestimonialRow } from "./feedback-client";

export const metadata: Metadata = { title: "Feedback & reviews — OzShine Staff" };

export default async function FeedbackPage() {
  const supabase = await createClient();
  const [fb, ts] = await Promise.all([
    supabase
      .from("feedback")
      .select("id, rating, comment, created_at, handled_at, customer:customers(id, name, phone), booking:bookings(id, reference_code, requested_date, service:services(name)), handled:staff!handled_by(name)")
      .order("created_at", { ascending: false })
      .limit(300),
    supabase.from("testimonials").select("id, name, text, rating, published, sort, created_at").order("sort").order("created_at", { ascending: false }),
  ]);
  if (fb.error || ts.error) return <Notice tone="bad" title="Couldn't load feedback">{errorMessage(fb.error ?? ts.error)}</Notice>;
  return <FeedbackClient feedback={(fb.data ?? []) as unknown as FeedbackRow[]} testimonials={(ts.data ?? []) as TestimonialRow[]} />;
}
