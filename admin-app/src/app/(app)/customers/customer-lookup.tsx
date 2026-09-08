"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatDate, formatMoney, formatTime } from "@/lib/format";
import type { Customer, BookingWithDetails } from "@/lib/supabase/types";

export function CustomerLookup() {
  const [supabase] = useState(() => createClient());
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<Customer[]>([]);
  const [searched, setSearched] = useState(false);
  const [selected, setSelected] = useState<Customer | null>(null);
  const [history, setHistory] = useState<BookingWithDetails[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;

    setSearching(true);
    setSelected(null);
    setSearched(true);

    const [byNameOrPhone, byRego] = await Promise.all([
      supabase
        .from("customers")
        .select("*")
        .or(`name.ilike.%${q}%,phone.ilike.%${q}%`)
        .limit(20),
      supabase
        .from("vehicles")
        .select("customer_id")
        .ilike("rego", `%${q}%`)
        .limit(20),
    ]);

    const matches = new Map<string, Customer>();
    for (const c of byNameOrPhone.data ?? []) matches.set(c.id, c);

    const regoCustomerIds = (byRego.data ?? []).map((v) => v.customer_id);
    if (regoCustomerIds.length > 0) {
      const { data: viaRego } = await supabase
        .from("customers")
        .select("*")
        .in("id", regoCustomerIds);
      for (const c of viaRego ?? []) matches.set(c.id, c);
    }

    setResults(Array.from(matches.values()));
    setSearching(false);
  }

  async function selectCustomer(customer: Customer) {
    setSelected(customer);
    setLoadingHistory(true);

    const { data } = await supabase
      .from("bookings")
      .select(
        "*, vehicle:vehicles(id,rego,make_model), service:services(id,name,price_from)"
      )
      .eq("customer_id", customer.id)
      .order("requested_date", { ascending: false });

    setHistory((data as BookingWithDetails[]) ?? []);
    setLoadingHistory(false);
  }

  const visitCount = history.filter((b) => b.status === "completed").length;
  const outstanding = history
    .filter((b) => b.status === "completed" && !b.paid)
    .reduce((sum, b) => sum + (b.amount_charged ?? 0), 0);

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
      <div>
        <form onSubmit={handleSearch} className="mb-4 flex gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Name, phone, or rego"
            className="w-full rounded-lg border border-border bg-surface px-4 py-3 text-base outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
          />
          <button
            type="submit"
            disabled={searching}
            className="shrink-0 rounded-lg bg-brand px-5 py-3 font-semibold text-white transition hover:bg-brand-dark disabled:opacity-60"
          >
            Search
          </button>
        </form>

        {searched && results.length === 0 && !searching && (
          <p className="text-sm text-muted">No customers matched that.</p>
        )}

        <ul className="flex flex-col gap-2">
          {results.map((customer) => (
            <li key={customer.id}>
              <button
                onClick={() => selectCustomer(customer)}
                className={`w-full rounded-xl border px-4 py-3 text-left transition ${
                  selected?.id === customer.id
                    ? "border-brand bg-brand/5"
                    : "border-border bg-surface hover:bg-black/[0.02]"
                }`}
              >
                <p className="font-semibold">{customer.name}</p>
                <p className="text-sm text-muted">
                  {customer.phone}
                  {customer.email ? ` · ${customer.email}` : ""}
                </p>
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div>
        {!selected ? (
          <div className="flex h-full min-h-40 items-center justify-center rounded-2xl border border-dashed border-border bg-surface/50 px-6 text-center text-muted">
            Select a customer to see their history.
          </div>
        ) : (
          <div>
            <div className="mb-4 grid grid-cols-2 gap-4">
              <div className="rounded-2xl border border-border bg-surface p-5">
                <p className="text-sm font-medium text-muted">Total visits</p>
                <p className="mt-1 text-3xl font-bold">{visitCount}</p>
              </div>
              <div className="rounded-2xl border border-border bg-surface p-5">
                <p className="text-sm font-medium text-muted">
                  Outstanding balance
                </p>
                <p className="mt-1 text-3xl font-bold">
                  {formatMoney(outstanding)}
                </p>
              </div>
            </div>

            <h2 className="mb-3 text-lg font-semibold">Booking history</h2>
            {loadingHistory ? (
              <p className="text-sm text-muted">Loading…</p>
            ) : history.length === 0 ? (
              <p className="text-sm text-muted">No bookings yet.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {history.map((booking) => (
                  <li
                    key={booking.id}
                    className="flex items-center justify-between rounded-xl border border-border bg-surface px-4 py-3"
                  >
                    <div>
                      <p className="font-medium">
                        {booking.service?.name}
                        {booking.vehicle?.rego ? ` · ${booking.vehicle.rego}` : ""}
                      </p>
                      <p className="text-sm text-muted">
                        {formatDate(booking.requested_date)} at{" "}
                        {formatTime(booking.requested_time)}
                      </p>
                    </div>
                    <StatusPill status={booking.status} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
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
