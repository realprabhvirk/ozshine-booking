"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Banknote, CreditCard, Gift, Landmark, MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/core/cn";
import { errorMessage } from "@/lib/core/errors";
import { formatCents, parseMoneyInput, toCents } from "@/lib/core/money";
import { PAYMENT_METHOD_LABELS, type PaymentMethod } from "@/lib/core/status";
import { formatDate } from "@/lib/core/time";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Notice, Skeleton } from "@/components/ui/feedback";
import { InvoiceBadge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { useShop } from "@/components/shop-context";
import { advanceBooking, applyInvoiceCode, issueInvoice, recordPayment } from "@/lib/shop/actions";
import type { BoardBooking } from "@/lib/shop/types";
import type { InvoiceStatus } from "@/lib/core/status";

type InvoiceDetail = {
  id: string;
  number: string | null;
  status: InvoiceStatus;
  total: number | string;
  amount_paid: number | string;
  balance_due: number | string;
  gst_amount: number | string;
  items: Array<{ id: string; kind: string; description: string; quantity: number | string; line_total: number | string; sort: number }>;
  payments: Array<{ id: string; amount: number | string; method: PaymentMethod; received_at: string }>;
};
type Reward = { id: string; code: string; description: string; expires_at: string | null };

const METHODS: Array<{ value: PaymentMethod; icon: typeof CreditCard }> = [
  { value: "eftpos", icon: CreditCard },
  { value: "cash", icon: Banknote },
  { value: "bank_transfer", icon: Landmark },
  { value: "other", icon: MoreHorizontal },
];

// Take payment for a job and complete it. The invoice is created on open
// (issue_invoice returns the existing one if there is one), so re-opening
// never duplicates anything.
export function CheckoutDialog({ booking, open, onClose }: { booking: BoardBooking | null; open: boolean; onClose: () => void }) {
  const { supabase } = useShop();
  const toast = useToast();
  const [invoice, setInvoice] = useState<InvoiceDetail | null>(null);
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [method, setMethod] = useState<PaymentMethod>("eftpos");
  const [amountText, setAmountText] = useState("");
  const [tenderedText, setTenderedText] = useState("");
  const [reference, setReference] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState<null | "pay" | "code" | "account">(null);
  // One key per payment attempt: a double tap can't charge twice.
  const [attempt, setAttempt] = useState(() => crypto.randomUUID());

  const load = useCallback(async () => {
    if (!booking) return;
    try {
      const id = await issueInvoice(supabase, booking.id);
      const { data, error } = await supabase
        .from("invoices")
        .select("id, number, status, total, amount_paid, balance_due, gst_amount, items:invoice_items(id, kind, description, quantity, line_total, sort), payments(id, amount, method, received_at)")
        .eq("id", id)
        .single();
      if (error) throw error;
      const inv = data as unknown as InvoiceDetail;
      inv.items.sort((a, b) => a.sort - b.sort);
      setInvoice(inv);
      setAmountText((toCents(inv.balance_due) / 100).toFixed(2));
      setLoadError(null);
      if (booking.customer && !booking.customer.is_walkin_placeholder) {
        const r = await supabase
          .from("loyalty_rewards")
          .select("id, code, description, expires_at")
          .eq("customer_id", booking.customer.id)
          .eq("status", "issued");
        setRewards((r.data ?? []) as Reward[]);
      }
    } catch (e) {
      setLoadError(errorMessage(e));
    }
  }, [booking, supabase]);

  // Fetch the invoice when the dialog opens (state is only set after the
  // network calls resolve).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (open) void load();
  }, [open, load]);

  const balance = invoice ? toCents(invoice.balance_due) : 0;
  const amount = parseMoneyInput(amountText);
  const tendered = parseMoneyInput(tenderedText);
  const change = method === "cash" && tendered !== null && amount !== null ? tendered - amount : null;
  const completed = booking?.status === "completed";

  const lines = useMemo(() => invoice?.items ?? [], [invoice]);

  async function applyCode(c: string) {
    if (!invoice || !c.trim()) return;
    setBusy("code");
    try {
      const r = await applyInvoiceCode(supabase, invoice.id, c.trim());
      toast.success("Discount applied", `−${formatCents(toCents(r.discount))}`);
      setCode("");
      await load();
    } catch (e) {
      toast.error(e, "Couldn't apply that code");
    } finally {
      setBusy(null);
    }
  }

  async function pay() {
    if (!invoice || !booking || amount === null || amount <= 0) return;
    setBusy("pay");
    try {
      const r = await recordPayment(supabase, invoice.id, amount, method, {
        reference: reference.trim() || null,
        idempotencyKey: attempt,
      });
      setAttempt(crypto.randomUUID());
      const left = toCents(r.balance_due);
      if (left > 0) {
        toast.success(`${formatCents(amount)} received`, `${formatCents(left)} still owing`);
        setReference("");
        setTenderedText("");
        await load();
        return;
      }
      if (!completed) await advanceBooking(supabase, booking.id, "completed");
      toast.success(completed ? "Paid in full" : "Paid & completed", `${booking.reference_code} · ${formatCents(amount)} ${PAYMENT_METHOD_LABELS[method]}`);
      onClose();
    } catch (e) {
      toast.error(e, "Payment not recorded");
    } finally {
      setBusy(null);
    }
  }

  async function completeOnAccount() {
    if (!booking) return;
    setBusy("account");
    try {
      await advanceBooking(supabase, booking.id, "completed");
      toast.success("Completed — payment owing", `${formatCents(balance)} added to Debtors`);
      onClose();
    } catch (e) {
      toast.error(e, "Couldn't complete");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      dismissible={!busy}
      size="lg"
      title={booking ? `Checkout · ${booking.customer?.name ?? "Walk-in"}` : "Checkout"}
      description={booking ? `${booking.reference_code} · ${booking.vehicle?.rego ?? "no rego"}` : undefined}
    >
      {loadError && (
        <Notice tone="bad" title="Couldn't open the invoice" className="mb-4">
          {loadError}
        </Notice>
      )}
      {!invoice && !loadError && (
        <div className="space-y-3 pb-4">
          <Skeleton className="h-6 w-1/2" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      )}
      {invoice && (
        <div className="grid gap-6 pb-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          <section aria-label="Invoice">
            <div className="mb-2 flex items-center justify-between">
              <p className="font-mono text-sm text-fg-muted">{invoice.number}</p>
              <InvoiceBadge status={invoice.status} />
            </div>
            <ul className="divide-y divide-line rounded-xl bg-sunken ring-1 ring-line">
              {lines.map((l) => (
                <li key={l.id} className="flex items-start justify-between gap-3 px-4 py-3 text-[15px]">
                  <span className={cn(l.kind === "discount" && "text-ok-ink")}>{l.description}</span>
                  <span className={cn("tabular-nums", l.kind === "discount" && "text-ok-ink")}>{formatCents(toCents(l.line_total))}</span>
                </li>
              ))}
            </ul>
            <dl className="mt-3 space-y-1 text-[15px]">
              <div className="flex justify-between text-fg-muted">
                <dt>Includes GST</dt>
                <dd className="tabular-nums">{formatCents(toCents(invoice.gst_amount))}</dd>
              </div>
              {toCents(invoice.amount_paid) > 0 && (
                <div className="flex justify-between text-fg-muted">
                  <dt>Paid so far</dt>
                  <dd className="tabular-nums">{formatCents(toCents(invoice.amount_paid))}</dd>
                </div>
              )}
              <div className="flex justify-between pt-1 text-xl font-bold">
                <dt>{toCents(invoice.amount_paid) > 0 ? "Left to pay" : "Total"}</dt>
                <dd className="tabular-nums">{formatCents(balance)}</dd>
              </div>
            </dl>

            {balance > 0 && (
              <div className="mt-5 space-y-3">
                {rewards.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    disabled={!!busy}
                    onClick={() => applyCode(r.code)}
                    className="flex min-h-14 w-full items-center gap-3 rounded-xl bg-ok/10 px-4 text-left ring-1 ring-ok/30 ring-inset transition hover:bg-ok/15 disabled:opacity-50"
                  >
                    <Gift size={20} className="shrink-0 text-ok-ink" aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold text-ok-ink">Use reward: {r.description}</span>
                      <span className="block text-xs text-fg-muted">
                        {r.code}
                        {r.expires_at && ` · expires ${formatDate(r.expires_at.slice(0, 10), "medium")}`}
                      </span>
                    </span>
                  </button>
                ))}
                <div className="flex gap-2">
                  <Input
                    aria-label="Promo or reward code"
                    placeholder="Promo or reward code"
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                    className="font-mono"
                  />
                  <Button onClick={() => applyCode(code)} loading={busy === "code"} disabled={!code.trim() || !!busy}>
                    Apply
                  </Button>
                </div>
              </div>
            )}
          </section>

          <section aria-label="Payment" className="space-y-4">
            {balance === 0 ? (
              <Notice tone="ok" title="Nothing owing">
                This invoice is fully paid.
              </Notice>
            ) : (
              <>
                <div role="radiogroup" aria-label="Payment method" className="grid grid-cols-2 gap-2">
                  {METHODS.map(({ value, icon: Icon }) => (
                    <button
                      key={value}
                      type="button"
                      role="radio"
                      aria-checked={method === value}
                      onClick={() => setMethod(value)}
                      className={cn(
                        "flex h-14 items-center justify-center gap-2 rounded-xl text-[15px] font-semibold ring-1 ring-inset transition",
                        "focus-visible:outline-2 focus-visible:outline-focus",
                        method === value ? "bg-accent text-accent-fg ring-accent" : "bg-raised ring-line hover:ring-line-strong",
                      )}
                    >
                      <Icon size={18} aria-hidden />
                      {PAYMENT_METHOD_LABELS[value]}
                    </button>
                  ))}
                </div>
                <Field label="Amount" error={amountText && amount === null ? "Enter an amount like 65 or 65.50" : amount !== null && amount > balance ? "That's more than what's owing" : null}>
                  <Input inputMode="decimal" value={amountText} onChange={(e) => setAmountText(e.target.value)} className="text-lg font-semibold tabular-nums" />
                </Field>
                {method === "cash" && (
                  <Field label="Cash handed over" optional hint="Works out the change">
                    <Input inputMode="decimal" value={tenderedText} onChange={(e) => setTenderedText(e.target.value)} className="tabular-nums" />
                  </Field>
                )}
                {change !== null && change >= 0 && (
                  <p className="rounded-xl bg-warn/12 px-4 py-3 text-lg font-bold text-warn-ink ring-1 ring-warn/35 ring-inset">
                    Change: {formatCents(change)}
                  </p>
                )}
                {(method === "bank_transfer" || method === "other") && (
                  <Field label="Reference" optional>
                    <Input value={reference} onChange={(e) => setReference(e.target.value)} maxLength={80} />
                  </Field>
                )}
                <Button
                  variant="success"
                  size="lg"
                  block
                  loading={busy === "pay"}
                  disabled={!!busy || amount === null || amount <= 0 || amount > balance}
                  onClick={pay}
                >
                  {amount !== null && amount < balance
                    ? `Take ${formatCents(amount)} (part payment)`
                    : completed
                      ? `Take ${formatCents(amount ?? 0)}`
                      : `Take ${formatCents(amount ?? 0)} & complete`}
                </Button>
                <p className="text-center text-xs text-fg-faint">Charge the card on the EFTPOS machine first, then record it here.</p>
              </>
            )}
            {!completed && (
              <Button variant="ghost" block loading={busy === "account"} disabled={!!busy} onClick={completeOnAccount}>
                {balance === 0 ? "Complete job" : "Complete — they'll pay later"}
              </Button>
            )}
          </section>
        </div>
      )}
    </Dialog>
  );
}
