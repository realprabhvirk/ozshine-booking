"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BellRing, CalendarCheck, Car, ChevronDown, CircleDollarSign, Inbox, PlusCircle, Sparkles, Wallet } from "lucide-react";
import { cn } from "@/lib/core/cn";
import { formatCents, toCents, sumCents } from "@/lib/core/money";
import { formatClock, formatTime, todayISO } from "@/lib/core/time";
import { Stat } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/button";
import { Badge, InvoiceBadge } from "@/components/ui/badge";
import { EmptyState, Notice } from "@/components/ui/feedback";
import { useShop } from "@/components/shop-context";
import { BookingCard, customerLabel } from "@/components/booking/booking-card";
import { fetchBoard, fetchStats } from "@/lib/shop/queries";
import { useLiveData, useNow, type LiveStatus } from "@/lib/shop/hooks";
import { useBookingPanel } from "@/lib/shop/use-booking-panel";
import { liveInvoice, type BoardBooking, type DashboardStats } from "@/lib/shop/types";
import { errorMessage } from "@/lib/core/errors";
import { playAlertSound } from "@/lib/alert-sound";

type FloorData = { bookings: BoardBooking[]; stats: DashboardStats };

export function LiveDot({ status }: { status: LiveStatus }) {
  const label = status === "live" ? "Live" : status === "connecting" ? "Connecting…" : "Updating every 15s";
  return (
    <span className="inline-flex items-center gap-2 text-sm font-medium text-fg-muted" role="status">
      <span className="relative flex size-2.5">
        {status === "live" && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-ok opacity-60" />}
        <span className={cn("relative inline-flex size-2.5 rounded-full", status === "live" ? "bg-ok" : "bg-warn")} />
      </span>
      {label}
    </span>
  );
}

function Column({ title, count, hint, tone, children }: { title: string; count: number; hint?: string; tone: string; children: React.ReactNode }) {
  return (
    <section aria-label={title} className="flex min-w-0 flex-col">
      <header className="mb-3 flex items-baseline justify-between gap-2 px-1">
        <h2 className="flex items-center gap-2 text-sm font-bold tracking-wide text-fg uppercase">
          <span className={cn("size-2.5 rounded-full", tone)} aria-hidden />
          {title}
          <span className="rounded-full bg-raised px-2 py-0.5 text-xs text-fg-muted ring-1 ring-line tabular-nums">{count}</span>
        </h2>
        {hint && <span className="text-xs text-fg-muted">{hint}</span>}
      </header>
      <div className="flex flex-col gap-3">{children}</div>
    </section>
  );
}

function EmptyColumn({ text }: { text: string }) {
  return <p className="rounded-2xl border-2 border-dashed border-line px-4 py-8 text-center text-sm text-fg-faint">{text}</p>;
}

export function FloorClient({ initial }: { initial: FloorData }) {
  const { supabase, staff, bays, settings } = useShop();
  const panel = useBookingPanel();
  const now = useNow(30_000);
  const [showDone, setShowDone] = useState(false);

  const load = useCallback(async (): Promise<FloorData> => {
    const [bookings, stats] = await Promise.all([fetchBoard(supabase, todayISO()), fetchStats(supabase)]);
    return { bookings, stats };
  }, [supabase]);

  const { data, status, error } = useLiveData<FloorData>({
    supabase,
    locationId: staff.location_id,
    initial,
    load,
    channel: "floor",
    chime: true,
  });

  // Without live updates the chime can't come from the database event, so
  // chime when a refresh turns up an online request we haven't seen yet.
  const seenPending = useRef<Set<string> | null>(null);
  useEffect(() => {
    const ids = data.bookings.filter((b) => b.status === "pending").map((b) => b.id);
    const seen = seenPending.current;
    if (seen && status !== "live" && ids.some((id) => !seen.has(id))) {
      playAlertSound(settings?.alert_sound ?? "chime", Number(settings?.alert_volume ?? 0.6));
    }
    seenPending.current = new Set(ids);
  }, [data.bookings, status, settings?.alert_sound, settings?.alert_volume]);

  const today = todayISO(now);
  const groups = useMemo(() => {
    const by = (s: string) => data.bookings.filter((b) => b.status === s);
    return {
      requests: by("pending").sort((a, b) => a.created_at.localeCompare(b.created_at)),
      booked: by("approved").filter((b) => b.requested_date <= today),
      arrived: by("checked_in"),
      inBay: by("in_progress"),
      ready: by("ready"),
      done: by("completed").filter((b) => b.requested_date === today || (b.completed_at ?? "").startsWith(today)),
    };
  }, [data.bookings, today]);

  const activeBays = bays.filter((b) => b.active);
  const doneTotal = sumCents(groups.done.map((b) => toCents(liveInvoice(b)?.total ?? b.price_estimate)));
  const s = data.stats;

  return (
    <div className="mx-auto max-w-[1600px]">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Today on the floor</h1>
          <LiveDot status={status} />
        </div>
        <div className="flex gap-2">
          <LinkButton href="/new" variant="primary" size="lg" icon={PlusCircle}>
            Walk-in
          </LinkButton>
          <LinkButton href="/new?mode=later" size="lg" icon={CalendarCheck}>
            Phone booking
          </LinkButton>
        </div>
      </div>

      {error ? (
        <Notice tone="warn" className="mb-4" title="Showing the last loaded board">
          {errorMessage(error)}
        </Notice>
      ) : null}

      <div className="mb-6 grid grid-cols-2 gap-3 @4xl:grid-cols-4">
        <Stat label="Cars done" value={s.done_today} sub={`${s.scheduled_today} more booked today`} icon={<Car size={18} />} />
        <Stat label="Revenue today" value={formatCents(toCents(s.revenue_today))} sub="Completed jobs, incl. GST" icon={<CircleDollarSign size={18} />} />
        <Stat
          label="In bays"
          value={`${s.in_bay} / ${activeBays.length}`}
          sub={`${s.arrived} waiting · ${s.ready} ready`}
          icon={<Sparkles size={18} />}
        />
        <Stat
          label="Taken today"
          value={formatCents(toCents(s.payments_today))}
          sub={toCents(s.outstanding_today) > 0 ? `${formatCents(toCents(s.outstanding_today))} still owing` : "Nothing owing"}
          icon={<Wallet size={18} />}
        />
      </div>

      {groups.requests.length > 0 && (
        <section aria-label="Requests waiting" className="mb-6 rounded-2xl bg-warn/8 p-4 ring-1 ring-warn/30">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-bold tracking-wide text-warn-ink uppercase">
            <BellRing size={16} aria-hidden />
            {groups.requests.length} request{groups.requests.length > 1 ? "s" : ""} waiting for approval
          </h2>
          <div className="grid gap-3 @2xl:grid-cols-2 @6xl:grid-cols-3">
            {groups.requests.map((b) => (
              <BookingCard key={b.id} booking={b} now={now} onOpen={panel.open} />
            ))}
          </div>
        </section>
      )}

      <div className="grid gap-4 @2xl:grid-cols-2 @5xl:grid-cols-4">
        <Column title="Booked" count={groups.booked.length} hint="Due today" tone="bg-info">
          {groups.booked.length === 0 ? <EmptyColumn text="No more bookings due today." /> : groups.booked.map((b) => <BookingCard key={b.id} booking={b} now={now} onOpen={panel.open} />)}
        </Column>
        <Column title="Arrived" count={groups.arrived.length} hint="Waiting for a bay" tone="bg-violet">
          {groups.arrived.length === 0 ? <EmptyColumn text="No cars waiting." /> : groups.arrived.map((b) => <BookingCard key={b.id} booking={b} now={now} onOpen={panel.open} />)}
        </Column>
        <Column title="In bays" count={groups.inBay.length} hint={`${Math.max(activeBays.length - groups.inBay.length, 0)} free`} tone="bg-cyan">
          {activeBays.length > 0 && (
            <div className="flex flex-wrap gap-1.5" aria-label="Bays">
              {activeBays.map((bay) => {
                const job = groups.inBay.find((b) => b.bay?.id === bay.id);
                return (
                  <Badge key={bay.id} tone={job ? "cyan" : "neutral"}>
                    {bay.name}: {job ? (job.vehicle?.rego ?? customerLabel(job)) : "free"}
                  </Badge>
                );
              })}
            </div>
          )}
          {groups.inBay.length === 0 ? <EmptyColumn text="All bays free." /> : groups.inBay.map((b) => <BookingCard key={b.id} booking={b} now={now} onOpen={panel.open} />)}
        </Column>
        <Column title="Ready" count={groups.ready.length} hint="Pickup & payment" tone="bg-ok">
          {groups.ready.length === 0 ? <EmptyColumn text="Nothing waiting for pickup." /> : groups.ready.map((b) => <BookingCard key={b.id} booking={b} now={now} onOpen={panel.open} />)}
        </Column>
      </div>

      <section aria-label="Done today" className="mt-8 rounded-2xl bg-panel ring-1 ring-line shadow-card">
        <button
          type="button"
          onClick={() => setShowDone((v) => !v)}
          aria-expanded={showDone}
          className="flex min-h-16 w-full items-center justify-between gap-3 px-5 text-left focus-visible:outline-2 focus-visible:outline-focus"
        >
          <span className="text-[15px] font-bold">
            Done today · {groups.done.length} car{groups.done.length === 1 ? "" : "s"}
          </span>
          <span className="flex items-center gap-3 text-fg-muted">
            <span className="font-semibold text-fg tabular-nums">{formatCents(doneTotal)}</span>
            <ChevronDown size={20} className={cn("transition", showDone && "rotate-180")} aria-hidden />
          </span>
        </button>
        {showDone &&
          (groups.done.length === 0 ? (
            <EmptyState icon={Inbox} title="Nothing finished yet today" className="py-8" />
          ) : (
            <ul className="divide-y divide-line border-t border-line">
              {groups.done.map((b) => {
                const inv = liveInvoice(b);
                return (
                  <li key={b.id}>
                    <button
                      type="button"
                      onClick={() => panel.open(b.id)}
                      className="flex min-h-14 w-full items-center gap-4 px-5 py-2 text-left hover:bg-raised focus-visible:bg-raised focus-visible:outline-none"
                    >
                      <span className="w-16 text-sm text-fg-muted tabular-nums">{b.completed_at ? formatClock(b.completed_at) : formatTime(b.requested_time)}</span>
                      <span className="min-w-0 flex-1 truncate font-medium">
                        {customerLabel(b)} <span className="font-mono text-sm text-fg-muted">{b.vehicle?.rego}</span>
                      </span>
                      <span className="hidden truncate text-sm text-fg-muted sm:block">{b.service?.name}</span>
                      {inv ? <InvoiceBadge status={inv.status} /> : <Badge tone="neutral">No invoice</Badge>}
                      <span className="w-20 text-right font-semibold tabular-nums">{formatCents(toCents(inv?.total ?? b.price_estimate))}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ))}
      </section>
    </div>
  );
}
