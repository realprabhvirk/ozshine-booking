"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Field, Input, SegmentedControl, Switch, Textarea } from "@/components/ui/field";
import { Notice } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";
import { useShop } from "@/components/shop-context";
import { errorMessage } from "@/lib/core/errors";
import { formatPhone } from "@/lib/core/phone";
import { fieldErrors, nameSchema, optionalEmailSchema, optionalPhoneSchema, optionalRegoSchema } from "@/lib/core/schemas";
import { VEHICLE_TYPES, VEHICLE_TYPE_LABELS, type VehicleType } from "@/lib/core/status";
import { createCustomer, updateCustomer, type CustomerRecord } from "@/lib/shop/customers";

// Create a customer, or edit one (name, contact, tags, VIP, marketing, notes).
export function CustomerDialog({ open, onClose, customer }: { open: boolean; onClose: () => void; customer?: CustomerRecord | null }) {
  const { supabase } = useShop();
  const toast = useToast();
  const router = useRouter();
  const editing = !!customer;
  const [name, setName] = useState(customer?.name ?? "");
  const [phone, setPhone] = useState(customer?.phone ? formatPhone(customer.phone) : "");
  const [email, setEmail] = useState(customer?.email ?? "");
  const [tags, setTags] = useState((customer?.tags ?? []).join(", "));
  const [vip, setVip] = useState(customer?.is_vip ?? false);
  const [marketing, setMarketing] = useState(customer?.marketing_opt_in ?? true);
  const [notes, setNotes] = useState(customer?.notes ?? "");
  const [rego, setRego] = useState("");
  const [makeModel, setMakeModel] = useState("");
  const [vehicleType, setVehicleType] = useState<VehicleType>("sedan");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    const parsed = z
      .object({ name: nameSchema, phone: optionalPhoneSchema, email: optionalEmailSchema, rego: optionalRegoSchema })
      .safeParse({ name, phone, email, rego });
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }
    setErrors({});
    setError(null);
    setBusy(true);
    const tagList = tags.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean);
    try {
      if (editing && customer) {
        await updateCustomer(supabase, customer.id, {
          name: parsed.data.name,
          phone: parsed.data.phone,
          email: parsed.data.email,
          tags: tagList,
          is_vip: vip,
          marketing_opt_in: marketing,
          notes: notes.trim() || null,
        });
        toast.success("Customer saved");
        onClose();
      } else {
        const id = await createCustomer(supabase, {
          name: parsed.data.name,
          phone: parsed.data.phone,
          email: parsed.data.email,
          rego: parsed.data.rego,
          make_model: makeModel.trim() || null,
          vehicle_type: vehicleType,
          marketing_opt_in: marketing,
        });
        if (tagList.length || vip || notes.trim()) {
          await updateCustomer(supabase, id, { tags: tagList, is_vip: vip, notes: notes.trim() || null });
        }
        toast.success("Customer added", parsed.data.name);
        onClose();
        router.push(`/customers/${id}`);
      }
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
      title={editing ? "Edit customer" : "New customer"}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" loading={busy} onClick={save}>
            {editing ? "Save" : "Add customer"}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 pb-2 sm:grid-cols-2">
        {error && <Notice tone="bad" className="sm:col-span-2">{error}</Notice>}
        <Field label="Name" error={errors.name} className="sm:col-span-2">
          <Input value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" autoFocus={!editing} />
        </Field>
        <Field label="Mobile" optional error={errors.phone}>
          <Input inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="off" />
        </Field>
        <Field label="Email" optional error={errors.email}>
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" />
        </Field>
        {!editing && (
          <>
            <Field label="Rego" optional error={errors.rego}>
              <Input value={rego} onChange={(e) => setRego(e.target.value.toUpperCase())} className="font-mono uppercase" autoComplete="off" />
            </Field>
            <Field label="Make / model" optional>
              <Input value={makeModel} onChange={(e) => setMakeModel(e.target.value)} placeholder="White Hilux" />
            </Field>
            {rego.trim() && (
              <div className="sm:col-span-2">
                <p className="mb-1.5 text-sm font-medium">Vehicle type</p>
                <SegmentedControl label="Vehicle type" value={vehicleType} onChange={setVehicleType} className="grid-cols-2 sm:grid-cols-4" options={VEHICLE_TYPES.map((v) => ({ value: v, label: VEHICLE_TYPE_LABELS[v] }))} />
              </div>
            )}
          </>
        )}
        <Field label="Tags" optional hint="Comma separated, e.g. fleet, regular" className="sm:col-span-2">
          <Input value={tags} onChange={(e) => setTags(e.target.value)} />
        </Field>
        <Field label="Pinned note" optional hint="Shows at the top of their profile" className="sm:col-span-2">
          <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={4000} />
        </Field>
        <div className="sm:col-span-2">
          <Switch checked={vip} onChange={setVip} label="VIP" description="Shows a crown on their bookings" />
          <Switch checked={marketing} onChange={setMarketing} label="Happy to get specials" description="Marketing texts and emails. Booking messages always go out." />
        </div>
      </div>
    </Dialog>
  );
}
