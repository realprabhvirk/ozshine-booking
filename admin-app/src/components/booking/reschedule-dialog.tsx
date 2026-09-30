"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/core/cn";
import { errorMessage, toAppError } from "@/lib/core/errors";
import { addDaysISO, formatDay, formatTime, todayISO } from "@/lib/core/time";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Notice, Spinner } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";
import { useShop } from "@/components/shop-context";
import { updateBookingDetails } from "@/lib/shop/actions";
import type { BoardBooking } from "@/lib/shop/types";

type Slot = { slot_time: string; available: boolean; reason: string | null };

// Move a booking that hasn't arrived yet to another day / time.
export function RescheduleDialog({ booking, open, onClose }: { booking: BoardBooking | null; open: boolean; onClose: () => void }) {
  const { supabase } = useShop();
  const toast = useToast();
  const [date, setDate] = useState(booking?.requested_date ?? todayISO());
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [slotError, setSlotError] = useState<string | null>(null);
  const [time, setTime] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [clash, setClash] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !booking?.service) return;
    let cancelled = false;
    supabase
      .rpc("get_available_slots", { p_date: date, p_service_id: booking.service.id, p_addon_ids: [] })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) setSlotError(errorMessage(error));
        else {
          setSlotError(null);
          setSlots((data ?? []) as Slot[]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [open, date, booking, supabase]);

  async function save(force = false) {
    if (!booking || !time) return;
    setBusy(true);
    try {
      await updateBookingDetails(supabase, booking.id, { requested_date: date, requested_time: time, force });
      toast.success("Booking moved", `${formatDay(date)} at ${formatTime(time)}`);
      onClose();
    } catch (e) {
      const err = toAppError(e);
      if (err.code === "SLOT_TAKEN" && !force) setClash(err.message);
      else toast.error(err, "Couldn't move the booking");
    } finally {
      setBusy(false);
    }
  }

  const days = Array.from({ length: 14 }, (_, i) => addDaysISO(todayISO(), i));
  return (
    <Dialog
      open={open}
      onClose={onClose}
      dismissible={!busy}
      size="lg"
      title="Move booking"
      description={booking ? `${booking.reference_code} · ${booking.service?.name} · now ${formatDay(booking.requested_date)} ${formatTime(booking.requested_time)}` : undefined}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          {clash ? (
            <Button variant="danger" loading={busy} onClick={() => save(true)}>
              Double-book anyway
            </Button>
          ) : (
            <Button variant="primary" loading={busy} disabled={!time} onClick={() => save(false)}>
              {time ? `Move to ${formatDay(date)} ${formatTime(time)}` : "Pick a time"}
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-4 pb-2">
        <div className="flex gap-2 overflow-x-auto pb-1">
          {days.map((d) => (
            <Button
              key={d}
              size="sm"
              variant={d === date ? "primary" : "secondary"}
              onClick={() => {
                setDate(d);
                setTime(null);
                setClash(null);
                setSlots(null);
              }}
            >
              {formatDay(d)}
            </Button>
          ))}
        </div>
        <Field label="Or pick a date">
          <Input
            type="date"
            value={date}
            min={todayISO()}
            onChange={(e) => {
              if (!e.target.value) return;
              setDate(e.target.value);
              setTime(null);
              setClash(null);
              setSlots(null);
            }}
          />
        </Field>
        {slotError && <Notice tone="bad">{slotError}</Notice>}
        {!slots && !slotError && <Spinner />}
        {slots && slots.length === 0 && <Notice tone="warn">Closed that day.</Notice>}
        {slots && slots.length > 0 && (
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
            {slots.map((s) => {
              const t = s.slot_time.slice(0, 5);
              const on = time === t;
              const past = s.reason === "PAST";
              return (
                <button
                  key={t}
                  type="button"
                  disabled={past}
                  onClick={() => {
                    setTime(t);
                    setClash(null);
                  }}
                  className={cn(
                    "h-12 rounded-xl text-sm font-semibold ring-1 ring-inset transition focus-visible:outline-2 focus-visible:outline-focus",
                    on ? "bg-accent text-accent-fg ring-accent" : s.available ? "bg-raised ring-line hover:ring-line-strong" : "bg-sunken text-fg-faint ring-line line-through",
                    past && "opacity-40",
                  )}
                  aria-label={`${formatTime(t)}${s.available ? "" : " (full)"}`}
                >
                  {formatTime(t)}
                </button>
              );
            })}
          </div>
        )}
        {clash && (
          <Notice tone="warn" title="That time is full">
            {clash} You can still double-book it if you know you can fit it in.
          </Notice>
        )}
      </div>
    </Dialog>
  );
}

