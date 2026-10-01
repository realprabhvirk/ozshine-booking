"use client";

import { useState } from "react";
import { Copy, KeyRound, UserRound } from "lucide-react";
import { cn } from "@/lib/core/cn";
import { formatDate, shopDateOf } from "@/lib/core/time";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { useShop } from "@/components/shop-context";

export type StaffLogin = { id: string; name: string; email: string | null; active: boolean; created_at: string };

// Read-only: logins are created and switched on/off by the owner in Supabase,
// never from inside the app. Every login has the same full access.
export function LoginsClient({ logins }: { logins: StaffLogin[] }) {
  const { staff } = useShop();
  const toast = useToast();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const e = email.trim().toLowerCase().replace(/'/g, "");
  const n = name.trim().replace(/'/g, "");
  const grant = `select grant_staff_access('${e || "their@email.com"}', '${n || "Their Name"}');`;
  const remove = `select remove_staff_access('${e || "their@email.com"}');`;

  function copy(text: string) {
    navigator.clipboard?.writeText(text).then(
      () => toast.success("Copied", "Paste it into Supabase → SQL Editor and press Run"),
      () => toast.error("Couldn't copy, select it and copy by hand"),
    );
  }

  return (
    <div className="grid gap-6 @5xl:grid-cols-[1fr_1.1fr]">
      <Card>
        <CardHeader title="Who can log in" description="Everyone here has the same full access and sees the same data" />
        <ul className="divide-y divide-line">
          {logins.map((l) => (
            <li key={l.id} className={cn("flex items-center gap-3 px-5 py-3", !l.active && "opacity-55")}>
              <UserRound size={20} className="shrink-0 text-fg-faint" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="font-semibold">
                  {l.name} {l.id === staff.id && <Badge tone="info">You</Badge>}
                </p>
                <p className="truncate text-sm text-fg-muted">
                  {l.email ?? "—"} · since {formatDate(shopDateOf(l.created_at), "medium")}
                </p>
              </div>
              <Badge tone={l.active ? "ok" : "neutral"}>{l.active ? "Has access" : "No access"}</Badge>
            </li>
          ))}
        </ul>
      </Card>

      <Card>
        <CardHeader title="Adding or removing a login" description="Done in Supabase only, so nobody can give themselves access from the app" />
        <CardBody className="space-y-4 text-[15px]">
          <ol className="list-decimal space-y-2 pl-5">
            <li>
              In Supabase, open <b>Authentication → Users → Add user → Create new user</b>. Enter their email and a password, and tick <b>Auto Confirm User</b>.
            </li>
            <li>
              Then open <b>SQL Editor</b>, paste the line below and press <b>Run</b>.
            </li>
            <li>They can now log in here with that email and password.</li>
          </ol>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Their email">
              <Input type="email" value={email} onChange={(ev) => setEmail(ev.target.value)} placeholder="jo@example.com" />
            </Field>
            <Field label="Their name">
              <Input value={name} onChange={(ev) => setName(ev.target.value)} placeholder="Jo" />
            </Field>
          </div>
          <SqlLine label="Give access" sql={grant} onCopy={copy} />
          <SqlLine label="Take access away" sql={remove} onCopy={copy} />
          <p className="flex items-start gap-2 text-sm text-fg-muted">
            <KeyRound size={16} className="mt-0.5 shrink-0" aria-hidden />
            Passwords are reset in Supabase too (Authentication → Users → the person → Send password recovery).
          </p>
        </CardBody>
      </Card>
    </div>
  );
}

function SqlLine({ label, sql, onCopy }: { label: string; sql: string; onCopy: (s: string) => void }) {
  return (
    <div>
      <p className="mb-1.5 text-sm font-semibold">{label}</p>
      <div className="flex items-center gap-2">
        <code className="min-w-0 flex-1 overflow-x-auto rounded-lg bg-sunken px-3 py-2.5 font-mono text-[13px] whitespace-nowrap ring-1 ring-line">{sql}</code>
        <Button size="sm" icon={Copy} onClick={() => onCopy(sql)}>
          Copy
        </Button>
      </div>
    </div>
  );
}
