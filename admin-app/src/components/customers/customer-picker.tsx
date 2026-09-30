"use client";

import { useEffect, useId, useState } from "react";
import { Crown, Search, UserPlus } from "lucide-react";
import { cn } from "@/lib/core/cn";
import { formatPhone } from "@/lib/core/phone";
import { fetchDirectory, type DirectoryRow } from "@/lib/shop/customers";
import { Spinner } from "@/components/ui/feedback";
import { useShop } from "@/components/shop-context";

// Live customer search (name, mobile, email or rego), shared by the search
// box and the "already a customer?" hint under the name field.
export function useCustomerSearch(term: string, minLength = 2) {
  const { supabase } = useShop();
  const q = term.trim();
  const active = q.length >= minLength;
  const [state, setState] = useState<{ q: string; rows: DirectoryRow[] }>({ q: "", rows: [] });

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    const t = window.setTimeout(() => {
      fetchDirectory(supabase, { q, sort: "recent", pageSize: 6 })
        .then((r) => !cancelled && setState({ q, rows: r.rows }))
        .catch(() => !cancelled && setState({ q, rows: [] }));
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [supabase, q, active]);

  return { rows: active && state.q === q ? state.rows : [], loading: active && state.q !== q };
}

export function CustomerResult({ row, onPick, className }: { row: DirectoryRow; onPick: (r: DirectoryRow) => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={() => onPick(row)}
      className={cn("flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition hover:bg-raised focus-visible:outline-2 focus-visible:outline-focus", className)}
    >
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 font-semibold">
          {row.is_vip && <Crown size={14} className="text-warn" aria-label="VIP" />}
          <span className="truncate">{row.name}</span>
        </span>
        <span className="block truncate text-sm text-fg-muted">
          {[row.phone ? formatPhone(row.phone) : "No mobile", row.regos?.filter(Boolean).join(", ")].filter(Boolean).join(" · ")}
        </span>
      </span>
      <span className="shrink-0 text-xs text-fg-faint">
        {row.visit_count} visit{row.visit_count === 1 ? "" : "s"}
      </span>
    </button>
  );
}

// Search box: type, then tap a match. No match = carry on and a new
// customer is created from the details below.
export function CustomerPicker({ onPick }: { onPick: (r: DirectoryRow) => void }) {
  const [term, setTerm] = useState("");
  const [open, setOpen] = useState(false);
  const { rows, loading } = useCustomerSearch(term);
  const listId = useId();
  const show = open && term.trim().length >= 2;

  return (
    <div className="relative">
      <label htmlFor={`${listId}-input`} className="mb-1.5 block text-sm font-medium">
        Find a customer
      </label>
      <div className="relative">
        <Search size={18} aria-hidden className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-fg-faint" />
        <input
          id={`${listId}-input`}
          role="combobox"
          aria-expanded={show}
          aria-controls={listId}
          autoComplete="off"
          value={term}
          onChange={(e) => {
            setTerm(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          // Short delay so a tap on a result registers before the list closes.
          onBlur={() => window.setTimeout(() => setOpen(false), 150)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setOpen(false);
            if (e.key === "Enter" && rows[0]) {
              e.preventDefault();
              onPick(rows[0]);
            }
          }}
          placeholder="Name, mobile or rego"
          className="h-12 w-full rounded-xl bg-sunken pr-10 pl-10 text-[15px] ring-1 ring-line outline-none placeholder:text-fg-faint focus:ring-2 focus:ring-focus"
        />
        {loading && <Spinner size={16} className="absolute top-1/2 right-3.5 -translate-y-1/2" label="Searching" />}
      </div>
      {show && !loading && (
        <div id={listId} role="listbox" className="absolute inset-x-0 top-full z-20 mt-1.5 max-h-80 overflow-y-auto rounded-xl bg-panel p-1.5 shadow-pop ring-1 ring-line">
          {rows.length === 0 ? (
            <p className="flex items-center gap-2 px-3 py-3 text-sm text-fg-muted">
              <UserPlus size={16} aria-hidden /> No match. Fill in the details below to add a new customer.
            </p>
          ) : (
            rows.map((r) => <CustomerResult key={r.id} row={r} onPick={onPick} />)
          )}
        </div>
      )}
    </div>
  );
}
