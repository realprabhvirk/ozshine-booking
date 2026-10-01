"use client";

import { Clock, Crown, MessageSquareText, Printer, Timer } from "lucide-react";
import { cn } from "@/lib/core/cn";
import { formatCents, toCents } from "@/lib/core/money";
import { VEHICLE_TYPE_LABELS } from "@/lib/core/status";
import { formatDay, formatDuration, formatTime, todayISO } from "@/lib/core/time";
import { Button } from "@/components/ui/button";
import { Badge, InvoiceBadge } from "@/components/ui/badge";
import { liveInvoice, type BoardBooking } from "@/lib/shop/types";
import { primaryAction, useBookingActions } from "./action-host";

export function customerLabel(b: BoardBooking): string {
  if (!b.customer || b.customer.is_walkin_placeholder) return "Walk-in";
  return b.customer.name;
}

// Minutes a car has been in its current stage.
function minutesSince(iso: string | null, now: Date): number | null {
  if (!iso) return null;
  return Math.max(0, Math.round((now.getTime() - new Date(iso).getTime()) / 60000));
}

export function BookingCard({
  booking: b,
  now,
  onOpen,
  compact,
}: {
  booking: BoardBooking;
  now: Date;
  onOpen: (id: string) => void;
  compact?: boolean;
}) {
  const actions = useBookingActions();
  const busy = actions.isBusy(b.id);
  const primary = primaryAction(b.status);
  const inv = liveInvoice(b);
  const today = todayISO(now);

  const late = b.status === "approved" && now.getTime() > new Date(b.starts_at).getTime() + 15 * 60000;
  const inBayMins = b.status === "in_progress" ? minutesSince(b.started_at, now) : null;
  const over = inBayMins !== null && inBayMins > b.duration_minutes;
  const progress = inBayMins !== null ? Math.min(100, Math.round((inBayMins / Math.max(b.duration_minutes, 1)) * 100)) : null;
  const waitingMins = b.status === "checked_in" ? minutesSince(b.checked_in_at, now) : b.status === "ready" ? minutesSince(b.ready_at, now) : null;
  const price = inv ? toCents(inv.total) : toCents(b.price_estimate);

  function onPrimary() {
    if (!primary) return;
    if (primary.to === "checkout") actions.openDialog("checkout", b);
    else void actions.advance(b, primary.to);
  }

  return (
    <article
      className={cn(
        "group relative rounded-2xl bg-panel ring-1 ring-line shadow-card transition hover:ring-line-strong",
        late && "ring-2 ring-warn",
        over && "ring-2 ring-bad",
      )}
    >
      <button
        type="button"
        onClick={() => onOpen(b.id)}
        className="block w-full rounded-2xl p-4 text-left focus-visible:outline-2 focus-visible:outline-focus"
        aria-label={`Open ${b.reference_code}, ${customerLabel(b)}`}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 truncate text-[17px] font-bold text-fg">
              {b.customer?.is_vip && <Crown size={16} className="shrink-0 text-warn" aria-label="VIP" />}
              <span className="truncate">{customerLabel(b)}</span>
            </p>
            <p className="mt-0.5 truncate text-sm text-fg-muted">
              <span className="font-mono font-semibold text-fg">{b.vehicle?.rego ?? "No rego"}</span>
              {" · "}
              {[b.vehicle?.colour, b.vehicle?.make_model].filter(Boolean).join(" ") || VEHICLE_TYPE_LABELS[b.vehicle_type ?? "sedan"]}
            </p>
          </div>
          <div className="shrink-0 text-right">
            {b.status === "in_progress" && b.bay ? (
              <Badge tone="cyan">{b.bay.name}</Badge>
            ) : (
              <p className={cn("text-sm font-bold tabular-nums", late ? "text-warn-ink" : "text-fg")}>
                {b.requested_date !== today && <span className="mr-1 font-medium text-fg-muted">{formatDay(b.requested_date)}</span>}
                {formatTime(b.requested_time)}
              </p>
            )}
          </div>
        </div>

        <p className="mt-2 text-[15px] font-medium text-fg">
          {b.service?.name}
          {b.addons.length > 0 && <span className="text-fg-muted"> + {b.addons.length} extra{b.addons.length > 1 ? "s" : ""}</span>}
        </p>

        {!compact && (
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-fg-muted">
            <span className="tabular-nums">{formatCents(price)}</span>
            {b.vehicle_type && <span>{VEHICLE_TYPE_LABELS[b.vehicle_type]}</span>}
            {b.status !== "in_progress" && b.status !== "ready" && (
              <span className="inline-flex items-center gap-1">
                <Clock size={14} aria-hidden />
                {formatDuration(b.duration_minutes)}
              </span>
            )}
            {late && <span className="font-semibold text-warn-ink">Running late</span>}
            {waitingMins !== null && (
              <span className={cn("inline-flex items-center gap-1", waitingMins > 20 && "font-semibold text-warn-ink")}>
                <Timer size={14} aria-hidden />
                {b.status === "ready" ? "Ready" : "Waiting"} {formatDuration(waitingMins)}
              </span>
            )}
            {(b.customer_notes || b.internal_notes) && <MessageSquareText size={15} className="text-info" aria-label="Has notes" />}
            {inv && b.status === "ready" && <InvoiceBadge status={inv.status} />}
          </div>
        )}

        {progress !== null && (
          <div className="mt-3">
            <div className="flex justify-between text-xs font-medium text-fg-muted">
              <span>{formatDuration(inBayMins ?? 0)} in</span>
              <span className={cn(over && "font-bold text-bad-ink")}>
                {over ? `${formatDuration((inBayMins ?? 0) - b.duration_minutes)} over` : `~${formatDuration(b.duration_minutes - (inBayMins ?? 0))} left`}
              </span>
            </div>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-sunken" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} aria-label="Job progress">
              <div className={cn("h-full rounded-full transition-all", over ? "bg-bad" : "bg-cyan")} style={{ width: `${progress}%` }} />
            </div>
          </div>
        )}
      </button>

      {(primary || inv) && (
        <div className="flex gap-2 px-4 pb-4">
          {b.status === "pending" && (
            <Button variant="secondary" className="flex-1" disabled={busy} onClick={() => actions.openDialog("decline", b)}>
              Decline
            </Button>
          )}
          {primary && (
            <Button
              variant={primary.to === "ready" || primary.to === "checkout" ? "success" : "primary"}
              className="flex-1"
              loading={busy}
              onClick={onPrimary}
            >
              {primary.label}
            </Button>
          )}
          {inv && (
            <a
              href={`/print/invoice/${inv.id}?format=receipt&auto=1`}
              target="_blank"
              rel="noreferrer"
              aria-label={`Print receipt for ${b.reference_code}`}
              title="Print receipt"
              className={cn(
                "inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-xl bg-raised px-4 font-semibold text-fg ring-1 ring-line transition hover:ring-line-strong",
                "focus-visible:outline-2 focus-visible:outline-focus",
                !primary && "flex-1",
              )}
            >
              <Printer size={18} aria-hidden />
              {!primary && "Print receipt"}
            </a>
          )}
        </div>
      )}
    </article>
  );
}
