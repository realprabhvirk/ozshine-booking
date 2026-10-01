"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Crown, Download, Gift, Search, Upload, UserPlus, Users } from "lucide-react";
import { cn } from "@/lib/core/cn";
import { formatCents, toCents } from "@/lib/core/money";
import { formatPhone } from "@/lib/core/phone";
import { formatDate, formatRelative, shopDateOf, todayISO } from "@/lib/core/time";
import { Button, LinkButton } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Stat } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/field";
import { DataTable, type Column } from "@/components/ui/data-table";
import { EmptyState, Spinner } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";
import { useShop } from "@/components/shop-context";
import { CustomerDialog } from "@/components/customers/customer-dialog";
import { downloadCsv } from "@/lib/csv";
import { fetchDirectory, PAGE_SIZE, type DirectoryFilter, type DirectoryRow, type DirectorySort } from "@/lib/shop/customers";

const FILTERS: Array<{ id: DirectoryFilter; label: string }> = [
  { id: "all", label: "Everyone" },
  { id: "vip", label: "VIP" },
  { id: "owing", label: "Owing money" },
  { id: "rewards", label: "Has a reward" },
  { id: "lapsed", label: "Not in 60+ days" },
  { id: "new", label: "New this month" },
  { id: "online", label: "Online account" },
];

type Props = {
  q: string;
  filter: DirectoryFilter;
  sort: DirectorySort;
  tag: string | null;
  page: number;
  rows: DirectoryRow[];
  total: number;
  stats: { total: number; vip: number; owing: number; lapsed: number };
  tags: string[];
};

