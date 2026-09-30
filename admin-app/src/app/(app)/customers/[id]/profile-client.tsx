"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, CalendarCheck, Crown, Gift, Globe, History, Mail, MessageSquare, Pencil, Phone, PlayCircle, Plus, Send, StickyNote, Trash2, UserX, Users,
} from "lucide-react";
import { cn } from "@/lib/core/cn";
import { formatCents, toCents } from "@/lib/core/money";
import { formatPhone } from "@/lib/core/phone";
import { VEHICLE_TYPE_LABELS } from "@/lib/core/status";
import { formatDate, formatDateTime, formatDay, formatRelative, formatTime, shopDateOf } from "@/lib/core/time";
import { Button, LinkButton } from "@/components/ui/button";
import { Badge, InvoiceBadge, StatusBadge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader, Stat } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/dialog";
import { EmptyState, Notice } from "@/components/ui/feedback";
import { Textarea } from "@/components/ui/field";
import { TabPanel, Tabs } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";
import { useShop } from "@/components/shop-context";
import { CustomerDialog } from "@/components/customers/customer-dialog";
import { VehicleDialog } from "@/components/customers/vehicle-dialog";
import { MergeDialog } from "@/components/customers/merge-dialog";
import { MessageDialog } from "@/components/customers/message-dialog";
import { OUTBOX_STATUS, type OutboxStatus } from "@/lib/messaging";
import { useLiveData } from "@/lib/shop/hooks";
import { useBookingPanel } from "@/lib/shop/use-booking-panel";
import { liveInvoice } from "@/lib/shop/types";
import {
  addCustomerNote, anonymiseCustomer, archiveVehicle, fetchCustomerProfile, tierFor, type CustomerProfile, type VehicleRecord,
} from "@/lib/shop/customers";

type Tab = "visits" | "cars" | "notes" | "rewards" | "timeline" | "messages";

const REWARD_TONES = { issued: "ok", redeemed: "neutral", expired: "bad", void: "bad" } as const;
const REWARD_LABELS = { issued: "Ready to use", redeemed: "Used", expired: "Expired", void: "Cancelled" } as const;

