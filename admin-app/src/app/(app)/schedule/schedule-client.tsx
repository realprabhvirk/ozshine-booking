"use client";

import { useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { cn } from "@/lib/core/cn";
import { formatCents, sumCents, toCents } from "@/lib/core/money";
import { BOOKING_STATUS_META } from "@/lib/core/status";
import {
  addDaysISO, dayKeyOf, formatDate, formatDay, formatTime, minutesToTime, shopTimeOf, timeToMinutes, todayISO,
} from "@/lib/core/time";
import { Button } from "@/components/ui/button";
import { Tabs } from "@/components/ui/tabs";
import { Input } from "@/components/ui/field";
import { Notice } from "@/components/ui/feedback";
import { TONE_SOFT, TONE_SOLID } from "@/components/ui/tone";
import { useShop } from "@/components/shop-context";
import { customerLabel } from "@/components/booking/booking-card";
import { fetchRange } from "@/lib/shop/queries";
import { useLiveData, useNow } from "@/lib/shop/hooks";
import { useBookingPanel } from "@/lib/shop/use-booking-panel";
import { liveInvoice, type BoardBooking } from "@/lib/shop/types";
import { LiveDot } from "../floor-client";

export type ScheduleView = "day" | "week";

const ROW = 48; // px per slot row
const STEP = 30; // minutes per row

export function ScheduleClient({
  view,
  date,
  from,
  to,
  initial,
}: {
  view: ScheduleView;
  date: string;
  from: string;
  to: string;
  initial: BoardBooking[];
}) {
  const { supabase, staff } = useShop();
  const router = useRouter();
  const load = useCallback(() => fetchRange(supabase, from, to), [supabase, from, to]);
  const { data: bookings, status } = useLiveData({ supabase, locationId: staff.location_id, initial, load, channel: `schedule-${from}` });

  function go(next: { date?: string; view?: ScheduleView }) {
    const p = new URLSearchParams({ date: next.date ?? date, view: next.view ?? view });
    router.push(`/schedule?${p.toString()}`);
  }
  const step = view === "week" ? 7 : 1;

  return (
    <div className="mx-auto max-w-[1600px]">
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="mr-auto">
          <h1 className="text-2xl font-bold tracking-tight">
            {view === "day" ? formatDate(date, "full") : `Week of ${formatDate(from, "medium")}`}
          </h1>
          <LiveDot status={status} />
        </div>
        <Tabs
          label="View"
          value={view}
          onChange={(v) => go({ view: v })}
          tabs={[
            { id: "day", label: "Day" },
            { id: "week", label: "Week" },
          ]}
        />
        <div className="flex items-center gap-1">
          <Button size="icon" icon={ChevronLeft} aria-label={view === "day" ? "Previous day" : "Previous week"} onClick={() => go({ date: addDaysISO(date, -step) })} />
          <Button onClick={() => go({ date: todayISO() })}>Today</Button>
          <Button size="icon" icon={ChevronRight} aria-label={view === "day" ? "Next day" : "Next week"} onClick={() => go({ date: addDaysISO(date, step) })} />
        </div>
        <div className="w-44">
          <Input type="date" aria-label="Go to date" value={date} onChange={(e) => e.target.value && go({ date: e.target.value })} />
        </div>
      </div>

      {view === "day" ? <DayGrid date={date} bookings={bookings} /> : <WeekGrid from={from} bookings={bookings} onPickDay={(d) => go({ date: d, view: "day" })} />}
    </div>
  );
}

// Put overlapping bookings side by side (greedy lane packing on the grid's
// own time-of-day scale, so it always matches what's drawn).
function packLanes(items: BoardBooking[]) {
  const span = (b: BoardBooking) => {
    const s = timeToMinutes(b.requested_time);
    return [s, s + b.duration_minutes] as const;
  };
  const sorted = [...items].sort((a, b) => span(a)[0] - span(b)[0]);
  const laneEnds: number[] = [];
  const lanes = new Map<string, number>();
  for (const b of sorted) {
    const [s, e] = span(b);
    let lane = laneEnds.findIndex((end) => end <= s);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(e);
    } else laneEnds[lane] = e;
    lanes.set(b.id, lane);
  }
  return { lanes, count: Math.max(laneEnds.length, 1) };
}

