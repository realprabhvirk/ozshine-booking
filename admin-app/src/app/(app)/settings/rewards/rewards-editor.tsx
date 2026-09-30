"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Gift, Pencil, Plus, Tag, Trash2, Trophy } from "lucide-react";
import { cn } from "@/lib/core/cn";
import { formatCents, parseMoneyInput, toCents } from "@/lib/core/money";
import { formatDate, shopDateOf, todayISO } from "@/lib/core/time";
import { errorMessage } from "@/lib/core/errors";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ConfirmDialog, Dialog } from "@/components/ui/dialog";
import { Field, Input, Select, Switch, Textarea } from "@/components/ui/field";
import { EmptyState, Notice } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";
import { useShop } from "@/components/shop-context";
import { adminDelete, adminSave } from "@/lib/shop/admin";

export type Promo = {
  id: string;
  code: string;
  description: string | null;
  type: "percent" | "fixed";
  value: number | string;
  min_spend: number | string;
  valid_from: string | null;
  valid_to: string | null;
  max_uses: number | null;
  used_count: number;
  active: boolean;
  first_visit_only: boolean;
};
export type LoyaltyRule = {
  id: string;
  kind: "visits" | "referral";
  name: string;
  visits_required: number | null;
  reward_type: "percent" | "fixed" | "free_addon" | "free_service";
  reward_value: number | string | null;
  eligible_service_ids: string[] | null;
  expires_after_days: number | null;
  repeat: boolean;
  active: boolean;
};
export type Voucher = {
  id: string;
  code: string;
  initial_value: number | string;
  balance: number | string;
  expires_at: string | null;
  status: "active" | "used" | "expired" | "void";
  note: string | null;
  created_at: string;
  customer: { id: string; name: string } | null;
};

const promoValue = (p: Promo) => (p.type === "percent" ? `${Number(p.value)}% off` : `${formatCents(toCents(p.value))} off`);
const rewardValue = (r: LoyaltyRule) =>
  r.reward_type === "percent" ? `${Number(r.reward_value)}% off` : r.reward_type === "fixed" ? `${formatCents(toCents(r.reward_value))} off` : r.reward_type === "free_addon" ? "A free extra" : "A free service";