export function CustomersClient({ q, filter, sort, tag, page, rows, total, stats, tags }: Props) {
  const { supabase, staff } = useShop();
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [text, setText] = useState(q);
  const [newOpen, setNewOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  function go(next: Partial<{ q: string; filter: DirectoryFilter; sort: DirectorySort; tag: string | null; page: number }>) {
    const p = new URLSearchParams();
    const v = { q, filter, sort, tag, page: 0, ...next };
    if (v.q) p.set("q", v.q);
    if (v.filter !== "all") p.set("filter", v.filter);
    if (v.sort !== "recent") p.set("sort", v.sort);
    if (v.tag) p.set("tag", v.tag);
    if (v.page) p.set("page", String(v.page));
    startTransition(() => router.replace(`/customers${p.size ? `?${p}` : ""}`, { scroll: false }));
  }

  // Search as you type (debounced).
  useEffect(() => {
    if (text === q) return;
    const t = window.setTimeout(() => go({ q: text.trim() }), 350);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  async function exportCsv() {
    setExporting(true);
    try {
      const all: DirectoryRow[] = [];
      for (let p = 0; p < 200; p++) {
        const r = await fetchDirectory(supabase, { q, filter, sort, tag, page: p, pageSize: 500 });
        all.push(...r.rows);
        if (r.rows.length < 500) break;
      }
      downloadCsv(`ozshine-customers-${todayISO()}.csv`, [
        ["Name", "Phone", "Email", "Regos", "Tags", "VIP", "Marketing OK", "Visits", "Lifetime spend", "Last visit", "Owing", "Customer since"],
        ...all.map((c) => [
          c.name,
          c.phone ?? "",
          c.email ?? "",
          c.regos.join(" "),
          c.tags.join(" "),
          c.is_vip ? "yes" : "",
          c.marketing_opt_in ? "yes" : "no",
          c.visit_count,
          (toCents(c.lifetime_spend) / 100).toFixed(2),
          c.last_visit_at ? shopDateOf(c.last_visit_at) : "",
          (toCents(c.outstanding_balance) / 100).toFixed(2),
          shopDateOf(c.created_at),
        ]),
      ]);
      toast.success("Export ready", `${all.length} customers`);
    } catch (e) {
      toast.error(e, "Export failed");
    } finally {
      setExporting(false);
    }
  }

  const columns: Column<DirectoryRow>[] = [
    {
      key: "name",
      header: "Customer",
      cell: (c) => (
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 font-semibold">
            {c.is_vip && <Crown size={15} className="shrink-0 text-warn" aria-label="VIP" />}
            <span className="truncate">{c.name}</span>
          </p>
          {c.tags.length > 0 && (
            <p className="mt-0.5 flex flex-wrap gap-1">
              {c.tags.slice(0, 3).map((t) => (
                <span key={t} className="rounded-md bg-raised px-1.5 py-0.5 text-[11px] font-semibold text-fg-muted ring-1 ring-line">
                  {t}
                </span>
              ))}
            </p>
          )}
        </div>
      ),
    },
    { key: "phone", header: "Mobile", cell: (c) => <span className="tabular-nums">{formatPhone(c.phone) || "—"}</span>, hideBelow: "sm" },
    { key: "regos", header: "Cars", cell: (c) => <span className="font-mono text-sm">{c.regos.slice(0, 2).join(", ") || "—"}{c.regos.length > 2 ? ` +${c.regos.length - 2}` : ""}</span>, hideBelow: "md" },
    { key: "visits", header: "Visits", align: "right", className: "tabular-nums", cell: (c) => c.visit_count },
    { key: "last", header: "Last visit", cell: (c) => (c.last_visit_at ? <span title={formatDate(shopDateOf(c.last_visit_at), "medium")}>{formatRelative(c.last_visit_at)}</span> : <span className="text-fg-faint">Never</span>), hideBelow: "lg" },
    { key: "spend", header: "Spent", align: "right", className: "tabular-nums", cell: (c) => formatCents(toCents(c.lifetime_spend), { whole: true }), hideBelow: "md" },
    {
      key: "flags",
      header: "",
      cell: (c) => (
        <div className="flex flex-wrap justify-end gap-1">
          {toCents(c.outstanding_balance) > 0 && <Badge tone="warn">Owes {formatCents(toCents(c.outstanding_balance))}</Badge>}
          {c.unused_rewards > 0 && (
            <Badge tone="ok">
              <Gift size={12} aria-hidden /> {c.unused_rewards}
            </Badge>
          )}
        </div>
      ),
      align: "right",
    },
  ];

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  return (
    <div className="mx-auto max-w-[1400px] space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight">Customers</h1>
        <div className="flex flex-wrap gap-2">
          {staff.role === "admin" && (
            <LinkButton href="/customers/import" icon={Upload}>
              Import
            </LinkButton>
          )}
          <Button icon={Download} loading={exporting} onClick={exportCsv}>
            Export
          </Button>
          <Button variant="primary" icon={UserPlus} onClick={() => setNewOpen(true)}>
            New customer
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 @3xl:grid-cols-4">
        <Stat label="Customers" value={stats.total.toLocaleString("en-AU")} icon={<Users size={18} />} />
        <Stat label="VIP" value={stats.vip} />
        <Stat label="Owing money" value={stats.owing} />
        <Stat label="Not in 60+ days" value={stats.lapsed} sub="Worth a win-back message" />
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="relative min-w-60 flex-1">
          <Search size={18} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-fg-faint" aria-hidden />
          <Input aria-label="Search customers" placeholder="Name, mobile, email or rego…" value={text} onChange={(e) => setText(e.target.value)} className="pl-10" />
          {pending && <Spinner size={16} className="absolute top-1/2 right-3.5 -translate-y-1/2" />}
        </div>
        {tags.length > 0 && (
          <div className="w-44">
            <Select aria-label="Tag" value={tag ?? ""} onChange={(e) => go({ tag: e.target.value || null })}>
              <option value="">Any tag</option>
              {tags.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </Select>
          </div>
        )}
        <div className="w-44">
          <Select aria-label="Sort" value={sort} onChange={(e) => go({ sort: e.target.value as DirectorySort })}>
            <option value="recent">Recent visit</option>
            <option value="name">Name A–Z</option>
            <option value="visits">Most visits</option>
            <option value="spend">Top spenders</option>
          </Select>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Button key={f.id} size="sm" variant={filter === f.id ? "primary" : "secondary"} onClick={() => go({ filter: f.id })}>
            {f.label}
          </Button>
        ))}
      </div>

      <div className={cn("transition-opacity", pending && "opacity-60")}>
        <DataTable
          caption="Customers"
          columns={columns}
          rows={rows}
          rowKey={(c) => c.id}
          onRowClick={(c) => router.push(`/customers/${c.id}`)}
          rowLabel={(c) => `Open ${c.name}`}
          empty={
            <EmptyState
              icon={Users}
              title={q || filter !== "all" || tag ? "No matching customers" : "No customers yet"}
              description={q ? "Check the spelling, or search by mobile or rego." : "Add one, or import your existing list."}
              action={<Button icon={UserPlus} onClick={() => setNewOpen(true)}>New customer</Button>}
            />
          }
        />
      </div>

      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-fg-muted">
            {page * PAGE_SIZE + 1}–{Math.min(total, (page + 1) * PAGE_SIZE)} of {total.toLocaleString("en-AU")}
          </p>
          <div className="flex gap-2">
            <Button size="icon" icon={ChevronLeft} aria-label="Previous page" disabled={page === 0} onClick={() => go({ page: page - 1 })} />
            <Button size="icon" icon={ChevronRight} aria-label="Next page" disabled={page + 1 >= pages} onClick={() => go({ page: page + 1 })} />
          </div>
        </div>
      )}

      <CustomerDialog key={newOpen ? "open" : "closed"} open={newOpen} onClose={() => setNewOpen(false)} />
    </div>
  );
}
