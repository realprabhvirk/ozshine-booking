"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useStaff } from "@/components/staff-context";
import { formatDate, formatMoney, formatTime, isoDateDaysAgo, todayISODate } from "@/lib/format";
import type { BookingWithDetails } from "@/lib/supabase/types";

const HISTORY_SELECT =
  "*, customer:customers(id,name,phone,email), vehicle:vehicles(id,rego,make_model), service:services(id,name,price_from), processed_by:staff(id,name)";

export function HistoryTable() {
  const staff = useStaff();
  const [supabase] = useState(() => createClient());

  const [dateFrom, setDateFrom] = useState(isoDateDaysAgo(30));
  const [dateTo, setDateTo] = useState(todayISODate());
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<BookingWithDetails[]>([]);

  async function runSearch() {
    setLoading(true);

    const { data } = await supabase
      .from("bookings")
      .select(HISTORY_SELECT)
      .eq("location_id", staff.location_id)
      .neq("status", "pending")
      .gte("requested_date", dateFrom)
      .lte("requested_date", dateTo)
      .order("requested_date", { ascending: false })
      .order("requested_time", { ascending: false })
      .limit(200);

    setRows((data as BookingWithDetails[]) ?? []);
    setLoading(false);
  }

  // Load the default 30-day window on first render; further searches are
  // triggered explicitly by the Search button below. runSearch's own
  // setState calls are intentional here (a real fetch-on-mount), not the
  // cascading-render pattern this pair of rules normally catches.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    runSearch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const q = query.trim().toLowerCase();
  const filteredRows = q
    ? rows.filter(
        (b) =>
          b.customer?.name?.toLowerCase().includes(q) ||
          b.customer?.phone?.toLowerCase().includes(q) ||
          b.vehicle?.rego?.toLowerCase().includes(q)
      )
    : rows;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end gap-3 rounded-2xl border border-border bg-surface p-4">
        <label className="flex-1 basis-40">
          <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted">
            From
          </span>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
          />
        </label>
        <label className="flex-1 basis-40">
          <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted">
            To
          </span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
          />
        </label>
        <label className="flex-[2] basis-56">
          <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted">
            Name, phone, or rego
          </span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter loaded results…"
            className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
          />
        </label>
        <button
          onClick={runSearch}
          disabled={loading}
          className="rounded-lg bg-brand px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-dark disabled:opacity-60"
        >
          {loading ? "Loading…" : "Search"}
        </button>
      </div>

      {filteredRows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-surface/50 px-6 py-16 text-center text-muted">
          {loading ? "Loading…" : "No bookings match this filter."}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border bg-surface">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-black/[0.02] text-xs font-semibold uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Rego</th>
                <th className="px-4 py-3">Service</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Amount</th>
                <th className="px-4 py-3">Processed by</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredRows.map((booking) => (
                <tr key={booking.id}>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {formatDate(booking.requested_date)}
                    <span className="block text-xs text-muted">
                      {formatTime(booking.requested_time)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-medium">{booking.customer?.name}</span>
                    <span className="block text-xs text-muted">
                      {booking.customer?.phone}
                    </span>
                  </td>
                  <td className="px-4 py-3">{booking.vehicle?.rego ?? "—"}</td>
                  <td className="px-4 py-3">{booking.service?.name}</td>
                  <td className="px-4 py-3">
                    <StatusPill status={booking.status} paid={booking.paid} />
                  </td>
                  <td className="px-4 py-3">{formatMoney(booking.amount_charged)}</td>
                  <td className="px-4 py-3">{booking.processed_by?.name ?? "—"}</td>
                  <td className="px-4 py-3 text-right">
                    {booking.status === "completed" && (
                      <Link
                        href={`/invoices/${booking.id}`}
                        className="font-semibold text-brand hover:underline"
                      >
                        View Invoice
                      </Link>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function StatusPill({ status, paid }: { status: string; paid: boolean }) {
  if (status === "completed") {
    return (
      <span
        className={`rounded-full px-3 py-1 text-xs font-semibold ${
          paid ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"
        }`}
      >
        {paid ? "Paid" : "Unpaid"}
      </span>
    );
  }

  const styles: Record<string, string> = {
    approved: "bg-blue-100 text-blue-800",
    declined: "bg-zinc-200 text-zinc-600",
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