export function RewardsEditor({
  promos,
  rules,
  vouchers,
  settingsId,
  loyaltyEnabled,
  tiers,
}: {
  promos: Promo[];
  rules: LoyaltyRule[];
  vouchers: Voucher[];
  settingsId: string;
  loyaltyEnabled: boolean;
  tiers: Array<{ name: string; min_visits: number }>;
}) {
  const { supabase } = useShop();
  const router = useRouter();
  const toast = useToast();
  const [promo, setPromo] = useState<Promo | "new" | null>(null);
  const [rule, setRule] = useState<LoyaltyRule | null>(null);
  const [voucherOpen, setVoucherOpen] = useState(false);
  const [confirm, setConfirm] = useState<{ title: string; description?: string; run: () => Promise<unknown>; label: string } | null>(null);
  const [tierRows, setTierRows] = useState(tiers.length ? tiers : [{ name: "Bronze", min_visits: 0 }]);
  const [busy, setBusy] = useState<string | null>(null);
  const today = todayISO();

  async function run(key: string, fn: () => Promise<unknown>, ok: string) {
    setBusy(key);
    try {
      await fn();
      toast.success(ok);
      router.refresh();
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(null);
    }
  }

  const tiersDirty = JSON.stringify(tierRows) !== JSON.stringify(tiers);
  const tiersValid = tierRows.every((t) => t.name.trim() && t.min_visits >= 0) && new Set(tierRows.map((t) => t.min_visits)).size === tierRows.length;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader title="Promo codes" description="Customers type these when booking; staff can also apply them at checkout" action={<Button size="sm" variant="primary" icon={Plus} onClick={() => setPromo("new")}>New code</Button>} />
        {promos.length === 0 ? (
          <EmptyState icon={Tag} title="No promo codes" description="e.g. SPRING10 for 10% off in September." className="py-8" />
        ) : (
          <ul className="divide-y divide-line">
            {promos.map((p) => {
              const expired = !!p.valid_to && p.valid_to < today;
              const full = p.max_uses !== null && p.used_count >= p.max_uses;
              return (
                <li key={p.id} className={cn("flex flex-wrap items-center gap-3 px-5 py-3", (!p.active || expired || full) && "opacity-60")}>
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-lg font-bold">{p.code}</span>
                      <Badge tone="info">{promoValue(p)}</Badge>
                      {!p.active && <Badge tone="neutral">Off</Badge>}
                      {expired && <Badge tone="neutral">Ended</Badge>}
                      {full && <Badge tone="neutral">Used up</Badge>}
                      {p.first_visit_only && <Badge tone="violet">First visit only</Badge>}
                    </p>
                    <p className="text-sm text-fg-muted">
                      {[
                        p.description,
                        toCents(p.min_spend) > 0 ? `min spend ${formatCents(toCents(p.min_spend), { whole: true })}` : null,
                        p.valid_from || p.valid_to ? `${p.valid_from ? formatDate(p.valid_from, "medium") : "now"} – ${p.valid_to ? formatDate(p.valid_to, "medium") : "no end"}` : null,
                        `used ${p.used_count}${p.max_uses ? ` of ${p.max_uses}` : ""}`,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                  <Button size="sm" variant="ghost" loading={busy === p.id} onClick={() => run(p.id, () => adminSave(supabase, "promo_codes", p.id, { active: !p.active }), p.active ? `${p.code} turned off` : `${p.code} turned on`)}>
                    {p.active ? "Turn off" : "Turn on"}
                  </Button>
                  <Button size="icon-sm" variant="ghost" icon={Pencil} aria-label={`Edit ${p.code}`} onClick={() => setPromo(p)} />
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    icon={Trash2}
                    aria-label={`Delete ${p.code}`}
                    onClick={() => setConfirm({ title: `Delete ${p.code}?`, description: p.used_count ? "It has been used — if it’s linked to past bookings you’ll need to turn it off instead." : undefined, label: "Delete", run: () => adminDelete(supabase, "promo_codes", p.id) })}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <div className="grid gap-6 @5xl:grid-cols-2">
        <Card>
          <CardHeader
            title="Loyalty rewards"
            description="Earned automatically when a job is completed"
            action={
              <Switch
                checked={loyaltyEnabled}
                onChange={(v) => run("loyalty", () => adminSave(supabase, "settings", settingsId, { loyalty_enabled: v }), v ? "Loyalty turned on" : "Loyalty turned off")}
                label={<span className="sr-only">Loyalty on</span>}
                disabled={busy === "loyalty"}
              />
            }
          />
          {!loyaltyEnabled && (
            <Notice tone="warn" className="mx-5 mt-4">
              Loyalty is off: no new rewards are earned. Rewards already earned can still be used.
            </Notice>
          )}
          <ul className="divide-y divide-line">
            {rules.map((r) => (
              <li key={r.id} className={cn("flex flex-wrap items-center gap-3 px-5 py-3", !r.active && "opacity-60")}>
                {r.kind === "visits" ? <Trophy size={20} className="text-fg-faint" aria-hidden /> : <Gift size={20} className="text-fg-faint" aria-hidden />}
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">
                    {r.name} {!r.active && <Badge tone="neutral">Off</Badge>}
                  </p>
                  <p className="text-sm text-fg-muted">
                    {r.kind === "visits" ? `Every ${r.visits_required} visits${r.repeat ? "" : " (once)"}` : "When someone they referred has their first wash"} · {rewardValue(r)}
                    {r.eligible_service_ids?.length ? " · on selected services" : ""}
                    {r.expires_after_days ? ` · lasts ${r.expires_after_days} days` : ""}
                  </p>
                </div>
                <Button size="icon-sm" variant="ghost" icon={Pencil} aria-label={`Edit ${r.name}`} onClick={() => setRule(r)} />
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <CardHeader title="Member tiers" description="Shown to customers by completed visits" />
          <CardBody className="space-y-2">
            {tierRows
              .map((t, i) => ({ t, i }))
              .map(({ t, i }) => (
                <div key={i} className="flex items-center gap-2">
                  <Input aria-label="Tier name" value={t.name} onChange={(e) => setTierRows((rows) => rows.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} maxLength={20} />
                  <div className="w-36 shrink-0">
                    <Input
                      type="number"
                      aria-label="From visits"
                      min={0}
                      value={t.min_visits}
                      onChange={(e) => setTierRows((rows) => rows.map((x, j) => (j === i ? { ...x, min_visits: Number(e.target.value) } : x)))}
                    />
                  </div>
                  <span className="w-12 shrink-0 text-sm text-fg-muted">visits</span>
                  <Button size="icon-sm" variant="ghost" icon={Trash2} aria-label={`Remove ${t.name}`} disabled={tierRows.length === 1} onClick={() => setTierRows((rows) => rows.filter((_, j) => j !== i))} />
                </div>
              ))}
            {!tiersValid && <p className="text-sm text-bad-ink">Each tier needs a name and a different number of visits.</p>}
            <div className="flex flex-wrap gap-2 pt-2">
              <Button size="sm" icon={Plus} onClick={() => setTierRows((rows) => [...rows, { name: "", min_visits: (rows.at(-1)?.min_visits ?? 0) + 6 }])}>
                Add tier
              </Button>
              {tiersDirty && (
                <Button
                  size="sm"
                  variant="primary"
                  disabled={!tiersValid}
                  loading={busy === "tiers"}
                  onClick={() => run("tiers", () => adminSave(supabase, "settings", settingsId, { loyalty_tiers: [...tierRows].map((t) => ({ name: t.name.trim(), min_visits: t.min_visits })).sort((a, b) => a.min_visits - b.min_visits) }), "Tiers saved")}
                >
                  Save tiers
                </Button>
              )}
            </div>
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader title="Gift vouchers" description="Paid with at checkout (choose “Gift voucher”); the balance goes down as it's used" action={<Button size="sm" variant="primary" icon={Plus} onClick={() => setVoucherOpen(true)}>Issue voucher</Button>} />
        {vouchers.length === 0 ? (
          <EmptyState icon={Gift} title="No vouchers yet" className="py-8" />
        ) : (
          <ul className="divide-y divide-line">
            {vouchers.map((v) => (
              <li key={v.id} className={cn("flex flex-wrap items-center gap-3 px-5 py-3", v.status !== "active" && "opacity-60")}>
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="font-mono font-bold">{v.code}</span>
                    <Badge tone={v.status === "active" ? "ok" : "neutral"}>{v.status === "active" ? "Active" : v.status === "used" ? "Used up" : v.status === "expired" ? "Expired" : "Cancelled"}</Badge>
                  </p>
                  <p className="text-sm text-fg-muted">
                    {formatCents(toCents(v.balance))} left of {formatCents(toCents(v.initial_value))}
                    {v.customer && ` · for ${v.customer.name}`}
                    {v.expires_at && ` · expires ${formatDate(v.expires_at, "medium")}`}
                    {` · issued ${formatDate(shopDateOf(v.created_at), "medium")}`}
                    {v.note && ` · ${v.note}`}
                  </p>
                </div>
                {v.status === "active" && (
                  <Button size="sm" variant="ghost" className="text-bad-ink" onClick={() => setConfirm({ title: `Cancel voucher ${v.code}?`, description: "It can no longer be used. Money already spent from it isn't affected.", label: "Cancel voucher", run: () => adminSave(supabase, "vouchers", v.id, { status: "void" }) })}>
                    Cancel
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <PromoDialog key={`promo-${promo === null ? "none" : promo === "new" ? "new" : promo.id}`} promo={promo} onClose={() => setPromo(null)} />
      <RuleDialog key={`rule-${rule?.id ?? "none"}`} rule={rule} onClose={() => setRule(null)} />
      <VoucherDialog key={`voucher-${voucherOpen}`} open={voucherOpen} onClose={() => setVoucherOpen(false)} />
      <ConfirmDialog
        open={!!confirm}
        onClose={() => setConfirm(null)}
        busy={busy === "confirm"}
        tone="danger"
        title={confirm?.title ?? ""}
        description={confirm?.description}
        confirmLabel={confirm?.label}
        onConfirm={async () => {
          if (!confirm) return;
          await run("confirm", confirm.run, "Done");
          setConfirm(null);
        }}
      />
    </div>
  );
}

function PromoDialog({ promo, onClose }: { promo: Promo | "new" | null; onClose: () => void }) {
  const { supabase } = useShop();
  const router = useRouter();
  const toast = useToast();
  const p = promo === "new" || promo === null ? null : promo;
  const [code, setCode] = useState(p?.code ?? "");
  const [description, setDescription] = useState(p?.description ?? "");
  const [type, setType] = useState<Promo["type"]>(p?.type ?? "percent");
  const [value, setValue] = useState(p ? String(Number(p.value)) : "10");
  const [minSpend, setMinSpend] = useState(p && toCents(p.min_spend) ? String(toCents(p.min_spend) / 100) : "");
  const [from, setFrom] = useState(p?.valid_from ?? "");
  const [to, setTo] = useState(p?.valid_to ?? "");
  const [maxUses, setMaxUses] = useState(p?.max_uses ? String(p.max_uses) : "");
  const [firstVisit, setFirstVisit] = useState(p?.first_visit_only ?? false);
  const [active, setActive] = useState(p?.active ?? true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const codeOk = /^[A-Z0-9_-]{3,24}$/.test(code.trim().toUpperCase());
  const num = Number(value);
  const valueOk = Number.isFinite(num) && num > 0 && (type === "fixed" || num <= 100);
  const minOk = !minSpend || parseMoneyInput(minSpend) !== null;
  const datesOk = !from || !to || from <= to;
  const usesOk = !maxUses || (Number.isInteger(Number(maxUses)) && Number(maxUses) > 0);
  const valid = codeOk && valueOk && minOk && datesOk && usesOk;

  async function save() {
    if (!valid) return;
    setBusy(true);
    setError(null);
    try {
      await adminSave(supabase, "promo_codes", p?.id ?? null, {
        code: code.trim().toUpperCase(),
        description: description.trim() || null,
        type,
        value: num,
        min_spend: minSpend ? (parseMoneyInput(minSpend) ?? 0) / 100 : 0,
        valid_from: from || null,
        valid_to: to || null,
        max_uses: maxUses ? Number(maxUses) : null,
        first_visit_only: firstVisit,
        active,
      });
      toast.success(p ? "Promo saved" : "Promo created", code.trim().toUpperCase());
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
      open={promo !== null}
      onClose={onClose}
      dismissible={!busy}
      title={p ? `Edit ${p.code}` : "New promo code"}
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
      <div className="grid gap-4 pb-2 sm:grid-cols-2">
        {error && <Notice tone="bad" className="sm:col-span-2">{error}</Notice>}
        <Field label="Code" error={code && !codeOk ? "3–24 letters, numbers, - or _" : null}>
          <Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} className="font-mono uppercase" maxLength={24} placeholder="SPRING10" />
        </Field>
        <Field label="Description" optional>
          <Input value={description} onChange={(e) => setDescription(e.target.value)} maxLength={80} placeholder="Spring special" />
        </Field>
        <Field label="Discount type">
          <Select value={type} onChange={(e) => setType(e.target.value as Promo["type"])}>
            <option value="percent">Percentage off</option>
            <option value="fixed">Dollars off</option>
          </Select>
        </Field>
        <Field label={type === "percent" ? "Percent" : "Amount ($)"} error={value && !valueOk ? (type === "percent" ? "1 to 100" : "More than 0") : null}>
          <Input inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} />
        </Field>
        <Field label="Minimum spend" optional error={minOk ? null : "Like 50"}>
          <Input inputMode="decimal" value={minSpend} onChange={(e) => setMinSpend(e.target.value)} placeholder="0" />
        </Field>
        <Field label="Limit uses" optional error={usesOk ? null : "A whole number"} hint="Total across everyone">
          <Input inputMode="numeric" value={maxUses} onChange={(e) => setMaxUses(e.target.value)} />
        </Field>
        <Field label="Starts" optional>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </Field>
        <Field label="Ends" optional error={datesOk ? null : "After the start"}>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </Field>
        <div className="sm:col-span-2">
          <Switch checked={firstVisit} onChange={setFirstVisit} label="First visit only" description="Only for customers who haven't been in before" />
          <Switch checked={active} onChange={setActive} label="Active" />
        </div>
      </div>
    </Dialog>
  );
}

function RuleDialog({ rule, onClose }: { rule: LoyaltyRule | null; onClose: () => void }) {
  const { supabase, services } = useShop();
  const router = useRouter();
  const toast = useToast();
  const [name, setName] = useState(rule?.name ?? "");
  const [visits, setVisits] = useState(String(rule?.visits_required ?? 6));
  const [type, setType] = useState<"percent" | "fixed">(rule?.reward_type === "fixed" ? "fixed" : "percent");
  const [value, setValue] = useState(String(Number(rule?.reward_value ?? 50)));
  const [eligible, setEligible] = useState<string[]>(rule?.eligible_service_ids ?? []);
  const [expires, setExpires] = useState(rule?.expires_after_days ? String(rule.expires_after_days) : "");
  const [repeat, setRepeat] = useState(rule?.repeat ?? true);
  const [active, setActive] = useState(rule?.active ?? true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const isVisits = rule?.kind === "visits";
  const num = Number(value);
  const valid = name.trim().length > 2 && Number.isFinite(num) && num > 0 && (type === "fixed" || num <= 100) && (!isVisits || (Number.isInteger(Number(visits)) && Number(visits) > 0)) && (!expires || Number(expires) > 0);

  async function save() {
    if (!rule || !valid) return;
    setBusy(true);
    setError(null);
    try {
      await adminSave(supabase, "loyalty_rules", rule.id, {
        name: name.trim(),
        ...(isVisits ? { visits_required: Number(visits), repeat } : {}),
        reward_type: type,
        reward_value: num,
        eligible_service_ids: eligible.length ? eligible : null,
        expires_after_days: expires ? Number(expires) : null,
        active,
      });
      toast.success("Reward rule saved");
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
      open={!!rule}
      onClose={onClose}
      dismissible={!busy}
      title={isVisits ? "Visits reward" : "Referral reward"}
      description="Changes apply to rewards earned from now on."
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
      <div className="grid gap-4 pb-2 sm:grid-cols-2">
        {error && <Notice tone="bad" className="sm:col-span-2">{error}</Notice>}
        <Field label="Name (what customers see)" className="sm:col-span-2">
          <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
        </Field>
        {isVisits && (
          <Field label="Every how many visits">
            <Input type="number" min={1} value={visits} onChange={(e) => setVisits(e.target.value)} />
          </Field>
        )}
        <Field label="Reward">
          <Select value={type} onChange={(e) => setType(e.target.value as "percent" | "fixed")}>
            <option value="percent">Percentage off</option>
            <option value="fixed">Dollars off</option>
          </Select>
        </Field>
        <Field label={type === "percent" ? "Percent" : "Amount ($)"}>
          <Input inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} />
        </Field>
        <Field label="Expires after" optional hint="days (blank = never)">
          <Input inputMode="numeric" value={expires} onChange={(e) => setExpires(e.target.value)} />
        </Field>
        <fieldset className="sm:col-span-2">
          <legend className="mb-2 text-sm font-medium">Can be used on</legend>
          <div className="flex flex-wrap gap-2">
            {services
              .filter((s) => s.active)
              .map((s) => {
                const on = eligible.includes(s.id);
                return (
                  <Button key={s.id} size="sm" variant={on ? "primary" : "secondary"} aria-pressed={on} onClick={() => setEligible((ids) => (on ? ids.filter((x) => x !== s.id) : [...ids, s.id]))}>
                    {s.name}
                  </Button>
                );
              })}
          </div>
          <p className="mt-1.5 text-xs text-fg-muted">{eligible.length ? `Only these ${eligible.length}` : "None picked = any service"}</p>
        </fieldset>
        <div className="sm:col-span-2">
          {isVisits && <Switch checked={repeat} onChange={setRepeat} label="Repeat" description={`Every ${visits || "N"} visits, not just the first time`} />}
          <Switch checked={active} onChange={setActive} label="Active" />
        </div>
      </div>
    </Dialog>
  );
}

function VoucherDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { supabase } = useShop();
  const router = useRouter();
  const toast = useToast();
  const [code, setCode] = useState(() => `GIFT-${Array.from({ length: 5 }, () => "23456789ABCDEFGHJKMNPQRSTUVWXYZ"[Math.floor(Math.random() * 31)]).join("")}`);
  const [value, setValue] = useState("50");
  const [expires, setExpires] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const cents = parseMoneyInput(value);
  const valid = /^[A-Z0-9_-]{3,24}$/.test(code) && cents !== null && cents > 0;

  async function save() {
    if (!valid || cents === null) return;
    setBusy(true);
    setError(null);
    try {
      await adminSave(supabase, "vouchers", null, { code, initial_value: cents / 100, expires_at: expires || null, note: note.trim() || null });
      toast.success("Voucher issued", `${code} · ${formatCents(cents)}`);
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
      size="sm"
      title="Issue a gift voucher"
      description="Take payment for it first (e.g. as a custom line on an invoice), then issue it here."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" loading={busy} disabled={!valid} onClick={save}>
            Issue voucher
          </Button>
        </>
      }
    >
      <div className="space-y-4 pb-2">
        {error && <Notice tone="bad">{error}</Notice>}
        <Field label="Code" hint="Write this on the voucher">
          <Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} className="font-mono uppercase" maxLength={24} />
        </Field>
        <Field label="Value" error={value && (cents === null || cents <= 0) ? "Like 50" : null}>
          <Input inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} />
        </Field>
        <Field label="Expires" optional>
          <Input type="date" min={todayISO()} value={expires} onChange={(e) => setExpires(e.target.value)} />
        </Field>
        <Field label="Note" optional>
          <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder="e.g. Bought by Sam for Jess's birthday" />
        </Field>
      </div>
    </Dialog>
  );
}
