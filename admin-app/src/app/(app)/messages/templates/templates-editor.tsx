"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Mail, MessageSquare, Pencil } from "lucide-react";
import { cn } from "@/lib/core/cn";
import { errorMessage } from "@/lib/core/errors";
import { formatDateTime } from "@/lib/core/time";
import { PLACEHOLDERS, renderTemplate, sampleVars, smsSegments, unknownPlaceholders } from "@/lib/messaging";
import type { TemplateRow } from "@/lib/shop/messages";
import { adminSave } from "@/lib/shop/admin";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Switch, Textarea } from "@/components/ui/field";
import { Notice } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";
import { useShop } from "@/components/shop-context";

// When each message goes out, in plain words.
const WHEN: Record<string, string> = {
  booking_received: "Straight after someone books online",
  booking_approved: "When you approve a booking",
  booking_declined: "When you decline a booking",
  reminder_24h: "The day before the booking",
  ready_for_pickup: "When a car is marked ready",
  receipt: "When you tap “Send receipt” on an invoice",
  payment_reminder: "When you tap “Remind” in Debtors",
  review_request: "A couple of hours after the job is done",
  loyalty_earned: "When a customer earns a loyalty reward",
  winback_60d: "When a regular hasn't been in for 60 days (off by default)",
};
const ORDER = Object.keys(WHEN);

export function TemplatesEditor({ templates }: { templates: TemplateRow[] }) {
  const { staff } = useShop();
  const [editing, setEditing] = useState<TemplateRow | null>(null);
  const keys = [...new Set(templates.map((t) => t.key))].sort((a, b) => (ORDER.indexOf(a) + 1 || 99) - (ORDER.indexOf(b) + 1 || 99));
  const isAdmin = staff.role === "admin";

  return (
    <div className="space-y-4">
      <p className="max-w-3xl text-fg-muted">
        The wording of every automatic text and email. Words in <code className="rounded bg-sunken px-1 font-mono text-sm">{"{{curly_brackets}}"}</code> are filled in for each customer. Texts are kept to one SMS (160 characters) where possible.
      </p>
      {keys.map((key) => {
        const group = templates.filter((t) => t.key === key);
        return (
          <Card key={key}>
            <CardHeader
              title={
                <span className="flex flex-wrap items-center gap-2">
                  {group[0].name}
                  {group[0].category === "marketing" && <Badge tone="violet">Marketing</Badge>}
                </span>
              }
              description={WHEN[key] ?? key}
            />
            <div className="grid divide-line @4xl:grid-cols-2 @4xl:divide-x">
              {(["sms", "email"] as const).map((ch) => {
                const t = group.find((g) => g.channel === ch);
                const Icon = ch === "sms" ? MessageSquare : Mail;
                if (!t)
                  return (
                    <div key={ch} className="flex items-center gap-2 border-t border-line px-5 py-4 text-sm text-fg-faint">
                      <Icon size={16} aria-hidden /> No {ch === "sms" ? "SMS" : "email"} version
                    </div>
                  );
                const seg = ch === "sms" ? smsSegments(renderTemplate(t.body, sampleVars())) : null;
                return (
                  <div key={ch} className={cn("flex gap-3 border-t border-line px-5 py-4", !t.active && "opacity-60")}>
                    <Icon size={18} aria-hidden className="mt-0.5 shrink-0 text-fg-faint" />
                    <div className="min-w-0 flex-1">
                      <p className="mb-1 flex flex-wrap items-center gap-2 text-sm font-semibold">
                        {ch === "sms" ? "SMS" : "Email"}
                        {!t.active && <Badge tone="neutral">Off</Badge>}
                        {seg && seg.segments > 1 && <Badge tone="warn">{seg.segments} SMS parts</Badge>}
                      </p>
                      {t.subject && <p className="truncate text-sm font-medium">{t.subject}</p>}
                      <p className="line-clamp-3 text-sm whitespace-pre-line text-fg-muted">{t.body}</p>
                    </div>
                    {isAdmin && <Button size="icon-sm" variant="ghost" icon={Pencil} aria-label={`Edit ${t.name} ${ch}`} onClick={() => setEditing(t)} />}
                  </div>
                );
              })}
            </div>
          </Card>
        );
      })}
      {!isAdmin && <Notice tone="info">Only an admin login can change the wording.</Notice>}
      <TemplateDialog key={editing?.id ?? "none"} template={editing} onClose={() => setEditing(null)} />
    </div>
  );
}

