"use client";

import { useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Notice } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";
import { useShop } from "@/components/shop-context";
import { formatCents, parseMoneyInput } from "@/lib/core/money";
import { PAYMENT_METHOD_LABELS } from "@/lib/core/status";
import { refundPayment, type Payment } from "@/lib/shop/money";

// Refund part or all of a payment. The money goes back the same way it came
// (hand back cash, or refund the card on the EFTPOS machine); this records it.
export function RefundDialog({ payment, refundable, onClose }: { payment: Payment | null; refundable: number; onClose: () => void }) {
  const { supabase } = useShop();
  const toast = useToast();
  const [amount, setAmount] = useState((refundable / 100).toFixed(2));
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cents = parseMoneyInput(amount);
  const valid = cents !== null && cents > 0 && cents <= refundable && reason.trim().length > 0;

  async function save() {
    if (!payment || !valid || cents === null) return;
    setBusy(true);
    setError(null);
    try {
      await refundPayment(supabase, payment.id, cents, reason.trim());
      toast.success("Refund recorded", `${formatCents(cents)} ${PAYMENT_METHOD_LABELS[payment.method]}`);
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={!!payment}
      onClose={onClose}
      dismissible={!busy}
      size="sm"
      title="Refund payment"
      description={payment ? `${PAYMENT_METHOD_LABELS[payment.method]} · up to ${formatCents(refundable)} can be refunded` : undefined}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="danger" loading={busy} disabled={!valid} onClick={save}>
            Refund {cents !== null ? formatCents(cents) : ""}
          </Button>
        </>
      }
    >
      <div className="space-y-4 pb-2">
        {error && <Notice tone="bad">{error}</Notice>}
        <Field label="Amount" error={amount && (cents === null || cents <= 0 || cents > refundable) ? `Between $0.01 and ${formatCents(refundable)}` : null}>
          <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <Field label="Reason" hint="Kept in the invoice history">
          <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} />
        </Field>
        <p className="text-sm text-fg-muted">
          {payment?.method === "eftpos" ? "Do the refund on the EFTPOS machine too." : payment?.method === "cash" ? "Hand the cash back to the customer." : "Send the money back, then record it here."}
        </p>
      </div>
    </Dialog>
  );
}
