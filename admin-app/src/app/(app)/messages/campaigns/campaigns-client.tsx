"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Mail, Megaphone, MessageSquare, Plus, Users } from "lucide-react";
import { cn } from "@/lib/core/cn";
import { errorMessage } from "@/lib/core/errors";
import { formatDateTime } from "@/lib/core/time";
import { cleanSegment, describeSegment, renderTemplate, smsSegments, type Channel, type OutboxStatus, type Segment } from "@/lib/messaging";
import { previewSegment, sendCampaign, type CampaignRow, type SegmentPreview } from "@/lib/shop/messages";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmDialog, Dialog } from "@/components/ui/dialog";
import { Field, Input, Select, Switch, Textarea } from "@/components/ui/field";
import { EmptyState, Notice, Spinner } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";
import { useShop } from "@/components/shop-context";

// What a campaign message can personalise (see enqueue_raw in the SQL).
const CAMPAIGN_FIELDS = [
  { key: "first_name", label: "First name", sample: "Jess" },
  { key: "referral_code", label: "Their referral code", sample: "K7Q2PX" },
  { key: "business_name", label: "Business name", sample: "OzShine Hand Car Wash" },
  { key: "shop_phone", label: "Shop phone", sample: "0449 558 449" },
];

const STARTERS: Array<{ label: string; name: string; segment: Segment; sms: string; email: { subject: string; body: string } }> = [
  {
    label: "We miss you",
    name: "We miss you",
    segment: { min_visits: 2, lapsed_days: 60 },
    sms: "Hi {{first_name}}, it's been a while! Your car's due for a shine at OzShine Beenleigh. Book online anytime.",
    email: { subject: "Your car's due for a shine, {{first_name}}", body: "Hi {{first_name}},\n\nIt's been a little while since we saw you. Book a wash online whenever suits and we'll bring the shine back.\n\nThe OzShine team" },
  },
  {
    label: "Use your reward",
    name: "Unused rewards reminder",
    segment: { has_unused_reward: true },
    sms: "Hi {{first_name}}, you've got an OzShine reward waiting! Book your next wash and we'll apply it.",
    email: { subject: "Your OzShine reward is waiting", body: "Hi {{first_name}},\n\nYou've earned a reward with us and haven't used it yet. Book your next visit and we'll apply it automatically.\n\nThe OzShine team" },
  },
  {
    label: "Refer a mate",
    name: "Refer a mate",
    segment: { min_visits: 3 },
    sms: "Thanks for being a regular, {{first_name}}! Give your mates code {{referral_code}} and you'll get $10 off when they come in.",
    email: { subject: "Share OzShine, get $10 off", body: "Hi {{first_name}},\n\nThanks for being a regular. Give your friends your code {{referral_code}} when they book, and we'll take $10 off your next visit once they've been in.\n\nThe OzShine team" },
  },
];

