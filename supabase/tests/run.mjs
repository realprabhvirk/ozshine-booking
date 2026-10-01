// OzShine SQL test suite. Run: cd supabase/tests && npm install && npm test
//
// Test 1  Replays the REAL v1 history (Phase-5 schema + the two snippets that
//         were pasted into production), adds v1-style data, applies
//         upgrade_v2.sql twice, and checks nothing was lost.
// Test 2  Builds a fresh database from schema.sql and checks it is
//         structurally identical to the upgraded one.
// Test 3  Exercises the RPCs (availability maths, booking creation, state
//         machine, invoices/GST/payments, loyalty, promos, vouchers, PINs,
//         import, merge, messaging, reports, display board, v1 compatibility).
// Test 4  RLS / privilege matrix for anon, a customer, staff and an admin.
import { makeDb, as, rpc, expectError, fingerprint, read } from "./harness.mjs";
import { buildSchema } from "./build-schema.mjs";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { here } from "./harness.mjs";

let passed = 0;
let failed = 0;
const failures = [];
let section = "";

function suite(name) {
  section = name;
  console.log(`\n▶ ${name}`);
}
async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed++;
    failures.push(`${section} › ${name}: ${e.message}`);
    console.log(`  ✗ ${name}\n      ${e.message}${e.detail ? `\n      detail: ${e.detail}` : ""}${e.where ? `\n      where: ${e.where.split("\n")[0]}` : ""}`);
  }
}
function eq(actual, expected, msg = "") {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) throw new Error(`${msg} expected ${b}, got ${a}`);
}
function ok(cond, msg) {
  if (!cond) throw new Error(msg);
}

const UP = read("../upgrade_v2.sql");

// ---------------------------------------------------------------------------
// Fixture ids
// ---------------------------------------------------------------------------
const U = {
  admin: "00000000-0000-4000-8000-00000000000a",
  staff: "00000000-0000-4000-8000-00000000000b",
  cust: "00000000-0000-4000-8000-00000000000c",
  cust2: "00000000-0000-4000-8000-00000000000d",
  invitee: "00000000-0000-4000-8000-00000000000e",
  stranger: "00000000-0000-4000-8000-00000000000f",
  snoop: "00000000-0000-4000-8000-000000000010",
};

async function loadV1(db) {
  await db.exec(read("fixtures/v1_phase5_schema.sql"));
  await db.exec(read("fixtures/v1_snippet_1_services.sql"));
  await db.exec(read("fixtures/v1_snippet_2_vehicle_pricing.sql"));
}

// Data the way v1 wrote it: raw phone formats, lowercase regos, the four
// original statuses, v1 invoicing via amount_charged/paid.
async function seedV1Data(db) {
  await db.exec(`
    insert into auth.users (id, email) values
      ('${U.admin}', 'owner@ozshine.test'), ('${U.staff}', 'crew@ozshine.test'),
      ('${U.cust}', 'jess@example.test'), ('${U.cust2}', 'sam@example.test'),
      ('${U.invitee}', 'newbie@ozshine.test'), ('${U.stranger}', 'stranger@example.test'),
      ('${U.snoop}', 'snoop@example.test');
    insert into staff (auth_user_id, location_id, name, role)
      select '${U.admin}', id, 'Olivia Owner', 'admin' from locations;
    insert into staff (auth_user_id, location_id, name, role)
      select '${U.staff}', id, 'Craig Crew', 'staff' from locations;
    insert into customers (name, phone, email, auth_user_id) values
      ('Jess Legacy', '0412 345 678', 'jess@example.test', '${U.cust}'),
      ('Sam Legacy', '+61 412 345 679', null, null),
      ('Pat Legacy', '0412345680', null, null);
    insert into vehicles (customer_id, rego, make_model, vehicle_type)
      select id, 'abc 123', 'Mazda 3', 'sedan' from customers where name = 'Jess Legacy';
    insert into vehicles (customer_id, rego, vehicle_type)
      select id, 'xyz-789', 'van' from customers where name = 'Sam Legacy';
    insert into bookings (customer_id, vehicle_id, service_id, location_id, requested_date, requested_time, status, amount_charged, paid, paid_at)
      select c.id, v.id, s.id, s.location_id, (now() at time zone 'Australia/Brisbane')::date - 3, '10:00', 'completed', 65, true, now() - interval '3 days'
      from customers c join vehicles v on v.customer_id = c.id, services s
      where c.name = 'Jess Legacy' and s.name = 'Platinum Wash';
    insert into bookings (customer_id, vehicle_id, service_id, location_id, requested_date, requested_time, status, amount_charged, paid)
      select c.id, v.id, s.id, s.location_id, (now() at time zone 'Australia/Brisbane')::date - 2, '11:00', 'completed', 60, false
      from customers c join vehicles v on v.customer_id = c.id, services s
      where c.name = 'Sam Legacy' and s.name = 'OzShine Wash';
    insert into bookings (customer_id, service_id, location_id, requested_date, requested_time, status)
      select c.id, s.id, s.location_id, (now() at time zone 'Australia/Brisbane')::date + 5, '09:00', 'pending'
      from customers c, services s where c.name = 'Pat Legacy' and s.name = 'OzShine Wash';
    insert into bookings (customer_id, service_id, location_id, requested_date, requested_time, status)
      select c.id, s.id, s.location_id, (now() at time zone 'Australia/Brisbane')::date + 6, '14:00', 'approved'
      from customers c, services s where c.name = 'Pat Legacy' and s.name = 'Interior Detail';
  `);
}

async function snapshotV1(db) {
  const rows = async (sql) => (await db.query(sql)).rows;
  return {
    customers: await rows(`select id, name, email, auth_user_id, created_at from customers order by id`),
    vehicles: await rows(`select id, customer_id, make_model, vehicle_type, notes from vehicles order by id`),
    bookings: await rows(`select id, customer_id, vehicle_id, service_id, location_id, requested_date, requested_time,
                           status, amount_charged, paid, paid_at, processed_by_staff_id, created_at from bookings order by id`),
    staff: await rows(`select id, auth_user_id, location_id, name, role from staff order by id`),
    services: await rows(`select id, name, price_from, price_small_wagon, price_van, price_4wd, sort_order from services order by id`),
  };
}

// ===========================================================================
// TEST 1 — upgrade a replayed v1 database
// ===========================================================================
suite("Test 1 · upgrade the real v1 database (twice)");
const db = await makeDb();
await loadV1(db);
await seedV1Data(db);
const before = await snapshotV1(db);

await test("upgrade_v2.sql applies to the v1 database", async () => {
  await db.exec(UP);
});
await test("upgrade_v2.sql applies a second time with no errors", async () => {
  await db.exec(UP);
});
await test("no v1 rows lost and every v1 column value intact", async () => {
  const after = await snapshotV1(db);
  // Customers: the upgrade adds a Walk-in Guest row; everything else identical.
  eq(after.customers.filter((c) => c.name !== "Walk-in Guest"), before.customers, "customers");
  eq(after.vehicles, before.vehicles, "vehicles");
  eq(after.bookings, before.bookings, "bookings");
  eq(after.staff, before.staff, "staff");
  eq(after.services.map(({ sort_order, ...s }) => s), before.services.map(({ sort_order, ...s }) => s), "services");
});
await test("phones and regos were normalised to the canonical form", async () => {
  const phones = (await db.query(`select phone from customers where phone is not null order by phone`)).rows.map((r) => r.phone);
  eq(phones, ["0412345678", "0412345679", "0412345680"]);
  const regos = (await db.query(`select rego from vehicles order by rego`)).rows.map((r) => r.rego);
  eq(regos, ["ABC123", "XYZ789"]);
});
await test("v1 bookings were back-filled (reference, token, times, price)", async () => {
  const r = (await db.query(`select count(*)::int n from bookings
    where reference_code ~ '^OZ-[2-9A-Z]{4}$' and manage_token is not null and starts_at is not null
      and ends_at > starts_at and service_price is not null and duration_minutes > 0`)).rows[0].n;
  eq(r, 4);
});
await test("seeds are not duplicated by the second run", async () => {
  const counts = (await db.query(`select
    (select count(*) from settings)::int settings, (select count(*) from bays)::int bays,
    (select count(*) from addons)::int addons, (select count(*) from loyalty_rules)::int rules,
    (select count(*) from automations)::int autos, (select count(*) from message_templates)::int templates,
    (select count(*) from customers where is_walkin_placeholder)::int walkin`)).rows[0];
  eq(counts, { settings: 1, bays: 3, addons: 6, rules: 2, autos: 6, templates: 18, walkin: 1 });
});
await test("services got durations and metadata; custom edits are preserved on re-run", async () => {
  await db.exec(`update services set tagline = 'Owner edited' where name = 'OzShine Wash'`);
  await db.exec(UP);
  const r = (await db.query(`select tagline, duration_minutes from services where name = 'OzShine Wash'`)).rows[0];
  eq(r, { tagline: "Owner edited", duration_minutes: 45 });
  const q = (await db.query(`select requires_quote from services where name = 'Correction & Coating'`)).rows[0];
  eq(q.requires_quote, true);
});
await test("customers.phone is nullable with a partial unique index", async () => {
  await db.exec(`insert into customers (name) values ('No Phone Nora')`);
  await expectError(db.exec(`insert into customers (name, phone) values ('Dupe', '0412 345 678')`), /duplicate key|23505/);
});

// ===========================================================================
// TEST 2 — fresh install parity
// ===========================================================================
suite("Test 2 · fresh schema.sql matches the upgraded database");
await test("supabase/schema.sql is up to date with build-schema.mjs", async () => {
  const onDisk = readFileSync(join(here, "../schema.sql"), "utf8");
  ok(onDisk === buildSchema(), "schema.sql is stale — run `npm run build-schema` in supabase/tests");
});
const fresh = await makeDb();
await test("schema.sql applies to an empty database (and re-applies)", async () => {
  await fresh.exec(read("../schema.sql"));
  await fresh.exec(read("../schema.sql"));
});
await test("structure is identical to the upgraded v1 database", async () => {
  const a = await fingerprint(db);
  const b = await fingerprint(fresh);
  const diffs = [];
  for (const k of Object.keys(a)) {
    const onlyA = a[k].filter((x) => !b[k].includes(x));
    const onlyB = b[k].filter((x) => !a[k].includes(x));
    if (onlyA.length || onlyB.length) diffs.push(`${k}: upgraded-only=${onlyA.slice(0, 3).join(" | ")} fresh-only=${onlyB.slice(0, 3).join(" | ")}`);
  }
  ok(diffs.length === 0, diffs.join("\n      "));
});