export function CustomerProfileClient({ initial }: { initial: CustomerProfile }) {
  const { supabase, staff, settings } = useShop();
  const router = useRouter();
  const toast = useToast();
  const panel = useBookingPanel();
  const id = initial.customer.id;
  const load = useCallback(async () => (await fetchCustomerProfile(supabase, id)) ?? initial, [supabase, id, initial]);
  const { data } = useLiveData({ supabase, locationId: staff.location_id, initial, load, channel: `customer-${id}` });
  const { customer: c, stats, bookings, vehicles, notes, rewards, events, messages } = data;

  const [tab, setTab] = useState<Tab>("visits");
  const [editOpen, setEditOpen] = useState(false);
  const [vehicleEdit, setVehicleEdit] = useState<VehicleRecord | "new" | null>(null);
  const [archive, setArchive] = useState<VehicleRecord | null>(null);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [anonOpen, setAnonOpen] = useState(false);
  const [messageOpen, setMessageOpen] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const isAdmin = staff.role === "admin";
  const deleted = !!c.anonymised_at;
  const visits = stats?.visit_count ?? 0;
  const spend = toCents(stats?.lifetime_spend ?? 0);
  const owing = toCents(stats?.outstanding_balance ?? 0);
  const tier = settings?.loyalty_enabled !== false ? tierFor(visits, settings?.loyalty_tiers) : null;
  const upcoming = bookings.filter((b) => ["pending", "approved", "checked_in", "in_progress", "ready"].includes(b.status));
  const past = bookings.filter((b) => !upcoming.includes(b));
  // New sale opens with this customer already picked.
  const customerParam = `customer=${c.id}`;

  async function saveNote() {
    if (!note.trim()) return;
    setBusy("note");
    try {
      await addCustomerNote(supabase, c.id, note.trim());
      setNote("");
      toast.success("Note added");
    } catch (e) {
      toast.error(e, "Couldn't save the note");
    } finally {
      setBusy(null);
    }
  }

  async function doArchive() {
    if (!archive) return;
    setBusy("archive");
    try {
      await archiveVehicle(supabase, archive.id);
      toast.success("Car removed", archive.rego ?? undefined);
      setArchive(null);
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(null);
    }
  }

  async function doAnonymise() {
    setBusy("anon");
    try {
      await anonymiseCustomer(supabase, c.id);
      toast.success("Personal details deleted", "Visits and invoices are kept for the records.");
      setAnonOpen(false);
      router.refresh();
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto max-w-[1300px]">
      <Link href="/customers" className="mb-3 inline-flex min-h-10 items-center gap-2 text-sm font-semibold text-fg-muted hover:text-fg">
        <ArrowLeft size={16} aria-hidden /> Customers
      </Link>

      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight">
            {c.is_vip && <Crown size={26} className="shrink-0 text-warn" aria-label="VIP" />}
            <span className="truncate">{c.name}</span>
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {tier?.current && <Badge tone="accent">{tier.current.name}</Badge>}
            {c.tags.map((t) => (
              <Badge key={t} tone="neutral">
                {t}
              </Badge>
            ))}
            {c.auth_user_id && (
              <Badge tone="info">
                <Globe size={12} aria-hidden /> Online account
              </Badge>
            )}
            {!c.marketing_opt_in && <Badge tone="warn">No marketing</Badge>}
            {deleted && <Badge tone="bad">Details deleted</Badge>}
            {c.deletion_requested_at && !deleted && <Badge tone="bad">Asked to be deleted</Badge>}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-[15px]">
            {c.phone && (
              <a href={`tel:${c.phone}`} className="inline-flex min-h-10 items-center gap-2 font-semibold tabular-nums hover:underline">
                <Phone size={16} className="text-fg-faint" aria-hidden /> {formatPhone(c.phone)}
              </a>
            )}
            {c.email && (
              <a href={`mailto:${c.email}`} className="inline-flex min-h-10 items-center gap-2 break-all hover:underline">
                <Mail size={16} className="text-fg-faint" aria-hidden /> {c.email}
              </a>
            )}
            <span className="text-fg-muted">Customer since {formatDate(shopDateOf(c.created_at), "medium")}</span>
          </div>
        </div>
        {!deleted && (
          <div className="flex flex-wrap gap-2">
            <LinkButton href={`/new${customerParam ? `?${customerParam}` : ""}`} icon={PlayCircle}>
              Walk-in
            </LinkButton>
            <LinkButton href={`/new?mode=later${customerParam ? `&${customerParam}` : ""}`} icon={CalendarCheck}>
              Book
            </LinkButton>
            <Button variant="primary" icon={Pencil} onClick={() => setEditOpen(true)}>
              Edit
            </Button>
          </div>
        )}
      </header>

      {c.notes && (
        <Notice tone="info" title="Pinned note" className="mb-6 whitespace-pre-line">
          {c.notes}
        </Notice>
      )}

      <div className="mb-6 grid grid-cols-2 gap-3 @3xl:grid-cols-3 @6xl:grid-cols-6">
        <Stat label="Visits" value={visits} sub={tier?.next ? `${tier.next.min_visits - visits} more to ${tier.next.name}` : tier?.current ? `${tier.current.name} member` : undefined} />
        <Stat label="Spent" value={formatCents(spend, { whole: true })} />
        <Stat label="Average visit" value={visits ? formatCents(Math.round(spend / visits), { whole: true }) : "—"} />
        <Stat label="Last visit" value={stats?.last_visit_at ? formatRelative(stats.last_visit_at) : "Never"} />
        <Stat label="Owing" value={<span className={owing > 0 ? "text-warn-ink" : undefined}>{formatCents(owing)}</span>} />
        <Stat label="Rewards" value={stats?.unused_rewards ?? 0} sub="Ready to use" icon={<Gift size={18} />} />
      </div>

      <Tabs
        label="Customer details"
        idPrefix="cust"
        value={tab}
        onChange={setTab}
        className="mb-4 w-fit max-w-full"
        tabs={[
          { id: "visits", label: "Visits", count: bookings.length },
          { id: "cars", label: "Cars", count: vehicles.length },
          { id: "notes", label: "Notes", count: notes.length },
          { id: "rewards", label: "Rewards", count: rewards.length },
          { id: "timeline", label: "Timeline" },
          { id: "messages", label: "Messages", count: messages.length },
        ]}
      />

      {tab === "visits" && (
        <TabPanel id="visits" idPrefix="cust" className="space-y-6">
          {upcoming.length > 0 && (
            <Card>
              <CardHeader title="Coming up" />
              <ul className="divide-y divide-line">
                {upcoming.map((b) => (
                  <li key={b.id}>
                    <button type="button" onClick={() => panel.open(b.id)} className="flex min-h-16 w-full flex-wrap items-center gap-3 px-5 py-3 text-left hover:bg-raised">
                      <span className="w-40 font-semibold">
                        {formatDay(b.requested_date)} {formatTime(b.requested_time)}
                      </span>
                      <span className="min-w-0 flex-1">{b.service?.name}</span>
                      <span className="font-mono text-sm text-fg-muted">{b.vehicle?.rego}</span>
                      <StatusBadge status={b.status} />
                    </button>
                  </li>
                ))}
              </ul>
            </Card>
          )}
          <Card>
            <CardHeader title="Past visits" />
            {past.length === 0 ? (
              <EmptyState icon={History} title="No past visits" className="py-8" />
            ) : (
              <ul className="divide-y divide-line">
                {past.map((b) => {
                  const inv = liveInvoice(b);
                  return (
                    <li key={b.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                      <button type="button" onClick={() => panel.open(b.id)} className="flex min-w-0 flex-1 flex-wrap items-center gap-3 text-left hover:underline">
                        <span className="w-32 tabular-nums">{formatDate(b.requested_date, "medium")}</span>
                        <span className="min-w-0 flex-1">{b.service?.name}</span>
                        <span className="font-mono text-sm text-fg-muted">{b.vehicle?.rego}</span>
                      </button>
                      {b.status !== "completed" ? (
                        <StatusBadge status={b.status} />
                      ) : inv ? (
                        <Link href={`/invoices/${inv.id}`} className="inline-flex items-center gap-2 hover:underline">
                          <InvoiceBadge status={inv.status} />
                          <span className="w-20 text-right font-semibold tabular-nums">{formatCents(toCents(inv.total))}</span>
                        </Link>
                      ) : (
                        <Link href={`/invoices/${b.id}`} className="w-20 text-right font-semibold tabular-nums hover:underline">
                          {formatCents(toCents(b.price_estimate))}
                        </Link>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </TabPanel>
      )}

      {tab === "cars" && (
        <TabPanel id="cars" idPrefix="cust">
          <div className="grid gap-3 @3xl:grid-cols-2 @6xl:grid-cols-3">
            {vehicles.map((v) => (
              <Card key={v.id} className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-mono text-xl font-bold">{v.rego ?? "No rego"}</p>
                    <p className="text-fg-muted">
                      {[v.year, v.colour, v.make_model].filter(Boolean).join(" ") || "No details"}
                      {v.nickname && ` · “${v.nickname}”`}
                    </p>
                    <Badge tone="neutral" className="mt-2">
                      {VEHICLE_TYPE_LABELS[v.vehicle_type]}
                    </Badge>
                    {v.notes && <p className="mt-2 text-sm text-fg-muted">{v.notes}</p>}
                  </div>
                  {!deleted && (
                    <div className="flex gap-1">
                      <Button size="icon-sm" variant="ghost" icon={Pencil} aria-label={`Edit ${v.rego ?? "car"}`} onClick={() => setVehicleEdit(v)} />
                      <Button size="icon-sm" variant="ghost" icon={Trash2} aria-label={`Remove ${v.rego ?? "car"}`} onClick={() => setArchive(v)} />
                    </div>
                  )}
                </div>
              </Card>
            ))}
            {!deleted && (
              <button
                type="button"
                onClick={() => setVehicleEdit("new")}
                className="flex min-h-32 flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-line text-fg-muted transition hover:border-line-strong hover:text-fg"
              >
                <Plus size={22} aria-hidden />
                <span className="font-semibold">Add a car</span>
              </button>
            )}
          </div>
        </TabPanel>
      )}

      {tab === "notes" && (
        <TabPanel id="notes" idPrefix="cust" className="space-y-4">
          {!deleted && (
            <Card className="p-4">
              <label htmlFor="new-note" className="sr-only">
                New note
              </label>
              <Textarea id="new-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a note for the team…" maxLength={4000} />
              <div className="mt-2 flex justify-end">
                <Button variant="primary" size="sm" icon={StickyNote} loading={busy === "note"} disabled={!note.trim()} onClick={saveNote}>
                  Add note
                </Button>
              </div>
            </Card>
          )}
          {notes.length === 0 ? (
            <Card>
              <EmptyState icon={StickyNote} title="No notes yet" description="Preferences, quirks, anything the team should know." className="py-8" />
            </Card>
          ) : (
            <Card>
              <ul className="divide-y divide-line">
                {notes.map((n) => (
                  <li key={n.id} className="px-5 py-4">
                    <p className="whitespace-pre-line">{n.body}</p>
                    <p className="mt-1 text-sm text-fg-muted">
                      {formatDateTime(n.created_at, "medium")}
                      {n.staff && ` · ${n.staff.name}`}
                    </p>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </TabPanel>
      )}

      {tab === "rewards" && (
        <TabPanel id="rewards" idPrefix="cust">
          <Card>
            {rewards.length === 0 ? (
              <EmptyState icon={Gift} title="No rewards yet" description={tier?.next || settings?.loyalty_enabled ? "Rewards are earned automatically as visits add up." : undefined} className="py-8" />
            ) : (
              <ul className="divide-y divide-line">
                {rewards.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                    <Gift size={18} className="text-fg-faint" aria-hidden />
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold">{r.description}</p>
                      <p className="text-sm text-fg-muted">
                        <span className="font-mono">{r.code}</span> · earned {formatDate(shopDateOf(r.issued_at), "medium")}
                        {r.status === "issued" && r.expires_at && ` · expires ${formatDate(shopDateOf(r.expires_at), "medium")}`}
                        {r.redeemed_at && ` · used ${formatDate(shopDateOf(r.redeemed_at), "medium")}`}
                      </p>
                    </div>
                    <Badge tone={REWARD_TONES[r.status]}>{REWARD_LABELS[r.status]}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </TabPanel>
      )}

      {tab === "timeline" && (
        <TabPanel id="timeline" idPrefix="cust">
          <Card>
            {events.length === 0 ? (
              <EmptyState icon={History} title="Nothing yet" className="py-8" />
            ) : (
              <ol className="relative px-5 py-4">
                {events.map((e) => (
                  <li key={e.id} className="relative border-l-2 border-line pb-5 pl-5 last:pb-0">
                    <span className="absolute top-1.5 -left-[7px] size-3 rounded-full bg-line-strong ring-4 ring-panel" aria-hidden />
                    <p className="font-medium">
                      {e.booking_id ? (
                        <button type="button" onClick={() => panel.open(e.booking_id!)} className="text-left hover:underline">
                          {e.summary}
                        </button>
                      ) : e.invoice_id ? (
                        <Link href={`/invoices/${e.invoice_id}`} className="hover:underline">
                          {e.summary}
                        </Link>
                      ) : (
                        e.summary
                      )}
                    </p>
                    <p className="text-sm text-fg-muted">
                      {formatDateTime(e.created_at, "medium")}
                      {e.actor && ` · ${e.actor.name}`}
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </TabPanel>
      )}

      {tab === "messages" && (
        <TabPanel id="messages" idPrefix="cust">
          {!deleted && (
            <div className="mb-3 flex justify-end">
              <Button icon={Send} onClick={() => setMessageOpen(true)}>
                Send a message
              </Button>
            </div>
          )}
          <Card>
            {messages.length === 0 ? (
              <EmptyState icon={MessageSquare} title="No messages yet" className="py-8" />
            ) : (
              <ul className="divide-y divide-line">
                {messages.map((m) => {
                  const st = OUTBOX_STATUS[m.status as OutboxStatus] ?? { label: m.status, tone: "neutral" as const };
                  return (
                    <li key={m.id} className="px-5 py-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone="neutral">{m.channel === "sms" ? "SMS" : "Email"}</Badge>
                        <Badge tone={st.tone}>{st.label}</Badge>
                        <span className="text-sm text-fg-muted">{formatDateTime(m.created_at, "medium")}</span>
                      </div>
                      {m.subject && <p className="mt-2 font-semibold">{m.subject}</p>}
                      <p className="mt-1 text-sm whitespace-pre-line text-fg-muted">{m.body}</p>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </TabPanel>
      )}

      {isAdmin && !deleted && (
        <Card className="mt-10">
          <CardHeader title="Admin" description="Tidy up records" />
          <CardBody className="flex flex-wrap gap-2">
            <Button icon={Users} onClick={() => setMergeOpen(true)}>
              Merge a duplicate into this customer…
            </Button>
            <Button variant="ghost" icon={UserX} className="text-bad-ink" onClick={() => setAnonOpen(true)}>
              Delete personal details…
            </Button>
          </CardBody>
        </Card>
      )}

      <CustomerDialog key={editOpen ? `edit-${c.id}` : "closed"} open={editOpen} onClose={() => setEditOpen(false)} customer={c} />
      <VehicleDialog
        key={vehicleEdit === null ? "none" : vehicleEdit === "new" ? "new" : vehicleEdit.id}
        open={vehicleEdit !== null}
        onClose={() => setVehicleEdit(null)}
        customerId={c.id}
        vehicle={vehicleEdit === "new" ? null : vehicleEdit}
      />
      <MessageDialog key={messageOpen ? "msg-open" : "msg-closed"} open={messageOpen} onClose={() => setMessageOpen(false)} customer={c} />
      <MergeDialog key={mergeOpen ? "merge" : "closed"} open={mergeOpen} onClose={() => setMergeOpen(false)} keep={c} />
      <ConfirmDialog
        open={!!archive}
        onClose={() => setArchive(null)}
        onConfirm={doArchive}
        busy={busy === "archive"}
        tone="danger"
        title={`Remove ${archive?.rego ?? "this car"}?`}
        description="It's hidden from their profile and the till. Past visits keep it."
        confirmLabel="Remove car"
      />
      <ConfirmDialog
        open={anonOpen}
        onClose={() => setAnonOpen(false)}
        onConfirm={doAnonymise}
        busy={busy === "anon"}
        tone="danger"
        title={`Delete ${c.name}'s personal details?`}
        description="Name, mobile, email, notes and regos are wiped. Visits and invoices stay (without their details) so the books still add up. This can't be undone."
        confirmLabel="Delete details"
      >
        <Notice tone="warn" className={cn(!c.auth_user_id && "hidden")}>
          They have an online account. It&apos;s unlinked too.
        </Notice>
      </ConfirmDialog>
    </div>
  );
}
