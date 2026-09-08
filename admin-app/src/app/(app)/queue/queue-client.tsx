"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useStaff } from "@/components/staff-context";
import { playAlertSound } from "@/lib/alert-sound";
import { formatDate, formatMoney, formatTime } from "@/lib/format";
import type { Booking, BookingWithDetails } from "@/lib/supabase/types";

const BOOKING_SELECT =
  "*, customer:customers(id,name,phone,email), vehicle:vehicles(id,rego,make_model), service:services(id,name,price_from)";

export function QueueClient({
  initialBookings,
  locationId,
}: {
  initialBookings: BookingWithDetails[];
  locationId: string;
}) {
  const staff = useStaff();
  const [bookings, setBookings] = useState(initialBookings);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [supabase] = useState(() => createClient());

  useEffect(() => {
    if (!locationId) return;

    const channel = supabase
      .channel("booking-queue")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "bookings",
          filter: `location_id=eq.${locationId}`,
        },
        async (payload) => {
          const row = payload.new as Booking;
          if (row.status !== "pending") return;

          const { data } = await supabase
            .from("bookings")
            .select(BOOKING_SELECT)
            .eq("id", row.id)
            .single();

          if (data) {
            setBookings((prev) => [...prev, data as BookingWithDetails]);
            playAlertSound();
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "bookings",
          filter: `location_id=eq.${locationId}`,
        },
        (payload) => {
          const row = payload.new as Booking;
          // Someone else (another tablet, or this one) moved it out of
          // pending — drop it from the queue either way.
          if (row.status !== "pending") {
            setBookings((prev) => prev.filter((b) => b.id !== row.id));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, locationId]);

  async function handleDecision(bookingId: string, decision: "approved" | "declined") {
    setBusyId(bookingId);
    const previous = bookings;
    setBookings((prev) => prev.filter((b) => b.id !== bookingId));

    const { error } = await supabase
      .from("bookings")
      .update({ status: decision, processed_by_staff_id: staff.id })
      .eq("id", bookingId);

    if (error) {
      setBookings(previous);
      alert(`Couldn't update that booking: ${error.message}`);
    }
    setBusyId(null);
  }

  if (bookings.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-surface/50 px-6 py-16 text-center text-muted">
        No pending bookings right now. New requests will pop up here
        automatically.
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-4">
      {bookings.map((booking) => (
        <li
          key={booking.id}
          className="rounded-2xl border border-border bg-surface p-5 shadow-sm shadow-black/[0.03]"
        >
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
            <div>
              <p className="text-lg font-semibold">
                {booking.customer?.name ?? "Unknown customer"}
              </p>
              <p className="text-sm text-muted">
                {booking.customer?.phone}
                {booking.vehicle?.rego ? ` · ${booking.vehicle.rego}` : ""}
              </p>
              <p className="mt-2 text-sm">
                <span className="font-medium">{booking.service?.name}</span>
                {" · "}
                {formatMoney(booking.service?.price_from ?? null)}+
              </p>
              <p className="text-sm text-muted">
                Requested for {formatDate(booking.requested_date)} at{" "}
                {formatTime(booking.requested_time)}
              </p>
            </div>

            <div className="flex gap-3">
              <button
                disabled={busyId === booking.id}
                onClick={() => handleDecision(booking.id, "declined")}
                className="min-w-28 rounded-xl border border-border px-5 py-3.5 text-base font-semibold text-foreground transition hover:bg-black/[0.03] disabled:opacity-50"
              >
                Decline
              </button>
              <button
                disabled={busyId === booking.id}
                onClick={() => handleDecision(booking.id, "approved")}
                className="min-w-28 rounded-xl bg-brand px-5 py-3.5 text-base font-semibold text-white transition hover:bg-brand-dark disabled:opacity-50"
              >
                Approve
              </button>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
