"use client";

import { useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Notice } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";
import { useShop } from "@/components/shop-context";
import { formatCents, parseMoneyInput, toCents } from "@/lib/core/money";
import { addInvoiceLine, updateInvoiceLine, type InvoiceItem } from "@/lib/shop/money";

export type LineDialogMode = { kind: "add-custom" } | { kind: "add-discount" } | { kind: "edit"; item: InvoiceItem };

// Add a custom line, add a discount, or change a line's description / qty /
// price. The database refuses anything that would take the total below what's
// already been paid, and big discounts need an admin.
export function LineDialog({ mode, invoiceId, onClose }: { mode: LineDialogMode | null; invoiceId: string; onClose: () => void }) {
  const { supabase, settings } = useShop();
  const toast = useToast();
  const editing = mode?.kind === "edit" ? mode.item : null;
  const isDiscount = mode?.kind === "add-discount" || editing?.kind === "discount";
  const [description, setDescription] = useState(editing?.description ?? "");
  const [qty, setQty] = useState(String(editing ? Number(editing.quantity) : 1));
  const [price, setPrice] = useState(editing ? (Math.abs(toCents(editing.kind === "discount" ? editing.line_total : editing.unit_price)) / 100).toFixed(2) : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cents = parseMoneyInput(price);
  const quantity = Number(qty);
  const qtyOk = isDiscount || (Number.isFinite(quantity) && quantity > 0 && quantity <= 99);
  const threshold = toCents(settings?.manual_discount_admin_threshold ?? 20);

  async function save() {
    if (!mode || cents === null || !description.trim() || !qtyOk) return;
    setBusy(true);
    setError(null);
    try {
      if (mode.kind === "edit") {
        await updateInvoiceLine(supabase, mode.item.id, { description: description.trim(), quantity: isDiscount ? 1 : quantity, unitPrice: cents });
        toast.success("Line updated");
      } else {
        await addInvoiceLine(supabase, invoiceId, {
          kind: isDiscount ? "discount" : "custom",
          description: description.trim(),
          quantity: isDiscount ? 1 : quantity,
          unitPrice: cents,
        });
        toast.success(isDiscount ? "Discount added" : "Line added");
      }
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const title = mode?.kind === "edit" ? (isDiscount ? "Edit discount" : "Edit line") : isDiscount ? "Add a discount" : "Add a line";
  return (
    <Dialog
      open={!!mode}
      onClose={onClose}
      dismissible={!busy}
      size="sm"
      title={title}
      description={isDiscount ? `Discounts over ${formatCents(threshold)} need an admin. The reason shows on the invoice.` : "Every change is recorded in the invoice's history."}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" loading={busy} disabled={cents === null || !description.trim() || !qtyOk} onClick={save}>
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-4 pb-2">
        {error && <Notice tone="bad">{error}</Notice>}
        <Field label={isDiscount ? "Reason" : "Description"}>
          <Input value={description} onChange={(e) => setDescription(e.target.value)} maxLength={200} placeholder={isDiscount ? "e.g. Loyal customer, scratch found" : "e.g. Tar removal"} autoFocus />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          {!isDiscount && (
            <Field label="Qty" error={qtyOk ? null : "1 to 99"}>
              <Input inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} />
            </Field>
          )}
          <Field label={isDiscount ? "Amount off" : "Price each"} error={price && cents === null ? "Like 20 or 19.50" : null} className={isDiscount ? "col-span-2" : undefined}>
            <Input inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0.00" />
          </Field>
        </div>
        {!isDiscount && cents !== null && qtyOk && (
          <p className="text-right text-sm text-fg-muted">Line total {formatCents(Math.round(cents * quantity))}</p>
        )}
      </div>
    </Dialog>
  );
}
