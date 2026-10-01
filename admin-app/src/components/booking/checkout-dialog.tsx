"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Banknote, CreditCard, Gift, Landmark, MoreHorizontal, Plus, SlidersHorizontal, Split, X } from "lucide-react";
import { cn } from "@/lib/core/cn";
import { errorMessage } from "@/lib/core/errors";
import { formatCents, parseMoneyInput, toCents } from "@/lib/core/money";
import { PAYMENT_METHOD_LABELS, type PaymentMethod } from "@/lib/core/status";
import { formatDate } from "@/lib/core/time";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Field, Input, Switch } from "@/components/ui/field";
import { Notice, Skeleton } from "@/components/ui/feedback";
import { InvoiceBadge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { useShop } from "@/components/shop-context";
import { advanceBooking, applyInvoiceCode, issueInvoice, recordPayment, setPaymentTendered } from "@/lib/shop/actions";
import { addInvoiceLine, removeInvoiceLine } from "@/lib/shop/money";
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
// One part of a split payment.
type Part = { key: string; method: PaymentMethod; amountText: string; tenderedText: string; reference: string; done: boolean };
const newPart = (method: PaymentMethod): Part => ({ key: crypto.randomUUID(), method, amountText: "", tenderedText: "", reference: "", done: false });

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
  const [busy, setBusy] = useState<null | "pay" | "code" | "account" | "adjust" | string>(null);
  // Price adjustment (extra charge or discount) with a note for the invoice.
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [adjustKind, setAdjustKind] = useState<"custom" | "discount">("custom");
  const [adjustText, setAdjustText] = useState("");
  const [adjustNote, setAdjustNote] = useState("");
  // Split payment across several methods.
  const [split, setSplit] = useState(false);
  const [parts, setParts] = useState<Part[]>(() => [newPart("eftpos"), newPart("cash")]);
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

  const adjustCents = parseMoneyInput(adjustText);
  const adjustValid = adjustCents !== null && adjustCents > 0 && adjustNote.trim().length > 0;

  const pending = parts.filter((p) => !p.done);
  const partCents = pending.map((p) => parseMoneyInput(p.amountText));
  const splitTotal = partCents.reduce<number>((n, c) => n + (c ?? 0), 0);
  const splitValid = pending.length > 0 && partCents.every((c) => c !== null && c > 0) && splitTotal <= balance &&
    pending.every((p, i) => p.method !== "cash" || !p.tenderedText || (parseMoneyInput(p.tenderedText) ?? -1) >= (partCents[i] ?? 0));

  function setPart(key: string, patch: Partial<Part>) {
    setParts((ps) => ps.map((p) => (p.key === key ? { ...p, ...patch } : p)));
  }

  // The last open row fills itself with whatever is left, so two taps split a bill.
  function fillRemainder(key: string) {
    const others = pending.filter((p) => p.key !== key).reduce((n, p) => n + (parseMoneyInput(p.amountText) ?? 0), 0);
    const left = balance - others;
    if (left > 0) setPart(key, { amountText: (left / 100).toFixed(2) });
  }

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

  async function addAdjustment() {
    if (!invoice || !adjustValid || adjustCents === null) return;
    setBusy("adjust");
    try {
      await addInvoiceLine(supabase, invoice.id, {
        kind: adjustKind,
        description: adjustNote.trim(),
        quantity: 1,
        unitPrice: adjustCents,
      });
      toast.success(adjustKind === "custom" ? `Added ${formatCents(adjustCents)}` : `Took off ${formatCents(adjustCents)}`, adjustNote.trim());
      setAdjustOpen(false);
      setAdjustText("");
      setAdjustNote("");
      await load();
    } catch (e) {
      toast.error(e, "Couldn't change the price");
    } finally {
      setBusy(null);
    }
  }

  async function removeLine(id: string) {
    setBusy(`rm-${id}`);
    try {
      await removeInvoiceLine(supabase, id);
      await load();
    } catch (e) {
      toast.error(e, "Couldn't remove that line");
    } finally {
      setBusy(null);
    }
  }

  // Take every open part of a split payment, one after another. Each part has
  // its own key, so retrying after a failure never charges a part twice.
  async function paySplit() {
    if (!invoice || !booking || !splitValid) return;
    setBusy("pay");
    let left = balance;
    let changeTotal = 0;
    try {
      for (const p of pending) {
        const cents = parseMoneyInput(p.amountText)!;
        const r = await recordPayment(supabase, invoice.id, cents, p.method, { reference: p.reference.trim() || null, idempotencyKey: p.key });
        const tendered = p.method === "cash" ? parseMoneyInput(p.tenderedText) : null;
        if (tendered !== null && tendered > cents) {
          await setPaymentTendered(supabase, r.payment_id, tendered);
          changeTotal += tendered - cents;
        }
        setPart(p.key, { done: true });
        left = toCents(r.balance_due);
      }
      const summary = pending.map((p, i) => `${formatCents(partCents[i] ?? 0)} ${PAYMENT_METHOD_LABELS[p.method]}`).join(" + ");
      if (left > 0) {
        toast.success(`${summary} received`, `${formatCents(left)} still owing${changeTotal ? ` · give ${formatCents(changeTotal)} change` : ""}`);
        setParts([newPart("eftpos"), newPart("cash")]);
        await load();
        return;
      }
      if (!completed) await advanceBooking(supabase, booking.id, "completed");
      toast.success(completed ? "Paid in full" : "Paid & completed", `${summary}${changeTotal ? ` · give ${formatCents(changeTotal)} change` : ""}`);
      onClose();
    } catch (e) {
      toast.error(e, "Payment stopped part-way. Parts marked ✓ were recorded.");
      await load();
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
      // Cash: remember what was handed over so the receipt shows the change.
      if (method === "cash" && tendered !== null && tendered > amount) await setPaymentTendered(supabase, r.payment_id, tendered);
      const left = toCents(r.balance_due);
      if (left > 0) {
        toast.success(`${formatCents(amount)} received`, `${formatCents(left)} still owing`);
        setReference("");
        setTenderedText("");
        await load();
        return;
      }
      if (!completed) await advanceBooking(supabase, booking.id, "completed");
      toast.success(
        completed ? "Paid in full" : "Paid & completed",
        `${booking.reference_code} · ${formatCents(amount)} ${PAYMENT_METHOD_LABELS[method]}${change !== null && change > 0 ? ` · give ${formatCents(change)} change` : ""}`,
      );
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
                  <span className={cn("min-w-0 flex-1", l.kind === "discount" && "text-ok-ink")}>{l.description}</span>
                  <span className={cn("tabular-nums", l.kind === "discount" && "text-ok-ink")}>{formatCents(toCents(l.line_total))}</span>
                  {(l.kind === "custom" || l.kind === "discount") && toCents(invoice.amount_paid) === 0 && (
                    <button
                      type="button"
                      aria-label={`Remove ${l.description}`}
                      disabled={!!busy}
                      onClick={() => removeLine(l.id)}
                      className="-my-1 -mr-2 rounded-lg p-1 text-fg-faint hover:bg-raised hover:text-bad-ink disabled:opacity-40"
                    >
                      <X size={16} aria-hidden />
                    </button>
                  )}
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

            {(invoice.status === "issued" || invoice.status === "partial") && (
              <div className="mt-4">
                {!adjustOpen ? (
                  <Button size="sm" variant="secondary" icon={SlidersHorizontal} onClick={() => setAdjustOpen(true)} disabled={!!busy}>
                    Adjust price
                  </Button>
                ) : (
                  <div className="space-y-3 rounded-xl bg-raised p-3 ring-1 ring-line">
                    <div role="radiogroup" aria-label="Adjustment" className="grid grid-cols-2 gap-1 rounded-lg bg-sunken p-1">
                      {(["custom", "discount"] as const).map((k) => (
                        <button
                          key={k}
                          type="button"
                          role="radio"
                          aria-checked={adjustKind === k}
                          onClick={() => setAdjustKind(k)}
                          className={cn("h-10 rounded-md text-sm font-semibold", adjustKind === k ? "bg-panel shadow-card ring-1 ring-line" : "text-fg-muted")}
                        >
                          {k === "custom" ? "+ Extra charge" : "− Discount"}
                        </button>
                      ))}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {[5, 10, 20, 40, 50].map((n) => (
                        <button
                          key={n}
                          type="button"
                          onClick={() => setAdjustText(String(n))}
                          className={cn("h-9 rounded-lg px-3 text-sm font-semibold ring-1 ring-line", adjustCents === n * 100 ? "bg-accent text-accent-fg ring-accent" : "bg-panel hover:ring-line-strong")}
                        >
                          ${n}
                        </button>
                      ))}
                    </div>
                    <Field label="Amount" error={adjustText && (adjustCents === null || adjustCents <= 0) ? "Like 40 or 1.50" : null}>
                      <Input inputMode="decimal" value={adjustText} onChange={(e) => setAdjustText(e.target.value)} placeholder="0.00" className="tabular-nums" />
                    </Field>
                    <Field label="Note (shows on the invoice)">
                      <Input
                        value={adjustNote}
                        onChange={(e) => setAdjustNote(e.target.value)}
                        maxLength={120}
                        placeholder={adjustKind === "custom" ? "e.g. Extra for heavy mud, customer agreed" : "e.g. Regular customer"}
                      />
                    </Field>
                    <div className="flex gap-2">
                      <Button variant="ghost" onClick={() => setAdjustOpen(false)} disabled={busy === "adjust"}>
                        Cancel
                      </Button>
                      <Button variant="primary" className="flex-1" loading={busy === "adjust"} disabled={!adjustValid || !!busy} onClick={addAdjustment}>
                        {adjustKind === "custom" ? `Add ${adjustCents ? formatCents(adjustCents) : ""}` : `Take off ${adjustCents ? formatCents(adjustCents) : ""}`}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}

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
                <div className="rounded-xl bg-raised px-3 ring-1 ring-line">
                  <Switch
                    checked={split}
                    onChange={(v) => {
                      setSplit(v);
                      if (v) setParts([newPart(method), newPart(method === "cash" ? "eftpos" : "cash")]);
                    }}
                    label={
                      <span className="inline-flex items-center gap-2">
                        <Split size={16} aria-hidden /> Split payment
                      </span>
                    }
                    description="Pay with more than one method (e.g. part card, part cash)"
                  />
                </div>
                {split ? (
                  <SplitParts
                    parts={parts}
                    balance={balance}
                    busy={busy === "pay"}
                    setPart={setPart}
                    fillRemainder={fillRemainder}
                    onAdd={() => setParts((ps) => [...ps, newPart("eftpos")])}
                    onRemove={(key) => setParts((ps) => ps.filter((p) => p.key !== key))}
                  />
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
                  <Field label="Cash handed over" optional hint="Works out the change and prints it on the receipt">
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
                </>
                )}
                {split && (
                  <Button variant="success" size="lg" block loading={busy === "pay"} disabled={!!busy || !splitValid} onClick={paySplit}>
                    {splitTotal < balance
                      ? `Take ${formatCents(splitTotal)} (part payment)`
                      : completed
                        ? `Take ${formatCents(splitTotal)}`
                        : `Take ${formatCents(splitTotal)} & complete`}
                  </Button>
                )}
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

const SPLIT_METHODS: PaymentMethod[] = ["eftpos", "cash", "bank_transfer", "other"];

function SplitParts({
  parts,
  balance,
  busy,
  setPart,
  fillRemainder,
  onAdd,
  onRemove,
}: {
  parts: Part[];
  balance: number;
  busy: boolean;
  setPart: (key: string, patch: Partial<Part>) => void;
  fillRemainder: (key: string) => void;
  onAdd: () => void;
  onRemove: (key: string) => void;
}) {
  const open = parts.filter((p) => !p.done);
  const total = open.reduce((n, p) => n + (parseMoneyInput(p.amountText) ?? 0), 0);
  const left = balance - total;
  return (
    <div className="space-y-3">
      {parts.map((p, i) => {
        const cents = parseMoneyInput(p.amountText);
        const tendered = parseMoneyInput(p.tenderedText);
        const change = p.method === "cash" && tendered !== null && cents !== null ? tendered - cents : null;
        return (
          <div key={p.key} className={cn("space-y-2 rounded-xl p-3 ring-1 ring-line", p.done ? "bg-ok/10 ring-ok/30" : "bg-raised")}>
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">
                Payment {i + 1} {p.done && <span className="text-ok-ink">✓ recorded</span>}
              </p>
              {!p.done && open.length > 1 && (
                <button type="button" aria-label={`Remove payment ${i + 1}`} disabled={busy} onClick={() => onRemove(p.key)} className="rounded-lg p-1 text-fg-faint hover:text-bad-ink">
                  <X size={16} aria-hidden />
                </button>
              )}
            </div>
            <div role="radiogroup" aria-label={`Method for payment ${i + 1}`} className="grid grid-cols-4 gap-1">
              {SPLIT_METHODS.map((m) => (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={p.method === m}
                  disabled={p.done || busy}
                  onClick={() => setPart(p.key, { method: m })}
                  className={cn(
                    "h-10 rounded-lg px-1 text-xs font-semibold ring-1 ring-inset transition",
                    p.method === m ? "bg-accent text-accent-fg ring-accent" : "bg-panel ring-line hover:ring-line-strong",
                  )}
                >
                  {PAYMENT_METHOD_LABELS[m]}
                </button>
              ))}
            </div>
            <div className="flex items-end gap-2">
              <Field label="Amount" className="flex-1" error={p.amountText && (cents === null || cents <= 0) ? "Enter an amount" : null}>
                <Input inputMode="decimal" value={p.amountText} disabled={p.done || busy} onChange={(e) => setPart(p.key, { amountText: e.target.value })} className="tabular-nums" />
              </Field>
              {!p.done && left > 0 && (
                <Button size="sm" variant="ghost" className="mb-1" onClick={() => fillRemainder(p.key)} disabled={busy}>
                  Rest ({formatCents(left + (cents ?? 0))})
                </Button>
              )}
            </div>
            {p.method === "cash" && !p.done && (
              <Field label="Cash handed over" optional>
                <Input inputMode="decimal" value={p.tenderedText} disabled={busy} onChange={(e) => setPart(p.key, { tenderedText: e.target.value })} className="tabular-nums" />
              </Field>
            )}
            {change !== null && change > 0 && <p className="text-sm font-bold text-warn-ink">Change: {formatCents(change)}</p>}
            {change !== null && change < 0 && <p className="text-sm font-medium text-bad-ink">That&apos;s less than this payment.</p>}
            {(p.method === "bank_transfer" || p.method === "other") && !p.done && (
              <Field label="Reference" optional>
                <Input value={p.reference} disabled={busy} onChange={(e) => setPart(p.key, { reference: e.target.value })} maxLength={80} />
              </Field>
            )}
          </div>
        );
      })}
      <div className="flex items-center justify-between gap-2">
        <Button size="sm" variant="secondary" icon={Plus} onClick={onAdd} disabled={busy}>
          Add another method
        </Button>
        <p className={cn("text-sm font-semibold tabular-nums", left < 0 ? "text-bad-ink" : left > 0 ? "text-warn-ink" : "text-ok-ink")}>
          {left < 0 ? `${formatCents(-left)} too much` : left > 0 ? `${formatCents(left)} not covered` : "Covers the full amount"}
        </p>
      </div>
    </div>
  );
}
