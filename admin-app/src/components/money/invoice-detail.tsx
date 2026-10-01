"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft, Ban, CalendarClock, Car, History, MessageSquare, Pencil, Plus, Printer, Receipt, ReceiptText, Tag, Trash2, UserRound, Wallet,
} from "lucide-react";
import { cn } from "@/lib/core/cn";
import { formatCents, sumCents, toCents } from "@/lib/core/money";
import { formatPhone } from "@/lib/core/phone";
import { PAYMENT_METHOD_LABELS, VEHICLE_TYPE_LABELS } from "@/lib/core/status";
import { formatDate, formatDateTime, formatTime, shopDateOf } from "@/lib/core/time";
import { Button, LinkButton } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { InvoiceBadge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/dialog";
import { EmptyState, Notice } from "@/components/ui/feedback";
import { Field, Textarea } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { useShop } from "@/components/shop-context";
import { useBookingActions } from "@/components/booking/action-host";
import { fetchBooking } from "@/lib/shop/queries";
import { useLiveData } from "@/lib/shop/hooks";
import { useBookingPanel } from "@/lib/shop/use-booking-panel";
import {
  fetchInvoice, fetchInvoiceAudit, removeInvoiceLine, sendInvoiceMessage, voidInvoice,
  type AuditRow, type InvoiceDetail as Invoice, type InvoiceItem, type Payment,
} from "@/lib/shop/money";
import { LineDialog, type LineDialogMode } from "./line-dialog";
import { RefundDialog } from "./refund-dialog";

const AUDIT_LABELS: Record<string, string> = {
  "invoice.add_item": "Added a line",
  "invoice.price_edit": "Changed a line",
  "invoice.remove_item": "Removed a line",
  "invoice.promo": "Applied a promo code",
  "invoice.reward": "Applied a loyalty reward",
  "invoice.void": "Voided the invoice",
  "payment.refund": "Refunded a payment",
};

function auditSummary(a: AuditRow): string {
  const after = (a.after ?? {}) as Record<string, unknown>;
  const before = (a.before ?? {}) as Record<string, unknown>;
  const money = (v: unknown) => (v === undefined || v === null ? "" : formatCents(toCents(v as number)));
  switch (a.action) {
    case "invoice.add_item":
      return `${after.description ?? ""} ${money(after.kind === "discount" ? -Number(after.amount) : after.amount)}`;
    case "invoice.price_edit":
      return `${before.item ?? ""}: ${money(before.line_total)} → ${money(after.line_total)}`;
    case "invoice.remove_item":
      return `${before.item ?? ""} (${money(before.line_total)})`;
    case "invoice.promo":
    case "invoice.reward":
      return `${after.code ?? ""} −${money(after.amount)}`;
    case "invoice.void":
      return String(after.reason ?? "");
    case "payment.refund":
      return `${money(after.refund)} · ${after.reason ?? ""}`;
    default:
      return "";
  }
}

export function InvoiceDetailClient({ initial }: { initial: Invoice }) {
  const { supabase, staff } = useShop();
  const toast = useToast();
  const actions = useBookingActions();
  const panel = useBookingPanel();
  const isAdmin = staff.role === "admin";

  const load = useCallback(async () => {
    const [inv, audit] = await Promise.all([fetchInvoice(supabase, initial.id), isAdmin ? fetchInvoiceAudit(supabase, initial.id) : Promise.resolve([])]);
    return { inv: inv ?? initial, audit };
  }, [supabase, initial, isAdmin]);
  const { data } = useLiveData({ supabase, locationId: staff.location_id, initial: { inv: initial, audit: [] as AuditRow[] }, load, channel: `invoice-${initial.id}` });
  const inv = data.inv;
  const audit = data.audit;

  const [lineMode, setLineMode] = useState<LineDialogMode | null>(null);
  const [removeItem, setRemoveItem] = useState<InvoiceItem | null>(null);
  const [refundOf, setRefundOf] = useState<Payment | null>(null);
  const [voidOpen, setVoidOpen] = useState(false);
  const [voidReason, setVoidReason] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const isVoid = inv.status === "void";
  const balance = toCents(inv.balance_due);
  const walkin = !inv.customer || inv.customer.is_walkin_placeholder;
  const canMessage = !walkin && !!(inv.customer?.phone || inv.customer?.email);

  // How much of each payment has already been refunded.
  const refunded = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of inv.payments) if (p.refund_of_payment_id) m.set(p.refund_of_payment_id, (m.get(p.refund_of_payment_id) ?? 0) - toCents(p.amount));
    return m;
  }, [inv.payments]);

  const lines = inv.items.filter((i) => i.kind !== "discount");
  const discounts = inv.items.filter((i) => i.kind === "discount");
  const discountTotal = -sumCents(discounts.map((d) => toCents(d.line_total)));

  async function takePayment() {
    if (!inv.booking) return;
    setBusy("pay");
    try {
      const b = await fetchBooking(supabase, inv.booking.id);
      actions.openDialog("checkout", b);
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(null);
    }
  }

  async function send(kind: "receipt" | "payment_reminder") {
    setBusy(kind);
    try {
      const n = await sendInvoiceMessage(supabase, inv.id, kind);
      if (n > 0) toast.success(kind === "receipt" ? "Receipt sent" : "Reminder sent", "Saved in the message log (demo mode: not actually sent).");
      else toast.toast({ title: "Nothing sent", description: "The customer has no phone or email on file, or has opted out.", tone: "warn" });
    } catch (e) {
      toast.error(e, "Couldn't send");
    } finally {
      setBusy(null);
    }
  }

  async function doRemove() {
    if (!removeItem) return;
    setBusy("remove");
    try {
      await removeInvoiceLine(supabase, removeItem.id);
      toast.success("Line removed");
      setRemoveItem(null);
    } catch (e) {
      toast.error(e, "Couldn't remove the line");
    } finally {
      setBusy(null);
    }
  }

  async function doVoid() {
    setBusy("void");
    try {
      await voidInvoice(supabase, inv.id, voidReason.trim());
      toast.success("Invoice voided", inv.number ?? undefined);
      setVoidOpen(false);
    } catch (e) {
      toast.error(e, "Couldn't void the invoice");
    } finally {
      setBusy(null);
    }
  }

  function printUrl(format: "a4" | "receipt") {
    return `/print/invoice/${inv.id}?format=${format}&auto=1`;
  }

  return (
    <div className="mx-auto max-w-5xl">
      <Link href="/money" className="mb-3 inline-flex min-h-10 items-center gap-2 text-sm font-semibold text-fg-muted hover:text-fg">
        <ArrowLeft size={16} aria-hidden /> Invoices
      </Link>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-mono text-3xl font-bold tracking-tight">{inv.number ?? "Draft"}</h1>
            <InvoiceBadge status={inv.status} />
          </div>
          <p className="mt-1 text-fg-muted">
            {inv.issued_at ? `Issued ${formatDateTime(inv.issued_at, "medium")}` : `Created ${formatDateTime(inv.created_at, "medium")}`}
            {inv.created_by && ` by ${inv.created_by.name}`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {!isVoid && balance > 0 && inv.booking && (
            <Button variant="success" size="lg" icon={Wallet} loading={busy === "pay"} onClick={takePayment}>
              Take payment · {formatCents(balance)}
            </Button>
          )}
          <LinkButton href={printUrl("a4")} target="_blank" icon={Printer}>
            Print A4
          </LinkButton>
          <LinkButton href={printUrl("receipt")} target="_blank" icon={Receipt}>
            Print receipt
          </LinkButton>
        </div>
      </div>

      {isVoid && (
        <Notice tone="bad" title="This invoice was voided" className="mb-6">
          {inv.voided_at && formatDateTime(inv.voided_at, "medium")}
          {inv.void_reason && ` · ${inv.void_reason}`}. The number is kept so the sequence has no gaps.
        </Notice>
      )}

      <div className="grid gap-6 @4xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-6">
          <Card>
            <CardHeader
              title="Items"
              action={
                !isVoid && (
                  <>
                    <Button size="sm" icon={Plus} onClick={() => setLineMode({ kind: "add-custom" })}>
                      Add line
                    </Button>
                    <Button size="sm" icon={Tag} onClick={() => setLineMode({ kind: "add-discount" })}>
                      Discount
                    </Button>
                  </>
                )
              }
            />
            <ul className="divide-y divide-line">
              {[...lines, ...discounts].map((it) => (
                <li key={it.id} className="flex items-center gap-3 px-5 py-3">
                  <div className="min-w-0 flex-1">
                    <p className={cn("font-medium", it.kind === "discount" && "text-ok-ink")}>{it.description}</p>
                    {it.kind !== "discount" && Number(it.quantity) !== 1 && (
                      <p className="text-sm text-fg-muted">
                        {Number(it.quantity)} × {formatCents(toCents(it.unit_price))}
                      </p>
                    )}
                  </div>
                  <span className={cn("font-semibold tabular-nums", it.kind === "discount" && "text-ok-ink")}>{formatCents(toCents(it.line_total))}</span>
                  {!isVoid && (
                    <div className="flex gap-1">
                      <Button size="icon-sm" variant="ghost" icon={Pencil} aria-label={`Edit ${it.description}`} onClick={() => setLineMode({ kind: "edit", item: it })} />
                      <Button size="icon-sm" variant="ghost" icon={Trash2} aria-label={`Remove ${it.description}`} onClick={() => setRemoveItem(it)} />
                    </div>
                  )}
                </li>
              ))}
              {inv.items.length === 0 && <li className="px-5 py-6 text-center text-fg-muted">No items yet.</li>}
            </ul>
            <dl className="space-y-1 border-t border-line px-5 py-4 text-[15px]">
              {discountTotal > 0 && (
                <>
                  <div className="flex justify-between text-fg-muted">
                    <dt>Subtotal</dt>
                    <dd className="tabular-nums">{formatCents(toCents(inv.subtotal))}</dd>
                  </div>
                  <div className="flex justify-between text-ok-ink">
                    <dt>Discounts</dt>
                    <dd className="tabular-nums">−{formatCents(discountTotal)}</dd>
                  </div>
                </>
              )}
              <div className="flex justify-between text-xl font-bold">
                <dt>Total</dt>
                <dd className="tabular-nums">{formatCents(toCents(inv.total))}</dd>
              </div>
              <div className="flex justify-between text-sm text-fg-muted">
                <dt>Includes GST</dt>
                <dd className="tabular-nums">{formatCents(toCents(inv.gst_amount))}</dd>
              </div>
              <div className="flex justify-between pt-2">
                <dt className="text-fg-muted">Paid</dt>
                <dd className="tabular-nums">{formatCents(toCents(inv.amount_paid))}</dd>
              </div>
              <div className={cn("flex justify-between font-bold", balance > 0 ? "text-warn-ink" : "text-ok-ink")}>
                <dt>{balance > 0 ? "Still owing" : "Balance"}</dt>
                <dd className="tabular-nums">{formatCents(balance)}</dd>
              </div>
            </dl>
          </Card>

          <Card>
            <CardHeader title="Payments" description={inv.payments.length ? undefined : "No payments yet"} />
            {inv.payments.length > 0 && (
              <ul className="divide-y divide-line">
                {inv.payments.map((p) => {
                  const amt = toCents(p.amount);
                  const isRefund = amt < 0;
                  const left = amt - (refunded.get(p.id) ?? 0);
                  return (
                    <li key={p.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                      <div className="min-w-0 flex-1">
                        <p className={cn("font-medium", isRefund && "text-bad-ink")}>
                          {isRefund ? "Refund" : PAYMENT_METHOD_LABELS[p.method]}
                          {isRefund && <span className="font-normal text-fg-muted"> · {PAYMENT_METHOD_LABELS[p.method]}</span>}
                        </p>
                        <p className="text-sm text-fg-muted">
                          {formatDateTime(p.received_at)}
                          {p.received_by && ` · ${p.received_by.name}`}
                          {p.reference && ` · Ref ${p.reference}`}
                          {p.note && ` · ${p.note}`}
                          {p.tendered != null && p.change_given != null && ` · ${formatCents(toCents(p.tendered))} handed over, ${formatCents(toCents(p.change_given))} change`}
                        </p>
                      </div>
                      <span className={cn("font-semibold tabular-nums", isRefund && "text-bad-ink")}>{formatCents(amt)}</span>
                      {!isRefund && isAdmin && left > 0 && (
                        <Button size="sm" variant="ghost" onClick={() => setRefundOf(p)}>
                          Refund
                        </Button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          {isAdmin && (
            <Card>
              <CardHeader title="History" description="Every change to this invoice" />
              {audit.length === 0 ? (
                <EmptyState icon={History} title="No changes" description="Edits, discounts, refunds and voids show up here." className="py-8" />
              ) : (
                <ol className="divide-y divide-line">
                  {audit.map((a) => (
                    <li key={a.id} className="px-5 py-3">
                      <p className="font-medium">{AUDIT_LABELS[a.action] ?? a.action}</p>
                      <p className="text-sm text-fg-muted">
                        {formatDateTime(a.created_at)}
                        {a.actor && ` · ${a.actor.name}`}
                        {auditSummary(a) && ` · ${auditSummary(a)}`}
                      </p>
                    </li>
                  ))}
                </ol>
              )}
            </Card>
          )}
        </div>

        <aside className="space-y-6">
          <Card>
            <CardBody className="space-y-3 text-[15px]">
              <div className="flex gap-3">
                <UserRound size={18} className="mt-0.5 shrink-0 text-fg-faint" aria-hidden />
                <div className="min-w-0">
                  <p className="font-semibold">{walkin ? "Walk-in customer" : inv.customer?.name}</p>
                  {!walkin && inv.customer?.phone && <p className="text-fg-muted tabular-nums">{formatPhone(inv.customer.phone)}</p>}
                  {!walkin && inv.customer?.email && <p className="break-all text-fg-muted">{inv.customer.email}</p>}
                </div>
              </div>
              {inv.booking && (
                <>
                  <div className="flex gap-3">
                    <ReceiptText size={18} className="mt-0.5 shrink-0 text-fg-faint" aria-hidden />
                    <div>
                      <p className="font-semibold">{inv.booking.service?.name}</p>
                      <button type="button" onClick={() => panel.open(inv.booking!.id)} className="font-mono text-sm font-semibold text-accent-ink hover:underline">
                        {inv.booking.reference_code}
                      </button>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <Car size={18} className="mt-0.5 shrink-0 text-fg-faint" aria-hidden />
                    <p>
                      <span className="font-mono font-semibold">{inv.booking.vehicle?.rego ?? "No rego"}</span>
                      <span className="text-fg-muted">
                        {" "}
                        · {[inv.booking.vehicle?.colour, inv.booking.vehicle?.make_model].filter(Boolean).join(" ") || VEHICLE_TYPE_LABELS[inv.booking.vehicle_type ?? "sedan"]}
                      </span>
                    </p>
                  </div>
                  <div className="flex gap-3">
                    <CalendarClock size={18} className="mt-0.5 shrink-0 text-fg-faint" aria-hidden />
                    <p>
                      {inv.booking.completed_at
                        ? formatDateTime(inv.booking.completed_at, "medium")
                        : `${formatDate(inv.booking.requested_date, "medium")} ${formatTime(inv.booking.requested_time)}`}
                      {inv.booking.processed_by && <span className="text-fg-muted"> · {inv.booking.processed_by.name}</span>}
                    </p>
                  </div>
                </>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Send to customer" />
            <CardBody className="space-y-2">
              {!canMessage && <p className="text-sm text-fg-muted">No phone or email on file.</p>}
              <Button block icon={MessageSquare} disabled={!canMessage || isVoid} loading={busy === "receipt"} onClick={() => send("receipt")}>
                Send receipt
              </Button>
              {balance > 0 && (
                <Button block icon={Wallet} disabled={!canMessage || isVoid} loading={busy === "payment_reminder"} onClick={() => send("payment_reminder")}>
                  Send payment reminder
                </Button>
              )}
            </CardBody>
          </Card>

          {!isVoid && isAdmin && (
            <Card>
              <CardBody>
                <Button block variant="ghost" icon={Ban} className="text-bad-ink" onClick={() => setVoidOpen(true)}>
                  Void invoice…
                </Button>
                <p className="mt-2 text-xs text-fg-faint">
                  {toCents(inv.amount_paid) !== 0 ? "Refund the payments first; then it can be voided." : "Cancels the invoice but keeps its number. The job can be invoiced again."}
                </p>
              </CardBody>
            </Card>
          )}
        </aside>
      </div>

      <LineDialog key={lineMode ? `line-${lineMode.kind === "edit" ? lineMode.item.id : lineMode.kind}` : "line-closed"} mode={lineMode} invoiceId={inv.id} onClose={() => setLineMode(null)} />
      <RefundDialog
        key={refundOf ? `refund-${refundOf.id}` : "refund-closed"}
        payment={refundOf}
        refundable={refundOf ? toCents(refundOf.amount) - (refunded.get(refundOf.id) ?? 0) : 0}
        onClose={() => setRefundOf(null)}
      />
      <ConfirmDialog
        open={!!removeItem}
        onClose={() => setRemoveItem(null)}
        onConfirm={doRemove}
        busy={busy === "remove"}
        tone="danger"
        title="Remove this line?"
        description={removeItem ? `${removeItem.description} · ${formatCents(toCents(removeItem.line_total))}` : undefined}
        confirmLabel="Remove"
      />
      <ConfirmDialog
        open={voidOpen}
        onClose={() => setVoidOpen(false)}
        onConfirm={doVoid}
        busy={busy === "void"}
        tone="danger"
        title={`Void ${inv.number ?? "invoice"}?`}
        description="The invoice stays on record (marked void) and its number isn't reused. Any loyalty reward used on it is given back."
        confirmLabel="Void invoice"
      >
        <Field label="Reason" hint="Required. Kept in the history.">
          <Textarea rows={2} value={voidReason} onChange={(e) => setVoidReason(e.target.value)} maxLength={300} />
        </Field>
      </ConfirmDialog>
    </div>
  );
}

// Tiny helper for other screens.
export function invoiceDateLabel(i: { issued_at: string | null; created_at: string }) {
  return formatDate(shopDateOf(i.issued_at ?? i.created_at), "medium");
}
