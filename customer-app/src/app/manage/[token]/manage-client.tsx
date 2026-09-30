"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CalendarPlus, CalendarClock, Car, CheckCircle2, Clock, Phone, Receipt, Star, XCircle, PartyPopper } from "lucide-react";
import { cn } from "@/lib/core/cn";
import { formatCents, toCents } from "@/lib/core/money";
import { ACTIVE_BOOKING_STATUSES, VEHICLE_TYPE_LABELS } from "@/lib/core/status";
import { addDaysISO, dayKeyOf, formatClock, formatDate, formatDay, formatDuration, formatTime, shopDateOf } from "@/lib/core/time";
import { errorMessage } from "@/lib/core/errors";
import { createClient } from "@/lib/supabase/client";
import { telLink } from "@/lib/hours";
import { cancelByToken, fetchSlots, getBookingByToken, rescheduleByToken, submitFeedback, type BookingView, type PublicSettings, type Slot } from "@/lib/public";
import { Button, buttonClasses } from "@/components/ui/button";
import { ConfirmDialog, Dialog } from "@/components/ui/dialog";
import { Field, Textarea } from "@/components/ui/field";
import { Notice, Skeleton } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";

const STAGES = [
  { key: "created_at", label: "Booked", status: "pending" },
  { key: "approved_at", label: "Confirmed", status: "approved" },
  { key: "checked_in_at", label: "Dropped off", status: "checked_in" },
  { key: "started_at", label: "Being washed", status: "in_progress" },
  { key: "ready_at", label: "Ready to collect", status: "ready" },
  { key: "completed_at", label: "All done", status: "completed" },
] as const;
const ORDER = ["pending", "approved", "checked_in", "in_progress", "ready", "completed"];

function headline(b: BookingView, isNew: boolean) {
  if (b.status === "cancelled") return "Booking cancelled";
  if (b.status === "declined") return "We couldn't fit this one in";
  if (b.status === "no_show") return "We missed you";
  if (b.status === "ready") return `Your car's ready, ${b.first_name}!`;
  if (b.status === "in_progress") return "Your car's being washed";
  if (b.status === "checked_in") return "We've got your car";
  if (b.status === "completed") return `Thanks, ${b.first_name}!`;
  if (b.status === "pending") return isNew ? "Booking received!" : "Waiting for us to confirm";
  return isNew ? "You're booked in!" : "You're booked in";
}

function icsFile(b: BookingView) {
  const stamp = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const esc = (s: string) => s.replace(/([,;\\])/g, "\\$1").replace(/\n/g, "\\n");
  return [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//OzShine//Booking//EN", "BEGIN:VEVENT",
    `UID:${b.reference_code}@ozshine`, `DTSTAMP:${stamp(new Date().toISOString())}`,
    `DTSTART:${stamp(b.starts_at)}`, `DTEND:${stamp(b.ends_at)}`,
    `SUMMARY:${esc(`${b.service.name} at OzShine`)}`,
    `LOCATION:${esc(b.shop.address ?? "OzShine Beenleigh")}`,
    `DESCRIPTION:${esc(`Booking ${b.reference_code}. ${typeof window !== "undefined" ? window.location.href.split("?")[0] : ""}`)}`,
    "END:VEVENT", "END:VCALENDAR",
  ].join("\r\n");
}

