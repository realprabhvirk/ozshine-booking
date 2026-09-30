"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/core/cn";
import { errorMessage } from "@/lib/core/errors";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Notice, Spinner } from "@/components/ui/feedback";
import { useShop } from "@/components/shop-context";

type Occupant = { bay_id: string; reference_code: string; customer: { name: string } | null };

// Pick which bay a car goes into (shows who's in each bay right now).
export function BayDialog({
  open,
  onClose,
  onPick,
  currentBayId,
  busy,
  title = "Which bay?",
}: {
  open: boolean;
  onClose: () => void;
  onPick: (bayId: string) => void;
  currentBayId?: string | null;
  busy?: boolean;
  title?: string;
}) {
  const { supabase, bays } = useShop();
  const [occupants, setOccupants] = useState<Occupant[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    supabase
      .from("bookings")
      .select("bay_id, reference_code, customer:customers(name)")
      .eq("status", "in_progress")
      .not("bay_id", "is", null)
      .then(({ data, error: err }) => {
        if (cancelled) return;
        if (err) setError(errorMessage(err));
        else setOccupants((data ?? []) as unknown as Occupant[]);
      });
    return () => {
      cancelled = true;
    };
  }, [open, supabase]);

  const active = bays.filter((b) => b.active);
  return (
    <Dialog open={open} onClose={onClose} title={title} size="sm" dismissible={!busy}>
      {error && <Notice tone="bad">{error}</Notice>}
      {!occupants && !error && <Spinner />}
      {occupants && (
        <div className="grid gap-2 pb-4">
          {active.map((bay) => {
            const who = occupants.find((o) => o.bay_id === bay.id);
            const mine = bay.id === currentBayId;
            const taken = !!who && !mine;
            return (
              <button
                key={bay.id}
                type="button"
                disabled={taken || busy}
                onClick={() => onPick(bay.id)}
                className={cn(
                  "flex min-h-16 items-center justify-between rounded-xl px-4 text-left ring-1 ring-inset transition",
                  "focus-visible:outline-2 focus-visible:outline-focus disabled:cursor-not-allowed",
                  taken ? "bg-sunken text-fg-faint ring-line" : "bg-raised text-fg ring-line hover:ring-accent",
                  mine && "ring-2 ring-accent",
                )}
              >
                <span className="text-lg font-bold">{bay.name}</span>
                <span className={cn("text-sm font-medium", taken ? "text-fg-faint" : "text-ok-ink")}>
                  {mine ? "Current bay" : who ? `${who.customer?.name ?? "Busy"} · ${who.reference_code}` : "Free"}
                </span>
              </button>
            );
          })}
          {active.length === 0 && <Notice tone="warn">No bays are set up yet.</Notice>}
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
        </div>
      )}
    </Dialog>
  );
}