// ===========================================================================
// TEST 3 — RPC behaviour
// ===========================================================================
suite("Test 3 · RPCs");

// Deterministic shop settings: open every day 08:00–17:00, 30-min slots.
await db.exec(`update settings set opening_hours = (
  select jsonb_object_agg(d, '{"open":"08:00","close":"17:00","closed":false}'::jsonb)
  from unnest(array['mon','tue','wed','thu','fri','sat','sun']) d),
  min_lead_minutes = 60, max_advance_days = 60, slot_minutes = 30, max_concurrent_jobs = 3,
  public_site_url = 'https://ozshine.example'`);
const ids = (await db.query(`select
  (select id from services where name = 'OzShine Wash') wash,
  (select id from services where name = 'Platinum Wash') plat,
  (select id from services where name = 'OzShine Polish') polish,
  (select id from addons where name = 'Engine bay clean') engine,
  (select id from staff where auth_user_id = '${U.admin}') admin_staff,
  (select id from staff where auth_user_id = '${U.staff}') crew_staff,
  (shop_today() + 3)::text d3,
  (shop_today() + 4)::text d4,
  (shop_today() + 5)::text d5,
  (shop_today() + 1)::text d1`)).rows[0];

const book = (payload, uid = null) =>
  as(db, uid ? "authenticated" : "anon", uid, () => rpc(db, `select create_public_booking($1::jsonb)`, [JSON.stringify(payload)]));
const staffCall = (uid, sql, params) => as(db, "authenticated", uid, () => rpc(db, sql, params));
let adminTok;
let crewTok;

await test("admin can set their own first PIN without a session, then start one", async () => {
  await staffCall(U.admin, `select set_staff_pin(null, $1, '2468')`, [ids.admin_staff]);
  const s = await staffCall(U.admin, `select start_acting_session($1, '2468')`, [ids.admin_staff]);
  adminTok = s.token;
  ok(adminTok && s.staff.role === "admin", "no admin session");
});
await test("admin sets crew PIN; wrong PINs lock after 5 tries", async () => {
  await staffCall(U.admin, `select set_staff_pin($1, $2, '1357')`, [adminTok, ids.crew_staff]);
  for (let i = 0; i < 5; i++) {
    eq(await staffCall(U.staff, `select verify_staff_pin($1, '0000')`, [ids.crew_staff]), false);
  }
  await expectError(staffCall(U.staff, `select verify_staff_pin($1, '1357')`, [ids.crew_staff]), "PIN_LOCKED");
  await db.exec(`update staff_pins set locked_until = null, failed_attempts = 0`);
  const s = await staffCall(U.staff, `select start_acting_session($1, '1357')`, [ids.crew_staff]);
  crewTok = s.token;
});
await test("PIN hash is never exposed by the switcher", async () => {
  const list = await staffCall(U.staff, `select list_staff_for_switcher()`);
  eq(list.length, 2);
  ok(!JSON.stringify(list).includes("$2"), "hash leaked");
  ok(list.every((s) => s.has_pin === true), "has_pin flag");
});
await test("a staff session can't be used from another login", async () => {
  await expectError(staffCall(U.admin, `select check_acting_session($1)`, [crewTok]), "PIN_REQUIRED");
});
await test("non-admin actor can't do admin things", async () => {
  await expectError(staffCall(U.staff, `select admin_save('bays', null, '{"name":"Bay 9"}', $1)`, [crewTok]), "ADMIN_REQUIRED");
});

await test("available slots: 08:00 → 16:00 for a 45-min wash", async () => {
  const slots = await as(db, "anon", null, () => rpc(db, `select * from get_available_slots($1, $2)`, [ids.d3, ids.wash]));
  eq(slots.length, 17);
  eq(slots[0].slot_time, "08:00:00");
  eq(slots.at(-1).slot_time, "16:00:00");
  ok(slots.every((s) => s.available), "all free");
});
await test("add-ons extend the job duration in slot maths", async () => {
  const slots = await as(db, "anon", null, () =>
    rpc(db, `select * from get_available_slots($1, $2, $3)`, [ids.d3, ids.wash, [ids.engine]]));
  eq(slots.at(-1).slot_time, "15:30:00");
});

await db.exec(`update settings set max_concurrent_jobs = 2`);
await test("concurrency uses the real peak, not a naive overlap count", async () => {
  // Two back-to-back jobs 09:00–09:45 and 09:45–10:30. A 09:30 job overlaps
  // both, but never more than one at a time, so with capacity 2 it fits.
  const base = { vehicle_type: "sedan", name: "Peak Test", service_id: ids.wash, date: ids.d4 };
  await book({ ...base, phone: "0400000101", time: "09:00" });
  await book({ ...base, phone: "0400000102", time: "09:45" });
  const slots = await as(db, "anon", null, () => rpc(db, `select * from get_available_slots($1, $2)`, [ids.d4, ids.wash]));
  eq(slots.find((s) => s.slot_time === "09:30:00").available, true, "09:30");
  await book({ ...base, phone: "0400000103", time: "09:30" });
  const after = await as(db, "anon", null, () => rpc(db, `select * from get_available_slots($1, $2)`, [ids.d4, ids.wash]));
  eq(after.find((s) => s.slot_time === "09:00:00").available, false, "09:00 now full");
  eq(after.find((s) => s.slot_time === "10:30:00").available, true, "10:30 free");
});
await test("the last free slot can't be double-booked", async () => {
  const p = { vehicle_type: "sedan", name: "Race", service_id: ids.wash, date: ids.d4, time: "13:00" };
  await book({ ...p, phone: "0400000104" });
  await book({ ...p, phone: "0400000105" });
  await expectError(book({ ...p, phone: "0400000106" }), "SLOT_TAKEN");
});
await db.exec(`update settings set max_concurrent_jobs = 3`);

await test("full-day and partial closures block slots", async () => {
  await db.exec(`insert into blackout_dates (location_id, date, reason) values (default_location_id(), '${ids.d5}', 'Public holiday')`);
  eq((await as(db, "anon", null, () => rpc(db, `select * from get_available_slots($1, $2)`, [ids.d5, ids.wash]))).every((s) => !s.available), true);
  await db.exec(`delete from blackout_dates; insert into blackout_dates (location_id, date, reason, start_time, end_time)
                 values (default_location_id(), '${ids.d5}', 'Staff meeting', '12:00', '13:00')`);
  const slots = await as(db, "anon", null, () => rpc(db, `select * from get_available_slots($1, $2)`, [ids.d5, ids.wash]));
  eq(slots.find((s) => s.slot_time === "11:30:00").available, false, "11:30 overlaps 12:00");
  eq(slots.find((s) => s.slot_time === "11:00:00").available, true, "11:00 ends 11:45");
  eq(slots.find((s) => s.slot_time === "13:00:00").available, true, "13:00 free");
  await db.exec(`delete from blackout_dates`);
});
await test("lead time and advance window are enforced for the public", async () => {
  await db.exec(`update settings set min_lead_minutes = 10080`);
  await expectError(book({ vehicle_type: "sedan", name: "Soon", phone: "0400000110", service_id: ids.wash, date: ids.d3, time: "10:00" }), "TOO_SOON");
  await db.exec(`update settings set min_lead_minutes = 60`);
  const far = (await db.query(`select shop_today() + 61 d`)).rows[0].d;
  await expectError(book({ vehicle_type: "sedan", name: "Far", phone: "0400000111", service_id: ids.wash, date: far, time: "10:00" }), "TOO_FAR");
});

let jess;
await test("price is computed server-side; tampered prices are ignored", async () => {
  jess = await book({
    vehicle_type: "van", name: "Jess Legacy", phone: "+61 412 345 678", service_id: ids.wash, addon_ids: [ids.engine],
    date: ids.d3, time: "10:00", price: 1, total: 1, total_estimate: 1, service_price: 1,
  });
  eq(Number(jess.total_estimate), 100, "van wash 60 + engine 40");
  eq(jess.status, "pending");
  const row = (await db.query(`select b.service_price, c.name from bookings b join customers c on c.id = b.customer_id where reference_code = $1`, [jess.reference_code])).rows[0];
  eq(Number(row.service_price), 60);
  eq(row.name, "Jess Legacy", "existing customer matched by phone (not renamed)");
});
await test("honeypot, bad phone and inactive services are rejected", async () => {
  const base = { vehicle_type: "sedan", name: "Bot", phone: "0400000120", service_id: ids.wash, date: ids.d3, time: "11:00" };
  await expectError(book({ ...base, website: "http://spam" }), "INVALID_INPUT");
  await expectError(book({ ...base, phone: "12345" }), "INVALID_PHONE");
  await db.exec(`update services set active = false where name = 'OzShine Polish'`);
  await expectError(book({ ...base, service_id: ids.polish }), "INVALID_INPUT");
  await db.exec(`update services set active = true where name = 'OzShine Polish'`);
});
await test("throttles: 3 pending max, 5 bookings per phone per day", async () => {
  const base = { vehicle_type: "sedan", name: "Busy Bee", phone: "0400000130", service_id: ids.wash, date: ids.d3 };
  const refs = [];
  for (const t of ["08:00", "08:30", "09:00"]) refs.push(await book({ ...base, time: t }));
  await expectError(book({ ...base, time: "09:30" }), "TOO_MANY_PENDING");
  await db.exec(`update bookings set status = 'approved' where reference_code = any(array['${refs.map((r) => r.reference_code).join("','")}'])`);
  await book({ ...base, time: "09:30" });
  await book({ ...base, time: "14:00" });
  await expectError(book({ ...base, time: "14:30" }), "THROTTLED");
});
await test("get_booking_by_token returns one booking with first name only", async () => {
  const b = await as(db, "anon", null, () => rpc(db, `select get_booking_by_token($1)`, [jess.manage_token]));
  eq(b.first_name, "Jess");
  ok(!JSON.stringify(b).includes("0412345678"), "phone leaked");
  ok(!JSON.stringify(b).includes("jess@example"), "email leaked");
  eq(b.addons.length, 1);
  eq(await as(db, "anon", null, () => rpc(db, `select get_booking_by_token(gen_random_uuid())`)), null);
});
await test("reschedule and cancel by token respect the rules", async () => {
  const r = await book({ vehicle_type: "sedan", name: "Mover", phone: "0400000140", service_id: ids.wash, date: ids.d3, time: "15:00" });
  const moved = await as(db, "anon", null, () => rpc(db, `select reschedule_booking_by_token($1, $2, '15:30')`, [r.manage_token, ids.d3]));
  eq(moved.time, "15:30");
  const cancelled = await as(db, "anon", null, () => rpc(db, `select cancel_booking_by_token($1, 'Change of plans')`, [r.manage_token]));
  eq(cancelled.status, "cancelled");
  await expectError(as(db, "anon", null, () => rpc(db, `select cancel_booking_by_token($1, null)`, [r.manage_token])), "CANNOT_MODIFY");
});

