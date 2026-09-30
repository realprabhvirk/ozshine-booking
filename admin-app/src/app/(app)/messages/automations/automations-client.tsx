"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Play } from "lucide-react";
import { cn } from "@/lib/core/cn";
import { formatRelative } from "@/lib/core/time";
import { runAutomations, saveAutomation, type AutomationRow, type AutomationRun } from "@/lib/shop/messages";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Switch } from "@/components/ui/field";
import { Notice } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";
import { useShop } from "@/components/shop-context";

const INFO: Record<string, { what: string; config?: { key: string; label: string; unit: string; min: number; max: number } }> = {
  booking_confirmations: { what: "Texts/emails the customer when they book online, and when you approve or decline it." },
  reminder_24h: { what: "Reminds the customer the day before their booking.", config: { key: "window_hours", label: "Look ahead", unit: "hours", min: 12, max: 72 } },
  ready_for_pickup: { what: "Lets the customer know when you mark their car Ready." },
  review_request: { what: "Asks how their visit went, with a 10-second rating link. Low scores come to you privately first.", config: { key: "delay_hours", label: "Send after", unit: "hours", min: 1, max: 48 } },
  loyalty_earned: { what: "Tells the customer when they've earned a loyalty reward." },
  winback_60d: { what: "A friendly nudge to regulars who haven't been in for a while. Marketing: only goes to customers who've opted in.", config: { key: "days", label: "After", unit: "days", min: 21, max: 365 } },
};
const ORDER = Object.keys(INFO);

export function AutomationsClient({ automations }: { automations: AutomationRow[] }) {
  const { supabase, staff, serverNow } = useShop();
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<AutomationRun | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const isAdmin = staff.role === "admin";
  const rows = [...automations].sort((a, b) => (ORDER.indexOf(a.key) + 1 || 99) - (ORDER.indexOf(b.key) + 1 || 99));

  async function toggle(a: AutomationRow, enabled: boolean) {
    setBusy(a.key);
    try {
      await saveAutomation(supabase, a.key, enabled, null);
      toast.success(`${a.name}: ${enabled ? "on" : "off"}`);
      router.refresh();
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(null);
    }
  }

  async function saveConfig(a: AutomationRow, key: string, value: number) {
    setBusy(`${a.key}-cfg`);
    try {
      await saveAutomation(supabase, a.key, null, { [key]: value });
      toast.success("Saved");
      setDraft((d) => ({ ...d, [a.key]: "" }));
      router.refresh();
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(null);
    }
  }

  async function runNow() {
    setBusy("run");
    try {
      setResult(await runAutomations(supabase));
      router.refresh();
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-fg-muted">
          These run by themselves. Reminders and feedback requests are checked every hour while the staff app is open, and once a day from Vercel if it&apos;s{" "}
          <Link href="/messages/setup" className="font-semibold text-accent-ink hover:underline">
            set up
          </Link>
          . Nobody is ever sent the same message twice.
        </p>
        <Button icon={Play} loading={busy === "run"} onClick={runNow}>
          Check now
        </Button>
      </div>

      {result && (
        <Notice tone="ok" title="Checked just now">
          {[
            `${result.reminders} reminder${result.reminders === 1 ? "" : "s"}`,
            `${result.review_requests} feedback request${result.review_requests === 1 ? "" : "s"}`,
            `${result.winbacks} “we miss you”`,
            result.rewards_expired ? `${result.rewards_expired} reward${result.rewards_expired === 1 ? "" : "s"} expired` : null,
          ]
            .filter(Boolean)
            .join(" · ")}{" "}
          queued.
        </Notice>
      )}

      <Card>
        <ul className="divide-y divide-line">
          {rows.map((a) => {
            const info = INFO[a.key];
            const cfg = info?.config;
            const current = cfg ? Number(a.config[cfg.key] ?? "") : null;
            const d = draft[a.key] ?? "";
            const n = Number(d);
            const valid = cfg && d !== "" && Number.isInteger(n) && n >= cfg.min && n <= cfg.max && n !== current;
            return (
              <li key={a.key} className={cn("flex flex-wrap items-center gap-4 px-5 py-4", !a.enabled && "opacity-70")}>
                <div className="min-w-60 flex-1">
                  <p className="font-semibold">{a.name}</p>
                  <p className="text-sm text-fg-muted">{info?.what}</p>
                  {a.last_run_at && ["reminder_24h", "review_request", "winback_60d"].includes(a.key) && (
                    <p className="mt-1 text-xs text-fg-faint">
                      Last checked {formatRelative(a.last_run_at, new Date(serverNow))} · {a.last_run_count} queued
                    </p>
                  )}
                </div>
                {cfg && (
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-fg-muted">{cfg.label}</span>
                    <div className="w-20">
                      <Input
                        type="number"
                        inputMode="numeric"
                        min={cfg.min}
                        max={cfg.max}
                        aria-label={`${cfg.label} (${cfg.unit})`}
                        value={d === "" ? String(current ?? "") : d}
                        disabled={!isAdmin}
                        onChange={(e) => setDraft((x) => ({ ...x, [a.key]: e.target.value }))}
                      />
                    </div>
                    <span className="text-sm text-fg-muted">{cfg.unit}</span>
                    {valid && (
                      <Button size="sm" variant="primary" loading={busy === `${a.key}-cfg`} onClick={() => saveConfig(a, cfg.key, n)}>
                        Save
                      </Button>
                    )}
                  </div>
                )}
                <Switch checked={a.enabled} disabled={!isAdmin || busy === a.key} onChange={(v) => toggle(a, v)} label={<span className="sr-only">{a.name} on</span>} />
              </li>
            );
          })}
        </ul>
      </Card>
      {!isAdmin && <Notice tone="info">Only an admin login can switch these on or off.</Notice>}
    </div>
  );
}
