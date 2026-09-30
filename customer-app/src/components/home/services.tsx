"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, Clock } from "lucide-react";
import { cn } from "@/lib/core/cn";
import { formatCents, toCents } from "@/lib/core/money";
import { VEHICLE_TYPES, VEHICLE_TYPE_LABELS, type VehicleType } from "@/lib/core/status";
import { formatDuration } from "@/lib/core/time";
import { buttonClasses } from "@/components/ui/button";
import { servicePriceCents, type PublicAddon, type PublicService } from "@/lib/public";

export function ServicesSection({ services, addons }: { services: PublicService[]; addons: PublicAddon[] }) {
  const [vt, setVt] = useState<VehicleType>("sedan");
  return (
    <section id="services" className="scroll-mt-6 bg-canvas py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="text-sm font-bold tracking-[0.18em] text-accent uppercase">Services & prices</p>
            <h2 className="mt-2 text-3xl font-extrabold tracking-tight sm:text-5xl">Pick your shine</h2>
            <p className="mt-3 max-w-xl text-fg-muted">Prices include GST and depend on the size of your vehicle.</p>
          </div>
          <div role="radiogroup" aria-label="Vehicle size" className="flex flex-wrap gap-1 rounded-full bg-panel p-1 shadow-card ring-1 ring-line">
            {VEHICLE_TYPES.map((t) => (
              <button
                key={t}
                type="button"
                role="radio"
                aria-checked={vt === t}
                onClick={() => setVt(t)}
                className={cn(
                  "h-10 rounded-full px-4 text-sm font-semibold transition focus-visible:outline-2 focus-visible:outline-focus",
                  vt === t ? "bg-[#0f1013] text-white" : "text-fg-muted hover:text-fg",
                )}
              >
                {VEHICLE_TYPE_LABELS[t]}
              </button>
            ))}
          </div>
        </div>

        <ul className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {services.map((s) => {
            const featured = !!s.badge;
            return (
              <li
                key={s.id}
                className={cn(
                  "relative flex flex-col overflow-hidden rounded-3xl p-6 ring-1 transition sm:p-7",
                  featured ? "oz-dark bg-canvas text-fg shadow-pop ring-line" : "bg-panel shadow-card ring-line hover:ring-line-strong",
                )}
              >
                {featured && <div aria-hidden className="pointer-events-none absolute -top-10 -right-10 h-40 w-40 rounded-full bg-accent/30 blur-3xl" />}
                <div className="relative flex items-start justify-between gap-3">
                  <h3 className="text-xl font-bold tracking-tight">{s.name}</h3>
                  {s.badge && <span className="oz-gloss rounded-full bg-accent px-3 py-1 text-xs font-bold text-accent-fg">{s.badge}</span>}
                </div>
                {s.tagline && <p className="relative mt-1 text-fg-muted">{s.tagline}</p>}
                <p className="relative mt-5 flex items-baseline gap-2">
                  {s.requires_quote ? (
                    <>
                      <span className="text-sm text-fg-muted">from</span>
                      <span className="text-4xl font-extrabold tracking-tight">{formatCents(toCents(s.price_from), { whole: true })}</span>
                    </>
                  ) : (
                    <span className="text-4xl font-extrabold tracking-tight tabular-nums">{formatCents(servicePriceCents(s, vt), { whole: true })}</span>
                  )}
                  {s.duration_minutes && (
                    <span className="ml-auto inline-flex items-center gap-1 text-sm text-fg-muted">
                      <Clock size={14} aria-hidden />
                      {formatDuration(s.duration_minutes)}
                    </span>
                  )}
                </p>
                {s.requires_quote && <p className="relative mt-1 text-sm text-fg-muted">Final price after we inspect the paint.</p>}
                {!!s.includes?.length && (
                  <ul className="relative mt-5 space-y-2 text-[15px]">
                    {s.includes.map((i) => (
                      <li key={i} className="flex gap-2.5">
                        <Check size={18} className="mt-0.5 shrink-0 text-accent" aria-hidden />
                        {i}
                      </li>
                    ))}
                  </ul>
                )}
                <div className="relative mt-auto pt-6">
                  <Link href={`/book?service=${s.id}&vehicle=${vt}`} className={buttonClasses({ variant: featured ? "primary" : "secondary", block: true })}>
                    Book {s.name}
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>

        {addons.length > 0 && (
          <div className="mt-12 rounded-3xl bg-panel p-6 shadow-card ring-1 ring-line sm:p-8">
            <h3 className="text-lg font-bold">Add an extra</h3>
            <p className="text-fg-muted">Pick these when you book.</p>
            <ul className="mt-5 grid gap-x-8 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
              {addons.map((a) => (
                <li key={a.id} className="flex items-baseline justify-between gap-3 border-b border-line pb-3">
                  <span>{a.name}</span>
                  <span className="font-semibold tabular-nums">+{formatCents(toCents(a.price), { whole: true })}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}
