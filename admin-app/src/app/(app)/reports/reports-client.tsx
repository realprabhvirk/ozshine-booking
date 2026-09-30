"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Download, Star, Table2, BarChart3 } from "lucide-react";
import { cn } from "@/lib/core/cn";
import { formatCents, toCents } from "@/lib/core/money";
import { BOOKING_SOURCE_LABELS, PAYMENT_METHOD_LABELS, VEHICLE_TYPE_LABELS } from "@/lib/core/status";
import { addDaysISO, formatDate, todayISO } from "@/lib/core/time";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, Stat } from "@/components/ui/card";
import { Input } from "@/components/ui/field";
import { Tabs } from "@/components/ui/tabs";
import { ColumnChart } from "@/components/charts/column-chart";
import { BarList } from "@/components/charts/bar-list";
import { Heatmap } from "@/components/charts/heatmap";
import { downloadCsv } from "@/lib/csv";
import type { ReportData } from "@/lib/shop/reports";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function presets(today: string) {
  const [y, m] = today.split("-").map(Number);
  const monthStart = `${y}-${String(m).padStart(2, "0")}-01`;
  const lastMonthEnd = addDaysISO(monthStart, -1);
  const lastMonthStart = `${lastMonthEnd.slice(0, 7)}-01`;
  const fyStart = m >= 7 ? `${y}-07-01` : `${y - 1}-07-01`;
  return [
    { label: "7 days", from: addDaysISO(today, -6), to: today },
    { label: "30 days", from: addDaysISO(today, -29), to: today },
    { label: "90 days", from: addDaysISO(today, -89), to: today },
    { label: "This month", from: monthStart, to: today },
    { label: "Last month", from: lastMonthStart, to: lastMonthEnd },
    { label: "This financial year", from: fyStart, to: today },
    { label: "12 months", from: addDaysISO(today, -364), to: today },
  ];
}

const money = (v: number) => formatCents(Math.round(v * 100), { whole: true });
const moneyAxis = (v: number) => (v >= 1000 ? `$${(v / 1000).toLocaleString("en-AU", { maximumFractionDigits: 1 })}k` : `$${v}`);

