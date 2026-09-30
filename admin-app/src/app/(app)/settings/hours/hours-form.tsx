"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/core/cn";
import { formatDuration, formatTime, timeToMinutes } from "@/lib/core/time";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, Input, Select, Switch } from "@/components/ui/field";
import { Notice } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";
import { useShop } from "@/components/shop-context";
import { adminSave } from "@/lib/shop/admin";
import type { DayHours, ShopSettings } from "@/lib/shop/types";
import { SaveBar } from "../save-bar";

const DAYS: Array<{ key: string; label: string }> = [
  { key: "mon", label: "Monday" },
  { key: "tue", label: "Tuesday" },
  { key: "wed", label: "Wednesday" },
  { key: "thu", label: "Thursday" },
  { key: "fri", label: "Friday" },
  { key: "sat", label: "Saturday" },
  { key: "sun", label: "Sunday" },
];

type Form = {
  hours: Record<string, DayHours>;
  slot_minutes: number;
  max_concurrent_jobs: number;
  min_lead_minutes: number;
  max_advance_days: number;
  cancel_cutoff_hours: number;
  require_approval: boolean;
  online_booking_enabled: boolean;
};

export function HoursForm({ settings }: { settings: ShopSettings }) {
  const { supabase, bays } = useShop();
  const router = useRouter();
  const toast = useToast();
  const [initial] = useState<Form>(() => ({
    hours: Object.fromEntries(DAYS.map((d) => [d.key, settings.opening_hours?.[d.key] ?? { open: "08:00", close: "17:00", closed: false }])),
    slot_minutes: settings.slot_minutes,
    max_concurrent_jobs: settings.max_concurrent_jobs ?? bays.filter((b) => b.active).length,
    min_lead_minutes: settings.min_lead_minutes,
    max_advance_days: settings.max_advance_days,
    cancel_cutoff_hours: settings.cancel_cutoff_hours,
    require_approval: settings.require_approval,
    online_booking_enabled: settings.online_booking_enabled,
  }));
  const [f, setF] = useState<Form>(initial);
  const [busy, setBusy] = useState(false);
  const setDay = (k: string, v: Partial<DayHours>) => setF((x) => ({ ...x, hours: { ...x.hours, [k]: { ...x.hours[k], ...v } } }));

  const dayErrors = Object.fromEntries(
    DAYS.map((d) => {
      const h = f.hours[d.key];
      return [d.key, !h.closed && timeToMinutes(h.close) <= timeToMinutes(h.open) ? "Closing must be after opening" : null];
    }),
  );
  const activeBays = bays.filter((b) => b.active).length;
  const valid = Object.values(dayErrors).every((e) => !e) && f.max_concurrent_jobs >= 1 && f.max_concurrent_jobs <= 50;
  const dirty = JSON.stringify(f) !== JSON.stringify(initial);

  async function save() {
    if (!valid) return;
    setBusy(true);
    try {
      await adminSave(supabase, "settings", settings.id, {
        opening_hours: f.hours,
        slot_minutes: f.slot_minutes,
        max_concurrent_jobs: f.max_concurrent_jobs,
        min_lead_minutes: f.min_lead_minutes,
        max_advance_days: f.max_advance_days,
        cancel_cutoff_hours: f.cancel_cutoff_hours,
        require_approval: f.require_approval,
        online_booking_enabled: f.online_booking_enabled,
      });
      toast.success("Hours & booking rules saved");
      router.refresh();
    } catch (e) {
      toast.error(e, "Couldn't save");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-6 @5xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader title="Opening hours" description="Bookings can only be made inside these. For one-off closures use the Closures tab." />
          <ul className="divide-y divide-line">
            {DAYS.map((d) => {
              const h = f.hours[d.key];
              return (
                <li key={d.key} className="flex flex-wrap items-center gap-3 px-5 py-3">
                  <span className="w-28 font-semibold">{d.label}</span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={!h.closed}
                    aria-label={`${d.label} open`}
                    onClick={() => setDay(d.key, { closed: !h.closed })}
                    className={cn("h-10 rounded-lg px-3 text-sm font-semibold ring-1 ring-inset", h.closed ? "bg-sunken text-fg-muted ring-line" : "bg-ok/12 text-ok-ink ring-ok/30")}
                  >
                    {h.closed ? "Closed" : "Open"}
                  </button>
                  {!h.closed && (
                    <div className="flex items-center gap-2">
                      <div className="w-32">
                        <Input type="time" step={900} aria-label={`${d.label} opens`} value={h.open} onChange={(e) => setDay(d.key, { open: e.target.value })} />
                      </div>
                      <span className="text-fg-muted">to</span>
                      <div className="w-32">
                        <Input type="time" step={900} aria-label={`${d.label} closes`} value={h.close} onChange={(e) => setDay(d.key, { close: e.target.value })} aria-invalid={!!dayErrors[d.key]} />
                      </div>
                    </div>
                  )}
                  {dayErrors[d.key] ? (
                    <span className="text-sm font-medium text-bad-ink">{dayErrors[d.key]}</span>
                  ) : (
                    !h.closed && <span className="text-sm text-fg-muted">{formatTime(h.open)}–{formatTime(h.close)}</span>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Capacity" />
            <CardBody className="grid gap-4 sm:grid-cols-2">
              <Field label="Cars at once" hint={`You have ${activeBays} bay${activeBays === 1 ? "" : "s"}.`}>
                <Input type="number" min={1} max={50} value={f.max_concurrent_jobs} onChange={(e) => setF((x) => ({ ...x, max_concurrent_jobs: Number(e.target.value) }))} />
              </Field>
              <Field label="Booking slots every">
                <Select value={f.slot_minutes} onChange={(e) => setF((x) => ({ ...x, slot_minutes: Number(e.target.value) }))}>
                  {[10, 15, 20, 30, 45, 60].map((m) => (
                    <option key={m} value={m}>
                      {m} minutes
                    </option>
                  ))}
                </Select>
              </Field>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Online booking" />
            <CardBody className="space-y-4">
              <Switch checked={f.online_booking_enabled} onChange={(v) => setF((x) => ({ ...x, online_booking_enabled: v }))} label="Take bookings online" description="Off = the booking site asks people to call instead." />
              <Switch checked={f.require_approval} onChange={(v) => setF((x) => ({ ...x, require_approval: v }))} label="Approve each online booking" description="Off = online bookings are confirmed straight away if the time is free." />
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="Minimum notice" hint={formatDuration(f.min_lead_minutes)}>
                  <Select value={f.min_lead_minutes} onChange={(e) => setF((x) => ({ ...x, min_lead_minutes: Number(e.target.value) }))}>
                    {[0, 30, 60, 120, 180, 240, 720, 1440, 2880].map((m) => (
                      <option key={m} value={m}>
                        {m === 0 ? "None" : formatDuration(m)}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Book up to" hint="days ahead">
                  <Input type="number" min={1} max={365} value={f.max_advance_days} onChange={(e) => setF((x) => ({ ...x, max_advance_days: Number(e.target.value) }))} />
                </Field>
                <Field label="Online cancel cut-off" hint="hours before">
                  <Input type="number" min={0} max={168} value={f.cancel_cutoff_hours} onChange={(e) => setF((x) => ({ ...x, cancel_cutoff_hours: Number(e.target.value) }))} />
                </Field>
              </div>
              {!f.online_booking_enabled && <Notice tone="warn">Online booking is off. Staff can still book people in from the till.</Notice>}
            </CardBody>
          </Card>
        </div>
      </div>
      <SaveBar dirty={dirty} busy={busy} onSave={save} onReset={() => setF(initial)} />
    </div>
  );
}
