"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, FilePlus2, MessageSquare, Phone, Wallet } from "lucide-react";
import { cn } from "@/lib/core/cn";
import { formatCents, sumCents, toCents } from "@/lib/core/money";
import { formatPhone } from "@/lib/core/phone";
import { Button, LinkButton } from "@/components/ui/button";
import { Card, Stat } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";
import { useShop } from "@/components/shop-context";
import { useBookingActions } from "@/components/booking/action-host";
import { useLiveData } from "@/lib/shop/hooks";
import { fetchBooking } from "@/lib/shop/queries";
import { issueInvoice } from "@/lib/shop/actions";
import { fetchDebtors, fetchInvoice, sendInvoiceMessage, updateInvoiceLine, type DebtorRow } from "@/lib/shop/money";

const BUCKETS: Array<{ id: DebtorRow["bucket"]; label: string; tone: string }> = [
  { id: "30+", label: "Over 30 days", tone: "text-bad-ink" },
  { id: "8-30", label: "8–30 days", tone: "text-warn-ink" },
  { id: "1-7", label: "1–7 days", tone: "text-fg" },
  { id: "today", label: "Today", tone: "text-fg" },
];

export function DebtorsClient({ initial }: { initial: DebtorRow[] }) {
  const { supabase, staff } = useShop();
  const router = useRouter();
  const toast = useToast();
  const actions = useBookingActions();
  const load = useCallback(() => fetchDebtors(supabase), [supabase]);
  const { data: rows } = useLiveData({ supabase, locationId: staff.location_id, initial, load, channel: "debtors" });
  const [busy, setBusy] = useState<string | null>(null);

  const total = sumCents(rows.map((r) => toCents(r.balance_due)));

  async function takePayment(r: DebtorRow) {
    if (!r.booking_id) return;
    setBusy(`pay-${r.booking_id}`);
    try {
      actions.openDialog("checkout", await fetchBooking(supabase, r.booking_id));
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(null);
    }
  }

  async function remind(r: DebtorRow) {
    if (!r.invoice_id) return;
    setBusy(`remind-${r.invoice_id}`);
    try {
      const n = await sendInvoiceMessage(supabase, r.invoice_id, "payment_reminder");
      if (n > 0) toast.success("Reminder sent", `${r.customer_name} · demo mode: saved in the message log`);
      else toast.toast({ title: "Nothing sent", description: "No phone or email on file, or they've opted out.", tone: "warn" });
    } catch (e) {
      toast.error(e, "Couldn't send");
    } finally {
      setBusy(null);
    }
  }

  // Jobs finished in the old system have no invoice. Create one, keeping the
  // amount that was charged back then.
  async function createInvoice(r: DebtorRow) {
    if (!r.booking_id) return;
    setBusy(`inv-${r.booking_id}`);
    try {
      const id = await issueInvoice(supabase, r.booking_id);
      const inv = await fetchInvoice(supabase, id);
      const target = toCents(r.total);
      const service = inv?.items.find((i) => i.kind === "service") ?? inv?.items.find((i) => i.kind !== "discount");
      if (inv && service && target > 0 && toCents(inv.total) !== target) {
        const adjusted = toCents(service.line_total) + (target - toCents(inv.total));
        if (adjusted >= 0) await updateInvoiceLine(supabase, service.id, { description: service.description, quantity: 1, unitPrice: adjusted });
      }
      router.push(`/invoices/${id}`);
    } catch (e) {
      toast.error(e, "Couldn't create the invoice");
      setBusy(null);
    }
  }

  if (rows.length === 0) {
    return (
      <Card>
        <EmptyState icon={CheckCircle2} title="Nobody owes anything" description="Jobs completed with “pay later” show up here until they're paid." />
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 @3xl:grid-cols-5">
        <Stat label="Total owing" value={formatCents(total)} sub={`${rows.length} job${rows.length === 1 ? "" : "s"}`} />
        {BUCKETS.map((b) => {
          const list = rows.filter((r) => r.bucket === b.id);
          return <Stat key={b.id} label={b.label} value={<span className={b.tone}>{formatCents(sumCents(list.map((r) => toCents(r.balance_due))))}</span>} sub={`${list.length} job${list.length === 1 ? "" : "s"}`} />;
        })}
      </div>

      {BUCKETS.map((b) => {
        const list = rows.filter((r) => r.bucket === b.id);
        if (list.length === 0) return null;
        return (
          <section key={b.id} aria-label={b.label}>
            <h2 className={cn("mb-2 text-sm font-bold tracking-wide uppercase", b.tone)}>{b.label}</h2>
            <Card>
              <ul className="divide-y divide-line">
                {list.map((r) => {
                  const key = r.invoice_id ?? r.booking_id ?? r.customer_id;
                  return (
                    <li key={key} className="flex flex-wrap items-center gap-3 px-5 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold">
                          {r.customer_name}
                          {r.rego && <span className="ml-2 font-mono text-sm font-normal text-fg-muted">{r.rego}</span>}
                        </p>
                        <p className="text-sm text-fg-muted">
                          {r.number ? <span className="font-mono">{r.number}</span> : "Old system, no invoice yet"}
                          {" · "}
                          {r.days_old === 0 ? "today" : `${r.days_old} day${r.days_old === 1 ? "" : "s"} ago`}
                          {r.phone && ` · ${formatPhone(r.phone)}`}
                        </p>
                      </div>
                      <span className="text-lg font-bold text-warn-ink tabular-nums">{formatCents(toCents(r.balance_due))}</span>
                      <div className="flex flex-wrap gap-2">
                        {r.phone && <LinkButton href={`tel:${r.phone}`} size="icon-sm" icon={Phone} aria-label={`Call ${r.customer_name}`} />}
                        {r.invoice_id ? (
                          <>
                            <Button size="sm" icon={MessageSquare} loading={busy === `remind-${r.invoice_id}`} onClick={() => remind(r)}>
                              Remind
                            </Button>
                            <LinkButton size="sm" href={`/invoices/${r.invoice_id}`}>
                              Invoice
                            </LinkButton>
                            {r.booking_id && (
                              <Button size="sm" variant="success" icon={Wallet} loading={busy === `pay-${r.booking_id}`} onClick={() => takePayment(r)}>
                                Take payment
                              </Button>
                            )}
                          </>
                        ) : (
                          <Button size="sm" icon={FilePlus2} loading={busy === `inv-${r.booking_id}`} onClick={() => createInvoice(r)}>
                            Create invoice
                          </Button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </Card>
          </section>
        );
      })}
    </div>
  );
}
