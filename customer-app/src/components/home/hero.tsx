import Link from "next/link";
import { CalendarCheck, Clock, MapPin, ShieldCheck } from "lucide-react";
import { buttonClasses } from "@/components/ui/button";
import { SiteHeader } from "@/components/site/header";
import { dayKeyOf } from "@/lib/core/time";
import { formatTime } from "@/lib/core/time";
import type { PublicSettings } from "@/lib/public";

export function Hero({ settings }: { settings: PublicSettings | null }) {
  const today = settings?.today ? settings.opening_hours?.[dayKeyOf(settings.today)] : null;
  const todayText = !settings ? null : !today || today.closed ? "Closed today" : `Open today ${formatTime(today.open)} – ${formatTime(today.close)}`;
  return (
    <div className="oz-dark relative overflow-hidden bg-canvas text-fg">
      {/* Studio-light backdrop in CSS: a red key light, a cool rim light and a
          diagonal sheen, standing in for wet-paint photography. */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -top-1/3 right-[-15%] h-[150%] w-[75%] rounded-full bg-accent/25 blur-[130px]" />
        <div className="absolute bottom-[-40%] left-[-20%] h-[90%] w-[65%] rounded-full bg-[#5b7cff]/10 blur-[110px]" />
        <div className="absolute inset-0 bg-[linear-gradient(115deg,transparent_30%,rgba(255,255,255,0.07)_48%,transparent_62%)]" />
        <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-b from-transparent to-canvas" />
      </div>
      <SiteHeader phone={settings?.phone} overlay />
      <section className="relative mx-auto grid max-w-6xl gap-12 px-4 pt-10 pb-20 sm:px-6 sm:pt-16 sm:pb-28 lg:grid-cols-[1.25fr_1fr] lg:items-end">
        <div>
          <p className="mb-5 inline-flex items-center gap-2 rounded-full bg-white/8 px-4 py-1.5 text-xs font-semibold tracking-[0.18em] text-fg-muted uppercase ring-1 ring-line">
            <MapPin size={14} className="text-accent" aria-hidden /> Hand car wash · Beenleigh
          </p>
          <h1 className="text-[2.6rem] leading-[1.02] font-extrabold tracking-tight sm:text-6xl xl:text-[4.25rem]">
            A showroom shine,
            <br />
            <span className="bg-gradient-to-r from-[#ff4a4f] to-accent bg-clip-text text-transparent">every single time.</span>
          </h1>
          <p className="mt-6 max-w-xl text-lg text-fg-muted sm:text-xl">
            Hand washing and detailing by people who care about the finish. Pick a time online in under a minute. No account, no deposit.
          </p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Link href="/book" className={buttonClasses({ variant: "primary", size: "lg" })}>
              <CalendarCheck size={20} aria-hidden />
              Book a wash
            </Link>
            <Link href="/#services" className={buttonClasses({ variant: "outline", size: "lg" })}>
              See prices
            </Link>
          </div>
        </div>
        <ul className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
          {todayText && (
            <li className="flex items-center gap-3 rounded-2xl bg-white/5 px-5 py-4 ring-1 ring-line backdrop-blur">
              <Clock size={22} className="shrink-0 text-accent" aria-hidden />
              <span className="font-semibold">{todayText}</span>
            </li>
          )}
          <li className="flex items-center gap-3 rounded-2xl bg-white/5 px-5 py-4 ring-1 ring-line backdrop-blur">
            <CalendarCheck size={22} className="shrink-0 text-accent" aria-hidden />
            <span>
              <span className="font-semibold">Live availability.</span> <span className="text-fg-muted">Only real free times are shown.</span>
            </span>
          </li>
          <li className="flex items-center gap-3 rounded-2xl bg-white/5 px-5 py-4 ring-1 ring-line backdrop-blur">
            <ShieldCheck size={22} className="shrink-0 text-accent" aria-hidden />
            <span>
              <span className="font-semibold">Change or cancel online</span> <span className="text-fg-muted">up to {settings?.cancel_cutoff_hours ?? 2} hours before.</span>
            </span>
          </li>
        </ul>
      </section>
    </div>
  );
}
