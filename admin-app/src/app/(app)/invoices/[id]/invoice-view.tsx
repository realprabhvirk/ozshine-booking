"use client";

import Image from "next/image";
import logo from "@/assets/oz-shine-logo.png";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { issueInvoice } from "@/lib/shop/actions";
import { errorMessage } from "@/lib/core/errors";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { formatDateFull, formatMoney, formatTime } from "@/lib/format";
import type { BookingWithInvoiceDetails } from "@/lib/supabase/types";

// Read-only view of a job finished before the V2 upgrade (it has no V2
// invoice). Money changes happen on a real invoice: "Create invoice" turns the
// job into one, which keeps the audit trail and works after hardening.
export function InvoiceView({
  booking,
}: {
  booking: BookingWithInvoiceDetails;
}) {
  const [supabase] = useState(() => createClient());
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function createInvoice() {
    setSaving(true);
    setError(null);
    try {
      const id = await issueInvoice(supabase, booking.id);
      router.push(`/invoices/${id}`);
    } catch (e) {
      setError(errorMessage(e));
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6 flex items-center justify-between print:hidden">
        <Link href="/history" className="text-sm font-medium text-muted hover:text-foreground">
          ← Back to order history
        </Link>
        <button
          onClick={() => window.print()}
          className="rounded-lg bg-brand px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-dark"
        >
          Print
        </button>
      </div>

      <div className="rounded-2xl border border-border bg-surface p-8 shadow-sm shadow-black/[0.03] print:border-0 print:shadow-none">
        <div className="mb-8 flex items-start justify-between border-b border-border pb-6">
          <div>
            <Image src={logo} alt="OzShine" className="mb-1 h-9 w-auto" />
            <p className="text-sm text-muted">{booking.location?.name}</p>
            {booking.location?.address && (
              <p className="text-sm text-muted">{booking.location.address}</p>
            )}
          </div>
          <div className="text-right">
            <p className="text-sm font-semibold uppercase tracking-wide text-muted">
              Invoice
            </p>
            <p className="text-sm text-muted">
              {formatDateFull(booking.requested_date)}
            </p>
            <StatusBadge status={booking.status} />
          </div>
        </div>

        <div className="mb-8 grid grid-cols-2 gap-6">
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">
              Customer
            </p>
            <p className="font-medium">{booking.customer?.name}</p>
            <p className="text-sm text-muted">{booking.customer?.phone}</p>
          </div>
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">
              Vehicle
            </p>
            <p className="font-medium">{booking.vehicle?.rego ?? "—"}</p>
            {booking.vehicle?.make_model && (
              <p className="text-sm text-muted">{booking.vehicle.make_model}</p>
            )}
          </div>
        </div>

        <div className="mb-8 overflow-hidden rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-black/[0.02] text-left text-xs font-semibold uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-3">Service</th>
                <th className="px-4 py-3">Time</th>
                <th className="px-4 py-3 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="px-4 py-4 font-medium">{booking.service?.name}</td>
                <td className="px-4 py-4 text-muted">
                  {formatTime(booking.requested_time)}
                </td>
                <td className="px-4 py-4 text-right font-semibold">
                  {formatMoney(booking.amount_charged)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="mb-8 flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">
              Processed by
            </p>
            <p className="font-medium">{booking.processed_by?.name ?? "—"}</p>
          </div>
          <div className="text-right">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">
              Total
            </p>
            <p className="text-2xl font-bold">
              {formatMoney(booking.amount_charged)}
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-border pt-6">
          <span
            className={`rounded-full px-4 py-2 text-sm font-bold ${
              booking.paid
                ? "bg-green-100 text-green-800"
                : "bg-amber-100 text-amber-800"
            }`}
          >
            {booking.paid ? "Paid" : "Unpaid"}
          </span>
          {!booking.paid && booking.status === "completed" && (
            <button
              onClick={createInvoice}
              disabled={saving}
              className="rounded-lg bg-brand px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-dark disabled:opacity-50 print:hidden"
            >
              {saving ? "Creating…" : "Create invoice to take payment"}
            </button>
          )}
        </div>
        {error && <p className="mt-3 text-sm text-red-700 print:hidden">{error}</p>}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className="mt-1 inline-block rounded-full bg-black/5 px-3 py-1 text-xs font-semibold capitalize text-foreground">
      {status}
    </span>
  );
}