export function CampaignsClient({ campaigns, tags, live }: { campaigns: CampaignRow[]; tags: string[]; live: boolean }) {
  const { staff } = useShop();
  const [composing, setComposing] = useState(false);
  const [n, setN] = useState(0);
  const isAdmin = staff.role === "admin";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-fg-muted">
          One-off texts or emails to a group of customers. They only go to people who&apos;ve agreed to marketing, and every one includes an opt-out.
        </p>
        {isAdmin && (
          <Button
            variant="primary"
            icon={Plus}
            onClick={() => {
              setN((x) => x + 1);
              setComposing(true);
            }}
          >
            New campaign
          </Button>
        )}
      </div>
      {!isAdmin && <Notice tone="info">Only an admin login can send campaigns.</Notice>}

      <Card>
        {campaigns.length === 0 ? (
          <EmptyState icon={Megaphone} title="No campaigns yet" description="Try “We miss you” for regulars who haven't been in for a while." className="py-10" />
        ) : (
          <ul className="divide-y divide-line">
            {campaigns.map((c) => {
              const stats = c.stats ?? {};
              const delivered = (stats.sent ?? 0) + (stats.simulated_sent ?? 0) + (stats.queued ?? 0);
              const skipped = (stats.skipped_opt_out ?? 0) + (stats.skipped_no_contact ?? 0);
              return (
                <li key={c.id} className="flex flex-wrap items-start gap-3 px-5 py-4">
                  {c.channel === "sms" ? <MessageSquare size={18} className="mt-1 text-fg-faint" aria-label="SMS" /> : <Mail size={18} className="mt-1 text-fg-faint" aria-label="Email" />}
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{c.name}</p>
                    <p className="text-sm text-fg-muted">
                      {describeSegment(c.segment ?? {})} · {c.sent_at ? formatDateTime(c.sent_at, "medium") : "not sent"}
                      {c.created_by && ` · ${c.created_by.name}`}
                    </p>
                    <p className="mt-1 line-clamp-2 text-sm text-fg-muted">{c.subject ? `${c.subject} — ` : ""}{c.body}</p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <Badge tone={stats.simulated_sent ? "info" : "ok"}>
                      {delivered} {stats.simulated_sent ? "sent (demo)" : "sent"}
                    </Badge>
                    {skipped > 0 && <Badge tone="warn">{skipped} skipped</Badge>}
                    {(stats.failed ?? 0) > 0 && <Badge tone="bad">{stats.failed} failed</Badge>}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Composer key={n} open={composing} onClose={() => setComposing(false)} tags={tags} live={live} />
    </div>
  );
}

function Composer({ open, onClose, tags, live }: { open: boolean; onClose: () => void; tags: string[]; live: boolean }) {
  const { supabase } = useShop();
  const router = useRouter();
  const toast = useToast();
  const [name, setName] = useState("");
  const [channel, setChannel] = useState<Channel>("sms");
  const [seg, setSeg] = useState<Segment>({});
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [preview, setPreview] = useState<SegmentPreview | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLTextAreaElement>(null);
  const clean = cleanSegment(seg);
  const segKey = JSON.stringify({ ...clean, channel });

  // Live audience count, debounced.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const t = window.setTimeout(async () => {
      setPreviewing(true);
      try {
        const p = await previewSegment(supabase, JSON.parse(segKey));
        if (!cancelled) setPreview(p);
      } catch {
        if (!cancelled) setPreview(null);
      } finally {
        if (!cancelled) setPreviewing(false);
      }
    }, 350);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [open, segKey, supabase]);

  const sample = Object.fromEntries(CAMPAIGN_FIELDS.map((f) => [f.key, f.sample]));
  const rendered = renderTemplate(body, sample) + (channel === "sms" ? " Reply STOP to opt out." : "\n\nDon't want these emails? Reply \"unsubscribe\" and we'll take you off the list.");
  const sms = channel === "sms" ? smsSegments(rendered) : null;
  const count = preview?.count ?? 0;
  const valid = name.trim().length > 1 && body.trim().length > 0 && body.length <= 1500 && (channel === "sms" || subject.trim().length > 0) && count > 0;
  const num = (v: string) => (v === "" ? undefined : Math.max(0, Math.floor(Number(v))));

  function starter(s: (typeof STARTERS)[number]) {
    setName(s.name);
    setSeg(s.segment);
    if (channel === "sms") setBody(s.sms);
    else {
      setSubject(s.email.subject);
      setBody(s.email.body);
    }
  }

  function insert(key: string) {
    const el = ref.current;
    const token = `{{${key}}}`;
    const start = el?.selectionStart ?? body.length;
    const end = el?.selectionEnd ?? body.length;
    setBody(body.slice(0, start) + token + body.slice(end));
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + token.length, start + token.length);
    });
  }

  async function send() {
    setBusy(true);
    setError(null);
    try {
      const r = await sendCampaign(supabase, { name: name.trim(), channel, subject: channel === "email" ? subject.trim() : null, body: body.trim(), segment: clean });
      const s = r.stats as Partial<Record<OutboxStatus, number>>;
      const done = (s.sent ?? 0) + (s.simulated_sent ?? 0) + (s.queued ?? 0);
      toast.success(`Campaign sent to ${done} customer${done === 1 ? "" : "s"}`, live ? undefined : "Demo mode: nothing really went out.");
      setConfirm(false);
      onClose();
      router.refresh();
    } catch (e) {
      setError(errorMessage(e));
      setConfirm(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Dialog
        open={open}
        onClose={onClose}
        dismissible={!busy}
        size="lg"
        title="New campaign"
        footer={
          <>
            <Button variant="ghost" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button variant="primary" icon={Megaphone} disabled={!valid || previewing} onClick={() => setConfirm(true)}>
              {count > 0 ? `Send to ${count}` : "Send"}
            </Button>
          </>
        }
      >
        <div className="grid gap-6 pb-2 md:grid-cols-2">
          <div className="space-y-4">
            {error && <Notice tone="bad">{error}</Notice>}
            <div>
              <p className="mb-1.5 text-sm font-medium">Start from</p>
              <div className="flex flex-wrap gap-1.5">
                {STARTERS.map((s) => (
                  <Button key={s.label} size="sm" onClick={() => starter(s)}>
                    {s.label}
                  </Button>
                ))}
              </div>
            </div>
            <Field label="Campaign name" hint="Just for you, customers don't see it">
              <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} placeholder="e.g. Spring win-back" />
            </Field>
            <div role="radiogroup" aria-label="Send as" className="grid grid-cols-2 gap-2">
              {(["sms", "email"] as const).map((c) => (
                <button
                  key={c}
                  type="button"
                  role="radio"
                  aria-checked={channel === c}
                  onClick={() => setChannel(c)}
                  className={cn(
                    "flex h-12 items-center justify-center gap-2 rounded-xl font-semibold ring-1 transition focus-visible:outline-2 focus-visible:outline-focus",
                    channel === c ? "bg-accent text-accent-fg ring-accent" : "bg-panel ring-line hover:ring-line-strong",
                  )}
                >
                  {c === "sms" ? <MessageSquare size={18} aria-hidden /> : <Mail size={18} aria-hidden />}
                  {c === "sms" ? "SMS" : "Email"}
                </button>
              ))}
            </div>
            {channel === "email" && (
              <Field label="Subject">
                <Input value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={150} />
              </Field>
            )}
            <Field label="Message" error={body.length > 1500 ? "Too long" : null}>
              <Textarea ref={ref} rows={channel === "sms" ? 4 : 8} value={body} onChange={(e) => setBody(e.target.value)} />
            </Field>
            <div className="flex flex-wrap gap-1.5">
              {CAMPAIGN_FIELDS.map((f) => (
                <button key={f.key} type="button" onClick={() => insert(f.key)} className="h-9 rounded-lg bg-sunken px-2.5 text-xs font-semibold text-fg-muted ring-1 ring-line hover:text-fg">
                  + {f.label}
                </button>
              ))}
            </div>
            {body.trim() && (
              <div>
                <p className="mb-1.5 text-sm font-medium">Preview</p>
                <div className={cn("rounded-2xl p-4 text-sm whitespace-pre-line ring-1 ring-line", channel === "sms" ? "bg-info/10" : "bg-sunken")}>
                  {channel === "email" && <p className="mb-2 font-semibold">{renderTemplate(subject, sample)}</p>}
                  {rendered}
                </div>
                {sms && (
                  <p className={cn("mt-1.5 text-sm", sms.segments > 1 ? "text-warn-ink" : "text-fg-muted")}>
                    {sms.length} characters · {sms.segments} SMS part{sms.segments === 1 ? "" : "s"} each
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="space-y-4">
            <p className="text-sm font-semibold">Who gets it</p>
            <Switch checked={!!seg.vip_only} onChange={(v) => setSeg((s) => ({ ...s, vip_only: v }))} label="VIPs only" />
            <Switch checked={!!seg.has_unused_reward} onChange={(v) => setSeg((s) => ({ ...s, has_unused_reward: v }))} label="Has an unused reward" />
            <Switch checked={!!seg.owes_money} onChange={(v) => setSeg((s) => ({ ...s, owes_money: v }))} label="Owes money" />
            <div className="grid grid-cols-2 gap-3">
              <Field label="Min. visits">
                <Input type="number" min={0} inputMode="numeric" value={seg.min_visits ?? ""} onChange={(e) => setSeg((s) => ({ ...s, min_visits: num(e.target.value) }))} />
              </Field>
              <Field label="Not seen in">
                <Select value={String(seg.lapsed_days ?? "")} onChange={(e) => setSeg((s) => ({ ...s, lapsed_days: num(e.target.value) }))}>
                  <option value="">Any time</option>
                  <option value="30">30+ days</option>
                  <option value="60">60+ days</option>
                  <option value="90">90+ days</option>
                  <option value="180">6+ months</option>
                  <option value="365">A year+</option>
                </Select>
              </Field>
            </div>
            {tags.length > 0 && (
              <Field label="Tag">
                <Select value={seg.tag ?? ""} onChange={(e) => setSeg((s) => ({ ...s, tag: e.target.value || undefined }))}>
                  <option value="">Any</option>
                  {tags.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
            <div className="rounded-2xl bg-sunken p-4 ring-1 ring-line" aria-live="polite">
              <p className="flex items-center gap-2 font-semibold">
                <Users size={18} aria-hidden />
                {previewing ? <Spinner size={16} /> : `${count.toLocaleString("en-AU")} customer${count === 1 ? "" : "s"}`}
              </p>
              <p className="text-sm text-fg-muted">
                {Object.keys(clean).length ? `${describeSegment(clean)}, opted in` : "Everyone who's opted in"}, with {channel === "sms" ? "a mobile" : "an email"}
              </p>
              {preview && preview.sample.length > 0 && (
                <p className="mt-2 text-sm text-fg-muted">
                  e.g. {preview.sample.slice(0, 5).map((s) => s.name).join(", ")}
                  {count > 5 ? "…" : ""}
                </p>
              )}
            </div>
            {!live && <Notice tone="info">Demo mode: messages are recorded but nothing is really sent.</Notice>}
          </div>
        </div>
      </Dialog>
      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        busy={busy}
        title={`Send “${name.trim()}” to ${count} customer${count === 1 ? "" : "s"}?`}
        description={live ? `This sends ${count} real ${channel === "sms" ? "texts" : "emails"} straight away. It can't be undone.` : "Demo mode: they'll be recorded as sent, but nothing really goes out."}
        confirmLabel="Send now"
        onConfirm={send}
      />
    </>
  );
}

