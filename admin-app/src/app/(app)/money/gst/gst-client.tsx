"use client";

import { useRouter } from "next/navigation";
import { Download } from "lucide-react";
import { formatCents, gstFromInclusiveCents, sumCents, toCents } from "@/lib/core/money";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, Stat } from "@/components/ui/card";
import { Notice } from "@/components/ui/feedback";
import { Select } from "@/components/ui/field";
import type { GstSummary } from "@/lib/shop/money";

const MONTHS = ["Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar", "Apr", "May", "Jun"];
const QUARTERS = [
  { label: "Q1 · Jul–Sep", months: [0, 1, 2] },
  { label: "Q2 · Oct–Dec", months: [3, 4, 5] },
  { label: "Q3 · Jan–Mar", months: [6, 7, 8] },
  { label: "Q4 · Apr–Jun", months: [9, 10, 11] },
];

export function GstClient({ fy, currentFy, data }: { fy: number; currentFy: number; data: GstSummary }) {
  const router = useRouter();
  const rate = Number(data.tax_rate) || 0.1;
  // Month index within the FY (0 = July) → sales in cents.
  const sales = new Array<number>(12).fill(0);
  for (const m of data.months) {
    const month = Number(m.month.slice(5, 7));
    sales[(month + 5) % 12] += toCents(m.sales);
  }
  const monthLabel = (i: number) => `${MONTHS[i]} ${i < 6 ? fy - 1 : fy}`;
  const total = sumCents(sales);
  const gst = (c: number) => gstFromInclusiveCents(c, rate);

  function downloadCsv() {
    const rows = [["Month", "Sales incl. GST", "GST", "Sales excl. GST"]];
    sales.forEach((c, i) => rows.push([monthLabel(i), (c / 100).toFixed(2), (gst(c) / 100).toFixed(2), ((c - gst(c)) / 100).toFixed(2)]));
    rows.push(["Total", (total / 100).toFixed(2), (gst(total) / 100).toFixed(2), ((total - gst(total)) / 100).toFixed(2)]);
    const blob = new Blob([rows.map((r) => r.join(",")).join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `ozshine-gst-fy${fy}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const years = Array.from({ length: Math.max(currentFy - 2023, 1) }, (_, i) => currentFy - i);
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <div className="w-72">
          <Select aria-label="Financial year" value={fy} onChange={(e) => router.push(`/money/gst?fy=${e.target.value}`)}>
            {years.map((y) => (
              <option key={y} value={y}>
                FY{y} (Jul {y - 1} – Jun {y})
              </option>
            ))}
          </Select>
        </div>
        <Button className="ml-auto" icon={Download} onClick={downloadCsv}>
          Download CSV
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 @4xl:grid-cols-4">
        {QUARTERS.map((q) => {
          const c = sumCents(q.months.map((i) => sales[i]));
          return <Stat key={q.label} label={q.label} value={formatCents(gst(c))} sub={`GST on ${formatCents(c)} sales`} />;
        })}
      </div>

      <Card>
        <CardHeader title={`FY${fy} by month`} description={`Total GST ${formatCents(gst(total))} on ${formatCents(total)} of sales`} />
        <div className="overflow-x-auto">
          <table className="w-full text-[15px]">
            <thead>
              <tr className="border-b border-line text-left text-xs font-semibold tracking-wide text-fg-muted uppercase">
                <th className="px-5 py-3">Month</th>
                <th className="px-5 py-3 text-right">Sales incl. GST</th>
                <th className="px-5 py-3 text-right">GST</th>
                <th className="px-5 py-3 text-right">Sales excl. GST</th>
              </tr>
            </thead>
            <tbody>
              {sales.map((c, i) => (
                <tr key={i} className="border-b border-line last:border-0">
                  <td className="px-5 py-3">{monthLabel(i)}</td>
                  <td className="px-5 py-3 text-right tabular-nums">{c ? formatCents(c) : "—"}</td>
                  <td className="px-5 py-3 text-right tabular-nums">{c ? formatCents(gst(c)) : "—"}</td>
                  <td className="px-5 py-3 text-right tabular-nums">{c ? formatCents(c - gst(c)) : "—"}</td>
                </tr>
              ))}
              <tr className="border-t-2 border-line-strong font-bold">
                <td className="px-5 py-3">Total</td>
                <td className="px-5 py-3 text-right tabular-nums">{formatCents(total)}</td>
                <td className="px-5 py-3 text-right tabular-nums">{formatCents(gst(total))}</td>
                <td className="px-5 py-3 text-right tabular-nums">{formatCents(total - gst(total))}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>

      <Notice tone="info" title="How these are worked out">
        Sales are completed jobs (at their invoice total, incl. GST), counted on the day the job was completed. GST is 1/11th of the
        GST-inclusive amount. It&apos;s a guide for your BAS; your accountant has the final say.
      </Notice>
    </div>
  );
}
