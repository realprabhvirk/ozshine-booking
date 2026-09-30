"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { User } from "@supabase/supabase-js";
import { CalendarCheck, Car, Copy, Gift, LogOut, Pencil, Plus, Receipt, Trash2, Trophy } from "lucide-react";
import { cn } from "@/lib/core/cn";
import { formatCents, toCents } from "@/lib/core/money";
import { isValidPhone, normalizeAuPhone, formatPhone } from "@/lib/core/phone";
import { ACTIVE_BOOKING_STATUSES, VEHICLE_TYPES, VEHICLE_TYPE_LABELS, type BookingStatus, type VehicleType } from "@/lib/core/status";
import { formatDate, formatTime } from "@/lib/core/time";
import { errorMessage } from "@/lib/core/errors";
import { callRpc } from "@/lib/rpc";
import { createClient } from "@/lib/supabase/client";
import type { PublicSettings } from "@/lib/public";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Button, buttonClasses } from "@/components/ui/button";
import { ConfirmDialog, Dialog } from "@/components/ui/dialog";
import { Field, Input, Select, Switch } from "@/components/ui/field";
import { Notice, Skeleton, Spinner } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";

type Loyalty = {
  linked: boolean;
  name: string;
  referral_code: string | null;
  visit_count: number;
  tier: { current: string | null; next: string | null; next_at: number | null } | null;
  rule: { name: string; visits_required: number } | null;
  progress: number;
  visits_to_next_reward: number | null;
  lifetime_spend: number | string;
  rewards: Array<{ code: string; description: string; status: string; issued_at: string; expires_at: string | null; redeemed_at: string | null }>;
};
type Profile = { id: string; name: string; phone: string | null; email: string | null; marketing_opt_in: boolean; deletion_requested_at: string | null };
type Vehicle = { id: string; rego: string | null; make_model: string | null; colour: string | null; nickname: string | null; vehicle_type: VehicleType; is_primary: boolean };
type MyBooking = {
  id: string;
  reference_code: string;
  status: BookingStatus;
  requested_date: string;
  requested_time: string;
  manage_token: string;
  price_estimate: number | string | null;
  amount_charged: number | string | null;
  service: { name: string } | null;
  vehicle: { rego: string | null } | null;
  invoices: Array<{ public_token: string; total: number | string; status: string }>;
};

export function AccountClient({ settings }: { settings: PublicSettings | null }) {
  const [supabase] = useState(() => createClient());
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [recovery, setRecovery] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user ?? null));
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY") setRecovery(true);
      setUser(session?.user ?? null);
    });
    return () => data.subscription.unsubscribe();
  }, [supabase]);

  return (
    <div className="mx-auto max-w-5xl px-4 pt-8 pb-16 sm:px-6">
      {user === undefined ? (
        <div className="space-y-4">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-48 w-full rounded-3xl" />
        </div>
      ) : recovery && user ? (
        <NewPassword onDone={() => setRecovery(false)} />
      ) : user ? (
        <Dashboard user={user} settings={settings} />
      ) : (
        <AuthPanel settings={settings} />
      )}
    </div>
  );
}

