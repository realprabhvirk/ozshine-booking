"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/core/cn";
import { formatCents, parseMoneyInput, toCents } from "@/lib/core/money";
import { formatDuration } from "@/lib/core/time";
import { errorMessage } from "@/lib/core/errors";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { ConfirmDialog, Dialog } from "@/components/ui/dialog";
import { Field, Input, Switch, Textarea } from "@/components/ui/field";
import { EmptyState, Notice } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";
import { useShop } from "@/components/shop-context";
import { adminDelete, adminSave } from "@/lib/shop/admin";
import type { AddonRow, BayRow } from "@/lib/shop/types";

type Addon = AddonRow & { description: string | null };

export function ExtrasEditor({ addons, bays }: { addons: Addon[]; bays: BayRow[] }) {
  const { supabase } = useShop();
  const router = useRouter();
  const toast = useToast();
  const [addon, setAddon] = useState<Addon | "new" | null>(null);
  const [bay, setBay] = useState<BayRow | "new" | null>(null);
  const [remove, setRemove] = useState<{ entity: "addons" | "bays"; id: string; name: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function toggle(entity: "addons" | "bays", row: { id: string; active: boolean; name: string }) {
    setBusy(row.id);
    try {
      await adminSave(supabase, entity, row.id, { active: !row.active });
      toast.success(row.active ? `${row.name} turned off` : `${row.name} turned on`);
      router.refresh();
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(null);
    }
  }

  async function doRemove() {
    if (!remove) return;
    setBusy("remove");
    try {
      await adminDelete(supabase, remove.entity, remove.id);
      toast.success(`${remove.name} deleted`);
      setRemove(null);
      router.refresh();
    } catch (e) {
      toast.error(e, "Couldn't delete");
      setRemove(null);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="grid gap-6 @5xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
      <Card>
        <CardHeader title="Extras" description="Offered with any service, online and at the till" action={<Button size="sm" variant="primary" icon={Plus} onClick={() => setAddon("new")}>New extra</Button>} />
        {addons.length === 0 ? (
          <EmptyState title="No extras yet" className="py-8" />
        ) : (
          <ul className="divide-y divide-line">
            {addons.map((a) => (
              <li key={a.id} className={cn("flex flex-wrap items-center gap-3 px-5 py-3", !a.active && "opacity-55")}>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">
                    {a.name} {!a.active && <Badge tone="neutral">Off</Badge>}
                  </p>
                  <p className="text-sm text-fg-muted">
                    +{formatCents(toCents(a.price))} · adds {formatDuration(a.duration_minutes)}
                    {a.description && ` · ${a.description}`}
                  </p>
                </div>
                <Button size="sm" variant="ghost" loading={busy === a.id} onClick={() => toggle("addons", a)}>
                  {a.active ? "Turn off" : "Turn on"}
                </Button>
                <Button size="icon-sm" variant="ghost" icon={Pencil} aria-label={`Edit ${a.name}`} onClick={() => setAddon(a)} />
                <Button size="icon-sm" variant="ghost" icon={Trash2} aria-label={`Delete ${a.name}`} onClick={() => setRemove({ entity: "addons", id: a.id, name: a.name })} />
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <CardHeader title="Bays" description="Where cars are worked on" action={<Button size="sm" variant="primary" icon={Plus} onClick={() => setBay("new")}>New bay</Button>} />
        <ul className="divide-y divide-line">
          {bays.map((b) => (
            <li key={b.id} className={cn("flex items-center gap-3 px-5 py-3", !b.active && "opacity-55")}>
              <p className="min-w-0 flex-1 font-semibold">
                {b.name} {!b.active && <Badge tone="neutral">Off</Badge>}
              </p>
              <Button size="sm" variant="ghost" loading={busy === b.id} onClick={() => toggle("bays", b)}>
                {b.active ? "Turn off" : "Turn on"}
              </Button>
              <Button size="icon-sm" variant="ghost" icon={Pencil} aria-label={`Rename ${b.name}`} onClick={() => setBay(b)} />
              <Button size="icon-sm" variant="ghost" icon={Trash2} aria-label={`Delete ${b.name}`} onClick={() => setRemove({ entity: "bays", id: b.id, name: b.name })} />
            </li>
          ))}
        </ul>
        <p className="px-5 pb-4 text-xs text-fg-faint">How many cars can be booked at once is set under Hours & booking.</p>
      </Card>

      <AddonDialog key={`addon-${addon === null ? "closed" : addon === "new" ? "new" : addon.id}`} addon={addon} nextSort={(addons.at(-1)?.sort_order ?? 0) + 10} onClose={() => setAddon(null)} />
      <BayDialog key={`bay-${bay === null ? "closed" : bay === "new" ? "new" : bay.id}`} bay={bay} nextSort={(bays.at(-1)?.sort_order ?? 0) + 1} onClose={() => setBay(null)} />
      <ConfirmDialog
        open={!!remove}
        onClose={() => setRemove(null)}
        onConfirm={doRemove}
        busy={busy === "remove"}
        tone="danger"
        title={`Delete ${remove?.name}?`}
        description="If it's been used on past bookings it can't be deleted. Turn it off instead."
        confirmLabel="Delete"
      />
    </div>
  );
}

function AddonDialog({ addon, nextSort, onClose }: { addon: Addon | "new" | null; nextSort: number; onClose: () => void }) {
  const { supabase } = useShop();
  const router = useRouter();
  const toast = useToast();
  const a = addon === "new" || addon === null ? null : addon;
  const [name, setName] = useState(a?.name ?? "");
  const [price, setPrice] = useState(a ? (toCents(a.price) / 100).toString() : "");
  const [minutes, setMinutes] = useState(String(a?.duration_minutes ?? 15));
  const [description, setDescription] = useState(a?.description ?? "");
  const [active, setActive] = useState(a?.active ?? true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const cents = parseMoneyInput(price);
  const mins = Number(minutes);
  const valid = name.trim().length >= 2 && cents !== null && Number.isInteger(mins) && mins >= 0 && mins <= 600;

  async function save() {
    if (!valid || cents === null) return;
    setBusy(true);
    setError(null);
    try {
      await adminSave(supabase, "addons", a?.id ?? null, {
        name: name.trim(),
        price: cents / 100,
        duration_minutes: mins,
        description: description.trim() || null,
        active,
        ...(a ? {} : { sort_order: nextSort }),
      });
      toast.success(a ? "Extra saved" : "Extra added", name.trim());
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
      open={addon !== null}
      onClose={onClose}
      dismissible={!busy}
      size="sm"
      title={a ? `Edit ${a.name}` : "New extra"}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" loading={busy} disabled={!valid} onClick={save}>
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-4 pb-2">
        {error && <Notice tone="bad">{error}</Notice>}
        <Field label="Name">
          <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="Engine bay clean" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Price" error={price && cents === null ? "Like 40 or 39.50" : null}>
            <Input inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />
          </Field>
          <Field label="Extra time" hint="minutes">
            <Input type="number" min={0} max={600} step={5} value={minutes} onChange={(e) => setMinutes(e.target.value)} />
          </Field>
        </div>
        <Field label="Description" optional>
          <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={200} />
        </Field>
        <Switch checked={active} onChange={setActive} label="Available" />
      </div>
    </Dialog>
  );
}

function BayDialog({ bay, nextSort, onClose }: { bay: BayRow | "new" | null; nextSort: number; onClose: () => void }) {
  const { supabase } = useShop();
  const router = useRouter();
  const toast = useToast();
  const b = bay === "new" || bay === null ? null : bay;
  const [name, setName] = useState(b?.name ?? `Bay ${nextSort}`);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await adminSave(supabase, "bays", b?.id ?? null, b ? { name: name.trim() } : { name: name.trim(), sort_order: nextSort, active: true });
      toast.success(b ? "Bay renamed" : "Bay added", name.trim());
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
      open={bay !== null}
      onClose={onClose}
      dismissible={!busy}
      size="sm"
      title={b ? `Rename ${b.name}` : "New bay"}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" loading={busy} disabled={!name.trim()} onClick={save}>
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-4 pb-2">
        {error && <Notice tone="bad">{error}</Notice>}
        <Field label="Name">
          <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={30} />
        </Field>
      </div>
    </Dialog>
  );
}
