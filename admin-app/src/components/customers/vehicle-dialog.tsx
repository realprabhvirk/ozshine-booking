"use client";

import { useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Field, Input, SegmentedControl, Textarea } from "@/components/ui/field";
import { Notice } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";
import { useShop } from "@/components/shop-context";
import { errorMessage } from "@/lib/core/errors";
import { optionalRegoSchema } from "@/lib/core/schemas";
import { VEHICLE_TYPES, VEHICLE_TYPE_LABELS, type VehicleType } from "@/lib/core/status";
import { saveVehicle, type VehicleRecord } from "@/lib/shop/customers";

export function VehicleDialog({ open, onClose, customerId, vehicle }: { open: boolean; onClose: () => void; customerId: string; vehicle?: VehicleRecord | null }) {
  const { supabase } = useShop();
  const toast = useToast();
  const [rego, setRego] = useState(vehicle?.rego ?? "");
  const [makeModel, setMakeModel] = useState(vehicle?.make_model ?? "");
  const [colour, setColour] = useState(vehicle?.colour ?? "");
  const [year, setYear] = useState(vehicle?.year ? String(vehicle.year) : "");
  const [nickname, setNickname] = useState(vehicle?.nickname ?? "");
  const [notes, setNotes] = useState(vehicle?.notes ?? "");
  const [type, setType] = useState<VehicleType>(vehicle?.vehicle_type ?? "sedan");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const regoCheck = optionalRegoSchema.safeParse(rego);
  const yearOk = !year || (/^\d{4}$/.test(year) && Number(year) >= 1950 && Number(year) <= new Date().getFullYear() + 1);

  async function save() {
    if (!regoCheck.success || !yearOk) return;
    setBusy(true);
    setError(null);
    try {
      await saveVehicle(supabase, customerId, {
        id: vehicle?.id,
        rego: regoCheck.data,
        make_model: makeModel,
        colour,
        year,
        nickname,
        notes,
        vehicle_type: type,
      });
      toast.success(vehicle ? "Car updated" : "Car added", regoCheck.data ?? undefined);
      onClose();
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
      title={vehicle ? "Edit car" : "Add a car"}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" loading={busy} disabled={!regoCheck.success || !yearOk} onClick={save}>
            Save
          </Button>
        </>
      }
    >
      <div className="grid gap-4 pb-2 sm:grid-cols-2">
        {error && <Notice tone="bad" className="sm:col-span-2">{error}</Notice>}
        <Field label="Rego" optional error={regoCheck.success ? null : regoCheck.error.issues[0]?.message}>
          <Input value={rego} onChange={(e) => setRego(e.target.value.toUpperCase())} className="font-mono uppercase" autoComplete="off" />
        </Field>
        <Field label="Make / model" optional>
          <Input value={makeModel} onChange={(e) => setMakeModel(e.target.value)} placeholder="Toyota Hilux" maxLength={60} />
        </Field>
        <Field label="Colour" optional>
          <Input value={colour} onChange={(e) => setColour(e.target.value)} maxLength={30} />
        </Field>
        <Field label="Year" optional error={yearOk ? null : "A year like 2019"}>
          <Input inputMode="numeric" value={year} onChange={(e) => setYear(e.target.value)} maxLength={4} />
        </Field>
        <div className="sm:col-span-2">
          <p className="mb-1.5 text-sm font-medium">Size (sets the price)</p>
          <SegmentedControl label="Vehicle type" value={type} onChange={setType} className="grid-cols-2 sm:grid-cols-4" options={VEHICLE_TYPES.map((v) => ({ value: v, label: VEHICLE_TYPE_LABELS[v] }))} />
        </div>
        <Field label="Nickname" optional hint="e.g. Work ute" className="sm:col-span-2">
          <Input value={nickname} onChange={(e) => setNickname(e.target.value)} maxLength={30} />
        </Field>
        <Field label="Notes about this car" optional className="sm:col-span-2">
          <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} placeholder="e.g. Matte wrap, no machine polish" />
        </Field>
      </div>
    </Dialog>
  );
}
