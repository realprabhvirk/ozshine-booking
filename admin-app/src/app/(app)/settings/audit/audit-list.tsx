"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, ScrollText } from "lucide-react";
import { cn } from "@/lib/core/cn";
import { formatDateTime } from "@/lib/core/time";
import { Card } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/field";
import { Button, LinkButton } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/feedback";

export type AuditRow = {
  id: string;
  action: string;
  entity: string;
  entity_id: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  created_at: string;
  actor: { name: string } | null;
};

export const AUDIT_AREAS: Array<{ value: string; label: string; prefixes: string[] }> = [
  { value: "money", label: "Invoices & payments", prefixes: ["invoice", "payment", "day"] },
  { value: "bookings", label: "Bookings", prefixes: ["booking"] },
  { value: "customers", label: "Customers", prefixes: ["customer"] },
  { value: "settings", label: "Settings & prices", prefixes: ["settings", "services", "addons", "bays", "blackout_dates", "automations"] },
  { value: "rewards", label: "Promos, loyalty & vouchers", prefixes: ["promo_codes", "loyalty_rules", "vouchers"] },
  { value: "messages", label: "Messages & reviews", prefixes: ["campaign", "message_templates", "testimonials"] },
  { value: "staff", label: "Logins", prefixes: ["staff"] },
];

const LABELS: Record<string, string> = {
  "booking.status": "Changed a booking's status",
  "booking.update": "Edited a booking",
  "booking.manual_discount": "Gave a manual discount",
  "booking.complete_without_invoice": "Completed a job without an invoice",
  "invoice.issue": "Created an invoice",
  "invoice.add_item": "Added an invoice line",
  "invoice.price_edit": "Changed an invoice line",
  "invoice.remove_item": "Removed an invoice line",
  "invoice.promo": "Applied a promo code",
  "invoice.reward": "Applied a loyalty reward",
  "invoice.void": "Voided an invoice",
  "payment.refund": "Refunded a payment",
  "day.close": "Closed the day",
  "day.reopen": "Reopened a day",
  "customer.create": "Added a customer",
  "customer.update": "Edited a customer",
  "customer.merge": "Merged two customers",
  "customer.import": "Imported customers",
  "customer.anonymise": "Deleted a customer's personal details",
  "customer.deletion_requested": "Customer asked to delete their details",
  "campaign.send": "Sent a campaign",
  "automations.update": "Changed automatic messages",
  "settings.display_key": "Made a new shop TV link",
  "settings.cron_key": "Made a new scheduler key",
  "staff.update": "Changed a login",
  "staff.pin_set": "Set a PIN",
  "staff.invite": "Invited a staff member",
  "staff.invite_claimed": "Staff member accepted an invite",
};
const ENTITY: Record<string, string> = {
  settings: "shop settings",
  services: "a service",
  addons: "an extra",
  bays: "a bay",
  blackout_dates: "a closure",
  promo_codes: "a promo code",
  loyalty_rules: "a loyalty reward",
  vouchers: "a gift voucher",
  message_templates: "a message template",
  testimonials: "a review",
};
const VERB: Record<string, string> = { create: "Added", update: "Changed", delete: "Deleted" };

function describe(action: string) {
  if (LABELS[action]) return LABELS[action];
  const [entity, verb] = action.split(".");
  if (ENTITY[entity] && VERB[verb]) return `${VERB[verb]} ${ENTITY[entity]}`;
  return action;
}

// A short name for the thing that changed, when the row carries one.
function subject(row: AuditRow) {
  const r = row.after ?? row.before;
  if (!r) return null;
  for (const key of ["code", "name", "invoice_number", "reference", "reason", "date"]) {
    const v = r[key];
    if (typeof v === "string" && v) return v;
  }
  return null;
}

const HIDDEN = new Set(["id", "location_id", "created_at", "updated_at", "is_demo", "search_text"]);

function show(v: unknown) {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

function changes(row: AuditRow) {
  const before = row.before ?? {};
  const after = row.after ?? {};
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].filter((k) => !HIDDEN.has(k));
  const onlyAfter = !row.before;
  const onlyBefore = !row.after;
  return keys
    .filter((k) => onlyAfter || onlyBefore || JSON.stringify(before[k]) !== JSON.stringify(after[k]))
    .map((k) => ({ key: k.replaceAll("_", " "), before: onlyAfter ? null : show(before[k]), after: onlyBefore ? null : show(after[k]) }));
}