function DayGrid({ date, bookings }: { date: string; bookings: BoardBooking[] }) {
  const { settings } = useShop();
  const panel = useBookingPanel();
  const router = useRouter();
  const now = useNow(60_000);
  const hours = settings?.opening_hours?.[dayKeyOf(date)];
  const closed = !hours || hours.closed;
  const capacity = settings?.max_concurrent_jobs ?? 3;

  // Grid spans opening hours, stretched to fit any booking outside them.
  const startsM = bookings.map((b) => timeToMinutes(b.requested_time));
  const endsM = bookings.map((b) => timeToMinutes(b.requested_time) + b.duration_minutes);
  const openM = Math.min(closed ? 8 * 60 : timeToMinutes(hours.open), ...startsM);
  const closeM = Math.max(closed ? 17 * 60 : timeToMinutes(hours.close), ...endsM);
  const first = Math.floor(openM / STEP) * STEP;
  const last = Math.ceil(closeM / STEP) * STEP;
  const rows = useMemo(() => Array.from({ length: (last - first) / STEP }, (_, i) => first + i * STEP), [first, last]);
  const { lanes, count } = useMemo(() => packLanes(bookings), [bookings]);

  const load = (m: number) =>
    bookings.filter((b) => {
      const s = timeToMinutes(b.requested_time);
      return s < m + STEP && s + b.duration_minutes > m;
    }).length;

  const today = todayISO(now);
  const nowM = timeToMinutes(shopTimeOf(now));
  const showNow = date === today && nowM >= first && nowM <= last;
  const isPast = (m: number) => date < today || (date === today && m + STEP <= nowM);

  return (
    <>
      {closed && (
        <Notice tone="warn" className="mb-4" title="Closed this day">
          Opening hours say the shop is closed{bookings.length ? ", but there are bookings below" : ""}.
        </Notice>
      )}
      <div className="rounded-2xl bg-panel p-3 ring-1 ring-line shadow-card">
        <div className="relative grid grid-cols-[4.5rem_1fr]">
          <div>
            {rows.map((m) => (
              <div key={m} style={{ height: ROW }} className="pr-3 text-right text-xs font-medium text-fg-muted tabular-nums">
                {m % 60 === 0 ? formatTime(minutesToTime(m)) : ""}
              </div>
            ))}
          </div>
          <div className="relative" style={{ height: rows.length * ROW }}>
            {rows.map((m, i) => {
              const full = load(m) >= capacity;
              return (
                <button
                  key={m}
                  type="button"
                  disabled={isPast(m)}
                  onClick={() => router.push(`/new?mode=later&date=${date}&time=${minutesToTime(m)}`)}
                  aria-label={`Book ${formatTime(minutesToTime(m))}${full ? " (full)" : ""}`}
                  className={cn(
                    "group absolute inset-x-0 border-t text-left transition",
                    m % 60 === 0 ? "border-line" : "border-line/50 border-dashed",
                    full ? "bg-bad/6" : "hover:bg-raised",
                    "disabled:cursor-default disabled:hover:bg-transparent",
                  )}
                  style={{ top: i * ROW, height: ROW }}
                >
                  {!isPast(m) && (
                    <span className="hidden items-center gap-1 px-2 text-xs font-semibold text-fg-faint group-hover:inline-flex">
                      <Plus size={12} aria-hidden /> Book {formatTime(minutesToTime(m))}
                    </span>
                  )}
                  {full && <span className="absolute top-1 right-2 text-[10px] font-bold tracking-wide text-bad-ink uppercase">Full</span>}
                </button>
              );
            })}

            {bookings.map((b) => {
              const s = timeToMinutes(b.requested_time);
              const lane = lanes.get(b.id) ?? 0;
              const meta = BOOKING_STATUS_META[b.status];
              return (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => panel.open(b.id)}
                  className={cn(
                    "absolute overflow-hidden rounded-xl px-3 py-1.5 text-left ring-1 ring-inset transition hover:brightness-110",
                    "focus-visible:z-20 focus-visible:outline-2 focus-visible:outline-focus",
                    TONE_SOFT[meta.tone],
                  )}
                  style={{
                    top: ((s - first) / STEP) * ROW + 2,
                    height: Math.max((b.duration_minutes / STEP) * ROW - 4, 40),
                    left: `calc(${(lane / count) * 100}% + 4px)`,
                    width: `calc(${100 / count}% - 8px)`,
                  }}
                >
                  <span className={cn("absolute inset-y-0 left-0 w-1", TONE_SOLID[meta.tone])} aria-hidden />
                  <span className="block truncate text-sm font-bold text-fg">
                    {formatTime(b.requested_time)} · {customerLabel(b)}
                  </span>
                  <span className="block truncate text-xs text-fg-muted">
                    {b.vehicle?.rego ? `${b.vehicle.rego} · ` : ""}
                    {b.service?.name} · {meta.label}
                  </span>
                </button>
              );
            })}

            {showNow && (
              <div className="pointer-events-none absolute inset-x-0 z-10 flex items-center" style={{ top: ((nowM - first) / STEP) * ROW }} aria-hidden>
                <span className="-ml-1.5 size-3 rounded-full bg-accent" />
                <span className="h-0.5 flex-1 bg-accent" />
              </div>
            )}
          </div>
        </div>
      </div>
      <p className="mt-3 text-sm text-fg-muted">
        {bookings.length} booking{bookings.length === 1 ? "" : "s"} · up to {capacity} cars at once. Tap an empty time to book it.
      </p>
    </>
  );
}