function TemplateDialog({ template, onClose }: { template: TemplateRow | null; onClose: () => void }) {
  const { supabase, settings } = useShop();
  const router = useRouter();
  const toast = useToast();
  const [subject, setSubject] = useState(template?.subject ?? "");
  const [body, setBody] = useState(template?.body ?? "");
  const [active, setActive] = useState(template?.active ?? true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);
  const isSms = template?.channel === "sms";
  const vars = sampleVars({ business_name: settings?.business_name ?? "OzShine Hand Car Wash", shop_phone: settings?.phone ?? "" });
  let preview = renderTemplate(body, vars);
  if (template?.category === "marketing") preview += isSms ? " Reply STOP to opt out." : "\n\nDon't want these emails? Reply \"unsubscribe\" and we'll take you off the list.";
  const seg = isSms ? smsSegments(preview) : null;
  const unknown = unknownPlaceholders(body + " " + subject);
  const valid = body.trim().length > 0 && body.length <= 1600 && (isSms || subject.trim().length > 0);
  const dirty = !!template && (body !== template.body || subject !== (template.subject ?? "") || active !== template.active);

  function insert(key: string) {
    const el = ref.current;
    const token = `{{${key}}}`;
    if (!el) return setBody((b) => b + token);
    const start = el.selectionStart ?? body.length;
    const end = el.selectionEnd ?? body.length;
    setBody(body.slice(0, start) + token + body.slice(end));
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + token.length, start + token.length);
    });
  }

  async function save() {
    if (!template || !valid) return;
    setBusy(true);
    setError(null);
    try {
      await adminSave(supabase, "message_templates", template.id, { subject: isSms ? null : subject.trim(), body: body.trim(), active });
      toast.success("Wording saved");
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
      open={!!template}
      onClose={onClose}
      dismissible={!busy && !dirty}
      size="lg"
      title={`${template?.name ?? ""} · ${isSms ? "SMS" : "Email"}`}
      description={template ? `${WHEN[template.key] ?? ""}. Last changed ${formatDateTime(template.updated_at, "medium")}.` : undefined}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" loading={busy} disabled={!valid || !dirty} onClick={save}>
            Save
          </Button>
        </>
      }
    >
      <div className="grid gap-5 pb-2 @container md:grid-cols-2">
        <div className="space-y-4">
          {error && <Notice tone="bad">{error}</Notice>}
          {!isSms && (
            <Field label="Subject line">
              <Input value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={150} />
            </Field>
          )}
          <Field label="Message" error={body.length > 1600 ? "Keep it under 1,600 characters" : null}>
            <Textarea ref={ref} rows={isSms ? 5 : 10} value={body} onChange={(e) => setBody(e.target.value)} />
          </Field>
          <div>
            <p className="mb-1.5 text-sm font-medium">Insert</p>
            <div className="flex flex-wrap gap-1.5">
              {PLACEHOLDERS.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => insert(p.key)}
                  className="h-9 rounded-lg bg-sunken px-2.5 text-xs font-semibold text-fg-muted ring-1 ring-line hover:text-fg focus-visible:outline-2 focus-visible:outline-focus"
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
          <Switch checked={active} onChange={setActive} label="Send this message" description={active ? undefined : "Turned off: this message won't be sent at all."} />
        </div>
        <div>
          <p className="mb-1.5 text-sm font-medium">Preview (example customer)</p>
          <div className={cn("rounded-2xl p-4 text-sm whitespace-pre-line ring-1 ring-line", isSms ? "bg-info/10" : "bg-sunken")}>
            {!isSms && <p className="mb-2 font-semibold">{renderTemplate(subject, vars)}</p>}
            {preview}
          </div>
          {seg && (
            <p className={cn("mt-2 text-sm", seg.segments > 1 ? "text-warn-ink" : "text-fg-muted")}>
              About {seg.length} characters · {seg.segments} SMS part{seg.segments === 1 ? "" : "s"}
              {seg.encoding === "UCS-2" && " · contains an emoji or special character, which shortens each SMS to 70 characters"}
            </p>
          )}
          {template?.category === "marketing" && <p className="mt-2 text-xs text-fg-muted">The opt-out line is added automatically to marketing messages.</p>}
          {unknown.length > 0 && (
            <Notice tone="warn" className="mt-3">
              {unknown.map((u) => `{{${u}}}`).join(", ")} isn&apos;t a known placeholder and will be left blank.
            </Notice>
          )}
        </div>
      </div>
    </Dialog>
  );
}
