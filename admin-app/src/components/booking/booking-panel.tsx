"use client";

import { useState } from "react";
import Link from "next/link";
import { CalendarClock, Car, Crown, History, Mail, Phone, ReceiptText, StickyNote, UserRound } from "lucide-react";
import { cn } from "@/lib/core/cn";
import { formatCents, toCents } from "@/lib/core/money";
import { formatPhone } from "@/lib/core/phone";
import { BOOKING_SOURCE_LABELS, BOOKING_STATUS_META, VEHICLE_TYPE_LABELS } from "@/lib/core/status";
import { formatClock, formatDay, formatDuration, formatTime, shopDateOf } from "@/lib/core/time";
import { Sheet } from "@/components/ui/dialog";
import { Button, LinkButton } from "@/components/ui/button";
import { Badge, InvoiceBadge, StatusBadge } from "@/components/ui/badge";
import { Notice, Skeleton } from "@/components/ui/feedback";
import { Textarea } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { useShop } from "@/components/shop-context";
import { fetchBooking } from "@/lib/shop/queries";
import { updateBookingDetails } from "@/lib/shop/actions";
import { useLiveData } from "@/lib/shop/hooks";
import { useBookingPanel } from "@/lib/shop/use-booking-panel";
import { liveInvoice, type BoardBooking } from "@/lib/shop/types";
import { errorMessage } from "@/lib/core/errors";
import { primaryAction, useBookingActions } from "./action-host";
import { customerLabel } from "./booking-card";

// Opened by ?booking=<id> from anywhere in the app.
export function BookingPanelHost() {
  const { openId, close } = useBookingPanel();
  return (
    <Sheet open={!!openId} onClose={close} title="Booking details" width="md">
      {openId && <PanelBody key={openId} id={openId} />}
    </Sheet>
  );
}

function Row({ icon: Icon, children }: { icon: typeof Phone; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 py-2">
      <Icon size={18} className="mt-0.5 shrink-0 text-fg-faint" aria-hidden />
      <div className="min-w-0 flex-1 text-[15px]">{children}</div>
    </div>
  );
}

