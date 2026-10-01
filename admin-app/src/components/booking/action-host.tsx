"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { useShop } from "@/components/shop-context";
import { useToast } from "@/components/ui/toast";
import { advanceBooking, updateBookingDetails } from "@/lib/shop/actions";
import type { BoardBooking } from "@/lib/shop/types";
import { BOOKING_STATUS_META, type BookingStatus } from "@/lib/core/status";
import { ReasonDialog } from "./reason-dialog";
import { BayDialog } from "./bay-dialog";
import { CheckoutDialog } from "./checkout-dialog";
import { RescheduleDialog } from "./reschedule-dialog";

type Kind = "decline" | "cancel" | "no_show" | "bay" | "move_bay" | "checkout" | "reschedule";

type Api = {
  // One-tap moves: approve, check in, ready. "Start" always asks which bay
  // (unless the shop only has one).
  advance: (b: BoardBooking, to: BookingStatus) => Promise<void>;
  openDialog: (kind: Kind, b: BoardBooking) => void;
  isBusy: (id: string) => boolean;
};

const Ctx = createContext<Api | null>(null);

const DONE_TOASTS: Partial<Record<BookingStatus, string>> = {
  approved: "Approved",
  checked_in: "Checked in",
  in_progress: "Started",
  ready: "Ready for pickup",
};

