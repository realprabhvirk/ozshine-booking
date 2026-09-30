"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { History as HistoryIcon, Search } from "lucide-react";
import { formatCents, toCents } from "@/lib/core/money";
import { normalizeRego } from "@/lib/core/phone";
import { BOOKING_STATUS_META, BOOKING_SOURCE_LABELS, type BookingStatus } from "@/lib/core/status";
import { addDaysISO, formatDate, formatTime, todayISO } from "@/lib/core/time";
import { Button } from "@/components/ui/button";
import { InvoiceBadge, StatusBadge } from "@/components/ui/badge";
import { Input, Select } from "@/components/ui/field";
import { DataTable, type Column } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/feedback";
import { useShop } from "@/components/shop-context";
import { customerLabel } from "@/components/booking/booking-card";
import { fetchRange } from "@/lib/shop/queries";
import { useLiveData } from "@/lib/shop/hooks";
import { useBookingPanel } from "@/lib/shop/use-booking-panel";
import { liveInvoice, type BoardBooking } from "@/lib/shop/types";

type Filter = "all" | "completed" | "upcoming" | "cancelled";

export function HistoryClient({ from, to, initial }: { from: string; to: string; initial: BoardBooking[] }) {
  const { supabase, staff } = useShop();
  const router = useRouter();
  const panel = useBookingPanel();
  const load = useCallback(() => fetchRange(supabase, from, to, { includeCancelled: true }), [supabase, from, to]);
  const { data: rows } = useLiveData({ supabase, locationId: staff.location_id, initial, load, channel: `history-${from}` });
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    const rego = normalizeRego(q);
    const digits = q.replace(/\D/g, "");
    const cancelled: BookingStatus[] = ["cancelled", "declined", "no_show"];
    return [...rows]
      .filter((b) => {
        if (filter === "completed" && b.status !== "completed") return false;
        if (filter === "cancelled" && !cancelled.includes(b.status)) return false;
        if (filter === "upcoming" && (b.status === "completed" || cancelled.includes(b.status))) return false;
        if (!term) return true;
        return (
          customerLabel(b).toLowerCase().includes(term) ||
          b.reference_code.toLowerCase().includes(term) ||
          (b.service?.name ?? "").toLowerCase().includes(term) ||
          (!!rego && (b.vehicle?.rego ?? "").includes(rego)) ||
          (digits.length >= 3 && (b.customer?.phone ?? "").includes(digits)) ||
          (liveInvoice(b)?.number ?? "").toLowerCase().includes(term)
        );
      })
      .sort((a, b) => b.starts_at.localeCompare(a.starts_at));
  }, [rows, q, filter]);

  const columns: Column<BoardBooking>[] = [
    { key: "when", header: "When", cell: (b) => <span className="tabular-nums">{formatDate(b.requested_date, "medium")} <span className="text-fg-muted">{formatTime(b.requested_time)}</span></span>, sortValue: (b) => b.starts_at },
    { key: "customer", header: "Customer", cell: (b) => customerLabel(b), sortValue: (b) => customerLabel(b) },
    { key: "rego", header: "Rego", cell: (b) => <span className="font-mono">{b.vehicle?.rego ?? "—"}</span>, hideBelow: "md" },
    { key: "service", header: "Service", cell: (b) => b.service?.name ?? "—", hideBelow: "lg" },
    { key: "source", header: "From", cell: (b) => BOOKING_SOURCE_LABELS[b.source], hideBelow: "lg" },
    { key: "status", header: "Status", cell: (b) => <StatusBadge status={b.status} />, sortValue: (b) => BOOKING_STATUS_META[b.status].label },
    {
      key: "invoice",
      header: "Invoice",
      cell: (b) => {
        const inv = liveInvoice(b);
        if (inv) {
          return (
            <Link href={`/invoices/${inv.id}`} onClick={(e) => e.stopPropagation()} className="inline-flex items-center gap-2 hover:underline">
              <span className="font-mono text-sm">{inv.number}</span>
              <InvoiceBadge status={inv.status} />
            </Link>
          );
        }
        // Jobs finished in the old system: show the old invoice page.
        if (b.status === "completed") {
          return (
            <Link href={`/invoices/${b.id}`} onClick={(e) => e.stopPropagation()} className="text-sm text-accent-ink hover:underline">
              Old invoice
            </Link>
          );
        }
        return <span className="text-fg-faint">—</span>;
      },
      hideBelow: "sm",
    },
    { key: "total", header: "Total", align: "right", className: "tabular-nums", cell: (b) => formatCents(toCents(liveInvoice(b)?.total ?? b.price_estimate)), sortValue: (b) => toCents(liveInvoice(b)?.total ?? b.price_estimate) },
  ];

  return (
    <div className="mx-auto max-w-[1400px] space-y-5">
      <h1 className="text-2xl font-bold tracking-tight">History</h1>
      <div className="flex flex-wrap items-center gap-2">
        {[
          { label: "7 days", days: 6 },
          { label: "30 days", days: 30 },
          { label: "90 days", days: 90 },
          { label: "1 year", days: 365 },
        ].map((r) => (
          <Button
            key={r.label}
            size="sm"
            variant={from === addDaysISO(to, -r.days) && to === todayISO() ? "primary" : "secondary"}
            onClick={() => router.push(`/history?from=${addDaysISO(todayISO(), -r.days)}&to=${todayISO()}`)}
          >
            {r.label}
          </Button>
        ))}
        <div className="w-40">
          <Input type="date" aria-label="From" value={from} max={to} onChange={(e) => e.target.value && router.push(`/history?from=${e.target.value}&to=${to}`)} />
        </div>
        <span className="text-fg-muted">to</span>
        <div className="w-40">
          <Input type="date" aria-label="To" value={to} min={from} onChange={(e) => e.target.value && router.push(`/history?from=${from}&to=${e.target.value}`)} />
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <div className="relative min-w-60 flex-1">
          <Search size={18} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-fg-faint" aria-hidden />
          <Input aria-label="Search history" placeholder="Name, rego, phone, booking ref, invoice…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-10" />
        </div>
        <div className="w-44">
          <Select aria-label="Status" value={filter} onChange={(e) => setFilter(e.target.value as Filter)}>
            <option value="all">All jobs</option>
            <option value="completed">Completed</option>
            <option value="upcoming">Not finished</option>
            <option value="cancelled">Cancelled / declined</option>
          </Select>
        </div>
      </div>
      <p className="text-sm text-fg-muted">
        {filtered.length} job{filtered.length === 1 ? "" : "s"} · {formatDate(from, "medium")} – {formatDate(to, "medium")}
      </p>
      <DataTable
        caption="Job history"
        columns={columns}
        rows={filtered}
        rowKey={(b) => b.id}
        onRowClick={(b) => panel.open(b.id)}
        rowLabel={(b) => `Open booking ${b.reference_code}`}
        empty={<EmptyState icon={HistoryIcon} title="No jobs" description="Try a wider date range or clear the search." />}
      />
    </div>
  );
}