let jessBooking;
let jessInvoice;
await test("state machine: illegal moves are refused", async () => {
  jessBooking = (await db.query(`select id from bookings where reference_code = $1`, [jess.reference_code])).rows[0].id;
  await expectError(staffCall(U.staff, `select advance_booking($1, 'completed', $2)`, [jessBooking, crewTok]), "ILLEGAL_TRANSITION");
  await expectError(staffCall(U.staff, `select advance_booking($1, 'in_progress', $2)`, [jessBooking, crewTok]), "ILLEGAL_TRANSITION");
});
await test("state machine: full legal path with bay + staff assignment", async () => {
  await staffCall(U.staff, `select advance_booking($1, 'approved', $2)`, [jessBooking, crewTok]);
  await staffCall(U.staff, `select advance_booking($1, 'checked_in', $2)`, [jessBooking, crewTok]);
  const started = await staffCall(U.staff, `select advance_booking($1, 'in_progress', $2)`, [jessBooking, crewTok]);
  ok(started.bay_id, "bay auto-assigned");
  eq(started.assigned_staff_id, ids.crew_staff);
  await staffCall(U.staff, `select advance_booking($1, 'ready', $2)`, [jessBooking, crewTok]);
  await expectError(staffCall(U.staff, `select advance_booking($1, 'completed', $2)`, [jessBooking, crewTok]), "INVOICE_REQUIRED");
  const b = (await db.query(`select approved_at, checked_in_at, started_at, ready_at, processed_by_staff_id from bookings where id = $1`, [jessBooking])).rows[0];
  ok(b.approved_at && b.checked_in_at && b.started_at && b.ready_at, "stage timestamps stamped");
  eq(b.processed_by_staff_id, ids.crew_staff, "attributed to the PIN user");
});
await test("invoice: numbering, GST-inclusive maths, idempotent issue", async () => {
  jessInvoice = await staffCall(U.staff, `select issue_invoice($1, $2)`, [jessBooking, crewTok]);
  const again = await staffCall(U.staff, `select issue_invoice($1, $2)`, [jessBooking, crewTok]);
  eq(again, jessInvoice, "same invoice returned");
  const inv = (await db.query(`select number, total, gst_amount, status, balance_due from invoices where id = $1`, [jessInvoice])).rows[0];
  eq(inv.number, "OZ-000001");
  eq(Number(inv.total), 100);
  eq(Number(inv.gst_amount), 9.09, "100/11 = 9.09");
  eq(inv.status, "issued");
  const items = (await db.query(`select kind, description, line_total from invoice_items where invoice_id = $1 order by sort`, [jessInvoice])).rows;
  eq(items.map((i) => i.kind), ["service", "addon"]);
  ok(items[0].description.includes("Van"), "vehicle type on line");
});
await test("GST rounding: 65.00 → 5.91, 40.00 → 3.64, 330 → 30.00", async () => {
  const r = (await db.query(`select gst_from_inclusive(65) a, gst_from_inclusive(40) b, gst_from_inclusive(330) c, gst_from_inclusive(0.05) d`)).rows[0];
  eq([r.a, r.b, r.c, r.d].map(Number), [5.91, 3.64, 30, 0]);
});
await test("payments: split, partial → paid, overpay guard, idempotency, booking sync", async () => {
  await expectError(staffCall(U.staff, `select record_payment($1, 150, 'cash', null, $2)`, [jessInvoice, crewTok]), "OVERPAYMENT");
  let r = await staffCall(U.staff, `select record_payment($1, 40, 'cash', null, $2, null, 'idem-1')`, [jessInvoice, crewTok]);
  eq([r.status, Number(r.balance_due)], ["partial", 60]);
  r = await staffCall(U.staff, `select record_payment($1, 40, 'cash', null, $2, null, 'idem-1')`, [jessInvoice, crewTok]);
  eq(r.duplicate, true, "idempotent");
  r = await staffCall(U.staff, `select record_payment($1, 60, 'eftpos', 'TX9', $2)`, [jessInvoice, crewTok]);
  eq([r.status, Number(r.balance_due)], ["paid", 0]);
  const b = (await db.query(`select paid, paid_at, amount_charged from bookings where id = $1`, [jessBooking])).rows[0];
  eq([b.paid, Number(b.amount_charged)], [true, 100]);
  ok(b.paid_at, "paid_at synced");
  await expectError(staffCall(U.staff, `select record_payment($1, 1, 'cash', null, $2)`, [jessInvoice, crewTok]), "CANNOT_PAY");
});
await test("completion needs the invoice, then works", async () => {
  const r = await staffCall(U.staff, `select advance_booking($1, 'completed', $2)`, [jessBooking, crewTok]);
  eq(r.status, "completed");
});
await test("refunds need an admin; refund flips paid back to partial", async () => {
  const pay = (await db.query(`select id from payments where invoice_id = $1 and method = 'eftpos'`, [jessInvoice])).rows[0].id;
  await expectError(staffCall(U.staff, `select refund_payment($1, 10, 'Scratch found', $2)`, [pay, crewTok]), "ADMIN_REQUIRED");
  await expectError(staffCall(U.admin, `select refund_payment($1, 999, 'Too much', $2)`, [pay, adminTok]), "INVALID_INPUT");
  await staffCall(U.admin, `select refund_payment($1, 10, 'Scratch found', $2)`, [pay, adminTok]);
  const inv = (await db.query(`select status, balance_due, amount_paid from invoices where id = $1`, [jessInvoice])).rows[0];
  eq([inv.status, Number(inv.balance_due), Number(inv.amount_paid)], ["partial", 10, 90]);
  eq((await db.query(`select paid from bookings where id = $1`, [jessBooking])).rows[0].paid, false);
});
await test("void needs refunds first, then releases the booking", async () => {
  await expectError(staffCall(U.admin, `select void_invoice($1, 'Mistake', $2)`, [jessInvoice, adminTok]), "HAS_PAYMENTS");
  const pays = (await db.query(`select id, amount - coalesce((select -sum(r.amount) from payments r where r.refund_of_payment_id = p.id), 0) as left_
                                from payments p where invoice_id = $1 and amount > 0`, [jessInvoice])).rows;
  for (const p of pays) if (Number(p.left_) > 0) await staffCall(U.admin, `select refund_payment($1, $2, 'Voiding', $3)`, [p.id, p.left_, adminTok]);
  await staffCall(U.admin, `select void_invoice($1, 'Mistake', $2)`, [jessInvoice, adminTok]);
  const inv = (await db.query(`select status, balance_due from invoices where id = $1`, [jessInvoice])).rows[0];
  eq([inv.status, Number(inv.balance_due)], ["void", 0]);
  const b = (await db.query(`select paid, amount_charged from bookings where id = $1`, [jessBooking])).rows[0];
  eq([b.paid, b.amount_charged], [false, null]);
  const n = await staffCall(U.staff, `select issue_invoice($1, $2)`, [jessBooking, crewTok]);
  eq((await db.query(`select number from invoices where id = $1`, [n])).rows[0].number, "OZ-000002", "re-issue gets the next number");
});
await test("invoice edits: price edit + discount audit-logged, below-paid guard, admin threshold", async () => {
  const inv = await staffCall(U.staff, `select issue_invoice($1, $2)`, [jessBooking, crewTok]);
  const item = (await db.query(`select id from invoice_items where invoice_id = $1 and kind = 'addon'`, [inv])).rows[0].id;
  await staffCall(U.staff, `select update_invoice_item($1, null, 1, 35, $2)`, [item, crewTok]);
  await staffCall(U.staff, `select add_invoice_item($1, 'discount', 'Loyal regular', 1, 5, $2)`, [inv, crewTok]);
  await expectError(staffCall(U.staff, `select add_invoice_item($1, 'discount', 'Big one', 1, 50, $2)`, [inv, crewTok]), "ADMIN_REQUIRED");
  const total = Number((await db.query(`select total from invoices where id = $1`, [inv])).rows[0].total);
  eq(total, 90, "60 + 35 - 5");
  await staffCall(U.staff, `select record_payment($1, 80, 'cash', null, $2)`, [inv, crewTok]);
  await expectError(staffCall(U.admin, `select add_invoice_item($1, 'discount', 'Oops', 1, 20, $2)`, [inv, adminTok]), "BELOW_PAID");
  const audits = (await db.query(`select action from audit_log where entity_id = $1 order by created_at`, [inv])).rows.map((r) => r.action);
  ok(audits.includes("invoice.price_edit") && audits.includes("invoice.add_item"), `audit: ${audits}`);
});

