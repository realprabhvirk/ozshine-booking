"use client";

import { useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { Copy, ExternalLink, Plus, RefreshCw, Trash2, Tv } from "lucide-react";
import { adminSave, regenerateDisplayKey } from "@/lib/shop/admin";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { useShop } from "@/components/shop-context";
import { SaveBar } from "../save-bar";

const noop = () => () => {};

export function TvSettings({ settingsId, displayKey, messages }: { settingsId: string; displayKey: string; messages: string[] }) {
  const { supabase } = useShop();
  const router = useRouter();
  const toast = useToast();
  const origin = useSyncExternalStore(noop, () => window.location.origin, () => "");
  const link = `${origin}/display/${displayKey}`;
  const [lines, setLines] = useState<string[]>(messages.length ? messages : [""]);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const clean = lines.map((l) => l.trim()).filter(Boolean);
  const dirty = JSON.stringify(clean) !== JSON.stringify(messages);

  async function save() {
    setBusy("save");
    try {
      await adminSave(supabase, "settings", settingsId, { display_messages: clean });
      toast.success("Messages saved", "The TV picks them up within 15 seconds.");
      router.refresh();
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(null);
    }
  }

  async function newKey() {
    setBusy("key");
    try {
      await regenerateDisplayKey(supabase);
      setConfirm(false);
      toast.success("New TV link made", "Open it on the TV again.");
      router.refresh();
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="grid gap-6 @5xl:grid-cols-2">
      <Card>
        <CardHeader title="Shop TV" description="A big-screen board for the waiting area: cars being washed, cars ready to collect and who's next" />
        <CardBody className="space-y-4">
          <ol className="list-decimal space-y-1 pl-5 text-[15px]">
            <li>Open the link below in the TV&apos;s web browser (or a laptop plugged into it).</li>
            <li>Make it full screen. It updates by itself every 15 seconds.</li>
          </ol>
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-lg bg-sunken px-3 py-2.5 font-mono text-sm ring-1 ring-line">{origin ? link : "…"}</code>
            <Button
              size="sm"
              icon={Copy}
              onClick={() =>
                navigator.clipboard?.writeText(link).then(
                  () => toast.success("Link copied"),
                  () => toast.error("Couldn't copy, select it and copy by hand"),
                )
              }
            >
              Copy
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            <a href={`/display/${displayKey}`} target="_blank" rel="noreferrer" className="inline-flex h-11 items-center gap-2 rounded-xl bg-accent px-4 font-semibold text-accent-fg">
              <Tv size={18} aria-hidden /> Open the TV screen <ExternalLink size={14} aria-hidden />
            </a>
            <Button variant="ghost" icon={RefreshCw} onClick={() => setConfirm(true)}>
              Make a new link
            </Button>
          </div>
          <p className="text-sm text-fg-muted">
            Customers only ever see first names and the first 3 characters of a rego. Anyone with the link can view the board, so make a new link if it gets shared.
          </p>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Rolling messages" description="Shown along the bottom of the TV, one at a time" />
        <CardBody className="space-y-2">
          {lines.map((l, i) => (
            <div key={i} className="flex gap-2">
              <Input
                aria-label={`Message ${i + 1}`}
                value={l}
                maxLength={120}
                placeholder="e.g. Ask about our ceramic coating: 12 months' protection"
                onChange={(e) => setLines((ls) => ls.map((x, j) => (j === i ? e.target.value : x)))}
              />
              <Button size="icon-sm" variant="ghost" icon={Trash2} aria-label={`Remove message ${i + 1}`} onClick={() => setLines((ls) => (ls.length === 1 ? [""] : ls.filter((_, j) => j !== i)))} />
            </div>
          ))}
          {lines.length < 8 && (
            <Button size="sm" icon={Plus} onClick={() => setLines((ls) => [...ls, ""])}>
              Add message
            </Button>
          )}
        </CardBody>
      </Card>
      <SaveBar dirty={dirty} busy={busy === "save"} onSave={save} onReset={() => setLines(messages.length ? messages : [""])} />

      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        busy={busy === "key"}
        title="Make a new TV link?"
        description="The current link stops working straight away, so you'll need to open the new one on the TV."
        confirmLabel="Make new link"
        onConfirm={newKey}
      />
    </div>
  );
}