function AuthPanel({ settings }: { settings: PublicSettings | null }) {
  const [supabase] = useState(() => createClient());
  const [mode, setMode] = useState<"in" | "up" | "forgot">("in");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      if (mode === "forgot") {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/account` });
        if (error) throw error;
        setInfo("If there's an account for that email, we've sent a link to reset the password.");
      } else if (mode === "in") {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw new Error(error.message === "Invalid login credentials" ? "That email and password don't match." : error.message);
      } else {
        const ph = normalizeAuPhone(phone);
        if (name.trim().length < 2) throw new Error("Please enter your name.");
        if (!isValidPhone(ph)) throw new Error("Please enter a valid Australian mobile.");
        if (password.length < 8) throw new Error("Use at least 8 characters for your password.");
        const { data, error } = await supabase.auth.signUp({ email: email.trim(), password, options: { data: { name: name.trim(), phone: ph } } });
        if (error) throw error;
        if (!data.session) setInfo("Check your email to confirm your account, then come back and sign in.");
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const perks = [
    settings?.loyalty_rule ? `${settings.loyalty_rule.name}: every ${settings.loyalty_rule.visits_required} visits` : null,
    "See every visit and receipt in one place",
    "Book faster with your details and cars saved",
    settings?.referral_rule ? `Your own referral code (${settings.referral_rule.name.toLowerCase()})` : null,
  ].filter(Boolean) as string[];

  return (
    <div className="grid gap-8 lg:grid-cols-2 lg:items-start">
      <div className="oz-dark relative overflow-hidden rounded-3xl bg-canvas p-8 text-fg">
        <div aria-hidden className="pointer-events-none absolute -top-16 -right-16 h-64 w-64 rounded-full bg-accent/30 blur-3xl" />
        <Trophy size={36} className="relative text-accent" aria-hidden />
        <h1 className="relative mt-4 text-3xl font-extrabold tracking-tight">OzShine Rewards</h1>
        <p className="relative mt-2 text-fg-muted">A free account. Your past visits are added automatically when your mobile or email matches.</p>
        <ul className="relative mt-6 space-y-3">
          {perks.map((p) => (
            <li key={p} className="flex gap-3">
              <Gift size={20} className="mt-0.5 shrink-0 text-accent" aria-hidden />
              {p}
            </li>
          ))}
        </ul>
        <p className="relative mt-8 text-sm text-fg-faint">You never need an account to book.</p>
      </div>

      <form onSubmit={submit} className="rounded-3xl bg-panel p-6 shadow-card ring-1 ring-line sm:p-8" noValidate>
        {mode !== "forgot" && (
          <div role="tablist" className="mb-6 grid grid-cols-2 gap-1 rounded-full bg-sunken p-1">
            {(["in", "up"] as const).map((m) => (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={mode === m}
                onClick={() => {
                  setMode(m);
                  setError(null);
                  setInfo(null);
                }}
                className={cn("h-11 rounded-full font-semibold transition", mode === m ? "bg-panel shadow-card" : "text-fg-muted")}
              >
                {m === "in" ? "Sign in" : "Create account"}
              </button>
            ))}
          </div>
        )}
        {mode === "forgot" && <h2 className="mb-4 text-xl font-bold">Reset your password</h2>}
        <div className="space-y-4">
          {error && <Notice tone="bad">{error}</Notice>}
          {info && <Notice tone="ok">{info}</Notice>}
          {mode === "up" && (
            <>
              <Field label="Name">
                <Input autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
              </Field>
              <Field label="Mobile" hint="The number you book with, so we can find your visits">
                <Input type="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
              </Field>
            </>
          )}
          <Field label="Email">
            <Input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          {mode !== "forgot" && (
            <Field label="Password" hint={mode === "up" ? "At least 8 characters" : undefined}>
              <Input type="password" autoComplete={mode === "up" ? "new-password" : "current-password"} value={password} onChange={(e) => setPassword(e.target.value)} />
            </Field>
          )}
          <Button type="submit" variant="primary" block loading={busy} disabled={!email.trim() || (mode !== "forgot" && !password)}>
            {mode === "in" ? "Sign in" : mode === "up" ? "Create account" : "Send reset link"}
          </Button>
          <button type="button" className="w-full text-center text-sm font-semibold text-accent-ink hover:underline" onClick={() => setMode(mode === "forgot" ? "in" : "forgot")}>
            {mode === "forgot" ? "Back to sign in" : "Forgot your password?"}
          </button>
        </div>
      </form>
    </div>
  );
}

function NewPassword({ onDone }: { onDone: () => void }) {
  const [supabase] = useState(() => createClient());
  const toast = useToast();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) toast.error(error.message);
    else {
      toast.success("Password updated");
      onDone();
    }
  }
  return (
    <div className="mx-auto max-w-md rounded-3xl bg-panel p-8 shadow-card ring-1 ring-line">
      <h1 className="text-2xl font-bold">Choose a new password</h1>
      <Field label="New password" hint="At least 8 characters" className="mt-4">
        <Input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
      </Field>
      <Button variant="primary" block className="mt-4" loading={busy} disabled={password.length < 8} onClick={save}>
        Save password
      </Button>
    </div>
  );
}

function Dashboard({ user, settings }: { user: User; settings: PublicSettings | null }) {
  const [supabase] = useState(() => createClient());
  const toast = useToast();
  const [loyalty, setLoyalty] = useState<Loyalty | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [bookings, setBookings] = useState<MyBooking[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [editProfile, setEditProfile] = useState(false);
  const [editVehicle, setEditVehicle] = useState<Vehicle | "new" | null>(null);
  const [removeVehicle, setRemoveVehicle] = useState<Vehicle | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  // Links this login to past visits (by mobile/email) the first time, then
  // loads everything the dashboard shows.
  const fetchAccount = useCallback(async () => {
    await callRpc(supabase, "link_account_to_customer");
    const l = await callRpc<Loyalty>(supabase, "get_my_loyalty");
    const { data: p } = await supabase.from("customers").select("id, name, phone, email, marketing_opt_in, deletion_requested_at").eq("auth_user_id", user.id).maybeSingle();
    if (!p) return { l, p: null, v: [] as Vehicle[], b: [] as MyBooking[] };
    const [v, b] = await Promise.all([
      supabase.from("vehicles").select("id, rego, make_model, colour, nickname, vehicle_type, is_primary").eq("customer_id", p.id).is("archived_at", null).order("is_primary", { ascending: false }).order("created_at"),
      supabase
        .from("bookings")
        .select("id, reference_code, status, requested_date, requested_time, manage_token, price_estimate, amount_charged, service:services(name), vehicle:vehicles(rego), invoices(public_token, total, status)")
        .eq("customer_id", p.id)
        .order("requested_date", { ascending: false })
        .order("requested_time", { ascending: false })
        .limit(100),
    ]);
    return { l, p: p as Profile, v: (v.data ?? []) as Vehicle[], b: (b.data ?? []) as unknown as MyBooking[] };
  }, [supabase, user.id]);

  const apply = useCallback((r: Awaited<ReturnType<typeof fetchAccount>>) => {
    setLoyalty(r.l);
    setProfile(r.p);
    setVehicles(r.v);
    setBookings(r.b);
  }, []);

  const load = useCallback(() => fetchAccount().then(apply, (e) => setError(errorMessage(e))), [fetchAccount, apply]);

  useEffect(() => {
    let cancelled = false;
    fetchAccount().then(
      (r) => !cancelled && apply(r),
      (e) => !cancelled && setError(errorMessage(e)),
    );
    return () => {
      cancelled = true;
    };
  }, [fetchAccount, apply]);

  async function signOut() {
    await supabase.auth.signOut();
  }

  if (error) return <Notice tone="bad" title="Couldn't load your account">{error}</Notice>;
  if (!loyalty || !profile)
    return (
      <div className="flex items-center gap-3 text-fg-muted">
        <Spinner /> Loading your account…
      </div>
    );

  const upcoming = bookings.filter((b) => ACTIVE_BOOKING_STATUSES.includes(b.status)).reverse();
  const past = bookings.filter((b) => !ACTIVE_BOOKING_STATUSES.includes(b.status));
  const activeRewards = loyalty.rewards.filter((r) => r.status === "issued");
  const req = loyalty.rule?.visits_required ?? 0;
  const referralLink = loyalty.referral_code && typeof window !== "undefined" ? `${window.location.origin}/book?ref=${loyalty.referral_code}` : null;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-fg-muted">G&apos;day,</p>
          <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">{profile.name.split(" ")[0]}</h1>
        </div>
        <div className="flex gap-2">
          <Link href="/book" className={buttonClasses({ variant: "primary" })}>
            <CalendarCheck size={18} aria-hidden /> Book a wash
          </Link>
          <Button variant="ghost" icon={LogOut} onClick={signOut}>
            Sign out
          </Button>
        </div>
      </div>

      {profile.deletion_requested_at && <Notice tone="warn">You&apos;ve asked us to delete your details. We&apos;ll take care of it shortly.</Notice>}

      {settings?.loyalty_enabled !== false && (
        <section className="oz-dark relative overflow-hidden rounded-3xl bg-canvas p-6 text-fg sm:p-8">
          <div aria-hidden className="pointer-events-none absolute -right-20 -bottom-24 h-72 w-72 rounded-full bg-accent/30 blur-3xl" />
          <div className="relative grid gap-8 md:grid-cols-[1fr_auto] md:items-end">
            <div>
              <p className="flex items-center gap-2 text-sm font-semibold tracking-widest text-fg-faint uppercase">
                <Trophy size={16} className="text-accent" aria-hidden /> {loyalty.tier?.current ?? "Member"}
              </p>
              <p className="mt-3 text-5xl font-extrabold tabular-nums">{loyalty.visit_count}</p>
              <p className="text-fg-muted">visit{loyalty.visit_count === 1 ? "" : "s"} so far</p>
              {loyalty.rule && req > 0 && (
                <div className="mt-6 max-w-md">
                  <div className="flex gap-1.5" aria-hidden>
                    {Array.from({ length: req }, (_, i) => (
                      <span key={i} className={cn("h-3 flex-1 rounded-full", i < loyalty.progress ? "oz-gloss bg-accent" : "bg-white/15")} />
                    ))}
                  </div>
                  <p className="mt-2 font-semibold">
                    {loyalty.visits_to_next_reward === req && loyalty.visit_count > 0
                      ? `Reward earned! ${req} more for the next one.`
                      : `${loyalty.visits_to_next_reward} more visit${loyalty.visits_to_next_reward === 1 ? "" : "s"} to ${loyalty.rule.name.toLowerCase()}`}
                  </p>
                </div>
              )}
              {loyalty.tier?.next && loyalty.tier.next_at && (
                <p className="mt-2 text-sm text-fg-muted">
                  {loyalty.tier.next_at - loyalty.visit_count} more to reach {loyalty.tier.next}
                </p>
              )}
            </div>
            {referralLink && (
              <div className="rounded-2xl bg-white/5 p-4 ring-1 ring-line">
                <p className="text-sm text-fg-muted">Your referral code</p>
                <p className="font-mono text-2xl font-bold tracking-wider">{loyalty.referral_code}</p>
                <Button
                  size="sm"
                  variant="light"
                  icon={Copy}
                  className="mt-3"
                  onClick={() =>
                    navigator.clipboard?.writeText(referralLink).then(
                      () => toast.success("Link copied", "Send it to a mate"),
                      () => toast.error("Couldn't copy"),
                    )
                  }
                >
                  Copy invite link
                </Button>
              </div>
            )}
          </div>
          {activeRewards.length > 0 && (
            <ul className="relative mt-6 grid gap-2 sm:grid-cols-2">
              {activeRewards.map((r) => (
                <li key={r.code} className="flex items-center gap-3 rounded-2xl bg-white/8 p-4 ring-1 ring-accent/50">
                  <Gift size={22} className="shrink-0 text-accent" aria-hidden />
                  <div className="min-w-0">
                    <p className="font-semibold">{r.description}</p>
                    <p className="text-sm text-fg-muted">
                      Code <span className="font-mono">{r.code}</span>
                      {r.expires_at && ` · use by ${formatDate(r.expires_at.slice(0, 10), "medium")}`}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <section>
        <h2 className="text-xl font-bold">Upcoming</h2>
        {upcoming.length === 0 ? (
          <p className="mt-2 text-fg-muted">
            Nothing booked.{" "}
            <Link href="/book" className="font-semibold text-accent-ink hover:underline">
              Book a wash
            </Link>
          </p>
        ) : (
          <ul className="mt-3 grid gap-3 md:grid-cols-2">
            {upcoming.map((b) => (
              <li key={b.id}>
                <Link href={`/manage/${b.manage_token}`} className="block rounded-2xl bg-panel p-5 shadow-card ring-1 ring-line transition hover:ring-line-strong">
                  <div className="flex items-start justify-between gap-3">
                    <p className="font-bold">{b.service?.name}</p>
                    <StatusBadge status={b.status} />
                  </div>
                  <p className="mt-1 text-fg-muted">
                    {formatDate(b.requested_date, "long")} at {formatTime(b.requested_time)}
                    {b.vehicle?.rego && ` · ${b.vehicle.rego}`}
                  </p>
                  <p className="mt-3 text-sm font-semibold text-accent-ink">Manage →</p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="grid gap-8 lg:grid-cols-[1.4fr_1fr]">
        <section>
          <h2 className="text-xl font-bold">Visit history</h2>
          {past.length === 0 ? (
            <p className="mt-2 text-fg-muted">Your completed visits will show up here.</p>
          ) : (
            <ul className="mt-3 divide-y divide-line rounded-2xl bg-panel shadow-card ring-1 ring-line">
              {past.map((b) => {
                const inv = b.invoices?.find((i) => i.status !== "void");
                const amount = inv ? toCents(inv.total) : toCents(b.amount_charged ?? b.price_estimate ?? 0);
                return (
                  <li key={b.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{b.service?.name}</p>
                      <p className="text-sm text-fg-muted">
                        {formatDate(b.requested_date, "medium")}
                        {b.vehicle?.rego && ` · ${b.vehicle.rego}`}
                      </p>
                    </div>
                    {b.status !== "completed" && <StatusBadge status={b.status} />}
                    {b.status === "completed" && amount > 0 && <span className="font-semibold tabular-nums">{formatCents(amount)}</span>}
                    {inv ? (
                      <Link href={`/r/${inv.public_token}`} className={buttonClasses({ variant: "ghost", size: "icon-sm" })} aria-label="Receipt">
                        <Receipt size={18} aria-hidden />
                      </Link>
                    ) : (
                      <Link href={`/manage/${b.manage_token}`} className="text-sm font-semibold text-accent-ink hover:underline">
                        View
                      </Link>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <div className="space-y-8">
          <section>
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold">My cars</h2>
              <Button size="sm" icon={Plus} onClick={() => setEditVehicle("new")}>
                Add
              </Button>
            </div>
            <ul className="mt-3 space-y-2">
              {vehicles.length === 0 && <li className="text-fg-muted">No cars saved yet.</li>}
              {vehicles.map((v) => (
                <li key={v.id} className="flex items-center gap-3 rounded-2xl bg-panel px-4 py-3 shadow-card ring-1 ring-line">
                  <Car size={20} className="shrink-0 text-fg-faint" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">
                      {v.nickname ?? v.rego ?? VEHICLE_TYPE_LABELS[v.vehicle_type]} {v.is_primary && <Badge tone="accent">Main</Badge>}
                    </p>
                    <p className="truncate text-sm text-fg-muted">{[v.rego && v.nickname ? v.rego : null, v.make_model, v.colour, VEHICLE_TYPE_LABELS[v.vehicle_type]].filter(Boolean).join(" · ")}</p>
                  </div>
                  <Button size="icon-sm" variant="ghost" icon={Pencil} aria-label="Edit car" onClick={() => setEditVehicle(v)} />
                  <Button size="icon-sm" variant="ghost" icon={Trash2} aria-label="Remove car" onClick={() => setRemoveVehicle(v)} />
                </li>
              ))}
            </ul>
          </section>

          <section className="rounded-2xl bg-panel p-5 shadow-card ring-1 ring-line">
            <div className="flex items-center justify-between">
              <h2 className="font-bold">My details</h2>
              <Button size="sm" variant="ghost" icon={Pencil} onClick={() => setEditProfile(true)}>
                Edit
              </Button>
            </div>
            <dl className="mt-3 space-y-1 text-[15px]">
              <p>{profile.name}</p>
              <p className="text-fg-muted">{profile.phone ? formatPhone(profile.phone) : "No mobile"}</p>
              <p className="text-fg-muted">{profile.email ?? user.email}</p>
              <p className="text-sm text-fg-muted">{profile.marketing_opt_in ? "Getting special offers" : "No special offers"}</p>
            </dl>
            {!profile.deletion_requested_at && (
              <button type="button" className="mt-4 text-sm text-fg-muted hover:text-bad-ink hover:underline" onClick={() => setDeleteOpen(true)}>
                Delete my details
              </button>
            )}
          </section>
        </div>
      </div>

      <ProfileDialog key={editProfile ? "p-open" : "p-closed"} open={editProfile} profile={profile} onClose={() => setEditProfile(false)} onSaved={load} />
      <VehicleDialog key={editVehicle === null ? "v-none" : editVehicle === "new" ? "v-new" : editVehicle.id} vehicle={editVehicle} onClose={() => setEditVehicle(null)} onSaved={load} />
      <ConfirmDialog
        open={!!removeVehicle}
        onClose={() => setRemoveVehicle(null)}
        busy={busy === "remove"}
        title={`Remove ${removeVehicle?.rego ?? "this car"}?`}
        description="Past visits with it stay in your history."
        confirmLabel="Remove"
        tone="danger"
        onConfirm={async () => {
          if (!removeVehicle) return;
          setBusy("remove");
          try {
            await callRpc(supabase, "archive_my_vehicle", { p_vehicle_id: removeVehicle.id });
            setRemoveVehicle(null);
            await load();
          } catch (e) {
            toast.error(e);
          } finally {
            setBusy(null);
          }
        }}
      />
      <ConfirmDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        busy={busy === "delete"}
        title="Delete your details?"
        description="We'll remove your name, number, email and cars. Invoices stay (the law requires it) but won't show who you are. Any rewards will be lost."
        confirmLabel="Yes, delete my details"
        tone="danger"
        onConfirm={async () => {
          setBusy("delete");
          try {
            await callRpc(supabase, "request_account_deletion");
            setDeleteOpen(false);
            toast.success("Request sent");
            await load();
          } catch (e) {
            toast.error(e);
          } finally {
            setBusy(null);
          }
        }}
      />
    </div>
  );
}

function ProfileDialog({ open, profile, onClose, onSaved }: { open: boolean; profile: Profile; onClose: () => void; onSaved: () => Promise<void> }) {
  const [supabase] = useState(() => createClient());
  const [name, setName] = useState(profile.name);
  const [phone, setPhone] = useState(profile.phone ?? "");
  const [email, setEmail] = useState(profile.email ?? "");
  const [optIn, setOptIn] = useState(profile.marketing_opt_in);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function save() {
    setBusy(true);
    setError(null);
    try {
      await callRpc(supabase, "update_my_profile", { payload: { name: name.trim(), phone: phone.trim(), email: email.trim(), marketing_opt_in: optIn } });
      await onSaved();
      onClose();
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
      title="My details"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" loading={busy} disabled={name.trim().length < 2} onClick={save}>
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-4 pb-2">
        {error && <Notice tone="bad">{error}</Notice>}
        <Field label="Name">
          <Input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
        </Field>
        <Field label="Mobile">
          <Input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" />
        </Field>
        <Field label="Email" optional>
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
        </Field>
        <Switch checked={optIn} onChange={setOptIn} label="Special offers" description="The odd text or email, never more than monthly" />
      </div>
    </Dialog>
  );
}

function VehicleDialog({ vehicle, onClose, onSaved }: { vehicle: Vehicle | "new" | null; onClose: () => void; onSaved: () => Promise<void> }) {
  const [supabase] = useState(() => createClient());
  const v = vehicle === "new" || vehicle === null ? null : vehicle;
  const [rego, setRego] = useState(v?.rego ?? "");
  const [makeModel, setMakeModel] = useState(v?.make_model ?? "");
  const [colour, setColour] = useState(v?.colour ?? "");
  const [nickname, setNickname] = useState(v?.nickname ?? "");
  const [vt, setVt] = useState<VehicleType>(v?.vehicle_type ?? "sedan");
  const [primary, setPrimary] = useState(v?.is_primary ?? false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function save() {
    setBusy(true);
    setError(null);
    try {
      await callRpc(supabase, "upsert_my_vehicle", { payload: { id: v?.id ?? "", rego, make_model: makeModel, colour, nickname, vehicle_type: vt, is_primary: primary } });
      await onSaved();
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      open={vehicle !== null}
      onClose={onClose}
      dismissible={!busy}
      title={v ? "Edit car" : "Add a car"}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" loading={busy} onClick={save}>
            Save
          </Button>
        </>
      }
    >
      <div className="grid gap-4 pb-2 sm:grid-cols-2">
        {error && <Notice tone="bad" className="sm:col-span-2">{error}</Notice>}
        <Field label="Rego" optional>
          <Input value={rego} onChange={(e) => setRego(e.target.value.toUpperCase())} className="uppercase" maxLength={12} />
        </Field>
        <Field label="Size">
          <Select value={vt} onChange={(e) => setVt(e.target.value as VehicleType)}>
            {VEHICLE_TYPES.map((t) => (
              <option key={t} value={t}>
                {VEHICLE_TYPE_LABELS[t]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Make & model" optional>
          <Input value={makeModel} onChange={(e) => setMakeModel(e.target.value)} maxLength={60} />
        </Field>
        <Field label="Colour" optional>
          <Input value={colour} onChange={(e) => setColour(e.target.value)} maxLength={30} />
        </Field>
        <Field label="Nickname" optional className="sm:col-span-2">
          <Input value={nickname} onChange={(e) => setNickname(e.target.value)} maxLength={30} placeholder="e.g. Work ute" />
        </Field>
        <div className="sm:col-span-2">
          <Switch checked={primary} onChange={setPrimary} label="Main car" description="Filled in automatically when you book" />
        </div>
      </div>
    </Dialog>
  );
}
