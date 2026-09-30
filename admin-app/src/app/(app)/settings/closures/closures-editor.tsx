"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarOff, Plus, Trash2 } from "lucide-react";
import { formatDate, formatDay, formatTime, todayISO } from "@/lib/core/time";
import { errorMessage } from "@/lib/core/errors";
import { Button, LinkButton } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ConfirmDialog, Dialog } from "@/components/ui/dialog";
import { Field, Input, Switch } from "@/components/ui/field";
import { EmptyState, Notice } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";
import { useShop } from "@/components/shop-context";
import { adminDelete, adminSave } from "@/lib/shop/admin";
import { qldPublicHolidays } from "@/lib/au";

export type Closure = { id: string; date: string; reason: string; start_time: string | null; end_time: string | null };

export function ClosuresEditor({ closures, clashes }: { closures: Closure[]; clashes: Record<string, number> }) {
  const { supabase } = useShop();
  const router = useRouter();
  const toast = useToast();
  const today = todayISO();
  const [adding, setAdding] = useState(false);
  const [remove, setRemove] = useState<Closure | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const upcoming = closures.filter((c) => c.date >= today);
  const past = closures.filter((c) => c.date < today).reverse();
  const year = Number(today.slice(0, 4));
  const taken = new Set(closures.filter((c) => !c.start_time).map((c) => c.date));
  const suggestions = [...qldPublicHolidays(year), ...qldPublicHolidays(year + 1)].filter((h) => h.date >= today && h.date <= `${year + 1}-06-30` && !taken.has(h.date));

  async function addHolidays() {
    setBusy("holidays");
    try {
      for (const d of picked) {
        const h = suggestions.find((s) => s.date === d);
        await adminSave(supabase, "blackout_dates", null, { date: d, reason: h?.name ?? "Public holiday" });
      }
      toast.success(`${picked.length} closure${picked.length === 1 ? "" : "s"} added`);
      setPicked([]);
      router.refresh();
    } catch (e) {
      toast.error(e, "Couldn't add them all");
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  async function doRemove() {
    if (!remove) return;
    setBusy("remove");
    try {
      await adminDelete(supabase, "blackout_dates", remove.id);
      toast.success("Closure removed", "That time can be booked again.");
      setRemove(null);
      router.refresh();
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(null);
    }
  }

  const when = (c: Closure) => (c.start_time && c.end_time ? `${formatTime(c.start_time)}–${formatTime(c.end_time)}` : "All day");

  return (
    <div className="grid gap-6 @5xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
      <div className="space-y-6">
        <Card>
          <CardHeader title="Upcoming closures" description="No bookings can be made in these times" action={<Button size="sm" variant="primary" icon={Plus} onClick={() => setAdding(true)}>Add closure</Button>} />
          {upcoming.length === 0 ? (
            <EmptyState icon={CalendarOff} title="Open as normal" description="Add public holidays, staff days or one-off closures." className="py-8" />
          ) : (
            <ul className="divide-y divide-line">
              {upcoming.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">
                      {formatDay(c.date, "long")} <span className="font-normal text-fg-muted">· {when(c)}</span>
                    </p>
                    <p className="text-sm text-fg-muted">{c.reason}</p>
                  </div>
                  {clashes[c.date] ? (
                    <LinkButton href={`/schedule?date=${c.date}`} size="sm" variant="outline" className="text-warn-ink">
                      {clashes[c.date]} booking{clashes[c.date] > 1 ? "s" : ""} that day
                    </LinkButton>
                  ) : null}
                  <Button size="icon-sm" variant="ghost" icon={Trash2} aria-label={`Remove closure on ${formatDate(c.date, "medium")}`} onClick={() => setRemove(c)} />
                </li>
              ))}
            </ul>
          )}
        </Card>
        {Object.keys(clashes).length > 0 && (
          <Notice tone="warn" title="Some closed days already have bookings">
            Closing a day doesn&apos;t cancel existing bookings. Open the day in the schedule and move or cancel them, and give the customers a call.
          </Notice>
        )}
        {past.length > 0 && (
          <Card>
            <CardHeader title="Recent past closures" />
            <ul className="divide-y divide-line">
              {past.slice(0, 10).map((c) => (
                <li key={c.id} className="px-5 py-2.5 text-sm text-fg-muted">
                  {formatDate(c.date, "medium")} · {when(c)} · {c.reason}
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>

      <Card>
        <CardHeader title="Queensland public holidays" description={`Suggested until June ${year + 1}`} />
        <CardBody className="space-y-3">
          {suggestions.length === 0 ? (
            <p className="text-sm text-fg-muted">All added.</p>
          ) : (
            <ul className="space-y-1">
              {suggestions.map((h) => {
                const on = picked.includes(h.date);
                return (
                  <li key={h.date + h.name}>
                    <label className="flex min-h-12 cursor-pointer items-center gap-3 rounded-xl px-3 hover:bg-raised">
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() => setPicked((p) => (on ? p.filter((x) => x !== h.date) : [...p, h.date]))}
                        className="size-5 accent-[var(--oz-accent)]"
                      />
                      <span className="flex-1">
                        <span className="font-medium">{h.name}</span>
                        <span className="block text-sm text-fg-muted">{formatDate(h.date, "full")}</span>
                      </span>
                      {clashes[h.date] ? <Badge tone="warn">Booked</Badge> : null}
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
          {suggestions.length > 0 && (
            <div className="flex flex-wrap gap-2">
              <Button variant="primary" icon={Plus} disabled={!picked.length} loading={busy === "holidays"} onClick={addHolidays}>
                Close on {picked.length || "selected"} day{picked.length === 1 ? "" : "s"}
              </Button>
              <Button variant="ghost" onClick={() => setPicked(picked.length === suggestions.length ? [] : suggestions.map((s) => s.date))}>
                {picked.length === suggestions.length ? "Clear" : "Select all"}
              </Button>
            </div>
          )}
          <p className="text-xs text-fg-faint">
            Worked out from the usual rules. Check them against the official list at qld.gov.au. The Ekka show holiday varies by area, so it isn&apos;t included.
          </p>
        </CardBody>
      </Card>

      <ClosureDialog key={adding ? "open" : "closed"} open={adding} onClose={() => setAdding(false)} />
      <ConfirmDialog
        open={!!remove}
        onClose={() => setRemove(null)}
        onConfirm={doRemove}
        busy={busy === "remove"}
        title="Remove this closure?"
        description={remove ? `${formatDate(remove.date, "full")} · ${when(remove)} · ${remove.reason}` : undefined}
        confirmLabel="Remove"
      />
    </div>
  );
}

function ClosureDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { supabase } = useShop();
  const router = useRouter();
  const toast = useToast();
  const [date, setDate] = useState(todayISO());
  const [allDay, setAllDay] = useState(true);
  const [from, setFrom] = useState("12:00");
  const [to, setTo] = useState("13:00");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const valid = !!date && reason.trim().length > 0 && (allDay || from < to);

  async function save() {
    if (!valid) return;
    setBusy(true);
    setError(null);
    try {
      await adminSave(supabase, "blackout_dates", null, { date, reason: reason.trim(), start_time: allDay ? null : from, end_time: allDay ? null : to });
      toast.success("Closure added", `${formatDate(date, "long")} · ${allDay ? "all day" : `${formatTime(from)}–${formatTime(to)}`}`);
      onClose();
      router.refresh();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      dismissible={!busy}
      size="sm"
      title="Add a closure"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" loading={busy} disabled={!valid} onClick={save}>
            Add closure
          </Button>
        </>
      }
    >
      <div className="space-y-4 pb-2">
        {error && <Notice tone="bad">{error}</Notice>}
        <Field label="Date">
          <Input type="date" min={todayISO()} value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Switch checked={allDay} onChange={setAllDay} label="All day" />
        {!allDay && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="From">
              <Input type="time" step={900} value={from} onChange={(e) => setFrom(e.target.value)} />
            </Field>
            <Field label="Until" error={from < to ? null : "Must be after the start"}>
              <Input type="time" step={900} value={to} onChange={(e) => setTo(e.target.value)} />
            </Field>
          </div>
        )}
        <Field label="Reason" hint="Shown on the booking site">
          <Input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={80} placeholder="e.g. Staff training" />
        </Field>
      </div>
    </Dialog>
  );
}
