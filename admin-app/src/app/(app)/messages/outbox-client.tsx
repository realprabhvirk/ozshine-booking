"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown, Mail, MessageSquare, RefreshCw, RotateCcw, Search } from "lucide-react";
import { cn } from "@/lib/core/cn";
import { formatDateTime } from "@/lib/core/time";
import { formatPhone } from "@/lib/core/phone";
import { outboxBadge, smsSegments, type OutboxStatus } from "@/lib/messaging";
import { OUTBOX_PAGE, retryMessage, type OutboxFilter, type OutboxRow } from "@/lib/shop/messages";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/field";
import { EmptyState, Notice } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";
import { useShop } from "@/components/shop-context";

const TILES: Array<{ key: OutboxStatus | "skipped"; label: string; statuses: OutboxStatus[] }> = [
  { key: "simulated_sent", label: "Sent (demo)", statuses: ["simulated_sent"] },
  { key: "sent", label: "Sent for real", statuses: ["sent"] },
  { key: "queued", label: "Waiting", statuses: ["queued"] },
  { key: "failed", label: "Failed", statuses: ["failed"] },
  { key: "skipped", label: "Skipped", statuses: ["skipped_opt_out", "skipped_no_contact"] },
];

export function OutboxClient({
  filter,
  rows,
  total,
  stats,
  live,
}: {
  filter: OutboxFilter;
  rows: OutboxRow[];
  total: number | null;
  stats: Record<OutboxStatus, number>;
  live: boolean;
}) {
  const { supabase } = useShop();
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const page = filter.page ?? 0;

  const href = (patch: Partial<OutboxFilter>) => {
    const next = { ...filter, page: 0, ...patch };
    const p = new URLSearchParams();
    if (next.status) p.set("status", next.status);
    if (next.channel) p.set("channel", next.channel);
    if (next.q) p.set("q", next.q);
    if (next.page) p.set("page", String(next.page));
    const s = p.toString();
    return s ? `/messages?${s}` : "/messages";
  };

  async function retry(id: string) {
    setBusy(id);
    try {
      await retryMessage(supabase, id);
      toast.success(live ? "Queued to send again" : "Re-sent (demo)");
      router.refresh();
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-5">
      {!live && (
        <Notice tone="info" title="Demo mode">
          Nothing is really sent. Every text and email is written here and marked “Sent (demo)”, so you can see exactly what customers would get.{" "}
          <Link href="/messages/setup" className="font-semibold underline">
            Setup
          </Link>
        </Notice>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 @4xl:grid-cols-5">
        {TILES.map((t) => {
          const n = t.statuses.reduce((a, s) => a + (stats[s] ?? 0), 0);
          const on = filter.status === t.key;
          return (
            <Link
              key={t.key}
              href={href({ status: on ? "" : t.key })}
              aria-current={on ? "true" : undefined}
              className={cn(
                "rounded-2xl bg-panel p-4 ring-1 ring-line transition hover:ring-line-strong focus-visible:outline-2 focus-visible:outline-focus",
                on && "ring-2 ring-accent",
              )}
            >
              <p className="text-sm font-medium text-fg-muted">{live && t.key === "simulated_sent" ? "Not sent (demo / SMS off)" : t.label}</p>
              <p className={cn("mt-1 text-2xl font-bold tabular-nums", t.key === "failed" && n > 0 && "text-bad-ink")}>{n.toLocaleString("en-AU")}</p>
              <p className="text-xs text-fg-faint">last 30 days</p>
            </Link>
          );
        })}
      </div>

      <form method="get" action="/messages" className="flex flex-wrap items-center gap-2">
        {filter.status && <input type="hidden" name="status" value={filter.status} />}
        <div className="relative min-w-60 flex-1">
          <Search size={18} aria-hidden className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-fg-faint" />
          <Input name="q" defaultValue={filter.q} placeholder="Search number, email or wording" aria-label="Search messages" className="pl-10" />
        </div>
        <div className="w-40">
          <Select name="channel" defaultValue={filter.channel} aria-label="Channel">
            <option value="">SMS + email</option>
            <option value="sms">SMS only</option>
            <option value="email">Email only</option>
          </Select>
        </div>
        <Button type="submit">Search</Button>
        <Button type="button" variant="ghost" icon={RefreshCw} onClick={() => router.refresh()}>
          Refresh
        </Button>
      </form>

      <Card>
        {rows.length === 0 ? (
          <EmptyState icon={MessageSquare} title="No messages" description={filter.q || filter.status || filter.channel ? "Nothing matches those filters." : "Confirmations, reminders and receipts will show up here."} className="py-10" />
        ) : (
          <ul className="divide-y divide-line">
            {rows.map((m) => {
              const st = outboxBadge(m.status, m.provider);
              const isOpen = open === m.id;
              const seg = m.channel === "sms" ? smsSegments(m.body) : null;
              return (
                <li key={m.id}>
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    onClick={() => setOpen(isOpen ? null : m.id)}
                    className="flex min-h-16 w-full items-center gap-3 px-5 py-3 text-left transition hover:bg-sunken focus-visible:outline-2 focus-visible:outline-focus"
                  >
                    {m.channel === "sms" ? <MessageSquare size={18} className="shrink-0 text-fg-faint" aria-label="SMS" /> : <Mail size={18} className="shrink-0 text-fg-faint" aria-label="Email" />}
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-x-2">
                        <span className="font-semibold">{m.customer?.name ?? "—"}</span>
                        <span className="text-sm text-fg-muted">{m.to_address ? (m.channel === "sms" ? formatPhone(m.to_address) : m.to_address) : "no contact"}</span>
                      </span>
                      <span className="block truncate text-sm text-fg-muted">{m.subject ?? m.body}</span>
                    </span>
                    <span className="hidden shrink-0 text-sm text-fg-muted sm:block">{formatDateTime(m.created_at)}</span>
                    <Badge tone={st.tone}>{st.label}</Badge>
                    <ChevronDown size={18} aria-hidden className={cn("shrink-0 text-fg-faint transition", isOpen && "rotate-180")} />
                  </button>
                  {isOpen && (
                    <div className="space-y-3 bg-sunken/60 px-5 pt-2 pb-4 sm:pl-12">
                      {m.subject && <p className="font-semibold">{m.subject}</p>}
                      <p className="max-w-2xl rounded-xl bg-panel px-4 py-3 text-sm whitespace-pre-line ring-1 ring-line">{m.body}</p>
                      <p className="text-xs text-fg-muted">
                        {[
                          m.template_key ? `Type: ${m.template_key.replaceAll("_", " ")}` : "One-off",
                          m.campaign ? `Campaign: ${m.campaign.name}` : null,
                          seg ? `${seg.length} characters · ${seg.segments} SMS part${seg.segments === 1 ? "" : "s"}` : null,
                          m.sent_at ? `Sent ${formatDateTime(m.sent_at)}` : m.status === "queued" ? `Due ${formatDateTime(m.scheduled_for)}` : null,
                          m.provider && !["demo", "sms_off", "email_off"].includes(m.provider) ? `via ${m.provider}` : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                      {m.error && <Notice tone="bad">{m.error}</Notice>}
                      <div className="flex flex-wrap gap-2">
                        {m.status === "failed" && (
                          <Button size="sm" variant="primary" icon={RotateCcw} loading={busy === m.id} onClick={() => retry(m.id)}>
                            Try again
                          </Button>
                        )}
                        {m.customer && (
                          <Link href={`/customers/${m.customer.id}`} className="inline-flex h-10 items-center text-sm font-semibold text-accent-ink hover:underline">
                            Open customer
                          </Link>
                        )}
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {(page > 0 || rows.length === OUTBOX_PAGE) && (
        <div className="flex items-center justify-between gap-3 text-sm">
          <p className="text-fg-muted">
            Showing {page * OUTBOX_PAGE + 1}–{page * OUTBOX_PAGE + rows.length}
            {total !== null && total > rows.length ? ` of about ${total.toLocaleString("en-AU")}` : ""}
          </p>
          <div className="flex gap-4">
            {page > 0 && (
              <Link href={href({ page: page - 1 })} className="font-semibold text-accent-ink hover:underline">
                ← Newer
              </Link>
            )}
            {rows.length === OUTBOX_PAGE && (
              <Link href={href({ page: page + 1 })} className="font-semibold text-accent-ink hover:underline">
                Older →
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