await test("loyalty: 6th completed visit earns one reward; 12th earns another; never doubled", async () => {
  const cust = (await db.query(`select id from customers where name = 'Pat Legacy'`)).rows[0].id;
  // Pat has 0 completed. Insert 5 completed directly, then complete the 6th via update.
  await db.exec(`insert into bookings (customer_id, service_id, location_id, requested_date, requested_time, status)
    select '${cust}', id, location_id, shop_today() - g, '10:00', 'completed' from services, generate_series(10, 14) g where name = 'OzShine Wash'`);
  const sixth = (await db.query(`select id from bookings where customer_id = $1 and status = 'approved' limit 1`, [cust])).rows[0].id;
  await db.query(`update bookings set status = 'completed' where id = $1`, [sixth]);
  let rewards = (await db.query(`select milestone, status, code from loyalty_rewards where customer_id = $1`, [cust])).rows;
  eq(rewards.map((r) => r.milestone), ["6"]);
  eq(await rpc(db, `select award_loyalty($1)`, [cust]), 0, "no double award");
  await db.exec(`insert into bookings (customer_id, service_id, location_id, requested_date, requested_time, status)
    select '${cust}', id, location_id, shop_today() - g, '10:00', 'approved' from services, generate_series(20, 25) g where name = 'OzShine Wash'`);
  await db.exec(`update bookings set status = 'completed' where customer_id = '${cust}' and status = 'approved'`);
  rewards = (await db.query(`select milestone from loyalty_rewards where customer_id = $1 order by milestone::int`, [cust])).rows;
  eq(rewards.map((r) => r.milestone), ["6", "12"]);
  const msg = (await db.query(`select status from message_outbox where customer_id = $1 and template_key = 'loyalty_earned' and channel = 'sms'`, [cust])).rows;
  eq(msg.map((m) => m.status), ["simulated_sent", "simulated_sent"], "one SMS per reward");
});
await test("loyalty reward applies at checkout and can't be reused", async () => {
  const cust = (await db.query(`select id from customers where name = 'Pat Legacy'`)).rows[0].id;
  const code = (await db.query(`select code from loyalty_rewards where customer_id = $1 and milestone = '6'`, [cust])).rows[0].code;
  const w = await staffCall(U.staff, `select create_walkin_order($1::jsonb, $2)`, [JSON.stringify({ vehicle_type: "sedan", service_id: ids.plat, phone: "0412345680", start_now: true }), crewTok]);
  await staffCall(U.staff, `select advance_booking($1, 'ready', $2)`, [w.booking_id, crewTok]);
  const inv = await staffCall(U.staff, `select issue_invoice($1, $2)`, [w.booking_id, crewTok]);
  const r = await staffCall(U.staff, `select apply_invoice_code($1, $2, $3)`, [inv, code, crewTok]);
  eq(Number(r.discount), 32.5, "50% of $65");
  await expectError(staffCall(U.staff, `select apply_invoice_code($1, $2, $3)`, [inv, code, crewTok]), "PROMO_INVALID");
  eq(Number((await db.query(`select total from invoices where id = $1`, [inv])).rows[0].total), 32.5);
});
await test("referral: referrer earns a reward on the friend's first completed visit", async () => {
  const ref = (await db.query(`select referral_code, id from customers where name = 'Sam Legacy'`)).rows[0];
  const r = await book({ vehicle_type: "sedan", name: "Friend Fiona", phone: "0400000150", service_id: ids.wash, date: ids.d3, time: "12:00", referral_code: ref.referral_code });
  const bid = (await db.query(`select id from bookings where reference_code = $1`, [r.reference_code])).rows[0].id;
  await db.query(`update bookings set status = 'completed' where id = $1`, [bid]);
  const rw = (await db.query(`select description from loyalty_rewards where customer_id = $1`, [ref.id])).rows;
  eq(rw.length, 1);
  ok(rw[0].description.includes("referring"), rw[0].description);
});

await test("promo codes: validate, min spend, expiry, max uses, first-visit", async () => {
  await staffCall(U.admin, `select admin_save('promo_codes', null, $1::jsonb, $2)`,
    [JSON.stringify({ code: "save10", type: "percent", value: 10, min_spend: 50 }), adminTok]);
  let v = await as(db, "anon", null, () => rpc(db, `select validate_promo('SAVE10', $1, 65)`, [ids.plat]));
  eq([v.ok, Number(v.discount)], [true, 6.5]);
  ok(!("promo_id" in v), "internal id not exposed");
  v = await as(db, "anon", null, () => rpc(db, `select validate_promo('SAVE10', $1, 40)`, [ids.wash]));
  eq(v.ok, false, "min spend");
  await staffCall(U.admin, `select admin_save('promo_codes', null, $1::jsonb, $2)`,
    [JSON.stringify({ code: "OLDIE", type: "fixed", value: 5, valid_to: "2020-01-01" }), adminTok]);
  v = await as(db, "anon", null, () => rpc(db, `select validate_promo('oldie', $1, 65)`, [ids.plat]));
  eq(v.ok, false, "expired");
  await staffCall(U.admin, `select admin_save('promo_codes', null, $1::jsonb, $2)`,
    [JSON.stringify({ code: "FIRST", type: "fixed", value: 10, first_visit_only: true }), adminTok]);
  await expectError(book({ vehicle_type: "sedan", name: "Jess", phone: "0412345678", service_id: ids.plat, date: ids.d3, time: "14:30", promo_code: "FIRST" }), "PROMO_INVALID");
  const fresh = await book({ vehicle_type: "sedan", name: "Newbie", phone: "0400000160", service_id: ids.plat, date: ids.d3, time: "14:30", promo_code: "first" });
  eq(Number(fresh.total_estimate), 55);
});
await test("vouchers: pay by voucher, balance tracked, overdraw refused", async () => {
  await staffCall(U.admin, `select admin_save('vouchers', null, $1::jsonb, $2)`, [JSON.stringify({ code: "gift50", initial_value: 50 }), adminTok]);
  const w = await staffCall(U.staff, `select create_walkin_order($1::jsonb, $2)`, [JSON.stringify({ vehicle_type: "4wd", service_id: ids.plat }), crewTok]);
  const inv = await staffCall(U.staff, `select issue_invoice($1, $2)`, [w.booking_id, crewTok]);
  eq(Number((await db.query(`select total from invoices where id = $1`, [inv])).rows[0].total), 85, "4WD platinum");
  await staffCall(U.staff, `select record_payment($1, 30, 'voucher', null, $2, 'GIFT50')`, [inv, crewTok]);
  eq(Number((await db.query(`select balance from vouchers where code = 'GIFT50'`)).rows[0].balance), 20);
  await expectError(staffCall(U.staff, `select record_payment($1, 30, 'voucher', null, $2, 'GIFT50')`, [inv, crewTok]), "VOUCHER_BALANCE");
});
await test("cash payments record what was handed over and the change", async () => {
  const w = await staffCall(U.staff, `select create_walkin_order($1::jsonb, $2)`, [JSON.stringify({ vehicle_type: "sedan", service_id: ids.wash, name: "Cash Carl" }), crewTok]);
  const inv = await staffCall(U.staff, `select issue_invoice($1, $2)`, [w.booking_id, crewTok]);
  const p = await staffCall(U.staff, `select record_payment($1, 40, 'cash', null, $2)`, [inv, crewTok]);
  const t = await staffCall(U.staff, `select set_payment_tendered($1, 50, $2)`, [p.payment_id, crewTok]);
  eq(Number(t.change_given), 10);
  const row = (await db.query(`select tendered, change_given from payments where id = $1`, [p.payment_id])).rows[0];
  eq([Number(row.tendered), Number(row.change_given)], [50, 10]);
  await expectError(staffCall(U.staff, `select set_payment_tendered($1, 20, $2)`, [p.payment_id, crewTok]), "INVALID_INPUT");
  const tok = (await db.query(`select public_token from invoices where id = $1`, [inv])).rows[0].public_token;
  const r = await as(db, "anon", null, async () => (await db.query(`select get_receipt_by_token($1) r`, [tok])).rows[0].r);
  eq(Number(r.payments[0].change_given), 10, "change on public receipt");
  await expectError(as(db, "anon", null, () => db.query(`select set_payment_tendered($1, 60, null)`, [p.payment_id])), /permission denied/);
});
await test("walk-in with no details uses the shared Walk-in Guest and starts in a bay", async () => {
  const w = await staffCall(U.staff, `select create_walkin_order($1::jsonb, $2)`, [JSON.stringify({ vehicle_type: "sedan", service_id: ids.wash, start_now: true }), crewTok]);
  eq(w.status, "in_progress");
  const c = (await db.query(`select c.is_walkin_placeholder, b.source, b.bay_id from bookings b join customers c on c.id = b.customer_id where b.id = $1`, [w.booking_id])).rows[0];
  eq([c.is_walkin_placeholder, c.source], [true, "walk_in"]);
  ok(c.bay_id, "bay");
});
await test("walk-in with a rego finds the existing customer", async () => {
  const w = await staffCall(U.staff, `select create_walkin_order($1::jsonb, $2)`, [JSON.stringify({ vehicle_type: "sedan", service_id: ids.wash, rego: "abc-123" }), crewTok]);
  eq((await db.query(`select name from customers where id = $1`, [w.customer_id])).rows[0].name, "Jess Legacy");
});
await test("walk-in / phone booking for a picked customer reuses them (no duplicates)", async () => {
  // A name-only customer (no mobile) — typing the name again used to create a copy.
  const nameOnly = await staffCall(U.staff, `select create_walkin_order($1::jsonb, $2)`, [JSON.stringify({ vehicle_type: "sedan", service_id: ids.wash, name: "Picked Pat" }), crewTok]);
  const before = Number((await db.query(`select count(*) from customers`)).rows[0].count);
  const w = await staffCall(U.staff, `select create_walkin_order($1::jsonb, $2)`, [JSON.stringify({ vehicle_type: "sedan", service_id: ids.wash, customer_id: nameOnly.customer_id, name: "Picked Pat" }), crewTok]);
  eq(w.customer_id, nameOnly.customer_id, "same customer");
  // Phone booking for them adds the mobile to their record instead of making a new customer.
  const r = await staffCall(U.staff, `select create_staff_booking($1::jsonb, $2)`, [JSON.stringify({ vehicle_type: "sedan", service_id: ids.wash, customer_id: nameOnly.customer_id, phone: "0400000190", name: "Picked Pat", date: ids.d4, time: "13:00" }), crewTok]);
  eq(r.customer_id, nameOnly.customer_id, "same customer on phone booking");
  eq(Number((await db.query(`select count(*) from customers`)).rows[0].count), before, "no new customer");
  eq((await db.query(`select phone from customers where id = $1`, [nameOnly.customer_id])).rows[0].phone, "0400000190", "mobile filled in");
  // A mobile that belongs to someone else is never moved onto the picked customer.
  await staffCall(U.staff, `select create_walkin_order($1::jsonb, $2)`, [JSON.stringify({ vehicle_type: "sedan", service_id: ids.wash, name: "Other Olive", phone: "0400000191" }), crewTok]);
  const other = await staffCall(U.staff, `select create_walkin_order($1::jsonb, $2)`, [JSON.stringify({ vehicle_type: "sedan", service_id: ids.wash, name: "No Phone Ned" }), crewTok]);
  const x = await staffCall(U.staff, `select create_walkin_order($1::jsonb, $2)`, [JSON.stringify({ vehicle_type: "sedan", service_id: ids.wash, customer_id: other.customer_id, phone: "0400000191" }), crewTok]);
  eq(x.customer_id, other.customer_id);
  eq((await db.query(`select phone from customers where id = $1`, [other.customer_id])).rows[0].phone, null, "someone else's mobile not copied");
  // Unknown id falls back to normal matching.
  const y = await staffCall(U.staff, `select create_walkin_order($1::jsonb, $2)`, [JSON.stringify({ vehicle_type: "sedan", service_id: ids.wash, customer_id: "00000000-0000-0000-0000-000000000000", phone: "0400000191" }), crewTok]);
  eq((await db.query(`select name from customers where id = $1`, [y.customer_id])).rows[0].name, "Other Olive", "fallback by phone");
});
await test("manual discounts need a reason and an admin above the threshold", async () => {
  await expectError(staffCall(U.staff, `select create_walkin_order($1::jsonb, $2)`, [JSON.stringify({ vehicle_type: "sedan", service_id: ids.wash, manual_discount: 5 }), crewTok]), "REASON_REQUIRED");
  await expectError(staffCall(U.staff, `select create_walkin_order($1::jsonb, $2)`, [JSON.stringify({ vehicle_type: "sedan", service_id: ids.wash, manual_discount: 25, manual_discount_reason: "Mate" }), crewTok]), "ADMIN_REQUIRED");
  await staffCall(U.admin, `select create_walkin_order($1::jsonb, $2)`, [JSON.stringify({ vehicle_type: "sedan", service_id: ids.wash, manual_discount: 25, manual_discount_reason: "Complaint" }), adminTok]);
});
await test("staff phone booking uses real availability; admin can force", async () => {
  const r = await staffCall(U.staff, `select create_staff_booking($1::jsonb, $2)`, [JSON.stringify({ vehicle_type: "sedan", service_id: ids.wash, phone: "0400000170", name: "Phoned In", date: ids.d4, time: "11:00" }), crewTok]);
  eq(r.status, "approved");
  await expectError(staffCall(U.staff, `select create_staff_booking($1::jsonb, $2)`, [JSON.stringify({ vehicle_type: "sedan", service_id: ids.wash, phone: "0400000171", name: "Night", date: ids.d4, time: "20:00" }), crewTok]), "OUTSIDE_HOURS");
});
await test("calendar move checks capacity; admin force is allowed and audited", async () => {
  await db.exec(`update settings set max_concurrent_jobs = 1`);
  const a = await staffCall(U.staff, `select create_staff_booking($1::jsonb, $2)`, [JSON.stringify({ vehicle_type: "sedan", service_id: ids.wash, phone: "0400000180", name: "Mover A", date: ids.d5, time: "08:00" }), crewTok]);
  const b = await staffCall(U.staff, `select create_staff_booking($1::jsonb, $2)`, [JSON.stringify({ vehicle_type: "sedan", service_id: ids.wash, phone: "0400000181", name: "Mover B", date: ids.d5, time: "10:00" }), crewTok]);
  await expectError(staffCall(U.staff, `select update_booking_details($1, $2::jsonb, $3)`, [b.booking_id, JSON.stringify({ requested_time: "08:00" }), crewTok]), "SLOT_TAKEN");
  await expectError(staffCall(U.staff, `select update_booking_details($1, $2::jsonb, $3)`, [b.booking_id, JSON.stringify({ requested_time: "08:00", force: true }), crewTok]), "ADMIN_REQUIRED");
  const r = await staffCall(U.admin, `select update_booking_details($1, $2::jsonb, $3)`, [b.booking_id, JSON.stringify({ requested_time: "08:00", force: true }), adminTok]);
  eq(r.forced, true);
  await db.exec(`update settings set max_concurrent_jobs = 3`);
  ok(a.booking_id, "a");
});