// Owns every booking action and its dialogs, once for the whole app, so the
// floor, the schedule and the booking panel all behave identically.
export function BookingActionsProvider({ children }: { children: ReactNode }) {
  const { supabase, bays } = useShop();
  const toast = useToast();
  const [busy, setBusy] = useState<Set<string>>(() => new Set());
  const [dialog, setDialog] = useState<{ kind: Kind; booking: BoardBooking } | null>(null);
  const [dialogBusy, setDialogBusy] = useState(false);

  const mark = useCallback((id: string, on: boolean) => {
    setBusy((s) => {
      const n = new Set(s);
      if (on) n.add(id);
      else n.delete(id);
      return n;
    });
  }, []);

  const advance = useCallback(
    async (b: BoardBooking, to: BookingStatus, opts: { bayId?: string; reason?: string } = {}) => {
      mark(b.id, true);
      try {
        const r = await advanceBooking(supabase, b.id, to, { bayId: opts.bayId, reason: opts.reason });
        const who = b.customer?.is_walkin_placeholder ? b.reference_code : (b.customer?.name ?? b.reference_code);
        const bay = to === "in_progress" && r.bay_id ? bays.find((x) => x.id === r.bay_id)?.name : null;
        toast.success(DONE_TOASTS[to] ?? BOOKING_STATUS_META[to].label, bay ? `${who} · ${bay}` : who);
      } catch (e) {
        toast.error(e, `Couldn't update ${b.reference_code}`);
      } finally {
        mark(b.id, false);
      }
    },
    [supabase, toast, mark, bays],
  );

  const close = useCallback(() => {
    setDialog(null);
    setDialogBusy(false);
  }, []);

  async function withDialog(to: BookingStatus, opts: { bayId?: string; reason?: string }) {
    if (!dialog) return;
    setDialogBusy(true);
    // A booked car goes Booked → Arrived → In bay; do both steps in one tap.
    if (to === "in_progress" && dialog.booking.status === "approved") {
      try {
        await advanceBooking(supabase, dialog.booking.id, "checked_in");
      } catch (e) {
        toast.error(e, `Couldn't check in ${dialog.booking.reference_code}`);
        close();
        return;
      }
    }
    await advance(dialog.booking, to, opts);
    close();
  }

  async function moveBay(bayId: string) {
    if (!dialog) return;
    setDialogBusy(true);
    try {
      await updateBookingDetails(supabase, dialog.booking.id, { bay_id: bayId });
      toast.success("Moved", bays.find((x) => x.id === bayId)?.name);
    } catch (e) {
      toast.error(e, "Couldn't change the bay");
    }
    close();
  }

  const activeBays = bays.filter((x) => x.active).length;
  const api = useMemo<Api>(
    () => ({
      advance: async (b, to) => {
        if (to === "in_progress" && activeBays > 1) {
          setDialog({ kind: "bay", booking: b });
          return;
        }
        await advance(b, to);
      },
      openDialog: (kind, booking) => setDialog({ kind, booking }),
      isBusy: (id) => busy.has(id),
    }),
    [advance, busy, activeBays],
  );

  const b = dialog?.booking ?? null;
  const key = b ? `${dialog?.kind}-${b.id}` : "none";
  return (
    <Ctx.Provider value={api}>
      {children}
      <ReasonDialog
        key={`reason-${key}`}
        open={dialog?.kind === "decline"}
        onClose={close}
        busy={dialogBusy}
        title="Decline this request?"
        description={b ? `${b.customer?.name} will get a message saying we can't fit them in.` : undefined}
        confirmLabel="Decline request"
        reasonLabel="Message to the customer"
        reasonHint="Included in the text they get."
        suggestions={["Fully booked at that time", "Closed that day", "Please call us to book"]}
        onConfirm={(reason) => withDialog("declined", { reason })}
      />
      <ReasonDialog
        key={`cancel-${key}`}
        open={dialog?.kind === "cancel"}
        onClose={close}
        busy={dialogBusy}
        title="Cancel this booking?"
        confirmLabel="Cancel booking"
        suggestions={["Customer called to cancel", "Weather", "Double booked"]}
        onConfirm={(reason) => withDialog("cancelled", { reason })}
      />
      <ReasonDialog
        key={`noshow-${key}`}
        open={dialog?.kind === "no_show"}
        onClose={close}
        busy={dialogBusy}
        title="Mark as no-show?"
        description="Use this when the customer didn't turn up."
        confirmLabel="Mark no-show"
        onConfirm={(reason) => withDialog("no_show", { reason })}
      />
      <BayDialog
        key={`bay-${key}`}
        open={dialog?.kind === "bay"}
        onClose={close}
        busy={dialogBusy}
        title={b ? `Start ${b.vehicle?.rego ?? b.reference_code} in…` : "Which bay?"}
        onPick={(bayId) => withDialog("in_progress", { bayId })}
      />
      <BayDialog
        key={`move-${key}`}
        open={dialog?.kind === "move_bay"}
        onClose={close}
        busy={dialogBusy}
        currentBayId={b?.bay?.id ?? null}
        title={b ? `Move ${b.vehicle?.rego ?? b.reference_code} to…` : "Which bay?"}
        onPick={(bayId) => (bayId === b?.bay?.id ? close() : moveBay(bayId))}
      />
      <CheckoutDialog key={`checkout-${key}`} booking={dialog?.kind === "checkout" ? b : null} open={dialog?.kind === "checkout"} onClose={close} />
      <RescheduleDialog key={`resched-${key}`} booking={dialog?.kind === "reschedule" ? b : null} open={dialog?.kind === "reschedule"} onClose={close} />
    </Ctx.Provider>
  );
}

export function useBookingActions(): Api {
  const v = useContext(Ctx);
  if (!v) throw new Error("useBookingActions() used outside <BookingActionsProvider>");
  return v;
}

// The one obvious next step for a booking, used as the big button on cards.
export function primaryAction(status: BookingStatus): { to: BookingStatus | "checkout"; label: string } | null {
  switch (status) {
    case "pending":
      return { to: "approved", label: "Approve" };
    case "approved":
      return { to: "checked_in", label: "Check in" };
    case "checked_in":
      return { to: "in_progress", label: "Start in a bay" };
    case "in_progress":
      return { to: "ready", label: "Mark ready" };
    case "ready":
      return { to: "checkout", label: "Checkout" };
    default:
      return null;
  }
}
