"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, Search } from "lucide-react";
import { formatCents, sumCents, toCents } from "@/lib/core/money";
import { INVOICE_STATUS_META, type InvoiceStatus } from "@/lib/core/status";
import { addDaysISO, formatDate, shopDateOf, todayISO } from "@/lib/core/time";
import { normalizeRego } from "@/lib/core/phone";
import { Stat } from "@/components/ui/card";
import { InvoiceBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/field";
import { DataTable, type Column } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/feedback";
import { useShop } from "@/components/shop-context";
import { useLiveData } from "@/lib/shop/hooks";
import { fetchInvoices, type InvoiceListRow } from "@/lib/shop/money";

type StatusFilter = "all" | "owing" | "paid" | "void";

const RANGES: Array<{ label: string; days: number }> = [
  { label: "Today", days: 0 },
  { label: "7 days", days: 6 },
  { label: "30 days", days: 30 },
  { label: "90 days", days: 90 },
];

function customerName(r: InvoiceListRow) {
  return !r.customer || r.customer.is_walkin_placeholder ? "Walk-in" : r.customer.name;
}

export function InvoicesClient({ from, to, initial }: { from: string; to: string; initial: InvoiceListRow[] }) {
  const { supabase, staff } = useShop();
  const router = useRouter();
  const load = useCallback(() => fetchInvoices(supabase, from, to), [supabase, from, to]);
  const { data: rows, status: live } = useLiveData({ supabase, locationId: staff.location_id, initial, load, channel: `invoices-${from}` });
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    const rego = normalizeRego(q);
    const digits = q.replace(/\D/g, "");
    return rows.filter((r) => {
      if (status === "owing" && !(r.status === "issued" || r.status === "partial")) return false;
      if (status === "paid" && r.status !== "paid") return false;
      if (status === "void" && r.status !== "void") return false;
      if (!term) return true;
      return (
        (r.number ?? "").toLowerCase().includes(term) ||
        customerName(r).toLowerCase().includes(term) ||
        (r.booking?.reference_code ?? "").toLowerCase().includes(term) ||
        (!!rego && (r.booking?.vehicle?.rego ?? "").includes(rego)) ||
        (digits.length >= 3 && (r.customer?.phone ?? "").includes(digits))
      );
    });
  }, [rows, q, status]);

  const live_ = filtered.filter((r) => r.status !== "void");
  const total = sumCents(live_.map((r) => toCents(r.total)));
  const owing = sumCents(live_.map((r) => toCents(r.balance_due)));

  function setRange(days: number) {
    const t = todayISO();
    router.push(`/money?from=${addDaysISO(t, -days)}&to=${t}`);
  }

  const columns: Column<InvoiceListRow>[] = [
    { key: "number", header: "Invoice", cell: (r) => <span className="font-mono font-semibold">{r.number ?? "Draft"}</span>, sortValue: (r) => r.number },
    { key: "date", header: "Date", cell: (r) => formatDate(shopDateOf(r.issued_at ?? r.created_at), "medium"), sortValue: (r) => r.issued_at ?? r.created_at },
    { key: "customer", header: "Customer", cell: (r) => customerName(r), sortValue: (r) => customerName(r) },
    { key: "rego", header: "Rego", cell: (r) => <span className="font-mono">{r.booking?.vehicle?.rego ?? "—"}</span>, hideBelow: "md" },
    { key: "service", header: "Service", cell: (r) => r.booking?.service?.name ?? "—", hideBelow: "lg" },
    { key: "total", header: "Total", align: "right", className: "tabular-nums", cell: (r) => formatCents(toCents(r.total)), sortValue: (r) => toCents(r.total) },
    { key: "owing", header: "Owing", align: "right", className: "tabular-nums", cell: (r) => (toCents(r.balance_due) > 0 ? <span className="font-semibold text-warn-ink">{formatCents(toCents(r.balance_due))}</span> : "—"), sortValue: (r) => toCents(r.balance_due), hideBelow: "sm" },
    { key: "status", header: "Status", cell: (r) => <InvoiceBadge status={r.status} />, sortValue: (r) => INVOICE_STATUS_META[r.status as InvoiceStatus].label },
  ];

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 @3xl:grid-cols-4">
        <Stat label="Invoices" value={live_.length} sub={`${formatDate(from, "medium")} – ${formatDate(to, "medium")}`} />
        <Stat label="Invoiced" value={formatCents(total)} sub="Incl. GST, excl. voids" />
        <Stat label="Still owing" value={formatCents(owing)} sub={`${live_.filter((r) => toCents(r.balance_due) > 0).length} invoices`} />
        <Stat label="Average invoice" value={live_.length ? formatCents(Math.round(total / live_.length)) : "—"} sub={live === "live" ? "Updates live" : "Updates every 15s"} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {RANGES.map((r) => {
          const on = from === addDaysISO(to, -r.days) && to === todayISO();
          return (
            <Button key={r.label} size="sm" variant={on ? "primary" : "secondary"} onClick={() => setRange(r.days)}>
              {r.label}
            </Button>
          );
        })}
        <div className="w-40">
          <Input type="date" aria-label="From" value={from} max={to} onChange={(e) => e.target.value && router.push(`/money?from=${e.target.value}&to=${to}`)} />
        </div>
        <span className="text-fg-muted">to</span>
        <div className="w-40">
          <Input type="date" aria-label="To" value={to} min={from} onChange={(e) => e.target.value && router.push(`/money?from=${from}&to=${e.target.value}`)} />
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="relative min-w-60 flex-1">
          <Search size={18} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-fg-faint" aria-hidden />
          <Input aria-label="Search invoices" placeholder="Invoice number, name, rego, phone…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-10" />
        </div>
        <div className="w-44">
          <Select aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value as StatusFilter)}>
            <option value="all">All</option>
            <option value="owing">Owing</option>
            <option value="paid">Paid</option>
            <option value="void">Void</option>
          </Select>
        </div>
      </div>

      <DataTable
        caption="Invoices"
        columns={columns}
        rows={filtered}
        rowKey={(r) => r.id}
        onRowClick={(r) => router.push(`/invoices/${r.id}`)}
        rowLabel={(r) => `Open invoice ${r.number ?? ""}`}
        empty={<EmptyState icon={FileText} title="No invoices" description="Try a wider date range, or clear the search." />}
      />
    </div>
  );
}