function PanelBody({ id }: { id: string }) {
  const { supabase, staff } = useShop();
  const toast = useToast();
  const actions = useBookingActions();
  const { data: b, error } = useLiveData<BoardBooking | null>({
    supabase,
    locationId: staff.location_id,
    initial: null,
    load: () => fetchBooking(supabase, id),
    channel: `panel-${id}`,
  });
  const [notes, setNotes] = useState<string | null>(null);
  const [savingNotes, setSavingNotes] = useState(false);

  if (error && !b) return <Notice tone="bad" title="Couldn't load this booking">{errorMessage(error)}</Notice>;
  if (!b) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  const meta = BOOKING_STATUS_META[b.status];
  const inv = liveInvoice(b);
  const primary = primaryAction(b.status);
  const busy = actions.isBusy(b.id);
  const walkin = !b.customer || b.customer.is_walkin_placeholder;
  const noteValue = notes ?? b.internal_notes ?? "";

  async function saveNotes() {
    setSavingNotes(true);
    try {
      await updateBookingDetails(supabase, b!.id, { internal_notes: noteValue.trim() });
      toast.success("Notes saved");
      setNotes(null);
    } catch (e) {
      toast.error(e, "Couldn't save notes");
    } finally {
      setSavingNotes(false);
    }
  }

  const timeline: Array<[string, string | null]> = [
    ["Booked", b.created_at],
    ["Approved", b.approved_at],
    ["Arrived", b.checked_in_at],
    ["Started", b.started_at],
    ["Ready", b.ready_at],
    ["Completed", b.completed_at],
  ];

  return (
    <div className="space-y-6">
      <header>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={b.status} />
          <Badge tone="neutral">{BOOKING_SOURCE_LABELS[b.source]}</Badge>
          {b.customer?.is_vip && (
            <Badge tone="warn">
              <Crown size={12} aria-hidden /> VIP
            </Badge>
          )}
          <span className="ml-auto font-mono text-sm font-semibold text-fg-muted">{b.reference_code}</span>
        </div>
        <h3 className="mt-3 text-2xl font-bold tracking-tight">{customerLabel(b)}</h3>
        <p className="text-fg-muted">{meta.hint}</p>
      </header>

      {primary && (
        <div className="flex flex-wrap gap-2">
          {b.status === "pending" && (
            <Button variant="secondary" size="lg" className="flex-1" disabled={busy} onClick={() => actions.openDialog("decline", b)}>
              Decline
            </Button>
          )}
          <Button
            size="lg"
            className="flex-1"
            variant={primary.to === "ready" || primary.to === "checkout" ? "success" : "primary"}
            loading={busy}
            onClick={() => (primary.to === "checkout" ? actions.openDialog("checkout", b) : actions.advance(b, primary.to))}
          >
            {primary.label}
          </Button>
        </div>
      )}
      {b.status === "completed" && inv && toCents(inv.balance_due) > 0 && (
        <Button variant="success" size="lg" block onClick={() => actions.openDialog("checkout", b)}>
          Take payment · {formatCents(toCents(inv.balance_due))} owing
        </Button>
      )}

      <section className="divide-y divide-line rounded-2xl bg-raised px-4 ring-1 ring-line">
        <Row icon={CalendarClock}>
          <p className="font-semibold">
            {formatDay(b.requested_date, "long")} · {formatTime(b.requested_time)}
          </p>
          <p className="text-sm text-fg-muted">About {formatDuration(b.duration_minutes)} · until {formatClock(b.ends_at)}</p>
        </Row>
        <Row icon={Car}>
          <p className="font-semibold">
            <span className="font-mono">{b.vehicle?.rego ?? "No rego"}</span>
            {b.vehicle_type && <span className="font-normal text-fg-muted"> · {VEHICLE_TYPE_LABELS[b.vehicle_type]}</span>}
          </p>
          {(b.vehicle?.make_model || b.vehicle?.colour) && (
            <p className="text-sm text-fg-muted">{[b.vehicle?.colour, b.vehicle?.make_model].filter(Boolean).join(" ")}</p>
          )}
        </Row>
        <Row icon={ReceiptText}>
          <p className="font-semibold">{b.service?.name}</p>
          {b.addons.map((a) => (
            <p key={a.name_snapshot} className="text-sm text-fg-muted">
              + {a.name_snapshot} ({formatCents(toCents(a.price_snapshot))})
            </p>
          ))}
          <p className="mt-1 text-sm">
            {inv ? (
              <Link href={`/invoices/${inv.id}`} className="inline-flex items-center gap-2 hover:underline">
                <span className="font-mono font-semibold text-accent-ink">{inv.number}</span> <InvoiceBadge status={inv.status} />
                <span className="tabular-nums">{formatCents(toCents(inv.total))}</span>
              </Link>
            ) : (
              <span className="text-fg-muted">
                Estimate <span className="tabular-nums">{formatCents(toCents(b.price_estimate))}</span>
                {toCents(b.discount_estimate) > 0 && ` (incl. ${formatCents(toCents(b.discount_estimate))} off)`}
              </span>
            )}
          </p>
        </Row>
        {b.status === "in_progress" && b.bay && (
          <Row icon={Car}>
            <p className="font-semibold">In {b.bay.name}</p>
            {b.assigned && <p className="text-sm text-fg-muted">With {b.assigned.name}</p>}
          </Row>
        )}
      </section>

      {!walkin && b.customer && (
        <section className="rounded-2xl bg-raised px-4 ring-1 ring-line">
          <Row icon={UserRound}>
            <p className="font-semibold">{b.customer.name}</p>
          </Row>
          {b.customer.phone && (
            <div className="flex items-center gap-2 border-t border-line py-2">
              <Phone size={18} className="shrink-0 text-fg-faint" aria-hidden />
              <span className="flex-1 font-medium tabular-nums">{formatPhone(b.customer.phone)}</span>
              <LinkButton href={`tel:${b.customer.phone}`} size="sm" icon={Phone}>
                Call
              </LinkButton>
            </div>
          )}
          {b.customer.email && (
            <div className="border-t border-line">
              <Row icon={Mail}>
                <span className="break-all">{b.customer.email}</span>
              </Row>
            </div>
          )}
          <div className="border-t border-line py-2">
            <Link
              href={`/customers?q=${encodeURIComponent(b.customer.phone ?? b.customer.name)}`}
              className="inline-flex min-h-10 items-center gap-2 text-sm font-semibold text-accent-ink hover:underline"
            >
              <History size={16} aria-hidden /> Visit history
            </Link>
          </div>
        </section>
      )}

      {b.customer_notes && (
        <Notice tone="info" title="Customer's note">
          {b.customer_notes}
        </Notice>
      )}

      <section>
        <label htmlFor="internal-notes" className="mb-1.5 flex items-center gap-2 text-sm font-semibold">
          <StickyNote size={16} className="text-fg-faint" aria-hidden /> Staff notes
        </label>
        <Textarea id="internal-notes" value={noteValue} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Only staff can see these" maxLength={1000} />
        {notes !== null && notes !== (b.internal_notes ?? "") && (
          <div className="mt-2 flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setNotes(null)}>
              Undo
            </Button>
            <Button size="sm" variant="primary" loading={savingNotes} onClick={saveNotes}>
              Save notes
            </Button>
          </div>
        )}
      </section>

      <section aria-label="Timeline">
        <h4 className="mb-2 text-sm font-semibold text-fg-muted">Timeline</h4>
        <ol className="space-y-1.5">
          {timeline.map(([label, at]) => (
            <li key={label} className={cn("flex items-center gap-3 text-sm", !at && "text-fg-faint")}>
              <span className={cn("size-2.5 rounded-full", at ? "bg-ok" : "bg-line-strong")} aria-hidden />
              <span className="w-24">{label}</span>
              <span className="tabular-nums">{at ? `${formatDay(shopDateOf(at))} ${formatClock(at)}` : "—"}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="flex flex-wrap gap-2 border-t border-line pt-4">
        {(b.status === "pending" || b.status === "approved") && (
          <Button variant="secondary" onClick={() => actions.openDialog("reschedule", b)}>
            Move date / time
          </Button>
        )}
        {(b.status === "approved" || b.status === "checked_in") && (
          <Button variant="secondary" onClick={() => actions.openDialog("bay", b)}>
            Start in a bay…
          </Button>
        )}
        {b.status === "approved" && (
          <Button variant="ghost" onClick={() => actions.openDialog("no_show", b)}>
            No-show
          </Button>
        )}
        {(b.status === "pending" || b.status === "approved" || b.status === "checked_in") && (
          <Button variant="ghost" className="text-bad-ink" onClick={() => actions.openDialog("cancel", b)}>
            Cancel booking
          </Button>
        )}
      </section>
    </div>
  );
}
