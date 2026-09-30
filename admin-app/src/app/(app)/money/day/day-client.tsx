"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Lock, LockOpen, Printer } from "lucide-react";
import { cn } from "@/lib/core/cn";
import { formatCents, parseMoneyInput, toCents } from "@/lib/core/money";
import { PAYMENT_METHODS, PAYMENT_METHOD_LABELS } from "@/lib/core/status";
import { addDaysISO, formatClock, formatDate, formatDateTime, todayISO } from "@/lib/core/time";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, Stat } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/field";
import { EmptyState, Notice } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";
import { useShop } from "@/components/shop-context";
import { useLiveData } from "@/lib/shop/hooks";
import { closeDay, fetchDayPayments, fetchDaySummary, reopenDay, type DayPayment, type DaySummary } from "@/lib/shop/money";

type DayData = { summary: DaySummary; payments: DayPayment[] };

export function DayClient({ date, initial }: { date: string; initial: DayData }) {
  const { supabase, staff } = useShop();
  const router = useRouter();
  const toast = useToast();
  const load = useCallback(async () => {
    const [summary, payments] = await Promise.all([fetchDaySummary(supabase, date), fetchDayPayments(supabase, date)]);
    return { summary, payments };
  }, [supabase, date]);
  const { data } = useLiveData<DayData>({ supabase, locationId: staff.location_id, initial, load, channel: `day-${date}` });
  const s = data.summary;

  const [counted, setCounted] = useState("");
  const [notes, setNotes] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [reopen, setReopen] = useState(false);
  const [busy, setBusy] = useState(false);

  const expected = toCents(s.expected_cash);
  const countedCents = parseMoneyInput(counted);
  const variance = countedCents === null ? null : countedCents - expected;
  const isToday = date === todayISO();
  const future = date > todayISO();

  async function doClose() {
    if (countedCents === null) return;
    setBusy(true);
    try {
      await closeDay(supabase, date, countedCents, notes.trim());
      toast.success("Day closed", variance === 0 ? "Cash balanced exactly." : `Cash ${variance! > 0 ? "over" : "short"} by ${formatCents(Math.abs(variance!))}`);
      setConfirm(false);
    } catch (e) {
      toast.error(e, "Couldn't close the day");
    } finally {
      setBusy(false);
    }
  }

  async function doReopen() {
    setBusy(true);
    try {
      await reopenDay(supabase, date);
      toast.success("Day reopened");
      setReopen(false);
    } catch (e) {
      toast.error(e, "Couldn't reopen");
    } finally {
      setBusy(false);
    }
  }

  const go = (d: string) => router.push(`/money/day?date=${d}`);
  const methods = PAYMENT_METHODS.filter((m) => toCents(s.payments_by_method[m] ?? 0) !== 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <Button size="icon" icon={ChevronLeft} aria-label="Previous day" onClick={() => go(addDaysISO(date, -1))} />
        <Button onClick={() => go(todayISO())}>Today</Button>
        <Button size="icon" icon={ChevronRight} aria-label="Next day" disabled={isToday || future} onClick={() => go(addDaysISO(date, 1))} />
        <div className="w-44">
          <Input type="date" aria-label="Date" value={date} max={todayISO()} onChange={(e) => e.target.value && go(e.target.value)} />
        </div>
        <Button className="ml-auto" icon={Printer} onClick={() => window.print()}>
          Print summary
        </Button>
      </div>

      <h2 className="text-xl font-bold">
        {formatDate(date, "full")}
        {s.is_closed && (
          <span className="ml-3 inline-flex items-center gap-1.5 align-middle text-sm font-semibold text-ok-ink">
            <Lock size={14} aria-hidden /> Closed
          </span>
        )}
      </h2>

      <div className="grid grid-cols-2 gap-3 @4xl:grid-cols-4">
        <Stat label="Cars completed" value={s.cars_completed} />
        <Stat label="Revenue" value={formatCents(toCents(s.revenue_total))} sub="Completed jobs, incl. GST" />
        <Stat label="Money taken" value={formatCents(toCents(s.payments_total))} sub={toCents(s.refunds_total) > 0 ? `after ${formatCents(toCents(s.refunds_total))} refunds` : "No refunds"} />
        <Stat label="Left owing" value={formatCents(toCents(s.outstanding_created))} sub={s.voids_count ? `${s.voids_count} invoice${s.voids_count > 1 ? "s" : ""} voided` : "From today's invoices"} />
      </div>

      <div className="grid gap-6 @4xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader title="Takings by method" />
          <CardBody>
            {methods.length === 0 ? (
              <p className="text-fg-muted">No payments this day.</p>
            ) : (
              <dl className="space-y-2 text-[15px]">
                {methods.map((m) => (
                  <div key={m} className="flex justify-between">
                    <dt>{PAYMENT_METHOD_LABELS[m]}</dt>
                    <dd className="font-semibold tabular-nums">{formatCents(toCents(s.payments_by_method[m] ?? 0))}</dd>
                  </div>
                ))}
                <div className="flex justify-between border-t border-line pt-2 text-lg font-bold">
                  <dt>Total</dt>
                  <dd className="tabular-nums">{formatCents(toCents(s.payments_total))}</dd>
                </div>
              </dl>
            )}
            <p className="mt-3 text-xs text-fg-faint">Check the EFTPOS figure against the terminal&apos;s settlement report.</p>
          </CardBody>
        </Card>

        {s.is_closed && s.close ? (
          <Card>
            <CardHeader title="Cash-up" description={`Closed ${formatDateTime(s.close.closed_at)}`} />
            <CardBody>
              <dl className="space-y-2 text-[15px]">
                <div className="flex justify-between">
                  <dt>Cash expected</dt>
                  <dd className="tabular-nums">{formatCents(expected)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt>Cash counted</dt>
                  <dd className="tabular-nums">{formatCents(toCents(s.close.counted_cash))}</dd>
                </div>
                <VarianceRow cents={toCents(s.close.variance)} />
              </dl>
              {s.close.notes && <p className="mt-3 rounded-xl bg-raised px-4 py-3 text-sm ring-1 ring-line">{s.close.notes}</p>}
              {staff.role === "admin" && (
                <Button className="mt-4 print:hidden" variant="ghost" icon={LockOpen} onClick={() => setReopen(true)}>
                  Reopen day
                </Button>
              )}
            </CardBody>
          </Card>
        ) : (
          <Card className="print:hidden">
            <CardHeader title="Cash-up" description="Count the till, then close the day" />
            <CardBody className="space-y-4">
              {future ? (
                <Notice tone="info">This day hasn&apos;t happened yet.</Notice>
              ) : (
                <>
                  <div className="flex justify-between text-[15px]">
                    <span>Cash expected in the till</span>
                    <span className="font-bold tabular-nums">{formatCents(expected)}</span>
                  </div>
                  <Field label="Cash counted" hint="Takings only, not the float." error={counted && countedCents === null ? "Enter an amount like 350 or 350.50" : null}>
                    <Input inputMode="decimal" value={counted} onChange={(e) => setCounted(e.target.value)} placeholder="0.00" className="text-lg font-semibold tabular-nums" />
                  </Field>
                  {variance !== null && (
                    <dl>
                      <VarianceRow cents={variance} />
                    </dl>
                  )}
                  <Field label="Notes" optional>
                    <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} placeholder="e.g. $20 short, customer paid tip in cash" />
                  </Field>
                  <Button variant="primary" size="lg" block icon={Lock} disabled={countedCents === null} onClick={() => setConfirm(true)}>
                    Close {isToday ? "today" : formatDate(date, "short")}
                  </Button>
                </>
              )}
            </CardBody>
          </Card>
        )}
      </div>

      <Card>
        <CardHeader title="Payments" description={`${data.payments.length} this day`} />
        {data.payments.length === 0 ? (
          <EmptyState title="No payments" className="py-8" />
        ) : (
          <ul className="divide-y divide-line">
            {data.payments.map((p) => {
              const amt = toCents(p.amount);
              const who = !p.invoice?.customer || p.invoice.customer.is_walkin_placeholder ? "Walk-in" : p.invoice.customer.name;
              return (
                <li key={p.id} className="flex items-center gap-4 px-5 py-3">
                  <span className="w-16 text-sm text-fg-muted tabular-nums">{formatClock(p.received_at)}</span>
                  <span className="min-w-0 flex-1 truncate">
                    <span className="font-medium">{who}</span>{" "}
                    {p.invoice && (
                      <Link href={`/invoices/${p.invoice.id}`} className="font-mono text-sm text-accent-ink hover:underline">
                        {p.invoice.number}
                      </Link>
                    )}
                  </span>
                  <span className="hidden text-sm text-fg-muted sm:block">
                    {amt < 0 ? "Refund · " : ""}
                    {PAYMENT_METHOD_LABELS[p.method]}
                  </span>
                  <span className={cn("w-24 text-right font-semibold tabular-nums", amt < 0 && "text-bad-ink")}>{formatCents(amt)}</span>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        onConfirm={doClose}
        busy={busy}
        title={`Close ${formatDate(date, "long")}?`}
        description={
          variance === null
            ? undefined
            : variance === 0
              ? "The cash balances exactly."
              : `The cash is ${variance > 0 ? "over" : "short"} by ${formatCents(Math.abs(variance))}. That'll be recorded.`
        }
        confirmLabel="Close day"
      />
      <ConfirmDialog
        open={reopen}
        onClose={() => setReopen(false)}
        onConfirm={doReopen}
        busy={busy}
        tone="danger"
        title="Reopen this day?"
        description="Use this if the cash-up was wrong. You'll need to close it again afterwards. The reopen is recorded."
        confirmLabel="Reopen"
      />
    </div>
  );
}

function VarianceRow({ cents }: { cents: number }) {
  const label = cents === 0 ? "Balanced" : cents > 0 ? "Over" : "Short";
  return (
    <div className={cn("flex justify-between rounded-xl px-4 py-3 text-lg font-bold ring-1 ring-inset", cents === 0 ? "bg-ok/10 text-ok-ink ring-ok/30" : cents > 0 ? "bg-info/10 text-info-ink ring-info/30" : "bg-bad/10 text-bad-ink ring-bad/30")}>
      <dt>{label}</dt>
      <dd className="tabular-nums">{formatCents(Math.abs(cents))}</dd>
    </div>
  );
}
