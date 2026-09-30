import Link from "next/link";
import { CalendarCheck, Car, Gift, MapPin, Phone, Sparkles, Star, Trophy, Users } from "lucide-react";
import { formatCents, toCents } from "@/lib/core/money";
import { buttonClasses } from "@/components/ui/button";
import { hoursRows, mapsLink, telLink } from "@/lib/hours";
import type { PublicSettings, Testimonial } from "@/lib/public";

function Eyebrow({ children }: { children: React.ReactNode }) {
  return <p className="text-sm font-bold tracking-[0.18em] text-accent uppercase">{children}</p>;
}

export function HowItWorks({ settings }: { settings: PublicSettings | null }) {
  const steps = [
    { icon: Car, title: "Pick your wash", text: "Choose a service and your vehicle size. Prices are shown up front." },
    { icon: CalendarCheck, title: "Choose a time", text: "Only genuinely free times are shown, so there's no back-and-forth." },
    {
      icon: Sparkles,
      title: settings?.require_approval ? "We confirm, you drop in" : "Drop in and relax",
      text: settings?.require_approval
        ? "We confirm your booking and you get a link to check, change or cancel it."
        : "You're booked straight away. Your link lets you check, change or cancel it.",
    },
  ];
  return (
    <section id="how" className="scroll-mt-6 bg-panel py-20 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <Eyebrow>How it works</Eyebrow>
        <h2 className="mt-2 text-3xl font-extrabold tracking-tight sm:text-4xl">Booked in under a minute</h2>
        <ol className="mt-10 grid gap-6 md:grid-cols-3">
          {steps.map((s, i) => (
            <li key={s.title} className="relative rounded-3xl bg-canvas p-6 ring-1 ring-line">
              <span aria-hidden className="absolute top-5 right-6 text-5xl font-extrabold text-fg/[0.06]">
                {i + 1}
              </span>
              <s.icon size={28} className="text-accent" aria-hidden />
              <h3 className="mt-4 text-lg font-bold">{s.title}</h3>
              <p className="mt-1 text-fg-muted">{s.text}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function rewardText(r: { reward_type: string; reward_value: number | string | null }) {
  if (r.reward_type === "percent") return `${Number(r.reward_value)}% off`;
  if (r.reward_type === "fixed") return `${formatCents(toCents(r.reward_value), { whole: true })} off`;
  return "a free extra";
}

export function Rewards({ settings }: { settings: PublicSettings | null }) {
  if (!settings?.loyalty_enabled || (!settings.loyalty_rule && !settings.referral_rule)) return null;
  const rule = settings.loyalty_rule;
  const ref = settings.referral_rule;
  const tiers = [...(settings.loyalty_tiers ?? [])].sort((a, b) => a.min_visits - b.min_visits);
  return (
    <section id="rewards" className="oz-dark relative scroll-mt-6 overflow-hidden bg-canvas py-20 text-fg sm:py-24">
      <div aria-hidden className="pointer-events-none absolute -bottom-40 left-1/3 h-96 w-96 rounded-full bg-accent/25 blur-[120px]" />
      <div className="relative mx-auto grid max-w-6xl gap-10 px-4 sm:px-6 lg:grid-cols-2 lg:items-center">
        <div>
          <Eyebrow>OzShine Rewards</Eyebrow>
          <h2 className="mt-2 text-3xl font-extrabold tracking-tight sm:text-5xl">Regulars get looked after</h2>
          <p className="mt-4 max-w-lg text-lg text-fg-muted">
            Every completed visit counts, whether you book online, call or walk in. Make a free account to see your progress and rewards.
          </p>
          <Link href="/account" className={buttonClasses({ variant: "light", size: "lg", className: "mt-8" })}>
            Make a free account
          </Link>
        </div>
        <ul className="grid gap-4">
          {rule && (
            <li className="flex gap-4 rounded-3xl bg-white/5 p-6 ring-1 ring-line">
              <Trophy size={28} className="shrink-0 text-accent" aria-hidden />
              <div>
                <p className="text-lg font-bold">{rule.name}</p>
                <p className="text-fg-muted">
                  Every {rule.visits_required} visits: {rewardText(rule)}. It&apos;s added to your account automatically.
                </p>
                <div aria-hidden className="mt-4 flex gap-1.5">
                  {Array.from({ length: rule.visits_required }, (_, i) => (
                    <span key={i} className={i === rule.visits_required - 1 ? "oz-gloss h-2.5 flex-1 rounded-full bg-accent" : "h-2.5 flex-1 rounded-full bg-white/15"} />
                  ))}
                </div>
              </div>
            </li>
          )}
          {ref && (
            <li className="flex gap-4 rounded-3xl bg-white/5 p-6 ring-1 ring-line">
              <Users size={28} className="shrink-0 text-accent" aria-hidden />
              <div>
                <p className="text-lg font-bold">{ref.name}</p>
                <p className="text-fg-muted">Share your code. When a mate has their first wash, you get {rewardText(ref)}.</p>
              </div>
            </li>
          )}
          {tiers.length > 1 && (
            <li className="flex gap-4 rounded-3xl bg-white/5 p-6 ring-1 ring-line">
              <Gift size={28} className="shrink-0 text-accent" aria-hidden />
              <div>
                <p className="text-lg font-bold">Member tiers</p>
                <p className="text-fg-muted">{tiers.map((t) => (t.min_visits ? `${t.name} (${t.min_visits}+ visits)` : t.name)).join(" · ")}</p>
              </div>
            </li>
          )}
        </ul>
      </div>
    </section>
  );
}

// Only real, published reviews. Nothing is shown if there are none.
export function Reviews({ items }: { items: Testimonial[] }) {
  if (!items.length) return null;
  return (
    <section className="bg-canvas py-20 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <Eyebrow>Reviews</Eyebrow>
        <h2 className="mt-2 text-3xl font-extrabold tracking-tight sm:text-4xl">What customers say</h2>
        <ul className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {items.slice(0, 6).map((t, i) => (
            <li key={i} className="rounded-3xl bg-panel p-6 shadow-card ring-1 ring-line">
              {t.rating && (
                <p className="flex gap-0.5 text-accent" aria-label={`${t.rating} out of 5 stars`}>
                  {Array.from({ length: 5 }, (_, k) => (
                    <Star key={k} size={18} aria-hidden fill={k < (t.rating ?? 0) ? "currentColor" : "none"} />
                  ))}
                </p>
              )}
              <blockquote className="mt-3 text-[15px] leading-relaxed">“{t.text}”</blockquote>
              <p className="mt-4 font-semibold">{t.name}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export function Visit({ settings }: { settings: PublicSettings | null }) {
  const rows = hoursRows(settings?.opening_hours);
  const map = mapsLink(settings?.address);
  const tel = telLink(settings?.phone);
  return (
    <section id="visit" className="scroll-mt-6 bg-panel py-20 sm:py-24">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 sm:px-6 lg:grid-cols-2">
        <div>
          <Eyebrow>Find us</Eyebrow>
          <h2 className="mt-2 text-3xl font-extrabold tracking-tight sm:text-4xl">OzShine Beenleigh</h2>
          {settings?.address && <p className="mt-4 flex gap-2 text-lg"><MapPin className="mt-1 shrink-0 text-accent" size={20} aria-hidden />{settings.address}</p>}
          <div className="mt-8 flex flex-wrap gap-3">
            {map && (
              <a href={map} target="_blank" rel="noreferrer" className={buttonClasses({ variant: "secondary" })}>
                <MapPin size={18} aria-hidden /> Directions
              </a>
            )}
            {tel && (
              <a href={tel} className={buttonClasses({ variant: "secondary" })}>
                <Phone size={18} aria-hidden /> {settings?.phone}
              </a>
            )}
          </div>
        </div>
        <div className="rounded-3xl bg-canvas p-6 ring-1 ring-line sm:p-8">
          <h3 className="font-bold">Opening hours</h3>
          <dl className="mt-4 divide-y divide-line">
            {rows.map((r) => (
              <div key={r.days} className="flex justify-between gap-4 py-3">
                <dt className="text-fg-muted">{r.days}</dt>
                <dd className="font-semibold tabular-nums">{r.time}</dd>
              </div>
            ))}
          </dl>
          {!!settings?.blackouts?.length && (
            <p className="mt-4 text-sm text-fg-muted">
              Heads up: we&apos;re closed on{" "}
              {settings.blackouts
                .filter((b) => !b.start_time)
                .slice(0, 3)
                .map((b) => new Date(`${b.date}T12:00:00+10:00`).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short", timeZone: "Australia/Brisbane" }))
                .join(", ") || "some days soon"}
              .
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

export function Faq({ settings }: { settings: PublicSettings | null }) {
  const items = [
    { q: "Do I need an account to book?", a: "No. Just your name and mobile. An account is optional and only needed to see your visit history and rewards." },
    { q: "How do I pay?", a: "At the shop when you pick up your car, by card (EFTPOS) or cash. We never take payment online." },
    { q: "Is the price exact?", a: "It's the price for your vehicle size. If your car needs something extra (heavy pet hair, tar, stains) we'll check with you before doing it." },
    {
      q: "Can I change or cancel?",
      a: `Yes. Your confirmation has a link to change or cancel, up to ${settings?.cancel_cutoff_hours ?? 2} hours before your time. After that, just give us a call.`,
    },
    { q: "How long will it take?", a: "Each service shows its usual time. You'll get a message when your car is ready to collect." },
  ];
  return (
    <section className="bg-canvas py-20 sm:py-24">
      <div className="mx-auto max-w-3xl px-4 sm:px-6">
        <Eyebrow>Questions</Eyebrow>
        <h2 className="mt-2 text-3xl font-extrabold tracking-tight sm:text-4xl">Good to know</h2>
        <div className="mt-8 divide-y divide-line rounded-3xl bg-panel shadow-card ring-1 ring-line">
          {items.map((i) => (
            <details key={i.q} className="group px-6 py-1">
              <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 font-semibold [&::-webkit-details-marker]:hidden">
                {i.q}
                <span aria-hidden className="text-2xl leading-none text-fg-faint transition group-open:rotate-45">+</span>
              </summary>
              <p className="pb-5 text-fg-muted">{i.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

export function FinalCta() {
  return (
    <section className="oz-gloss bg-accent py-16 text-accent-fg">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-6 px-4 sm:px-6">
        <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl">Ready for that showroom shine?</h2>
        <Link href="/book" className={buttonClasses({ variant: "light", size: "lg" })}>
          Book a wash
        </Link>
      </div>
    </section>
  );
}