function WeekGrid({ from, bookings, onPickDay }: { from: string; bookings: BoardBooking[]; onPickDay: (d: string) => void }) {
  const { settings } = useShop();
  const panel = useBookingPanel();
  const today = todayISO();
  const days = Array.from({ length: 7 }, (_, i) => addDaysISO(from, i));
  return (
    <div className="grid gap-3 @3xl:grid-cols-7">
      {days.map((d) => {
        const list = bookings.filter((b) => b.requested_date === d).sort((a, b) => a.requested_time.localeCompare(b.requested_time));
        const hours = settings?.opening_hours?.[dayKeyOf(d)];
        const est = sumCents(list.map((b) => toCents(liveInvoice(b)?.total ?? b.price_estimate)));
        return (
          <section key={d} aria-label={formatDate(d, "long")} className={cn("flex min-w-0 flex-col rounded-2xl bg-panel ring-1 ring-line shadow-card", d === today && "ring-2 ring-accent")}>
            <button type="button" onClick={() => onPickDay(d)} className="rounded-t-2xl border-b border-line px-3 py-3 text-left hover:bg-raised focus-visible:outline-2 focus-visible:outline-focus">
              <p className="font-bold">{formatDay(d)}</p>
              <p className="text-xs text-fg-muted">
                {!hours || hours.closed ? "Closed" : `${list.length} booked · ${formatCents(est, { whole: true })}`}
              </p>
            </button>
            <ul className="flex flex-col gap-1.5 p-2">
              {list.length === 0 && <li className="px-2 py-4 text-center text-xs text-fg-faint">Nothing booked</li>}
              {list.map((b) => {
                const meta = BOOKING_STATUS_META[b.status];
                return (
                  <li key={b.id}>
                    <button
                      type="button"
                      onClick={() => panel.open(b.id)}
                      className={cn("w-full rounded-lg px-2.5 py-2 text-left ring-1 ring-inset hover:brightness-110 focus-visible:outline-2 focus-visible:outline-focus", TONE_SOFT[meta.tone])}
                    >
                      <span className="block text-xs font-bold text-fg tabular-nums">{formatTime(b.requested_time)}</span>
                      <span className="block truncate text-sm font-semibold text-fg">{customerLabel(b)}</span>
                      <span className="block truncate text-xs text-fg-muted">{b.service?.name}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
