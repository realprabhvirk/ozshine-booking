"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Pencil, Plus } from "lucide-react";
import { cn } from "@/lib/core/cn";
import { formatCents, parseMoneyInput, toCents } from "@/lib/core/money";
import { VEHICLE_TYPES, VEHICLE_TYPE_LABELS } from "@/lib/core/status";
import { formatDuration } from "@/lib/core/time";
import { errorMessage } from "@/lib/core/errors";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Switch, Textarea } from "@/components/ui/field";
import { Notice } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";
import { useShop } from "@/components/shop-context";
import { adminSave } from "@/lib/shop/admin";
import { servicePriceCents } from "@/lib/shop/pricing";
import type { ServiceRow } from "@/lib/shop/types";

export function ServicesEditor({ initial }: { initial: ServiceRow[] }) {
  const { supabase } = useShop();
  const router = useRouter();
  const toast = useToast();
  const [editing, setEditing] = useState<ServiceRow | "new" | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const services = [...initial].sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));

  async function toggle(s: ServiceRow) {
    setBusy(s.id);
    try {
      await adminSave(supabase, "services", s.id, { active: !s.active });
      toast.success(s.active ? `${s.name} hidden` : `${s.name} is back on`, s.active ? "It won't show on the booking site or the till." : undefined);
      router.refresh();
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(null);
    }
  }

  async function move(i: number, dir: -1 | 1) {
    const a = services[i];
    const b = services[i + dir];
    if (!a || !b) return;
    setBusy(a.id);
    try {
      // Re-number everything so the order is always clean (10, 20, 30…).
      const order = [...services];
      order[i] = b;
      order[i + dir] = a;
      await Promise.all(order.map((s, idx) => ((idx + 1) * 10 !== s.sort_order ? adminSave(supabase, "services", s.id, { sort_order: (idx + 1) * 10 }) : null)));
      router.refresh();
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <Notice tone="info">Price changes apply to new bookings. Existing bookings and invoices keep the price they were given.</Notice>
      <Card>
        <CardHeader
          title="Services"
          description="In the order customers see them"
          action={
            <Button size="sm" variant="primary" icon={Plus} onClick={() => setEditing("new")}>
              New service
            </Button>
          }
        />
        <div className="overflow-x-auto">
          <table className="w-full text-[15px]">
            <thead>
              <tr className="border-b border-line text-left text-xs font-semibold tracking-wide text-fg-muted uppercase">
                <th className="px-5 py-3">Service</th>
                {VEHICLE_TYPES.map((v) => (
                  <th key={v} className="px-3 py-3 text-right">
                    {VEHICLE_TYPE_LABELS[v]}
                  </th>
                ))}
                <th className="px-3 py-3 text-right">Time</th>
                <th className="px-5 py-3 text-right">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {services.map((s, i) => (
                <tr key={s.id} className={cn("border-b border-line last:border-0", !s.active && "opacity-55")}>
                  <td className="px-5 py-3">
                    <p className="flex flex-wrap items-center gap-2 font-semibold">
                      {s.name}
                      {s.badge && <Badge tone="accent">{s.badge}</Badge>}
                      {!s.active && <Badge tone="neutral">Hidden</Badge>}
                    </p>
                    {s.tagline && <p className="text-sm text-fg-muted">{s.tagline}</p>}
                  </td>
                  {VEHICLE_TYPES.map((v) => (
                    <td key={v} className="px-3 py-3 text-right tabular-nums">
                      {formatCents(servicePriceCents(s, v), { whole: true })}
                      {s.requires_quote && "+"}
                    </td>
                  ))}
                  <td className="px-3 py-3 text-right text-fg-muted">{formatDuration(s.duration_minutes ?? 60)}</td>
                  <td className="px-5 py-3">
                    <div className="flex justify-end gap-1">
                      <Button size="icon-sm" variant="ghost" icon={ArrowUp} aria-label={`Move ${s.name} up`} disabled={i === 0 || !!busy} onClick={() => move(i, -1)} />
                      <Button size="icon-sm" variant="ghost" icon={ArrowDown} aria-label={`Move ${s.name} down`} disabled={i === services.length - 1 || !!busy} onClick={() => move(i, 1)} />
                      <Button size="sm" variant="ghost" loading={busy === s.id} onClick={() => toggle(s)}>
                        {s.active ? "Hide" : "Show"}
                      </Button>
                      <Button size="icon-sm" variant="ghost" icon={Pencil} aria-label={`Edit ${s.name}`} onClick={() => setEditing(s)} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <ServiceDialog key={editing === null ? "none" : editing === "new" ? "new" : editing.id} service={editing} nextSort={(services.at(-1)?.sort_order ?? 0) + 10} onClose={() => setEditing(null)} />
    </div>
  );
}

function ServiceDialog({ service, nextSort, onClose }: { service: ServiceRow | "new" | null; nextSort: number; onClose: () => void }) {
  const { supabase } = useShop();
  const router = useRouter();
  const toast = useToast();
  const s = service === "new" || service === null ? null : service;
  const money = (v: number | string | null | undefined) => (v === null || v === undefined || v === "" ? "" : (toCents(v) / 100).toString());
  const [name, setName] = useState(s?.name ?? "");
  const [tagline, setTagline] = useState(s?.tagline ?? "");
  const [description, setDescription] = useState(s?.description ?? "");
  const [includes, setIncludes] = useState((s?.includes ?? []).join("\n"));
  const [prices, setPrices] = useState({ sedan: money(s?.price_from), small_wagon: money(s?.price_small_wagon), van: money(s?.price_van), "4wd": money(s?.price_4wd) });
  const [duration, setDuration] = useState(String(s?.duration_minutes ?? 60));
  const [badge, setBadge] = useState(s?.badge ?? "");
  const [quote, setQuote] = useState(s?.requires_quote ?? false);
  const [active, setActive] = useState(s?.active ?? true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const cents = Object.fromEntries(Object.entries(prices).map(([k, v]) => [k, v.trim() === "" ? null : parseMoneyInput(v)])) as Record<string, number | null>;
  const priceErr = (k: string) => (prices[k as keyof typeof prices].trim() !== "" && cents[k] === null ? "Like 65 or 65.50" : null);
  const mins = Number(duration);
  const valid = name.trim().length >= 2 && cents.sedan !== null && VEHICLE_TYPES.every((v) => !priceErr(v)) && Number.isInteger(mins) && mins >= 5 && mins <= 720;

  async function save() {
    if (!valid) return;
    setBusy(true);
    setError(null);
    const toDb = (c: number | null) => (c === null ? null : c / 100);
    try {
      await adminSave(supabase, "services", s?.id ?? null, {
        name: name.trim(),
        tagline: tagline.trim() || null,
        description: description.trim() || null,
        includes: includes.split("\n").map((l) => l.trim()).filter(Boolean),
        price_from: toDb(cents.sedan),
        price_small_wagon: toDb(cents.small_wagon),
        price_van: toDb(cents.van),
        price_4wd: toDb(cents["4wd"]),
        duration_minutes: mins,
        badge: badge.trim() || null,
        requires_quote: quote,
        active,
        ...(s ? {} : { sort_order: nextSort }),
      });
      toast.success(s ? "Service saved" : "Service added", name.trim());
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
      open={service !== null}
      onClose={onClose}
      dismissible={!busy}
      size="lg"
      title={s ? `Edit ${s.name}` : "New service"}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" loading={busy} disabled={!valid} onClick={save}>
            Save
          </Button>
        </>
      }
    >
      <div className="grid gap-4 pb-2 sm:grid-cols-2">
        {error && <Notice tone="bad" className="sm:col-span-2">{error}</Notice>}
        <Field label="Name" error={name.trim().length >= 2 || !name ? null : "Too short"}>
          <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
        </Field>
        <Field label="Badge" optional hint="e.g. Most popular">
          <Input value={badge} onChange={(e) => setBadge(e.target.value)} maxLength={24} />
        </Field>
        <Field label="Tagline" optional className="sm:col-span-2">
          <Input value={tagline} onChange={(e) => setTagline(e.target.value)} maxLength={120} placeholder="One line shown under the name" />
        </Field>
        <div className="grid grid-cols-2 gap-3 sm:col-span-2 sm:grid-cols-4">
          {VEHICLE_TYPES.map((v) => (
            <Field key={v} label={VEHICLE_TYPE_LABELS[v]} optional={v !== "sedan"} error={priceErr(v)} hint={v === "sedan" ? "Base price" : "Blank = same as sedan"}>
              <Input inputMode="decimal" value={prices[v]} onChange={(e) => setPrices((p) => ({ ...p, [v]: e.target.value }))} placeholder={v === "sedan" ? "0" : prices.sedan} />
            </Field>
          ))}
        </div>
        <Field label="How long it takes" hint="Minutes. Used to work out free times.">
          <Input type="number" min={5} max={720} step={5} value={duration} onChange={(e) => setDuration(e.target.value)} />
        </Field>
        <div className="flex flex-col justify-end">
          <Switch checked={quote} onChange={setQuote} label="Price on inspection" description="Shows “from” pricing with a +" />
        </div>
        <Field label="Description" optional className="sm:col-span-2">
          <Textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={600} />
        </Field>
        <Field label="What's included" optional hint="One per line, shown as a checklist on the booking site" className="sm:col-span-2">
          <Textarea rows={4} value={includes} onChange={(e) => setIncludes(e.target.value)} placeholder={"Hand wash & dry\nWheels & tyres\nWindows inside & out"} />
        </Field>
        <div className="sm:col-span-2">
          <Switch checked={active} onChange={setActive} label="Available" description="Off hides it from the booking site and the till." />
        </div>
      </div>
    </Dialog>
  );
}
