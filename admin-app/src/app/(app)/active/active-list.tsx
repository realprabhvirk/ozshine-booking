"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useStaff } from "@/components/staff-context";
import { formatMoney, formatTime } from "@/lib/format";
import type { BookingWithDetails } from "@/lib/supabase/types";

export function ActiveList({
  initialBookings,
}: {
  initialBookings: BookingWithDetails[];
}) {
  const router = useRouter();
  const staff = useStaff();
  const [supabase] = useState(() => createClient());
  const [bookings, setBookings] = useState(initialBookings);
  const [completingId, setCompletingId] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function startCompleting(booking: BookingWithDetails) {
    setCompletingId(booking.id);
    setAmount(String(booking.service?.price_from ?? ""));
  }

  async function confirmComplete(bookingId: string) {
    const parsedAmount = Number(amount);
    if (!amount || Number.isNaN(parsedAmount) || parsedAmount < 0) {
      alert("Enter a valid amount.");
      return;
    }

    setSubmitting(true);

    const { error } = await supabase
      .from("bookings")
      .update({
        status: "completed",
        amount_charged: parsedAmount,
        processed_by_staff_id: staff.id,
      })
      .eq("id", bookingId);

    setSubmitting(false);

    if (error) {
      alert(`Couldn't complete that booking: ${error.message}`);
      return;
    }

    setBookings((prev) => prev.filter((b) => b.id !== bookingId));
    setCompletingId(null);
    router.push(`/invoices/${bookingId}`);
  }

  if (bookings.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-surface/50 px-6 py-16 text-center text-muted">
        Nothing approved for today yet.
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-4">
      {bookings.map((booking) => {
        const isCompleting = completingId === booking.id;
        return (
          <li
            key={booking.id}
            className="rounded-2xl border border-border bg-surface p-5 shadow-sm shadow-black/[0.03]"
          >
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
              <div>
                <p className="text-lg font-semibold">
                  {formatTime(booking.requested_time)} · {booking.customer?.name}
                </p>
                <p className="text-sm text-muted">
                  {booking.customer?.phone}
                  {booking.vehicle?.rego ? ` · ${booking.vehicle.rego}` : ""}
                </p>
                <p className="mt-1 text-sm">
                  {booking.service?.name} ·{" "}
                  {formatMoney(booking.service?.price_from ?? null)}+
                </p>
              </div>

              {!isCompleting && (
                <button
                  onClick={() => startCompleting(booking)}
                  className="rounded-xl bg-brand px-5 py-3.5 text-base font-semibold text-white transition hover:bg-brand-dark"
                >
                  Mark Complete
                </button>
              )}
            </div>

            {isCompleting && (
              <div className="mt-4 flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-end">
                <label className="flex-1">
                  <span className="mb-1.5 block text-sm font-medium text-foreground">
                    Amount charged
                  </span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="w-full rounded-lg border border-border bg-white px-3.5 py-2.5 text-base outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
                  />
                </label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setCompletingId(null)}
                    disabled={submitting}
                    className="rounded-lg border border-border px-4 py-2.5 text-sm font-semibold text-foreground transition hover:bg-black/[0.03] disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => confirmComplete(booking.id)}
                    disabled={submitting}
                    className="rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-dark disabled:opacity-50"
                  >
                    {submitting ? "Saving…" : "Confirm & Invoice"}
                  </button>
                </div>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
