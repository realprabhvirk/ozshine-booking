"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarCheck, Car, Check, Clock, Crown, Gift, PlayCircle, UserCheck, UserPlus } from "lucide-react";
import { cn } from "@/lib/core/cn";
import { errorMessage, toAppError } from "@/lib/core/errors";
import { formatCents, gstFromInclusiveCents } from "@/lib/core/money";
import { isValidPhone, normalizeAuPhone, normalizeRego } from "@/lib/core/phone";
import { fieldErrors, nameSchema, optionalEmailSchema, optionalPhoneSchema, optionalRegoSchema, phoneSchema } from "@/lib/core/schemas";
import { VEHICLE_TYPES, VEHICLE_TYPE_LABELS, type VehicleType } from "@/lib/core/status";
import { addDaysISO, formatDay, formatDuration, formatTime, todayISO } from "@/lib/core/time";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Field, Input, SegmentedControl, Textarea } from "@/components/ui/field";
import { Notice, Spinner } from "@/components/ui/feedback";
import { Tabs } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";
import { useShop } from "@/components/shop-context";
import { createStaffBooking, createWalkin } from "@/lib/shop/actions";
import { addonsTotalCents, jobMinutes, servicePriceCents } from "@/lib/shop/pricing";
import { z } from "zod";

type Mode = "now" | "later";
type KnownCustomer = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  is_vip: boolean;
  visit_count: number;
  unused_rewards: number;
  last_visit_at: string | null;
};
type KnownVehicle = { id: string; rego: string | null; make_model: string | null; colour: string | null; vehicle_type: VehicleType };
type Slot = { slot_time: string; available: boolean; reason: string | null };

