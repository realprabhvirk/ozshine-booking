// Customers (CRM): reads through RLS, writes through checked database
// functions (every change is audited and attributed).
import type { SupabaseClient } from "@supabase/supabase-js";
import { callRpc } from "@/lib/rpc";
import { toAppError } from "@/lib/core/errors";
import { normalizeRego } from "@/lib/core/phone";
import type { VehicleType } from "@/lib/core/status";
import { addDaysISO, todayISO } from "@/lib/core/time";
import { BOOKING_SELECT } from "./queries";
import { fetchAllPages } from "@/lib/paginate";
import { announceChange } from "./actions";
import type { BoardBooking } from "./types";
import { shopDayStart } from "./money";

const ACTOR = null;

function check<T>(res: { data: T | null; error: unknown }): T {
  if (res.error) throw toAppError(res.error);
  return res.data as T;
}

export type DirectoryRow = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  tags: string[];
  is_vip: boolean;
  marketing_opt_in: boolean;
  created_at: string;
  auth_user_id: string | null;
  visit_count: number;
  lifetime_spend: number | string;
  last_visit_at: string | null;
  outstanding_balance: number | string;
  regos: string[];
  unused_rewards: number;
};

export type DirectoryFilter = "all" | "vip" | "owing" | "rewards" | "lapsed" | "new" | "online";
export type DirectorySort = "name" | "recent" | "visits" | "spend";
export const PAGE_SIZE = 50;

const DIRECTORY_COLUMNS =
  "id, name, phone, email, tags, is_vip, marketing_opt_in, created_at, auth_user_id, visit_count, lifetime_spend, last_visit_at, outstanding_balance, regos, unused_rewards";

