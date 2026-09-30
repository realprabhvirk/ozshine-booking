"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, Car, Search, User } from "lucide-react";
import { cn } from "@/lib/core/cn";
import { callRpc } from "@/lib/rpc";
import { errorMessage } from "@/lib/core/errors";
import { formatPhone } from "@/lib/core/phone";
import { formatDay, formatTime } from "@/lib/core/time";
import { BOOKING_STATUS_META, VEHICLE_TYPE_LABELS, type BookingStatus, type VehicleType } from "@/lib/core/status";
import { Spinner } from "@/components/ui/feedback";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { useShop } from "@/components/shop-context";

type Results = {
  customers: Array<{ id: string; name: string; phone: string | null; is_vip: boolean }>;
  vehicles: Array<{ id: string; rego: string; make_model: string | null; vehicle_type: VehicleType; customer_id: string; customer_name: string }>;
  bookings: Array<{ id: string; reference_code: string; status: BookingStatus; requested_date: string; requested_time: string; customer_name: string }>;
};

type Hit = { key: string; icon: typeof User; title: string; sub: string; badge?: React.ReactNode; go: () => void };

export function SearchDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { supabase } = useShop();
  const router = useRouter();
  const ref = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Results | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState(0);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      d.showModal();
      inputRef.current?.focus();
    }
    if (!open && d.open) d.close();
  }, [open]);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) return;
    let cancelled = false;
    const t = window.setTimeout(async () => {
      setLoading(true);
      try {
        const r = await callRpc<Results>(supabase, "global_search", { p_query: term });
        if (!cancelled) {
          setResults(r);
          setError(null);
          setActive(0);
        }
      } catch (e) {
        if (!cancelled) setError(errorMessage(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 220);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [q, supabase]);

  function close() {
    setQ("");
    setResults(null);
    onClose();
  }

  function go(path: string) {
    close();
    router.push(path);
  }

  const hits: Hit[] = q.trim().length < 2 || !results
    ? []
    : [
        ...results.bookings.map((b) => ({
          key: `b-${b.id}`,
          icon: CalendarClock,
          title: `${b.reference_code} · ${b.customer_name}`,
          sub: `${formatDay(b.requested_date)} ${formatTime(b.requested_time)} · ${BOOKING_STATUS_META[b.status].label}`,
          badge: <StatusBadge status={b.status} />,
          go: () => go(`/?booking=${b.id}`),
        })),
        ...results.vehicles.map((v) => ({
          key: `v-${v.id}`,
          icon: Car,
          title: `${v.rego} · ${v.customer_name}`,
          sub: [v.make_model, VEHICLE_TYPE_LABELS[v.vehicle_type]].filter(Boolean).join(" · "),
          go: () => go(`/customers?q=${encodeURIComponent(v.rego)}`),
        })),
        ...results.customers.map((c) => ({
          key: `c-${c.id}`,
          icon: User,
          title: c.name,
          sub: formatPhone(c.phone) || "No phone",
          badge: c.is_vip ? <Badge tone="accent">VIP</Badge> : undefined,
          go: () => go(`/customers?q=${encodeURIComponent(c.phone ?? c.name)}`),
        })),
      ];

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, hits.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter" && hits[active]) {
      e.preventDefault();
      hits[active].go();
    }
  }

  return (
    <dialog
      ref={ref}
      aria-label="Search"
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
      className="oz-dialog mx-auto mt-[10vh] w-[calc(100%-2rem)] max-w-2xl rounded-2xl bg-panel p-0 text-fg shadow-pop ring-1 ring-line open:animate-oz-in"
    >
      <div className="flex items-center gap-3 border-b border-line px-4">
        <Search size={20} className="shrink-0 text-fg-faint" aria-hidden />
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Name, phone, rego or OZ-XXXX"
          role="combobox"
          aria-expanded={hits.length > 0}
          aria-controls={listId}
          aria-activedescendant={hits[active] ? `${listId}-${hits[active].key}` : undefined}
          className="h-16 flex-1 bg-transparent text-lg outline-none placeholder:text-fg-faint"
          autoComplete="off"
          spellCheck={false}
        />
        {loading && <Spinner />}
      </div>
      <div className="max-h-[60vh] overflow-y-auto p-2">
        {error && <p className="px-3 py-6 text-center text-sm text-bad-ink">{error}</p>}
        {!error && q.trim().length < 2 && (
          <p className="px-3 py-6 text-center text-sm text-fg-muted">Type at least 2 letters or numbers.</p>
        )}
        {!error && q.trim().length >= 2 && results && hits.length === 0 && !loading && (
          <p className="px-3 py-6 text-center text-sm text-fg-muted">No matches for “{q.trim()}”.</p>
        )}
        <ul id={listId} role="listbox" aria-label="Results">
          {hits.map((h, i) => {
            const Icon = h.icon;
            return (
              <li key={h.key} id={`${listId}-${h.key}`} role="option" aria-selected={i === active}>
                <button
                  type="button"
                  onClick={h.go}
                  onMouseEnter={() => setActive(i)}
                  className={cn(
                    "flex min-h-14 w-full items-center gap-3 rounded-xl px-3 py-2 text-left",
                    i === active ? "bg-raised" : "hover:bg-raised",
                  )}
                >
                  <Icon size={20} className="shrink-0 text-fg-faint" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{h.title}</span>
                    <span className="block truncate text-sm text-fg-muted">{h.sub}</span>
                  </span>
                  {h.badge}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </dialog>
  );
}
