"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { formatDateFull, formatMoney, formatTime } from "@/lib/format";
import type { BookingWithInvoiceDetails } from "@/lib/supabase/types";

export function InvoiceView({
  booking: initialBooking,
}: {
  booking: BookingWithInvoiceDetails;
}) {
  const [supabase] = useState(() => createClient());
  const [booking, setBooking] = useState(initialBooking);
  const [amountInput, setAmountInput] = useState(
    String(booking.amount_charged ?? "")
  );
  const [editingAmount, setEditingAmount] = useState(false);
  const [saving, setSaving] = useState(false);

  async function saveAmount() {
    const parsed = Number(amountInput);
    if (!amountInput || Number.isNaN(parsed) || parsed < 0) {
      alert("Enter a valid amount.");
      return;
    }

    setSaving(true);
    const { error } = await supabase
      .from("bookings")
      .update({ amount_charged: parsed })
      .eq("id", booking.id);
    setSaving(false);

    if (error) {
      alert(`Couldn't update the amount: ${error.message}`);
      return;
    }

    setBooking((prev) => ({ ...prev, amount_charged: parsed }));
    setEditingAmount(false);
  }

  async function togglePaid() {
    const nextPaid = !booking.paid;
    setSaving(true);
    const { error } = await supabase
      .from("bookings")
      .update({
        paid: nextPaid,
        paid_at: nextPaid ? new Date().toISOString() : null,
      })
      .eq("id", booking.id);
    setSaving(false);

    if (error) {
      alert(`Couldn't update paid status: ${error.message}`);
      return;
    }

    setBooking((prev) => ({
      ...prev,
      paid: nextPaid,
      paid_at: nextPaid ? new Date().toISOString() : null,
    }));
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
            <p className="text-xl font-bold tracking-tight">
              Oz<span className="text-brand">Shine</span>
            </p>
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
                  {editingAmount ? (
                    <span className="inline-flex items-center gap-2 print:hidden">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        autoFocus
                        value={amountInput}
                        onChange={(e) => setAmountInput(e.target.value)}
                        className="w-24 rounded-lg border border-border px-2 py-1 text-right outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
                      />
                      <button
                        onClick={saveAmount}
                        disabled={saving}
                        className="rounded-lg bg-brand px-3 py-1 text-xs font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
                      >
                        Save
                      </button>
                    </span>
                  ) : (
                    <button
                      onClick={() => setEditingAmount(true)}
                      className="underline decoration-dotted underline-offset-4 print:no-underline"
                    >
                      {formatMoney(booking.amount_charged)}
                    </button>
                  )}
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
          <button
            onClick={togglePaid}
            disabled={saving}
            className="rounded-lg border border-border px-5 py-2.5 text-sm font-semibold text-foreground transition hover:bg-black/[0.03] disabled:opacity-50 print:hidden"
          >
            Mark as {booking.paid ? "Unpaid" : "Paid"}
          </button>
        </div>
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