export function ManageClient({ token, initial, isNew, settings }: { token: string; initial: BookingView; isNew: boolean; settings: PublicSettings | null }) {
  const [supabase] = useState(() => createClient());
  const toast = useToast();
  const [b, setB] = useState(initial);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [moveOpen, setMoveOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const active = ACTIVE_BOOKING_STATUSES.includes(b.status);
  const tel = telLink(b.shop.phone);
  const stepIndex = ORDER.indexOf(b.status);

  // Keep the tracker current while the booking is still in play.
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      getBookingByToken(supabase, token)
        .then((next) => next && setB(next))
        .catch(() => {});
    }, 30000);
    return () => window.clearInterval(id);
  }, [active, supabase, token]);

  async function cancel() {
    setBusy("cancel");
    try {
      setB(await cancelByToken(supabase, token, reason.trim()));
      setCancelOpen(false);
      toast.success("Booking cancelled");
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(null);
    }
  }

  function downloadIcs() {
    const blob = new Blob([icsFile(b)], { type: "text/calendar" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ozshine-${b.reference_code}.ics`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const estimate = toCents(b.price_estimate);
  const bad = b.status === "cancelled" || b.status === "declined" || b.status === "no_show";

  return (
    <div className="mx-auto max-w-3xl px-4 pt-8 pb-16 sm:px-6">
      <div className={cn("oz-dark relative overflow-hidden rounded-3xl bg-canvas p-6 text-fg sm:p-8", isNew && !bad && "animate-oz-in")}>
        <div aria-hidden className={cn("pointer-events-none absolute -top-20 -right-16 h-64 w-64 rounded-full blur-3xl", bad ? "bg-white/10" : "bg-accent/30")} />
        <p className="relative text-sm font-semibold tracking-widest text-fg-faint uppercase">Booking {b.reference_code}</p>
        <h1 className="relative mt-2 flex items-center gap-3 text-3xl font-extrabold tracking-tight sm:text-4xl">
          {isNew && !bad && <PartyPopper size={32} className="shrink-0 text-accent" aria-hidden />}
          {headline(b, isNew)}
        </h1>
        <p className="relative mt-3 text-lg text-fg-muted">
          {b.service.name} · {formatDay(b.date, "long", settings?.today)} at {formatTime(b.time)}
        </p>
        {isNew && b.status === "pending" && <p className="relative mt-3 text-fg-muted">We&apos;ll text you once it&apos;s confirmed. Keep this page: it&apos;s your link to check, change or cancel.</p>}
        {b.status === "in_progress" && b.estimated_ready_at && (
          <p className="relative mt-3 inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 font-semibold">
            <Clock size={18} aria-hidden /> Ready around {formatClock(b.estimated_ready_at)}
          </p>
        )}
        {b.status === "declined" && (
          <p className="relative mt-3 text-fg-muted">
            {b.decline_reason ?? "That time didn't work on our end."} Please pick another time or give us a call.
          </p>
        )}
        {b.status === "cancelled" && b.cancel_reason && <p className="relative mt-3 text-fg-muted">Reason: {b.cancel_reason}</p>}
        <div className="relative mt-6 flex flex-wrap gap-2">
          {active && !["ready", "in_progress", "checked_in"].includes(b.status) && (
            <Button variant="light" icon={CalendarPlus} onClick={downloadIcs}>
              Add to calendar
            </Button>
          )}
          {bad && (
            <Link href="/book" className={buttonClasses({ variant: "primary" })}>
              Book another time
            </Link>
          )}
          {tel && (
            <a href={tel} className={buttonClasses({ variant: "outline" })}>
              <Phone size={18} aria-hidden /> Call the shop
            </a>
          )}
        </div>
      </div>

      {!bad && (
        <ol className="mt-8 grid gap-0 sm:grid-cols-6" aria-label="Progress">
          {STAGES.map((s, i) => {
            const at = b.stages[s.key];
            const reached = i <= stepIndex;
            const current = i === stepIndex;
            return (
              <li key={s.key} className="relative flex gap-3 pb-5 sm:flex-col sm:items-center sm:pb-0 sm:text-center">
                {i < STAGES.length - 1 && (
                  <span aria-hidden className={cn("absolute top-7 left-[13px] h-[calc(100%-1.75rem)] w-0.5 sm:top-[13px] sm:left-1/2 sm:h-0.5 sm:w-full", i < stepIndex ? "bg-accent" : "bg-line")} />
                )}
                <span
                  className={cn(
                    "relative z-10 flex size-7 shrink-0 items-center justify-center rounded-full ring-4 ring-canvas",
                    reached ? "oz-gloss bg-accent text-white" : "bg-line text-fg-faint",
                    current && active && "animate-pulse",
                  )}
                >
                  {reached ? <CheckCircle2 size={16} aria-hidden /> : <span className="size-2 rounded-full bg-current" />}
                </span>
                <span className="sm:mt-2">
                  <span className={cn("block text-sm font-semibold", !reached && "text-fg-faint")}>{s.label}</span>
                  {at && reached && <span className="block text-xs text-fg-muted">{shopDateOf(at) === settings?.today ? formatClock(at) : formatDate(shopDateOf(at))}</span>}
                </span>
              </li>
            );
          })}
        </ol>
      )}

      <section className="mt-8 rounded-3xl bg-panel shadow-card ring-1 ring-line">
        <dl className="divide-y divide-line">
          <Row label="Service">
            {b.service.name}
            <span className="text-fg-muted"> · {VEHICLE_TYPE_LABELS[b.vehicle_type]}</span>
          </Row>
          {b.addons.length > 0 && <Row label="Extras">{b.addons.map((a) => a.name).join(", ")}</Row>}
          <Row label="When">
            {formatDate(b.date, "long")} at {formatTime(b.time)}
            <span className="text-fg-muted"> · about {formatDuration(b.duration_minutes)}</span>
          </Row>
          {(b.vehicle.rego || b.vehicle.make_model) && (
            <Row label="Car">
              <span className="inline-flex items-center gap-2">
                <Car size={16} className="text-fg-faint" aria-hidden />
                {[b.vehicle.rego, b.vehicle.make_model].filter(Boolean).join(" · ")}
              </span>
            </Row>
          )}
          <Row label={b.invoice ? "Total" : b.service.requires_quote ? "From" : "Estimate"}>
            {b.invoice ? formatCents(toCents(b.invoice.total)) : formatCents(estimate)}
            {!b.invoice && toCents(b.discount_estimate) > 0 && <span className="text-ok-ink"> (incl. {formatCents(toCents(b.discount_estimate))} off)</span>}
            <span className="text-fg-muted"> · pay at the shop</span>
          </Row>
          {b.shop.address && <Row label="Where">{b.shop.address}</Row>}
        </dl>
        {(b.can_modify || b.invoice) && (
          <div className="flex flex-wrap gap-2 border-t border-line p-4">
            {b.invoice && (
              <Link href={`/r/${b.invoice.public_token}`} className={buttonClasses({ variant: "secondary" })}>
                <Receipt size={18} aria-hidden /> {toCents(b.invoice.balance_due) > 0 ? `Invoice · ${formatCents(toCents(b.invoice.balance_due))} to pay` : "Receipt"}
              </Link>
            )}
            {b.can_modify && (
              <>
                <Button icon={CalendarClock} onClick={() => setMoveOpen(true)}>
                  Change time
                </Button>
                <Button variant="ghost" icon={XCircle} className="text-bad-ink" onClick={() => setCancelOpen(true)}>
                  Cancel booking
                </Button>
              </>
            )}
          </div>
        )}
      </section>
      {active && !b.can_modify && ["pending", "approved"].includes(b.status) && (
        <p className="mt-3 text-sm text-fg-muted">It&apos;s less than {b.cancel_cutoff_hours} hours away, so please call us to change or cancel.</p>
      )}

      {b.status === "completed" && <Feedback token={token} booking={b} onDone={(rating) => setB({ ...b, feedback: { rating } })} />}

      <ConfirmDialog
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        busy={busy === "cancel"}
        tone="danger"
        title="Cancel this booking?"
        description={`${b.service.name} on ${formatDate(b.date, "long")} at ${formatTime(b.time)}.`}
        confirmLabel="Yes, cancel it"
        onConfirm={cancel}
      >
        <Field label="Reason" optional>
          <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} placeholder="Helps us improve" />
        </Field>
      </ConfirmDialog>
      <RescheduleDialog key={moveOpen ? "open" : "closed"} open={moveOpen} onClose={() => setMoveOpen(false)} booking={b} token={token} settings={settings} onMoved={setB} />
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[90px_1fr] gap-3 px-5 py-4 sm:grid-cols-[120px_1fr]">
      <dt className="text-fg-muted">{label}</dt>
      <dd className="font-medium">{children}</dd>
    </div>
  );
}

function RescheduleDialog({ open, onClose, booking, token, settings, onMoved }: { open: boolean; onClose: () => void; booking: BookingView; token: string; settings: PublicSettings | null; onMoved: (b: BookingView) => void }) {
  const [supabase] = useState(() => createClient());
  const toast = useToast();
  const [date, setDate] = useState<string | null>(null);
  const [time, setTime] = useState<string | null>(null);
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const today = settings?.today ?? booking.date;
  const days = Array.from({ length: Math.min(settings?.max_advance_days ?? 30, 30) + 1 }, (_, i) => addDaysISO(today, i)).filter((d) => {
    const h = settings?.opening_hours?.[dayKeyOf(d)];
    return h && !h.closed && !settings?.blackouts.some((x) => x.date === d && !x.start_time);
  });

  useEffect(() => {
    if (!date) return;
    let cancelled = false;
    fetchSlots(supabase, date, booking.service.id, booking.addon_ids)
      .then((s) => !cancelled && setSlots(s))
      .catch((e) => !cancelled && setError(errorMessage(e)));
    return () => {
      cancelled = true;
    };
  }, [supabase, date, booking.service.id, booking.addon_ids]);

  async function move() {
    if (!date || !time) return;
    setBusy(true);
    setError(null);
    try {
      onMoved(await rescheduleByToken(supabase, token, date, time));
      toast.success("Booking moved", settings?.require_approval ? "We'll confirm the new time by text." : undefined);
      onClose();
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }

  const free = (slots ?? []).filter((s) => s.available && !(date === booking.date && s.slot_time.slice(0, 5) === booking.time));
  return (
    <Dialog
      open={open}
      onClose={onClose}
      dismissible={!busy}
      title="Change your time"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Keep current time
          </Button>
          <Button variant="primary" loading={busy} disabled={!date || !time} onClick={move}>
            Move booking
          </Button>
        </>
      }
    >
      <div className="space-y-4 pb-2">
        {error && <Notice tone="bad">{error}</Notice>}
        <div className="-mx-6 overflow-x-auto px-6 pb-1">
          <div role="radiogroup" aria-label="Day" className="flex gap-2">
            {days.map((d) => (
              <button
                key={d}
                type="button"
                role="radio"
                aria-checked={d === date}
                onClick={() => {
                  setDate(d);
                  setTime(null);
                  setSlots(null);
                }}
                className={cn("flex h-16 w-14 shrink-0 flex-col items-center justify-center rounded-xl ring-1", d === date ? "bg-[#0f1013] text-white ring-[#0f1013]" : "bg-panel ring-line")}
              >
                <span className="text-[11px] font-semibold uppercase">{d === today ? "Today" : formatDate(d, "short").split(" ")[0]}</span>
                <span className="text-xl font-extrabold">{Number(d.slice(8, 10))}</span>
              </button>
            ))}
          </div>
        </div>
        {date &&
          (slots === null ? (
            <div className="grid grid-cols-4 gap-2">
              {Array.from({ length: 8 }, (_, i) => (
                <Skeleton key={i} className="h-11 rounded-xl" />
              ))}
            </div>
          ) : free.length === 0 ? (
            <p className="text-fg-muted">No free times that day. Try another.</p>
          ) : (
            <div role="radiogroup" aria-label="Time" className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {free.map((s) => {
                const t = s.slot_time.slice(0, 5);
                return (
                  <button
                    key={t}
                    type="button"
                    role="radio"
                    aria-checked={t === time}
                    onClick={() => setTime(t)}
                    className={cn("h-11 rounded-xl font-semibold tabular-nums ring-1", t === time ? "oz-gloss bg-accent text-white ring-accent" : "bg-panel ring-line")}
                  >
                    {formatTime(t)}
                  </button>
                );
              })}
            </div>
          ))}
      </div>
    </Dialog>
  );
}

function Feedback({ token, booking, onDone }: { token: string; booking: BookingView; onDone: (rating: number) => void }) {
  const [supabase] = useState(() => createClient());
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ low_rating: boolean; review_url: string | null } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    setBusy(true);
    setError(null);
    try {
      const r = await submitFeedback(supabase, token, rating, comment.trim());
      setResult(r);
      onDone(rating);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section id="feedback" className="mt-8 scroll-mt-6 rounded-3xl bg-panel p-6 shadow-card ring-1 ring-line">
      {result ? (
        result.low_rating ? (
          <p className="text-lg">Thanks for telling us. The owner reads every one of these and will be in touch to make it right.</p>
        ) : (
          <div>
            <p className="text-lg font-semibold">Thanks, that means a lot!</p>
            {result.review_url && (
              <a href={result.review_url} target="_blank" rel="noreferrer" className={buttonClasses({ variant: "primary", className: "mt-4" })}>
                Share it in a public review
              </a>
            )}
          </div>
        )
      ) : booking.feedback ? (
        <p className="flex items-center gap-2 text-fg-muted">
          <Star size={18} className="text-accent" fill="currentColor" aria-hidden /> You rated this visit {booking.feedback.rating} out of 5. Thanks!
        </p>
      ) : (
        <>
          <h2 className="text-xl font-bold">How did we go?</h2>
          <div role="radiogroup" aria-label="Rating" className="mt-4 flex gap-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} type="button" role="radio" aria-checked={rating === n} aria-label={`${n} star${n === 1 ? "" : "s"}`} onClick={() => setRating(n)} className="rounded-lg p-1 text-accent focus-visible:outline-2 focus-visible:outline-focus">
                <Star size={36} fill={n <= rating ? "currentColor" : "none"} aria-hidden />
              </button>
            ))}
          </div>
          {rating > 0 && (
            <div className="mt-4 space-y-3">
              <Field label={rating <= 3 ? "What could we have done better?" : "Anything to add?"} optional>
                <Textarea rows={3} value={comment} onChange={(e) => setComment(e.target.value)} maxLength={2000} />
              </Field>
              {error && <p className="text-sm text-bad-ink">{error}</p>}
              <Button variant="primary" loading={busy} onClick={send}>
                Send
              </Button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