export function NewSaleClient({ initialMode, initialDate, initialTime }: { initialMode: Mode; initialDate: string | null; initialTime: string | null }) {
  const { supabase, services, addons, bays } = useShop();
  const router = useRouter();
  const toast = useToast();

  const [mode, setMode] = useState<Mode>(initialMode);
  const [vehicleType, setVehicleType] = useState<VehicleType>("sedan");
  const [serviceId, setServiceId] = useState<string | null>(null);
  const [addonIds, setAddonIds] = useState<string[]>([]);
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [rego, setRego] = useState("");
  const [makeModel, setMakeModel] = useState("");
  const [notes, setNotes] = useState("");
  const [date, setDate] = useState(initialDate ?? todayISO());
  const [time, setTime] = useState<string | null>(initialTime);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<null | "start" | "queue" | "book">(null);
  const [clash, setClash] = useState<string | null>(null);

  const activeServices = services.filter((s) => s.active);
  const activeAddons = addons.filter((a) => a.active);
  const service = activeServices.find((s) => s.id === serviceId) ?? null;
  const subtotal = service ? servicePriceCents(service, vehicleType) + addonsTotalCents(activeAddons, addonIds) : 0;
  const minutes = jobMinutes(service, activeAddons, addonIds);

  // ---- Returning customer lookup (by phone, then by rego) ----------------
  const [known, setKnown] = useState<KnownCustomer | null>(null);
  const [knownVehicles, setKnownVehicles] = useState<KnownVehicle[]>([]);
  const [looking, setLooking] = useState(false);
  const normPhone = normalizeAuPhone(phone);
  const phoneKey = normPhone && isValidPhone(normPhone) ? normPhone : null;
  const regoKey = normalizeRego(rego);

  useEffect(() => {
    let cancelled = false;
    const t = window.setTimeout(async () => {
      if (!phoneKey && !(regoKey && regoKey.length >= 3)) {
        setKnown(null);
        setKnownVehicles([]);
        return;
      }
      setLooking(true);
      try {
        let customerId: string | null = null;
        if (phoneKey) {
          const r = await supabase.from("customers").select("id").eq("phone", phoneKey).is("merged_into_customer_id", null).maybeSingle();
          customerId = (r.data as { id: string } | null)?.id ?? null;
        } else if (regoKey) {
          const r = await supabase.from("vehicles").select("customer_id").eq("rego", regoKey).is("archived_at", null).limit(1).maybeSingle();
          customerId = (r.data as { customer_id: string } | null)?.customer_id ?? null;
        }
        if (!customerId) {
          if (!cancelled) {
            setKnown(null);
            setKnownVehicles([]);
          }
          return;
        }
        const [c, v] = await Promise.all([
          supabase.from("customer_directory").select("id, name, phone, email, is_vip, visit_count, unused_rewards, last_visit_at").eq("id", customerId).maybeSingle(),
          supabase.from("vehicles").select("id, rego, make_model, colour, vehicle_type").eq("customer_id", customerId).is("archived_at", null).order("is_primary", { ascending: false }),
        ]);
        if (cancelled) return;
        const cust = c.data as KnownCustomer | null;
        setKnown(cust);
        setKnownVehicles((v.data ?? []) as KnownVehicle[]);
        if (cust) {
          setName((n) => n || cust.name);
          setEmail((e) => e || cust.email || "");
          if (!phoneKey && cust.phone) setPhone(cust.phone);
        }
      } finally {
        if (!cancelled) setLooking(false);
      }
    }, 350);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [phoneKey, regoKey, supabase]);

  function pickVehicle(v: KnownVehicle) {
    setRego(v.rego ?? "");
    setVehicleType(v.vehicle_type);
    setMakeModel(v.make_model ?? "");
  }

  // ---- Bays (walk-in) ------------------------------------------------------
  const [busyBays, setBusyBays] = useState<string[] | null>(null);
  useEffect(() => {
    if (mode !== "now") return;
    let cancelled = false;
    supabase
      .from("bookings")
      .select("bay_id")
      .eq("status", "in_progress")
      .then(({ data }) => {
        if (!cancelled) setBusyBays(((data ?? []) as Array<{ bay_id: string | null }>).map((r) => r.bay_id).filter((x): x is string => !!x));
      });
    return () => {
      cancelled = true;
    };
  }, [mode, supabase]);
  const freeBays = bays.filter((b) => b.active && !(busyBays ?? []).includes(b.id));
  const [bayId, setBayId] = useState<string | null>(null);
  const chosenBay = freeBays.find((b) => b.id === bayId) ?? freeBays[0] ?? null;

  // ---- Slots (phone booking) ----------------------------------------------
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [slotError, setSlotError] = useState<string | null>(null);
  const addonKey = addonIds.join(",");
  useEffect(() => {
    if (mode !== "later" || !serviceId) return;
    let cancelled = false;
    supabase
      .rpc("get_available_slots", { p_date: date, p_service_id: serviceId, p_addon_ids: addonKey ? addonKey.split(",") : [] })
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
  }, [mode, date, serviceId, addonKey, supabase]);

  const days = useMemo(() => Array.from({ length: 14 }, (_, i) => addDaysISO(todayISO(), i)), []);

  function validate(requirePhone: boolean) {
    const schema = z.object({
      phone: requirePhone ? phoneSchema : optionalPhoneSchema,
      name: requirePhone && !known ? nameSchema : z.string().trim().max(80),
      email: optionalEmailSchema,
      rego: optionalRegoSchema,
    });
    const r = schema.safeParse({ phone, name, email, rego });
    const errs: Record<string, string> = r.success ? {} : fieldErrors(r.error);
    if (!serviceId) errs.service = "Pick a service";
    setErrors(errs);
    return r.success && serviceId ? r.data : null;
  }

  async function submitWalkin(startNow: boolean) {
    const v = validate(false);
    if (!v || !serviceId) return;
    setBusy(startNow ? "start" : "queue");
    try {
      const r = await createWalkin(supabase, {
        vehicle_type: vehicleType,
        service_id: serviceId,
        addon_ids: addonIds,
        name: v.name || undefined,
        phone: v.phone ?? undefined,
        email: v.email ?? undefined,
        rego: v.rego ?? undefined,
        make_model: makeModel.trim() || undefined,
        notes: notes.trim() || undefined,
        start_now: startNow,
        bay_id: startNow ? (chosenBay?.id ?? null) : null,
      });
      toast.success(startNow ? `Started in ${chosenBay?.name ?? "a bay"}` : "Added to waiting", `${r.reference_code} · ${formatCents(Math.round(Number(r.total_estimate) * 100))}`);
      router.push(`/?booking=${r.booking_id}`);
    } catch (e) {
      toast.error(e, "Couldn't create the walk-in");
      setBusy(null);
    }
  }

  async function submitBooking(force = false) {
    const v = validate(true);
    if (!v || !serviceId) return;
    if (!time) {
      setErrors((e) => ({ ...e, time: "Pick a time" }));
      return;
    }
    setBusy("book");
    try {
      const r = await createStaffBooking(supabase, {
        vehicle_type: vehicleType,
        service_id: serviceId,
        addon_ids: addonIds,
        name: v.name || undefined,
        phone: v.phone ?? undefined,
        email: v.email ?? undefined,
        rego: v.rego ?? undefined,
        make_model: makeModel.trim() || undefined,
        notes: notes.trim() || undefined,
        date,
        time,
        force,
      });
      toast.success("Booked", `${r.reference_code} · ${formatDay(date)} ${formatTime(time)}`);
      router.push(`/schedule?date=${date}&booking=${r.booking_id}`);
    } catch (e) {
      const err = toAppError(e);
      if (err.code === "SLOT_TAKEN" && !force) setClash(err.message);
      else toast.error(err, "Couldn't book it");
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto max-w-[1400px]">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight">{mode === "now" ? "Walk-in" : "Phone booking"}</h1>
        <Tabs
          label="Type of sale"
          value={mode}
          onChange={(m) => {
            setMode(m);
            setClash(null);
          }}
          tabs={[
            { id: "now", label: "Walk-in now", icon: <Car size={16} aria-hidden /> },
            { id: "later", label: "Book for later", icon: <CalendarCheck size={16} aria-hidden /> },
          ]}
        />
      </div>

      <div className="grid gap-6 @5xl:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="min-w-0 space-y-6">
          <Card>
            <CardHeader title="1. Vehicle" />
            <CardBody>
              <SegmentedControl
                label="Vehicle type"
                value={vehicleType}
                onChange={setVehicleType}
                className="grid-cols-2 @xl:grid-cols-4"
                options={VEHICLE_TYPES.map((v) => ({ value: v, label: VEHICLE_TYPE_LABELS[v] }))}
              />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="2. Service" description={errors.service ? <span className="text-bad-ink">{errors.service}</span> : "Prices for the vehicle type above"} />
            <CardBody className="grid gap-3 @xl:grid-cols-2 @4xl:grid-cols-3">
              {activeServices.map((s) => {
                const on = s.id === serviceId;
                return (
                  <button
                    key={s.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setServiceId(s.id)}
                    className={cn(
                      "relative flex min-h-24 flex-col justify-between rounded-2xl p-4 text-left ring-1 ring-inset transition",
                      "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
                      on ? "bg-accent text-accent-fg ring-accent shadow-card" : "bg-raised ring-line hover:ring-line-strong",
                    )}
                  >
                    <span className="pr-6 text-[15px] leading-snug font-bold">{s.name}</span>
                    <span className="mt-2 flex items-end justify-between">
                      <span className="text-2xl font-extrabold tabular-nums">
                        {formatCents(servicePriceCents(s, vehicleType), { whole: true })}
                        {s.requires_quote && <span className="text-sm font-semibold">+</span>}
                      </span>
                      <span className={cn("text-xs", on ? "text-white/80" : "text-fg-muted")}>{formatDuration(s.duration_minutes ?? 60)}</span>
                    </span>
                    {on && <Check size={20} className="absolute top-3 right-3" aria-hidden />}
                  </button>
                );
              })}
            </CardBody>
          </Card>

          {activeAddons.length > 0 && (
            <Card>
              <CardHeader title="3. Extras" description="Optional" />
              <CardBody className="flex flex-wrap gap-2">
                {activeAddons.map((a) => {
                  const on = addonIds.includes(a.id);
                  return (
                    <button
                      key={a.id}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setAddonIds((ids) => (on ? ids.filter((x) => x !== a.id) : [...ids, a.id]))}
                      className={cn(
                        "flex min-h-12 items-center gap-2 rounded-full px-4 text-sm font-semibold ring-1 ring-inset transition",
                        "focus-visible:outline-2 focus-visible:outline-focus",
                        on ? "bg-accent text-accent-fg ring-accent" : "bg-raised ring-line hover:ring-line-strong",
                      )}
                    >
                      {on && <Check size={16} aria-hidden />}
                      {a.name}
                      <span className={cn("tabular-nums", on ? "text-white/85" : "text-fg-muted")}>+{formatCents(Math.round(Number(a.price) * 100), { whole: true })}</span>
                    </button>
                  );
                })}
              </CardBody>
            </Card>
          )}

          {mode === "later" && (
            <Card>
              <CardHeader title="4. When" description={errors.time ? <span className="text-bad-ink">{errors.time}</span> : serviceId ? `Takes about ${formatDuration(minutes)}` : "Pick a service first"} />
              <CardBody className="space-y-4">
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
                <Input
                  type="date"
                  aria-label="Date"
                  value={date}
                  min={todayISO()}
                  className="max-w-xs"
                  onChange={(e) => {
                    if (!e.target.value) return;
                    setDate(e.target.value);
                    setTime(null);
                    setClash(null);
                    setSlots(null);
                  }}
                />
                {!serviceId && <p className="text-sm text-fg-muted">Times show once a service is picked.</p>}
                {serviceId && slotError && <Notice tone="bad">{slotError}</Notice>}
                {serviceId && !slots && !slotError && <Spinner />}
                {serviceId && slots && slots.length === 0 && <Notice tone="warn">Closed that day.</Notice>}
                {serviceId && slots && slots.length > 0 && (
                  <div className="grid grid-cols-4 gap-2 @xl:grid-cols-6 @4xl:grid-cols-8">
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
                          aria-label={`${formatTime(t)}${s.available ? "" : " (full)"}`}
                          className={cn(
                            "h-12 rounded-xl text-sm font-semibold ring-1 ring-inset transition focus-visible:outline-2 focus-visible:outline-focus disabled:opacity-35",
                            on ? "bg-accent text-accent-fg ring-accent" : s.available ? "bg-raised ring-line hover:ring-line-strong" : "bg-sunken text-fg-faint ring-line line-through",
                          )}
                        >
                          {formatTime(t)}
                        </button>
                      );
                    })}
                  </div>
                )}
                {time && slots && !slots.find((s) => s.slot_time.startsWith(time)) && (
                  <p className="text-sm text-fg-muted">Picked {formatTime(time)} (not a standard slot).</p>
                )}
              </CardBody>
            </Card>
          )}
        </div>

        <aside className="@5xl:sticky @5xl:top-0 @5xl:self-start">
          <Card>
            <CardHeader
              title="Customer"
              action={looking ? <Spinner size={16} label="Looking up customer" /> : known ? <Badge tone="ok"><UserCheck size={12} aria-hidden /> Returning</Badge> : phoneKey ? <Badge tone="info"><UserPlus size={12} aria-hidden /> New</Badge> : null}
            />
            <CardBody className="space-y-4">
              <Field label="Mobile" required={mode === "later"} optional={mode === "now"} error={errors.phone}>
                <Input inputMode="tel" autoComplete="off" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0412 345 678" />
              </Field>
              {known && (
                <div className="rounded-xl bg-ok/10 px-4 py-3 ring-1 ring-ok/30 ring-inset">
                  <p className="flex items-center gap-2 font-semibold">
                    {known.is_vip && <Crown size={16} className="text-warn" aria-label="VIP" />}
                    {known.name}
                  </p>
                  <p className="text-sm text-fg-muted">
                    {known.visit_count} visit{known.visit_count === 1 ? "" : "s"}
                    {known.last_visit_at && ` · last ${formatDay(known.last_visit_at.slice(0, 10))}`}
                  </p>
                  {known.unused_rewards > 0 && (
                    <p className="mt-1 flex items-center gap-1.5 text-sm font-semibold text-ok-ink">
                      <Gift size={14} aria-hidden /> {known.unused_rewards} reward{known.unused_rewards > 1 ? "s" : ""} to use at checkout
                    </p>
                  )}
                  {knownVehicles.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {knownVehicles.map((v) => (
                        <Button key={v.id} size="sm" variant={normalizeRego(rego) === v.rego ? "primary" : "secondary"} onClick={() => pickVehicle(v)}>
                          <span className="font-mono">{v.rego ?? "No rego"}</span>
                          <span className="font-normal opacity-80">{v.make_model ?? VEHICLE_TYPE_LABELS[v.vehicle_type]}</span>
                        </Button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <Field label="Name" required={mode === "later" && !known} optional={mode === "now"} error={errors.name}>
                <Input autoComplete="off" value={name} onChange={(e) => setName(e.target.value)} />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Rego" optional error={errors.rego}>
                  <Input autoComplete="off" value={rego} onChange={(e) => setRego(e.target.value.toUpperCase())} className="font-mono uppercase" />
                </Field>
                <Field label="Make / model" optional>
                  <Input autoComplete="off" value={makeModel} onChange={(e) => setMakeModel(e.target.value)} placeholder="White Hilux" />
                </Field>
              </div>
              {mode === "later" && (
                <Field label="Email" optional hint="For the confirmation" error={errors.email}>
                  <Input type="email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} />
                </Field>
              )}
              <Field label="Staff notes" optional>
                <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} />
              </Field>
            </CardBody>

            <div className="border-t border-line px-5 py-4">
              <dl className="space-y-1 text-[15px]">
                <div className="flex justify-between">
                  <dt className="text-fg-muted">{service ? `${service.name} · ${VEHICLE_TYPE_LABELS[vehicleType]}` : "No service yet"}</dt>
                  <dd className="tabular-nums">{service ? formatCents(servicePriceCents(service, vehicleType)) : "—"}</dd>
                </div>
                {addonIds.length > 0 && (
                  <div className="flex justify-between">
                    <dt className="text-fg-muted">{addonIds.length} extra{addonIds.length > 1 ? "s" : ""}</dt>
                    <dd className="tabular-nums">{formatCents(addonsTotalCents(activeAddons, addonIds))}</dd>
                  </div>
                )}
                <div className="flex justify-between pt-2 text-2xl font-extrabold">
                  <dt>Total</dt>
                  <dd className="tabular-nums">{formatCents(subtotal)}</dd>
                </div>
                <div className="flex justify-between text-xs text-fg-faint">
                  <dt className="flex items-center gap-1">
                    <Clock size={12} aria-hidden /> {service ? formatDuration(minutes) : "—"}
                  </dt>
                  <dd>incl. GST {formatCents(gstFromInclusiveCents(subtotal))}</dd>
                </div>
              </dl>

              {mode === "now" ? (
                <div className="mt-4 space-y-2">
                  {freeBays.length > 1 && (
                    <div role="radiogroup" aria-label="Bay" className="flex flex-wrap gap-2">
                      {freeBays.map((b) => (
                        <Button key={b.id} size="sm" role="radio" aria-checked={chosenBay?.id === b.id} variant={chosenBay?.id === b.id ? "primary" : "secondary"} onClick={() => setBayId(b.id)}>
                          {b.name}
                        </Button>
                      ))}
                    </div>
                  )}
                  <Button variant="primary" size="lg" block icon={PlayCircle} loading={busy === "start"} disabled={!!busy || !chosenBay} onClick={() => submitWalkin(true)}>
                    {chosenBay ? `Start now in ${chosenBay.name}` : busyBays === null ? "Checking bays…" : "All bays busy"}
                  </Button>
                  <Button size="lg" block loading={busy === "queue"} disabled={!!busy} onClick={() => submitWalkin(false)}>
                    Add to waiting
                  </Button>
                </div>
              ) : (
                <div className="mt-4 space-y-2">
                  {clash && (
                    <Notice tone="warn" title="That time is full">
                      {clash}
                    </Notice>
                  )}
                  {clash ? (
                    <Button variant="danger" size="lg" block loading={busy === "book"} onClick={() => submitBooking(true)}>
                      Double-book anyway
                    </Button>
                  ) : (
                    <Button variant="primary" size="lg" block icon={CalendarCheck} loading={busy === "book"} disabled={!!busy} onClick={() => submitBooking(false)}>
                      {time ? `Book ${formatDay(date)} ${formatTime(time)}` : "Book it"}
                    </Button>
                  )}
                  <p className="text-center text-xs text-fg-faint">Booked straight in as confirmed. The customer gets a confirmation (simulated for now).</p>
                </div>
              )}
            </div>
          </Card>
        </aside>
      </div>
    </div>
  );
}
