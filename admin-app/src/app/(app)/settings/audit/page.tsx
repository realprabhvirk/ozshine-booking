import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { addDaysISO, todayISO } from "@/lib/core/time";
import { isoDateSchema } from "@/lib/core/schemas";
import { errorMessage } from "@/lib/core/errors";
import { shopDayStart } from "@/lib/shop/money";
import { Notice } from "@/components/ui/feedback";
import { AdminOnly } from "../admin-only";
import { AUDIT_AREAS, AuditList, type AuditRow } from "./audit-list";

export const metadata: Metadata = { title: "Audit log — OzShine Staff" };

const PAGE = 100;

export default async function AuditPage({ searchParams }: PageProps<"/settings/audit">) {
  const sp = await searchParams;
  const to = typeof sp.to === "string" && isoDateSchema.safeParse(sp.to).success ? sp.to : todayISO();
  const from = typeof sp.from === "string" && isoDateSchema.safeParse(sp.from).success ? sp.from : addDaysISO(to, -30);
  const area = typeof sp.area === "string" && AUDIT_AREAS.some((a) => a.value === sp.area) ? sp.area : "";
  const page = Math.max(0, Math.min(1000, Number.parseInt(typeof sp.page === "string" ? sp.page : "0", 10) || 0));

  const supabase = await createClient();
  let query = supabase
    .from("audit_log")
    .select("id, action, entity, entity_id, before, after, created_at, actor:staff!actor_staff_id(name)", { count: "estimated" })
    .gte("created_at", shopDayStart(from))
    .lt("created_at", shopDayStart(addDaysISO(to, 1)))
    .order("created_at", { ascending: false })
    .range(page * PAGE, page * PAGE + PAGE - 1);
  const prefixes = AUDIT_AREAS.find((a) => a.value === area)?.prefixes;
  if (prefixes) query = query.or(prefixes.map((p) => `action.like.${p}.*`).join(","));
  const { data, error, count } = await query;

  return (
    <AdminOnly>
      {error ? (
        <Notice tone="bad" title="Couldn't load the audit log">{errorMessage(error)}</Notice>
      ) : (
        <AuditList rows={(data ?? []) as unknown as AuditRow[]} from={from} to={to} area={area} page={page} pageSize={PAGE} total={count ?? null} />
      )}
    </AdminOnly>
  );
}