// Search text is used inside a PostgREST filter: drop characters that have
// meaning there so input can't change the query.
function clean(q: string) {
  return q.replace(/[,()*%\\:"']/g, " ").replace(/\s+/g, " ").trim();
}

export async function fetchDirectory(
  supabase: SupabaseClient,
  opts: { q?: string; filter?: DirectoryFilter; tag?: string | null; sort?: DirectorySort; page?: number; pageSize?: number },
): Promise<{ rows: DirectoryRow[]; total: number }> {
  const { filter = "all", sort = "recent", page = 0, pageSize = PAGE_SIZE } = opts;
  const term = clean(opts.q ?? "");
  let query = supabase.from("customer_directory").select(DIRECTORY_COLUMNS, { count: "exact" });

  if (term) {
    const ors = [`name.ilike.%${term}%`, `email.ilike.%${term}%`];
    const digits = term.replace(/\D/g, "");
    if (digits.length >= 3) ors.push(`phone.like.%${digits.replace(/^61/, "0")}%`);
    const rego = normalizeRego(term);
    if (rego && rego.length >= 2 && /^[A-Z0-9]+$/.test(rego)) {
      const v = await supabase.from("vehicles").select("customer_id").ilike("rego", `%${rego}%`).is("archived_at", null).limit(200);
      const ids = [...new Set(((v.data ?? []) as Array<{ customer_id: string }>).map((x) => x.customer_id))];
      if (ids.length) ors.push(`id.in.(${ids.join(",")})`);
    }
    query = query.or(ors.join(","));
  }

  const today = todayISO();
  if (filter === "vip") query = query.eq("is_vip", true);
  if (filter === "owing") query = query.gt("outstanding_balance", 0);
  if (filter === "rewards") query = query.gt("unused_rewards", 0);
  if (filter === "lapsed") query = query.lt("last_visit_at", shopDayStart(addDaysISO(today, -60)));
  if (filter === "new") query = query.gte("created_at", shopDayStart(addDaysISO(today, -30)));
  if (filter === "online") query = query.not("auth_user_id", "is", null);
  if (opts.tag) query = query.contains("tags", [opts.tag]);

  if (sort === "name") query = query.order("name", { ascending: true });
  if (sort === "recent") query = query.order("last_visit_at", { ascending: false, nullsFirst: false }).order("created_at", { ascending: false });
  if (sort === "visits") query = query.order("visit_count", { ascending: false }).order("name");
  if (sort === "spend") query = query.order("lifetime_spend", { ascending: false }).order("name");
  // Tie-breaker so paging (and the CSV export) never skips or repeats anyone:
  // imported customers share the same created_at.
  query = query.order("id", { ascending: true });

  const res = await query.range(page * pageSize, page * pageSize + pageSize - 1);
  const rows = check(res) as unknown as DirectoryRow[];
  return { rows, total: res.count ?? rows.length };
}

export async function fetchDirectoryStats(supabase: SupabaseClient) {
  const lapsedBefore = shopDayStart(addDaysISO(todayISO(), -60));
  const head = () => supabase.from("customer_directory").select("id", { count: "exact", head: true });
  const [total, vip, owing, lapsed] = await Promise.all([
    head(),
    head().eq("is_vip", true),
    head().gt("outstanding_balance", 0),
    head().lt("last_visit_at", lapsedBefore),
  ]);
  return { total: total.count ?? 0, vip: vip.count ?? 0, owing: owing.count ?? 0, lapsed: lapsed.count ?? 0 };
}

export async function fetchAllTags(supabase: SupabaseClient): Promise<string[]> {
  const rows = await fetchAllPages<{ tags: string[] }>((a, b) =>
    supabase.from("customers").select("tags").not("tags", "eq", "{}").order("id").range(a, b) as unknown as PromiseLike<{ data: Array<{ tags: string[] }> | null; error: unknown }>,
  ).catch(() => []);
  const all = new Set<string>();
  for (const r of rows) r.tags.forEach((t) => all.add(t));
  return [...all].sort();
}

// ---- Profile -----------------------------------------------------------------

export type CustomerRecord = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  tags: string[];
  is_vip: boolean;
  marketing_opt_in: boolean;
  notes: string | null;
  created_at: string;
  auth_user_id: string | null;
  referral_code: string | null;
  anonymised_at: string | null;
  merged_into_customer_id: string | null;
  deletion_requested_at: string | null;
  is_walkin_placeholder: boolean;
};

export type VehicleRecord = {
  id: string;
  rego: string | null;
  make_model: string | null;
  colour: string | null;
  year: number | null;
  nickname: string | null;
  notes: string | null;
  vehicle_type: VehicleType;
  is_primary: boolean;
};

export type NoteRecord = { id: string; body: string; created_at: string; staff: { name: string } | null };
export type RewardRecord = { id: string; code: string; description: string; status: "issued" | "redeemed" | "expired" | "void"; issued_at: string; expires_at: string | null; redeemed_at: string | null };
export type EventRecord = { id: string; kind: string; summary: string; created_at: string; booking_id: string | null; invoice_id: string | null; actor: { name: string } | null };
export type MessageRecord = { id: string; channel: "sms" | "email"; template_key: string | null; subject: string | null; body: string; status: string; created_at: string; to_address: string | null };

export type CustomerProfile = {
  customer: CustomerRecord;
  stats: Pick<DirectoryRow, "visit_count" | "lifetime_spend" | "last_visit_at" | "outstanding_balance" | "unused_rewards"> | null;
  bookings: BoardBooking[];
  vehicles: VehicleRecord[];
  notes: NoteRecord[];
  rewards: RewardRecord[];
  events: EventRecord[];
  messages: MessageRecord[];
};

export async function fetchCustomerProfile(supabase: SupabaseClient, id: string): Promise<CustomerProfile | null> {
  const c = check(
    await supabase
      .from("customers")
      .select("id, name, phone, email, tags, is_vip, marketing_opt_in, notes, created_at, auth_user_id, referral_code, anonymised_at, merged_into_customer_id, deletion_requested_at, is_walkin_placeholder")
      .eq("id", id)
      .maybeSingle(),
  ) as CustomerRecord | null;
  if (!c) return null;
  const [stats, bookings, vehicles, notes, rewards, events, messages] = await Promise.all([
    supabase.from("customer_directory").select("visit_count, lifetime_spend, last_visit_at, outstanding_balance, unused_rewards").eq("id", id).maybeSingle(),
    supabase.from("bookings").select(BOOKING_SELECT).eq("customer_id", id).order("starts_at", { ascending: false }).limit(300),
    supabase.from("vehicles").select("id, rego, make_model, colour, year, nickname, notes, vehicle_type, is_primary").eq("customer_id", id).is("archived_at", null).order("is_primary", { ascending: false }),
    supabase.from("customer_notes").select("id, body, created_at, staff:staff!staff_id(name)").eq("customer_id", id).order("created_at", { ascending: false }),
    supabase.from("loyalty_rewards").select("id, code, description, status, issued_at, expires_at, redeemed_at").eq("customer_id", id).order("issued_at", { ascending: false }),
    supabase.from("customer_events").select("id, kind, summary, created_at, booking_id, invoice_id, actor:staff!actor_staff_id(name)").eq("customer_id", id).order("created_at", { ascending: false }).limit(300),
    supabase.from("message_outbox").select("id, channel, template_key, subject, body, status, created_at, to_address").eq("customer_id", id).order("created_at", { ascending: false }).limit(100),
  ]);
  return {
    customer: c,
    stats: check(stats) as CustomerProfile["stats"],
    bookings: (check(bookings) ?? []) as unknown as BoardBooking[],
    vehicles: (check(vehicles) ?? []) as VehicleRecord[],
    notes: (check(notes) ?? []) as unknown as NoteRecord[],
    rewards: (check(rewards) ?? []) as RewardRecord[],
    events: (check(events) ?? []) as unknown as EventRecord[],
    messages: (check(messages) ?? []) as MessageRecord[],
  };
}

// ---- Actions -----------------------------------------------------------------
async function run<T>(p: Promise<T>): Promise<T> {
  const r = await p;
  announceChange();
  return r;
}

export type CustomerPayload = {
  name?: string;
  phone?: string | null;
  email?: string | null;
  tags?: string[];
  is_vip?: boolean;
  marketing_opt_in?: boolean;
  notes?: string | null;
};

export function createCustomer(
  supabase: SupabaseClient,
  payload: { name: string; phone?: string | null; email?: string | null; rego?: string | null; make_model?: string | null; vehicle_type?: VehicleType; marketing_opt_in?: boolean },
) {
  return run(callRpc<string>(supabase, "create_customer", { payload, p_actor: ACTOR }));
}

export function updateCustomer(supabase: SupabaseClient, id: string, payload: CustomerPayload) {
  return run(callRpc<{ ok: boolean }>(supabase, "update_customer", { p_customer_id: id, payload, p_actor: ACTOR }));
}

export function addCustomerNote(supabase: SupabaseClient, id: string, body: string) {
  return run(callRpc<string>(supabase, "add_customer_note", { p_customer_id: id, p_body: body, p_actor: ACTOR }));
}

export function saveVehicle(
  supabase: SupabaseClient,
  customerId: string,
  payload: { id?: string; rego: string | null; make_model: string; colour: string; year: string; nickname: string; notes: string; vehicle_type: VehicleType },
) {
  return run(callRpc<string>(supabase, "upsert_customer_vehicle", { p_customer_id: customerId, payload, p_actor: ACTOR }));
}

export function archiveVehicle(supabase: SupabaseClient, vehicleId: string) {
  return run(callRpc<void>(supabase, "archive_customer_vehicle", { p_vehicle_id: vehicleId, p_actor: ACTOR }));
}

export function mergeCustomers(supabase: SupabaseClient, keepId: string, mergeId: string) {
  return run(callRpc<{ vehicles: number; bookings: number; invoices: number }>(supabase, "merge_customers", { p_keep: keepId, p_merge: mergeId, p_actor: ACTOR }));
}

export function anonymiseCustomer(supabase: SupabaseClient, id: string) {
  return run(callRpc<void>(supabase, "anonymise_customer", { p_customer_id: id, p_actor: ACTOR }));
}

export type ImportRow = Partial<Record<"name" | "phone" | "email" | "rego" | "make_model" | "vehicle_type" | "last_visit" | "total_spend" | "notes", string>>;
export type ImportResult = { dry_run: boolean; total: number; created: number; updated: number; skipped: number; errors: Array<{ row: number; error: string }> };

export function importCustomers(supabase: SupabaseClient, rows: ImportRow[], dryRun: boolean) {
  const p = callRpc<ImportResult>(supabase, "import_customers_csv_rows", { p_rows: rows, p_dry_run: dryRun, p_actor: ACTOR });
  return dryRun ? p : run(p);
}

// Loyalty tier from completed visits (mirrors SQL customer_tier()).
export function tierFor(visits: number, tiers: Array<{ name: string; min_visits: number }> | null | undefined) {
  const list = [...(tiers ?? [])].sort((a, b) => a.min_visits - b.min_visits);
  let current = list[0] ?? null;
  let next: (typeof list)[number] | null = null;
  for (const t of list) {
    if (visits >= t.min_visits) current = t;
    else {
      next = t;
      break;
    }
  }
  return { current, next };
}
