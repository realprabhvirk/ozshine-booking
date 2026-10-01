"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Circle, Copy, KeyRound } from "lucide-react";
import { cn } from "@/lib/core/cn";
import { formatRelative } from "@/lib/core/time";
import { adminSave } from "@/lib/shop/admin";
import { generateCronKey } from "@/lib/shop/messages";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Notice } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";
import { useShop } from "@/components/shop-context";

function Check({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2.5">
      {ok ? <CheckCircle2 size={20} className="mt-0.5 shrink-0 text-ok-ink" aria-label="Done" /> : <Circle size={20} className="mt-0.5 shrink-0 text-fg-faint" aria-label="Not done" />}
      <span className={cn(!ok && "text-fg-muted")}>{children}</span>
    </li>
  );
}

const Code = ({ children }: { children: React.ReactNode }) => <code className="rounded bg-sunken px-1.5 py-0.5 font-mono text-[13px] ring-1 ring-line">{children}</code>;

export function SetupClient({
  settingsId,
  provider,
  keyGenerated,
  lastRun,
  env,
}: {
  settingsId: string;
  provider: "demo" | "live";
  keyGenerated: boolean;
  lastRun: string | null;
  env: { sms: boolean; email: boolean; cron: boolean };
}) {
  const { supabase, staff, serverNow } = useShop();
  const router = useRouter();
  const toast = useToast();
  const [key, setKey] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<"key" | "live" | null>(null);
  const [busy, setBusy] = useState(false);
  const isAdmin = staff.role === "admin";
  // Sending runs on the server with CRON_SECRET, so Live without it would
  // leave every message stuck in the queue.
  const hasProvider = env.sms || env.email;
  const canGoLive = hasProvider && keyGenerated && env.cron;

  async function makeKey() {
    setBusy(true);
    try {
      setKey(await generateCronKey(supabase));
      setConfirm(null);
      router.refresh();
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  }

  async function setMode(mode: "demo" | "live") {
    setBusy(true);
    try {
      await adminSave(supabase, "settings", settingsId, { message_provider: mode });
      toast.success(mode === "live" ? "Live: messages will really be sent" : "Back to demo mode");
      setConfirm(null);
      router.refresh();
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-6 @5xl:grid-cols-2">
      <Card>
        <CardHeader
          title="Sending mode"
          description="Whether customers really get texts and emails"
          action={<Badge tone={provider === "live" ? "ok" : "info"}>{provider === "live" ? "Live" : "Demo"}</Badge>}
        />
        <CardBody className="space-y-4">
          {provider === "demo" ? (
            <p>
              <b>Demo mode.</b> Every message is written to <i>Sent messages</i> and marked “Sent (demo)”, but nothing leaves the building. Safe for trying things out.
            </p>
          ) : (
            <p>
              <b>Live.</b> Messages go out within seconds through {[env.sms && "Twilio (SMS)", env.email && "Resend (email)"].filter(Boolean).join(" and ")}.
              {!env.sms && " Texts aren't set up, so they're still marked “Sent (demo)”."}
              {!env.email && " Emails aren't set up, so they're still marked “Sent (demo)”."}
            </p>
          )}
          <ul className="space-y-2 text-sm">
            <Check ok={env.sms}>
              SMS provider (Twilio): {env.sms ? "connected" : "not set up"}
            </Check>
            <Check ok={env.email}>
              Email provider (Resend): {env.email ? "connected" : "not set up"}
            </Check>
            <Check ok={keyGenerated && env.cron}>Sending key made and added to Vercel (see Daily job)</Check>
          </ul>
          {isAdmin &&
            (provider === "demo" ? (
              <Button variant="primary" disabled={!canGoLive || busy} onClick={() => setConfirm("live")}>
                Switch to live sending
              </Button>
            ) : (
              <Button loading={busy} onClick={() => setMode("demo")}>
                Back to demo mode
              </Button>
            ))}
          {!hasProvider && (
            <p className="text-sm text-fg-muted">
              Live sending needs an SMS or email provider account first. That&apos;s a separate sign-off (it costs money per message), so it&apos;s off for now.
            </p>
          )}
          {hasProvider && !canGoLive && (
            <p className="text-sm text-fg-muted">Make the key under Daily job and add it to Vercel first. The app uses it to send.</p>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Daily job" description="Needed for live sending. Also sends reminders and feedback requests when nobody has the app open" />
        <CardBody className="space-y-4">
          <ul className="space-y-2 text-sm">
            <Check ok={keyGenerated}>Key made here</Check>
            <Check ok={env.cron}>
              Key added to Vercel as <Code>CRON_SECRET</Code>
            </Check>
            <Check ok={!!lastRun}>{lastRun ? `Last check ${formatRelative(lastRun, new Date(serverNow))}` : "Hasn't run yet"}</Check>
          </ul>
          <p className="text-sm text-fg-muted">Until this is set up, reminders are still checked every hour while the staff app is open on any device.</p>

          {key ? (
            <div className="space-y-3 rounded-2xl bg-sunken p-4 ring-1 ring-line">
              <p className="text-sm font-semibold">Your new key. Copy it now, it won&apos;t be shown again:</p>
              <div className="flex items-center gap-2">
                <code className="min-w-0 flex-1 truncate rounded-lg bg-panel px-3 py-2 font-mono text-sm ring-1 ring-line">{key}</code>
                <Button
                  size="sm"
                  icon={Copy}
                  onClick={() => {
                    navigator.clipboard?.writeText(key).then(
                      () => toast.success("Copied"),
                      () => toast.error("Couldn't copy, select it and copy by hand"),
                    );
                  }}
                >
                  Copy
                </Button>
              </div>
              <ol className="list-decimal space-y-1 pl-5 text-sm">
                <li>
                  In Vercel, open the <b>staff app</b> project → Settings → Environment Variables.
                </li>
                <li>
                  Add <Code>CRON_SECRET</Code> with this key as the value (Production).
                </li>
                <li>Redeploy (Deployments → ⋯ → Redeploy). The job then runs every morning at 7am.</li>
              </ol>
            </div>
          ) : (
            isAdmin && (
              <Button icon={KeyRound} onClick={() => (keyGenerated ? setConfirm("key") : makeKey())} loading={busy && !confirm}>
                {keyGenerated ? "Make a new key" : "Make a key"}
              </Button>
            )
          )}
        </CardBody>
      </Card>

      {!isAdmin && <Notice tone="info">Only an admin login can change these.</Notice>}

      <ConfirmDialog
        open={confirm === "key"}
        onClose={() => setConfirm(null)}
        busy={busy}
        title="Make a new key?"
        description="The old key stops working straight away, so the daily job will fail until you put the new one into Vercel."
        confirmLabel="Make new key"
        onConfirm={makeKey}
      />
      <ConfirmDialog
        open={confirm === "live"}
        onClose={() => setConfirm(null)}
        busy={busy}
        tone="danger"
        title="Start sending real messages?"
        description="From now on, confirmations, reminders, receipts and campaigns go to customers' real phones and inboxes, and your provider charges per message."
        confirmLabel="Go live"
        onConfirm={() => setMode("live")}
      />
    </div>
  );
}
