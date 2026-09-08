"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatDate, formatMoney } from "@/lib/format";
import type { BookingWithService, Customer } from "@/lib/supabase/types";

// Cosmetic only, per the brief — every 6th completed wash "earns" 50% off.
// Nothing actually applies a discount anywhere; this is just the display.
const REWARD_EVERY = 6;

export function AccountView() {
  const [supabase] = useState(() => createClient());
  const [loading, setLoading] = useState(true);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [bookings, setBookings] = useState<BookingWithService[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data: customerRow } = await supabase
        .from("customers")
        .select("*")
        .eq("auth_user_id", user.id)
        .maybeSingle();

      const { data: bookingRows } = await supabase
        .from("bookings")
        .select("*, service:services(id,name,price_from), vehicle:vehicles(id,rego)")
        .eq("customer_id", customerRow?.id ?? "")
        .order("requested_date", { ascending: false });

      if (!cancelled) {
        setCustomer(customerRow as Customer);
        setBookings((bookingRows as BookingWithService[]) ?? []);
        setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  async function handleLogout() {
    await supabase.auth.signOut();
  }

  const visitCount = bookings.filter((b) => b.status === "completed").length;
  const loyaltyMessage = getLoyaltyMessage(visitCount);

  return (
    <section id="booking" className="bg-[#f4f4f5] py-20 sm:py-28">
      <div className="mx-auto max-w-2xl px-6">
        <div className="mb-10 flex items-start justify-between">
          <div>
            <p className="mb-2 text-sm font-bold uppercase tracking-widest text-brand">
              My Account
            </p>
            <h2 className="text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">
              {loading ? "Welcome back" : `Welcome back, ${customer?.name?.split(" ")[0] ?? "there"}`}
            </h2>
          </div>
          <button
            onClick={handleLogout}
            className="mt-2 shrink-0 rounded-full border border-black/10 px-4 py-2 text-sm font-semibold text-ink transition hover:bg-black/[0.03]"
          >
            Log out
          </button>
        </div>

        {loading ? (
          <p className="text-center text-muted">Loading your account…</p>
        ) : (
          <>
            <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border border-black/10 bg-white p-6">
                <p className="text-sm font-semibold text-muted">Total visits</p>
                <p className="mt-1 text-4xl font-extrabold text-ink">{visitCount}</p>
              </div>
              <div className="rounded-2xl border border-black/10 bg-ink p-6 text-white">
                <p className="text-sm font-semibold text-white/60">Loyalty</p>
                <p className="mt-1 text-sm leading-snug">{loyaltyMessage}</p>
              </div>
            </div>

            <h3 className="mb-3 text-lg font-bold text-ink">Booking history</h3>
            {bookings.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-black/10 bg-white/50 px-6 py-10 text-center text-muted">
                No bookings yet — scroll up to book your first wash.
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {bookings.map((booking) => (
                  <li
                    key={booking.id}
                    className="flex items-center justify-between rounded-xl border border-black/10 bg-white px-4 py-3"
                  >
                    <div>
                      <p className="font-medium text-ink">
                        {booking.service?.name}
                        {booking.vehicle?.rego ? ` · ${booking.vehicle.rego}` : ""}
                      </p>
                      <p className="text-sm text-muted">
                        {formatDate(booking.requested_date)}
                        {booking.status === "completed" &&
                          booking.amount_charged !== null &&
                          ` · ${formatMoney(booking.amount_charged)}`}
                      </p>
                    </div>
                    <StatusPill status={booking.status} />
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </section>
  );
}

function getLoyaltyMessage(visitCount: number): string {
  if (visitCount === 0) {
    return "Book your first wash to start earning rewards!";
  }
  if (visitCount % REWARD_EVERY === 0) {
    return "You've earned 50% off your next wash! 🎉";
  }
  const remaining = REWARD_EVERY - (visitCount % REWARD_EVERY);
  return `You've visited ${visitCount} time${visitCount === 1 ? "" : "s"} — ${remaining} more for 50% off your next wash.`;
}

function StatusPill({ status }: { status: string }) {
  const styles: Record<string, string> = {
    pending: "bg-amber-100 text-amber-800",
    approved: "bg-blue-100 text-blue-800",
    declined: "bg-zinc-200 text-zinc-600",
    completed: "bg-green-100 text-green-800",
  };

  return (
    <span
      className={`rounded-full px-3 py-1 text-xs font-semibold capitalize ${
        styles[status] ?? "bg-zinc-100 text-zinc-700"
      }`}
    >
      {status}
    </span>
  );
}
