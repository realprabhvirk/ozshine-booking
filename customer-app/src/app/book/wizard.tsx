"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Bus, CalendarX, Car, Check, CheckCircle2, Clock, Gift, Tag, Truck, CarFront } from "lucide-react";
import { cn } from "@/lib/core/cn";
import { formatCents, toCents } from "@/lib/core/money";
import { isValidPhone, normalizeAuPhone, normalizeRego } from "@/lib/core/phone";
import { VEHICLE_TYPES, VEHICLE_TYPE_LABELS, type VehicleType } from "@/lib/core/status";
import { addDaysISO, dayKeyOf, formatDate, formatDay, formatDuration, formatTime, timeToMinutes } from "@/lib/core/time";
import { errorMessage, toAppError } from "@/lib/core/errors";
import { createClient } from "@/lib/supabase/client";
import {
  checkPromo, createBooking, fetchSlots, jobMinutes, joinWaitlist, servicePriceCents,
  type PublicAddon, type PublicService, type PublicSettings, type Slot,
} from "@/lib/public";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Notice, Skeleton } from "@/components/ui/feedback";

type Step = 1 | 2 | 3 | 4;
const STEPS: Array<{ n: Step; label: string }> = [
  { n: 1, label: "Service" },
  { n: 2, label: "Time" },
  { n: 3, label: "Details" },
  { n: 4, label: "Confirm" },
];
const VEHICLE_ICON = { sedan: Car, small_wagon: CarFront, van: Bus, "4wd": Truck } as const;

type Me = { name: string; phone: string | null; email: string | null; vehicles: Array<{ rego: string | null; make_model: string | null; vehicle_type: VehicleType }>; rewards: Array<{ code: string; description: string }> };

