"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatDate, formatMoney, formatTime } from "@/lib/format";
import type { Customer, BookingWithDetails } from "@/lib/supabase/types";

export function CustomerLookup() {
  const [supabase] = useState(() => createClient());
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [results, setResults] = useState<Customer[]>([]);
  const [searched, setSearched] = useState(false);
  const [selected, setSelected] = useState<Customer | null>(null);
  const [history, setHistory] = useState<BookingWithDetails[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);

  const [showNewCustomer, setShowNewCustomer] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;

    setSearching(true);
    setSearchError(null);
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

    if (byNameOrPhone.error || byRego.error) {
      setSearchError(
        `Search failed: ${byNameOrPhone.error?.message ?? byRego.error?.message}`
      );
      setResults([]);
      setSearching(false);
      return;
    }

    const matches = new Map<string, Customer>();
    for (const c of byNameOrPhone.data ?? []) matches.set(c.id, c);

    const regoCustomerIds = (byRego.data ?? []).map((v) => v.customer_id);
    if (regoCustomerIds.length > 0) {
      const { data: viaRego, error: viaRegoError } = await supabase
        .from("customers")
        .select("*")
        .in("id", regoCustomerIds);

      if (viaRegoError) {
        setSearchError(`Search failed: ${viaRegoError.message}`);
        setSearching(false);
        return;
      }
      for (const c of viaRego ?? []) matches.set(c.id, c);
    }

    setResults(Array.from(matches.values()));
    setSearching(false);
  }

  async function selectCustomer(customer: Customer) {
    setSelected(customer);
    setShowNewCustomer(false);
    setLoadingHistory(true);
    setHistoryError(null);

    const { data, error } = await supabase
      .from("bookings")
      .select(
        "*, vehicle:vehicles(id,rego,make_model), service:services(id,name,price_from)"
      )
      .eq("customer_id", customer.id)
      .order("requested_date", { ascending: false });

    if (error) {
      setHistoryError(`Couldn't load booking history: ${error.message}`);
    }
    setHistory((data as BookingWithDetails[]) ?? []);
    setLoadingHistory(false);
  }

  async function handleCreateCustomer(e: React.FormEvent) {
    e.preventDefault();
    setCreateError(null);

    if (!newName.trim() || !newPhone.trim()) {
      setCreateError("Name and phone are required.");
      return;
    }

    setCreating(true);

    const { data, error } = await supabase
      .from("customers")
      .insert({
        name: newName.trim(),
        phone: newPhone.trim(),
        email: newEmail.trim() || null,
      })
      .select("*")
      .single();

    setCreating(false);

    if (error || !data) {
      setCreateError(
        error?.code === "23505"
          ? "A customer with that phone number already exists — try searching for them instead."
          : `Couldn't create that customer: ${error?.message ?? "unknown error"}`
      );
      return;
    }

    setNewName("");
    setNewPhone("");
    setNewEmail("");
    setShowNewCustomer(false);
    setResults((prev) => [data as Customer, ...prev]);
    setSearched(true);
    selectCustomer(data as Customer);
  }

  const visitCount = history.filter((b) => b.status === "completed").length;
  const outstanding = history
    .filter((b) => b.status === "completed" && !b.paid)
    .reduce((sum, b) => sum + (b.amount_charged ?? 0), 0);

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
      <div>
        <form onSubmit={handleSearch} className="mb-3 flex gap-2">
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

        <button
          onClick={() => {
            setShowNewCustomer((v) => !v);
            setSelected(null);
          }}
          className="mb-4 w-full rounded-lg border border-dashed border-border px-4 py-2.5 text-sm font-semibold text-muted transition hover:border-brand hover:text-brand"
        >
          {showNewCustomer ? "Cancel" : "+ New Customer"}
        </button>

        {showNewCustomer && (
          <form
            onSubmit={handleCreateCustomer}
            className="mb-4 rounded-xl border border-border bg-surface p-4"
          >
            {createError && (
              <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-brand-dark">
                {createError}
              </p>
            )}
            <div className="flex flex-col gap-3">
              <label className="block">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">
                  Name *
                </span>
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">
                  Phone *
                </span>
                <input
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                  className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">
                  Email (optional)
                </span>
                <input
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
                />
              </label>
              <button
                type="submit"
                disabled={creating}
                className="rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-dark disabled:opacity-60"
              >
                {creating ? "Creating…" : "Create Customer"}
              </button>
            </div>
          </form>
        )}

        {searchError && (
          <p className="mb-3 rounded-lg bg-red-50 px-4 py-3 text-sm text-brand-dark">
            {searchError}
          </p>
        )}

        {searched && !searching && !searchError && results.length === 0 && (
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
            {historyError && (
              <p className="mb-3 rounded-lg bg-red-50 px-4 py-3 text-sm text-brand-dark">
                {historyError}
              </p>
            )}
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