await test("messages: received/approved/ready are queued once each (demo = simulated)", async () => {
  const m = (await db.query(`select template_key, channel, status, to_address, body from message_outbox
    where booking_id = $1 order by created_at`, [jessBooking])).rows;
  const keys = m.map((x) => `${x.template_key}:${x.channel}:${x.status}`);
  ok(keys.includes("booking_received:sms:simulated_sent"), keys.join(","));
  ok(keys.includes("booking_received:email:simulated_sent"), keys.join(","));
  ok(keys.includes("booking_approved:sms:simulated_sent"), keys.join(","));
  ok(keys.includes("ready_for_pickup:sms:simulated_sent"), keys.join(","));
  eq(new Set(keys).size, keys.length, "no duplicates");
  const sms = m.find((x) => x.template_key === "booking_approved" && x.channel === "sms").body;
  ok(sms.includes("Jess") && sms.includes("https://ozshine.example/manage/"), sms);
  ok(!/\{\{/.test(sms), "unfilled placeholder");
});
await test("automations run idempotently; win-back respects opt-out", async () => {
  const cust = (await db.query(`select id from customers where name = 'Sam Legacy'`)).rows[0].id;
  await db.exec(`update automations set enabled = true where key = 'winback_60d'`);
  await db.query(`update bookings set completed_at = now() - interval '70 days' where customer_id = $1 and status = 'completed'`, [cust]);
  await db.query(`update customers set marketing_opt_in = false where id = $1`, [cust]);
  await staffCall(U.staff, `select create_staff_booking($1::jsonb, $2)`, [JSON.stringify({ vehicle_type: "sedan", service_id: ids.wash, phone: "0400000210", name: "Tomorrow Tom", date: ids.d1, time: "10:00" }), crewTok]);
  const r1 = await staffCall(U.staff, `select run_automations()`);
  const r2 = await staffCall(U.staff, `select run_automations()`);
  ok(r1.reminders > 0, "reminders queued: " + JSON.stringify(r1));
  eq([r2.reminders, r2.winbacks], [0, 0], "second run is a no-op");
  const wb = (await db.query(`select status from message_outbox where customer_id = $1 and template_key = 'winback_60d'`, [cust])).rows;
  eq(wb.map((x) => x.status), ["skipped_opt_out", "skipped_opt_out"], "sms + email both skipped");
});
await test("cron key: wrong key refused, generated key works", async () => {
  await expectError(as(db, "anon", null, () => rpc(db, `select run_automations_with_key('nope')`)), "INVALID_KEY");
  const k = await staffCall(U.admin, `select generate_cron_key($1)`, [adminTok]);
  const r = await as(db, "anon", null, () => rpc(db, `select run_automations_with_key($1)`, [k]));
  ok(r.ran_at, "ran");
  const h = (await db.query(`select cron_key_hash from settings`)).rows[0].cron_key_hash;
  ok(h !== k && h.startsWith("$2"), "stored hashed");
});
await test("campaign: segment preview + send (opt-outs skipped, footer added)", async () => {
  const p = await staffCall(U.staff, `select preview_campaign_segment('{"min_visits":1}'::jsonb)`);
  ok(p.count >= 1 && p.sample.length >= 1, JSON.stringify(p));
  await expectError(staffCall(U.staff, `select send_campaign($1::jsonb, $2)`, [JSON.stringify({ name: "Spring", channel: "sms", body: "Hi {{first_name}}" }), crewTok]), "ADMIN_REQUIRED");
  const r = await staffCall(U.admin, `select send_campaign($1::jsonb, $2)`, [JSON.stringify({ name: "Spring", channel: "sms", body: "Hi {{first_name}}, spring special!", segment: { min_visits: 1 } }), adminTok]);
  ok(r.stats.skipped_opt_out >= 1, JSON.stringify(r.stats));
  const body = (await db.query(`select body from message_outbox where campaign_id = $1 and status = 'simulated_sent' limit 1`, [r.campaign_id])).rows[0].body;
  ok(body.endsWith("Reply STOP to opt out."), body);
});
await test("CSV import: dry run reports, commit applies, re-run updates", async () => {
  const rows = [
    { name: "Imported Ian", phone: "0433 111 222", rego: "imp 1", vehicle_type: "4wd", last_visit: "2025-12-01" },
    { name: "Bad Phone", phone: "12" },
    { name: "Dup Ian", phone: "+61433111222" },
    { name: "", phone: "0433111333" },
    { name: "Jess Again", phone: "0412345678", email: "new@example.test" },
  ];
  const dry = await staffCall(U.admin, `select import_customers_csv_rows($1::jsonb, true, $2)`, [JSON.stringify(rows), adminTok]);
  eq([dry.created, dry.updated, dry.skipped], [1, 1, 3]);
  eq((await db.query(`select count(*)::int n from customers where name = 'Imported Ian'`)).rows[0].n, 0, "dry run wrote nothing");
  const real = await staffCall(U.admin, `select import_customers_csv_rows($1::jsonb, false, $2)`, [JSON.stringify(rows), adminTok]);
  eq([real.created, real.updated], [1, 1]);
  const ian = (await db.query(`select c.notes, v.rego, v.vehicle_type from customers c join vehicles v on v.customer_id = c.id where c.name = 'Imported Ian'`)).rows[0];
  eq([ian.rego, ian.vehicle_type], ["IMP1", "4wd"]);
  const again = await staffCall(U.admin, `select import_customers_csv_rows($1::jsonb, false, $2)`, [JSON.stringify(rows.slice(0, 1)), adminTok]);
  eq([again.created, again.updated], [0, 1]);
  await expectError(staffCall(U.staff, `select import_customers_csv_rows('[]'::jsonb, true, $1)`, [crewTok]), "ADMIN_REQUIRED");
});
await test("merge customers moves everything and leaves a pointer", async () => {
  const keep = (await db.query(`select id from customers where name = 'Imported Ian'`)).rows[0].id;
  const dup = await staffCall(U.staff, `select create_customer($1::jsonb, $2)`, [JSON.stringify({ name: "Ian Dup", phone: "0433999000", rego: "dup 9" }), crewTok]);
  const moved = await staffCall(U.admin, `select merge_customers($1, $2, $3)`, [keep, dup, adminTok]);
  eq(Number(moved.vehicles), 1);
  const d = (await db.query(`select merged_into_customer_id, phone from customers where id = $1`, [dup])).rows[0];
  eq([d.merged_into_customer_id, d.phone], [keep, null]);
  eq((await db.query(`select count(*)::int n from vehicles where customer_id = $1`, [keep])).rows[0].n, 2);
});
await test("customer update: tags, VIP, duplicate phone blocked, audited", async () => {
  const c = (await db.query(`select id from customers where name = 'Imported Ian'`)).rows[0].id;
  await staffCall(U.staff, `select update_customer($1, $2::jsonb, $3)`, [c, JSON.stringify({ tags: ["Fleet", "fleet", " VIP "], is_vip: true }), crewTok]);
  const r = (await db.query(`select tags, is_vip from customers where id = $1`, [c])).rows[0];
  eq([r.tags.sort(), r.is_vip], [["fleet", "vip"], true]);
  await expectError(staffCall(U.staff, `select update_customer($1, $2::jsonb, $3)`, [c, JSON.stringify({ phone: "0412345678" }), crewTok]), "PHONE_IN_USE");
  await staffCall(U.staff, `select add_customer_note($1, 'Prefers no tyre shine', $2)`, [c, crewTok]);
  eq((await db.query(`select staff_id from customer_notes where customer_id = $1`, [c])).rows[0].staff_id, ids.crew_staff);
});
await test("staff invite → claim on first sign-in", async () => {
  await staffCall(U.admin, `select invite_staff('NEWBIE@ozshine.test', 'Nina Newbie', 'staff', $1)`, [adminTok]);
  const r = await as(db, "authenticated", U.invitee, () => rpc(db, `select claim_staff_invite()`));
  eq(r.claimed, true);
  const again = await as(db, "authenticated", U.invitee, () => rpc(db, `select claim_staff_invite()`));
  eq(again.already_staff, true);
  const none = await as(db, "authenticated", U.stranger, () => rpc(db, `select claim_staff_invite()`));
  eq(none.claimed, false);
});
await test("can't remove the last admin", async () => {
  await expectError(staffCall(U.admin, `select update_staff($1, '{"role":"staff"}'::jsonb, $2)`, [ids.admin_staff, adminTok]), "LAST_ADMIN");
});
await test("end-of-day: summary, close, double-close blocked, admin reopen", async () => {
  const today = (await db.query(`select shop_today() d`)).rows[0].d;
  const s = await staffCall(U.staff, `select day_summary($1)`, [today]);
  ok(Number(s.payments_total) > 0, JSON.stringify(s));
  const closed = await staffCall(U.staff, `select close_day($1, $2, 'All good', $3)`, [today, Number(s.expected_cash) + 5, crewTok]);
  eq(closed.is_closed, true);
  eq(Number(closed.close.variance), 5);
  await expectError(staffCall(U.staff, `select close_day($1, 0, null, $2)`, [today, crewTok]), "ALREADY_CLOSED");
  await expectError(staffCall(U.staff, `select reopen_day($1, $2)`, [today, crewTok]), "ADMIN_REQUIRED");
  await staffCall(U.admin, `select reopen_day($1, $2)`, [today, adminTok]);
});
await test("reports run and return sensible shapes", async () => {
  const from = (await db.query(`select shop_today() - 90 d`)).rows[0].d;
  const to = (await db.query(`select shop_today() + 1 d`)).rows[0].d;
  const dash = await staffCall(U.staff, `select dashboard_stats(null)`);
  ok("revenue_today" in dash && "requests_waiting" in dash, JSON.stringify(dash));
  const series = await staffCall(U.staff, `select revenue_series($1, $2, 'week')`, [from, to]);
  ok(series.length >= 13 && series.some((x) => Number(x.revenue) > 0), "series");
  const sb = await staffCall(U.staff, `select service_breakdown($1, $2)`, [from, to]);
  eq(sb.length, 6);
  ok(Array.isArray(await staffCall(U.staff, `select staff_performance($1, $2)`, [from, to])), "perf");
  ok(Array.isArray(await staffCall(U.staff, `select busiest_hours($1, $2)`, [from, to])), "heat");
  const debt = await staffCall(U.staff, `select debtors_aging()`);
  ok(debt.some((d) => d.customer_name === "Sam Legacy" && Number(d.balance_due) === 60), "legacy v1 unpaid job counted");
  const gst = await staffCall(U.staff, `select gst_summary($1, $2)`, [from, to]);
  ok(Number(gst.total_gst) > 0, "gst");
  const ov = await staffCall(U.staff, `select report_overview($1, $2)`, [from, to]);
  ok(ov.cars > 0 && ov.avg_ticket > 0, JSON.stringify(ov).slice(0, 200));
});
await test("global search finds by rego, phone, name, reference and invoice number", async () => {
  let r = await staffCall(U.staff, `select global_search('abc123')`);
  eq(r.vehicles[0].customer_name, "Jess Legacy");
  r = await staffCall(U.staff, `select global_search('0412 345')`);
  ok(r.customers.length >= 1, "phone");
  r = await staffCall(U.staff, `select global_search('legacy')`);
  ok(r.customers.length >= 3, "name");
  r = await staffCall(U.staff, `select global_search($1)`, [jess.reference_code]);
  eq(r.bookings.length, 1);
  r = await staffCall(U.staff, `select global_search('OZ-000001')`);
  eq(r.invoices.length, 1);
});
await test("shop TV board: needs the key and masks regos", async () => {
  await expectError(as(db, "anon", null, () => rpc(db, `select get_display_board('wrong')`)), "INVALID_KEY");
  const key = (await db.query(`select display_key from settings`)).rows[0].display_key;
  const b = await as(db, "anon", null, () => rpc(db, `select get_display_board($1)`, [key]));
  ok(Array.isArray(b.in_bay) && b.in_bay.length >= 1, JSON.stringify(b).slice(0, 200));
  ok(b.in_bay.every((x) => !x.rego || x.rego.endsWith("•••")), "masked");
  ok(!JSON.stringify(b).match(/04\d{8}/), "no phones");
});
await test("feedback: only after completion, once per booking", async () => {
  const r = await book({ vehicle_type: "sedan", name: "Rater Rae", phone: "0400000190", service_id: ids.wash, date: ids.d3, time: "12:30" });
  await expectError(as(db, "anon", null, () => rpc(db, `select submit_feedback_by_token($1, 5, 'Great')`, [r.manage_token])), "NOT_COMPLETED");
  await db.query(`update bookings set status = 'completed' where manage_token = $1`, [r.manage_token]);
  const f = await as(db, "anon", null, () => rpc(db, `select submit_feedback_by_token($1, 2, 'Missed a spot')`, [r.manage_token]));
  eq(f.low_rating, true);
  await expectError(as(db, "anon", null, () => rpc(db, `select submit_feedback_by_token($1, 5, null)`, [r.manage_token])), "ALREADY_SUBMITTED");
});
await test("waitlist is throttled per phone", async () => {
  for (let i = 0; i < 3; i++) await as(db, "anon", null, () => rpc(db, `select join_waitlist('Wendy', '0400 000 200', $1)`, [ids.d4]));
  await expectError(as(db, "anon", null, () => rpc(db, `select join_waitlist('Wendy', '0400000200', $1)`, [ids.d4])), "THROTTLED");
});
await test("public receipt by token shows the invoice without contact details", async () => {
  const tok = (await db.query(`select public_token from invoices where status <> 'void' order by created_at limit 1`)).rows[0].public_token;
  const r = await as(db, "anon", null, () => rpc(db, `select get_receipt_by_token($1)`, [tok]));
  ok(r.items.length >= 1 && r.business.name, JSON.stringify(r).slice(0, 200));
  ok(!JSON.stringify(r).match(/04\d{8}/), "no customer phone");
});
await test("signed-in customer: link account, loyalty, profile, garage", async () => {
  // Jess (U.cust) was linked in v1.
  const l = await as(db, "authenticated", U.cust, () => rpc(db, `select link_account_to_customer()`));
  eq(l.status, "already_linked");
  const loy = await as(db, "authenticated", U.cust, () => rpc(db, `select get_my_loyalty()`));
  ok(loy.visit_count >= 1 && loy.tier.current === "Bronze", JSON.stringify(loy).slice(0, 200));
  // Sam (U.cust2) signs up with Sam's phone in metadata → linked by phone.
  await db.query(`update auth.users set raw_user_meta_data = '{"phone":"0412 345 679","name":"Sam"}' where id = $1`, [U.cust2]);
  const l2 = await as(db, "authenticated", U.cust2, () => rpc(db, `select link_account_to_customer()`));
  eq(l2.status, "linked");
  // A stranger claiming Jess's (already linked) number gets a fresh profile, not Jess's.
  await db.query(`update auth.users set raw_user_meta_data = '{"phone":"0412345678"}' where id = $1`, [U.stranger]);
  const l3 = await as(db, "authenticated", U.stranger, () => rpc(db, `select link_account_to_customer()`));
  eq(l3.status, "created");
  const strangerPhone = (await db.query(`select phone from customers where id = $1`, [l3.customer_id])).rows[0].phone;
  eq(strangerPhone, null, "didn't take Jess's number");
  // Phones aren't verified: someone signing up with a number whose record has
  // a DIFFERENT email must not inherit that history.
  await db.exec(`insert into customers (name, phone, email) values ('Private Pia', '0400000300', 'pia@example.test')`);
  await db.query(`update auth.users set raw_user_meta_data = '{"phone":"0400 000 300"}' where id = $1`, [U.snoop]);
  const l4 = await as(db, "authenticated", U.snoop, () => rpc(db, `select link_account_to_customer()`));
  eq(l4.status, "created", "not linked to Pia");
  eq((await db.query(`select auth_user_id from customers where name = 'Private Pia'`)).rows[0].auth_user_id, null);
  await as(db, "authenticated", U.snoop, () => rpc(db, `select claim_customer_by_phone('0400000300')`));
  eq((await db.query(`select auth_user_id from customers where name = 'Private Pia'`)).rows[0].auth_user_id, null, "legacy claim blocked too");
  const vid = await as(db, "authenticated", U.cust, () => rpc(db, `select upsert_my_vehicle('{"rego":"new 1","vehicle_type":"4wd","is_primary":true}'::jsonb)`));
  ok(vid, "vehicle");
  await expectError(as(db, "authenticated", U.cust, () => rpc(db, `select update_my_profile('{"name":"Jess","phone":"0412345679"}'::jsonb)`)), "PHONE_IN_USE");
});
await test("v1 compatibility: legacy anon insert + staff approve still work", async () => {
  await as(db, "anon", null, () => db.exec(`insert into customers (name, phone) values ('Legacy Web', '0499 888 777')`));
  const c = (await db.query(`select id, phone from customers where name = 'Legacy Web'`)).rows[0];
  eq(c.phone, "0499888777", "normalised by trigger");
  await as(db, "anon", null, () => db.query(`insert into bookings (customer_id, service_id, location_id, requested_date, requested_time)
    select $1, id, location_id, shop_today() + 7, '09:00' from services where name = 'OzShine Wash'`, [c.id]));
  const b = (await db.query(`select id, reference_code, starts_at from bookings where customer_id = $1`, [c.id])).rows[0];
  ok(b.reference_code && b.starts_at, "trigger filled v2 columns");
  await as(db, "authenticated", U.staff, () => db.query(`update bookings set status = 'approved', processed_by_staff_id = $2 where id = $1`, [b.id, ids.crew_staff]));
  const staffRows = await as(db, "authenticated", U.staff, () => db.query(`select * from staff`));
  ok(staffRows.rows.length >= 2 && !("pin_hash" in staffRows.rows[0]), "v1 select * from staff works, no hash");
});

// ===========================================================================
// TEST 4 — RLS / privilege matrix
// ===========================================================================
suite("Test 4 · RLS and privileges");
const count = async (role, uid, sql) => as(db, role, uid, async () => (await db.query(sql)).rows.length);

await test("anon reads nothing private", async () => {
  for (const t of ["customers", "vehicles", "bookings", "invoices", "invoice_items", "payments", "loyalty_rewards",
                   "settings", "audit_log", "message_outbox", "customer_notes", "staff", "feedback", "vouchers", "promo_codes"]) {
    eq(await count("anon", null, `select 1 from ${t}`), 0, t);
  }
});
await test("anon can't touch PIN hashes, sessions or rate limits at all", async () => {
  for (const t of ["staff_pins", "staff_sessions", "rate_limits", "invoice_counters"]) {
    await expectError(as(db, "anon", null, () => db.query(`select * from ${t}`)), /permission denied/);
    await expectError(as(db, "authenticated", U.admin, () => db.query(`select * from ${t}`)), /permission denied/);
  }
});
await test("anon sees active services/add-ons only", async () => {
  await db.exec(`update services set active = false where name = 'OzShine Polish'`);
  eq(await count("anon", null, `select 1 from services`), 5);
  eq(await count("authenticated", U.staff, `select 1 from services`), 6, "staff see inactive");
  await db.exec(`update services set active = true where name = 'OzShine Polish'`);
  eq(await count("anon", null, `select 1 from addons`), 6);
});
await test("anon can't write money tables or call staff RPCs", async () => {
  await expectError(as(db, "anon", null, () => db.query(`insert into invoices (location_id) select id from locations`)), /row-level security|permission/);
  const anyInv = (await db.query(`select id from invoices limit 1`)).rows[0].id;
  await expectError(as(db, "anon", null, () => db.query(`insert into payments (invoice_id, amount, method) values ($1, 1, 'cash')`, [anyInv])), /row-level security|permission/);
  const upd = await as(db, "anon", null, () => db.query(`update invoices set total = 0 returning id`));
  eq(upd.rows.length, 0, "update invisible rows");
  for (const sql of [`select dashboard_stats(null)`, `select issue_invoice(gen_random_uuid(), null)`, `select award_loyalty(gen_random_uuid())`,
                     `select enqueue_message('receipt', gen_random_uuid())`, `select recalc_invoice(gen_random_uuid())`,
                     `select admin_save('settings', null, '{}'::jsonb, null)`]) {
    await expectError(as(db, "anon", null, () => db.query(sql)), /permission denied/);
  }
});
await test("a customer sees only their own rows", async () => {
  const mine = await count("authenticated", U.cust, `select 1 from customers`);
  eq(mine, 1);
  const cid = (await db.query(`select id from customers where auth_user_id = '${U.cust}'`)).rows[0].id;
  const other = await as(db, "authenticated", U.cust, () => db.query(`select distinct customer_id from bookings`));
  eq(other.rows.map((r) => r.customer_id), [cid]);
  const inv = await as(db, "authenticated", U.cust, () => db.query(`select distinct customer_id from invoices`));
  ok(inv.rows.every((r) => r.customer_id === cid), "invoices");
  eq(await count("authenticated", U.cust, `select 1 from staff`), 0);
  eq(await count("authenticated", U.cust, `select 1 from settings`), 0);
  eq(await count("authenticated", U.cust, `select 1 from customer_directory`), 1);
  await expectError(as(db, "authenticated", U.cust, () => db.query(`select dashboard_stats(null)`)), "NOT_STAFF");
});
await test("a customer can't write invoices/payments/rewards directly", async () => {
  const ownInv = (await db.query(`select i.id from invoices i join customers c on c.id = i.customer_id where c.auth_user_id = $1 limit 1`, [U.cust])).rows[0].id;
  await expectError(as(db, "authenticated", U.cust, () => db.query(`insert into payments (invoice_id, amount, method) values ($1, 1, 'cash')`, [ownInv])), /row-level security|permission/);
  const r = await as(db, "authenticated", U.cust, () => db.query(`update loyalty_rewards set status = 'issued' returning id`));
  eq(r.rows.length, 0);
});
await test("staff see all customers + location data; audit log is admin-only", async () => {
  ok((await count("authenticated", U.staff, `select 1 from customer_directory`)) > 5, "directory");
  eq(await count("authenticated", U.staff, `select 1 from audit_log`), 0);
  ok((await count("authenticated", U.admin, `select 1 from audit_log`)) > 0, "admin audit");
  ok((await count("authenticated", U.staff, `select 1 from settings`)) === 1, "settings");
});
await test("deactivated staff lose access immediately", async () => {
  const nina = (await db.query(`select id from staff where name = 'Nina Newbie'`)).rows[0].id;
  await staffCall(U.admin, `select update_staff($1, '{"active":false}'::jsonb, $2)`, [nina, adminTok]);
  eq(await count("authenticated", U.invitee, `select 1 from customer_directory`), 0);
  await expectError(as(db, "authenticated", U.invitee, () => db.query(`select dashboard_stats(null)`)), "NOT_STAFF");
});
await test("no function in public is executable by anon unless deliberately granted", async () => {
  const granted = (await db.query(`select distinct routine_name from information_schema.routine_privileges
    where routine_schema = 'public' and grantee = 'anon' order by 1`)).rows.map((r) => r.routine_name);
  const allowed = new Set(["normalize_au_phone", "is_valid_phone", "normalize_rego", "gst_from_inclusive", "render_template",
    "first_name", "dow_key", "holds_capacity", "legal_next_statuses", "vehicle_type_label", "mask_rego", "is_staff", "is_admin",
    "staff_location_id", "current_staff_id", "current_customer_id", "shop_today", "shop_tz", "get_public_settings",
    "get_available_slots", "validate_promo", "create_public_booking", "get_booking_by_token", "cancel_booking_by_token",
    "reschedule_booking_by_token", "submit_feedback_by_token", "join_waitlist", "get_published_testimonials",
    "get_receipt_by_token", "get_display_board", "run_automations_with_key", "claim_outbox_batch_with_key",
    "report_outbox_result_with_key"]);
  const extra = granted.filter((g) => !allowed.has(g));
  eq(extra, [], "unexpected anon-executable functions");
});


// ===========================================================================
// TEST 5 — post-merge hardening
// ===========================================================================
suite("Test 5 · hardening");
await test("post_merge_hardening.sql blocks direct writes (twice-safe)", async () => {
  await db.exec(read("../post_merge_hardening.sql"));
  await db.exec(read("../post_merge_hardening.sql"));
  await expectError(as(db, "anon", null, () => db.exec(`insert into customers (name, phone) values ('Direct', '0400000400')`)), /permission denied|row-level security/);
  const upd = await as(db, "authenticated", U.staff, () => db.query(`update bookings set status = 'completed' where status = 'approved' returning id`));
  eq(upd.rows.length, 0, "staff can't skip the state machine");
  const upd2 = await as(db, "authenticated", U.cust, () => db.query(`update customers set name = 'Hacked' returning id`));
  eq(upd2.rows.length, 0);
});
await test("after hardening the RPC paths still work end to end", async () => {
  const r = await book({ vehicle_type: "sedan", name: "After Hardening", phone: "0400000410", service_id: ids.wash, date: ids.d4, time: "15:00" });
  const bid = (await db.query(`select id from bookings where reference_code = $1`, [r.reference_code])).rows[0].id;
  await staffCall(U.staff, `select advance_booking($1, 'approved', $2)`, [bid, crewTok]);
  await staffCall(U.staff, `select update_customer((select customer_id from bookings where id = $1), '{"notes":"ok"}'::jsonb, $2)`, [bid, crewTok]);
  await as(db, "authenticated", U.cust, () => rpc(db, `select update_my_profile('{"name":"Jess L"}'::jsonb)`));
  await expectError(as(db, "authenticated", U.snoop, () => db.query(`select claim_customer_by_phone('0400000410')`)), /permission denied/);
});
await test("rollback_hardening.sql restores the V1 write paths", async () => {
  await db.exec(read("../rollback_hardening.sql"));
  await db.exec(read("../rollback_hardening.sql"));
  await as(db, "anon", null, () => db.exec(`insert into customers (name, phone) values ('Direct', '0400000401')`));
  await db.exec(read("../post_merge_hardening.sql"));
});

// ===========================================================================
// TEST 6 — one owner login, no staff accounts (solo mode)
// ===========================================================================
suite("Test 6 · single admin login (solo mode)");
const solo = await makeDb();
const OWNER = "00000000-0000-4000-8000-0000000000aa";
await loadV1(solo);
await solo.exec(`insert into auth.users (id, email) values ('${OWNER}', 'owner@ozshine.test');
  insert into staff (auth_user_id, location_id, name, role) select '${OWNER}', id, 'Shop Owner', 'staff' from locations;`);
await solo.exec(UP);
const soloCall = (sql, params) => as(solo, "authenticated", OWNER, () => rpc(solo, sql, params));
await test("the only staff login is promoted to admin by the upgrade", async () => {
  eq((await solo.query(`select role from staff`)).rows[0].role, "admin");
});
await test("no PIN needed: walk-in, invoice, payment and settings work with no session", async () => {
  eq(await soloCall(`select pin_mode_enabled()`), false);
  const svc = (await solo.query(`select id from services where name = 'OzShine Wash'`)).rows[0].id;
  const w = await soloCall(`select create_walkin_order($1::jsonb, null)`, [JSON.stringify({ vehicle_type: "sedan", service_id: svc, start_now: true })]);
  await soloCall(`select advance_booking($1, 'ready', null)`, [w.booking_id]);
  const inv = await soloCall(`select issue_invoice($1, null)`, [w.booking_id]);
  await soloCall(`select record_payment($1, 40, 'eftpos', null, null)`, [inv]);
  await soloCall(`select advance_booking($1, 'completed', null)`, [w.booking_id]);
  await soloCall(`select admin_save('bays', null, '{"name":"Bay 4"}'::jsonb, null)`);
  const b = (await solo.query(`select processed_by_staff_id, status from bookings where id = $1`, [w.booking_id])).rows[0];
  const owner = (await solo.query(`select id from staff`)).rows[0].id;
  eq([b.status, b.processed_by_staff_id], ["completed", owner], "attributed to the owner");
});
await test("more logins stay PIN-free, equal admins, each recorded as themselves", async () => {
  const EXTRA = "00000000-0000-4000-8000-0000000000ab";
  await solo.exec(`insert into auth.users (id, email) values ('${EXTRA}', 'Extra@OzShine.test')`);
  // Only the owner, in the SQL Editor, can grant access — never the apps.
  await expectError(soloCall(`select grant_staff_access('extra@ozshine.test', 'Extra')`), /permission denied/);
  await expectError(solo.query(`select grant_staff_access('nobody@ozshine.test')`), /No Supabase account/);
  eq((await solo.query(`select grant_staff_access('extra@ozshine.test', 'Extra') r`)).rows[0].r.startsWith("Done"), true);
  const ex = (await solo.query(`select id, role, active from staff where auth_user_id = $1`, [EXTRA])).rows[0];
  ok((await solo.query(`select email_confirmed_at from auth.users where id = $1`, [EXTRA])).rows[0].email_confirmed_at, "no email verification needed");
  eq([ex.role, ex.active], ["admin", true]);
  eq(await soloCall(`select pin_mode_enabled()`), false);
  const extraCall = (sql, params) => as(solo, "authenticated", EXTRA, () => rpc(solo, sql, params));
  await extraCall(`select admin_save('bays', null, '{"name":"Bay 5"}'::jsonb, null)`);
  eq((await solo.query(`select actor_staff_id from audit_log where action = 'bays.create' order by created_at desc limit 1`)).rows[0].actor_staff_id, ex.id, "recorded as the second login");
  const svc = (await solo.query(`select id from services where name = 'OzShine Wash'`)).rows[0].id;
  await extraCall(`select create_walkin_order($1::jsonb, null)`, [JSON.stringify({ vehicle_type: "sedan", service_id: svc })]);
  // Removing access: never the last login.
  eq((await solo.query(`select remove_staff_access('extra@ozshine.test') r`)).rows[0].r.startsWith("Access removed"), true);
  await expectError(solo.query(`select remove_staff_access('owner@ozshine.test')`), /last login/);
  await expectError(extraCall(`select admin_save('bays', null, '{"name":"Bay 6"}'::jsonb, null)`), /NOT_STAFF|not staff|staff/i);
});
await test("clear all data wipes bookings/customers/money, keeps the setup and logins", async () => {
  const svc = (await solo.query(`select id from services where name = 'OzShine Wash'`)).rows[0].id;
  await solo.exec(`insert into auth.users (id, email) values ('00000000-0000-4000-8000-0000000000cd', 'customer@example.com')`);
  const keepBefore = await solo.query(`select (select count(*) from services) s, (select count(*) from addons) a, (select count(*) from bays) b,
    (select count(*) from staff) st, (select count(*) from message_templates) t, (select count(*) from settings) se`);
  await expectError(soloCall(`select reset_shop_data('delete', true, null)`), "INVALID_INPUT");
  const r = await soloCall(`select reset_shop_data('DELETE EVERYTHING', true, null)`);
  ok(Number(r.bookings) > 0, "reported what it removed");
  eq(Number(r.customer_logins), 1, "customer login removed, staff kept");
  const after = (await solo.query(`select (select count(*) from bookings) b, (select count(*) from invoices) i, (select count(*) from payments) p,
    (select count(*) from customers) c, (select count(*) from customers where is_walkin_placeholder) w, (select count(*) from auth.users) u,
    (select last_number from invoice_counters limit 1) n, (select count(*) from audit_log where action = 'data.reset') a`)).rows[0];
  eq([Number(after.b), Number(after.i), Number(after.p), Number(after.c), Number(after.w), Number(after.a)], [0, 0, 0, 1, 1, 1]);
  eq(Number(after.n ?? 0), 0, "invoice numbers restart");
  const keepAfter = await solo.query(`select (select count(*) from services) s, (select count(*) from addons) a, (select count(*) from bays) b,
    (select count(*) from staff) st, (select count(*) from message_templates) t, (select count(*) from settings) se`);
  eq(keepAfter.rows[0], keepBefore.rows[0], "setup and logins untouched");
  // Still fully usable afterwards.
  const w = await soloCall(`select create_walkin_order($1::jsonb, null)`, [JSON.stringify({ vehicle_type: "sedan", service_id: svc })]);
  const inv = await soloCall(`select issue_invoice($1, null)`, [w.booking_id]);
  ok(inv, "invoices work after reset");
});

// ===========================================================================
// TEST 7 — the apps' TypeScript rules match the SQL
// ===========================================================================
suite("Test 7 · app helpers agree with the database");
const coreDir = (app) => join(here, `../../${app}/src/lib/core`);
await test("lib/core is identical in admin-app and customer-app", async () => {
  const { readdirSync } = await import("node:fs");
  const a = readdirSync(coreDir("admin-app")).sort();
  const c = readdirSync(coreDir("customer-app")).sort();
  eq(c, a, "same files");
  for (const f of a) {
    ok(readFileSync(join(coreDir("admin-app"), f), "utf8") === readFileSync(join(coreDir("customer-app"), f), "utf8"),
      `${f} differs between the apps — copy it across`);
  }
});
const phoneTs = await import(join(coreDir("admin-app"), "phone.ts"));
const moneyTs = await import(join(coreDir("admin-app"), "money.ts"));
const statusTs = await import(join(coreDir("admin-app"), "status.ts"));
await test("phone/rego normalisation: TS === SQL", async () => {
  const inputs = ["0412 345 678", "+61 412 345 678", "61412345678", "+61 0412 345 678", "412345678", "(07) 3123 4567",
    "0064 21 123 4567", "+1 415 555 0100", "", "  ", "12", "0412-345-678 ", "00", "+", "61 7 3123 4567", "0412345678901"];
  for (const i of inputs) {
    const sql = (await db.query(`select normalize_au_phone($1) n`, [i])).rows[0].n;
    eq(phoneTs.normalizeAuPhone(i), sql, JSON.stringify(i));
    const v = (await db.query(`select is_valid_phone(normalize_au_phone($1)) v`, [i])).rows[0].v;
    eq(phoneTs.isValidPhone(phoneTs.normalizeAuPhone(i)), v, `valid ${JSON.stringify(i)}`);
  }
  for (const r of ["abc 123", "ABC-123", "a.b c", "", "  ", "xyz\t789"]) {
    eq(phoneTs.normalizeRego(r), (await db.query(`select normalize_rego($1) r`, [r])).rows[0].r, JSON.stringify(r));
  }
});
await test("GST from inclusive totals: TS === SQL (every cent to $500)", async () => {
  const sql = (await db.query(`select c, (gst_from_inclusive(c / 100.0) * 100)::int g from generate_series(0, 50000) c`)).rows;
  const bad = sql.filter((r) => moneyTs.gstFromInclusiveCents(r.c) !== r.g);
  eq(bad.slice(0, 3), [], "mismatches");
});
await test("booking status flow: TS === SQL", async () => {
  for (const s of statusTs.BOOKING_STATUSES) {
    const sql = (await db.query(`select legal_next_statuses($1) n`, [s])).rows[0].n;
    eq(statusTs.legalNextStatuses(s), sql, s);
  }
  const holds = (await db.query(`select array_agg(s) a from unnest($1::text[]) s where holds_capacity(s)`, [statusTs.BOOKING_STATUSES])).rows[0].a;
  eq(statusTs.ACTIVE_BOOKING_STATUSES, holds);
});
await test("every database error code has a friendly message in the apps", async () => {
  const errorsSrc = readFileSync(join(coreDir("admin-app"), "errors.ts"), "utf8");
  const sqlSrc = read("../upgrade_v2.sql");
  const codes = new Set([...sqlSrc.matchAll(/oz_raise\('([A-Z_]+)'/g)].map((m) => m[1]));
  for (const c of ["ONLINE_BOOKING_OFF", "TOO_FAR", "CLOSED", "OUTSIDE_HOURS", "PAST", "TOO_SOON", "SLOT_TAKEN"]) codes.add(c);
  const missing = [...codes].filter((c) => !new RegExp(`\\b${c}:`).test(errorsSrc));
  eq(missing, [], "codes missing from ERROR_MESSAGES");
});

// ---------------------------------------------------------------------------
console.log(`\n${passed} passed, ${failed} failed`);
if (failed) {
  console.log("\nFailures:\n  " + failures.join("\n  "));
  process.exit(1);
}