export function ReportsClient({ from, to, data }: { from: string; to: string; data: ReportData }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [measure, setMeasure] = useState<"revenue" | "cars">("revenue");
  const [asTable, setAsTable] = useState(false);
  const o = data.overview;
  const today = todayISO();

  function go(f: string, t: string) {
    startTransition(() => router.push(`/reports?from=${f}&to=${t}`));
  }

  const series = useMemo(
    () =>
      data.series.map((p) => {
        const d = p.bucket.slice(0, 10);
        const [yy, mm, dd] = d.split("-").map(Number);
        const label = data.bucket === "month" ? `${MONTHS[mm - 1]}${mm === 1 ? ` ${String(yy).slice(2)}` : ""}` : `${dd} ${MONTHS[mm - 1]}`;
        const longLabel = data.bucket === "month" ? `${MONTHS[mm - 1]} ${yy}` : data.bucket === "week" ? `Week of ${formatDate(d, "medium")}` : formatDate(d, "long");
        return { key: d, label, longLabel, revenue: toCents(p.revenue) / 100, cars: p.cars };
      }),
    [data],
  );

  const revenue = toCents(o.revenue);
  const cancelRate = o.bookings_total ? Math.round(((o.cancellations + o.no_shows) / o.bookings_total) * 100) : 0;
  const rating = o.ratings.average === null ? null : Number(o.ratings.average);

  function exportCsv() {
    downloadCsv(`ozshine-report-${from}-to-${to}.csv`, [
      [data.bucket === "month" ? "Month" : data.bucket === "week" ? "Week starting" : "Day", "Revenue (incl. GST)", "Cars"],
      ...series.map((s) => [s.key, s.revenue.toFixed(2), s.cars]),
      [],
      ["Service", "Jobs", "Revenue"],
      ...data.services.map((s) => [s.name, s.count, (toCents(s.revenue) / 100).toFixed(2)]),
    ]);
  }

  return (
    <div className={cn("mx-auto max-w-[1500px] space-y-6 transition-opacity", pending && "opacity-60")}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight">Reports</h1>
        <Button icon={Download} onClick={exportCsv}>
          Export CSV
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {presets(today).map((p, i, all) => (
          <Button
            key={p.label}
            size="sm"
            aria-pressed={p.from === from && p.to === to}
            // Only the first matching preset lights up (e.g. "30 days" and "This month" can be the same range).
            variant={all.findIndex((q) => q.from === from && q.to === to) === i ? "primary" : "secondary"} onClick={() => go(p.from, p.to)}>
            {p.label}
          </Button>
        ))}
        <div className="w-40">
          <Input type="date" aria-label="From" value={from} max={to} onChange={(e) => e.target.value && go(e.target.value, to)} />
        </div>
        <span className="text-fg-muted">to</span>
        <div className="w-40">
          <Input type="date" aria-label="To" value={to} min={from} max={today} onChange={(e) => e.target.value && go(from, e.target.value)} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 @3xl:grid-cols-3 @6xl:grid-cols-6">
        <Stat label="Revenue" value={formatCents(revenue, { whole: true })} sub="Completed jobs, incl. GST" />
        <Stat label="Cars" value={o.cars.toLocaleString("en-AU")} sub={`${formatDate(from, "medium")} – ${formatDate(to, "medium")}`} />
        <Stat label="Average job" value={formatCents(toCents(o.avg_ticket))} />
        <Stat label="Customers" value={o.customers} sub={`${o.new_customers} new · ${o.repeat_customers} came back`} />
        <Stat label="Cancelled / no-show" value={`${cancelRate}%`} sub={`${o.cancellations} cancelled · ${o.no_shows} no-show`} />
        <Stat label="Rating" value={rating === null ? "—" : rating.toFixed(1)} sub={`${o.ratings.count} review${o.ratings.count === 1 ? "" : "s"}`} icon={<Star size={18} />} />
      </div>

      <Card>
        <CardHeader
          title={measure === "revenue" ? "Revenue over time" : "Cars over time"}
          description={`By ${data.bucket}, incl. GST, by day completed`}
          action={
            <>
              <Tabs
                label="Measure"
                idPrefix="measure"
                value={measure}
                onChange={setMeasure}
                tabs={[
                  { id: "revenue", label: "Revenue" },
                  { id: "cars", label: "Cars" },
                ]}
              />
              <Button size="icon-sm" variant="ghost" icon={asTable ? BarChart3 : Table2} aria-label={asTable ? "Show chart" : "Show as table"} onClick={() => setAsTable((v) => !v)} />
            </>
          }
        />
        <CardBody>
          {asTable ? (
            <div className="max-h-80 overflow-y-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-fg-muted uppercase">
                    <th className="py-2">Period</th>
                    <th className="py-2 text-right">Revenue</th>
                    <th className="py-2 text-right">Cars</th>
                  </tr>
                </thead>
                <tbody>
                  {series.map((s) => (
                    <tr key={s.key} className="border-t border-line">
                      <td className="py-2">{s.longLabel}</td>
                      <td className="py-2 text-right tabular-nums">{money(s.revenue)}</td>
                      <td className="py-2 text-right tabular-nums">{s.cars}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <ColumnChart
              label={measure === "revenue" ? "Revenue over time" : "Cars over time"}
              data={series.map((s) => ({ key: s.key, label: s.label, longLabel: s.longLabel, value: measure === "revenue" ? s.revenue : s.cars }))}
              format={measure === "revenue" ? money : (v) => `${v} car${v === 1 ? "" : "s"}`}
              axisFormat={measure === "revenue" ? moneyAxis : (v) => String(v)}
            />
          )}
        </CardBody>
      </Card>

      <div className="grid gap-6 @4xl:grid-cols-2">
        <Card>
          <CardHeader title="Services" description="Revenue · number of jobs" />
          <CardBody>
            <BarList items={data.services.map((s) => ({ key: s.service_id, label: s.name, value: toCents(s.revenue) / 100, sub: `${s.count} job${s.count === 1 ? "" : "s"}` }))} format={money} />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Busiest times" description="Bookings by start time, Brisbane time" />
          <CardBody>
            <Heatmap cells={data.hours} />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Vehicle types" description="Revenue · jobs" />
          <CardBody>
            <BarList
              items={[...o.by_vehicle_type].sort((a, b) => toCents(b.revenue) - toCents(a.revenue)).map((v) => ({ key: v.vehicle_type, label: VEHICLE_TYPE_LABELS[v.vehicle_type] ?? v.vehicle_type, value: toCents(v.revenue) / 100, sub: `${v.count}` }))}
              format={money}
            />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="How people paid" description="Money taken in the period (after refunds)" />
          <CardBody>
            <BarList
              items={[...o.by_payment_method].sort((a, b) => toCents(b.total) - toCents(a.total)).map((p) => ({ key: p.method, label: PAYMENT_METHOD_LABELS[p.method] ?? p.method, value: toCents(p.total) / 100, sub: `${p.count}` }))}
              format={money}
            />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Extras sold" description="Revenue · times sold" />
          <CardBody>
            <BarList items={o.by_addon.map((a) => ({ key: a.name, label: a.name, value: toCents(a.revenue) / 100, sub: `${a.count}` }))} format={money} empty="No extras sold in this period." />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Where jobs came from" description="Completed jobs" />
          <CardBody>
            <BarList items={[...o.by_source].sort((a, b) => b.count - a.count).map((s) => ({ key: s.source, label: BOOKING_SOURCE_LABELS[s.source] ?? s.source, value: s.count }))} format={(v) => `${v}`} />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Loyalty" />
          <CardBody>
            <dl className="grid grid-cols-3 gap-4 text-center">
              <div>
                <dt className="text-sm text-fg-muted">Rewards earned</dt>
                <dd className="text-2xl font-bold">{o.loyalty.issued}</dd>
              </div>
              <div>
                <dt className="text-sm text-fg-muted">Rewards used</dt>
                <dd className="text-2xl font-bold">{o.loyalty.redeemed}</dd>
              </div>
              <div>
                <dt className="text-sm text-fg-muted">From regulars</dt>
                <dd className="text-2xl font-bold">{revenue ? `${Math.round((toCents(o.loyalty.loyal_revenue) / revenue) * 100)}%` : "—"}</dd>
              </div>
            </dl>
            <p className="mt-3 text-xs text-fg-faint">&ldquo;Regulars&rdquo; = customers with 3 or more visits.</p>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Promo codes" description="Jobs · revenue" />
          <CardBody>
            <BarList items={o.promos.map((p) => ({ key: p.code, label: p.code, value: toCents(p.revenue) / 100, sub: `${p.uses} use${p.uses === 1 ? "" : "s"}` }))} format={money} empty="No promo codes used in this period." />
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
