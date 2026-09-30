"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { cn } from "@/lib/core/cn";
import { errorMessage } from "@/lib/core/errors";
import { formatPhone } from "@/lib/core/phone";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { Notice, Spinner } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";
import { useShop } from "@/components/shop-context";
import { fetchDirectory, mergeCustomers, type CustomerRecord, type DirectoryRow } from "@/lib/shop/customers";

// Fold a duplicate record into this customer: their visits, cars, invoices,
// rewards, notes and messages all move across; the duplicate is retired.
export function MergeDialog({ open, onClose, keep }: { open: boolean; onClose: () => void; keep: CustomerRecord }) {
  const { supabase } = useShop();
  const toast = useToast();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<DirectoryRow[] | null>(null);
  const [pick, setPick] = useState<DirectoryRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) return;
    let cancelled = false;
    const t = window.setTimeout(async () => {
      try {
        const r = await fetchDirectory(supabase, { q: term, sort: "name", pageSize: 10 });
        if (!cancelled) setResults(r.rows.filter((c) => c.id !== keep.id));
      } catch (e) {
        if (!cancelled) setError(errorMessage(e));
      }
    }, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [q, supabase, keep.id]);

  async function merge() {
    if (!pick) return;
    setBusy(true);
    setError(null);
    try {
      const moved = await mergeCustomers(supabase, keep.id, pick.id);
      toast.success("Customers merged", `${moved.bookings} visits and ${moved.vehicles} cars moved to ${keep.name}`);
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
      open={open}
      onClose={onClose}
      dismissible={!busy}
      title={`Merge a duplicate into ${keep.name}`}
      description="Pick the duplicate record. Everything it has moves here, and it's retired. This can't be undone."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="danger" loading={busy} disabled={!pick} onClick={merge}>
            {pick ? `Merge ${pick.name} into ${keep.name}` : "Pick a customer"}
          </Button>
        </>
      }
    >
      <div className="space-y-3 pb-2">
        {error && <Notice tone="bad">{error}</Notice>}
        <div className="relative">
          <Search size={18} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-fg-faint" aria-hidden />
          <Input aria-label="Find the duplicate" placeholder="Name, mobile or rego" value={q} onChange={(e) => setQ(e.target.value)} className="pl-10" autoFocus />
        </div>
        {q.trim().length >= 2 && !results && <Spinner />}
        {results && q.trim().length >= 2 && (
          <ul className="max-h-72 space-y-2 overflow-y-auto" role="radiogroup" aria-label="Duplicate customer">
            {results.length === 0 && <li className="py-4 text-center text-sm text-fg-muted">No other customers match.</li>}
            {results.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  role="radio"
                  aria-checked={pick?.id === c.id}
                  onClick={() => setPick(c)}
                  className={cn(
                    "flex min-h-14 w-full items-center justify-between gap-3 rounded-xl px-4 py-2 text-left ring-1 ring-inset transition",
                    pick?.id === c.id ? "bg-accent/12 ring-2 ring-accent" : "bg-raised ring-line hover:ring-line-strong",
                  )}
                >
                  <span>
                    <span className="block font-semibold">{c.name}</span>
                    <span className="block text-sm text-fg-muted">
                      {formatPhone(c.phone) || "No phone"} {c.regos.length > 0 && `· ${c.regos.join(", ")}`}
                    </span>
                  </span>
                  <span className="text-sm text-fg-muted">{c.visit_count} visits</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {pick && (
          <Notice tone="warn">
            Keeps <b>{keep.name}</b>&apos;s name
            {keep.phone ? " and number" : ""}. {pick.name}&apos;s {pick.visit_count} visits, cars, invoices and rewards move over.
          </Notice>
        )}
      </div>
    </Dialog>
  );
}
