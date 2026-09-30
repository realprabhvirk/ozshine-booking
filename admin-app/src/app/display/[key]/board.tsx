"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { createClient } from "@supabase/supabase-js";
import { Sparkles } from "lucide-react";
import logo from "@/assets/oz-shine-logo.png";
import { cn } from "@/lib/core/cn";
import { formatClock, formatDate, formatTime, shopDateOf } from "@/lib/core/time";

export type Board = {
  business_name: string;
  messages: string[];
  today: string;
  now: string;
  in_bay: Array<{ first_name: string; rego: string | null; service: string; bay: string | null; started_at: string | null; eta: string | null }>;
  ready: Array<{ first_name: string; rego: string | null; ready_at: string | null }>;
  next_up: Array<{ time: string; service: string; rego: string | null; arrived: boolean }>;
};

export function DisplayBoard({ displayKey, initial }: { displayKey: string; initial: Board }) {
  const [board, setBoard] = useState(initial);
  const [now, setNow] = useState(() => new Date(initial.now).getTime());
  const [stale, setStale] = useState(false);
  const [msg, setMsg] = useState(0);

  useEffect(() => {
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
    const poll = window.setInterval(async () => {
      const { data, error } = await supabase.rpc("get_display_board", { p_key: displayKey });
      if (error || !data) setStale(true);
      else {
        setBoard(data as Board);
        setStale(false);
      }
    }, 15000);
    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    const rotate = window.setInterval(() => setMsg((m) => m + 1), 8000);
    // A TV runs for days: reload once a night to pick up any site update.
    const reload = window.setTimeout(() => window.location.reload(), 12 * 60 * 60 * 1000);
    return () => {
      window.clearInterval(poll);
      window.clearInterval(tick);
      window.clearInterval(rotate);
      window.clearTimeout(reload);
    };
  }, [displayKey]);

  const messages = board.messages.filter((m) => m.trim());
  const message = messages.length ? messages[msg % messages.length] : null;

  return (
    <main className="relative flex h-dvh flex-col overflow-hidden bg-[#07080a] text-white [font-size:clamp(14px,1.25vw,28px)]">
      <div aria-hidden className="pointer-events-none absolute -top-1/3 -right-1/4 h-[120%] w-[60%] rounded-full bg-[#c61b1f]/25 blur-[140px]" />
      <header className="relative flex items-center justify-between px-[3em] pt-[2em]">
        <Image src={logo} alt="OzShine" priority className="h-[3em] w-auto" />
        <div className="text-right">
          <p className="text-[3em] leading-none font-extrabold tabular-nums">{formatClock(now)}</p>
          <p className="mt-1 text-[1.1em] text-white/60">{formatDate(shopDateOf(now), "long")}</p>
        </div>
      </header>

      <div className="relative grid min-h-0 flex-1 grid-cols-[1.35fr_1fr] gap-[2em] px-[3em] py-[2em]">
        <section className="flex min-h-0 flex-col">
          <h2 className="mb-[0.8em] text-[1.3em] font-bold tracking-[0.2em] text-white/50 uppercase">Being washed</h2>
          {board.in_bay.length === 0 ? (
            <p className="text-[1.6em] text-white/40">All bays are free right now.</p>
          ) : (
            <ul className="grid gap-[1em]">
              {board.in_bay.map((c, i) => {
                const start = c.started_at ? new Date(c.started_at).getTime() : now;
                const end = c.eta ? new Date(c.eta).getTime() : now;
                const pct = end > start ? Math.min(100, Math.max(3, ((now - start) / (end - start)) * 100)) : 50;
                const late = end < now;
                return (
                  <li key={i} className="rounded-[1.2em] bg-white/[0.06] p-[1.2em] ring-1 ring-white/10">
                    <div className="flex items-baseline justify-between gap-[1em]">
                      <p className="text-[2.2em] leading-tight font-extrabold">
                        {c.first_name} <span className="font-mono text-[0.7em] font-semibold text-white/50">{c.rego}</span>
                      </p>
                      {c.bay && <p className="shrink-0 text-[1.2em] font-semibold text-white/60">{c.bay}</p>}
                    </div>
                    <p className="text-[1.2em] text-white/60">{c.service}</p>
                    <div className="mt-[0.8em] h-[0.6em] overflow-hidden rounded-full bg-white/10">
                      <div className="h-full rounded-full bg-gradient-to-r from-[#e0262b] to-[#ff5a5f] transition-[width] duration-1000" style={{ width: `${pct}%` }} />
                    </div>
                    <p className="mt-[0.4em] text-[1.1em] text-white/70">{late ? "Finishing up" : c.eta ? `Ready around ${formatClock(c.eta)}` : ""}</p>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <div className="flex min-h-0 flex-col gap-[2em]">
          <section>
            <h2 className="mb-[0.8em] text-[1.3em] font-bold tracking-[0.2em] text-white/50 uppercase">Ready to collect</h2>
            {board.ready.length === 0 ? (
              <p className="text-[1.4em] text-white/40">—</p>
            ) : (
              <ul className="grid gap-[0.8em]">
                {board.ready.map((c, i) => (
                  <li key={i} className="flex items-center gap-[0.8em] rounded-[1.2em] bg-gradient-to-r from-[#c61b1f] to-[#e0262b] px-[1.2em] py-[0.9em] shadow-[0_0_40px_rgba(224,38,43,0.35)]">
                    <Sparkles className="size-[1.8em] shrink-0 animate-pulse" aria-hidden />
                    <p className="text-[2em] leading-tight font-extrabold">
                      {c.first_name} <span className="font-mono text-[0.65em] font-semibold text-white/75">{c.rego}</span>
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="min-h-0">
            <h2 className="mb-[0.8em] text-[1.3em] font-bold tracking-[0.2em] text-white/50 uppercase">Coming up</h2>
            {board.next_up.length === 0 ? (
              <p className="text-[1.4em] text-white/40">No more bookings today.</p>
            ) : (
              <ul className="divide-y divide-white/10">
                {board.next_up.map((c, i) => (
                  <li key={i} className="flex items-center gap-[1em] py-[0.6em] text-[1.4em]">
                    <span className="w-[4.5em] shrink-0 font-bold tabular-nums">{formatTime(c.time)}</span>
                    <span className="min-w-0 flex-1 truncate text-white/80">{c.service}</span>
                    {c.arrived ? <span className="rounded-full bg-white/15 px-[0.6em] text-[0.8em] font-semibold">Here</span> : c.rego && <span className="font-mono text-[0.85em] text-white/50">{c.rego}</span>}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>

      <footer className={cn("relative flex items-center gap-[1em] border-t border-white/10 px-[3em] py-[1em]", !message && !stale && "invisible")}>
        {stale ? (
          <p className="text-[1.1em] text-white/50">Reconnecting…</p>
        ) : (
          <p key={msg} className="animate-oz-in text-[1.5em] font-semibold text-white/85">
            {message}
          </p>
        )}
      </footer>
    </main>
  );
}
