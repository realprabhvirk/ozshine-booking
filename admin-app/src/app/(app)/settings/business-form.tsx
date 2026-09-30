"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, Input, Select, Switch, Textarea } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { useShop } from "@/components/shop-context";
import { formatAbn, isValidAbn } from "@/lib/au";
import { adminSave } from "@/lib/shop/admin";
import { playAlertSound } from "@/lib/alert-sound";
import { isValidPhone, normalizeAuPhone } from "@/lib/core/phone";
import type { ShopSettings } from "@/lib/shop/types";
import { SaveBar } from "./save-bar";

type Form = {
  business_name: string;
  abn: string;
  address: string;
  phone: string;
  email: string;
  public_site_url: string;
  review_url: string;
  invoice_footer: string;
  invoice_terms: string;
  alert_sound: "chime" | "bell" | "off";
  alert_volume: number;
  demo_banner: boolean;
};

function fromSettings(s: ShopSettings): Form {
  return {
    business_name: s.business_name ?? "",
    abn: s.abn ? formatAbn(s.abn) : "",
    address: s.address ?? "",
    phone: s.phone ?? "",
    email: s.email ?? "",
    public_site_url: s.public_site_url ?? "",
    review_url: s.review_url ?? "",
    invoice_footer: s.invoice_footer ?? "",
    invoice_terms: s.invoice_terms ?? "",
    alert_sound: s.alert_sound ?? "chime",
    alert_volume: Math.round(Number(s.alert_volume ?? 0.6) * 100),
    demo_banner: s.demo_banner,
  };
}

const urlOk = (v: string) => !v || /^https:\/\/[^\s]+\.[^\s]+$/.test(v.trim());

export function BusinessForm({ settings }: { settings: ShopSettings }) {
  const { supabase, staff } = useShop();
  const router = useRouter();
  const toast = useToast();
  const [initial] = useState(() => fromSettings(settings));
  const [f, setF] = useState<Form>(initial);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((x) => ({ ...x, [k]: v }));

  const errors = {
    business_name: f.business_name.trim() ? null : "Needed",
    abn: !f.abn.trim() || isValidAbn(f.abn) ? null : "That isn't a valid ABN (11 digits, checked against the ATO's formula)",
    phone: !f.phone.trim() || isValidPhone(normalizeAuPhone(f.phone)) ? null : "That doesn't look like a phone number",
    email: !f.email.trim() || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email.trim()) ? null : "That doesn't look like an email",
    public_site_url: urlOk(f.public_site_url) ? null : "Start with https://",
    review_url: urlOk(f.review_url) ? null : "Start with https://",
  };
  const valid = Object.values(errors).every((e) => !e);
  const dirty = JSON.stringify(f) !== JSON.stringify(initial);

  async function save() {
    if (!valid) return;
    setBusy(true);
    try {
      await adminSave(supabase, "settings", settings.id, {
        business_name: f.business_name.trim(),
        abn: f.abn.replace(/\D/g, "") || null,
        address: f.address.trim() || null,
        phone: f.phone.trim() || null,
        email: f.email.trim().toLowerCase() || null,
        public_site_url: f.public_site_url.trim().replace(/\/+$/, "") || null,
        review_url: f.review_url.trim() || null,
        invoice_footer: f.invoice_footer.trim() || null,
        invoice_terms: f.invoice_terms.trim() || null,
        alert_sound: f.alert_sound,
        alert_volume: f.alert_volume / 100,
        demo_banner: f.demo_banner,
      });
      toast.success("Settings saved");
      router.refresh();
    } catch (e) {
      toast.error(e, "Couldn't save");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-6 @4xl:grid-cols-2">
        <Card>
          <CardHeader title="Business details" description="Printed on invoices and receipts" />
          <CardBody className="space-y-4">
            <Field label="Business name" error={errors.business_name}>
              <Input value={f.business_name} onChange={(e) => set("business_name", e.target.value)} maxLength={80} />
            </Field>
            <Field label="ABN" optional error={errors.abn} hint="With an ABN, invoices say “Tax invoice”.">
              <Input inputMode="numeric" value={f.abn} onChange={(e) => set("abn", e.target.value)} onBlur={() => set("abn", formatAbn(f.abn))} placeholder="12 345 678 901" />
            </Field>
            <Field label="Address" optional>
              <Input value={f.address} onChange={(e) => set("address", e.target.value)} maxLength={160} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Phone" optional error={errors.phone}>
                <Input inputMode="tel" value={f.phone} onChange={(e) => set("phone", e.target.value)} />
              </Field>
              <Field label="Email" optional error={errors.email}>
                <Input type="email" value={f.email} onChange={(e) => set("email", e.target.value)} />
              </Field>
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Invoices" />
          <CardBody className="space-y-4">
            <Field label="Payment terms" optional hint="e.g. Payment due on pickup. Bank: BSB 000-000 Acc 12345678">
              <Textarea rows={3} value={f.invoice_terms} onChange={(e) => set("invoice_terms", e.target.value)} maxLength={500} />
            </Field>
            <Field label="Footer message" optional hint="Shown at the bottom of invoices and receipts">
              <Textarea rows={2} value={f.invoice_footer} onChange={(e) => set("invoice_footer", e.target.value)} maxLength={300} placeholder="Thanks for choosing OzShine!" />
            </Field>
            <p className="text-sm text-fg-muted">
              Invoice numbers start with <span className="font-mono font-semibold">{settings.invoice_prefix}-</span> and count up without gaps. Prices include GST.
            </p>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Links" description="Used in texts and emails to customers" />
          <CardBody className="space-y-4">
            <Field label="Booking website address" optional error={errors.public_site_url} hint="Where the “manage your booking” and receipt links point">
              <Input inputMode="url" value={f.public_site_url} onChange={(e) => set("public_site_url", e.target.value)} placeholder="https://book.ozshine.com.au" />
            </Field>
            <Field label="Review link" optional error={errors.review_url} hint="Where happy customers are sent to leave a review">
              <Input inputMode="url" value={f.review_url} onChange={(e) => set("review_url", e.target.value)} placeholder="https://…" />
            </Field>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Alerts &amp; booking site" />
          <CardBody className="space-y-4">
            <Field label="New online request sound">
              <Select value={f.alert_sound} onChange={(e) => set("alert_sound", e.target.value as Form["alert_sound"])}>
                <option value="chime">Chime</option>
                <option value="bell">Bell</option>
                <option value="off">Off</option>
              </Select>
            </Field>
            {f.alert_sound !== "off" && (
              <div className="flex items-end gap-3">
                <Field label={`Volume · ${f.alert_volume}%`} className="flex-1">
                  <input
                    type="range"
                    min={10}
                    max={100}
                    step={10}
                    value={f.alert_volume}
                    onChange={(e) => set("alert_volume", Number(e.target.value))}
                    className="h-11 w-full accent-[var(--color-accent)]"
                  />
                </Field>
                <Button icon={Volume2} onClick={() => playAlertSound(f.alert_sound, f.alert_volume / 100)}>
                  Test
                </Button>
              </div>
            )}
            <Switch checked={f.demo_banner} onChange={(v) => set("demo_banner", v)} label="Show “demo” banner on the booking site" description="Turn off when you go live with real customers." />
            <div className="rounded-xl bg-sunken px-4 py-3 text-sm ring-1 ring-line">
              Signed in as <b>{staff.name}</b> ({staff.role}). The shop runs on this one login. Everything done in the app is recorded against it.
            </div>
          </CardBody>
        </Card>
      </div>
      <SaveBar dirty={dirty} busy={busy} onSave={save} onReset={() => setF(initial)} />
    </div>
  );
}