function link(row: AuditRow) {
  if (!row.entity_id) return null;
  if (row.entity === "invoice" || row.entity === "invoices") return `/invoices/${row.entity_id}`;
  if (row.entity === "customer" || row.entity === "customers") return `/customers/${row.entity_id}`;
  if (row.entity === "booking" || row.entity === "bookings") return `/?booking=${row.entity_id}`;
  return null;
}

export function AuditList({
  rows,
  from,
  to,
  area,
  page,
  pageSize,
  total,
}: {
  rows: AuditRow[];
  from: string;
  to: string;
  area: string;
  page: number;
  pageSize: number;
  total: number | null;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const qs = (p: number) => `/settings/audit?${new URLSearchParams({ from, to, ...(area ? { area } : {}), ...(p ? { page: String(p) } : {}) })}`;
  const more = rows.length === pageSize;

  return (
    <div className="space-y-4">
      <form method="get" action="/settings/audit" className="flex flex-wrap items-end gap-3">
        <Field label="From">
          <Input type="date" name="from" defaultValue={from} max={to} />
        </Field>
        <Field label="To">
          <Input type="date" name="to" defaultValue={to} />
        </Field>
        <Field label="Area">
          <Select name="area" defaultValue={area}>
            <option value="">Everything</option>
            {AUDIT_AREAS.map((a) => (
              <option key={a.value} value={a.value}>
                {a.label}
              </option>
            ))}
          </Select>
        </Field>
        <Button type="submit">Show</Button>
      </form>

      <Card>
        {rows.length === 0 ? (
          <EmptyState icon={ScrollText} title="Nothing recorded" description="No changes in this date range." className="py-10" />
        ) : (
          <ul className="divide-y divide-line">
            {rows.map((row) => {
              const diff = changes(row);
              const isOpen = open === row.id;
              const href = link(row);
              const name = subject(row);
              return (
                <li key={row.id}>
                  <button
                    type="button"
                    aria-expanded={diff.length ? isOpen : undefined}
                    disabled={!diff.length}
                    onClick={() => setOpen(isOpen ? null : row.id)}
                    className="flex min-h-14 w-full items-center gap-3 px-5 py-3 text-left transition enabled:hover:bg-sunken focus-visible:outline-2 focus-visible:outline-focus"
                  >
                    <span className="w-28 shrink-0 text-sm tabular-nums text-fg-muted sm:w-44">{formatDateTime(row.created_at)}</span>
                    <span className="min-w-0 flex-1">
                      <span className="font-medium">{describe(row.action)}</span>
                      {name && <span className="text-fg-muted"> · {name}</span>}
                    </span>
                    <span className="hidden shrink-0 text-sm text-fg-muted sm:block">{row.actor?.name ?? "Customer / system"}</span>
                    {diff.length > 0 && <ChevronDown size={18} aria-hidden className={cn("shrink-0 text-fg-faint transition", isOpen && "rotate-180")} />}
                  </button>
                  {isOpen && (
                    <div className="space-y-3 bg-sunken/60 px-5 pb-4 pt-2">
                      <p className="text-sm text-fg-muted sm:hidden">By {row.actor?.name ?? "customer / system"}</p>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead className="text-left text-xs uppercase tracking-wide text-fg-faint">
                            <tr>
                              <th className="py-1.5 pr-4 font-semibold">Field</th>
                              {row.before && <th className="py-1.5 pr-4 font-semibold">Before</th>}
                              {row.after && <th className="py-1.5 font-semibold">After</th>}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-line">
                            {diff.map((d) => (
                              <tr key={d.key} className="align-top">
                                <td className="py-1.5 pr-4 font-medium capitalize">{d.key}</td>
                                {d.before !== null && <td className="max-w-80 break-words py-1.5 pr-4 text-fg-muted">{d.before}</td>}
                                {d.after !== null && <td className="max-w-80 break-words py-1.5">{d.after}</td>}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      {href && (
                        <LinkButton href={href} size="sm" variant="secondary">
                          Open
                        </LinkButton>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {(page > 0 || more) && (
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-fg-muted">
            Showing {page * pageSize + 1}–{page * pageSize + rows.length}
            {total !== null && total > rows.length ? ` of about ${total.toLocaleString("en-AU")}` : ""}
          </p>
          <div className="flex gap-2">
            {page > 0 && (
              <Link href={qs(page - 1)} className="text-sm font-semibold text-accent-ink hover:underline">
                ← Newer
              </Link>
            )}
            {more && (
              <Link href={qs(page + 1)} className="text-sm font-semibold text-accent-ink hover:underline">
                Older →
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
