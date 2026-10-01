"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check, Trash2 } from "lucide-react";
import { errorMessage } from "@/lib/core/errors";
import { callRpc } from "@/lib/rpc";
import { announceChange } from "@/lib/shop/actions";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, Input, Switch } from "@/components/ui/field";
import { Notice } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";
import { useShop } from "@/components/shop-context";

const PHRASE = "DELETE EVERYTHING";

const WIPED = [
  "Every booking (past, today and upcoming)",
  "Every customer and their cars, notes and history",
  "Every invoice, payment, refund and end-of-day close",
  "Every message sent, campaign, review and feedback rating",
  "Gift vouchers, loyalty rewards, the waitlist and the audit log",
];
const KEPT = [
  "Business details, ABN and opening hours",
  "Services, prices, extras and bays",
  "Closures, promo codes (use counts reset), loyalty rules",
  "Message wording and automatic-message settings",
  "Staff logins (nobody loses access)",
];

export function ResetClient({ counts }: { counts: { customers: number; bookings: number; invoices: number } }) {
  const { supabase } = useShop();
  const router = useRouter();
  const toast = useToast();
  const [typed, setTyped] = useState("");
  const [logins, setLogins] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ok = typed.trim() === PHRASE;

  async function wipe() {
    if (!ok) return;
    setBusy(true);
    setError(null);
    try {
      const r = await callRpc<{ customers: number; bookings: number; invoices: number; customer_logins: number }>(supabase, "reset_shop_data", {
        p_confirm: PHRASE,
        p_delete_customer_logins: logins,
        p_actor: null,
      });
      announceChange();
      toast.success(
        "All data cleared",
        `${r.bookings} bookings, ${r.customers} customers, ${r.invoices} invoices removed${r.customer_logins > 0 ? `, ${r.customer_logins} online accounts` : ""}.`,
      );
      if (r.customer_logins === -1) toast.error("Customer online accounts weren't removed. Delete them in Supabase → Authentication → Users.");
      router.push("/");
      router.refresh();
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-6 @5xl:grid-cols-2">
      <Card>
        <CardHeader title="Clear all data" description="Start fresh, e.g. before handing the system to a new owner" />
        <CardBody className="space-y-5">
          <Notice tone="bad" title="This can't be undone">
            Right now there are {counts.bookings.toLocaleString("en-AU")} bookings, {counts.customers.toLocaleString("en-AU")} customers and{" "}
            {counts.invoices.toLocaleString("en-AU")} invoices. All of them will be permanently deleted.
          </Notice>
          <div>
            <p className="mb-2 flex items-center gap-2 font-semibold text-bad-ink">
              <Trash2 size={16} aria-hidden /> Deleted
            </p>
            <ul className="space-y-1.5 text-[15px]">
              {WIPED.map((w) => (
                <li key={w} className="flex gap-2">
                  <span aria-hidden className="text-bad-ink">
                    ✕
                  </span>
                  {w}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="mb-2 flex items-center gap-2 font-semibold text-ok-ink">
              <Check size={16} aria-hidden /> Kept
            </p>
            <ul className="space-y-1.5 text-[15px]">
              {KEPT.map((k) => (
                <li key={k} className="flex gap-2">
                  <span aria-hidden className="text-ok-ink">
                    ✓
                  </span>
                  {k}
                </li>
              ))}
            </ul>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Confirm" />
        <CardBody className="space-y-5">
          <Switch
            checked={logins}
            onChange={setLogins}
            label="Also delete customers' online accounts"
            description="The logins customers made on the booking site. Staff logins are never touched."
          />
          <Field label={`Type ${PHRASE} to confirm`}>
            <Input value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" spellCheck={false} placeholder={PHRASE} className="font-mono" />
          </Field>
          {error && <Notice tone="bad">{error}</Notice>}
          <Button variant="danger" size="lg" block icon={AlertTriangle} disabled={!ok || busy} loading={busy} onClick={wipe}>
            Delete all data now
          </Button>
          <p className="text-sm text-fg-muted">Tip: export your customers first (Customers → Export) if you might want them later.</p>
        </CardBody>
      </Card>
    </div>
  );
}