export function BookingWizard({
  settings,
  services,
  addons,
  initialService,
  initialVehicle,
  referral,
}: {
  settings: PublicSettings;
  services: PublicService[];
  addons: PublicAddon[];
  initialService: string | null;
  initialVehicle: VehicleType | null;
  referral: string;
}) {
  const [supabase] = useState(() => createClient());
  const router = useRouter();
  const top = useRef<HTMLDivElement>(null);

  const [step, setStep] = useState<Step>(1);
  const [vt, setVt] = useState<VehicleType>(initialVehicle ?? "sedan");
  const [serviceId, setServiceId] = useState<string | null>(initialService);
  const [addonIds, setAddonIds] = useState<string[]>([]);
  const [date, setDate] = useState<string | null>(null);
  const [time, setTime] = useState<string | null>(null);
  // Times for the chosen day, tagged with what they were fetched for so a
  // stale answer is never shown for a different day or service.
  const [slotState, setSlotState] = useState<{ key: string; slots: Slot[] | null; error: string | null }>({ key: "", slots: null, error: null });

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [rego, setRego] = useState("");
  const [makeModel, setMakeModel] = useState("");
  const [notes, setNotes] = useState("");
  const [optIn, setOptIn] = useState(false);
  const [website, setWebsite] = useState(""); // honeypot
  const [promo, setPromo] = useState("");
  const [promoResult, setPromoResult] = useState<{ ok: boolean; message: string; discount?: number | string; code?: string } | null>(null);
  const [rewardCode, setRewardCode] = useState("");
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [slotNonce, setSlotNonce] = useState(0);

  const service = services.find((s) => s.id === serviceId) ?? null;
  const chosenAddons = addons.filter((a) => addonIds.includes(a.id));
  const subtotal = service ? servicePriceCents(service, vt) + chosenAddons.reduce((n, a) => n + toCents(a.price), 0) : 0;
  const discount = promoResult?.ok ? toCents(promoResult.discount ?? 0) : 0;
  const total = Math.max(subtotal - discount, 0);
  const minutes = service ? jobMinutes(service, chosenAddons) : 0;

  // Signed-in customers: prefill details, offer saved cars and rewards.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) return;
      const [{ data: c }, loyalty] = await Promise.all([
        supabase.from("customers").select("id, name, phone, email, vehicles(rego, make_model, vehicle_type, archived_at)").eq("auth_user_id", data.user.id).maybeSingle(),
        supabase.rpc("get_my_loyalty"),
      ]);
      if (cancelled || !c) return;
      const row = c as { name: string; phone: string | null; email: string | null; vehicles: Array<{ rego: string | null; make_model: string | null; vehicle_type: VehicleType; archived_at: string | null }> };
      const rewards = ((loyalty.data as { rewards?: Array<{ code: string; description: string; status: string }> } | null)?.rewards ?? []).filter((r) => r.status === "issued");
      setMe({ name: row.name, phone: row.phone, email: row.email, vehicles: row.vehicles.filter((v) => !v.archived_at), rewards });
      setName((v) => v || row.name);
      setPhone((v) => v || row.phone || "");
      setEmail((v) => v || row.email || "");
      const first = row.vehicles.find((v) => !v.archived_at);
      if (first) {
        setRego((v) => v || first.rego || "");
        setMakeModel((v) => v || first.make_model || "");
        if (!initialVehicle) setVt(first.vehicle_type);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase, initialVehicle]);

  // Days the shop is open, from today until the booking horizon.
  const days = useMemo(() => {
    const out: Array<{ date: string; closed: boolean; reason?: string }> = [];
    for (let i = 0; i <= settings.max_advance_days; i++) {
      const d = addDaysISO(settings.today, i);
      const h = settings.opening_hours?.[dayKeyOf(d)];
      const black = settings.blackouts.find((b) => b.date === d && !b.start_time);
      out.push({ date: d, closed: !h || h.closed || !!black, reason: black?.reason ?? undefined });
    }
    return out;
  }, [settings]);

  const slotKey = date && serviceId ? `${date}|${serviceId}|${addonIds.join(",")}|${slotNonce}` : "";
  const slots = slotState.key === slotKey ? slotState.slots : null;
  const slotsError = slotState.key === slotKey ? slotState.error : null;

  // Load times for the chosen day.
  useEffect(() => {
    if (!slotKey || !date || !serviceId) return;
    let cancelled = false;
    fetchSlots(supabase, date, serviceId, addonIds)
      .then((s) => !cancelled && setSlotState({ key: slotKey, slots: s, error: null }))
      .catch((e) => !cancelled && setSlotState({ key: slotKey, slots: null, error: errorMessage(e) }));
    return () => {
      cancelled = true;
    };
  }, [supabase, slotKey, date, serviceId, addonIds]);

  // Any change to the job invalidates the chosen time and the promo check.
  function changeJob(fn: () => void) {
    fn();
    setTime(null);
    setPromoResult(null);
  }

  function go(n: Step) {
    setStep(n);
    setError(null);
    requestAnimationFrame(() => top.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  const phoneNorm = normalizeAuPhone(phone);
  const errors = {
    name: name.trim().length < 2 ? "Please enter your name" : null,
    phone: !isValidPhone(phoneNorm) ? "Please enter a valid Australian mobile" : null,
    email: email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ? "That email doesn't look right" : null,
    rego: rego.trim() && (normalizeRego(rego)?.length ?? 0) > 9 ? "That rego looks too long" : null,
  };
  const detailsOk = !errors.name && !errors.phone && !errors.email && !errors.rego;
  const canNext = step === 1 ? !!service : step === 2 ? !!date && !!time : step === 3 ? detailsOk : true;

  async function applyPromo() {
    if (!service || !promo.trim()) return;
    setBusy("promo");
    try {
      setPromoResult(await checkPromo(supabase, promo.trim(), service.id, subtotal));
    } catch (e) {
      setPromoResult({ ok: false, message: errorMessage(e) });
    } finally {
      setBusy(null);
    }
  }

  async function submit() {
    if (!service || !date || !time) return;
    setBusy("submit");
    setError(null);
    try {
      const res = await createBooking(supabase, {
        service_id: service.id,
        addon_ids: addonIds,
        vehicle_type: vt,
        date,
        time,
        name: name.trim(),
        phone: phoneNorm ?? phone,
        email: email.trim(),
        rego: rego.trim(),
        make_model: makeModel.trim(),
        notes: notes.trim(),
        marketing_opt_in: optIn,
        promo_code: promoResult?.ok ? promo.trim() : "",
        referral_code: referral,
        reward_code: rewardCode,
        website,
      });
      router.push(`/manage/${res.manage_token}?new=1`);
    } catch (e) {
      const err = toAppError(e);
      if (["SLOT_TAKEN", "TOO_SOON", "PAST", "OUTSIDE_HOURS", "CLOSED", "TOO_FAR"].includes(err.code)) {
        setTime(null);
        setSlotNonce((n) => n + 1); // refetch the times
        go(2);
        setError(err.message);
      } else if (err.code === "PROMO_INVALID" || err.code === "REWARD_INVALID") {
        setPromoResult(null);
        go(3);
        setError(err.message);
      } else {
        setError(err.message);
      }
      setBusy(null);
    }
  }

  const available = (slots ?? []).filter((s) => s.available);
  const groups = [
    { label: "Morning", items: available.filter((s) => timeToMinutes(s.slot_time) < 12 * 60) },
    { label: "Afternoon", items: available.filter((s) => timeToMinutes(s.slot_time) >= 12 * 60) },
  ].filter((g) => g.items.length);

  return (
    <div ref={top} className="mx-auto max-w-6xl scroll-mt-4 px-4 pt-8 pb-32 sm:px-6 lg:pb-16">
      <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">Book a wash</h1>
      <ol className="mt-5 flex gap-2" aria-label="Steps">
        {STEPS.map((s) => {
          const done = s.n < step;
          return (
            <li key={s.n} className="flex-1">
              <button
                type="button"
                disabled={s.n >= step}
                onClick={() => go(s.n)}
                aria-current={s.n === step ? "step" : undefined}
                className="group w-full text-left disabled:cursor-default"
              >
                <span className={cn("block h-1.5 rounded-full transition", s.n <= step ? "oz-gloss bg-accent" : "bg-line")} />
                <span className={cn("mt-2 flex items-center gap-1 text-sm font-semibold", s.n === step ? "text-fg" : "text-fg-muted", done && "group-hover:text-fg")}>
                  {done && <Check size={14} aria-hidden />}
                  {s.label}
                </span>
              </button>
            </li>
          );
        })}
      </ol>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_360px]">
        <div className="min-w-0 space-y-8">
          {error && <Notice tone="bad">{error}</Notice>}

          {step === 1 && (
            <>
              <section>
                <h2 className="text-lg font-bold">What are we washing?</h2>
                <div role="radiogroup" aria-label="Vehicle size" className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {VEHICLE_TYPES.map((t) => {
                    const Icon = VEHICLE_ICON[t];
                    return (
                      <button
                        key={t}
                        type="button"
                        role="radio"
                        aria-checked={vt === t}
                        onClick={() => changeJob(() => setVt(t))}
                        className={cn(
                          "flex h-20 flex-col items-center justify-center gap-1 rounded-2xl font-semibold ring-1 transition focus-visible:outline-2 focus-visible:outline-focus",
                          vt === t ? "bg-[#0f1013] text-white ring-[#0f1013]" : "bg-panel ring-line hover:ring-line-strong",
                        )}
                      >
                        <Icon size={24} aria-hidden />
                        {VEHICLE_TYPE_LABELS[t]}
                      </button>
                    );
                  })}
                </div>
              </section>

              <section>
                <h2 className="text-lg font-bold">Choose a service</h2>
                <div role="radiogroup" aria-label="Service" className="mt-3 grid gap-3 sm:grid-cols-2">
                  {services.map((s) => {
                    const on = s.id === serviceId;
                    return (
                      <button
                        key={s.id}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        onClick={() => changeJob(() => setServiceId(s.id))}
                        className={cn(
                          "relative flex min-h-28 flex-col rounded-2xl bg-panel p-4 text-left ring-1 transition focus-visible:outline-2 focus-visible:outline-focus",
                          on ? "ring-2 ring-accent" : "ring-line hover:ring-line-strong",
                        )}
                      >
                        <span className="flex w-full items-start justify-between gap-3">
                          <span className="font-bold">{s.name}</span>
                          <span className="text-lg font-extrabold tabular-nums">
                            {s.requires_quote && <span className="mr-1 text-xs font-medium text-fg-muted">from</span>}
                            {formatCents(servicePriceCents(s, vt), { whole: true })}
                          </span>
                        </span>
                        {s.tagline && <span className="mt-1 text-sm text-fg-muted">{s.tagline}</span>}
                        <span className="mt-auto flex items-center gap-3 pt-3 text-xs text-fg-muted">
                          {s.duration_minutes && (
                            <span className="inline-flex items-center gap-1">
                              <Clock size={13} aria-hidden /> {formatDuration(s.duration_minutes)}
                            </span>
                          )}
                          {s.badge && <span className="rounded-full bg-accent/10 px-2 py-0.5 font-semibold text-accent-ink">{s.badge}</span>}
                        </span>
                        {on && <CheckCircle2 size={22} className="absolute -top-2 -right-2 rounded-full bg-panel text-accent" aria-hidden />}
                      </button>
                    );
                  })}
                </div>
              </section>

              {service && addons.length > 0 && (
                <section>
                  <h2 className="text-lg font-bold">
                    Extras <span className="text-sm font-normal text-fg-muted">(optional)</span>
                  </h2>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {addons.map((a) => {
                      const on = addonIds.includes(a.id);
                      return (
                        <button
                          key={a.id}
                          type="button"
                          role="checkbox"
                          aria-checked={on}
                          onClick={() => changeJob(() => setAddonIds((ids) => (on ? ids.filter((x) => x !== a.id) : [...ids, a.id])))}
                          className={cn(
                            "flex min-h-14 items-center gap-3 rounded-2xl bg-panel px-4 py-3 text-left ring-1 transition focus-visible:outline-2 focus-visible:outline-focus",
                            on ? "ring-2 ring-accent" : "ring-line hover:ring-line-strong",
                          )}
                        >
                          <span className={cn("flex size-6 shrink-0 items-center justify-center rounded-md ring-1", on ? "bg-accent text-white ring-accent" : "ring-line-strong")}>
                            {on && <Check size={16} aria-hidden />}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block font-medium">{a.name}</span>
                            {a.description && <span className="block text-sm text-fg-muted">{a.description}</span>}
                          </span>
                          <span className="font-semibold tabular-nums">+{formatCents(toCents(a.price), { whole: true })}</span>
                        </button>
                      );
                    })}
                  </div>
                </section>
              )}
            </>
          )}

          {step === 2 && service && (
            <>
              <section>
                <h2 className="text-lg font-bold">Pick a day</h2>
                <div className="-mx-4 mt-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
                  <div role="radiogroup" aria-label="Day" className="flex gap-2">
                    {days.map((d) => {
                      const on = d.date === date;
                      return (
                        <button
                          key={d.date}
                          type="button"
                          role="radio"
                          aria-checked={on}
                          disabled={d.closed}
                          title={d.closed ? (d.reason ? `Closed: ${d.reason}` : "Closed") : undefined}
                          onClick={() => {
                            setDate(d.date);
                            setTime(null);
                          }}
                          className={cn(
                            "flex h-20 w-16 shrink-0 flex-col items-center justify-center rounded-2xl ring-1 transition focus-visible:outline-2 focus-visible:outline-focus disabled:opacity-35",
                            on ? "bg-[#0f1013] text-white ring-[#0f1013]" : "bg-panel ring-line enabled:hover:ring-line-strong",
                          )}
                        >
                          <span className="text-xs font-semibold uppercase">{d.date === settings.today ? "Today" : formatDate(d.date, "short").split(" ")[0]}</span>
                          <span className="text-2xl font-extrabold tabular-nums">{Number(d.date.slice(8, 10))}</span>
                          <span className="text-[11px] opacity-70">{d.closed ? "Closed" : formatDate(d.date, "short").split(" ")[2]}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </section>

              {date && (
                <section aria-live="polite">
                  <h2 className="text-lg font-bold">{formatDay(date, "long", settings.today)}</h2>
                  <p className="text-sm text-fg-muted">Takes about {formatDuration(minutes)}. Times shown are when to drop your car off.</p>
                  {slotsError ? (
                    <Notice tone="bad" className="mt-3">{slotsError}</Notice>
                  ) : slots === null ? (
                    <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-5">
                      {Array.from({ length: 10 }, (_, i) => (
                        <Skeleton key={i} className="h-12 rounded-xl" />
                      ))}
                    </div>
                  ) : groups.length === 0 ? (
                    <Waitlist date={date} serviceId={service.id} name={name} phone={phone} supabase={supabase} />
                  ) : (
                    <div className="mt-4 space-y-5">
                      {groups.map((g) => (
                        <div key={g.label}>
                          <h3 className="mb-2 text-sm font-semibold text-fg-muted">{g.label}</h3>
                          <div role="radiogroup" aria-label={g.label} className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                            {g.items.map((s) => {
                              const t = s.slot_time.slice(0, 5);
                              const on = time === t;
                              return (
                                <button
                                  key={t}
                                  type="button"
                                  role="radio"
                                  aria-checked={on}
                                  onClick={() => setTime(t)}
                                  className={cn(
                                    "h-12 rounded-xl text-[15px] font-semibold tabular-nums ring-1 transition focus-visible:outline-2 focus-visible:outline-focus",
                                    on ? "oz-gloss bg-accent text-white ring-accent" : "bg-panel ring-line hover:ring-line-strong",
                                  )}
                                >
                                  {formatTime(t)}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              )}
            </>
          )}

          {step === 3 && (
            <section className="space-y-5">
              <h2 className="text-lg font-bold">Your details</h2>
              {me && <Notice tone="ok">Signed in as {me.name}. Your details are filled in.</Notice>}
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Name" error={touched ? errors.name : null}>
                  <Input autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
                </Field>
                <Field label="Mobile" error={touched ? errors.phone : null} hint="We'll text your confirmation here">
                  <Input type="tel" inputMode="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="04xx xxx xxx" />
                </Field>
                <Field label="Email" optional error={touched ? errors.email : null}>
                  <Input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                </Field>
                <Field label="Rego" optional error={touched ? errors.rego : null}>
                  <Input value={rego} onChange={(e) => setRego(e.target.value.toUpperCase())} className="uppercase placeholder:normal-case" maxLength={12} placeholder="e.g. 123ABC" />
                </Field>
                <Field label="Make & model" optional className="sm:col-span-2">
                  <Input value={makeModel} onChange={(e) => setMakeModel(e.target.value)} maxLength={60} placeholder="e.g. Toyota RAV4, white" />
                </Field>
                {me && me.vehicles.length > 1 && (
                  <div className="flex flex-wrap gap-2 sm:col-span-2">
                    {me.vehicles.map((v, i) => (
                      <Button
                        key={i}
                        size="sm"
                        onClick={() => {
                          setRego(v.rego ?? "");
                          setMakeModel(v.make_model ?? "");
                          changeJob(() => setVt(v.vehicle_type));
                        }}
                      >
                        {v.rego ?? v.make_model ?? VEHICLE_TYPE_LABELS[v.vehicle_type]}
                      </Button>
                    ))}
                  </div>
                )}
                <Field label="Anything we should know?" optional className="sm:col-span-2">
                  <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} rows={3} placeholder="e.g. dog hair in the boot, child seats" />
                </Field>
              </div>

              {/* Honeypot: hidden from people and screen readers. */}
              <div aria-hidden className="absolute -left-[9999px] h-px w-px overflow-hidden">
                <label>
                  Website
                  <input tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
                </label>
              </div>

              <div className="rounded-2xl bg-panel p-4 ring-1 ring-line">
                <p className="flex items-center gap-2 font-semibold">
                  <Tag size={18} className="text-accent" aria-hidden /> Promo code
                </p>
                <div className="mt-2 flex gap-2">
                  <Input
                    aria-label="Promo code"
                    value={promo}
                    onChange={(e) => {
                      setPromo(e.target.value.toUpperCase());
                      setPromoResult(null);
                    }}
                    className="uppercase"
                    maxLength={24}
                  />
                  <Button loading={busy === "promo"} disabled={!promo.trim()} onClick={applyPromo}>
                    Apply
                  </Button>
                </div>
                {promoResult && <p className={cn("mt-2 text-sm font-medium", promoResult.ok ? "text-ok-ink" : "text-bad-ink")}>{promoResult.message}</p>}
                {me && me.rewards.length > 0 && (
                  <div className="mt-4 border-t border-line pt-4">
                    <p className="flex items-center gap-2 font-semibold">
                      <Gift size={18} className="text-accent" aria-hidden /> Use a reward
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {me.rewards.map((r) => (
                        <Button key={r.code} size="sm" variant={rewardCode === r.code ? "primary" : "secondary"} onClick={() => setRewardCode(rewardCode === r.code ? "" : r.code)}>
                          {r.description}
                        </Button>
                      ))}
                    </div>
                    {rewardCode && <p className="mt-2 text-sm text-fg-muted">We&apos;ll take it off when you pay at the shop.</p>}
                  </div>
                )}
              </div>

              <label className="flex cursor-pointer items-start gap-3 rounded-2xl p-1">
                <input type="checkbox" checked={optIn} onChange={(e) => setOptIn(e.target.checked)} className="mt-1 size-5 accent-[var(--oz-accent)]" />
                <span className="text-[15px]">
                  Send me the odd special offer <span className="text-fg-muted">(no more than once a month, opt out any time)</span>
                </span>
              </label>
            </section>
          )}

          {step === 4 && service && date && time && (
            <section className="space-y-5">
              <h2 className="text-lg font-bold">Check and confirm</h2>
              <dl className="divide-y divide-line rounded-2xl bg-panel ring-1 ring-line">
                {[
                  ["Service", `${service.name} · ${VEHICLE_TYPE_LABELS[vt]}`],
                  ["Extras", chosenAddons.map((a) => a.name).join(", ") || "None"],
                  ["When", `${formatDate(date, "long")} at ${formatTime(time)}`],
                  ["Name", name.trim()],
                  ["Mobile", phone],
                  ...(email.trim() ? [["Email", email.trim()]] : []),
                  ...(rego.trim() || makeModel.trim() ? [["Car", [normalizeRego(rego), makeModel.trim()].filter(Boolean).join(" · ")]] : []),
                  ...(notes.trim() ? [["Notes", notes.trim()]] : []),
                ].map(([k, v]) => (
                  <div key={k} className="grid grid-cols-[110px_1fr] gap-3 px-4 py-3 sm:grid-cols-[140px_1fr]">
                    <dt className="text-fg-muted">{k}</dt>
                    <dd className="font-medium break-words">{v}</dd>
                  </div>
                ))}
              </dl>
              <p className="text-sm text-fg-muted">
                {settings.require_approval ? "We'll confirm your booking by text. " : "You're booked in as soon as you confirm. "}
                You pay at the shop (card or cash). Change or cancel online up to {settings.cancel_cutoff_hours} hours before.
              </p>
            </section>
          )}

          <div className="hidden items-center justify-between gap-3 lg:flex">
            {step > 1 ? (
              <Button variant="ghost" icon={ArrowLeft} onClick={() => go((step - 1) as Step)}>
                Back
              </Button>
            ) : (
              <span />
            )}
            <NextButton step={step} canNext={canNext} busy={busy === "submit"} onNext={() => (step === 3 && !detailsOk ? setTouched(true) : go((step + 1) as Step))} onSubmit={submit} onInvalid={() => setTouched(true)} />
          </div>
        </div>

        <aside className="hidden lg:block">
          <div className="sticky top-6 rounded-3xl bg-panel p-6 shadow-card ring-1 ring-line">
            <h2 className="font-bold">Your booking</h2>
            {!service ? (
              <p className="mt-2 text-fg-muted">Choose a service to see the price.</p>
            ) : (
              <>
                <ul className="mt-4 space-y-2 text-[15px]">
                  <li className="flex justify-between gap-3">
                    <span>
                      {service.name} <span className="text-fg-muted">· {VEHICLE_TYPE_LABELS[vt]}</span>
                    </span>
                    <span className="tabular-nums">{formatCents(servicePriceCents(service, vt))}</span>
                  </li>
                  {chosenAddons.map((a) => (
                    <li key={a.id} className="flex justify-between gap-3 text-fg-muted">
                      <span>{a.name}</span>
                      <span className="tabular-nums">{formatCents(toCents(a.price))}</span>
                    </li>
                  ))}
                  {discount > 0 && (
                    <li className="flex justify-between gap-3 text-ok-ink">
                      <span>Promo {promoResult?.code}</span>
                      <span className="tabular-nums">−{formatCents(discount)}</span>
                    </li>
                  )}
                </ul>
                <div className="mt-4 flex items-baseline justify-between border-t border-line pt-4">
                  <span className="font-semibold">{service.requires_quote ? "From" : "Estimated total"}</span>
                  <span className="text-2xl font-extrabold tabular-nums">{formatCents(total)}</span>
                </div>
                <p className="mt-1 text-xs text-fg-muted">Incl. GST · pay at the shop</p>
                {date && (
                  <p className="mt-4 flex items-center gap-2 rounded-xl bg-sunken px-3 py-2 text-sm">
                    <Clock size={16} className="text-accent" aria-hidden />
                    {formatDay(date, "medium", settings.today)}
                    {time ? ` · ${formatTime(time)}` : ""} · about {formatDuration(minutes)}
                  </p>
                )}
              </>
            )}
          </div>
        </aside>
      </div>

      {/* Phones: price + next step, always within thumb reach. */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-panel/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur lg:hidden">
        <div className="mx-auto flex max-w-xl items-center gap-3">
          {step > 1 && <Button variant="ghost" size="icon" icon={ArrowLeft} aria-label="Back" onClick={() => go((step - 1) as Step)} />}
          <div className="min-w-0 flex-1">
            <p className="text-xs text-fg-muted">{service ? (service.requires_quote ? "From" : "Estimated") : "Choose a service"}</p>
            <p className="text-lg font-extrabold tabular-nums">{service ? formatCents(total) : "—"}</p>
          </div>
          <NextButton step={step} canNext={canNext} busy={busy === "submit"} onNext={() => (step === 3 && !detailsOk ? setTouched(true) : go((step + 1) as Step))} onSubmit={submit} onInvalid={() => setTouched(true)} />
        </div>
      </div>
    </div>
  );
}

function NextButton({ step, canNext, busy, onNext, onSubmit, onInvalid }: { step: Step; canNext: boolean; busy: boolean; onNext: () => void; onSubmit: () => void; onInvalid: () => void }) {
  if (step === 4)
    return (
      <Button variant="primary" size="lg" loading={busy} onClick={onSubmit}>
        Confirm booking
      </Button>
    );
  return (
    <Button
      variant="primary"
      size="lg"
      iconRight={ArrowRight}
      // Step 3 stays clickable so pressing it reveals what's missing.
      disabled={!canNext && step !== 3}
      onClick={() => (canNext ? onNext() : onInvalid())}
    >
      {step === 1 ? "Choose a time" : step === 2 ? "Your details" : "Review"}
    </Button>
  );
}

function Waitlist({ date, serviceId, name: initialName, phone: initialPhone, supabase }: { date: string; serviceId: string; name: string; phone: string; supabase: ReturnType<typeof createClient> }) {
  const [name, setName] = useState(initialName);
  const [phone, setPhone] = useState(initialPhone);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function join() {
    setBusy(true);
    setError(null);
    try {
      await joinWaitlist(supabase, name, phone, date, serviceId, "");
      setDone(true);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="mt-4 rounded-2xl bg-panel p-5 ring-1 ring-line">
      <p className="flex items-center gap-2 font-semibold">
        <CalendarX size={20} className="text-accent" aria-hidden /> Fully booked that day
      </p>
      {done ? (
        <p className="mt-2 text-ok-ink">You&apos;re on the list. We&apos;ll text you if a spot opens up.</p>
      ) : (
        <>
          <p className="mt-1 text-fg-muted">Try another day, or leave your number and we&apos;ll text you if a spot opens up.</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <Field label="Name">
              <Input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
            </Field>
            <Field label="Mobile">
              <Input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" />
            </Field>
            <Button loading={busy} disabled={name.trim().length < 2 || !isValidPhone(normalizeAuPhone(phone))} onClick={join}>
              Text me
            </Button>
          </div>
          {error && <p className="mt-2 text-sm text-bad-ink">{error}</p>}
        </>
      )}
    </div>
  );
}
