"use client";

import { useState } from "react";
import { Mail, MessageSquare } from "lucide-react";
import { cn } from "@/lib/core/cn";
import { errorMessage } from "@/lib/core/errors";
import { formatPhone } from "@/lib/core/phone";
import { smsSegments, type Channel } from "@/lib/messaging";
import { sendOneOff } from "@/lib/shop/messages";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Notice } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";
import { useShop } from "@/components/shop-context";

// A one-off text or email to one customer (e.g. "running 20 min late").
export function MessageDialog({
  open,
  onClose,
  customer,
}: {
  open: boolean;
  onClose: () => void;
  customer: { id: string; name: string; phone: string | null; email: string | null };
}) {
  const { supabase, settings } = useShop();
  const toast = useToast();
  const [channel, setChannel] = useState<Channel>(customer.phone ? "sms" : "email");
  const [subject, setSubject] = useState("A message from OzShine");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const to = channel === "sms" ? customer.phone : customer.email;
  const seg = channel === "sms" ? smsSegments(body) : null;
  const valid = !!to && body.trim().length > 0 && body.length <= 1600 && (channel === "sms" || subject.trim().length > 0);
  const live = settings?.message_provider === "live";

  async function send() {
    if (!valid) return;
    setBusy(true);
    setError(null);
    try {
      await sendOneOff(supabase, customer.id, channel, channel === "email" ? subject.trim() : null, body.trim());
      toast.success(live ? "Message sent" : "Message recorded (demo)", live ? undefined : "Nothing really went out.");
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
      dismissible={!busy && !body}
      title={`Message ${customer.name}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" loading={busy} disabled={!valid} onClick={send}>
            Send
          </Button>
        </>
      }
    >
      <div className="space-y-4 pb-2">
        {error && <Notice tone="bad">{error}</Notice>}
        <div role="radiogroup" aria-label="Send as" className="grid grid-cols-2 gap-2">
          {(["sms", "email"] as const).map((c) => {
            const addr = c === "sms" ? customer.phone : customer.email;
            return (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={channel === c}
                disabled={!addr}
                onClick={() => setChannel(c)}
                className={cn(
                  "flex min-h-14 flex-col items-center justify-center rounded-xl px-2 py-2 ring-1 transition focus-visible:outline-2 focus-visible:outline-focus disabled:opacity-40",
                  channel === c ? "bg-accent text-accent-fg ring-accent" : "bg-panel ring-line enabled:hover:ring-line-strong",
                )}
              >
                <span className="flex items-center gap-2 font-semibold">
                  {c === "sms" ? <MessageSquare size={18} aria-hidden /> : <Mail size={18} aria-hidden />}
                  {c === "sms" ? "SMS" : "Email"}
                </span>
                <span className={cn("max-w-full truncate text-xs", channel === c ? "text-accent-fg/80" : "text-fg-muted")}>
                  {addr ? (c === "sms" ? formatPhone(addr) : addr) : "not on file"}
                </span>
              </button>
            );
          })}
        </div>
        {channel === "email" && (
          <Field label="Subject">
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={150} />
          </Field>
        )}
        <Field label="Message" error={body.length > 1600 ? "Keep it under 1,600 characters" : null} hint={seg && body ? `${seg.length} characters · ${seg.segments} SMS part${seg.segments === 1 ? "" : "s"}` : undefined}>
          <Textarea rows={5} value={body} onChange={(e) => setBody(e.target.value)} placeholder={channel === "sms" ? "Hi, just letting you know we're running about 20 minutes behind today." : ""} autoFocus />
        </Field>
        {!live && <p className="text-sm text-fg-muted">Demo mode: it&apos;ll show under Messages but won&apos;t really be sent.</p>}
      </div>
    </Dialog>
  );
}
