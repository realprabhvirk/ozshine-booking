-- =============================================================================
-- OzShine V2 — FRESH INSTALL SCHEMA
-- =============================================================================
-- ⚠️  FRESH INSTALL ONLY. THIS WIPES DATA. It drops and recreates every table.
-- Use it only for a brand-new, empty Supabase project.
--
-- To upgrade the EXISTING database (the one production uses), run
-- supabase/upgrade_v2.sql instead — that one is non-destructive.
--
-- GENERATED FILE — do not edit by hand. It is built by
-- supabase/tests/build-schema.mjs from the v1 base schema + upgrade_v2.sql,
-- so a fresh install always ends up identical to an upgraded database.
-- =============================================================================

-- Clean slate: v2 tables first, then the v1 tables below.
drop view if exists customer_directory;
drop table if exists voucher_redemptions cascade;
drop table if exists payments cascade;
drop table if exists invoice_items cascade;
drop table if exists invoices cascade;
drop table if exists invoice_counters cascade;
drop table if exists loyalty_rewards cascade;
drop table if exists loyalty_rules cascade;
drop table if exists vouchers cascade;
drop table if exists promo_codes cascade;
drop table if exists booking_addons cascade;
drop table if exists addons cascade;
drop table if exists message_outbox cascade;
drop table if exists campaigns cascade;
drop table if exists message_templates cascade;
drop table if exists automations cascade;
drop table if exists feedback cascade;
drop table if exists testimonials cascade;
drop table if exists waitlist cascade;
drop table if exists customer_notes cascade;
drop table if exists customer_events cascade;
drop table if exists audit_log cascade;
drop table if exists day_closes cascade;
drop table if exists rate_limits cascade;
drop table if exists staff_sessions cascade;
drop table if exists staff_pins cascade;
drop table if exists staff_invites cascade;
drop table if exists blackout_dates cascade;
drop table if exists bays cascade;
drop table if exists settings cascade;

-- -----------------------------------------------------------------------------
-- v1 base schema
-- -----------------------------------------------------------------------------
drop table if exists bookings cascade;
drop table if exists staff cascade;
drop table if exists vehicles cascade;
drop table if exists customers cascade;
drop table if exists services cascade;
drop table if exists locations cascade;

-- -----------------------------------------------------------------------------
-- Tables
-- -----------------------------------------------------------------------------

create table locations (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  address    text,
  phone      text,
  created_at timestamptz not null default now()
);

create table services (
  id                uuid primary key default gen_random_uuid(),
  location_id       uuid not null references locations(id) on delete cascade,
  name              text not null,
  -- price_from is the sedan/base rate — what's shown on the services page
  -- as the "from $X" starting price. The other three are nullable: a
  -- service that doesn't vary by vehicle size (nothing in the current
  -- catalog, but nothing stops one existing later) just leaves them null
  -- and every vehicle type falls back to price_from.
  price_from        numeric(10, 2) not null,
  price_small_wagon numeric(10, 2),
  price_van         numeric(10, 2),
  price_4wd         numeric(10, 2),
  description       text,
  sort_order        int not null default 0,
  created_at        timestamptz not null default now()
);

create table customers (
  id           uuid primary key default gen_random_uuid(),
  auth_user_id uuid references auth.users(id) on delete set null,
  name         text not null,
  phone        text not null unique,
  email        text,
  created_at   timestamptz not null default now()
);

create table vehicles (
  id           uuid primary key default gen_random_uuid(),
  customer_id  uuid not null references customers(id) on delete cascade,
  rego         text,
  make_model   text,
  vehicle_type text not null default 'sedan'
                 check (vehicle_type in ('sedan', 'small_wagon', 'van', '4wd')),
  notes        text,
  created_at   timestamptz not null default now()
);

create table staff (
  id           uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users(id) on delete cascade,
  location_id  uuid not null references locations(id) on delete restrict,
  name         text not null,
  role         text not null check (role in ('admin', 'staff')),
  created_at   timestamptz not null default now()
);

create table bookings (
  id                   uuid primary key default gen_random_uuid(),
  customer_id          uuid not null references customers(id) on delete cascade,
  vehicle_id           uuid references vehicles(id) on delete set null,
  service_id           uuid not null references services(id) on delete restrict,
  location_id          uuid not null references locations(id) on delete restrict,
  requested_date       date not null,
  requested_time       time not null,
  status               text not null default 'pending'
                         check (status in ('pending', 'approved', 'declined', 'completed')),
  amount_charged       numeric(10, 2),
  paid                 boolean not null default false,
  paid_at              timestamptz,
  processed_by_staff_id uuid references staff(id) on delete set null,
  created_at           timestamptz not null default now()
);

-- Helpful indexes for the lookups the admin app will do constantly.
create index idx_services_location on services(location_id);
create index idx_vehicles_customer on vehicles(customer_id);
create index idx_bookings_customer on bookings(customer_id);
create index idx_bookings_location_status on bookings(location_id, status);
create index idx_bookings_requested_date on bookings(requested_date);
create index idx_customers_phone on customers(phone);
create index idx_staff_auth_user on staff(auth_user_id);

-- -----------------------------------------------------------------------------
-- Realtime — the admin app's booking queue subscribes to this table so new
-- bookings appear instantly with no page refresh. Supabase ships a
-- `supabase_realtime` publication on every new project; this just adds our
-- table to it. Re-running this script re-adds it (the cascade drop above
-- removes the table from the publication along with everything else).
-- -----------------------------------------------------------------------------
alter publication supabase_realtime add table bookings;

-- -----------------------------------------------------------------------------
-- Seed data — Beenleigh only
--
-- Full 6-tier catalog, matching the real ozshinecarwash.com.au service
-- ladder (copy pulled directly from their site). If you're re-running this
-- on a database that already has bookings against the old 3-service seed,
-- see the note in the PR that added this — re-running this whole script
-- drops and recreates every table, wiping existing data.
-- -----------------------------------------------------------------------------

insert into locations (name, address, phone)
values ('OzShine Hand Car Wash — Beenleigh', 'Beenleigh, QLD', null);

-- Per-vehicle-type pricing (sedan / small wagon / van / 4WD) straight from
-- the shop's real price list. Correction & Coating isn't broken out by
-- vehicle type on that list, so it's flat — price_small_wagon/van/4wd stay
-- null there and every vehicle type falls back to price_from.
insert into services (location_id, name, price_from, price_small_wagon, price_van, price_4wd, description, sort_order)
select id, 'OzShine Wash', 40.00, 45.00, 60.00, 50.00, 'A refined basic exterior service featuring a meticulous hand wash, exterior window clarification and premium tyre shine.', 1
from locations where name = 'OzShine Hand Car Wash — Beenleigh';

insert into services (location_id, name, price_from, price_small_wagon, price_van, price_4wd, description, sort_order)
select id, 'Platinum Wash', 65.00, 75.00, 100.00, 85.00, 'A comprehensive interior and exterior treatment with the stronger, full-car finish most regulars want.', 2
from locations where name = 'OzShine Hand Car Wash — Beenleigh';

insert into services (location_id, name, price_from, price_small_wagon, price_van, price_4wd, description, sort_order)
select id, 'OzShine Polish', 120.00, 140.00, 180.00, 150.00, 'A restorative exterior service using clay bar treatment and professional polishing to restore paint clarity.', 3
from locations where name = 'OzShine Hand Car Wash — Beenleigh';

insert into services (location_id, name, price_from, price_small_wagon, price_van, price_4wd, description, sort_order)
select id, 'Interior Detail', 240.00, 260.00, 300.00, 280.00, 'A deep restorative clean for seats, carpets, mats and all the cabin surfaces that shape the driving experience.', 4
from locations where name = 'OzShine Hand Car Wash — Beenleigh';

insert into services (location_id, name, price_from, price_small_wagon, price_van, price_4wd, description, sort_order)
select id, 'OzShine Full Detail', 330.00, 350.00, 450.00, 400.00, 'The ultimate reset for your vehicle — combines OzShine Polish and Interior Detail, with optional engine bay cleaning and precision paint buffing.', 5
from locations where name = 'OzShine Hand Car Wash — Beenleigh';

insert into services (location_id, name, price_from, description, sort_order)
select id, 'Correction & Coating', 330.00, 'For drivers chasing deeper gloss and more durable surface protection — corrects clear coat imperfections and adds ceramic protection to exterior and interior surfaces.', 6
from locations where name = 'OzShine Hand Car Wash — Beenleigh';

-- -----------------------------------------------------------------------------
-- Row Level Security
-- -----------------------------------------------------------------------------

alter table locations enable row level security;
alter table services enable row level security;
alter table customers enable row level security;
alter table vehicles enable row level security;
alter table staff enable row level security;
alter table bookings enable row level security;

-- ---- locations / services: public read-only (the booking site needs these
-- ---- with no login), no public writes at all.

create policy "locations are publicly readable"
  on locations for select
  to anon, authenticated
  using (true);

create policy "services are publicly readable"
  on services for select
  to anon, authenticated
  using (true);

-- ---- staff: nobody public can read this, ever. A logged-in staff member can
-- ---- only read their OWN row (that's all the admin app needs — it uses this
-- ---- row to confirm "yes this auth user is staff" and to get their
-- ---- location_id + role after login).

create policy "staff can read own row"
  on staff for select
  to authenticated
  using (auth_user_id = auth.uid());

-- ---- customers: anon/guest can create a customer row (this is what makes
-- ---- guest booking work with no account). A logged-in customer can read and
-- ---- update only the row linked to their own auth account. Staff can read
-- ---- and update every customer row (single-location build, so no location
-- ---- scoping needed here — customers aren't location-scoped rows).

create policy "anyone can create a customer"
  on customers for insert
  to anon, authenticated
  with check (true);

create policy "customers can read own row"
  on customers for select
  to authenticated
  using (auth_user_id = auth.uid());

create policy "customers can update own row"
  on customers for update
  to authenticated
  using (auth_user_id = auth.uid())
  with check (auth_user_id = auth.uid());

create policy "staff can read all customers"
  on customers for select
  to authenticated
  using (exists (select 1 from staff where staff.auth_user_id = auth.uid()));

create policy "staff can update all customers"
  on customers for update
  to authenticated
  using (exists (select 1 from staff where staff.auth_user_id = auth.uid()))
  with check (exists (select 1 from staff where staff.auth_user_id = auth.uid()));

-- ---- vehicles: same shape as customers — anon can insert (booking form
-- ---- includes rego), owner can read/update their own vehicles via the
-- ---- parent customer row, staff can read/update all.

create policy "anyone can create a vehicle"
  on vehicles for insert
  to anon, authenticated
  with check (true);

create policy "customers can read own vehicles"
  on vehicles for select
  to authenticated
  using (
    exists (
      select 1 from customers
      where customers.id = vehicles.customer_id
        and customers.auth_user_id = auth.uid()
    )
  );

create policy "customers can update own vehicles"
  on vehicles for update
  to authenticated
  using (
    exists (
      select 1 from customers
      where customers.id = vehicles.customer_id
        and customers.auth_user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from customers
      where customers.id = vehicles.customer_id
        and customers.auth_user_id = auth.uid()
    )
  );

create policy "staff can read all vehicles"
  on vehicles for select
  to authenticated
  using (exists (select 1 from staff where staff.auth_user_id = auth.uid()));

create policy "staff can update all vehicles"
  on vehicles for update
  to authenticated
  using (exists (select 1 from staff where staff.auth_user_id = auth.uid()))
  with check (exists (select 1 from staff where staff.auth_user_id = auth.uid()));

-- ---- bookings: anon can insert (guest booking). Owner (via customers.auth_user_id)
-- ---- can read/update only their own bookings. Staff can read/update bookings
-- ---- scoped to their own location_id.

create policy "anyone can create a booking"
  on bookings for insert
  to anon, authenticated
  with check (true);

create policy "customers can read own bookings"
  on bookings for select
  to authenticated
  using (
    exists (
      select 1 from customers
      where customers.id = bookings.customer_id
        and customers.auth_user_id = auth.uid()
    )
  );

create policy "customers can update own bookings"
  on bookings for update
  to authenticated
  using (
    exists (
      select 1 from customers
      where customers.id = bookings.customer_id
        and customers.auth_user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from customers
      where customers.id = bookings.customer_id
        and customers.auth_user_id = auth.uid()
    )
  );

create policy "staff can read bookings at own location"
  on bookings for select
  to authenticated
  using (
    exists (
      select 1 from staff
      where staff.auth_user_id = auth.uid()
        and staff.location_id = bookings.location_id
    )
  );

create policy "staff can update bookings at own location"
  on bookings for update
  to authenticated
  using (
    exists (
      select 1 from staff
      where staff.auth_user_id = auth.uid()
        and staff.location_id = bookings.location_id
    )
  )
  with check (
    exists (
      select 1 from staff
      where staff.auth_user_id = auth.uid()
        and staff.location_id = bookings.location_id
    )
  );

-- -----------------------------------------------------------------------------
-- Account linking — lets a customer who just signed up (via the "save my
-- details" toggle on the booking form) attach their new Auth account to the
-- guest `customers` row that already has their booking history, matched by
-- phone number.
--
-- Why this needs SECURITY DEFINER: the RLS update policy on `customers`
-- only lets someone update a row where auth_user_id already equals their
-- own auth.uid() — which is circular for a first-time link, since that
-- column is still null on a guest row. This function is the one narrow,
-- controlled exception: it runs with elevated privilege but only ever
-- touches a row that (a) matches the phone number the caller provides and
-- (b) doesn't already belong to someone (auth_user_id is null), and only
-- ever sets that column to the caller's own auth.uid() — never anyone
-- else's, and never overwrites an existing link.
--
-- Trade-off worth knowing: like the phone-matching logic everywhere else in
-- this app, this trusts that knowing a phone number is enough to claim that
-- history. Fine for a demo; if this goes to production with real customers,
-- this is the first thing to revisit (e.g. gate it behind a verified phone
-- via SMS OTP instead).
-- -----------------------------------------------------------------------------
create or replace function public.claim_customer_by_phone(p_phone text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update customers
  set auth_user_id = auth.uid()
  where phone = p_phone
    and auth_user_id is null;
end;
$$;

revoke all on function public.claim_customer_by_phone(text) from public;
grant execute on function public.claim_customer_by_phone(text) to authenticated;

-- -----------------------------------------------------------------------------
-- v2 upgrade (identical to supabase/upgrade_v2.sql)
-- -----------------------------------------------------------------------------
-- =============================================================================
-- OzShine V2 "Shop OS" — DATABASE UPGRADE (non-destructive)
-- =============================================================================
-- WHAT THIS DOES
--   Upgrades an existing OzShine v1 database (the one the live apps on `main`
--   use today) to the v2 "Shop OS" structure: settings, bays, add-ons,
--   invoices + payments, loyalty, promos, vouchers, messaging, audit log,
--   day closes, staff PINs, and the RPCs both apps call.
--
-- IS IT SAFE?
--   * Additive only: `create ... if not exists`, `add column if not exists`,
--     `create or replace function`, `drop policy if exists` + `create policy`,
--     seeds that skip rows that already exist. No `drop table`, no
--     `truncate`, no deleting of customer/booking data when it runs. (The
--     one wipe, reset_shop_data(), only runs when the owner presses
--     Settings → Clear all data and types the confirmation.)
--   * Safe to re-run. Running it twice changes nothing the second time.
--   * Backwards-compatible with the v1 apps currently on `main`: every v1
--     column keeps its name and meaning, and the v1 RLS policies stay in place
--     until you run `post_merge_hardening.sql` (only after v2 is live).
--
-- HOW TO RUN
--   Supabase Dashboard → SQL Editor → New query → paste this whole file → Run.
--   This touches the SHARED database (the same one production uses).
--
-- Tested: see supabase/tests/run.mjs (replays the real v1 history, applies
-- this script twice, and checks RPCs + RLS in an in-process Postgres).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 0. Extensions. Supabase keeps these in the `extensions` schema.
-- -----------------------------------------------------------------------------
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
do $$
begin
  create extension if not exists pg_trgm with schema extensions;
exception when others then
  raise notice 'pg_trgm not available — fuzzy search falls back to ILIKE';
end $$;

-- -----------------------------------------------------------------------------
-- 1. Pure helper functions (no table access)
-- -----------------------------------------------------------------------------

-- Canonical AU phone: national digits only, e.g. "0412345678" / "0738071234".
-- Accepts "0412 345 678", "+61 412 345 678", "61412345678", "412345678".
-- Non-AU international numbers keep a leading "+" and their digits.
-- Returns null for empty input. Kept in sync with src/lib/normalize.ts.
create or replace function public.normalize_au_phone(p text)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  raw text := btrim(coalesce(p, ''));
  plus boolean := left(raw, 1) = '+' or left(raw, 2) = '00';
  d text := regexp_replace(raw, '[^0-9]', '', 'g');
begin
  if d = '' then
    return null;
  end if;
  if left(raw, 2) = '00' then
    d := substr(d, 3);
  end if;
  if left(d, 2) = '61' and (plus or length(d) = 11) then
    d := '0' || substr(d, 3);
    -- "+61 0412..." style double prefix
    if left(d, 2) = '00' then d := substr(d, 2); end if;
    return d;
  end if;
  if plus then
    return '+' || d;
  end if;
  if length(d) = 9 and left(d, 1) in ('2', '3', '4', '7', '8') then
    return '0' || d;
  end if;
  return d;
end;
$$;

-- True for a plausible AU number (10 digits starting 0) or an international
-- "+" number with 8–15 digits.
create or replace function public.is_valid_phone(p text)
returns boolean
language sql
immutable
set search_path = public
as $$
  select p is not null and (
    p ~ '^0[2-478][0-9]{8}$' or p ~ '^\+[1-9][0-9]{7,14}$'
  );
$$;

-- Rego: trim, uppercase, strip spaces and dashes. Null for empty.
create or replace function public.normalize_rego(p text)
returns text
language sql
immutable
set search_path = public
as $$
  select nullif(upper(regexp_replace(coalesce(p, ''), '[\s\-\.]', '', 'g')), '');
$$;

-- Random code from an unambiguous alphabet (no 0/O/1/I/L).
create or replace function public.gen_short_code(p_len int)
returns text
language plpgsql
volatile
set search_path = public
as $$
declare
  alphabet constant text := '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  result text := '';
  i int;
begin
  for i in 1..p_len loop
    result := result || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
  end loop;
  return result;
end;
$$;

-- GST contained in a GST-inclusive total, rounded half-up to the cent.
-- e.g. 65.00 → 5.91, 40.00 → 3.64, 330.00 → 30.00.
create or replace function public.gst_from_inclusive(p_total numeric, p_rate numeric default 0.10)
returns numeric
language sql
immutable
set search_path = public
as $$
  select round(coalesce(p_total, 0) * p_rate / (1 + p_rate), 2);
$$;

-- -----------------------------------------------------------------------------
-- 2. New tables
-- -----------------------------------------------------------------------------

-- One settings row per location. Everything shop-specific lives here so it
-- is editable in the admin app rather than hard-coded in components.
create table if not exists settings (
  id                        uuid primary key default gen_random_uuid(),
  location_id               uuid not null unique references locations(id) on delete cascade,
  business_name             text not null default 'OzShine Hand Car Wash',
  abn                       text,
  address                   text,
  phone                     text,
  email                     text,
  timezone                  text not null default 'Australia/Brisbane',
  -- {"mon":{"open":"08:00","close":"17:00","closed":false}, ...}
  opening_hours             jsonb not null default '{}'::jsonb,
  bay_count                 int not null default 3 check (bay_count between 1 and 50),
  slot_minutes              int not null default 30 check (slot_minutes in (10, 15, 20, 30, 45, 60)),
  max_concurrent_jobs       int check (max_concurrent_jobs is null or max_concurrent_jobs between 1 and 50),
  min_lead_minutes          int not null default 60 check (min_lead_minutes between 0 and 10080),
  max_advance_days          int not null default 60 check (max_advance_days between 1 and 365),
  cancel_cutoff_hours       int not null default 2 check (cancel_cutoff_hours between 0 and 168),
  require_approval          boolean not null default true,
  online_booking_enabled    boolean not null default true,
  tax_rate                  numeric(5, 4) not null default 0.10 check (tax_rate between 0 and 1),
  prices_include_gst        boolean not null default true,
  invoice_prefix            text not null default 'OZ' check (invoice_prefix ~ '^[A-Z0-9]{1,6}$'),
  invoice_footer            text,
  invoice_terms             text,
  closing_reminder_time     time not null default '17:30',
  idle_lock_minutes         int not null default 10 check (idle_lock_minutes between 1 and 240),
  manual_discount_admin_threshold numeric(10, 2) not null default 20.00,
  loyalty_enabled           boolean not null default true,
  loyalty_tiers             jsonb not null default
    '[{"name":"Bronze","min_visits":0},{"name":"Silver","min_visits":6},{"name":"Gold","min_visits":12},{"name":"Platinum","min_visits":24}]'::jsonb,
  display_key               text not null default encode(extensions.gen_random_bytes(18), 'hex'),
  display_messages          text[] not null default '{}',
  demo_banner               boolean not null default true,
  public_site_url           text,
  review_url                text,
  message_provider          text not null default 'demo' check (message_provider in ('demo', 'live')),
  cron_key_hash             text,
  alert_sound               text not null default 'chime' check (alert_sound in ('chime', 'bell', 'off')),
  alert_volume              numeric(3, 2) not null default 0.6 check (alert_volume between 0 and 1),
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);

create table if not exists blackout_dates (
  id           uuid primary key default gen_random_uuid(),
  location_id  uuid not null references locations(id) on delete cascade,
  date         date not null,
  reason       text not null default 'Closed',
  -- Null start/end = closed all day; otherwise a partial closure window.
  start_time   time,
  end_time     time,
  created_at   timestamptz not null default now(),
  check ((start_time is null) = (end_time is null)),
  check (start_time is null or start_time < end_time)
);
create unique index if not exists blackout_dates_full_day_uniq
  on blackout_dates(location_id, date) where start_time is null;
create index if not exists blackout_dates_date_idx on blackout_dates(location_id, date);

create table if not exists bays (
  id           uuid primary key default gen_random_uuid(),
  location_id  uuid not null references locations(id) on delete cascade,
  name         text not null,
  sort_order   int not null default 0,
  active       boolean not null default true,
  created_at   timestamptz not null default now()
);
create unique index if not exists bays_location_name_uniq on bays(location_id, lower(name));

create table if not exists addons (
  id                uuid primary key default gen_random_uuid(),
  location_id       uuid not null references locations(id) on delete cascade,
  name              text not null,
  description       text,
  price             numeric(10, 2) not null check (price >= 0),
  duration_minutes  int not null default 15 check (duration_minutes between 0 and 600),
  active            boolean not null default true,
  sort_order        int not null default 0,
  created_at        timestamptz not null default now()
);
create unique index if not exists addons_location_name_uniq on addons(location_id, lower(name));

-- Staff PINs live in their own table (not a column on `staff`) so the v1
-- admin code's `select * from staff` keeps working and the hash can never be
-- read by any client: RLS is on with NO policies, so only SECURITY DEFINER
-- functions below can touch it.
create table if not exists staff_pins (
  staff_id         uuid primary key references staff(id) on delete cascade,
  pin_hash         text not null,
  failed_attempts  int not null default 0,
  locked_until     timestamptz,
  updated_at       timestamptz not null default now()
);

-- "Acting as" sessions created when someone enters their PIN on the shared
-- tablet. Every floor/money RPC takes the session token and resolves it to a
-- staff id here, so attribution is enforced by the database, not the UI.
create table if not exists staff_sessions (
  token          uuid primary key default gen_random_uuid(),
  staff_id       uuid not null references staff(id) on delete cascade,
  auth_user_id   uuid not null,
  created_at     timestamptz not null default now(),
  last_seen_at   timestamptz not null default now(),
  expires_at     timestamptz not null,
  ended_at       timestamptz
);
create index if not exists staff_sessions_staff_idx on staff_sessions(staff_id);

create table if not exists staff_invites (
  id          uuid primary key default gen_random_uuid(),
  location_id uuid not null references locations(id) on delete cascade,
  email       text not null,
  name        text not null,
  role        text not null default 'staff' check (role in ('admin', 'staff')),
  created_by  uuid references staff(id) on delete set null,
  created_at  timestamptz not null default now(),
  claimed_at  timestamptz,
  claimed_by_staff_id uuid references staff(id) on delete set null
);
create unique index if not exists staff_invites_open_email_uniq
  on staff_invites(lower(email)) where claimed_at is null;

create table if not exists booking_addons (
  id              uuid primary key default gen_random_uuid(),
  booking_id      uuid not null references bookings(id) on delete cascade,
  addon_id        uuid references addons(id) on delete set null,
  name_snapshot   text not null,
  price_snapshot  numeric(10, 2) not null check (price_snapshot >= 0),
  duration_snapshot int not null default 0,
  created_at      timestamptz not null default now()
);
create index if not exists booking_addons_booking_idx on booking_addons(booking_id);

create table if not exists promo_codes (
  id               uuid primary key default gen_random_uuid(),
  location_id      uuid not null references locations(id) on delete cascade,
  code             text not null check (code ~ '^[A-Z0-9_-]{3,24}$'),
  description      text,
  type             text not null check (type in ('percent', 'fixed')),
  value            numeric(10, 2) not null check (value > 0),
  min_spend        numeric(10, 2) not null default 0,
  valid_from       date,
  valid_to         date,
  max_uses         int check (max_uses is null or max_uses > 0),
  used_count       int not null default 0,
  active           boolean not null default true,
  service_ids      uuid[],
  first_visit_only boolean not null default false,
  created_at       timestamptz not null default now(),
  check (type <> 'percent' or value <= 100)
);
create unique index if not exists promo_codes_code_uniq on promo_codes(location_id, upper(code));

create table if not exists loyalty_rules (
  id                  uuid primary key default gen_random_uuid(),
  location_id         uuid not null references locations(id) on delete cascade,
  kind                text not null default 'visits' check (kind in ('visits', 'referral')),
  name                text not null,
  visits_required     int check (visits_required is null or visits_required > 0),
  reward_type         text not null check (reward_type in ('percent', 'fixed', 'free_addon', 'free_service')),
  reward_value        numeric(10, 2),
  reward_addon_id     uuid references addons(id) on delete set null,
  reward_service_id   uuid references services(id) on delete set null,
  -- Services the reward can be used on (null = any service).
  eligible_service_ids uuid[],
  expires_after_days  int check (expires_after_days is null or expires_after_days > 0),
  repeat              boolean not null default true,
  active              boolean not null default true,
  created_at          timestamptz not null default now(),
  check (kind <> 'visits' or visits_required is not null)
);
create unique index if not exists loyalty_rules_name_uniq on loyalty_rules(location_id, kind, lower(name));

create table if not exists loyalty_rewards (
  id                  uuid primary key default gen_random_uuid(),
  customer_id         uuid not null references customers(id) on delete cascade,
  rule_id             uuid references loyalty_rules(id) on delete set null,
  -- The completed-visit count (or referred customer id text) that earned it:
  -- unique per rule so the same milestone can never be awarded twice.
  milestone           text not null,
  code                text not null unique,
  description         text not null,
  reward_type         text not null check (reward_type in ('percent', 'fixed', 'free_addon', 'free_service')),
  reward_value        numeric(10, 2),
  reward_addon_id     uuid references addons(id) on delete set null,
  reward_service_id   uuid references services(id) on delete set null,
  eligible_service_ids uuid[],
  status              text not null default 'issued' check (status in ('issued', 'redeemed', 'expired', 'void')),
  issued_at           timestamptz not null default now(),
  expires_at          timestamptz,
  redeemed_at         timestamptz,
  redeemed_invoice_id uuid,
  is_demo             boolean not null default false
);
create unique index if not exists loyalty_rewards_milestone_uniq on loyalty_rewards(customer_id, rule_id, milestone);
create index if not exists loyalty_rewards_customer_idx on loyalty_rewards(customer_id, status);

create table if not exists vouchers (
  id                     uuid primary key default gen_random_uuid(),
  location_id            uuid not null references locations(id) on delete cascade,
  code                   text not null,
  initial_value          numeric(10, 2) not null check (initial_value > 0),
  balance                numeric(10, 2) not null check (balance >= 0),
  issued_to_customer_id  uuid references customers(id) on delete set null,
  expires_at             date,
  status                 text not null default 'active' check (status in ('active', 'used', 'expired', 'void')),
  note                   text,
  created_by             uuid references staff(id) on delete set null,
  created_at             timestamptz not null default now(),
  is_demo                boolean not null default false,
  check (balance <= initial_value)
);
create unique index if not exists vouchers_code_uniq on vouchers(location_id, upper(code));

create table if not exists invoice_counters (
  location_id  uuid primary key references locations(id) on delete cascade,
  last_number  int not null default 0
);

create table if not exists invoices (
  id                   uuid primary key default gen_random_uuid(),
  location_id          uuid not null references locations(id) on delete restrict,
  number               text,
  booking_id           uuid references bookings(id) on delete set null,
  customer_id          uuid references customers(id) on delete set null,
  status               text not null default 'draft' check (status in ('draft', 'issued', 'partial', 'paid', 'void')),
  subtotal             numeric(10, 2) not null default 0,
  discount_total       numeric(10, 2) not null default 0,
  gst_amount           numeric(10, 2) not null default 0,
  total                numeric(10, 2) not null default 0,
  amount_paid          numeric(10, 2) not null default 0,
  balance_due          numeric(10, 2) not null default 0,
  promo_code_id        uuid references promo_codes(id) on delete set null,
  loyalty_reward_id    uuid references loyalty_rewards(id) on delete set null,
  public_token         uuid not null default gen_random_uuid(),
  issued_at            timestamptz,
  due_at               timestamptz,
  voided_at            timestamptz,
  void_reason          text,
  created_by_staff_id  uuid references staff(id) on delete set null,
  notes                text,
  is_demo              boolean not null default false,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create unique index if not exists invoices_number_uniq on invoices(location_id, number) where number is not null;
create unique index if not exists invoices_public_token_uniq on invoices(public_token);
-- One live (non-void) invoice per booking.
create unique index if not exists invoices_booking_live_uniq on invoices(booking_id) where booking_id is not null and status <> 'void';
create index if not exists invoices_customer_idx on invoices(customer_id, status);
create index if not exists invoices_status_idx on invoices(location_id, status, issued_at);

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'loyalty_rewards_redeemed_invoice_fk') then
    alter table loyalty_rewards
      add constraint loyalty_rewards_redeemed_invoice_fk
      foreign key (redeemed_invoice_id) references invoices(id) on delete set null;
  end if;
end $$;

create table if not exists invoice_items (
  id           uuid primary key default gen_random_uuid(),
  invoice_id   uuid not null references invoices(id) on delete cascade,
  kind         text not null check (kind in ('service', 'addon', 'custom', 'discount')),
  description  text not null,
  quantity     numeric(10, 2) not null default 1 check (quantity > 0),
  unit_price   numeric(10, 2) not null,
  line_total   numeric(10, 2) not null,
  sort         int not null default 0,
  created_by_staff_id uuid references staff(id) on delete set null,
  created_at   timestamptz not null default now(),
  -- Discounts are negative; everything else is non-negative.
  check ((kind = 'discount' and line_total <= 0) or (kind <> 'discount' and line_total >= 0))
);
create index if not exists invoice_items_invoice_idx on invoice_items(invoice_id);

create table if not exists payments (
  id                   uuid primary key default gen_random_uuid(),
  invoice_id           uuid not null references invoices(id) on delete restrict,
  -- Negative amount = refund.
  amount               numeric(10, 2) not null check (amount <> 0),
  method               text not null check (method in ('cash', 'eftpos', 'bank_transfer', 'voucher', 'other')),
  reference            text,
  voucher_id           uuid references vouchers(id) on delete set null,
  refund_of_payment_id uuid references payments(id) on delete set null,
  received_by_staff_id uuid references staff(id) on delete set null,
  received_at          timestamptz not null default now(),
  note                 text,
  idempotency_key      text,
  is_demo              boolean not null default false
);
create unique index if not exists payments_idempotency_uniq on payments(idempotency_key) where idempotency_key is not null;
create index if not exists payments_invoice_idx on payments(invoice_id);
create index if not exists payments_received_idx on payments(received_at);
-- Cash payments: what the customer handed over and the change given back,
-- so receipts can show it (set by set_payment_tendered right after payment).
alter table payments add column if not exists tendered numeric(10, 2);
alter table payments add column if not exists change_given numeric(10, 2);

create table if not exists voucher_redemptions (
  id          uuid primary key default gen_random_uuid(),
  voucher_id  uuid not null references vouchers(id) on delete cascade,
  payment_id  uuid references payments(id) on delete set null,
  amount      numeric(10, 2) not null,
  created_at  timestamptz not null default now()
);

create table if not exists message_templates (
  id          uuid primary key default gen_random_uuid(),
  key         text not null,
  channel     text not null check (channel in ('sms', 'email')),
  name        text not null,
  -- Transactional messages always send; marketing ones respect opt-out.
  category    text not null default 'transactional' check (category in ('transactional', 'marketing')),
  subject     text,
  body        text not null,
  active      boolean not null default true,
  updated_at  timestamptz not null default now()
);
create unique index if not exists message_templates_key_uniq on message_templates(key, channel);

create table if not exists campaigns (
  id            uuid primary key default gen_random_uuid(),
  location_id   uuid not null references locations(id) on delete cascade,
  name          text not null,
  channel       text not null check (channel in ('sms', 'email')),
  template_key  text,
  subject       text,
  body          text,
  segment       jsonb not null default '{}'::jsonb,
  status        text not null default 'draft' check (status in ('draft', 'scheduled', 'sent')),
  scheduled_for timestamptz,
  created_by    uuid references staff(id) on delete set null,
  sent_at       timestamptz,
  stats         jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);

create table if not exists message_outbox (
  id             uuid primary key default gen_random_uuid(),
  customer_id    uuid references customers(id) on delete set null,
  booking_id     uuid references bookings(id) on delete set null,
  invoice_id     uuid references invoices(id) on delete set null,
  campaign_id    uuid references campaigns(id) on delete set null,
  channel        text not null check (channel in ('sms', 'email')),
  template_key   text,
  to_address     text,
  subject        text,
  body           text not null,
  status         text not null default 'queued'
                   check (status in ('queued', 'simulated_sent', 'sent', 'failed', 'skipped_opt_out', 'skipped_no_contact')),
  provider       text,
  provider_id    text,
  error          text,
  dedupe_key     text,
  scheduled_for  timestamptz not null default now(),
  sent_at        timestamptz,
  created_by     uuid references staff(id) on delete set null,
  is_demo        boolean not null default false,
  created_at     timestamptz not null default now()
);
create unique index if not exists message_outbox_dedupe_uniq on message_outbox(dedupe_key) where dedupe_key is not null;
create index if not exists message_outbox_status_idx on message_outbox(status, scheduled_for);
create index if not exists message_outbox_customer_idx on message_outbox(customer_id, created_at desc);

create table if not exists automations (
  key         text primary key,
  name        text not null,
  enabled     boolean not null default true,
  config      jsonb not null default '{}'::jsonb,
  last_run_at timestamptz,
  last_run_count int not null default 0,
  updated_at  timestamptz not null default now()
);

create table if not exists feedback (
  id           uuid primary key default gen_random_uuid(),
  booking_id   uuid not null unique references bookings(id) on delete cascade,
  customer_id  uuid references customers(id) on delete set null,
  rating       int not null check (rating between 1 and 5),
  comment      text check (comment is null or length(comment) <= 2000),
  handled_at   timestamptz,
  handled_by   uuid references staff(id) on delete set null,
  is_demo      boolean not null default false,
  created_at   timestamptz not null default now()
);

create table if not exists testimonials (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  text        text not null,
  rating      int check (rating between 1 and 5),
  published   boolean not null default false,
  sort        int not null default 0,
  created_at  timestamptz not null default now()
);

create table if not exists waitlist (
  id           uuid primary key default gen_random_uuid(),
  location_id  uuid not null references locations(id) on delete cascade,
  name         text not null,
  phone        text not null,
  date         date not null,
  service_id   uuid references services(id) on delete set null,
  note         text,
  notified_at  timestamptz,
  created_at   timestamptz not null default now()
);
create index if not exists waitlist_date_idx on waitlist(location_id, date);

create table if not exists customer_notes (
  id           uuid primary key default gen_random_uuid(),
  customer_id  uuid not null references customers(id) on delete cascade,
  body         text not null check (length(body) between 1 and 4000),
  staff_id     uuid references staff(id) on delete set null,
  created_at   timestamptz not null default now()
);
create index if not exists customer_notes_customer_idx on customer_notes(customer_id, created_at desc);

create table if not exists customer_events (
  id           uuid primary key default gen_random_uuid(),
  customer_id  uuid not null references customers(id) on delete cascade,
  kind         text not null,
  summary      text not null,
  booking_id   uuid references bookings(id) on delete set null,
  invoice_id   uuid references invoices(id) on delete set null,
  actor_staff_id uuid references staff(id) on delete set null,
  created_at   timestamptz not null default now()
);
create index if not exists customer_events_customer_idx on customer_events(customer_id, created_at desc);

create table if not exists audit_log (
  id              uuid primary key default gen_random_uuid(),
  location_id     uuid references locations(id) on delete set null,
  actor_staff_id  uuid references staff(id) on delete set null,
  action          text not null,
  entity          text not null,
  entity_id       uuid,
  before          jsonb,
  after           jsonb,
  created_at      timestamptz not null default now()
);
create index if not exists audit_log_created_idx on audit_log(created_at desc);
create index if not exists audit_log_entity_idx on audit_log(entity, entity_id);

create table if not exists day_closes (
  id                  uuid primary key default gen_random_uuid(),
  location_id         uuid not null references locations(id) on delete cascade,
  business_date       date not null,
  cars_completed      int not null default 0,
  revenue_total       numeric(10, 2) not null default 0,
  expected_cash       numeric(10, 2) not null default 0,
  counted_cash        numeric(10, 2),
  variance            numeric(10, 2),
  eftpos_total        numeric(10, 2) not null default 0,
  other_totals        jsonb not null default '{}'::jsonb,
  outstanding_created numeric(10, 2) not null default 0,
  refunds_total       numeric(10, 2) not null default 0,
  voids_count         int not null default 0,
  notes               text,
  closed_by_staff_id  uuid references staff(id) on delete set null,
  closed_at           timestamptz not null default now(),
  reopened_at         timestamptz,
  unique (location_id, business_date)
);

create table if not exists rate_limits (
  bucket      text not null,
  key         text not null,
  window_start timestamptz not null default now(),
  hits        int not null default 0,
  primary key (bucket, key)
);

-- -----------------------------------------------------------------------------
-- 3. New columns on existing v1 tables (all additive)
-- -----------------------------------------------------------------------------

alter table locations add column if not exists active boolean not null default true;

alter table services add column if not exists duration_minutes int not null default 60;
alter table services add column if not exists active boolean not null default true;
alter table services add column if not exists badge text;
alter table services add column if not exists includes text[] not null default '{}';
alter table services add column if not exists requires_quote boolean not null default false;
alter table services add column if not exists tagline text;
alter table services add column if not exists category text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'services_duration_check') then
    alter table services add constraint services_duration_check check (duration_minutes between 5 and 1440);
  end if;
end $$;

alter table customers add column if not exists tags text[] not null default '{}';
alter table customers add column if not exists notes text;
alter table customers add column if not exists marketing_opt_in boolean not null default true;
alter table customers add column if not exists referral_code text;
alter table customers add column if not exists referred_by_customer_id uuid references customers(id) on delete set null;
alter table customers add column if not exists is_walkin_placeholder boolean not null default false;
alter table customers add column if not exists merged_into_customer_id uuid references customers(id) on delete set null;
alter table customers add column if not exists is_vip boolean not null default false;
alter table customers add column if not exists anonymised_at timestamptz;
alter table customers add column if not exists is_demo boolean not null default false;
alter table customers add column if not exists updated_at timestamptz not null default now();
create unique index if not exists customers_referral_code_uniq on customers(referral_code) where referral_code is not null;

alter table vehicles add column if not exists nickname text;
alter table vehicles add column if not exists colour text;
alter table vehicles add column if not exists year int;
alter table vehicles add column if not exists is_primary boolean not null default false;
alter table vehicles add column if not exists is_demo boolean not null default false;
-- v1 added vehicle_type via a pasted snippet, so it may be nullable there.
update vehicles set vehicle_type = 'sedan' where vehicle_type is null;
alter table vehicles alter column vehicle_type set default 'sedan';
alter table vehicles alter column vehicle_type set not null;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'vehicles_year_check') then
    alter table vehicles add constraint vehicles_year_check check (year is null or year between 1900 and 2100);
  end if;
end $$;

alter table staff add column if not exists active boolean not null default true;
alter table staff add column if not exists color text not null default '#c61b1f';
alter table staff add column if not exists avatar_initials text;
alter table staff add column if not exists email text;

alter table bookings add column if not exists reference_code text;
alter table bookings add column if not exists manage_token uuid not null default gen_random_uuid();
alter table bookings add column if not exists bay_id uuid references bays(id) on delete set null;
alter table bookings add column if not exists assigned_staff_id uuid references staff(id) on delete set null;
alter table bookings add column if not exists source text not null default 'web';
alter table bookings add column if not exists customer_notes text;
alter table bookings add column if not exists internal_notes text;
alter table bookings add column if not exists duration_minutes int;
alter table bookings add column if not exists starts_at timestamptz;
alter table bookings add column if not exists ends_at timestamptz;
alter table bookings add column if not exists approved_at timestamptz;
alter table bookings add column if not exists checked_in_at timestamptz;
alter table bookings add column if not exists started_at timestamptz;
alter table bookings add column if not exists ready_at timestamptz;
alter table bookings add column if not exists completed_at timestamptz;
alter table bookings add column if not exists cancelled_at timestamptz;
alter table bookings add column if not exists declined_at timestamptz;
alter table bookings add column if not exists cancel_reason text;
alter table bookings add column if not exists decline_reason text;
alter table bookings add column if not exists promo_code_id uuid references promo_codes(id) on delete set null;
alter table bookings add column if not exists loyalty_reward_id uuid references loyalty_rewards(id) on delete set null;
alter table bookings add column if not exists vehicle_type text;
alter table bookings add column if not exists service_price numeric(10, 2);
alter table bookings add column if not exists price_estimate numeric(10, 2);
alter table bookings add column if not exists discount_estimate numeric(10, 2) not null default 0;
alter table bookings add column if not exists manual_discount numeric(10, 2) not null default 0;
alter table bookings add column if not exists manual_discount_reason text;
alter table bookings add column if not exists is_demo boolean not null default false;
alter table bookings add column if not exists updated_at timestamptz not null default now();

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'bookings_source_check') then
    alter table bookings add constraint bookings_source_check check (source in ('web', 'walk_in', 'phone', 'admin'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'bookings_vehicle_type_check') then
    alter table bookings add constraint bookings_vehicle_type_check
      check (vehicle_type is null or vehicle_type in ('sedan', 'small_wagon', 'van', '4wd'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'bookings_manual_discount_check') then
    alter table bookings add constraint bookings_manual_discount_check check (manual_discount >= 0);
  end if;
end $$;

-- Full booking lifecycle. v1 only ever writes the original four values, so
-- widening the allowed set is backwards-compatible.
alter table bookings drop constraint if exists bookings_status_check;
alter table bookings add constraint bookings_status_check check (status in (
  'pending', 'approved', 'checked_in', 'in_progress', 'ready',
  'completed', 'declined', 'cancelled', 'no_show'
));

-- Walk-ins may have no phone. Swap the plain unique constraint for a partial
-- unique index (still one customer per phone, but nulls allowed).
alter table customers alter column phone drop not null;

-- -----------------------------------------------------------------------------
-- 4. Backfill existing v1 data (idempotent)
-- -----------------------------------------------------------------------------

-- 4a. Normalise existing phone numbers to the canonical form. A row is only
-- rewritten if its normalised value isn't already used by another customer
-- (those rare collisions are left as-is and can be merged in the admin app).
do $$
declare
  r record;
  n text;
  skipped int := 0;
begin
  for r in select id, phone from customers where phone is not null loop
    n := normalize_au_phone(r.phone);
    if n is distinct from r.phone then
      if n is null or exists (select 1 from customers c where c.phone = n and c.id <> r.id) then
        skipped := skipped + 1;
      else
        update customers set phone = n where id = r.id;
      end if;
    end if;
  end loop;
  if skipped > 0 then
    raise notice '% customer phone(s) left un-normalised because another customer already has that number — merge them in the admin app', skipped;
  end if;
end $$;

alter table customers drop constraint if exists customers_phone_key;
create unique index if not exists customers_phone_uniq on customers(phone) where phone is not null;

update vehicles set rego = normalize_rego(rego)
where rego is not null and rego is distinct from normalize_rego(rego);

create index if not exists vehicles_rego_idx on vehicles(rego);
create index if not exists vehicles_customer_rego_idx on vehicles(customer_id, rego);
create index if not exists customers_auth_user_idx on customers(auth_user_id);
create index if not exists customers_name_lower_idx on customers(lower(name));
create index if not exists bookings_customer_status_idx on bookings(customer_id, status);
create index if not exists bookings_starts_at_idx on bookings(location_id, starts_at);
create index if not exists bookings_created_at_idx on bookings(created_at);
create unique index if not exists bookings_reference_code_uniq on bookings(reference_code) where reference_code is not null;
create unique index if not exists bookings_manage_token_uniq on bookings(manage_token);

-- Trigram indexes for fast "type anything" search in the admin (only if the
-- pg_trgm extension is available).
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_trgm') then
    execute 'create index if not exists customers_name_trgm_idx on customers using gin (name extensions.gin_trgm_ops)';
    execute 'create index if not exists customers_phone_trgm_idx on customers using gin (phone extensions.gin_trgm_ops)';
    execute 'create index if not exists vehicles_rego_trgm_idx on vehicles using gin (rego extensions.gin_trgm_ops)';
  end if;
end $$;

-- 4b. Service metadata (only fills blanks — never overwrites an admin's edits).
update services set duration_minutes = 45,  category = 'Exterior Maintenance',
  tagline = 'The quick, meticulous hand wash.',
  includes = array['Hand wash finish', 'Exterior windows cleaned', 'Tyre shine applied']
  where name = 'OzShine Wash' and tagline is null;
update services set duration_minutes = 75,  category = 'Exterior Maintenance', badge = 'Most popular',
  tagline = 'Inside and out — the one most regulars book.',
  includes = array['Exterior hand wash', 'Interior vacuum and rejuvenation', 'Wheels, windows and tyre shine']
  where name = 'Platinum Wash' and tagline is null;
update services set duration_minutes = 150, category = 'Gloss Enhancement',
  tagline = 'Clay bar and hand polish for real depth.',
  includes = array['Clay bar decontamination', 'Hand polish finish', 'Boosted surface gloss']
  where name = 'OzShine Polish' and tagline is null;
update services set duration_minutes = 180, category = 'Cabin Restoration',
  tagline = 'A deep reset for seats, carpets and trims.',
  includes = array['Steam extraction', 'Detailed compartments and trims', 'Leather conditioning where applicable']
  where name = 'Interior Detail' and tagline is null;
update services set duration_minutes = 360, category = 'Featured Package', badge = 'Best value',
  tagline = 'Polish plus interior detail — the full reset.',
  includes = array['Combines OzShine Polish and Interior Detail', 'Optional engine bay cleaning', 'Optional precision paint buffing']
  where name = 'OzShine Full Detail' and tagline is null;
update services set duration_minutes = 480, category = 'Long-Term Protection', requires_quote = true,
  tagline = 'Correction and ceramic protection, priced on inspection.',
  includes = array['Corrects visible clear coat imperfections', 'Enhances depth and gloss across the paintwork', 'Ceramic protection for exterior and interior surfaces']
  where name = 'Correction & Coating' and tagline is null;

-- The very first v1 seed used short placeholder descriptions. Swap those for
-- the real copy (again: only if still the untouched placeholder text).
update services set description = 'A refined basic exterior service featuring a meticulous hand wash, exterior window clarification and premium tyre shine.'
  where name = 'OzShine Wash' and description = 'Our signature hand wash.';
update services set description = 'A comprehensive interior and exterior treatment with the stronger, full-car finish most regulars want.'
  where name = 'Platinum Wash' and description = 'Our most popular wash — the full works.';
update services set description = 'The ultimate reset for your vehicle — combines OzShine Polish and Interior Detail, with optional engine bay cleaning and precision paint buffing.'
  where name = 'OzShine Full Detail' and description = 'Complete interior + exterior detail.';

-- 4c. Location + settings row (published business details).
update locations set address = '114-118 George St, Beenleigh QLD 4207'
  where address is null or address = 'Beenleigh, QLD';
update locations set phone = '0449 558 449' where phone is null;

insert into settings (location_id, business_name, address, phone, opening_hours, invoice_footer, invoice_terms, display_messages)
select l.id, 'OzShine Hand Car Wash', '114-118 George St, Beenleigh QLD 4207', '0449 558 449',
  '{"mon":{"open":"08:00","close":"17:00","closed":false},
    "tue":{"open":"08:00","close":"17:00","closed":false},
    "wed":{"open":"08:00","close":"17:00","closed":false},
    "thu":{"open":"08:00","close":"17:00","closed":false},
    "fri":{"open":"08:00","close":"17:00","closed":false},
    "sat":{"open":"08:00","close":"16:00","closed":false},
    "sun":{"open":"09:00","close":"15:00","closed":false}}'::jsonb,
  'Thanks for choosing OzShine Beenleigh. Prices include GST.',
  'Payment is due on collection unless otherwise agreed.',
  array['Ask us about the OzShine Full Detail — polish plus interior in one visit.',
        'Every 6th visit earns a reward. Ask the team about loyalty.',
        'Gift vouchers available at the counter.']
from locations l
where not exists (select 1 from settings s where s.location_id = l.id);

insert into invoice_counters (location_id)
select id from locations on conflict do nothing;

-- 4d. Bays (three to start; editable in Settings).
insert into bays (location_id, name, sort_order)
select l.id, b.name, b.sort
from locations l
cross join (values ('Bay 1', 1), ('Bay 2', 2), ('Bay 3', 3)) as b(name, sort)
where not exists (select 1 from bays x where x.location_id = l.id);

-- 4e. Shared "Walk-in Guest" customer for walk-ups who don't leave details.
insert into customers (name, phone, is_walkin_placeholder, marketing_opt_in)
select 'Walk-in Guest', null, true, false
where not exists (select 1 from customers where is_walkin_placeholder);

-- 4e2. The shop runs on ONE owner login. If a location has exactly one
-- active staff account and no admin, make that account the admin so it can
-- reach settings, refunds and reports.
update staff s set role = 'admin'
where s.active
  and (select count(*) from staff x where x.location_id = s.location_id and x.active) = 1
  and not exists (select 1 from staff x where x.location_id = s.location_id and x.role = 'admin');

-- 4f. Referral codes for every customer that doesn't have one yet.
do $$
declare r record; c text;
begin
  for r in select id from customers where referral_code is null and not is_walkin_placeholder loop
    loop
      c := gen_short_code(6);
      exit when not exists (select 1 from customers where referral_code = c);
    end loop;
    update customers set referral_code = c where id = r.id;
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- 5. Core helpers that read tables
-- -----------------------------------------------------------------------------

-- Single-location build (Beenleigh). Everything is still keyed by
-- location_id so a second store could be added later without a rewrite.
create or replace function public.default_location_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from locations order by created_at, id limit 1;
$$;

create or replace function public.shop_tz()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select timezone from settings where location_id = default_location_id()), 'Australia/Brisbane');
$$;

-- "Today" in the shop's timezone — never the server's UTC date.
create or replace function public.shop_today()
returns date
language sql
stable
set search_path = public
as $$
  select (now() at time zone shop_tz())::date;
$$;

-- A shop-local date + time → absolute timestamp.
create or replace function public.shop_ts(p_date date, p_time time)
returns timestamptz
language sql
stable
set search_path = public
as $$
  select (p_date + p_time) at time zone shop_tz();
$$;

-- Staff identity helpers. SECURITY DEFINER so they can be used inside RLS
-- policies on other tables without recursive policy evaluation.
create or replace function public.current_staff_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from staff where auth_user_id = auth.uid() and active limit 1;
$$;

create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from staff where auth_user_id = auth.uid() and active);
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from staff where auth_user_id = auth.uid() and active and role = 'admin');
$$;

create or replace function public.staff_location_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select location_id from staff where auth_user_id = auth.uid() and active limit 1;
$$;

create or replace function public.current_customer_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from customers
  where auth_user_id = auth.uid() and merged_into_customer_id is null
  order by created_at limit 1;
$$;

-- Friendly, machine-readable errors. The message is a stable code the apps
-- map to UI states; `detail` is a human sentence they can show as-is.
create or replace function public.oz_raise(p_code text, p_detail text)
returns void
language plpgsql
set search_path = public
as $$
begin
  raise exception using errcode = 'P0001', message = p_code, detail = p_detail;
end;
$$;

-- Must be logged in as an active staff member.
create or replace function public.require_staff()
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare sid uuid := current_staff_id();
begin
  if sid is null then
    perform oz_raise('NOT_STAFF', 'You need to be signed in as staff to do that.');
  end if;
  return sid;
end;
$$;

-- Resolve an "acting as" PIN session to a staff id. Every floor and money
-- RPC calls this, so actions are always attributed to the person who entered
-- their PIN — not just whoever the tablet is logged in as.
-- PINs are only needed when more than one person works under the shop login.
create or replace function public.pin_mode_enabled()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  -- Owner's decision: every login is an equal admin and changes are recorded
  -- against the login itself, so per-person PINs stay switched off however
  -- many logins exist. (The PIN machinery is kept for a possible future.)
  select false;
$$;

create or replace function public.resolve_actor(p_actor uuid, p_require_admin boolean default false)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  s record;
  st record;
  idle int;
begin
  perform require_staff();
  if p_actor is null then
    -- Solo mode: while the shop has a single active staff login (the owner's
    -- admin account) there's nobody to tell apart, so the login itself is the
    -- actor and no PIN is needed. PINs switch on automatically as soon as a
    -- second active staff member exists.
    if pin_mode_enabled() then
      perform oz_raise('PIN_REQUIRED', 'Tap "Who''s working?" and enter your PIN first.');
    end if;
    select * into st from staff where auth_user_id = auth.uid() and active limit 1;
    if p_require_admin and st.role <> 'admin' then
      perform oz_raise('ADMIN_REQUIRED', 'Only an admin can do that.');
    end if;
    perform set_config('oz.actor_staff_id', st.id::text, true);
    return st.id;
  end if;
  select * into s from staff_sessions
  where token = p_actor and ended_at is null and auth_user_id = auth.uid();
  if not found or s.expires_at < now() then
    perform oz_raise('PIN_REQUIRED', 'Your PIN session has timed out. Enter your PIN again.');
  end if;
  select * into st from staff where id = s.staff_id;
  if not found or not st.active or st.location_id <> staff_location_id() then
    perform oz_raise('PIN_REQUIRED', 'That staff member is no longer active.');
  end if;
  if p_require_admin and st.role <> 'admin' then
    perform oz_raise('ADMIN_REQUIRED', 'Only an admin can do that. Switch to an admin with their PIN.');
  end if;
  select idle_lock_minutes into idle from settings where location_id = st.location_id;
  update staff_sessions
     set last_seen_at = now(), expires_at = now() + make_interval(mins => coalesce(idle, 10))
   where token = p_actor;
  -- Lets triggers attribute audit rows to this person for the rest of the
  -- transaction.
  perform set_config('oz.actor_staff_id', st.id::text, true);
  return st.id;
end;
$$;

-- Who to attribute an audit row to: the PIN-verified actor if an RPC set
-- one, otherwise the signed-in staff account (v1 code paths).
create or replace function public.audit_actor()
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare v text := nullif(current_setting('oz.actor_staff_id', true), '');
begin
  if v is not null then return v::uuid; end if;
  return current_staff_id();
end;
$$;

create or replace function public.write_audit(
  p_action text, p_entity text, p_entity_id uuid, p_before jsonb, p_after jsonb
)
returns void
language sql
security definer
set search_path = public
as $$
  insert into audit_log (location_id, actor_staff_id, action, entity, entity_id, before, after)
  values (default_location_id(), audit_actor(), p_action, p_entity, p_entity_id, p_before, p_after);
$$;

create or replace function public.log_customer_event(
  p_customer_id uuid, p_kind text, p_summary text, p_booking_id uuid default null, p_invoice_id uuid default null
)
returns void
language sql
security definer
set search_path = public
as $$
  insert into customer_events (customer_id, kind, summary, booking_id, invoice_id, actor_staff_id)
  select p_customer_id, p_kind, p_summary, p_booking_id, p_invoice_id, audit_actor()
  where p_customer_id is not null;
$$;

-- Simple fixed-window rate limiter. Returns false once the limit is hit.
create or replace function public.rate_limit_hit(p_bucket text, p_key text, p_limit int, p_window interval)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare r record;
begin
  insert into rate_limits (bucket, key, window_start, hits)
  values (p_bucket, p_key, now(), 0)
  on conflict (bucket, key) do nothing;
  select * into r from rate_limits where bucket = p_bucket and key = p_key for update;
  if r.window_start < now() - p_window then
    update rate_limits set window_start = now(), hits = 1 where bucket = p_bucket and key = p_key;
    return true;
  end if;
  if r.hits >= p_limit then
    return false;
  end if;
  update rate_limits set hits = hits + 1 where bucket = p_bucket and key = p_key;
  return true;
end;
$$;

-- Price of a service for a vehicle type (sedan/base fallback).
create or replace function public.service_price_for(p_service_id uuid, p_vehicle_type text)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select case coalesce(p_vehicle_type, 'sedan')
    when 'small_wagon' then coalesce(price_small_wagon, price_from)
    when 'van'         then coalesce(price_van, price_from)
    when '4wd'         then coalesce(price_4wd, price_from)
    else price_from end
  from services where id = p_service_id;
$$;

-- -----------------------------------------------------------------------------
-- 6. Messaging: template rendering + outbox
-- -----------------------------------------------------------------------------
-- No real SMS/email is sent by the database. With settings.message_provider =
-- 'demo' (the default) every message is written to message_outbox as
-- 'simulated_sent' so it can be read in the admin Message Centre. With
-- 'live', messages are left 'queued' for the admin app's provider adapter.

create or replace function public.render_template(p_body text, p_vars jsonb)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  result text := coalesce(p_body, '');
  k text;
begin
  for k in select jsonb_object_keys(coalesce(p_vars, '{}'::jsonb)) loop
    result := replace(result, '{{' || k || '}}', coalesce(p_vars ->> k, ''));
  end loop;
  -- Blank out any placeholder we had no value for.
  return regexp_replace(result, '\{\{[a-z_]+\}\}', '', 'g');
end;
$$;

create or replace function public.first_name(p_name text)
returns text
language sql
immutable
set search_path = public
as $$
  select coalesce(nullif(split_part(btrim(coalesce(p_name, '')), ' ', 1), ''), 'there');
$$;

create or replace function public.site_url(p_path text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(nullif(rtrim((select public_site_url from settings where location_id = default_location_id()), '/'), ''), '') || p_path;
$$;

-- Placeholder values for a booking, shared by every booking-related message.
create or replace function public.booking_message_vars(p_booking_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'first_name', first_name(c.name),
    'service', s.name,
    'rego', coalesce(v.rego, 'your car'),
    'date', to_char(b.requested_date, 'Dy FMDD Mon'),
    'time', lower(to_char(b.requested_time, 'FMHH12:MIam')),
    'reference', b.reference_code,
    'manage_url', site_url('/manage/' || b.manage_token::text),
    'feedback_url', site_url('/manage/' || b.manage_token::text || '#feedback'),
    'business_name', st.business_name,
    'shop_phone', st.phone,
    'review_url', coalesce(st.review_url, '')
  )
  from bookings b
  join customers c on c.id = b.customer_id
  join services s on s.id = b.service_id
  left join vehicles v on v.id = b.vehicle_id
  left join settings st on st.location_id = b.location_id
  where b.id = p_booking_id;
$$;

create or replace function public.automation_enabled(p_key text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select enabled from automations where key = p_key), false);
$$;

-- Queue one message per active channel for a template. Returns how many
-- outbox rows were written. Deduplicated by p_dedupe_key (per channel), so a
-- retried automation never double-sends.
create or replace function public.enqueue_message(
  p_template_key text,
  p_customer_id uuid,
  p_booking_id uuid default null,
  p_invoice_id uuid default null,
  p_extra jsonb default '{}'::jsonb,
  p_dedupe_key text default null,
  p_campaign_id uuid default null,
  p_scheduled_for timestamptz default now(),
  p_created_by uuid default null
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  t record;
  c record;
  st record;
  vars jsonb;
  addr text;
  msg_status text;
  body text;
  written int := 0;
  dk text;
begin
  -- seed_demo.sql sets oz.seeding = on so bulk history doesn't spam the outbox.
  if coalesce(current_setting('oz.seeding', true), '') = 'on' then
    return 0;
  end if;
  select * into c from customers where id = p_customer_id;
  if not found or c.is_walkin_placeholder or c.anonymised_at is not null then
    return 0;
  end if;
  select * into st from settings where location_id = default_location_id();

  vars := jsonb_build_object(
    'first_name', first_name(c.name),
    'business_name', coalesce(st.business_name, 'OzShine'),
    'shop_phone', coalesce(st.phone, ''),
    'review_url', coalesce(st.review_url, '')
  );
  if p_booking_id is not null then
    vars := vars || coalesce(booking_message_vars(p_booking_id), '{}'::jsonb);
  end if;
  vars := vars || coalesce(p_extra, '{}'::jsonb);

  for t in select * from message_templates where key = p_template_key and active order by channel loop
    addr := case t.channel when 'sms' then c.phone else c.email end;
    body := render_template(t.body, vars);
    if t.category = 'marketing' then
      body := body || case t.channel
        when 'sms' then ' Reply STOP to opt out.'
        else E'\n\nDon''t want these emails? Reply "unsubscribe" and we''ll take you off the list.' end;
    end if;

    -- Opt-out first: it's the reason that matters when both apply.
    if t.category = 'marketing' and not c.marketing_opt_in then
      msg_status := 'skipped_opt_out';
    elsif addr is null or btrim(addr) = '' then
      msg_status := 'skipped_no_contact';
    elsif p_scheduled_for > now() + interval '1 minute' then
      msg_status := 'queued';
    elsif coalesce(st.message_provider, 'demo') = 'demo' or c.is_demo then
      -- Demo customers have fake numbers: never hand them to a live provider.
      msg_status := 'simulated_sent';
    else
      msg_status := 'queued';
    end if;

    dk := case when p_dedupe_key is null then null else p_dedupe_key || ':' || t.channel end;

    insert into message_outbox (
      customer_id, booking_id, invoice_id, campaign_id, channel, template_key,
      to_address, subject, body, status, provider, sent_at, dedupe_key,
      scheduled_for, created_by
    )
    values (
      c.id, p_booking_id, p_invoice_id, p_campaign_id, t.channel, t.key,
      addr, render_template(t.subject, vars), body, msg_status,
      case when msg_status = 'simulated_sent' then 'demo' else null end,
      case when msg_status = 'simulated_sent' then now() else null end,
      dk, p_scheduled_for, p_created_by
    )
    on conflict (dedupe_key) where dedupe_key is not null do nothing;
    if found then
      written := written + 1;
    end if;
  end loop;
  return written;
end;
$$;

-- -----------------------------------------------------------------------------
-- 7. Triggers
-- -----------------------------------------------------------------------------

-- Customers: canonical phone + referral code + timestamps. Phone is only
-- normalised when it is set/changed, so a legacy un-normalised row can still
-- be edited without tripping the unique index.
create or replace function public.customers_before_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' or new.phone is distinct from old.phone then
    new.phone := normalize_au_phone(new.phone);
  end if;
  if new.email is not null then
    new.email := nullif(lower(btrim(new.email)), '');
  end if;
  new.name := btrim(new.name);
  if tg_op = 'INSERT' and new.referral_code is null and not new.is_walkin_placeholder then
    loop
      new.referral_code := gen_short_code(6);
      exit when not exists (select 1 from customers where referral_code = new.referral_code);
    end loop;
  end if;
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists customers_before_write on customers;
create trigger customers_before_write before insert or update on customers
  for each row execute function customers_before_write();

create or replace function public.vehicles_before_write()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.rego := normalize_rego(new.rego);
  return new;
end;
$$;
drop trigger if exists vehicles_before_write on vehicles;
create trigger vehicles_before_write before insert or update on vehicles
  for each row execute function vehicles_before_write();

-- Bookings (before write): reference code, price/duration snapshots, derived
-- start/end times, and a timestamp for whichever stage the booking entered.
-- Works for v1 inserts/updates too, so old code paths get the same data.
create or replace function public.bookings_before_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  svc record;
begin
  -- Fill-if-missing (also back-fills v1 rows on their next update).
  if new.reference_code is null then
    loop
      new.reference_code := 'OZ-' || gen_short_code(4);
      exit when not exists (select 1 from bookings where reference_code = new.reference_code);
    end loop;
  end if;
  if new.vehicle_type is null and new.vehicle_id is not null then
    select vehicle_type into new.vehicle_type from vehicles where id = new.vehicle_id;
  end if;
  if new.service_price is null then
    new.service_price := service_price_for(new.service_id, new.vehicle_type);
  end if;
  if new.duration_minutes is null then
    select duration_minutes into svc from services where id = new.service_id;
    new.duration_minutes := coalesce(svc.duration_minutes, 60);
  end if;
  if new.price_estimate is null then
    new.price_estimate := new.service_price;
  end if;

  if tg_op = 'INSERT' then
    -- Stage timestamps for bookings created straight into a later stage.
    if new.status = 'approved' and new.approved_at is null then new.approved_at := now(); end if;
    if new.status in ('checked_in', 'in_progress') and new.checked_in_at is null then new.checked_in_at := now(); end if;
    if new.status = 'in_progress' and new.started_at is null then new.started_at := now(); end if;
  end if;

  if tg_op = 'INSERT'
     or new.requested_date is distinct from old.requested_date
     or new.requested_time is distinct from old.requested_time
     or new.duration_minutes is distinct from old.duration_minutes
     or new.starts_at is null then
    new.starts_at := shop_ts(new.requested_date, new.requested_time);
    new.ends_at := new.starts_at + make_interval(mins => coalesce(new.duration_minutes, 60));
  end if;

  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    case new.status
      when 'approved'    then new.approved_at   := coalesce(new.approved_at, now());
      when 'checked_in'  then new.checked_in_at := coalesce(new.checked_in_at, now());
      when 'in_progress' then new.started_at    := coalesce(new.started_at, now());
                              new.checked_in_at := coalesce(new.checked_in_at, now());
      when 'ready'       then new.ready_at      := coalesce(new.ready_at, now());
      when 'completed'   then new.completed_at  := coalesce(new.completed_at, now());
      when 'cancelled'   then new.cancelled_at  := coalesce(new.cancelled_at, now());
      when 'declined'    then new.declined_at   := coalesce(new.declined_at, now());
      else null;
    end case;
  end if;
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists bookings_before_write on bookings;
create trigger bookings_before_write before insert or update on bookings
  for each row execute function bookings_before_write();

-- Loyalty: award a reward when a completed-visit count lands exactly on a
-- rule's threshold (6th, 12th, ...). Unique (customer, rule, milestone)
-- makes it impossible to award the same milestone twice. Returns the number
-- of rewards issued.
create or replace function public.award_loyalty(p_customer_id uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  cnt int;
  r record;
  code text;
  issued int := 0;
  new_id uuid;
  cust record;
begin
  select * into cust from customers where id = p_customer_id;
  if not found or cust.is_walkin_placeholder then return 0; end if;
  if not coalesce((select loyalty_enabled from settings where location_id = default_location_id()), true) then
    return 0;
  end if;

  select count(*) into cnt from bookings where customer_id = p_customer_id and status = 'completed';

  for r in select * from loyalty_rules where active and kind = 'visits' loop
    if cnt > 0 and cnt % r.visits_required = 0 and (r.repeat or cnt = r.visits_required) then
      code := 'RW-' || gen_short_code(6);
      insert into loyalty_rewards (customer_id, rule_id, milestone, code, description, reward_type,
        reward_value, reward_addon_id, reward_service_id, eligible_service_ids, expires_at)
      values (p_customer_id, r.id, cnt::text, code, r.name, r.reward_type, r.reward_value,
        r.reward_addon_id, r.reward_service_id, r.eligible_service_ids,
        case when r.expires_after_days is null then null else now() + make_interval(days => r.expires_after_days) end)
      on conflict (customer_id, rule_id, milestone) do nothing
      returning id into new_id;
      if new_id is not null then
        issued := issued + 1;
        perform log_customer_event(p_customer_id, 'loyalty', 'Earned a reward: ' || r.name);
        if automation_enabled('loyalty_earned') then
          perform enqueue_message('loyalty_earned', p_customer_id, null, null,
            jsonb_build_object('reward', r.name, 'reward_code', code), 'loyalty:' || new_id::text);
        end if;
        new_id := null;
      end if;
    end if;
  end loop;

  -- Referral: the first completed visit of a referred customer earns the
  -- referrer a reward (once per referred customer).
  if cnt = 1 and cust.referred_by_customer_id is not null then
    for r in select * from loyalty_rules where active and kind = 'referral' loop
      code := 'RF-' || gen_short_code(6);
      insert into loyalty_rewards (customer_id, rule_id, milestone, code, description, reward_type,
        reward_value, reward_addon_id, reward_service_id, eligible_service_ids, expires_at)
      values (cust.referred_by_customer_id, r.id, 'referral:' || p_customer_id::text, code, r.name,
        r.reward_type, r.reward_value, r.reward_addon_id, r.reward_service_id, r.eligible_service_ids,
        case when r.expires_after_days is null then null else now() + make_interval(days => r.expires_after_days) end)
      on conflict (customer_id, rule_id, milestone) do nothing
      returning id into new_id;
      if new_id is not null then
        issued := issued + 1;
        perform log_customer_event(cust.referred_by_customer_id, 'loyalty', 'Referral reward: ' || r.name);
        new_id := null;
      end if;
    end loop;
  end if;
  return issued;
end;
$$;

-- Bookings (after insert): timeline + "we got your request" message.
create or replace function public.bookings_after_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform log_customer_event(new.customer_id, 'booking',
    'Booking ' || new.reference_code || ' created (' || new.source || ')', new.id);
  if new.source in ('web', 'phone', 'admin') and automation_enabled('booking_confirmations') then
    if new.status = 'pending' then
      perform enqueue_message('booking_received', new.customer_id, new.id, null, '{}'::jsonb, 'received:' || new.id::text);
    elsif new.status = 'approved' then
      perform enqueue_message('booking_approved', new.customer_id, new.id, null, '{}'::jsonb, 'approved:' || new.id::text);
    end if;
  end if;
  return null;
end;
$$;
drop trigger if exists bookings_after_insert on bookings;
create trigger bookings_after_insert after insert on bookings
  for each row execute function bookings_after_insert();

-- Bookings (after status change): audit, timeline, customer messages and
-- loyalty. Runs for v1 direct updates as well as the v2 RPCs.
create or replace function public.bookings_after_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform write_audit('booking.status', 'booking', new.id,
    jsonb_build_object('status', old.status), jsonb_build_object('status', new.status));
  perform log_customer_event(new.customer_id, 'status',
    'Booking ' || new.reference_code || ': ' || replace(old.status, '_', ' ') || ' → ' || replace(new.status, '_', ' '),
    new.id);

  if new.status = 'approved' and automation_enabled('booking_confirmations') then
    perform enqueue_message('booking_approved', new.customer_id, new.id, null, '{}'::jsonb, 'approved:' || new.id::text);
  elsif new.status = 'declined' and automation_enabled('booking_confirmations') then
    perform enqueue_message('booking_declined', new.customer_id, new.id, null,
      jsonb_build_object('reason', coalesce(new.decline_reason, '')), 'declined:' || new.id::text);
  elsif new.status = 'ready' and automation_enabled('ready_for_pickup') then
    perform enqueue_message('ready_for_pickup', new.customer_id, new.id, null, '{}'::jsonb, 'ready:' || new.id::text);
  elsif new.status = 'completed' then
    perform award_loyalty(new.customer_id);
  end if;
  return null;
end;
$$;
drop trigger if exists bookings_after_status on bookings;
create trigger bookings_after_status after update of status on bookings
  for each row when (old.status is distinct from new.status)
  execute function bookings_after_status();

-- Invoices: recompute totals, paid amount, balance and status from items and
-- payments, then mirror the result onto the v1 booking columns
-- (amount_charged / paid / paid_at) so v1 screens stay correct.
create or replace function public.recalc_invoice(p_invoice_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  inv record;
  v_sub numeric(10, 2);
  v_disc numeric(10, 2);
  v_total numeric(10, 2);
  v_paid numeric(10, 2);
  v_rate numeric;
  v_status text;
  v_last_paid timestamptz;
begin
  select * into inv from invoices where id = p_invoice_id for update;
  if not found then return; end if;

  select coalesce(sum(line_total) filter (where kind <> 'discount'), 0),
         coalesce(-sum(line_total) filter (where kind = 'discount'), 0)
    into v_sub, v_disc
  from invoice_items where invoice_id = p_invoice_id;
  v_total := greatest(v_sub - v_disc, 0);
  select coalesce(sum(amount), 0), max(received_at) filter (where amount > 0)
    into v_paid, v_last_paid
  from payments where invoice_id = p_invoice_id;
  select coalesce(tax_rate, 0.10) into v_rate from settings where location_id = inv.location_id;

  v_status := inv.status;
  if inv.status not in ('void', 'draft') then
    v_status := case
      when v_paid >= v_total then 'paid'
      when v_paid > 0 then 'partial'
      else 'issued' end;
  end if;

  update invoices set
    subtotal = v_sub,
    discount_total = v_disc,
    total = v_total,
    gst_amount = gst_from_inclusive(v_total, coalesce(v_rate, 0.10)),
    amount_paid = v_paid,
    balance_due = case when v_status = 'void' then 0 else greatest(v_total - v_paid, 0) end,
    status = v_status,
    updated_at = now()
  where id = p_invoice_id;

  if inv.booking_id is not null then
    if v_status = 'void' then
      update bookings set paid = false, paid_at = null, amount_charged = null
      where id = inv.booking_id
        and not exists (select 1 from invoices i where i.booking_id = inv.booking_id and i.status <> 'void');
    elsif v_status <> 'draft' then
      update bookings set
        amount_charged = v_total,
        paid = (v_status = 'paid'),
        paid_at = case when v_status = 'paid' then coalesce(v_last_paid, now()) else null end
      where id = inv.booking_id;
    end if;
  end if;
end;
$$;

create or replace function public.invoice_children_changed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform recalc_invoice(coalesce(new.invoice_id, old.invoice_id));
  return null;
end;
$$;
drop trigger if exists invoice_items_changed on invoice_items;
create trigger invoice_items_changed after insert or update or delete on invoice_items
  for each row execute function invoice_children_changed();
drop trigger if exists payments_changed on payments;
create trigger payments_changed after insert or update or delete on payments
  for each row execute function invoice_children_changed();

-- updated_at bookkeeping for settings / templates / automations.
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists settings_touch on settings;
create trigger settings_touch before update on settings for each row execute function touch_updated_at();
drop trigger if exists message_templates_touch on message_templates;
create trigger message_templates_touch before update on message_templates for each row execute function touch_updated_at();
drop trigger if exists automations_touch on automations;
create trigger automations_touch before update on automations for each row execute function touch_updated_at();

-- Backfill derived booking columns for v1 rows now that the trigger exists
-- (a no-op update fires it). Only touches rows missing the new data.
update bookings set updated_at = updated_at where reference_code is null or starts_at is null;

alter table vehicles add column if not exists archived_at timestamptz;
alter table customers add column if not exists deletion_requested_at timestamptz;

-- -----------------------------------------------------------------------------
-- 8. Scheduling helpers
-- -----------------------------------------------------------------------------

create or replace function public.dow_key(p_date date)
returns text
language sql
immutable
set search_path = public
as $$
  select (array['mon','tue','wed','thu','fri','sat','sun'])[extract(isodow from p_date)::int];
$$;

-- Statuses that occupy a bay/time slot.
create or replace function public.holds_capacity(p_status text)
returns boolean
language sql
immutable
set search_path = public
as $$
  select p_status in ('pending', 'approved', 'checked_in', 'in_progress', 'ready');
$$;

create or replace function public.shop_capacity(p_location uuid)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select greatest(1, coalesce(
    (select max_concurrent_jobs from settings where location_id = p_location),
    nullif((select count(*)::int from bays where location_id = p_location and active), 0),
    (select bay_count from settings where location_id = p_location),
    1));
$$;

-- Peak number of capacity-holding bookings at any instant inside
-- [p_start, p_end). Concurrency only changes when a booking starts, so it is
-- enough to evaluate the window start plus every booking start inside it.
create or replace function public.peak_concurrency(p_location uuid, p_start timestamptz, p_end timestamptz, p_exclude uuid)
returns int
language sql
stable
security definer
set search_path = public
as $$
  with overlapping as (
    select starts_at, ends_at from bookings
    where location_id = p_location
      and holds_capacity(status)
      and (p_exclude is null or id <> p_exclude)
      and starts_at < p_end and ends_at > p_start
  ),
  points as (
    select p_start as p
    union
    select starts_at from overlapping where starts_at > p_start and starts_at < p_end
  )
  select coalesce(max((select count(*) from overlapping o where o.starts_at <= pt.p and o.ends_at > pt.p)), 0)::int
  from points pt;
$$;

-- Why a slot can't be booked (null = bookable). p_public applies the
-- customer-facing rules (online switch, lead time, advance window); staff
-- bookings skip those but still respect hours, closures and capacity.
create or replace function public.slot_problem(
  p_date date, p_time time, p_duration int, p_exclude uuid, p_public boolean
)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  loc uuid := default_location_id();
  st record;
  hours jsonb;
  open_m int;
  close_m int;
  start_m int := extract(hour from p_time)::int * 60 + extract(minute from p_time)::int;
  s timestamptz;
  e timestamptz;
begin
  select * into st from settings where location_id = loc;
  if p_date is null or p_time is null or p_duration is null or p_duration <= 0 then
    return 'INVALID';
  end if;
  if p_public then
    if not coalesce(st.online_booking_enabled, true) then return 'ONLINE_BOOKING_OFF'; end if;
    if p_date > shop_today() + coalesce(st.max_advance_days, 60) then return 'TOO_FAR'; end if;
  end if;
  if exists (select 1 from blackout_dates where location_id = loc and date = p_date and start_time is null) then
    return 'CLOSED';
  end if;
  hours := st.opening_hours -> dow_key(p_date);
  if hours is null or coalesce((hours ->> 'closed')::boolean, false) then
    return 'CLOSED';
  end if;
  open_m := extract(hour from (hours ->> 'open')::time)::int * 60 + extract(minute from (hours ->> 'open')::time)::int;
  close_m := extract(hour from (hours ->> 'close')::time)::int * 60 + extract(minute from (hours ->> 'close')::time)::int;
  if start_m < open_m or start_m + p_duration > close_m then
    return 'OUTSIDE_HOURS';
  end if;
  s := shop_ts(p_date, p_time);
  e := s + make_interval(mins => p_duration);
  if s < now() then
    return 'PAST';
  end if;
  if p_public and s < now() + make_interval(mins => coalesce(st.min_lead_minutes, 60)) then
    return 'TOO_SOON';
  end if;
  if exists (
    select 1 from blackout_dates
    where location_id = loc and date = p_date and start_time is not null
      and shop_ts(p_date, start_time) < e and shop_ts(p_date, end_time) > s
  ) then
    return 'CLOSED';
  end if;
  if peak_concurrency(loc, s, e, p_exclude) >= shop_capacity(loc) then
    return 'SLOT_TAKEN';
  end if;
  return null;
end;
$$;

create or replace function public.slot_problem_message(p_code text)
returns text
language sql
immutable
set search_path = public
as $$
  select case p_code
    when 'ONLINE_BOOKING_OFF' then 'We''re not taking online bookings right now — give us a call and we''ll sort you out.'
    when 'TOO_FAR' then 'That date is too far ahead. Please pick a closer day.'
    when 'CLOSED' then 'We''re closed then. Please pick another day.'
    when 'OUTSIDE_HOURS' then 'That time is outside our opening hours for this service.'
    when 'PAST' then 'That time has already passed.'
    when 'TOO_SOON' then 'That''s a bit too soon for us to fit you in. Please pick a later time.'
    when 'SLOT_TAKEN' then 'Sorry — that time was just taken. Please pick another.'
    else 'That time isn''t available.' end;
$$;

-- Total minutes for a service plus add-ons (inactive add-ons ignored).
create or replace function public.job_duration(p_service_id uuid, p_addon_ids uuid[])
returns int
language sql
stable
security definer
set search_path = public
as $$
  select (select duration_minutes from services where id = p_service_id)
       + coalesce((select sum(duration_minutes)::int from addons
                   where id = any(coalesce(p_addon_ids, '{}')) and active), 0);
$$;

-- -----------------------------------------------------------------------------
-- 9. Public RPCs (anon-callable). The customer site uses these instead of
--    writing tables directly.
-- -----------------------------------------------------------------------------

create or replace function public.get_public_settings()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'business_name', s.business_name,
    'abn', s.abn,
    'address', s.address,
    'phone', s.phone,
    'email', s.email,
    'timezone', s.timezone,
    'opening_hours', s.opening_hours,
    'slot_minutes', s.slot_minutes,
    'min_lead_minutes', s.min_lead_minutes,
    'max_advance_days', s.max_advance_days,
    'cancel_cutoff_hours', s.cancel_cutoff_hours,
    'require_approval', s.require_approval,
    'online_booking_enabled', s.online_booking_enabled,
    'loyalty_enabled', s.loyalty_enabled,
    'loyalty_tiers', s.loyalty_tiers,
    'demo_banner', s.demo_banner,
    'bay_count', shop_capacity(s.location_id),
    'today', shop_today(),
    'now', now(),
    'blackouts', coalesce((
      select jsonb_agg(jsonb_build_object('date', b.date, 'reason', b.reason,
        'start_time', b.start_time, 'end_time', b.end_time) order by b.date)
      from blackout_dates b
      where b.location_id = s.location_id and b.date between shop_today() and shop_today() + s.max_advance_days
    ), '[]'::jsonb),
    'loyalty_rule', (
      select jsonb_build_object('name', r.name, 'visits_required', r.visits_required,
        'reward_type', r.reward_type, 'reward_value', r.reward_value)
      from loyalty_rules r
      where r.location_id = s.location_id and r.active and r.kind = 'visits'
      order by r.created_at limit 1
    ),
    'referral_rule', (
      select jsonb_build_object('name', r.name, 'reward_type', r.reward_type, 'reward_value', r.reward_value)
      from loyalty_rules r
      where r.location_id = s.location_id and r.active and r.kind = 'referral'
      order by r.created_at limit 1
    )
  )
  from settings s
  where s.location_id = default_location_id();
$$;

create or replace function public.get_available_slots(
  p_date date, p_service_id uuid, p_addon_ids uuid[] default '{}'
)
returns table (slot_time time, available boolean, reason text)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  loc uuid := default_location_id();
  st record;
  hours jsonb;
  dur int;
  m int;
  open_m int;
  close_m int;
  staff_caller boolean := is_staff();
  problem text;
begin
  select * into st from settings where location_id = loc;
  if p_date is null or p_service_id is null then return; end if;
  if not exists (select 1 from services where id = p_service_id and active) then return; end if;
  if p_date < shop_today() then return; end if;
  hours := st.opening_hours -> dow_key(p_date);
  if hours is null or coalesce((hours ->> 'closed')::boolean, false) then return; end if;
  dur := job_duration(p_service_id, p_addon_ids);
  open_m := extract(hour from (hours ->> 'open')::time)::int * 60 + extract(minute from (hours ->> 'open')::time)::int;
  close_m := extract(hour from (hours ->> 'close')::time)::int * 60 + extract(minute from (hours ->> 'close')::time)::int;
  m := open_m;
  while m + dur <= close_m loop
    problem := slot_problem(p_date, make_time(m / 60, m % 60, 0), dur, null, not staff_caller);
    slot_time := make_time(m / 60, m % 60, 0);
    available := problem is null;
    reason := problem;
    return next;
    m := m + st.slot_minutes;
  end loop;
end;
$$;

-- Promo check shared by preview + booking + checkout. Never consumes a use.
create or replace function public.promo_discount(
  p_code text, p_service_id uuid, p_subtotal numeric, p_customer_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  p record;
  disc numeric(10, 2);
begin
  if p_code is null or btrim(p_code) = '' then
    return jsonb_build_object('ok', false, 'message', 'Enter a code.');
  end if;
  select * into p from promo_codes
  where location_id = default_location_id() and upper(code) = upper(btrim(p_code));
  if not found or not p.active then
    return jsonb_build_object('ok', false, 'message', 'That code isn''t valid.');
  end if;
  if p.valid_from is not null and shop_today() < p.valid_from then
    return jsonb_build_object('ok', false, 'message', 'That code isn''t active yet.');
  end if;
  if p.valid_to is not null and shop_today() > p.valid_to then
    return jsonb_build_object('ok', false, 'message', 'That code has expired.');
  end if;
  if p.max_uses is not null and p.used_count >= p.max_uses then
    return jsonb_build_object('ok', false, 'message', 'That code has been fully used.');
  end if;
  if p.service_ids is not null and cardinality(p.service_ids) > 0 and not (p_service_id = any(p.service_ids)) then
    return jsonb_build_object('ok', false, 'message', 'That code doesn''t apply to this service.');
  end if;
  if coalesce(p_subtotal, 0) < p.min_spend then
    return jsonb_build_object('ok', false, 'message', 'Spend at least $' || to_char(p.min_spend, 'FM999990.00') || ' to use this code.');
  end if;
  if p.first_visit_only and p_customer_id is not null
     and exists (select 1 from bookings where customer_id = p_customer_id and status = 'completed') then
    -- Deliberately vague so a guest can't use this to probe whether a phone
    -- number has history.
    return jsonb_build_object('ok', false, 'message', 'That code can''t be used for this booking.');
  end if;
  disc := case p.type
    when 'percent' then round(coalesce(p_subtotal, 0) * p.value / 100, 2)
    else least(p.value, coalesce(p_subtotal, 0)) end;
  return jsonb_build_object('ok', true, 'promo_id', p.id, 'code', upper(p.code), 'discount', disc,
    'first_visit_only', p.first_visit_only,
    'message', case when p.type = 'percent' then to_char(p.value, 'FM990') || '% off applied.'
                    else '$' || to_char(disc, 'FM999990.00') || ' off applied.' end);
end;
$$;

create or replace function public.validate_promo(
  p_code text, p_service_id uuid, p_subtotal numeric, p_phone text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  res jsonb;
begin
  if not rate_limit_hit('promo_check', coalesce(normalize_au_phone(p_phone), 'anon'), 30, interval '1 hour') then
    return jsonb_build_object('ok', false, 'message', 'Too many attempts. Try again later.');
  end if;
  -- The phone is intentionally NOT used here: first-visit codes are checked
  -- when the booking is placed, so this preview can't reveal whether a number
  -- belongs to an existing customer.
  res := promo_discount(p_code, p_service_id, p_subtotal, null);
  return res - 'promo_id';
end;
$$;

create or replace function public.create_public_booking(payload jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  loc uuid := default_location_id();
  st record;
  v_service record;
  v_addon_ids uuid[];
  v_date date;
  v_time time;
  v_vt text;
  v_rego text;
  v_make text;
  v_name text;
  v_phone text;
  v_email text;
  v_notes text;
  v_opt boolean;
  v_promo text;
  v_referral text;
  v_reward_code text;
  v_dur int;
  v_service_price numeric(10, 2);
  v_addons_total numeric(10, 2);
  v_subtotal numeric(10, 2);
  v_disc numeric(10, 2) := 0;
  v_promo_res jsonb;
  v_promo_id uuid;
  v_reward_id uuid;
  v_cust record;
  v_cust_id uuid;
  v_veh_id uuid;
  v_status text;
  v_problem text;
  v_booking record;
  v_logged_in uuid := current_customer_id();
begin
  -- Honeypot: humans never fill this hidden field.
  if coalesce(payload ->> 'website', '') <> '' then
    perform oz_raise('INVALID_INPUT', 'Something went wrong with that form. Please try again.');
  end if;

  select * into st from settings where location_id = loc;

  begin
    v_addon_ids := coalesce(array(select jsonb_array_elements_text(coalesce(payload -> 'addon_ids', '[]'::jsonb))::uuid), '{}');
    v_date := (payload ->> 'date')::date;
    v_time := (payload ->> 'time')::time;
    select * into v_service from services where id = (payload ->> 'service_id')::uuid and active;
  exception when others then
    perform oz_raise('INVALID_INPUT', 'Some booking details weren''t valid. Please check and try again.');
  end;
  if v_service.id is null then
    perform oz_raise('INVALID_INPUT', 'Please choose a service.');
  end if;
  if exists (select 1 from unnest(v_addon_ids) a(id) where not exists (select 1 from addons x where x.id = a.id and x.active)) then
    perform oz_raise('INVALID_INPUT', 'One of those add-ons is no longer available.');
  end if;

  v_vt := coalesce(nullif(payload ->> 'vehicle_type', ''), 'sedan');
  if v_vt not in ('sedan', 'small_wagon', 'van', '4wd') then
    perform oz_raise('INVALID_INPUT', 'Please choose a vehicle type.');
  end if;
  v_rego := normalize_rego(payload ->> 'rego');
  if v_rego is not null and length(v_rego) > 9 then
    perform oz_raise('INVALID_INPUT', 'That rego looks too long.');
  end if;
  v_make := nullif(left(btrim(coalesce(payload ->> 'make_model', '')), 60), '');
  v_name := btrim(coalesce(payload ->> 'name', ''));
  if length(v_name) < 2 or length(v_name) > 80 then
    perform oz_raise('INVALID_INPUT', 'Please enter your name.');
  end if;
  v_phone := normalize_au_phone(payload ->> 'phone');
  if not is_valid_phone(v_phone) then
    perform oz_raise('INVALID_PHONE', 'Please enter a valid Australian mobile number.');
  end if;
  v_email := nullif(lower(btrim(coalesce(payload ->> 'email', ''))), '');
  if v_email is not null and (length(v_email) > 254 or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$') then
    perform oz_raise('INVALID_INPUT', 'That email address doesn''t look right.');
  end if;
  v_notes := nullif(left(btrim(coalesce(payload ->> 'notes', '')), 500), '');
  v_opt := coalesce((payload ->> 'marketing_opt_in')::boolean, true);
  v_promo := nullif(btrim(coalesce(payload ->> 'promo_code', '')), '');
  v_referral := nullif(upper(btrim(coalesce(payload ->> 'referral_code', ''))), '');
  v_reward_code := nullif(upper(btrim(coalesce(payload ->> 'reward_code', ''))), '');

  v_dur := job_duration(v_service.id, v_addon_ids);

  -- Serialise bookings for the same day so two people can't grab the last
  -- slot at the same moment.
  perform pg_advisory_xact_lock(hashtext('oz-slot:' || loc::text || ':' || v_date::text));

  v_problem := slot_problem(v_date, v_time, v_dur, null, true);
  if v_problem is not null then
    perform oz_raise(v_problem, slot_problem_message(v_problem));
  end if;

  -- Find the customer: a signed-in customer is always themselves; otherwise
  -- match by phone (existing behaviour) without ever revealing the match.
  if v_logged_in is not null then
    v_cust_id := v_logged_in;
  else
    select * into v_cust from customers where phone = v_phone;
    if found then
      v_cust_id := coalesce(v_cust.merged_into_customer_id, v_cust.id);
    end if;
  end if;

  if v_cust_id is not null then
    if (select count(*) from bookings where customer_id = v_cust_id and created_at > now() - interval '24 hours') >= 5 then
      perform oz_raise('THROTTLED', 'You''ve made a few bookings today already. Please give us a call to book more.');
    end if;
    if (select count(*) from bookings where customer_id = v_cust_id and status = 'pending') >= 3 then
      perform oz_raise('TOO_MANY_PENDING', 'You already have a few bookings waiting for confirmation. We''ll be in touch shortly.');
    end if;
  end if;
  if not rate_limit_hit('public_booking', v_phone, 5, interval '24 hours') then
    perform oz_raise('THROTTLED', 'You''ve made a few bookings today already. Please give us a call to book more.');
  end if;

  if v_cust_id is null then
    insert into customers (name, phone, email, marketing_opt_in, referred_by_customer_id)
    values (v_name, v_phone, v_email, v_opt,
      (select id from customers where referral_code = v_referral and v_referral is not null limit 1))
    returning id into v_cust_id;
  end if;

  -- Vehicle: reuse by rego for this customer, otherwise add it.
  if v_rego is not null then
    select id into v_veh_id from vehicles where customer_id = v_cust_id and rego = v_rego and archived_at is null
    order by created_at limit 1;
  else
    select id into v_veh_id from vehicles where customer_id = v_cust_id and rego is null and vehicle_type = v_vt and archived_at is null
    order by created_at limit 1;
  end if;
  if v_veh_id is null then
    insert into vehicles (customer_id, rego, make_model, vehicle_type)
    values (v_cust_id, v_rego, v_make, v_vt)
    returning id into v_veh_id;
  end if;

  -- Price is ALWAYS computed here from the database. Anything price-like in
  -- the payload is ignored.
  v_service_price := service_price_for(v_service.id, v_vt);
  select coalesce(sum(price), 0) into v_addons_total from addons where id = any(v_addon_ids);
  v_subtotal := v_service_price + v_addons_total;

  if v_promo is not null then
    v_promo_res := promo_discount(v_promo, v_service.id, v_subtotal, v_cust_id);
    if not (v_promo_res ->> 'ok')::boolean then
      perform oz_raise('PROMO_INVALID', v_promo_res ->> 'message');
    end if;
    v_promo_id := (v_promo_res ->> 'promo_id')::uuid;
    v_disc := (v_promo_res ->> 'discount')::numeric;
  end if;

  -- A signed-in customer can attach one of their own unused rewards.
  if v_reward_code is not null and v_logged_in is not null then
    select id into v_reward_id from loyalty_rewards
    where code = v_reward_code and customer_id = v_logged_in and status = 'issued'
      and (expires_at is null or expires_at > now());
    if v_reward_id is null then
      perform oz_raise('REWARD_INVALID', 'That reward isn''t available.');
    end if;
  end if;

  v_status := case when st.require_approval then 'pending' else 'approved' end;

  insert into bookings (customer_id, vehicle_id, service_id, location_id, requested_date, requested_time,
    status, source, customer_notes, duration_minutes, vehicle_type, service_price, price_estimate,
    discount_estimate, promo_code_id, loyalty_reward_id)
  values (v_cust_id, v_veh_id, v_service.id, loc, v_date, v_time,
    v_status, 'web', v_notes, v_dur, v_vt, v_service_price, greatest(v_subtotal - v_disc, 0),
    v_disc, v_promo_id, v_reward_id)
  returning * into v_booking;

  insert into booking_addons (booking_id, addon_id, name_snapshot, price_snapshot, duration_snapshot)
  select v_booking.id, a.id, a.name, a.price, a.duration_minutes from addons a where a.id = any(v_addon_ids);

  return jsonb_build_object(
    'reference_code', v_booking.reference_code,
    'manage_token', v_booking.manage_token,
    'status', v_booking.status,
    'starts_at', v_booking.starts_at,
    'ends_at', v_booking.ends_at,
    'subtotal', v_subtotal,
    'discount', v_disc,
    'total_estimate', greatest(v_subtotal - v_disc, 0)
  );
end;
$$;

create or replace function public.booking_can_modify(p_status text, p_starts_at timestamptz)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_status in ('pending', 'approved')
     and p_starts_at > now() + make_interval(hours => coalesce(
       (select cancel_cutoff_hours from settings where location_id = default_location_id()), 2));
$$;

-- Everything the manage/track page needs for ONE booking, found by its
-- unguessable token. First name only; no other customer data.
create or replace function public.get_booking_by_token(p_token uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'reference_code', b.reference_code,
    'status', b.status,
    'first_name', first_name(c.name),
    'service', jsonb_build_object('id', s.id, 'name', s.name, 'duration_minutes', s.duration_minutes, 'requires_quote', s.requires_quote),
    'addons', coalesce((select jsonb_agg(jsonb_build_object('name', ba.name_snapshot, 'price', ba.price_snapshot))
                        from booking_addons ba where ba.booking_id = b.id), '[]'::jsonb),
    'addon_ids', coalesce((select jsonb_agg(ba.addon_id) from booking_addons ba where ba.booking_id = b.id and ba.addon_id is not null), '[]'::jsonb),
    'vehicle', jsonb_build_object('rego', v.rego, 'make_model', v.make_model),
    'vehicle_type', coalesce(b.vehicle_type, v.vehicle_type),
    'date', b.requested_date,
    'time', to_char(b.requested_time, 'HH24:MI'),
    'starts_at', b.starts_at,
    'ends_at', b.ends_at,
    'duration_minutes', b.duration_minutes,
    'estimated_ready_at', case when b.status = 'in_progress' and b.started_at is not null
                               then b.started_at + make_interval(mins => b.duration_minutes) end,
    'stages', jsonb_build_object('created_at', b.created_at, 'approved_at', b.approved_at,
      'checked_in_at', b.checked_in_at, 'started_at', b.started_at, 'ready_at', b.ready_at,
      'completed_at', b.completed_at, 'cancelled_at', b.cancelled_at, 'declined_at', b.declined_at),
    'price_estimate', b.price_estimate,
    'discount_estimate', b.discount_estimate,
    'decline_reason', b.decline_reason,
    'cancel_reason', b.cancel_reason,
    'can_modify', booking_can_modify(b.status, b.starts_at),
    'cancel_cutoff_hours', st.cancel_cutoff_hours,
    'invoice', (select jsonb_build_object('number', i.number, 'status', i.status, 'total', i.total,
                  'amount_paid', i.amount_paid, 'balance_due', i.balance_due, 'public_token', i.public_token)
                from invoices i where i.booking_id = b.id and i.status <> 'void' limit 1),
    'feedback', (select jsonb_build_object('rating', f.rating) from feedback f where f.booking_id = b.id),
    'shop', jsonb_build_object('business_name', st.business_name, 'phone', st.phone, 'address', st.address,
                               'review_url', st.review_url)
  )
  from bookings b
  join customers c on c.id = b.customer_id
  join services s on s.id = b.service_id
  left join vehicles v on v.id = b.vehicle_id
  left join settings st on st.location_id = b.location_id
  where b.manage_token = p_token;
$$;

create or replace function public.cancel_booking_by_token(p_token uuid, p_reason text default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare b record;
begin
  select * into b from bookings where manage_token = p_token for update;
  if not found then
    perform oz_raise('NOT_FOUND', 'We couldn''t find that booking.');
  end if;
  if not booking_can_modify(b.status, b.starts_at) then
    perform oz_raise('CANNOT_MODIFY', 'This booking can''t be cancelled online any more. Please give us a call.');
  end if;
  update bookings set status = 'cancelled', cancel_reason = nullif(left(btrim(coalesce(p_reason, '')), 300), '')
  where id = b.id;
  return get_booking_by_token(p_token);
end;
$$;

create or replace function public.reschedule_booking_by_token(p_token uuid, p_new_date date, p_new_time time)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  b record;
  problem text;
  needs_approval boolean;
begin
  select * into b from bookings where manage_token = p_token for update;
  if not found then
    perform oz_raise('NOT_FOUND', 'We couldn''t find that booking.');
  end if;
  if not booking_can_modify(b.status, b.starts_at) then
    perform oz_raise('CANNOT_MODIFY', 'This booking can''t be changed online any more. Please give us a call.');
  end if;
  perform pg_advisory_xact_lock(hashtext('oz-slot:' || b.location_id::text || ':' || p_new_date::text));
  problem := slot_problem(p_new_date, p_new_time, b.duration_minutes, b.id, true);
  if problem is not null then
    perform oz_raise(problem, slot_problem_message(problem));
  end if;
  select require_approval into needs_approval from settings where location_id = b.location_id;
  update bookings set
    requested_date = p_new_date,
    requested_time = p_new_time,
    status = case when needs_approval then 'pending' else status end
  where id = b.id;
  perform log_customer_event(b.customer_id, 'booking', 'Booking ' || b.reference_code || ' rescheduled online', b.id);
  if automation_enabled('booking_confirmations') then
    perform enqueue_message('booking_received', b.customer_id, b.id, null, '{}'::jsonb,
      'resched:' || b.id::text || ':' || p_new_date::text || ':' || p_new_time::text);
  end if;
  return get_booking_by_token(p_token);
end;
$$;

create or replace function public.submit_feedback_by_token(p_token uuid, p_rating int, p_comment text default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  b record;
  st record;
begin
  select * into b from bookings where manage_token = p_token;
  if not found then
    perform oz_raise('NOT_FOUND', 'We couldn''t find that booking.');
  end if;
  if b.status <> 'completed' then
    perform oz_raise('NOT_COMPLETED', 'You can leave feedback once your car is done.');
  end if;
  if p_rating is null or p_rating not between 1 and 5 then
    perform oz_raise('INVALID_INPUT', 'Please choose a rating from 1 to 5.');
  end if;
  insert into feedback (booking_id, customer_id, rating, comment)
  values (b.id, b.customer_id, p_rating, nullif(left(btrim(coalesce(p_comment, '')), 2000), ''))
  on conflict (booking_id) do nothing;
  if not found then
    perform oz_raise('ALREADY_SUBMITTED', 'Thanks — we''ve already got your feedback for this visit.');
  end if;
  perform log_customer_event(b.customer_id, 'feedback', 'Left a ' || p_rating || '-star rating', b.id);
  select * into st from settings where location_id = b.location_id;
  return jsonb_build_object('ok', true, 'low_rating', p_rating <= 3,
    'review_url', case when p_rating = 5 then st.review_url end, 'shop_phone', st.phone);
end;
$$;

create or replace function public.join_waitlist(
  p_name text, p_phone text, p_date date, p_service_id uuid default null, p_note text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare ph text := normalize_au_phone(p_phone);
begin
  if length(btrim(coalesce(p_name, ''))) < 2 then
    perform oz_raise('INVALID_INPUT', 'Please enter your name.');
  end if;
  if not is_valid_phone(ph) then
    perform oz_raise('INVALID_PHONE', 'Please enter a valid Australian mobile number.');
  end if;
  if p_date is null or p_date < shop_today() then
    perform oz_raise('INVALID_INPUT', 'Please choose a date from today onwards.');
  end if;
  if not rate_limit_hit('waitlist', ph, 3, interval '24 hours') then
    perform oz_raise('THROTTLED', 'You''re already on our list — we''ll text you if a spot opens up.');
  end if;
  insert into waitlist (location_id, name, phone, date, service_id, note)
  values (default_location_id(), left(btrim(p_name), 80), ph, p_date, p_service_id, nullif(left(btrim(coalesce(p_note, '')), 300), ''));
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.get_published_testimonials()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object('name', name, 'text', text, 'rating', rating) order by sort, created_at), '[]'::jsonb)
  from testimonials where published;
$$;

-- Public, read-only receipt found by the invoice's own unguessable token.
create or replace function public.get_receipt_by_token(p_token uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'number', i.number,
    'status', i.status,
    'issued_at', i.issued_at,
    'subtotal', i.subtotal,
    'discount_total', i.discount_total,
    'gst_amount', i.gst_amount,
    'total', i.total,
    'amount_paid', i.amount_paid,
    'balance_due', i.balance_due,
    'customer_first_name', first_name(c.name),
    'rego', v.rego,
    'items', coalesce((select jsonb_agg(jsonb_build_object('description', it.description, 'quantity', it.quantity,
                 'unit_price', it.unit_price, 'line_total', it.line_total) order by it.sort, it.created_at)
               from invoice_items it where it.invoice_id = i.id), '[]'::jsonb),
    'payments', coalesce((select jsonb_agg(jsonb_build_object('method', p.method, 'amount', p.amount, 'received_at', p.received_at,
                  'tendered', p.tendered, 'change_given', p.change_given)
                  order by p.received_at) from payments p where p.invoice_id = i.id), '[]'::jsonb),
    'business', jsonb_build_object('name', st.business_name, 'abn', st.abn, 'address', st.address,
                  'phone', st.phone, 'email', st.email, 'footer', st.invoice_footer, 'tax_rate', st.tax_rate)
  )
  from invoices i
  left join customers c on c.id = i.customer_id
  left join bookings b on b.id = i.booking_id
  left join vehicles v on v.id = b.vehicle_id
  left join settings st on st.location_id = i.location_id
  where i.public_token = p_token and i.status <> 'draft';
$$;

-- -----------------------------------------------------------------------------
-- 10. Signed-in customer RPCs
-- -----------------------------------------------------------------------------

-- Link the signed-in account to its customer history. Tries the phone the
-- user signed up with, then their email. Never links a customer that already
-- belongs to another account, and never says whose number it is.
create or replace function public.link_account_to_customer()
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  u record;
  ph text;
  em text;
  nm text;
  cid uuid;
  existing record;
begin
  if uid is null then
    perform oz_raise('NOT_SIGNED_IN', 'Please sign in first.');
  end if;
  cid := current_customer_id();
  if cid is not null then
    return jsonb_build_object('status', 'already_linked', 'customer_id', cid);
  end if;
  select * into u from auth.users where id = uid;
  ph := normalize_au_phone(u.raw_user_meta_data ->> 'phone');
  em := nullif(lower(btrim(coalesce(u.email, ''))), '');
  nm := coalesce(nullif(btrim(u.raw_user_meta_data ->> 'name'), ''), split_part(coalesce(em, 'Customer'), '@', 1));

  if ph is not null then
    select * into existing from customers where phone = ph;
    if found then
      -- Phones aren't verified (no SMS), so a number alone must not hand over
      -- someone's history: only link when the record has no email yet or the
      -- email matches this sign-in. Otherwise start a fresh profile; staff
      -- can merge the two if it really is the same person.
      if existing.auth_user_id is null and existing.merged_into_customer_id is null
         and (existing.email is null or lower(existing.email) = em) then
        update customers set auth_user_id = uid, email = coalesce(email, em) where id = existing.id;
        perform log_customer_event(existing.id, 'account', 'Online account linked');
        return jsonb_build_object('status', 'linked', 'customer_id', existing.id);
      end if;
      -- Number belongs to another account: don't reveal it, don't reuse it.
      ph := null;
    end if;
  end if;

  if em is not null then
    select * into existing from customers
    where email = em and auth_user_id is null and merged_into_customer_id is null
    order by created_at limit 1;
    if found then
      update customers set auth_user_id = uid where id = existing.id;
      perform log_customer_event(existing.id, 'account', 'Online account linked');
      return jsonb_build_object('status', 'linked', 'customer_id', existing.id);
    end if;
  end if;

  insert into customers (auth_user_id, name, phone, email)
  values (uid, left(nm, 80), ph, em)
  returning id into cid;
  return jsonb_build_object('status', 'created', 'customer_id', cid);
end;
$$;

-- v1 function kept working (now phone-format tolerant).
create or replace function public.claim_customer_by_phone(p_phone text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then return; end if;
  -- Same rule as link_account_to_customer: an unverified phone number only
  -- claims a record that has no email or the signed-in user's email.
  update customers
  set auth_user_id = auth.uid()
  where phone = normalize_au_phone(p_phone)
    and auth_user_id is null
    and merged_into_customer_id is null
    and (email is null or lower(email) = lower((select email from auth.users where id = auth.uid())))
    and not exists (select 1 from customers c2 where c2.auth_user_id = auth.uid());
end;
$$;

create or replace function public.customer_tier(p_visits int)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with tiers as (
    select (t ->> 'name') as name, (t ->> 'min_visits')::int as min_visits
    from settings s, jsonb_array_elements(s.loyalty_tiers) t
    where s.location_id = default_location_id()
  )
  select jsonb_build_object(
    'current', (select name from tiers where min_visits <= p_visits order by min_visits desc limit 1),
    'next', (select name from tiers where min_visits > p_visits order by min_visits limit 1),
    'next_at', (select min_visits from tiers where min_visits > p_visits order by min_visits limit 1),
    'tiers', (select jsonb_agg(jsonb_build_object('name', name, 'min_visits', min_visits) order by min_visits) from tiers)
  );
$$;

create or replace function public.get_my_loyalty()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  cid uuid := current_customer_id();
  c record;
  visits int;
  r record;
begin
  if cid is null then
    return jsonb_build_object('linked', false);
  end if;
  select * into c from customers where id = cid;
  select count(*) into visits from bookings where customer_id = cid and status = 'completed';
  select * into r from loyalty_rules where active and kind = 'visits' order by created_at limit 1;
  return jsonb_build_object(
    'linked', true,
    'name', c.name,
    'referral_code', c.referral_code,
    'visit_count', visits,
    'tier', customer_tier(visits),
    'rule', case when r.id is null then null else jsonb_build_object('name', r.name, 'visits_required', r.visits_required) end,
    'progress', case when r.id is null then 0 else visits % r.visits_required end,
    'visits_to_next_reward', case when r.id is null then null else r.visits_required - (visits % r.visits_required) end,
    'lifetime_spend', coalesce((select sum(coalesce(i.total, b.amount_charged)) from bookings b
                                left join invoices i on i.booking_id = b.id and i.status <> 'void'
                                where b.customer_id = cid and b.status = 'completed'), 0),
    'rewards', coalesce((select jsonb_agg(jsonb_build_object('code', lr.code, 'description', lr.description,
                  'status', lr.status, 'issued_at', lr.issued_at, 'expires_at', lr.expires_at,
                  'redeemed_at', lr.redeemed_at) order by lr.issued_at desc)
                from loyalty_rewards lr where lr.customer_id = cid), '[]'::jsonb)
  );
end;
$$;

create or replace function public.update_my_profile(payload jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  cid uuid := current_customer_id();
  nm text := btrim(coalesce(payload ->> 'name', ''));
  ph text := normalize_au_phone(payload ->> 'phone');
  em text := nullif(lower(btrim(coalesce(payload ->> 'email', ''))), '');
begin
  if cid is null then
    perform oz_raise('NOT_LINKED', 'We couldn''t find your customer profile.');
  end if;
  if length(nm) < 2 or length(nm) > 80 then
    perform oz_raise('INVALID_INPUT', 'Please enter your name.');
  end if;
  if ph is not null and not is_valid_phone(ph) then
    perform oz_raise('INVALID_PHONE', 'Please enter a valid Australian mobile number.');
  end if;
  if ph is not null and exists (select 1 from customers where phone = ph and id <> cid) then
    perform oz_raise('PHONE_IN_USE', 'That number is already on another profile. Give us a call and we''ll merge them.');
  end if;
  if em is not null and em !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    perform oz_raise('INVALID_INPUT', 'That email address doesn''t look right.');
  end if;
  update customers set name = nm, phone = coalesce(ph, phone), email = em,
    marketing_opt_in = coalesce((payload ->> 'marketing_opt_in')::boolean, marketing_opt_in)
  where id = cid;
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.upsert_my_vehicle(payload jsonb)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  cid uuid := current_customer_id();
  vid uuid := nullif(payload ->> 'id', '')::uuid;
  vt text := coalesce(nullif(payload ->> 'vehicle_type', ''), 'sedan');
  rg text := normalize_rego(payload ->> 'rego');
  primary_flag boolean := coalesce((payload ->> 'is_primary')::boolean, false);
begin
  if cid is null then
    perform oz_raise('NOT_LINKED', 'We couldn''t find your customer profile.');
  end if;
  if vt not in ('sedan', 'small_wagon', 'van', '4wd') then
    perform oz_raise('INVALID_INPUT', 'Please choose a vehicle type.');
  end if;
  if rg is not null and length(rg) > 9 then
    perform oz_raise('INVALID_INPUT', 'That rego looks too long.');
  end if;
  if vid is not null then
    update vehicles set rego = rg, vehicle_type = vt,
      make_model = nullif(left(btrim(coalesce(payload ->> 'make_model', '')), 60), ''),
      colour = nullif(left(btrim(coalesce(payload ->> 'colour', '')), 30), ''),
      nickname = nullif(left(btrim(coalesce(payload ->> 'nickname', '')), 30), ''),
      is_primary = primary_flag
    where id = vid and customer_id = cid;
    if not found then
      perform oz_raise('NOT_FOUND', 'We couldn''t find that vehicle.');
    end if;
  else
    insert into vehicles (customer_id, rego, vehicle_type, make_model, colour, nickname, is_primary)
    values (cid, rg, vt,
      nullif(left(btrim(coalesce(payload ->> 'make_model', '')), 60), ''),
      nullif(left(btrim(coalesce(payload ->> 'colour', '')), 30), ''),
      nullif(left(btrim(coalesce(payload ->> 'nickname', '')), 30), ''),
      primary_flag)
    returning id into vid;
  end if;
  if primary_flag then
    update vehicles set is_primary = false where customer_id = cid and id <> vid;
  end if;
  return vid;
end;
$$;

create or replace function public.archive_my_vehicle(p_vehicle_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  update vehicles set archived_at = now(), is_primary = false
  where id = p_vehicle_id and customer_id = current_customer_id();
  if not found then
    perform oz_raise('NOT_FOUND', 'We couldn''t find that vehicle.');
  end if;
end;
$$;

create or replace function public.request_account_deletion()
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare cid uuid := current_customer_id();
begin
  if cid is null then
    perform oz_raise('NOT_LINKED', 'We couldn''t find your customer profile.');
  end if;
  update customers set deletion_requested_at = now() where id = cid;
  perform log_customer_event(cid, 'account', 'Asked for their account and data to be deleted');
  perform write_audit('customer.deletion_requested', 'customer', cid, null, null);
end;
$$;

-- -----------------------------------------------------------------------------
-- 11. Staff: PINs and "acting as" sessions
-- -----------------------------------------------------------------------------

create or replace function public.list_staff_for_switcher()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', s.id, 'name', s.name, 'role', s.role, 'color', s.color,
    'initials', coalesce(s.avatar_initials, upper(left(s.name, 1)) || upper(coalesce(left(split_part(s.name, ' ', 2), 1), ''))),
    'has_pin', exists (select 1 from staff_pins p where p.staff_id = s.id),
    'is_me', s.auth_user_id = auth.uid()
  ) order by s.name), '[]'::jsonb)
  from staff s
  where is_staff() and s.active and s.location_id = staff_location_id();
$$;

-- Checks a PIN with a brute-force throttle (5 wrong tries → 5 minute lock).
-- PINs are bcrypt-hashed and never returned.
create or replace function public.verify_staff_pin(p_staff_id uuid, p_pin text)
returns boolean
language plpgsql
volatile
security definer
set search_path = public, extensions
as $$
declare
  p record;
  ok boolean;
begin
  perform require_staff();
  if not exists (select 1 from staff where id = p_staff_id and active and location_id = staff_location_id()) then
    return false;
  end if;
  select * into p from staff_pins where staff_id = p_staff_id for update;
  if not found then
    return false;
  end if;
  if p.locked_until is not null and p.locked_until > now() then
    perform oz_raise('PIN_LOCKED', 'Too many wrong PINs. Try again in a few minutes.');
  end if;
  ok := coalesce(p_pin, '') ~ '^[0-9]{4,6}$' and extensions.crypt(p_pin, p.pin_hash) = p.pin_hash;
  if ok then
    update staff_pins set failed_attempts = 0, locked_until = null where staff_id = p_staff_id;
  else
    update staff_pins set
      failed_attempts = failed_attempts + 1,
      locked_until = case when failed_attempts + 1 >= 5 then now() + interval '5 minutes' else null end
    where staff_id = p_staff_id;
  end if;
  return ok;
end;
$$;

-- Start an "acting as" session. First-run exception: a staff member with no
-- PIN yet may act as themselves (their own login) without one, so the first
-- admin can get in and set everyone's PINs.
create or replace function public.start_acting_session(p_staff_id uuid, p_pin text default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  st record;
  has_pin boolean;
  idle int;
  tok uuid;
  exp timestamptz;
begin
  perform require_staff();
  select * into st from staff where id = p_staff_id and active and location_id = staff_location_id();
  if not found then
    perform oz_raise('NOT_FOUND', 'That staff member isn''t available.');
  end if;
  has_pin := exists (select 1 from staff_pins where staff_id = p_staff_id);
  if has_pin then
    if not verify_staff_pin(p_staff_id, p_pin) then
      perform oz_raise('WRONG_PIN', 'That PIN isn''t right. Try again.');
    end if;
  elsif st.auth_user_id is distinct from auth.uid() then
    perform oz_raise('PIN_NOT_SET', 'This person hasn''t set a PIN yet. An admin can set one in Settings → Staff.');
  end if;
  select idle_lock_minutes into idle from settings where location_id = st.location_id;
  exp := now() + make_interval(mins => coalesce(idle, 10));
  -- One live session per device login: starting a new one ends the old one.
  update staff_sessions set ended_at = now() where auth_user_id = auth.uid() and ended_at is null;
  insert into staff_sessions (staff_id, auth_user_id, expires_at)
  values (p_staff_id, auth.uid(), exp)
  returning token into tok;
  return jsonb_build_object('token', tok, 'expires_at', exp, 'idle_minutes', coalesce(idle, 10),
    'staff', jsonb_build_object('id', st.id, 'name', st.name, 'role', st.role, 'color', st.color, 'has_pin', has_pin));
end;
$$;

create or replace function public.end_acting_session(p_actor uuid)
returns void
language sql
volatile
security definer
set search_path = public
as $$
  update staff_sessions set ended_at = now() where token = p_actor and auth_user_id = auth.uid();
$$;

-- Returns the session's staff (and extends it) — used by the app to check
-- whether the stored session is still valid.
create or replace function public.check_acting_session(p_actor uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare sid uuid; st record;
begin
  sid := resolve_actor(p_actor);
  select * into st from staff where id = sid;
  return jsonb_build_object('id', st.id, 'name', st.name, 'role', st.role, 'color', st.color);
end;
$$;

-- Admins can set anyone's PIN; someone without a PIN can set their own.
create or replace function public.set_staff_pin(p_actor uuid, p_staff_id uuid, p_pin text)
returns void
language plpgsql
volatile
security definer
set search_path = public, extensions
as $$
declare
  st record;
  own_first_pin boolean;
begin
  perform require_staff();
  select * into st from staff where id = p_staff_id and location_id = staff_location_id();
  if not found then
    perform oz_raise('NOT_FOUND', 'That staff member isn''t available.');
  end if;
  own_first_pin := st.auth_user_id = auth.uid() and not exists (select 1 from staff_pins where staff_id = p_staff_id);
  if not own_first_pin then
    perform resolve_actor(p_actor, true);
  end if;
  if coalesce(p_pin, '') !~ '^[0-9]{4,6}$' then
    perform oz_raise('INVALID_PIN', 'PINs are 4 to 6 digits.');
  end if;
  insert into staff_pins (staff_id, pin_hash)
  values (p_staff_id, extensions.crypt(p_pin, extensions.gen_salt('bf')))
  on conflict (staff_id) do update set pin_hash = excluded.pin_hash, failed_attempts = 0, locked_until = null, updated_at = now();
  perform write_audit('staff.pin_set', 'staff', p_staff_id, null, null);
end;
$$;

-- -----------------------------------------------------------------------------
-- 12. Booking lifecycle (state machine)
-- -----------------------------------------------------------------------------
--   pending    → approved | declined | cancelled
--   approved   → checked_in | cancelled | no_show
--   checked_in → in_progress | cancelled
--   in_progress→ ready
--   ready      → completed
-- Walk-ins start at checked_in or in_progress. Completing needs an issued
-- invoice, or an explicit audit-logged "complete without invoice".

create or replace function public.legal_next_statuses(p_status text)
returns text[]
language sql
immutable
set search_path = public
as $$
  select case p_status
    when 'pending' then array['approved', 'declined', 'cancelled']
    when 'approved' then array['checked_in', 'cancelled', 'no_show']
    when 'checked_in' then array['in_progress', 'cancelled']
    when 'in_progress' then array['ready']
    when 'ready' then array['completed']
    else array[]::text[] end;
$$;

create or replace function public.first_free_bay(p_location uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select b.id from bays b
  where b.location_id = p_location and b.active
    and not exists (select 1 from bookings x where x.bay_id = b.id and x.status = 'in_progress')
  order by b.sort_order, b.name limit 1;
$$;

create or replace function public.advance_booking(
  p_booking_id uuid,
  p_to_status text,
  p_actor uuid,
  p_bay_id uuid default null,
  p_assigned_staff_id uuid default null,
  p_reason text default null,
  p_allow_no_invoice boolean default false
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  actor uuid := resolve_actor(p_actor);
  actor_role text;
  b record;
  bay uuid;
  inv record;
begin
  select * into b from bookings where id = p_booking_id and location_id = staff_location_id() for update;
  if not found then
    perform oz_raise('NOT_FOUND', 'We couldn''t find that booking.');
  end if;
  if not (p_to_status = any(legal_next_statuses(b.status))) then
    perform oz_raise('ILLEGAL_TRANSITION',
      'A booking that is ' || replace(b.status, '_', ' ') || ' can''t be moved to ' || replace(p_to_status, '_', ' ') || '.');
  end if;

  if p_to_status = 'in_progress' then
    bay := coalesce(p_bay_id, b.bay_id, first_free_bay(b.location_id));
    if bay is null then
      perform oz_raise('NO_FREE_BAY', 'All bays are busy. Finish a job or pick a bay manually.');
    end if;
    if not exists (select 1 from bays where id = bay and active and location_id = b.location_id) then
      perform oz_raise('INVALID_INPUT', 'That bay isn''t available.');
    end if;
    if exists (select 1 from bookings where bay_id = bay and status = 'in_progress' and id <> b.id) then
      perform oz_raise('BAY_BUSY', 'That bay already has a car in it.');
    end if;
    update bookings set bay_id = bay,
      assigned_staff_id = coalesce(p_assigned_staff_id, assigned_staff_id, actor)
    where id = b.id;
  end if;

  if p_to_status = 'completed' then
    select * into inv from invoices where booking_id = b.id and status in ('issued', 'partial', 'paid') limit 1;
    if not found then
      select role into actor_role from staff where id = actor;
      if not p_allow_no_invoice then
        perform oz_raise('INVOICE_REQUIRED', 'Create the invoice first (or mark it as a no-charge job).');
      end if;
      if coalesce(b.price_estimate, 0) > 0 and actor_role <> 'admin' then
        perform oz_raise('ADMIN_REQUIRED', 'Only an admin can complete a paid job without an invoice.');
      end if;
      perform write_audit('booking.complete_without_invoice', 'booking', b.id,
        jsonb_build_object('price_estimate', b.price_estimate), jsonb_build_object('reason', p_reason));
    end if;
  end if;

  update bookings set
    status = p_to_status,
    processed_by_staff_id = actor,
    decline_reason = case when p_to_status = 'declined' then nullif(left(btrim(coalesce(p_reason, '')), 300), '') else decline_reason end,
    cancel_reason = case when p_to_status in ('cancelled', 'no_show') then nullif(left(btrim(coalesce(p_reason, '')), 300), '') else cancel_reason end
  where id = b.id;

  return (select jsonb_build_object('id', x.id, 'status', x.status, 'bay_id', x.bay_id,
            'assigned_staff_id', x.assigned_staff_id, 'reference_code', x.reference_code)
          from bookings x where x.id = b.id);
end;
$$;

-- Move / reschedule / reassign from the calendar or board, with a capacity
-- check (admins may force past it).
create or replace function public.update_booking_details(p_booking_id uuid, payload jsonb, p_actor uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  actor uuid := resolve_actor(p_actor);
  b record;
  new_date date;
  new_time time;
  new_bay uuid;
  problem text;
  force boolean := coalesce((payload ->> 'force')::boolean, false);
  before_row jsonb;
begin
  select * into b from bookings where id = p_booking_id and location_id = staff_location_id() for update;
  if not found then
    perform oz_raise('NOT_FOUND', 'We couldn''t find that booking.');
  end if;
  before_row := jsonb_build_object('requested_date', b.requested_date, 'requested_time', b.requested_time,
    'bay_id', b.bay_id, 'assigned_staff_id', b.assigned_staff_id, 'internal_notes', b.internal_notes);
  new_date := coalesce((payload ->> 'requested_date')::date, b.requested_date);
  new_time := coalesce((payload ->> 'requested_time')::time, b.requested_time);
  new_bay := case when payload ? 'bay_id' then nullif(payload ->> 'bay_id', '')::uuid else b.bay_id end;

  if (new_date, new_time) is distinct from (b.requested_date, b.requested_time) then
    if b.status not in ('pending', 'approved') then
      perform oz_raise('CANNOT_MODIFY', 'Only bookings that haven''t arrived yet can be moved.');
    end if;
    perform pg_advisory_xact_lock(hashtext('oz-slot:' || b.location_id::text || ':' || new_date::text));
    problem := slot_problem(new_date, new_time, b.duration_minutes, b.id, false);
    if problem is not null and not (problem = 'SLOT_TAKEN' and force) then
      perform oz_raise(problem, slot_problem_message(problem));
    end if;
    if problem is not null then
      perform resolve_actor(p_actor, true);
    end if;
  end if;

  if new_bay is distinct from b.bay_id and new_bay is not null and b.status = 'in_progress'
     and exists (select 1 from bookings where bay_id = new_bay and status = 'in_progress' and id <> b.id) then
    perform oz_raise('BAY_BUSY', 'That bay already has a car in it.');
  end if;

  update bookings set
    requested_date = new_date,
    requested_time = new_time,
    bay_id = new_bay,
    assigned_staff_id = case when payload ? 'assigned_staff_id' then nullif(payload ->> 'assigned_staff_id', '')::uuid else assigned_staff_id end,
    internal_notes = case when payload ? 'internal_notes' then nullif(left(payload ->> 'internal_notes', 1000), '') else internal_notes end
  where id = b.id;

  perform write_audit('booking.update', 'booking', b.id, before_row,
    (select jsonb_build_object('requested_date', x.requested_date, 'requested_time', x.requested_time,
      'bay_id', x.bay_id, 'assigned_staff_id', x.assigned_staff_id, 'internal_notes', x.internal_notes)
     from bookings x where x.id = b.id));
  return jsonb_build_object('id', b.id, 'ok', true, 'forced', problem is not null);
end;
$$;

-- Find or create a customer from staff-entered details. Phone wins; rego is
-- the fallback; otherwise the shared Walk-in Guest record.
create or replace function public.staff_find_or_create_customer(p_name text, p_phone text, p_email text, p_rego text)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  ph text := normalize_au_phone(p_phone);
  rg text := normalize_rego(p_rego);
  cid uuid;
  nm text := nullif(btrim(coalesce(p_name, '')), '');
begin
  if ph is not null then
    if not is_valid_phone(ph) then
      perform oz_raise('INVALID_PHONE', 'That phone number doesn''t look right.');
    end if;
    select coalesce(merged_into_customer_id, id) into cid from customers where phone = ph;
    if cid is null then
      insert into customers (name, phone, email)
      values (coalesce(nm, 'Customer ' || right(ph, 3)), ph, nullif(lower(btrim(coalesce(p_email, ''))), ''))
      returning id into cid;
    end if;
    return cid;
  end if;
  if rg is not null then
    select c.id into cid from vehicles v join customers c on c.id = v.customer_id
    where v.rego = rg and not c.is_walkin_placeholder and c.merged_into_customer_id is null
    order by v.created_at desc limit 1;
    if cid is not null then return cid; end if;
  end if;
  if nm is not null then
    insert into customers (name, phone, email) values (nm, null, nullif(lower(btrim(coalesce(p_email, ''))), ''))
    returning id into cid;
    return cid;
  end if;
  select id into cid from customers where is_walkin_placeholder order by created_at limit 1;
  return cid;
end;
$$;

-- Staff picked an existing customer from search on the New sale screen: use
-- them as-is (following a merge if there was one), filling in a missing
-- mobile/email when it isn't already someone else's. Anything unusable
-- (unknown id, deleted, the walk-in placeholder) falls back to the normal
-- phone/rego/name matching, so a stale screen can never create a mismatch.
create or replace function public.staff_resolve_customer(
  p_customer_id uuid, p_name text, p_phone text, p_email text, p_rego text
)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  c record;
  ph text := normalize_au_phone(p_phone);
  em text := nullif(lower(btrim(coalesce(p_email, ''))), '');
begin
  if p_customer_id is not null then
    select * into c from customers where id = p_customer_id;
    if found and c.merged_into_customer_id is not null then
      select * into c from customers where id = c.merged_into_customer_id;
    end if;
    if found and c.anonymised_at is null and not c.is_walkin_placeholder then
      if c.phone is null and ph is not null and is_valid_phone(ph)
         and not exists (select 1 from customers where phone = ph and id <> c.id) then
        update customers set phone = ph where id = c.id;
      end if;
      if c.email is null and em is not null and em ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
        update customers set email = em where id = c.id;
      end if;
      return c.id;
    end if;
  end if;
  return staff_find_or_create_customer(p_name, p_phone, p_email, p_rego);
end;
$$;

create or replace function public.staff_find_or_create_vehicle(p_customer_id uuid, p_rego text, p_make text, p_type text)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  rg text := normalize_rego(p_rego);
  vid uuid;
  placeholder boolean;
begin
  if rg is null then
    return null;
  end if;
  select is_walkin_placeholder into placeholder from customers where id = p_customer_id;
  select id into vid from vehicles where customer_id = p_customer_id and rego = rg and archived_at is null
  order by created_at limit 1;
  if vid is null then
    insert into vehicles (customer_id, rego, make_model, vehicle_type)
    values (p_customer_id, rg, nullif(left(btrim(coalesce(p_make, '')), 60), ''), coalesce(p_type, 'sedan'))
    returning id into vid;
  elsif not coalesce(placeholder, false) then
    update vehicles set vehicle_type = coalesce(p_type, vehicle_type),
      make_model = coalesce(nullif(left(btrim(coalesce(p_make, '')), 60), ''), make_model)
    where id = vid;
  end if;
  return vid;
end;
$$;

-- Walk-in POS. Customer/rego are optional. Starts the job straight away
-- (in_progress with a bay) or queues it as checked_in.
create or replace function public.create_walkin_order(payload jsonb, p_actor uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  actor uuid := resolve_actor(p_actor);
  actor_role text;
  loc uuid := staff_location_id();
  st record;
  svc record;
  addon_ids uuid[];
  vt text := coalesce(nullif(payload ->> 'vehicle_type', ''), 'sedan');
  cid uuid;
  vid uuid;
  subtotal numeric(10, 2);
  disc numeric(10, 2) := 0;
  promo jsonb;
  promo_id uuid;
  reward_id uuid;
  manual numeric(10, 2) := coalesce(nullif(payload ->> 'manual_discount', '')::numeric, 0);
  manual_reason text := nullif(btrim(coalesce(payload ->> 'manual_discount_reason', '')), '');
  start_now boolean := coalesce((payload ->> 'start_now')::boolean, false);
  bay uuid;
  now_local timestamp := now() at time zone shop_tz();
  bk record;
begin
  select * into st from settings where location_id = loc;
  if vt not in ('sedan', 'small_wagon', 'van', '4wd') then
    perform oz_raise('INVALID_INPUT', 'Please choose a vehicle type.');
  end if;
  begin
    addon_ids := coalesce(array(select jsonb_array_elements_text(coalesce(payload -> 'addon_ids', '[]'::jsonb))::uuid), '{}');
    select * into svc from services where id = (payload ->> 'service_id')::uuid and active and location_id = loc;
  exception when others then
    perform oz_raise('INVALID_INPUT', 'Please choose a service.');
  end;
  if svc.id is null then
    perform oz_raise('INVALID_INPUT', 'Please choose a service.');
  end if;
  if manual < 0 then
    perform oz_raise('INVALID_INPUT', 'Discounts can''t be negative.');
  end if;
  if manual > 0 and manual_reason is null then
    perform oz_raise('REASON_REQUIRED', 'Add a reason for the discount.');
  end if;
  if manual > coalesce(st.manual_discount_admin_threshold, 20) then
    select role into actor_role from staff where id = actor;
    if actor_role <> 'admin' then
      perform oz_raise('ADMIN_REQUIRED', 'Discounts over $' || to_char(st.manual_discount_admin_threshold, 'FM999990.00') || ' need an admin PIN.');
    end if;
  end if;

  cid := staff_resolve_customer(nullif(payload ->> 'customer_id', '')::uuid, payload ->> 'name', payload ->> 'phone', payload ->> 'email', payload ->> 'rego');
  vid := staff_find_or_create_vehicle(cid, payload ->> 'rego', payload ->> 'make_model', vt);

  subtotal := service_price_for(svc.id, vt) + coalesce((select sum(price) from addons where id = any(addon_ids) and active), 0);
  if nullif(btrim(coalesce(payload ->> 'promo_code', '')), '') is not null then
    promo := promo_discount(payload ->> 'promo_code', svc.id, subtotal, cid);
    if not (promo ->> 'ok')::boolean then
      perform oz_raise('PROMO_INVALID', promo ->> 'message');
    end if;
    promo_id := (promo ->> 'promo_id')::uuid;
    disc := (promo ->> 'discount')::numeric;
  end if;
  if nullif(btrim(coalesce(payload ->> 'reward_code', '')), '') is not null then
    select id into reward_id from loyalty_rewards
    where upper(code) = upper(btrim(payload ->> 'reward_code')) and customer_id = cid and status = 'issued'
      and (expires_at is null or expires_at > now());
    if reward_id is null then
      perform oz_raise('REWARD_INVALID', 'That reward isn''t available for this customer.');
    end if;
  end if;

  if start_now then
    bay := coalesce(nullif(payload ->> 'bay_id', '')::uuid, first_free_bay(loc));
    if bay is null then
      perform oz_raise('NO_FREE_BAY', 'All bays are busy. Queue the car instead, or free up a bay.');
    end if;
    if exists (select 1 from bookings where bay_id = bay and status = 'in_progress') then
      perform oz_raise('BAY_BUSY', 'That bay already has a car in it.');
    end if;
  end if;

  insert into bookings (customer_id, vehicle_id, service_id, location_id, requested_date, requested_time,
    status, source, internal_notes, duration_minutes, vehicle_type, service_price, price_estimate,
    discount_estimate, promo_code_id, loyalty_reward_id, manual_discount, manual_discount_reason,
    bay_id, assigned_staff_id, processed_by_staff_id)
  values (cid, vid, svc.id, loc, now_local::date,
    date_trunc('minute', now_local)::time - make_interval(mins => extract(minute from now_local)::int % 5),
    case when start_now then 'in_progress' else 'checked_in' end, 'walk_in',
    nullif(left(btrim(coalesce(payload ->> 'notes', '')), 1000), ''),
    job_duration(svc.id, addon_ids), vt, service_price_for(svc.id, vt),
    greatest(subtotal - disc - manual, 0), disc, promo_id, reward_id, manual, manual_reason,
    bay, case when start_now then coalesce(nullif(payload ->> 'assigned_staff_id', '')::uuid, actor) end, actor)
  returning * into bk;

  insert into booking_addons (booking_id, addon_id, name_snapshot, price_snapshot, duration_snapshot)
  select bk.id, a.id, a.name, a.price, a.duration_minutes from addons a where a.id = any(addon_ids) and a.active;

  if manual > 0 then
    perform write_audit('booking.manual_discount', 'booking', bk.id, null,
      jsonb_build_object('amount', manual, 'reason', manual_reason));
  end if;
  return jsonb_build_object('booking_id', bk.id, 'reference_code', bk.reference_code, 'status', bk.status,
    'customer_id', cid, 'total_estimate', bk.price_estimate);
end;
$$;

-- Phone-in / admin bookings for a date and time from real availability.
create or replace function public.create_staff_booking(payload jsonb, p_actor uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  actor uuid := resolve_actor(p_actor);
  loc uuid := staff_location_id();
  svc record;
  addon_ids uuid[];
  vt text := coalesce(nullif(payload ->> 'vehicle_type', ''), 'sedan');
  d date;
  t time;
  cid uuid;
  vid uuid;
  dur int;
  problem text;
  force boolean := coalesce((payload ->> 'force')::boolean, false);
  subtotal numeric(10, 2);
  disc numeric(10, 2) := 0;
  promo jsonb;
  promo_id uuid;
  bk record;
begin
  if vt not in ('sedan', 'small_wagon', 'van', '4wd') then
    perform oz_raise('INVALID_INPUT', 'Please choose a vehicle type.');
  end if;
  begin
    addon_ids := coalesce(array(select jsonb_array_elements_text(coalesce(payload -> 'addon_ids', '[]'::jsonb))::uuid), '{}');
    d := (payload ->> 'date')::date;
    t := (payload ->> 'time')::time;
    select * into svc from services where id = (payload ->> 'service_id')::uuid and active and location_id = loc;
  exception when others then
    perform oz_raise('INVALID_INPUT', 'Some booking details weren''t valid.');
  end;
  if svc.id is null then
    perform oz_raise('INVALID_INPUT', 'Please choose a service.');
  end if;
  if normalize_au_phone(payload ->> 'phone') is null then
    perform oz_raise('INVALID_PHONE', 'A phone number is needed for bookings.');
  end if;
  dur := job_duration(svc.id, addon_ids);
  perform pg_advisory_xact_lock(hashtext('oz-slot:' || loc::text || ':' || d::text));
  problem := slot_problem(d, t, dur, null, false);
  if problem is not null then
    if problem = 'SLOT_TAKEN' and force then
      perform resolve_actor(p_actor, true);
    else
      perform oz_raise(problem, slot_problem_message(problem));
    end if;
  end if;

  cid := staff_resolve_customer(nullif(payload ->> 'customer_id', '')::uuid, payload ->> 'name', payload ->> 'phone', payload ->> 'email', null);
  vid := staff_find_or_create_vehicle(cid, payload ->> 'rego', payload ->> 'make_model', vt);
  subtotal := service_price_for(svc.id, vt) + coalesce((select sum(price) from addons where id = any(addon_ids) and active), 0);
  if nullif(btrim(coalesce(payload ->> 'promo_code', '')), '') is not null then
    promo := promo_discount(payload ->> 'promo_code', svc.id, subtotal, cid);
    if not (promo ->> 'ok')::boolean then
      perform oz_raise('PROMO_INVALID', promo ->> 'message');
    end if;
    promo_id := (promo ->> 'promo_id')::uuid;
    disc := (promo ->> 'discount')::numeric;
  end if;

  insert into bookings (customer_id, vehicle_id, service_id, location_id, requested_date, requested_time,
    status, source, customer_notes, internal_notes, duration_minutes, vehicle_type, service_price,
    price_estimate, discount_estimate, promo_code_id, processed_by_staff_id)
  values (cid, vid, svc.id, loc, d, t, 'approved',
    case when payload ->> 'source' = 'admin' then 'admin' else 'phone' end,
    nullif(left(btrim(coalesce(payload ->> 'customer_notes', '')), 500), ''),
    nullif(left(btrim(coalesce(payload ->> 'notes', '')), 1000), ''),
    dur, vt, service_price_for(svc.id, vt), greatest(subtotal - disc, 0), disc, promo_id, actor)
  returning * into bk;

  insert into booking_addons (booking_id, addon_id, name_snapshot, price_snapshot, duration_snapshot)
  select bk.id, a.id, a.name, a.price, a.duration_minutes from addons a where a.id = any(addon_ids) and a.active;

  return jsonb_build_object('booking_id', bk.id, 'reference_code', bk.reference_code, 'manage_token', bk.manage_token,
    'status', bk.status, 'customer_id', cid, 'forced', problem is not null);
end;
$$;

-- -----------------------------------------------------------------------------
-- 13. Money: invoices, payments, refunds, voids
-- -----------------------------------------------------------------------------

create or replace function public.vehicle_type_label(p_type text)
returns text
language sql
immutable
set search_path = public
as $$
  select case p_type when 'small_wagon' then 'Small Wagon' when 'van' then 'Van' when '4wd' then '4WD' else 'Sedan' end;
$$;

create or replace function public.next_invoice_number(p_location uuid)
returns text
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  n int;
  prefix text;
begin
  insert into invoice_counters (location_id) values (p_location) on conflict do nothing;
  update invoice_counters set last_number = last_number + 1 where location_id = p_location returning last_number into n;
  select invoice_prefix into prefix from settings where location_id = p_location;
  return coalesce(prefix, 'OZ') || '-' || lpad(n::text, 6, '0');
end;
$$;

-- Discount a reward is worth against a set of invoice lines.
create or replace function public.reward_discount(p_reward_id uuid, p_invoice_id uuid)
returns numeric
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  r record;
  b record;
  svc_line numeric(10, 2);
  eligible boolean;
  subtotal numeric(10, 2);
begin
  select * into r from loyalty_rewards where id = p_reward_id;
  if not found then return 0; end if;
  select bk.* into b from invoices i join bookings bk on bk.id = i.booking_id where i.id = p_invoice_id;
  select coalesce(sum(line_total), 0) into subtotal from invoice_items where invoice_id = p_invoice_id and kind <> 'discount';
  select coalesce(sum(line_total), 0) into svc_line from invoice_items where invoice_id = p_invoice_id and kind = 'service';
  eligible := r.eligible_service_ids is null or cardinality(r.eligible_service_ids) = 0
              or (b.service_id is not null and b.service_id = any(r.eligible_service_ids));
  return case r.reward_type
    when 'percent' then case when eligible then round(svc_line * coalesce(r.reward_value, 0) / 100, 2) else 0 end
    when 'fixed' then least(coalesce(r.reward_value, 0), subtotal)
    when 'free_service' then case when eligible then svc_line else 0 end
    when 'free_addon' then coalesce((select max(line_total) from invoice_items it
                             where it.invoice_id = p_invoice_id and it.kind = 'addon'
                               and it.description = (select name from addons where id = r.reward_addon_id)), 0)
    else 0 end;
end;
$$;

-- Build the invoice for a booking: service + add-ons + discounts (promo,
-- loyalty reward, manual), GST-inclusive maths, and the next invoice number.
-- Idempotent: calling it again returns the booking's existing invoice.
create or replace function public.issue_invoice(p_booking_id uuid, p_actor uuid)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  actor uuid := resolve_actor(p_actor);
  b record;
  svc record;
  inv_id uuid;
  sort_n int := 0;
  a record;
  d numeric(10, 2);
  r record;
  p record;
begin
  select * into b from bookings where id = p_booking_id and location_id = staff_location_id() for update;
  if not found then
    perform oz_raise('NOT_FOUND', 'We couldn''t find that booking.');
  end if;
  select id into inv_id from invoices where booking_id = b.id and status <> 'void' limit 1;
  if inv_id is not null then
    return inv_id;
  end if;
  if b.status in ('declined', 'cancelled', 'no_show', 'pending') then
    perform oz_raise('CANNOT_INVOICE', 'This booking can''t be invoiced in its current state.');
  end if;
  select * into svc from services where id = b.service_id;

  insert into invoices (location_id, number, booking_id, customer_id, status, promo_code_id,
    loyalty_reward_id, issued_at, due_at, created_by_staff_id)
  values (b.location_id, next_invoice_number(b.location_id), b.id, b.customer_id, 'issued',
    b.promo_code_id, b.loyalty_reward_id, now(), now(), actor)
  returning id into inv_id;

  insert into invoice_items (invoice_id, kind, description, quantity, unit_price, line_total, sort, created_by_staff_id)
  values (inv_id, 'service', svc.name || ' — ' || vehicle_type_label(b.vehicle_type), 1,
    coalesce(b.service_price, service_price_for(b.service_id, b.vehicle_type)),
    coalesce(b.service_price, service_price_for(b.service_id, b.vehicle_type)), sort_n, actor);

  for a in select * from booking_addons where booking_id = b.id order by created_at loop
    sort_n := sort_n + 1;
    insert into invoice_items (invoice_id, kind, description, quantity, unit_price, line_total, sort, created_by_staff_id)
    values (inv_id, 'addon', a.name_snapshot, 1, a.price_snapshot, a.price_snapshot, sort_n, actor);
  end loop;

  if b.promo_code_id is not null and b.discount_estimate > 0 then
    select * into p from promo_codes where id = b.promo_code_id;
    sort_n := sort_n + 1;
    insert into invoice_items (invoice_id, kind, description, quantity, unit_price, line_total, sort, created_by_staff_id)
    values (inv_id, 'discount', 'Promo ' || coalesce(upper(p.code), ''), 1, -b.discount_estimate, -b.discount_estimate, sort_n, actor);
    update promo_codes set used_count = used_count + 1 where id = b.promo_code_id;
  end if;

  if b.loyalty_reward_id is not null then
    select * into r from loyalty_rewards where id = b.loyalty_reward_id and status = 'issued';
    if found then
      d := reward_discount(r.id, inv_id);
      if d > 0 then
        sort_n := sort_n + 1;
        insert into invoice_items (invoice_id, kind, description, quantity, unit_price, line_total, sort, created_by_staff_id)
        values (inv_id, 'discount', 'Loyalty reward: ' || r.description, 1, -d, -d, sort_n, actor);
      end if;
      update loyalty_rewards set status = 'redeemed', redeemed_at = now(), redeemed_invoice_id = inv_id where id = r.id;
    end if;
  end if;

  if b.manual_discount > 0 then
    sort_n := sort_n + 1;
    insert into invoice_items (invoice_id, kind, description, quantity, unit_price, line_total, sort, created_by_staff_id)
    values (inv_id, 'discount', 'Discount: ' || coalesce(b.manual_discount_reason, 'staff discount'), 1,
      -b.manual_discount, -b.manual_discount, sort_n, actor);
  end if;

  perform recalc_invoice(inv_id);
  perform write_audit('invoice.issue', 'invoice', inv_id, null,
    (select jsonb_build_object('number', number, 'total', total) from invoices where id = inv_id));
  perform log_customer_event(b.customer_id, 'invoice',
    'Invoice ' || (select number from invoices where id = inv_id) || ' issued', b.id, inv_id);
  return inv_id;
end;
$$;

create or replace function public.assert_invoice_editable(p_invoice_id uuid)
returns invoices
language plpgsql
stable
security definer
set search_path = public
as $$
declare inv record;
begin
  select * into inv from invoices where id = p_invoice_id and location_id = staff_location_id();
  if not found then
    perform oz_raise('NOT_FOUND', 'We couldn''t find that invoice.');
  end if;
  if inv.status = 'void' then
    perform oz_raise('INVOICE_VOID', 'This invoice has been voided.');
  end if;
  return inv;
end;
$$;

-- Add a line: custom charge, or a discount (pass a positive amount).
-- Discounts over the admin threshold need an admin PIN. Audit-logged.
create or replace function public.add_invoice_item(
  p_invoice_id uuid, p_kind text, p_description text, p_quantity numeric, p_unit_price numeric, p_actor uuid
)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  actor uuid := resolve_actor(p_actor);
  inv record;
  line numeric(10, 2);
  item_id uuid;
  threshold numeric;
  role_ text;
  qty numeric := coalesce(p_quantity, 1);
begin
  inv := assert_invoice_editable(p_invoice_id);
  if p_kind not in ('custom', 'discount', 'addon', 'service') then
    perform oz_raise('INVALID_INPUT', 'Unknown line type.');
  end if;
  if length(btrim(coalesce(p_description, ''))) = 0 then
    perform oz_raise('REASON_REQUIRED', 'Add a description.');
  end if;
  if p_unit_price is null or p_unit_price < 0 or qty <= 0 then
    perform oz_raise('INVALID_INPUT', 'Enter a valid amount.');
  end if;
  line := round(qty * p_unit_price, 2);
  if p_kind = 'discount' then
    select manual_discount_admin_threshold into threshold from settings where location_id = inv.location_id;
    select role into role_ from staff where id = actor;
    if line > coalesce(threshold, 20) and role_ <> 'admin' then
      perform oz_raise('ADMIN_REQUIRED', 'Discounts over $' || to_char(threshold, 'FM999990.00') || ' need an admin PIN.');
    end if;
    if inv.total - line < inv.amount_paid then
      perform oz_raise('BELOW_PAID', 'That would make the invoice less than what''s already been paid. Refund first.');
    end if;
    insert into invoice_items (invoice_id, kind, description, quantity, unit_price, line_total, sort, created_by_staff_id)
    values (p_invoice_id, 'discount', left(btrim(p_description), 200), 1, -line, -line, 900, actor)
    returning id into item_id;
  else
    insert into invoice_items (invoice_id, kind, description, quantity, unit_price, line_total, sort, created_by_staff_id)
    values (p_invoice_id, p_kind, left(btrim(p_description), 200), qty, p_unit_price, line,
      (select coalesce(max(sort), 0) + 1 from invoice_items where invoice_id = p_invoice_id and kind <> 'discount'), actor)
    returning id into item_id;
  end if;
  perform write_audit('invoice.add_item', 'invoice', p_invoice_id, null,
    jsonb_build_object('kind', p_kind, 'description', p_description, 'amount', line));
  return item_id;
end;
$$;

create or replace function public.update_invoice_item(
  p_item_id uuid, p_description text, p_quantity numeric, p_unit_price numeric, p_actor uuid
)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  actor uuid := resolve_actor(p_actor);
  it record;
  inv record;
  new_line numeric(10, 2);
  new_total numeric(10, 2);
begin
  select * into it from invoice_items where id = p_item_id;
  if not found then
    perform oz_raise('NOT_FOUND', 'We couldn''t find that line.');
  end if;
  inv := assert_invoice_editable(it.invoice_id);
  if p_unit_price is null or p_unit_price < 0 or coalesce(p_quantity, 1) <= 0 then
    perform oz_raise('INVALID_INPUT', 'Enter a valid amount.');
  end if;
  new_line := round(coalesce(p_quantity, 1) * p_unit_price, 2);
  if it.kind = 'discount' then new_line := -new_line; end if;
  new_total := inv.total - it.line_total + new_line;
  if new_total < inv.amount_paid then
    perform oz_raise('BELOW_PAID', 'That would make the invoice less than what''s already been paid. Refund first.');
  end if;
  update invoice_items set
    description = coalesce(nullif(left(btrim(coalesce(p_description, '')), 200), ''), description),
    quantity = case when kind = 'discount' then 1 else coalesce(p_quantity, 1) end,
    unit_price = case when kind = 'discount' then new_line else p_unit_price end,
    line_total = new_line
  where id = p_item_id;
  perform write_audit('invoice.price_edit', 'invoice', it.invoice_id,
    jsonb_build_object('item', it.description, 'line_total', it.line_total),
    jsonb_build_object('item', coalesce(p_description, it.description), 'line_total', new_line));
end;
$$;

create or replace function public.remove_invoice_item(p_item_id uuid, p_actor uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  actor uuid := resolve_actor(p_actor);
  it record;
  inv record;
begin
  select * into it from invoice_items where id = p_item_id;
  if not found then
    perform oz_raise('NOT_FOUND', 'We couldn''t find that line.');
  end if;
  inv := assert_invoice_editable(it.invoice_id);
  if inv.total - it.line_total < inv.amount_paid then
    perform oz_raise('BELOW_PAID', 'That would make the invoice less than what''s already been paid. Refund first.');
  end if;
  delete from invoice_items where id = p_item_id;
  perform write_audit('invoice.remove_item', 'invoice', it.invoice_id,
    jsonb_build_object('item', it.description, 'line_total', it.line_total), null);
end;
$$;

-- Apply a loyalty reward code or promo code at the counter.
create or replace function public.apply_invoice_code(p_invoice_id uuid, p_code text, p_actor uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  actor uuid := resolve_actor(p_actor);
  inv record;
  r record;
  b record;
  d numeric(10, 2);
  promo jsonb;
  subtotal numeric(10, 2);
begin
  inv := assert_invoice_editable(p_invoice_id);
  if inv.status = 'paid' then
    perform oz_raise('ALREADY_PAID', 'This invoice is already paid.');
  end if;
  select * into r from loyalty_rewards
  where upper(code) = upper(btrim(coalesce(p_code, ''))) and status = 'issued' and (expires_at is null or expires_at > now());
  if found then
    if r.customer_id is distinct from inv.customer_id then
      perform oz_raise('REWARD_INVALID', 'That reward belongs to a different customer.');
    end if;
    d := least(reward_discount(r.id, p_invoice_id), inv.total - inv.amount_paid);
    if d <= 0 then
      perform oz_raise('REWARD_INVALID', 'That reward doesn''t apply to anything on this invoice.');
    end if;
    insert into invoice_items (invoice_id, kind, description, quantity, unit_price, line_total, sort, created_by_staff_id)
    values (p_invoice_id, 'discount', 'Loyalty reward: ' || r.description, 1, -d, -d, 910, actor);
    update loyalty_rewards set status = 'redeemed', redeemed_at = now(), redeemed_invoice_id = p_invoice_id where id = r.id;
    update invoices set loyalty_reward_id = r.id where id = p_invoice_id;
    perform write_audit('invoice.reward', 'invoice', p_invoice_id, null, jsonb_build_object('code', r.code, 'amount', d));
    return jsonb_build_object('ok', true, 'kind', 'reward', 'discount', d);
  end if;

  if inv.promo_code_id is not null then
    perform oz_raise('PROMO_INVALID', 'A promo code is already on this invoice.');
  end if;
  select * into b from bookings where id = inv.booking_id;
  select coalesce(sum(line_total), 0) into subtotal from invoice_items where invoice_id = p_invoice_id and kind <> 'discount';
  promo := promo_discount(p_code, b.service_id, subtotal, inv.customer_id);
  if not (promo ->> 'ok')::boolean then
    perform oz_raise('PROMO_INVALID', promo ->> 'message');
  end if;
  d := least((promo ->> 'discount')::numeric, inv.total - inv.amount_paid);
  insert into invoice_items (invoice_id, kind, description, quantity, unit_price, line_total, sort, created_by_staff_id)
  values (p_invoice_id, 'discount', 'Promo ' || (promo ->> 'code'), 1, -d, -d, 905, actor);
  update invoices set promo_code_id = (promo ->> 'promo_id')::uuid where id = p_invoice_id;
  update promo_codes set used_count = used_count + 1 where id = (promo ->> 'promo_id')::uuid;
  perform write_audit('invoice.promo', 'invoice', p_invoice_id, null, jsonb_build_object('code', promo ->> 'code', 'amount', d));
  return jsonb_build_object('ok', true, 'kind', 'promo', 'discount', d);
end;
$$;

-- Take a payment. Split and part payments are just several calls. Guards
-- against overpaying and double-submits (idempotency key).
create or replace function public.record_payment(
  p_invoice_id uuid,
  p_amount numeric,
  p_method text,
  p_reference text,
  p_actor uuid,
  p_voucher_code text default null,
  p_idempotency_key text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  actor uuid := resolve_actor(p_actor);
  inv record;
  v record;
  v_id uuid;
  pay_id uuid;
  amt numeric(10, 2) := round(coalesce(p_amount, 0), 2);
begin
  if p_idempotency_key is not null then
    select id into pay_id from payments where idempotency_key = p_idempotency_key;
    if pay_id is not null then
      return (select jsonb_build_object('payment_id', pay_id, 'status', i.status, 'amount_paid', i.amount_paid,
                'balance_due', i.balance_due, 'duplicate', true)
              from invoices i where i.id = p_invoice_id);
    end if;
  end if;
  select * into inv from invoices where id = p_invoice_id and location_id = staff_location_id() for update;
  if not found then
    perform oz_raise('NOT_FOUND', 'We couldn''t find that invoice.');
  end if;
  if inv.status not in ('issued', 'partial') then
    perform oz_raise('CANNOT_PAY', case inv.status when 'paid' then 'This invoice is already paid.'
                                                   when 'void' then 'This invoice has been voided.'
                                                   else 'This invoice isn''t ready for payment.' end);
  end if;
  if p_method not in ('cash', 'eftpos', 'bank_transfer', 'voucher', 'other') then
    perform oz_raise('INVALID_INPUT', 'Choose a payment method.');
  end if;
  if amt <= 0 then
    perform oz_raise('INVALID_INPUT', 'Enter an amount above $0.');
  end if;
  if amt > inv.balance_due then
    perform oz_raise('OVERPAYMENT', 'That''s more than the $' || to_char(inv.balance_due, 'FM999990.00') || ' owing. For cash, enter what''s owed and give change.');
  end if;

  if p_method = 'voucher' then
    select * into v from vouchers
    where location_id = inv.location_id and upper(code) = upper(btrim(coalesce(p_voucher_code, ''))) for update;
    if not found or v.status <> 'active' or (v.expires_at is not null and v.expires_at < shop_today()) then
      perform oz_raise('VOUCHER_INVALID', 'That voucher isn''t valid.');
    end if;
    if v.balance < amt then
      perform oz_raise('VOUCHER_BALANCE', 'That voucher only has $' || to_char(v.balance, 'FM999990.00') || ' left.');
    end if;
    v_id := v.id;
  end if;

  insert into payments (invoice_id, amount, method, reference, voucher_id, received_by_staff_id, idempotency_key)
  values (p_invoice_id, amt, p_method, nullif(left(btrim(coalesce(p_reference, '')), 100), ''), v_id, actor, p_idempotency_key)
  returning id into pay_id;

  if v_id is not null then
    update vouchers set balance = balance - amt,
      status = case when balance - amt <= 0 then 'used' else status end
    where id = v_id;
    insert into voucher_redemptions (voucher_id, payment_id, amount) values (v_id, pay_id, amt);
  end if;

  perform log_customer_event(inv.customer_id, 'payment',
    'Paid $' || to_char(amt, 'FM999990.00') || ' by ' || replace(p_method, '_', ' ') || ' on ' || inv.number, inv.booking_id, inv.id);
  return (select jsonb_build_object('payment_id', pay_id, 'status', i.status, 'amount_paid', i.amount_paid,
            'balance_due', i.balance_due, 'duplicate', false)
          from invoices i where i.id = p_invoice_id);
end;
$$;

-- Record the cash handed over for a cash payment and the change given. Called
-- straight after record_payment; safe to repeat (last value wins).
create or replace function public.set_payment_tendered(p_payment_id uuid, p_tendered numeric, p_actor uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  actor uuid := resolve_actor(p_actor);
  p record;
  t numeric(10, 2) := round(coalesce(p_tendered, 0), 2);
begin
  select pa.* into p from payments pa join invoices i on i.id = pa.invoice_id
  where pa.id = p_payment_id and i.location_id = staff_location_id() for update of pa;
  if not found then
    perform oz_raise('NOT_FOUND', 'We couldn''t find that payment.');
  end if;
  if p.method <> 'cash' or p.amount <= 0 then
    perform oz_raise('INVALID_INPUT', 'Only cash payments have change.');
  end if;
  if t < p.amount then
    perform oz_raise('INVALID_INPUT', 'The cash handed over is less than the payment.');
  end if;
  update payments set tendered = t, change_given = t - p.amount where id = p.id;
  return jsonb_build_object('tendered', t, 'change_given', t - p.amount);
end;
$$;

create or replace function public.refund_payment(p_payment_id uuid, p_amount numeric, p_reason text, p_actor uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  actor uuid := resolve_actor(p_actor, true);
  p record;
  inv record;
  already numeric(10, 2);
  amt numeric(10, 2) := round(coalesce(p_amount, 0), 2);
  new_id uuid;
begin
  select * into p from payments where id = p_payment_id for update;
  if not found or p.amount <= 0 then
    perform oz_raise('NOT_FOUND', 'We couldn''t find that payment.');
  end if;
  select * into inv from invoices where id = p.invoice_id and location_id = staff_location_id() for update;
  if not found then
    perform oz_raise('NOT_FOUND', 'We couldn''t find that invoice.');
  end if;
  if length(btrim(coalesce(p_reason, ''))) = 0 then
    perform oz_raise('REASON_REQUIRED', 'Add a reason for the refund.');
  end if;
  select coalesce(-sum(amount), 0) into already from payments where refund_of_payment_id = p.id;
  if amt <= 0 or amt > p.amount - already then
    perform oz_raise('INVALID_INPUT', 'You can refund up to $' || to_char(p.amount - already, 'FM999990.00') || ' on this payment.');
  end if;
  insert into payments (invoice_id, amount, method, reference, voucher_id, refund_of_payment_id, received_by_staff_id, note)
  values (p.invoice_id, -amt, p.method, p.reference, p.voucher_id, p.id, actor, left(btrim(p_reason), 300))
  returning id into new_id;
  if p.voucher_id is not null then
    update vouchers set balance = least(initial_value, balance + amt), status = 'active' where id = p.voucher_id;
  end if;
  perform write_audit('payment.refund', 'invoice', p.invoice_id,
    jsonb_build_object('payment_id', p.id, 'amount', p.amount),
    jsonb_build_object('refund', amt, 'reason', p_reason));
  perform log_customer_event(inv.customer_id, 'payment',
    'Refunded $' || to_char(amt, 'FM999990.00') || ' on ' || inv.number, inv.booking_id, inv.id);
  return jsonb_build_object('refund_id', new_id);
end;
$$;

create or replace function public.void_invoice(p_invoice_id uuid, p_reason text, p_actor uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  actor uuid := resolve_actor(p_actor, true);
  inv record;
begin
  select * into inv from invoices where id = p_invoice_id and location_id = staff_location_id() for update;
  if not found then
    perform oz_raise('NOT_FOUND', 'We couldn''t find that invoice.');
  end if;
  if inv.status = 'void' then
    return;
  end if;
  if length(btrim(coalesce(p_reason, ''))) = 0 then
    perform oz_raise('REASON_REQUIRED', 'Add a reason for voiding.');
  end if;
  if inv.amount_paid <> 0 then
    perform oz_raise('HAS_PAYMENTS', 'Refund the payments on this invoice before voiding it.');
  end if;
  update invoices set status = 'void', voided_at = now(), void_reason = left(btrim(p_reason), 300) where id = p_invoice_id;
  update loyalty_rewards set status = 'issued', redeemed_at = null, redeemed_invoice_id = null
  where redeemed_invoice_id = p_invoice_id and status = 'redeemed';
  perform recalc_invoice(p_invoice_id);
  perform write_audit('invoice.void', 'invoice', p_invoice_id,
    jsonb_build_object('number', inv.number, 'total', inv.total), jsonb_build_object('reason', p_reason));
  perform log_customer_event(inv.customer_id, 'invoice', 'Invoice ' || inv.number || ' voided', inv.booking_id, inv.id);
end;
$$;

create or replace function public.send_invoice_message(p_invoice_id uuid, p_template_key text, p_actor uuid)
returns int
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  actor uuid := resolve_actor(p_actor);
  inv record;
begin
  if p_template_key not in ('receipt', 'payment_reminder') then
    perform oz_raise('INVALID_INPUT', 'Unknown message.');
  end if;
  select * into inv from invoices where id = p_invoice_id and location_id = staff_location_id();
  if not found then
    perform oz_raise('NOT_FOUND', 'We couldn''t find that invoice.');
  end if;
  return enqueue_message(p_template_key, inv.customer_id, inv.booking_id, inv.id,
    jsonb_build_object('invoice_number', inv.number,
      'amount', to_char(inv.total, 'FM999990.00'),
      'balance', to_char(inv.balance_due, 'FM999990.00'),
      'receipt_url', site_url('/r/' || inv.public_token::text)),
    null, null, now(), actor);
end;
$$;

-- -----------------------------------------------------------------------------
-- 14. CRM
-- -----------------------------------------------------------------------------

create or replace function public.update_customer(p_customer_id uuid, payload jsonb, p_actor uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  actor uuid := resolve_actor(p_actor);
  c record;
  nm text;
  ph text;
  em text;
  tg text[];
begin
  select * into c from customers where id = p_customer_id for update;
  if not found or c.is_walkin_placeholder then
    perform oz_raise('NOT_FOUND', 'We couldn''t find that customer.');
  end if;
  nm := coalesce(nullif(btrim(payload ->> 'name'), ''), c.name);
  if length(nm) > 80 then
    perform oz_raise('INVALID_INPUT', 'That name is too long.');
  end if;
  ph := case when payload ? 'phone' then normalize_au_phone(payload ->> 'phone') else c.phone end;
  if ph is not null and ph is distinct from c.phone then
    if not is_valid_phone(ph) then
      perform oz_raise('INVALID_PHONE', 'That phone number doesn''t look right.');
    end if;
    if exists (select 1 from customers where phone = ph and id <> c.id) then
      perform oz_raise('PHONE_IN_USE', 'Another customer already has that number. Merge them instead.');
    end if;
  end if;
  em := case when payload ? 'email' then nullif(lower(btrim(coalesce(payload ->> 'email', ''))), '') else c.email end;
  if em is not null and em !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    perform oz_raise('INVALID_INPUT', 'That email address doesn''t look right.');
  end if;
  if payload ? 'tags' then
    select coalesce(array_agg(distinct lower(btrim(t))) filter (where btrim(t) <> ''), '{}')
      into tg from jsonb_array_elements_text(payload -> 'tags') t;
  else
    tg := c.tags;
  end if;
  update customers set
    name = nm,
    phone = ph,
    email = em,
    tags = tg,
    is_vip = coalesce((payload ->> 'is_vip')::boolean, is_vip),
    marketing_opt_in = coalesce((payload ->> 'marketing_opt_in')::boolean, marketing_opt_in),
    notes = case when payload ? 'notes' then nullif(left(payload ->> 'notes', 4000), '') else notes end
  where id = c.id;
  perform write_audit('customer.update', 'customer', c.id,
    jsonb_build_object('name', c.name, 'phone', c.phone, 'email', c.email, 'tags', c.tags, 'is_vip', c.is_vip,
                       'marketing_opt_in', c.marketing_opt_in),
    (select jsonb_build_object('name', name, 'phone', phone, 'email', email, 'tags', tags, 'is_vip', is_vip,
                               'marketing_opt_in', marketing_opt_in) from customers where id = c.id));
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.create_customer(payload jsonb, p_actor uuid)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  actor uuid := resolve_actor(p_actor);
  ph text := normalize_au_phone(payload ->> 'phone');
  nm text := btrim(coalesce(payload ->> 'name', ''));
  cid uuid;
begin
  if length(nm) < 2 or length(nm) > 80 then
    perform oz_raise('INVALID_INPUT', 'Please enter a name.');
  end if;
  if ph is not null and not is_valid_phone(ph) then
    perform oz_raise('INVALID_PHONE', 'That phone number doesn''t look right.');
  end if;
  if ph is not null and exists (select 1 from customers where phone = ph) then
    perform oz_raise('PHONE_IN_USE', 'A customer with that number already exists.');
  end if;
  insert into customers (name, phone, email, marketing_opt_in)
  values (nm, ph, nullif(lower(btrim(coalesce(payload ->> 'email', ''))), ''),
    coalesce((payload ->> 'marketing_opt_in')::boolean, true))
  returning id into cid;
  if nullif(payload ->> 'rego', '') is not null then
    perform staff_find_or_create_vehicle(cid, payload ->> 'rego', payload ->> 'make_model', coalesce(nullif(payload ->> 'vehicle_type', ''), 'sedan'));
  end if;
  perform write_audit('customer.create', 'customer', cid, null, payload - 'rego');
  return cid;
end;
$$;

create or replace function public.add_customer_note(p_customer_id uuid, p_body text, p_actor uuid)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  actor uuid := resolve_actor(p_actor);
  nid uuid;
begin
  if length(btrim(coalesce(p_body, ''))) = 0 then
    perform oz_raise('INVALID_INPUT', 'Write a note first.');
  end if;
  if not exists (select 1 from customers where id = p_customer_id) then
    perform oz_raise('NOT_FOUND', 'We couldn''t find that customer.');
  end if;
  insert into customer_notes (customer_id, body, staff_id)
  values (p_customer_id, left(btrim(p_body), 4000), actor)
  returning id into nid;
  perform log_customer_event(p_customer_id, 'note', 'Note added');
  return nid;
end;
$$;

create or replace function public.upsert_customer_vehicle(p_customer_id uuid, payload jsonb, p_actor uuid)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  actor uuid := resolve_actor(p_actor);
  vid uuid := nullif(payload ->> 'id', '')::uuid;
  vt text := coalesce(nullif(payload ->> 'vehicle_type', ''), 'sedan');
  yr int := nullif(payload ->> 'year', '')::int;
begin
  if vt not in ('sedan', 'small_wagon', 'van', '4wd') then
    perform oz_raise('INVALID_INPUT', 'Please choose a vehicle type.');
  end if;
  if not exists (select 1 from customers where id = p_customer_id) then
    perform oz_raise('NOT_FOUND', 'We couldn''t find that customer.');
  end if;
  if vid is null then
    insert into vehicles (customer_id, rego, make_model, vehicle_type, colour, year, nickname, notes)
    values (p_customer_id, payload ->> 'rego', nullif(left(btrim(coalesce(payload ->> 'make_model', '')), 60), ''), vt,
      nullif(left(btrim(coalesce(payload ->> 'colour', '')), 30), ''), yr,
      nullif(left(btrim(coalesce(payload ->> 'nickname', '')), 30), ''),
      nullif(left(btrim(coalesce(payload ->> 'notes', '')), 500), ''))
    returning id into vid;
  else
    update vehicles set rego = payload ->> 'rego',
      make_model = nullif(left(btrim(coalesce(payload ->> 'make_model', '')), 60), ''),
      vehicle_type = vt,
      colour = nullif(left(btrim(coalesce(payload ->> 'colour', '')), 30), ''),
      year = yr,
      nickname = nullif(left(btrim(coalesce(payload ->> 'nickname', '')), 30), ''),
      notes = nullif(left(btrim(coalesce(payload ->> 'notes', '')), 500), '')
    where id = vid and customer_id = p_customer_id;
    if not found then
      perform oz_raise('NOT_FOUND', 'We couldn''t find that vehicle.');
    end if;
  end if;
  perform log_customer_event(p_customer_id, 'vehicle', 'Vehicle ' || coalesce(normalize_rego(payload ->> 'rego'), '(no rego)') || ' saved');
  return vid;
end;
$$;

create or replace function public.archive_customer_vehicle(p_vehicle_id uuid, p_actor uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare actor uuid := resolve_actor(p_actor); v record;
begin
  update vehicles set archived_at = now(), is_primary = false where id = p_vehicle_id returning * into v;
  if not found then
    perform oz_raise('NOT_FOUND', 'We couldn''t find that vehicle.');
  end if;
  perform log_customer_event(v.customer_id, 'vehicle', 'Vehicle ' || coalesce(v.rego, '(no rego)') || ' removed');
end;
$$;

-- Privacy request: remove personal details but keep the (anonymous)
-- financial history, which the business has to retain.
create or replace function public.anonymise_customer(p_customer_id uuid, p_actor uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare actor uuid := resolve_actor(p_actor, true); c record;
begin
  select * into c from customers where id = p_customer_id for update;
  if not found or c.is_walkin_placeholder then
    perform oz_raise('NOT_FOUND', 'We couldn''t find that customer.');
  end if;
  update customers set name = 'Deleted customer', phone = null, email = null, notes = null, tags = '{}',
    marketing_opt_in = false, auth_user_id = null, anonymised_at = now(), referral_code = null
  where id = c.id;
  update vehicles set rego = null, make_model = null, notes = null, nickname = null where customer_id = c.id;
  delete from customer_notes where customer_id = c.id;
  perform write_audit('customer.anonymise', 'customer', c.id, jsonb_build_object('name', c.name), null);
end;
$$;

-- Merge a duplicate into the record we keep. Everything moves across; the
-- duplicate is left as an empty shell pointing at the survivor.
create or replace function public.merge_customers(p_keep uuid, p_merge uuid, p_actor uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  actor uuid := resolve_actor(p_actor, true);
  k record;
  m record;
  moved jsonb;
begin
  if p_keep = p_merge then
    perform oz_raise('INVALID_INPUT', 'Pick two different customers.');
  end if;
  select * into k from customers where id = p_keep for update;
  select * into m from customers where id = p_merge for update;
  if k.id is null or m.id is null or k.is_walkin_placeholder or m.is_walkin_placeholder then
    perform oz_raise('NOT_FOUND', 'We couldn''t find both customers.');
  end if;
  if m.merged_into_customer_id is not null then
    perform oz_raise('ALREADY_MERGED', 'That customer has already been merged.');
  end if;
  if k.auth_user_id is not null and m.auth_user_id is not null then
    perform oz_raise('BOTH_HAVE_ACCOUNTS', 'Both customers have online accounts — they can''t be merged automatically.');
  end if;

  moved := jsonb_build_object(
    'vehicles', (select count(*) from vehicles where customer_id = m.id),
    'bookings', (select count(*) from bookings where customer_id = m.id),
    'invoices', (select count(*) from invoices where customer_id = m.id));

  update vehicles set customer_id = k.id where customer_id = m.id;
  update bookings set customer_id = k.id where customer_id = m.id;
  update invoices set customer_id = k.id where customer_id = m.id;
  delete from loyalty_rewards r where r.customer_id = m.id
    and exists (select 1 from loyalty_rewards x where x.customer_id = k.id and x.rule_id = r.rule_id and x.milestone = r.milestone);
  update loyalty_rewards set customer_id = k.id where customer_id = m.id;
  update feedback set customer_id = k.id where customer_id = m.id;
  update customer_notes set customer_id = k.id where customer_id = m.id;
  update customer_events set customer_id = k.id where customer_id = m.id;
  update message_outbox set customer_id = k.id where customer_id = m.id;
  update vouchers set issued_to_customer_id = k.id where issued_to_customer_id = m.id;
  update customers set referred_by_customer_id = k.id where referred_by_customer_id = m.id;

  update customers set phone = null, auth_user_id = null, merged_into_customer_id = k.id,
    referral_code = null, marketing_opt_in = false
  where id = m.id;
  update customers set
    phone = coalesce(k.phone, m.phone),
    email = coalesce(k.email, m.email),
    auth_user_id = coalesce(k.auth_user_id, m.auth_user_id),
    tags = (select coalesce(array_agg(distinct t), '{}') from unnest(k.tags || m.tags) t),
    is_vip = k.is_vip or m.is_vip,
    notes = nullif(concat_ws(E'\n', k.notes, m.notes), '')
  where id = k.id;

  perform write_audit('customer.merge', 'customer', k.id,
    jsonb_build_object('merged_customer', m.id, 'merged_name', m.name, 'merged_phone', m.phone), moved);
  perform log_customer_event(k.id, 'merge', 'Merged with duplicate record "' || m.name || '"');
  return moved;
end;
$$;

-- CSV import (PickTime / old CRM exports). Upserts by phone; a rego becomes
-- a vehicle. Dry run returns exactly what WOULD happen, row by row.
create or replace function public.import_customers_csv_rows(p_rows jsonb, p_dry_run boolean, p_actor uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  actor uuid := resolve_actor(p_actor, true);
  r jsonb;
  i int := 0;
  created int := 0;
  updated int := 0;
  skipped int := 0;
  errors jsonb := '[]'::jsonb;
  seen text[] := '{}';
  ph text;
  nm text;
  em text;
  cid uuid;
  vt text;
  extra text;
begin
  if jsonb_typeof(p_rows) <> 'array' then
    perform oz_raise('INVALID_INPUT', 'Expected a list of rows.');
  end if;
  if jsonb_array_length(p_rows) > 5000 then
    perform oz_raise('TOO_MANY_ROWS', 'Import up to 5,000 rows at a time.');
  end if;
  for r in select * from jsonb_array_elements(p_rows) loop
    i := i + 1;
    ph := normalize_au_phone(r ->> 'phone');
    nm := btrim(coalesce(r ->> 'name', ''));
    em := nullif(lower(btrim(coalesce(r ->> 'email', ''))), '');
    vt := coalesce(nullif(lower(r ->> 'vehicle_type'), ''), 'sedan');
    if vt not in ('sedan', 'small_wagon', 'van', '4wd') then vt := 'sedan'; end if;

    if ph is null or not is_valid_phone(ph) then
      skipped := skipped + 1;
      errors := errors || jsonb_build_object('row', i, 'error', 'Missing or invalid phone number');
      continue;
    end if;
    if nm = '' then
      skipped := skipped + 1;
      errors := errors || jsonb_build_object('row', i, 'error', 'Missing name');
      continue;
    end if;
    if em is not null and em !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
      em := null;
    end if;
    if ph = any(seen) then
      skipped := skipped + 1;
      errors := errors || jsonb_build_object('row', i, 'error', 'Same phone number appears earlier in the file');
      continue;
    end if;
    seen := seen || ph;

    select id into cid from customers where phone = ph;
    if cid is null then
      created := created + 1;
    else
      updated := updated + 1;
    end if;

    if not p_dry_run then
      extra := nullif(concat_ws(' · ',
        case when nullif(r ->> 'last_visit', '') is not null then 'Last visit (imported): ' || (r ->> 'last_visit') end,
        case when nullif(r ->> 'total_spend', '') is not null then 'Total spend (imported): ' || (r ->> 'total_spend') end,
        nullif(btrim(coalesce(r ->> 'notes', '')), '')), '');
      if cid is null then
        insert into customers (name, phone, email, notes)
        values (left(nm, 80), ph, em, extra)
        returning id into cid;
      else
        update customers set
          name = case when name like 'Customer %' then left(nm, 80) else name end,
          email = coalesce(email, em),
          notes = case when extra is null then notes else nullif(concat_ws(E'\n', notes, extra), '') end
        where id = cid;
      end if;
      if normalize_rego(r ->> 'rego') is not null then
        perform staff_find_or_create_vehicle(cid, r ->> 'rego', r ->> 'make_model', vt);
      end if;
    end if;
    cid := null;
  end loop;

  if not p_dry_run then
    perform write_audit('customer.import', 'customer', null, null,
      jsonb_build_object('created', created, 'updated', updated, 'skipped', skipped));
  end if;
  return jsonb_build_object('dry_run', p_dry_run, 'total', i, 'created', created, 'updated', updated,
    'skipped', skipped, 'errors', errors);
end;
$$;

-- -----------------------------------------------------------------------------
-- 15. Staff management (no service-role key needed)
-- -----------------------------------------------------------------------------

create or replace function public.invite_staff(p_email text, p_name text, p_role text, p_actor uuid)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  actor uuid := resolve_actor(p_actor, true);
  em text := nullif(lower(btrim(coalesce(p_email, ''))), '');
  iid uuid;
begin
  if em is null or em !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    perform oz_raise('INVALID_INPUT', 'Enter a valid email address.');
  end if;
  if length(btrim(coalesce(p_name, ''))) < 2 then
    perform oz_raise('INVALID_INPUT', 'Enter their name.');
  end if;
  if p_role not in ('admin', 'staff') then
    perform oz_raise('INVALID_INPUT', 'Choose a role.');
  end if;
  if exists (select 1 from staff s join auth.users u on u.id = s.auth_user_id where lower(u.email) = em) then
    perform oz_raise('ALREADY_STAFF', 'That person is already on the team.');
  end if;
  delete from staff_invites where lower(email) = em and claimed_at is null;
  insert into staff_invites (location_id, email, name, role, created_by)
  values (staff_location_id(), em, left(btrim(p_name), 80), p_role, actor)
  returning id into iid;
  perform write_audit('staff.invite', 'staff_invite', iid, null, jsonb_build_object('email', em, 'role', p_role));
  return iid;
end;
$$;

-- Called by the admin app right after sign-in. If this account's email has
-- an open invite, it becomes a staff member.
create or replace function public.claim_staff_invite()
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  em text;
  inv record;
  sid uuid;
begin
  if uid is null then
    return jsonb_build_object('claimed', false);
  end if;
  select id into sid from staff where auth_user_id = uid;
  if sid is not null then
    return jsonb_build_object('claimed', false, 'already_staff', true);
  end if;
  select lower(email) into em from auth.users where id = uid;
  select * into inv from staff_invites where lower(email) = em and claimed_at is null order by created_at desc limit 1;
  if not found then
    return jsonb_build_object('claimed', false);
  end if;
  insert into staff (auth_user_id, location_id, name, role, email)
  values (uid, inv.location_id, inv.name, inv.role, em)
  returning id into sid;
  update staff_invites set claimed_at = now(), claimed_by_staff_id = sid where id = inv.id;
  perform set_config('oz.actor_staff_id', sid::text, true);
  perform write_audit('staff.invite_claimed', 'staff', sid, null, jsonb_build_object('email', em, 'role', inv.role));
  return jsonb_build_object('claimed', true, 'staff_id', sid);
end;
$$;

create or replace function public.update_staff(p_staff_id uuid, payload jsonb, p_actor uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  actor uuid := resolve_actor(p_actor, true);
  s record;
  new_role text;
  new_active boolean;
begin
  select * into s from staff where id = p_staff_id and location_id = staff_location_id() for update;
  if not found then
    perform oz_raise('NOT_FOUND', 'We couldn''t find that staff member.');
  end if;
  new_role := coalesce(payload ->> 'role', s.role);
  new_active := coalesce((payload ->> 'active')::boolean, s.active);
  if new_role not in ('admin', 'staff') then
    perform oz_raise('INVALID_INPUT', 'Choose a role.');
  end if;
  if s.role = 'admin' and s.active and (new_role <> 'admin' or not new_active)
     and (select count(*) from staff where location_id = s.location_id and role = 'admin' and active) <= 1 then
    perform oz_raise('LAST_ADMIN', 'You need at least one active admin.');
  end if;
  update staff set
    name = coalesce(nullif(left(btrim(payload ->> 'name'), 80), ''), name),
    role = new_role,
    active = new_active,
    color = case when coalesce(payload ->> 'color', '') ~ '^#[0-9a-fA-F]{6}$' then payload ->> 'color' else color end,
    avatar_initials = case when payload ? 'avatar_initials' then nullif(left(upper(btrim(payload ->> 'avatar_initials')), 3), '') else avatar_initials end
  where id = s.id;
  if not new_active then
    update staff_sessions set ended_at = now() where staff_id = s.id and ended_at is null;
  end if;
  perform write_audit('staff.update', 'staff', s.id,
    jsonb_build_object('name', s.name, 'role', s.role, 'active', s.active),
    (select jsonb_build_object('name', name, 'role', role, 'active', active) from staff where id = s.id));
end;
$$;

-- -----------------------------------------------------------------------------
-- 16. End of day
-- -----------------------------------------------------------------------------

create or replace function public.day_summary(p_date date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  loc uuid := staff_location_id();
  tz text := shop_tz();
  d0 timestamptz := (p_date::timestamp) at time zone tz;
  d1 timestamptz := ((p_date + 1)::timestamp) at time zone tz;
  by_method jsonb;
  existing record;
begin
  perform require_staff();
  select coalesce(jsonb_object_agg(method, total), '{}'::jsonb) into by_method from (
    select p.method, sum(p.amount) as total from payments p join invoices i on i.id = p.invoice_id
    where i.location_id = loc and p.received_at >= d0 and p.received_at < d1
    group by p.method) x;
  select * into existing from day_closes where location_id = loc and business_date = p_date;
  return jsonb_build_object(
    'date', p_date,
    'cars_completed', (select count(*) from bookings where location_id = loc and status = 'completed'
                        and completed_at >= d0 and completed_at < d1),
    'revenue_total', coalesce((select sum(coalesce(i.total, b.amount_charged, 0)) from bookings b
                        left join invoices i on i.booking_id = b.id and i.status <> 'void'
                        where b.location_id = loc and b.status = 'completed'
                          and b.completed_at >= d0 and b.completed_at < d1), 0),
    'payments_by_method', by_method,
    'payments_total', coalesce((select sum(p.amount) from payments p join invoices i on i.id = p.invoice_id
                        where i.location_id = loc and p.received_at >= d0 and p.received_at < d1), 0),
    'expected_cash', coalesce((by_method ->> 'cash')::numeric, 0),
    'eftpos_total', coalesce((by_method ->> 'eftpos')::numeric, 0),
    'refunds_total', coalesce((select -sum(p.amount) from payments p join invoices i on i.id = p.invoice_id
                        where i.location_id = loc and p.amount < 0 and p.received_at >= d0 and p.received_at < d1), 0),
    'voids_count', (select count(*) from invoices where location_id = loc and voided_at >= d0 and voided_at < d1),
    'outstanding_created', coalesce((select sum(balance_due) from invoices where location_id = loc
                        and status in ('issued', 'partial') and issued_at >= d0 and issued_at < d1), 0),
    'is_closed', existing.id is not null and existing.reopened_at is null,
    'close', case when existing.id is null then null else to_jsonb(existing) end
  );
end;
$$;

create or replace function public.close_day(p_date date, p_counted_cash numeric, p_notes text, p_actor uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  actor uuid := resolve_actor(p_actor);
  loc uuid := staff_location_id();
  s jsonb;
  existing record;
begin
  select * into existing from day_closes where location_id = loc and business_date = p_date for update;
  if found and existing.reopened_at is null then
    perform oz_raise('ALREADY_CLOSED', 'That day is already closed. An admin can reopen it.');
  end if;
  if p_counted_cash is null or p_counted_cash < 0 then
    perform oz_raise('INVALID_INPUT', 'Enter the cash you counted.');
  end if;
  s := day_summary(p_date);
  insert into day_closes (location_id, business_date, cars_completed, revenue_total, expected_cash, counted_cash,
    variance, eftpos_total, other_totals, outstanding_created, refunds_total, voids_count, notes, closed_by_staff_id, closed_at)
  values (loc, p_date, (s ->> 'cars_completed')::int, (s ->> 'revenue_total')::numeric, (s ->> 'expected_cash')::numeric,
    p_counted_cash, p_counted_cash - (s ->> 'expected_cash')::numeric, (s ->> 'eftpos_total')::numeric,
    (s -> 'payments_by_method'), (s ->> 'outstanding_created')::numeric, (s ->> 'refunds_total')::numeric,
    (s ->> 'voids_count')::int, nullif(left(btrim(coalesce(p_notes, '')), 1000), ''), actor, now())
  on conflict (location_id, business_date) do update set
    cars_completed = excluded.cars_completed, revenue_total = excluded.revenue_total,
    expected_cash = excluded.expected_cash, counted_cash = excluded.counted_cash, variance = excluded.variance,
    eftpos_total = excluded.eftpos_total, other_totals = excluded.other_totals,
    outstanding_created = excluded.outstanding_created, refunds_total = excluded.refunds_total,
    voids_count = excluded.voids_count, notes = excluded.notes, closed_by_staff_id = excluded.closed_by_staff_id,
    closed_at = now(), reopened_at = null;
  perform write_audit('day.close', 'day_close', null, null,
    jsonb_build_object('date', p_date, 'counted_cash', p_counted_cash, 'expected_cash', s ->> 'expected_cash'));
  return day_summary(p_date);
end;
$$;

create or replace function public.reopen_day(p_date date, p_actor uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare actor uuid := resolve_actor(p_actor, true);
begin
  update day_closes set reopened_at = now()
  where location_id = staff_location_id() and business_date = p_date and reopened_at is null;
  if not found then
    perform oz_raise('NOT_FOUND', 'That day isn''t closed.');
  end if;
  perform write_audit('day.reopen', 'day_close', null, null, jsonb_build_object('date', p_date));
end;
$$;

-- -----------------------------------------------------------------------------
-- 17. Search
-- -----------------------------------------------------------------------------

-- One box for everything: rego, phone, name, invoice number, booking ref.
create or replace function public.global_search(p_query text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  q text := btrim(coalesce(p_query, ''));
  qlike text;
  digits text := regexp_replace(q, '[^0-9]', '', 'g');
  rg text := normalize_rego(q);
  loc uuid := staff_location_id();
begin
  perform require_staff();
  if length(q) < 2 then
    return jsonb_build_object('customers', '[]'::jsonb, 'vehicles', '[]'::jsonb, 'bookings', '[]'::jsonb, 'invoices', '[]'::jsonb);
  end if;
  qlike := '%' || replace(replace(replace(q, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  return jsonb_build_object(
    'customers', coalesce((select jsonb_agg(x) from (
      select c.id, c.name, c.phone, c.is_vip
      from customers c
      where c.merged_into_customer_id is null and not c.is_walkin_placeholder and c.anonymised_at is null
        and (c.name ilike qlike or (length(digits) >= 3 and c.phone like '%' || digits || '%') or c.email ilike qlike)
      order by (lower(c.name) = lower(q)) desc, c.name limit 8) x), '[]'::jsonb),
    'vehicles', coalesce((select jsonb_agg(x) from (
      select v.id, v.rego, v.make_model, v.vehicle_type, c.id as customer_id, c.name as customer_name
      from vehicles v join customers c on c.id = v.customer_id
      where rg is not null and v.rego like '%' || rg || '%' and v.archived_at is null
      order by (v.rego = rg) desc, v.rego limit 8) x), '[]'::jsonb),
    'bookings', coalesce((select jsonb_agg(x) from (
      select b.id, b.reference_code, b.status, b.requested_date, b.requested_time, c.name as customer_name
      from bookings b join customers c on c.id = b.customer_id
      where b.location_id = loc and b.reference_code ilike qlike
      order by b.created_at desc limit 8) x), '[]'::jsonb),
    'invoices', coalesce((select jsonb_agg(x) from (
      select i.id, i.number, i.status, i.total, i.balance_due, c.name as customer_name
      from invoices i left join customers c on c.id = i.customer_id
      where i.location_id = loc and i.number ilike qlike
      order by i.created_at desc limit 8) x), '[]'::jsonb)
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- 18. Reports (staff-only, compact JSON for a fast UI)
-- -----------------------------------------------------------------------------
-- Revenue is recognised when a car is completed, valued at its invoice total
-- (or v1 amount_charged for older bookings that were never invoiced).

create or replace function public.completed_jobs(p_from date, p_to date)
returns table (
  booking_id uuid, customer_id uuid, service_id uuid, vehicle_type text, staff_id uuid,
  completed_local timestamp, amount numeric, started_at timestamptz, finished_at timestamptz,
  expected_minutes int, promo_code_id uuid, loyalty_reward_id uuid, source text
)
language sql
stable
security definer
set search_path = public
as $$
  select b.id, b.customer_id, b.service_id, coalesce(b.vehicle_type, 'sedan'),
    coalesce(b.assigned_staff_id, b.processed_by_staff_id),
    (coalesce(b.completed_at, b.starts_at) at time zone shop_tz()),
    coalesce(i.total, b.amount_charged, 0),
    b.started_at, coalesce(b.ready_at, b.completed_at), b.duration_minutes,
    b.promo_code_id, b.loyalty_reward_id, b.source
  from bookings b
  left join invoices i on i.booking_id = b.id and i.status <> 'void'
  where b.location_id = staff_location_id()
    and b.status = 'completed'
    and (coalesce(b.completed_at, b.starts_at) at time zone shop_tz())::date between p_from and p_to;
$$;

create or replace function public.dashboard_stats(p_date date default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  d date := coalesce(p_date, shop_today());
  loc uuid := staff_location_id();
  tz text := shop_tz();
  d0 timestamptz := (d::timestamp) at time zone tz;
  d1 timestamptz := ((d + 1)::timestamp) at time zone tz;
begin
  perform require_staff();
  return jsonb_build_object(
    'date', d,
    'requests_waiting', (select count(*) from bookings where location_id = loc and status = 'pending'),
    'scheduled_today', (select count(*) from bookings where location_id = loc and status = 'approved' and requested_date = d),
    'arrived', (select count(*) from bookings where location_id = loc and status = 'checked_in'),
    'in_bay', (select count(*) from bookings where location_id = loc and status = 'in_progress'),
    'ready', (select count(*) from bookings where location_id = loc and status = 'ready'),
    'done_today', (select count(*) from completed_jobs(d, d)),
    'revenue_today', coalesce((select sum(amount) from completed_jobs(d, d)), 0),
    'payments_today', coalesce((select sum(p.amount) from payments p join invoices i on i.id = p.invoice_id
                         where i.location_id = loc and p.received_at >= d0 and p.received_at < d1), 0),
    'outstanding_today', coalesce((select sum(i.balance_due) from invoices i join bookings b on b.id = i.booking_id
                         where i.location_id = loc and i.status in ('issued', 'partial')
                           and (b.requested_date = d or (i.issued_at >= d0 and i.issued_at < d1))), 0),
    'outstanding_total', coalesce((select sum(balance_due) from invoices where location_id = loc and status in ('issued', 'partial')), 0),
    'day_closed', exists (select 1 from day_closes where location_id = loc and business_date = d and reopened_at is null)
  );
end;
$$;

create or replace function public.revenue_series(p_from date, p_to date, p_bucket text default 'day')
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare b text := case when p_bucket in ('day', 'week', 'month') then p_bucket else 'day' end;
begin
  perform require_staff();
  return coalesce((
    with buckets as (
      select distinct date_trunc(b, gs)::date as bucket
      from generate_series(p_from::timestamp, p_to::timestamp, interval '1 day') gs
    ),
    jobs as (
      select date_trunc(b, completed_local)::date as bucket, count(*) cars, sum(amount) revenue
      from completed_jobs(p_from, p_to) group by 1
    )
    select jsonb_agg(jsonb_build_object('bucket', bk.bucket, 'revenue', coalesce(j.revenue, 0), 'cars', coalesce(j.cars, 0))
                     order by bk.bucket)
    from buckets bk left join jobs j on j.bucket = bk.bucket
  ), '[]'::jsonb);
end;
$$;

create or replace function public.service_breakdown(p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform require_staff();
  return coalesce((
    select jsonb_agg(jsonb_build_object('service_id', s.id, 'name', s.name, 'count', coalesce(x.cnt, 0),
      'revenue', coalesce(x.rev, 0)) order by coalesce(x.rev, 0) desc, s.sort_order)
    from services s
    left join (select service_id, count(*) cnt, sum(amount) rev from completed_jobs(p_from, p_to) group by service_id) x
      on x.service_id = s.id
    where s.location_id = staff_location_id()), '[]'::jsonb);
end;
$$;

create or replace function public.staff_performance(p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform require_staff();
  return coalesce((
    select jsonb_agg(jsonb_build_object('staff_id', s.id, 'name', s.name, 'color', s.color,
      'jobs', coalesce(x.jobs, 0), 'revenue', coalesce(x.rev, 0),
      'avg_minutes', x.avg_min, 'avg_expected_minutes', x.avg_exp, 'late_jobs', coalesce(x.late, 0))
      order by coalesce(x.rev, 0) desc)
    from staff s
    left join (
      select staff_id, count(*) jobs, sum(amount) rev,
        round(avg(extract(epoch from (finished_at - started_at)) / 60) filter (where started_at is not null and finished_at is not null)) avg_min,
        round(avg(expected_minutes)) avg_exp,
        count(*) filter (where started_at is not null and finished_at is not null
                           and finished_at - started_at > make_interval(mins => expected_minutes)) late
      from completed_jobs(p_from, p_to) group by staff_id
    ) x on x.staff_id = s.id
    where s.location_id = staff_location_id() and (s.active or x.jobs > 0)), '[]'::jsonb);
end;
$$;

create or replace function public.busiest_hours(p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform require_staff();
  return coalesce((
    select jsonb_agg(jsonb_build_object('dow', dow, 'hour', hr, 'count', cnt) order by dow, hr)
    from (
      select extract(isodow from (starts_at at time zone shop_tz()))::int dow,
             extract(hour from (starts_at at time zone shop_tz()))::int hr,
             count(*) cnt
      from bookings
      where location_id = staff_location_id()
        and status in ('completed', 'ready', 'in_progress', 'checked_in', 'approved')
        and (starts_at at time zone shop_tz())::date between p_from and p_to
      group by 1, 2
    ) x), '[]'::jsonb);
end;
$$;

-- Who owes what, and for how long. Includes old v1 jobs that were marked
-- complete with a charge but never paid.
create or replace function public.debtors_aging()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare today date := shop_today();
begin
  perform require_staff();
  return coalesce((
    select jsonb_agg(row_to_json(x)::jsonb order by x.days_old desc)
    from (
      select i.id as invoice_id, i.number, i.booking_id, c.id as customer_id, c.name as customer_name, c.phone,
        i.total, i.balance_due, (today - (i.issued_at at time zone shop_tz())::date) as days_old,
        case when (today - (i.issued_at at time zone shop_tz())::date) = 0 then 'today'
             when (today - (i.issued_at at time zone shop_tz())::date) <= 7 then '1-7'
             when (today - (i.issued_at at time zone shop_tz())::date) <= 30 then '8-30'
             else '30+' end as bucket,
        (select v.rego from bookings b join vehicles v on v.id = b.vehicle_id where b.id = i.booking_id) as rego
      from invoices i left join customers c on c.id = i.customer_id
      where i.location_id = staff_location_id() and i.status in ('issued', 'partial') and i.balance_due > 0
      union all
      select null, null, b.id, c.id, c.name, c.phone, b.amount_charged, b.amount_charged,
        (today - coalesce(b.completed_at, b.starts_at)::date),
        case when (today - coalesce(b.completed_at, b.starts_at)::date) = 0 then 'today'
             when (today - coalesce(b.completed_at, b.starts_at)::date) <= 7 then '1-7'
             when (today - coalesce(b.completed_at, b.starts_at)::date) <= 30 then '8-30'
             else '30+' end,
        (select v.rego from vehicles v where v.id = b.vehicle_id)
      from bookings b join customers c on c.id = b.customer_id
      where b.location_id = staff_location_id() and b.status = 'completed' and not b.paid
        and coalesce(b.amount_charged, 0) > 0
        and not exists (select 1 from invoices i2 where i2.booking_id = b.id and i2.status <> 'void')
    ) x), '[]'::jsonb);
end;
$$;

create or replace function public.gst_summary(p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare rate numeric := coalesce((select tax_rate from settings where location_id = staff_location_id()), 0.10);
begin
  perform require_staff();
  return jsonb_build_object(
    'tax_rate', rate,
    'months', coalesce((
      select jsonb_agg(jsonb_build_object('month', m, 'sales', sales, 'gst', gst_from_inclusive(sales, rate)) order by m)
      from (select date_trunc('month', completed_local)::date m, sum(amount) sales
            from completed_jobs(p_from, p_to) group by 1) x), '[]'::jsonb),
    'total_sales', coalesce((select sum(amount) from completed_jobs(p_from, p_to)), 0),
    'total_gst', gst_from_inclusive(coalesce((select sum(amount) from completed_jobs(p_from, p_to)), 0), rate)
  );
end;
$$;

-- Everything else the Reports page shows, in one round trip.
create or replace function public.report_overview(p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  loc uuid := staff_location_id();
  tz text := shop_tz();
  d0 timestamptz := (p_from::timestamp) at time zone tz;
  d1 timestamptz := ((p_to + 1)::timestamp) at time zone tz;
  cars int;
  revenue numeric;
begin
  perform require_staff();
  select count(*), coalesce(sum(amount), 0) into cars, revenue from completed_jobs(p_from, p_to);
  return jsonb_build_object(
    'from', p_from, 'to', p_to,
    'cars', cars,
    'revenue', revenue,
    'avg_ticket', case when cars > 0 then round(revenue / cars, 2) else 0 end,
    'customers', (select count(distinct customer_id) from completed_jobs(p_from, p_to) j
                  where not exists (select 1 from customers c where c.id = j.customer_id and c.is_walkin_placeholder)),
    'new_customers', (select count(distinct j.customer_id) from completed_jobs(p_from, p_to) j
                      where not exists (select 1 from bookings b where b.customer_id = j.customer_id and b.status = 'completed'
                                          and coalesce(b.completed_at, b.starts_at) < d0)
                        and not exists (select 1 from customers c where c.id = j.customer_id and c.is_walkin_placeholder)),
    'repeat_customers', (select count(*) from (select customer_id from completed_jobs(p_from, p_to) j
                          where not exists (select 1 from customers c where c.id = j.customer_id and c.is_walkin_placeholder)
                          group by customer_id having count(*) > 1) x),
    'by_vehicle_type', coalesce((select jsonb_agg(jsonb_build_object('vehicle_type', vehicle_type, 'count', cnt, 'revenue', rev))
                        from (select vehicle_type, count(*) cnt, sum(amount) rev from completed_jobs(p_from, p_to) group by 1) x), '[]'::jsonb),
    'by_source', coalesce((select jsonb_agg(jsonb_build_object('source', source, 'count', cnt))
                  from (select source, count(*) cnt from completed_jobs(p_from, p_to) group by 1) x), '[]'::jsonb),
    'by_payment_method', coalesce((select jsonb_agg(jsonb_build_object('method', method, 'total', total, 'count', cnt))
                  from (select p.method, sum(p.amount) total, count(*) cnt from payments p join invoices i on i.id = p.invoice_id
                        where i.location_id = loc and p.received_at >= d0 and p.received_at < d1 group by 1) x), '[]'::jsonb),
    'by_addon', coalesce((select jsonb_agg(jsonb_build_object('name', name, 'count', cnt, 'revenue', rev) order by rev desc)
                  from (select ba.name_snapshot name, count(*) cnt, sum(ba.price_snapshot) rev
                        from booking_addons ba join completed_jobs(p_from, p_to) j on j.booking_id = ba.booking_id group by 1) x), '[]'::jsonb),
    'cancellations', (select count(*) from bookings where location_id = loc and status = 'cancelled'
                      and requested_date between p_from and p_to),
    'no_shows', (select count(*) from bookings where location_id = loc and status = 'no_show'
                 and requested_date between p_from and p_to),
    'bookings_total', (select count(*) from bookings where location_id = loc and requested_date between p_from and p_to),
    'ratings', jsonb_build_object(
      'average', (select round(avg(f.rating)::numeric, 2) from feedback f where f.created_at >= d0 and f.created_at < d1),
      'count', (select count(*) from feedback f where f.created_at >= d0 and f.created_at < d1),
      'distribution', coalesce((select jsonb_object_agg(rating, cnt) from (select rating, count(*) cnt from feedback f
                         where f.created_at >= d0 and f.created_at < d1 group by 1) x), '{}'::jsonb)),
    'loyalty', jsonb_build_object(
      'issued', (select count(*) from loyalty_rewards where issued_at >= d0 and issued_at < d1),
      'redeemed', (select count(*) from loyalty_rewards where redeemed_at >= d0 and redeemed_at < d1),
      'loyal_revenue', coalesce((select sum(j.amount) from completed_jobs(p_from, p_to) j
                          where (select count(*) from bookings b where b.customer_id = j.customer_id and b.status = 'completed') >= 3
                            and not exists (select 1 from customers c where c.id = j.customer_id and c.is_walkin_placeholder)), 0)),
    'promos', coalesce((select jsonb_agg(jsonb_build_object('code', p.code, 'uses', x.cnt, 'revenue', x.rev))
                 from (select promo_code_id, count(*) cnt, sum(amount) rev from completed_jobs(p_from, p_to)
                       where promo_code_id is not null group by 1) x join promo_codes p on p.id = x.promo_code_id), '[]'::jsonb)
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- 19. Shop TV display (no login; unguessable key from settings)
-- -----------------------------------------------------------------------------

create or replace function public.mask_rego(p_rego text)
returns text
language sql
immutable
set search_path = public
as $$
  select case when p_rego is null then null else left(p_rego, 3) || ' •••' end;
$$;

create or replace function public.get_display_board(p_key text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  st record;
begin
  select * into st from settings where display_key = p_key;
  if not found or coalesce(p_key, '') = '' then
    perform oz_raise('INVALID_KEY', 'This display link isn''t valid.');
  end if;
  return jsonb_build_object(
    'business_name', st.business_name,
    'opening_hours', st.opening_hours,
    'messages', st.display_messages,
    'today', shop_today(),
    'now', now(),
    'in_bay', coalesce((select jsonb_agg(jsonb_build_object(
        'first_name', first_name(c.name), 'rego', mask_rego(v.rego), 'service', s.name,
        'bay', ba.name, 'started_at', b.started_at,
        'eta', b.started_at + make_interval(mins => b.duration_minutes)) order by ba.sort_order)
      from bookings b join customers c on c.id = b.customer_id join services s on s.id = b.service_id
      left join vehicles v on v.id = b.vehicle_id left join bays ba on ba.id = b.bay_id
      where b.location_id = st.location_id and b.status = 'in_progress'), '[]'::jsonb),
    'ready', coalesce((select jsonb_agg(jsonb_build_object('first_name', first_name(c.name), 'rego', mask_rego(v.rego),
        'ready_at', b.ready_at) order by b.ready_at)
      from bookings b join customers c on c.id = b.customer_id left join vehicles v on v.id = b.vehicle_id
      where b.location_id = st.location_id and b.status = 'ready'), '[]'::jsonb),
    'next_up', coalesce((select jsonb_agg(x) from (
        select jsonb_build_object('time', to_char(b.requested_time, 'HH24:MI'), 'service', s.name,
          'rego', mask_rego(v.rego), 'arrived', b.status = 'checked_in') as x
        from bookings b join services s on s.id = b.service_id left join vehicles v on v.id = b.vehicle_id
        where b.location_id = st.location_id
          and (b.status = 'checked_in' or (b.status = 'approved' and b.requested_date = shop_today()))
        order by (b.status = 'checked_in') desc, b.requested_time limit 6) y), '[]'::jsonb)
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- 20. Messaging: campaigns, one-offs, automations, live-provider hand-off
-- -----------------------------------------------------------------------------

-- Write one message with custom copy (campaigns + one-off texts).
create or replace function public.enqueue_raw(
  p_customer_id uuid, p_channel text, p_subject text, p_body text, p_category text,
  p_campaign_id uuid, p_created_by uuid, p_dedupe_key text default null, p_template_key text default null
)
returns boolean
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  c record;
  st record;
  addr text;
  msg_status text;
  body text;
  vars jsonb;
begin
  select * into c from customers where id = p_customer_id;
  if not found or c.is_walkin_placeholder or c.anonymised_at is not null or c.merged_into_customer_id is not null then
    return false;
  end if;
  select * into st from settings where location_id = default_location_id();
  vars := jsonb_build_object('first_name', first_name(c.name), 'business_name', st.business_name,
    'shop_phone', st.phone, 'review_url', coalesce(st.review_url, ''), 'referral_code', coalesce(c.referral_code, ''));
  addr := case p_channel when 'sms' then c.phone else c.email end;
  body := render_template(p_body, vars);
  if p_category = 'marketing' then
    body := body || case p_channel
      when 'sms' then ' Reply STOP to opt out.'
      else E'\n\nDon''t want these emails? Reply "unsubscribe" and we''ll take you off the list.' end;
  end if;
  msg_status := case
    when p_category = 'marketing' and not c.marketing_opt_in then 'skipped_opt_out'
    when addr is null or btrim(addr) = '' then 'skipped_no_contact'
    when coalesce(st.message_provider, 'demo') = 'demo' or c.is_demo then 'simulated_sent'
    else 'queued' end;
  insert into message_outbox (customer_id, campaign_id, channel, template_key, to_address, subject, body, status,
    provider, sent_at, dedupe_key, created_by)
  values (c.id, p_campaign_id, p_channel, p_template_key, addr, render_template(p_subject, vars), body, msg_status,
    case when msg_status = 'simulated_sent' then 'demo' end,
    case when msg_status = 'simulated_sent' then now() end,
    p_dedupe_key, p_created_by)
  on conflict (dedupe_key) where dedupe_key is not null do nothing;
  return found;
end;
$$;

create or replace function public.send_one_off_message(
  p_customer_id uuid, p_channel text, p_subject text, p_body text, p_actor uuid
)
returns boolean
language plpgsql
volatile
security definer
set search_path = public
as $$
declare actor uuid := resolve_actor(p_actor);
begin
  if p_channel not in ('sms', 'email') then
    perform oz_raise('INVALID_INPUT', 'Choose SMS or email.');
  end if;
  if length(btrim(coalesce(p_body, ''))) = 0 or length(p_body) > 1600 then
    perform oz_raise('INVALID_INPUT', 'Write a message (up to 1,600 characters).');
  end if;
  return enqueue_raw(p_customer_id, p_channel, p_subject, p_body, 'transactional', null, actor);
end;
$$;

-- Segment filter shared by preview + send. Keys (all optional):
-- min_visits, max_visits, lapsed_days, has_unused_reward, owes_money, tag,
-- vip_only, opted_in_only (defaults true), channel ('sms'|'email').
create or replace function public.campaign_audience(p_segment jsonb)
returns table (customer_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  with stats as (
    select c.id, c.phone, c.email, c.tags, c.is_vip, c.marketing_opt_in,
      (select count(*) from bookings b where b.customer_id = c.id and b.status = 'completed') visits,
      (select max(coalesce(b.completed_at, b.starts_at)) from bookings b where b.customer_id = c.id and b.status = 'completed') last_visit
    from customers c
    where not c.is_walkin_placeholder and c.merged_into_customer_id is null and c.anonymised_at is null
  )
  select s.id from stats s
  where (p_segment ->> 'min_visits' is null or s.visits >= (p_segment ->> 'min_visits')::int)
    and (p_segment ->> 'max_visits' is null or s.visits <= (p_segment ->> 'max_visits')::int)
    and (p_segment ->> 'lapsed_days' is null or (s.last_visit is not null and s.last_visit < now() - make_interval(days => (p_segment ->> 'lapsed_days')::int)))
    and (not coalesce((p_segment ->> 'has_unused_reward')::boolean, false)
         or exists (select 1 from loyalty_rewards r where r.customer_id = s.id and r.status = 'issued'))
    and (not coalesce((p_segment ->> 'owes_money')::boolean, false)
         or exists (select 1 from invoices i where i.customer_id = s.id and i.status in ('issued', 'partial') and i.balance_due > 0))
    and (coalesce(p_segment ->> 'tag', '') = '' or lower(p_segment ->> 'tag') = any(s.tags))
    and (not coalesce((p_segment ->> 'vip_only')::boolean, false) or s.is_vip)
    and (not coalesce((p_segment ->> 'opted_in_only')::boolean, true) or s.marketing_opt_in)
    and (case coalesce(p_segment ->> 'channel', 'sms') when 'email' then s.email is not null else s.phone is not null end);
$$;

create or replace function public.preview_campaign_segment(p_segment jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform require_staff();
  return jsonb_build_object(
    'count', (select count(*) from campaign_audience(p_segment)),
    'sample', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'phone', c.phone, 'email', c.email))
                        from (select c.* from campaign_audience(p_segment) a join customers c on c.id = a.customer_id
                              order by c.name limit 10) c), '[]'::jsonb));
end;
$$;

create or replace function public.send_campaign(payload jsonb, p_actor uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  actor uuid := resolve_actor(p_actor, true);
  cid uuid;
  ch text := coalesce(payload ->> 'channel', 'sms');
  seg jsonb := coalesce(payload -> 'segment', '{}'::jsonb) || jsonb_build_object('channel', coalesce(payload ->> 'channel', 'sms'));
  body text := payload ->> 'body';
  subj text := payload ->> 'subject';
  tpl record;
  a record;
  v_stats jsonb;
begin
  if ch not in ('sms', 'email') then
    perform oz_raise('INVALID_INPUT', 'Choose SMS or email.');
  end if;
  if length(btrim(coalesce(payload ->> 'name', ''))) = 0 then
    perform oz_raise('INVALID_INPUT', 'Give the campaign a name.');
  end if;
  if nullif(payload ->> 'template_key', '') is not null and coalesce(body, '') = '' then
    select * into tpl from message_templates where key = payload ->> 'template_key' and channel = ch;
    body := tpl.body;
    subj := coalesce(subj, tpl.subject);
  end if;
  if length(btrim(coalesce(body, ''))) = 0 then
    perform oz_raise('INVALID_INPUT', 'Write the message first.');
  end if;
  insert into campaigns (location_id, name, channel, template_key, subject, body, segment, status, created_by, sent_at)
  values (staff_location_id(), left(btrim(payload ->> 'name'), 120), ch, nullif(payload ->> 'template_key', ''), subj, body,
    seg, 'sent', actor, now())
  returning id into cid;
  -- Opt-outs are included in the loop so they show up as "skipped" in the
  -- campaign results rather than silently disappearing.
  for a in select customer_id from campaign_audience(seg || '{"opted_in_only": false}'::jsonb) loop
    perform enqueue_raw(a.customer_id, ch, subj, body, 'marketing', cid, actor, 'campaign:' || cid::text || ':' || a.customer_id::text);
  end loop;
  select jsonb_object_agg(status, cnt) into v_stats from (
    select status, count(*) cnt from message_outbox where campaign_id = cid group by status) x;
  update campaigns set stats = coalesce(v_stats, '{}'::jsonb) where id = cid;
  perform write_audit('campaign.send', 'campaign', cid, null, jsonb_build_object('name', payload ->> 'name', 'stats', v_stats));
  return jsonb_build_object('campaign_id', cid, 'stats', coalesce(v_stats, '{}'::jsonb));
end;
$$;

-- Find due work and queue deduplicated messages. Safe to run any number of
-- times: every message has a dedupe key.
create or replace function public.run_automations_internal()
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  cfg jsonb;
  r record;
  n_rem int := 0;
  n_rev int := 0;
  n_win int := 0;
  n_due int := 0;
  n_exp int := 0;
  v_provider text := coalesce((select message_provider from settings where location_id = default_location_id()), 'demo');
begin
  -- 24h reminders. The cron runs once a day, so look ahead a generous window
  -- and rely on the dedupe key to send each reminder once.
  if automation_enabled('reminder_24h') then
    select config into cfg from automations where key = 'reminder_24h';
    for r in select b.id, b.customer_id from bookings b
             where b.status = 'approved'
               and b.starts_at > now()
               and b.starts_at <= now() + make_interval(hours => coalesce((cfg ->> 'window_hours')::int, 36)) loop
      n_rem := n_rem + enqueue_message('reminder_24h', r.customer_id, r.id, null, '{}'::jsonb, 'reminder:' || r.id::text);
    end loop;
  end if;

  if automation_enabled('review_request') then
    select config into cfg from automations where key = 'review_request';
    for r in select b.id, b.customer_id from bookings b
             where b.status = 'completed'
               and b.completed_at < now() - make_interval(hours => coalesce((cfg ->> 'delay_hours')::int, 2))
               and b.completed_at > now() - interval '7 days'
               and not exists (select 1 from feedback f where f.booking_id = b.id) loop
      n_rev := n_rev + enqueue_message('review_request', r.customer_id, r.id, null, '{}'::jsonb, 'review:' || r.id::text);
    end loop;
  end if;

  if automation_enabled('winback_60d') then
    select config into cfg from automations where key = 'winback_60d';
    for r in select c.id, max(coalesce(b.completed_at, b.starts_at)) last_visit
             from customers c join bookings b on b.customer_id = c.id and b.status = 'completed'
             where not c.is_walkin_placeholder and c.merged_into_customer_id is null
             group by c.id
             having max(coalesce(b.completed_at, b.starts_at)) < now() - make_interval(days => coalesce((cfg ->> 'days')::int, 60))
                and max(coalesce(b.completed_at, b.starts_at)) > now() - make_interval(days => coalesce((cfg ->> 'days')::int, 60) + 30)
                and not exists (select 1 from bookings b2 where b2.customer_id = c.id and holds_capacity(b2.status)) loop
      n_win := n_win + enqueue_message('winback_60d', r.id, null, null, '{}'::jsonb,
        'winback:' || r.id::text || ':' || to_char(r.last_visit, 'YYYYMMDD'));
    end loop;
  end if;

  -- Scheduled messages that are now due (demo mode "sends" them).
  -- Demo-data messages are always simulated, even with a live provider.
  update message_outbox o set status = 'simulated_sent', provider = 'demo', sent_at = now()
  where o.status = 'queued' and o.scheduled_for <= now()
    and (v_provider = 'demo' or o.is_demo
         or exists (select 1 from customers c where c.id = o.customer_id and c.is_demo));
  get diagnostics n_due = row_count;

  update loyalty_rewards set status = 'expired' where status = 'issued' and expires_at is not null and expires_at < now();
  get diagnostics n_exp = row_count;
  update vouchers set status = 'expired' where status = 'active' and expires_at is not null and expires_at < shop_today();

  update automations set last_run_at = now(),
    last_run_count = case key when 'reminder_24h' then n_rem when 'review_request' then n_rev
                              when 'winback_60d' then n_win else last_run_count end
  where key in ('reminder_24h', 'review_request', 'winback_60d');

  return jsonb_build_object('reminders', n_rem, 'review_requests', n_rev, 'winbacks', n_win,
    'due_sent', n_due, 'rewards_expired', n_exp, 'ran_at', now());
end;
$$;

-- "Run now" button in the admin (any signed-in staff).
create or replace function public.run_automations()
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  perform require_staff();
  return run_automations_internal();
end;
$$;

-- Daily cron entry point. The Vercel cron route passes CRON_SECRET, which
-- must match the key an admin generated in Settings (stored only as a
-- bcrypt hash). No service-role key needed.
create or replace function public.run_automations_with_key(p_key text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, extensions
as $$
declare h text;
begin
  select cron_key_hash into h from settings where location_id = default_location_id();
  if h is null or coalesce(p_key, '') = '' or extensions.crypt(p_key, h) <> h then
    perform oz_raise('INVALID_KEY', 'Cron key not recognised.');
  end if;
  return run_automations_internal();
end;
$$;

create or replace function public.generate_cron_key(p_actor uuid)
returns text
language plpgsql
volatile
security definer
set search_path = public, extensions
as $$
declare
  actor uuid := resolve_actor(p_actor, true);
  k text := encode(extensions.gen_random_bytes(24), 'hex');
begin
  update settings set cron_key_hash = extensions.crypt(k, extensions.gen_salt('bf')) where location_id = staff_location_id();
  perform write_audit('settings.cron_key', 'settings', null, null, null);
  return k;
end;
$$;

-- Live provider hand-off (only used when message_provider = 'live'): the
-- cron route claims queued messages, sends them through Twilio/Resend, then
-- reports the result.
create or replace function public.claim_outbox_batch_with_key(p_key text, p_limit int default 50)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, extensions
as $$
declare h text;
begin
  select cron_key_hash into h from settings where location_id = default_location_id();
  if h is null or coalesce(p_key, '') = '' or extensions.crypt(p_key, h) <> h then
    perform oz_raise('INVALID_KEY', 'Cron key not recognised.');
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', id, 'channel', channel, 'to', to_address,
                     'subject', subject, 'body', body))
                   from (select o.* from message_outbox o
                         where o.status = 'queued' and o.scheduled_for <= now() and not o.is_demo
                           and not exists (select 1 from customers c where c.id = o.customer_id and c.is_demo)
                         order by o.created_at limit greatest(1, least(p_limit, 200))) x), '[]'::jsonb);
end;
$$;

create or replace function public.report_outbox_result_with_key(
  p_key text, p_id uuid, p_ok boolean, p_provider text, p_provider_id text, p_error text
)
returns void
language plpgsql
volatile
security definer
set search_path = public, extensions
as $$
declare h text;
begin
  select cron_key_hash into h from settings where location_id = default_location_id();
  if h is null or coalesce(p_key, '') = '' or extensions.crypt(p_key, h) <> h then
    perform oz_raise('INVALID_KEY', 'Cron key not recognised.');
  end if;
  update message_outbox set
    status = case when p_ok then 'sent' else 'failed' end,
    provider = left(p_provider, 40), provider_id = left(p_provider_id, 120),
    error = left(p_error, 500), sent_at = case when p_ok then now() end
  where id = p_id and status = 'queued';
end;
$$;

create or replace function public.retry_outbox_message(p_id uuid, p_actor uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  actor uuid := resolve_actor(p_actor);
  provider text := coalesce((select message_provider from settings where location_id = default_location_id()), 'demo');
begin
  update message_outbox set
    status = case when provider = 'demo' then 'simulated_sent' else 'queued' end,
    provider = case when provider = 'demo' then 'demo' end,
    sent_at = case when provider = 'demo' then now() end,
    error = null, scheduled_for = now()
  where id = p_id and status = 'failed';
  if not found then
    perform oz_raise('NOT_FOUND', 'Only failed messages can be retried.');
  end if;
end;
$$;

create or replace function public.mark_feedback_handled(p_feedback_id uuid, p_actor uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare actor uuid := resolve_actor(p_actor);
begin
  update feedback set handled_at = coalesce(handled_at, now()), handled_by = coalesce(handled_by, actor) where id = p_feedback_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- 21. Admin save/delete for configuration tables
-- -----------------------------------------------------------------------------
-- One audited, admin-PIN-checked entry point for every settings screen
-- (catalogue, add-ons, bays, closures, promos, loyalty rules, vouchers,
-- templates, automations, testimonials, settings). Table and column names
-- come only from the whitelist below; values are bound through
-- jsonb_populate_record, never concatenated into SQL.

create or replace function public.admin_entity_columns(p_entity text)
returns text[]
language sql
immutable
set search_path = public
as $$
  select case p_entity
    when 'services' then array['name', 'tagline', 'description', 'category', 'price_from', 'price_small_wagon',
      'price_van', 'price_4wd', 'duration_minutes', 'includes', 'badge', 'active', 'sort_order', 'requires_quote']
    when 'addons' then array['name', 'description', 'price', 'duration_minutes', 'active', 'sort_order']
    when 'bays' then array['name', 'sort_order', 'active']
    when 'blackout_dates' then array['date', 'reason', 'start_time', 'end_time']
    when 'promo_codes' then array['code', 'description', 'type', 'value', 'min_spend', 'valid_from', 'valid_to',
      'max_uses', 'active', 'service_ids', 'first_visit_only']
    when 'loyalty_rules' then array['kind', 'name', 'visits_required', 'reward_type', 'reward_value', 'reward_addon_id',
      'reward_service_id', 'eligible_service_ids', 'expires_after_days', 'repeat', 'active']
    when 'vouchers' then array['code', 'initial_value', 'balance', 'issued_to_customer_id', 'expires_at', 'status', 'note']
    when 'message_templates' then array['name', 'subject', 'body', 'active']
    when 'automations' then array['enabled', 'config']
    when 'testimonials' then array['name', 'text', 'rating', 'published', 'sort']
    when 'settings' then array['business_name', 'abn', 'address', 'phone', 'email', 'opening_hours', 'bay_count',
      'slot_minutes', 'max_concurrent_jobs', 'min_lead_minutes', 'max_advance_days', 'cancel_cutoff_hours',
      'require_approval', 'online_booking_enabled', 'tax_rate', 'invoice_prefix', 'invoice_footer', 'invoice_terms',
      'closing_reminder_time', 'idle_lock_minutes', 'manual_discount_admin_threshold', 'loyalty_enabled',
      'loyalty_tiers', 'display_messages', 'demo_banner', 'public_site_url', 'review_url', 'message_provider',
      'alert_sound', 'alert_volume']
    else null end;
$$;

create or replace function public.admin_save(p_entity text, p_id uuid, p_values jsonb, p_actor uuid)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  actor uuid := resolve_actor(p_actor, true);
  cols text[] := admin_entity_columns(p_entity);
  keys text[];
  set_list text;
  col_list text;
  sel_list text;
  before_row jsonb;
  after_row jsonb;
  new_id uuid := p_id;
  vals jsonb := coalesce(p_values, '{}'::jsonb);
  has_location boolean;
begin
  if cols is null then
    perform oz_raise('INVALID_INPUT', 'Unknown settings area.');
  end if;
  -- Normalise a few values the UI may send in a friendlier shape.
  if p_entity = 'promo_codes' and vals ? 'code' then
    vals := jsonb_set(vals, '{code}', to_jsonb(upper(btrim(vals ->> 'code'))));
  end if;
  if p_entity = 'vouchers' and vals ? 'code' then
    vals := jsonb_set(vals, '{code}', to_jsonb(upper(btrim(vals ->> 'code'))));
  end if;
  if p_entity = 'vouchers' and p_id is null and not (vals ? 'balance') then
    vals := vals || jsonb_build_object('balance', vals -> 'initial_value');
  end if;
  select array_agg(k) into keys from jsonb_object_keys(vals) k where k = any(cols);
  if keys is null then
    perform oz_raise('INVALID_INPUT', 'Nothing to save.');
  end if;
  has_location := p_entity in ('services', 'addons', 'bays', 'blackout_dates', 'promo_codes', 'loyalty_rules', 'vouchers');

  begin
    if p_id is null then
      if p_entity in ('settings', 'automations', 'message_templates') then
        perform oz_raise('INVALID_INPUT', 'That can only be edited, not created.');
      end if;
      col_list := array_to_string(array(select quote_ident(k) from unnest(keys) k), ', ');
      sel_list := array_to_string(array(select 'r.' || quote_ident(k) from unnest(keys) k), ', ');
      if has_location then
        execute format('insert into %I (location_id, %s) select $1, %s from jsonb_populate_record(null::%I, $2) r returning id',
          p_entity, col_list, sel_list, p_entity)
          into new_id using staff_location_id(), vals;
      else
        execute format('insert into %I (%s) select %s from jsonb_populate_record(null::%I, $1) r returning id',
          p_entity, col_list, sel_list, p_entity)
          into new_id using vals;
      end if;
      if p_entity = 'vouchers' then
        update vouchers set created_by = actor where id = new_id;
      end if;
    else
      execute format('select to_jsonb(t) from %I t where id = $1', p_entity) into before_row using p_id;
      if before_row is null then
        perform oz_raise('NOT_FOUND', 'We couldn''t find that item.');
      end if;
      set_list := array_to_string(array(select quote_ident(k) || ' = r.' || quote_ident(k) from unnest(keys) k), ', ');
      if p_entity = 'automations' then
        perform oz_raise('INVALID_INPUT', 'Use save_automation for automations.');
      end if;
      execute format('update %I t set %s from jsonb_populate_record(null::%I, $1) r where t.id = $2', p_entity, set_list, p_entity)
        using vals, p_id;
    end if;
  exception
    when unique_violation then
      perform oz_raise('DUPLICATE', 'That name or code is already in use.');
    when check_violation or not_null_violation or invalid_text_representation or datetime_field_overflow
         or numeric_value_out_of_range or invalid_datetime_format then
      perform oz_raise('INVALID_INPUT', 'Some of those values aren''t valid. Check and try again.');
  end;

  execute format('select to_jsonb(t) from %I t where id = $1', p_entity) into after_row using new_id;
  perform write_audit(p_entity || case when p_id is null then '.create' else '.update' end, p_entity, new_id,
    before_row - 'cron_key_hash' - 'display_key', after_row - 'cron_key_hash' - 'display_key');
  return new_id;
end;
$$;

create or replace function public.save_automation(p_key text, p_enabled boolean, p_config jsonb, p_actor uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare actor uuid := resolve_actor(p_actor, true); before_row jsonb;
begin
  select to_jsonb(a) into before_row from automations a where key = p_key;
  if before_row is null then
    perform oz_raise('NOT_FOUND', 'Unknown automation.');
  end if;
  update automations set enabled = coalesce(p_enabled, enabled),
    config = case when p_config is null then config else config || p_config end
  where key = p_key;
  perform write_audit('automations.update', 'automation', null, before_row,
    (select to_jsonb(a) from automations a where key = p_key));
end;
$$;

create or replace function public.admin_delete(p_entity text, p_id uuid, p_actor uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  actor uuid := resolve_actor(p_actor, true);
  before_row jsonb;
begin
  if p_entity not in ('addons', 'bays', 'blackout_dates', 'promo_codes', 'loyalty_rules', 'testimonials', 'vouchers') then
    perform oz_raise('INVALID_INPUT', 'That can''t be deleted — switch it off instead.');
  end if;
  execute format('select to_jsonb(t) from %I t where id = $1', p_entity) into before_row using p_id;
  if before_row is null then
    perform oz_raise('NOT_FOUND', 'We couldn''t find that item.');
  end if;
  begin
    execute format('delete from %I where id = $1', p_entity) using p_id;
  exception when foreign_key_violation then
    perform oz_raise('IN_USE', 'That''s used by past bookings — switch it off instead of deleting it.');
  end;
  perform write_audit(p_entity || '.delete', p_entity, p_id, before_row, null);
end;
$$;

create or replace function public.regenerate_display_key(p_actor uuid)
returns text
language plpgsql
volatile
security definer
set search_path = public, extensions
as $$
declare actor uuid := resolve_actor(p_actor, true); k text := encode(extensions.gen_random_bytes(18), 'hex');
begin
  update settings set display_key = k where location_id = staff_location_id();
  perform write_audit('settings.display_key', 'settings', null, null, null);
  return k;
end;
$$;

-- -----------------------------------------------------------------------------
-- 21b. Logins (managed by the owner in Supabase only) and "clear all data"
-- -----------------------------------------------------------------------------

-- Give an existing Supabase account access to the staff app as a full admin.
-- Run by the owner in the Supabase SQL Editor after creating the user under
-- Authentication → Users:  select grant_staff_access('jo@example.com', 'Jo');
-- Not callable from either app.
create or replace function public.grant_staff_access(p_email text, p_name text default null)
returns text
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  em text := lower(btrim(coalesce(p_email, '')));
  uid uuid;
  sid uuid;
begin
  select id into uid from auth.users where lower(email) = em;
  if uid is null then
    raise exception 'No Supabase account with the email %. Create it first under Authentication → Users → Add user.', em;
  end if;
  -- Staff never need to verify their email, whatever the Auth settings.
  update auth.users set email_confirmed_at = coalesce(email_confirmed_at, now()) where id = uid;
  select id into sid from staff where auth_user_id = uid;
  if sid is not null then
    update staff set active = true, role = 'admin', email = em,
      name = coalesce(nullif(btrim(p_name), ''), name)
    where id = sid;
    perform write_audit('staff.update', 'staff', sid, null, jsonb_build_object('email', em, 'access', 'granted'));
    return 'Access switched on for ' || em || '.';
  end if;
  insert into staff (auth_user_id, location_id, name, role, email)
  values (uid, default_location_id(), coalesce(nullif(left(btrim(p_name), 80), ''), split_part(em, '@', 1)), 'admin', em)
  returning id into sid;
  perform write_audit('staff.invite_claimed', 'staff', sid, null, jsonb_build_object('email', em, 'role', 'admin'));
  return 'Done: ' || em || ' can now log in to the staff app.';
end;
$$;

-- Switch a login's access off (their history stays). Owner only, SQL Editor:
--   select remove_staff_access('jo@example.com');
create or replace function public.remove_staff_access(p_email text)
returns text
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  em text := lower(btrim(coalesce(p_email, '')));
  st record;
begin
  select s.* into st from staff s join auth.users u on u.id = s.auth_user_id where lower(u.email) = em;
  if not found then
    raise exception 'No staff login with the email %.', em;
  end if;
  if st.active and (select count(*) from staff where active and location_id = st.location_id) <= 1 then
    raise exception 'That is the last login with access. Give someone else access first.';
  end if;
  update staff set active = false where id = st.id;
  update staff_sessions set ended_at = now() where staff_id = st.id and ended_at is null;
  perform write_audit('staff.update', 'staff', st.id, null, jsonb_build_object('email', em, 'access', 'removed'));
  return 'Access removed for ' || em || '.';
end;
$$;

-- Settings → Clear all data. Wipes every customer, car, booking, invoice,
-- payment, message, review, voucher and log so the system can be handed over
-- fresh. Keeps the setup: business details, hours, services & prices,
-- extras, bays, closures, promo codes (use counts reset), loyalty rules,
-- message wording, automations and staff logins. Needs the exact phrase.
create or replace function public.reset_shop_data(p_confirm text, p_delete_customer_logins boolean, p_actor uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  actor uuid := resolve_actor(p_actor, true);
  counts jsonb;
  logins int := 0;
begin
  if coalesce(p_confirm, '') <> 'DELETE EVERYTHING' then
    perform oz_raise('INVALID_INPUT', 'Type DELETE EVERYTHING to confirm.');
  end if;
  counts := jsonb_build_object(
    'customers', (select count(*) from customers where not is_walkin_placeholder),
    'bookings', (select count(*) from bookings),
    'invoices', (select count(*) from invoices),
    'payments', (select count(*) from payments),
    'messages', (select count(*) from message_outbox));

  truncate table voucher_redemptions, payments, invoice_items, invoices, booking_addons, loyalty_rewards,
    feedback, message_outbox, campaigns, customer_notes, customer_events, waitlist, testimonials, vouchers,
    day_closes, rate_limits, staff_sessions, staff_invites, bookings, vehicles, customers, audit_log;

  update invoice_counters set last_number = 0;
  update promo_codes set used_count = 0;
  update automations set last_run_at = null, last_run_count = 0;
  insert into customers (name, phone, is_walkin_placeholder, marketing_opt_in)
  values ('Walk-in Guest', null, true, false);

  -- Online customer accounts (anyone who isn't a staff login).
  -- If Supabase ever refuses this, the wipe still completes and reports -1
  -- (the accounts can then be deleted under Authentication → Users).
  if coalesce(p_delete_customer_logins, false) then
    begin
      delete from auth.users u where not exists (select 1 from staff s where s.auth_user_id = u.id);
      get diagnostics logins = row_count;
    exception when insufficient_privilege then
      logins := -1;
    end;
  end if;

  perform set_config('oz.actor_staff_id', actor::text, true);
  perform write_audit('data.reset', 'settings', null, counts, jsonb_build_object('customer_logins_deleted', logins));
  return counts || jsonb_build_object('customer_logins', logins);
end;
$$;

-- -----------------------------------------------------------------------------
-- 22. Views
-- -----------------------------------------------------------------------------

-- The CRM list. security_invoker = true means RLS applies as the caller:
-- staff see everyone, a customer sees only themselves, anon sees nothing.
create or replace view public.customer_directory
with (security_invoker = true)
as
select
  c.id, c.name, c.phone, c.email, c.tags, c.is_vip, c.marketing_opt_in, c.created_at, c.auth_user_id,
  c.referral_code, c.deletion_requested_at,
  coalesce(bs.visit_count, 0) as visit_count,
  coalesce(bs.lifetime_spend, 0) as lifetime_spend,
  bs.last_visit_at,
  coalesce(ob.outstanding, 0) + coalesce(bs.legacy_unpaid, 0) as outstanding_balance,
  coalesce(vs.regos, '{}') as regos,
  coalesce(rw.unused_rewards, 0) as unused_rewards
from customers c
left join lateral (
  select count(*) filter (where b.status = 'completed') as visit_count,
         sum(coalesce(i.total, b.amount_charged, 0)) filter (where b.status = 'completed') as lifetime_spend,
         max(coalesce(b.completed_at, b.starts_at)) filter (where b.status = 'completed') as last_visit_at,
         sum(b.amount_charged) filter (where b.status = 'completed' and not b.paid and i.id is null) as legacy_unpaid
  from bookings b
  left join invoices i on i.booking_id = b.id and i.status <> 'void'
  where b.customer_id = c.id
) bs on true
left join lateral (
  select sum(i.balance_due) as outstanding from invoices i
  where i.customer_id = c.id and i.status in ('issued', 'partial')
) ob on true
left join lateral (
  select array_agg(v.rego order by v.created_at) filter (where v.rego is not null) as regos
  from vehicles v where v.customer_id = c.id and v.archived_at is null
) vs on true
left join lateral (
  select count(*) as unused_rewards from loyalty_rewards r where r.customer_id = c.id and r.status = 'issued'
) rw on true
where c.merged_into_customer_id is null and not c.is_walkin_placeholder;

-- -----------------------------------------------------------------------------
-- 23. Row Level Security for v2 tables
-- -----------------------------------------------------------------------------
-- Pattern: clients READ through RLS; every WRITE goes through a SECURITY
-- DEFINER RPC above that validates input and attributes the action. So
-- almost every table below has SELECT policies only.

alter table settings enable row level security;
alter table blackout_dates enable row level security;
alter table bays enable row level security;
alter table addons enable row level security;
alter table staff_pins enable row level security;
alter table staff_sessions enable row level security;
alter table staff_invites enable row level security;
alter table booking_addons enable row level security;
alter table promo_codes enable row level security;
alter table loyalty_rules enable row level security;
alter table loyalty_rewards enable row level security;
alter table vouchers enable row level security;
alter table voucher_redemptions enable row level security;
alter table invoice_counters enable row level security;
alter table invoices enable row level security;
alter table invoice_items enable row level security;
alter table payments enable row level security;
alter table message_templates enable row level security;
alter table campaigns enable row level security;
alter table message_outbox enable row level security;
alter table automations enable row level security;
alter table feedback enable row level security;
alter table testimonials enable row level security;
alter table waitlist enable row level security;
alter table customer_notes enable row level security;
alter table customer_events enable row level security;
alter table audit_log enable row level security;
alter table day_closes enable row level security;
alter table rate_limits enable row level security;

-- Never readable by any client (RLS on, no policies, grants revoked):
-- staff_pins, staff_sessions, rate_limits, invoice_counters.
revoke all on staff_pins, staff_sessions, rate_limits, invoice_counters from anon, authenticated;

-- ---- Catalogue: the public sees ACTIVE services/add-ons only; staff see
-- ---- everything at their location (so they can switch items back on).
drop policy if exists "services are publicly readable" on services;
drop policy if exists "active services are public" on services;
create policy "active services are public" on services for select to anon, authenticated using (active);
drop policy if exists "staff read all services" on services;
create policy "staff read all services" on services for select to authenticated
  using (is_staff() and location_id = staff_location_id());

drop policy if exists "active addons are public" on addons;
create policy "active addons are public" on addons for select to anon, authenticated using (active);
drop policy if exists "staff read all addons" on addons;
create policy "staff read all addons" on addons for select to authenticated
  using (is_staff() and location_id = staff_location_id());

-- ---- v1 staff policies, re-created under the SAME names (so the v1 app keeps
-- ---- working) but gated on an ACTIVE staff row. v1 only checked "has a staff
-- ---- row", so a deactivated staffer kept full access.
drop policy if exists "staff can read all customers" on customers;
create policy "staff can read all customers" on customers for select to authenticated
  using (is_staff());
drop policy if exists "staff can update all customers" on customers;
create policy "staff can update all customers" on customers for update to authenticated
  using (is_staff()) with check (is_staff());
drop policy if exists "staff can read all vehicles" on vehicles;
create policy "staff can read all vehicles" on vehicles for select to authenticated
  using (is_staff());
drop policy if exists "staff can update all vehicles" on vehicles;
create policy "staff can update all vehicles" on vehicles for update to authenticated
  using (is_staff()) with check (is_staff());
drop policy if exists "staff can read bookings at own location" on bookings;
create policy "staff can read bookings at own location" on bookings for select to authenticated
  using (is_staff() and location_id = staff_location_id());
drop policy if exists "staff can update bookings at own location" on bookings;
create policy "staff can update bookings at own location" on bookings for update to authenticated
  using (is_staff() and location_id = staff_location_id())
  with check (is_staff() and location_id = staff_location_id());

-- ---- Staff directory: staff can see their colleagues (the PIN switcher and
-- ---- "assigned to" pickers need it). PIN hashes live in staff_pins.
drop policy if exists "staff read colleagues" on staff;
create policy "staff read colleagues" on staff for select to authenticated
  using (is_staff() and location_id = staff_location_id());

drop policy if exists "admins read invites" on staff_invites;
create policy "admins read invites" on staff_invites for select to authenticated
  using (is_admin() and location_id = staff_location_id());

-- ---- Shop configuration: staff-only reads. Public data is exposed via
-- ---- get_public_settings(), never the raw row (it holds the display key).
drop policy if exists "staff read settings" on settings;
create policy "staff read settings" on settings for select to authenticated
  using (is_staff() and location_id = staff_location_id());
drop policy if exists "staff read blackouts" on blackout_dates;
create policy "staff read blackouts" on blackout_dates for select to authenticated
  using (is_staff() and location_id = staff_location_id());
drop policy if exists "staff read bays" on bays;
create policy "staff read bays" on bays for select to authenticated
  using (is_staff() and location_id = staff_location_id());
drop policy if exists "staff read promos" on promo_codes;
create policy "staff read promos" on promo_codes for select to authenticated
  using (is_staff() and location_id = staff_location_id());
drop policy if exists "staff read loyalty rules" on loyalty_rules;
create policy "staff read loyalty rules" on loyalty_rules for select to authenticated
  using (is_staff() and location_id = staff_location_id());
drop policy if exists "staff read vouchers" on vouchers;
create policy "staff read vouchers" on vouchers for select to authenticated
  using (is_staff() and location_id = staff_location_id());
drop policy if exists "staff read voucher redemptions" on voucher_redemptions;
create policy "staff read voucher redemptions" on voucher_redemptions for select to authenticated using (is_staff());
drop policy if exists "staff read templates" on message_templates;
create policy "staff read templates" on message_templates for select to authenticated using (is_staff());
drop policy if exists "staff read automations" on automations;
create policy "staff read automations" on automations for select to authenticated using (is_staff());
drop policy if exists "staff read campaigns" on campaigns;
create policy "staff read campaigns" on campaigns for select to authenticated
  using (is_staff() and location_id = staff_location_id());
drop policy if exists "staff read outbox" on message_outbox;
create policy "staff read outbox" on message_outbox for select to authenticated using (is_staff());
drop policy if exists "staff read testimonials" on testimonials;
create policy "staff read testimonials" on testimonials for select to authenticated using (is_staff());
drop policy if exists "staff read waitlist" on waitlist;
create policy "staff read waitlist" on waitlist for select to authenticated
  using (is_staff() and location_id = staff_location_id());
drop policy if exists "staff read customer notes" on customer_notes;
create policy "staff read customer notes" on customer_notes for select to authenticated using (is_staff());
drop policy if exists "staff read customer events" on customer_events;
create policy "staff read customer events" on customer_events for select to authenticated using (is_staff());
drop policy if exists "staff read day closes" on day_closes;
create policy "staff read day closes" on day_closes for select to authenticated
  using (is_staff() and location_id = staff_location_id());
-- Audit log: admins only.
drop policy if exists "admins read audit log" on audit_log;
create policy "admins read audit log" on audit_log for select to authenticated using (is_admin());

-- ---- Booking add-ons, invoices, payments, rewards, feedback: staff at the
-- ---- location read everything; a signed-in customer reads only their own.
drop policy if exists "staff read booking addons" on booking_addons;
create policy "staff read booking addons" on booking_addons for select to authenticated
  using (is_staff() and exists (select 1 from bookings b where b.id = booking_addons.booking_id and b.location_id = staff_location_id()));
drop policy if exists "customers read own booking addons" on booking_addons;
create policy "customers read own booking addons" on booking_addons for select to authenticated
  using (exists (select 1 from bookings b where b.id = booking_addons.booking_id and b.customer_id = current_customer_id()));

drop policy if exists "staff read invoices" on invoices;
create policy "staff read invoices" on invoices for select to authenticated
  using (is_staff() and location_id = staff_location_id());
drop policy if exists "customers read own invoices" on invoices;
create policy "customers read own invoices" on invoices for select to authenticated
  using (customer_id = current_customer_id() and status <> 'draft');

drop policy if exists "staff read invoice items" on invoice_items;
create policy "staff read invoice items" on invoice_items for select to authenticated
  using (is_staff() and exists (select 1 from invoices i where i.id = invoice_items.invoice_id and i.location_id = staff_location_id()));
drop policy if exists "customers read own invoice items" on invoice_items;
create policy "customers read own invoice items" on invoice_items for select to authenticated
  using (exists (select 1 from invoices i where i.id = invoice_items.invoice_id and i.customer_id = current_customer_id() and i.status <> 'draft'));

drop policy if exists "staff read payments" on payments;
create policy "staff read payments" on payments for select to authenticated
  using (is_staff() and exists (select 1 from invoices i where i.id = payments.invoice_id and i.location_id = staff_location_id()));
drop policy if exists "customers read own payments" on payments;
create policy "customers read own payments" on payments for select to authenticated
  using (exists (select 1 from invoices i where i.id = payments.invoice_id and i.customer_id = current_customer_id()));

drop policy if exists "staff read rewards" on loyalty_rewards;
create policy "staff read rewards" on loyalty_rewards for select to authenticated using (is_staff());
drop policy if exists "customers read own rewards" on loyalty_rewards;
create policy "customers read own rewards" on loyalty_rewards for select to authenticated
  using (customer_id = current_customer_id());

drop policy if exists "staff read feedback" on feedback;
create policy "staff read feedback" on feedback for select to authenticated using (is_staff());
drop policy if exists "customers read own feedback" on feedback;
create policy "customers read own feedback" on feedback for select to authenticated
  using (customer_id = current_customer_id());

-- -----------------------------------------------------------------------------
-- 24. Function privileges
-- -----------------------------------------------------------------------------
-- Supabase grants EXECUTE on every new public function to anon and
-- authenticated by default. Start from nothing and grant deliberately.

revoke execute on all functions in schema public from public, anon, authenticated;

-- Pure helpers (no data access) and the identity helpers RLS policies call.
grant execute on function
  public.normalize_au_phone(text), public.is_valid_phone(text), public.normalize_rego(text),
  public.gst_from_inclusive(numeric, numeric), public.render_template(text, jsonb), public.first_name(text),
  public.dow_key(date), public.holds_capacity(text), public.legal_next_statuses(text),
  public.vehicle_type_label(text), public.mask_rego(text),
  public.is_staff(), public.is_admin(), public.staff_location_id(), public.current_staff_id(),
  public.current_customer_id(), public.shop_today(), public.shop_tz()
to anon, authenticated;

-- Public customer-site RPCs.
grant execute on function
  public.get_public_settings(),
  public.get_available_slots(date, uuid, uuid[]),
  public.validate_promo(text, uuid, numeric, text),
  public.create_public_booking(jsonb),
  public.get_booking_by_token(uuid),
  public.cancel_booking_by_token(uuid, text),
  public.reschedule_booking_by_token(uuid, date, time),
  public.submit_feedback_by_token(uuid, int, text),
  public.join_waitlist(text, text, date, uuid, text),
  public.get_published_testimonials(),
  public.get_receipt_by_token(uuid),
  public.get_display_board(text),
  public.run_automations_with_key(text),
  public.claim_outbox_batch_with_key(text, int),
  public.report_outbox_result_with_key(text, uuid, boolean, text, text, text)
to anon, authenticated;

-- Signed-in customers.
grant execute on function
  public.link_account_to_customer(),
  public.claim_customer_by_phone(text),
  public.get_my_loyalty(),
  public.update_my_profile(jsonb),
  public.upsert_my_vehicle(jsonb),
  public.archive_my_vehicle(uuid),
  public.request_account_deletion(),
  public.claim_staff_invite()
to authenticated;

-- Staff RPCs. Each one checks for an active staff login (and most for a
-- PIN session) internally, so granting to `authenticated` is safe.
grant execute on function
  public.pin_mode_enabled(),
  public.list_staff_for_switcher(),
  public.verify_staff_pin(uuid, text),
  public.start_acting_session(uuid, text),
  public.end_acting_session(uuid),
  public.check_acting_session(uuid),
  public.set_staff_pin(uuid, uuid, text),
  public.advance_booking(uuid, text, uuid, uuid, uuid, text, boolean),
  public.update_booking_details(uuid, jsonb, uuid),
  public.create_walkin_order(jsonb, uuid),
  public.create_staff_booking(jsonb, uuid),
  public.issue_invoice(uuid, uuid),
  public.add_invoice_item(uuid, text, text, numeric, numeric, uuid),
  public.update_invoice_item(uuid, text, numeric, numeric, uuid),
  public.remove_invoice_item(uuid, uuid),
  public.apply_invoice_code(uuid, text, uuid),
  public.record_payment(uuid, numeric, text, text, uuid, text, text),
  public.set_payment_tendered(uuid, numeric, uuid),
  public.refund_payment(uuid, numeric, text, uuid),
  public.void_invoice(uuid, text, uuid),
  public.send_invoice_message(uuid, text, uuid),
  public.update_customer(uuid, jsonb, uuid),
  public.create_customer(jsonb, uuid),
  public.add_customer_note(uuid, text, uuid),
  public.upsert_customer_vehicle(uuid, jsonb, uuid),
  public.archive_customer_vehicle(uuid, uuid),
  public.anonymise_customer(uuid, uuid),
  public.merge_customers(uuid, uuid, uuid),
  public.import_customers_csv_rows(jsonb, boolean, uuid),
  public.invite_staff(text, text, text, uuid),
  public.update_staff(uuid, jsonb, uuid),
  public.reset_shop_data(text, boolean, uuid),
  public.day_summary(date),
  public.close_day(date, numeric, text, uuid),
  public.reopen_day(date, uuid),
  public.global_search(text),
  public.dashboard_stats(date),
  public.revenue_series(date, date, text),
  public.service_breakdown(date, date),
  public.staff_performance(date, date),
  public.busiest_hours(date, date),
  public.debtors_aging(),
  public.gst_summary(date, date),
  public.report_overview(date, date),
  public.send_one_off_message(uuid, text, text, text, uuid),
  public.preview_campaign_segment(jsonb),
  public.send_campaign(jsonb, uuid),
  public.run_automations(),
  public.generate_cron_key(uuid),
  public.retry_outbox_message(uuid, uuid),
  public.mark_feedback_handled(uuid, uuid),
  public.admin_save(text, uuid, jsonb, uuid),
  public.save_automation(text, boolean, jsonb, uuid),
  public.admin_delete(text, uuid, uuid),
  public.regenerate_display_key(uuid)
to authenticated;

-- -----------------------------------------------------------------------------
-- 25. Realtime (guarded so re-running never errors)
-- -----------------------------------------------------------------------------
do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['bookings', 'invoices', 'payments', 'message_outbox', 'bays'] loop
      if not exists (select 1 from pg_publication_tables
                     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end $$;
alter table bookings replica identity full;
alter table invoices replica identity full;

-- -----------------------------------------------------------------------------
-- 26. Seed data (skips anything that already exists)
-- -----------------------------------------------------------------------------

-- DEMO add-ons — realistic examples only. The client must confirm the real
-- add-on list and prices before go-live (see docs/HANDOVER.md).
insert into addons (location_id, name, description, price, duration_minutes, sort_order)
select default_location_id(), a.name, a.descr, a.price, a.mins, a.sort
from (values
  ('Engine bay clean', 'Degrease and dress the engine bay.', 40.00, 30, 1),
  ('Pet hair removal', 'Extra time to lift embedded pet hair from carpets and seats.', 35.00, 30, 2),
  ('Headlight restoration', 'Cut back cloudy headlight lenses and seal them.', 60.00, 45, 3),
  ('Fabric protection', 'Stain-guard treatment for cloth seats and carpets.', 50.00, 30, 4),
  ('Odour treatment', 'Neutralise smoke, food and damp smells.', 45.00, 30, 5),
  ('Wheel & arch deep clean', 'Wheels off the grime, arches scrubbed and dressed.', 30.00, 20, 6)
) as a(name, descr, price, mins, sort)
on conflict do nothing;

insert into loyalty_rules (location_id, kind, name, visits_required, reward_type, reward_value,
  eligible_service_ids, expires_after_days, repeat)
select default_location_id(), 'visits', '50% off your next wash', 6, 'percent', 50,
  array(select id from services where name in ('OzShine Wash', 'Platinum Wash')), 180, true
where not exists (select 1 from loyalty_rules where kind = 'visits');

insert into loyalty_rules (location_id, kind, name, reward_type, reward_value, expires_after_days, repeat)
select default_location_id(), 'referral', '$10 off for referring a mate', 'fixed', 10, 180, true
where not exists (select 1 from loyalty_rules where kind = 'referral');

insert into automations (key, name, enabled, config) values
  ('booking_confirmations', 'Booking received / confirmed / declined', true, '{}'),
  ('reminder_24h', 'Reminder before the booking', true, '{"window_hours": 36}'),
  ('ready_for_pickup', 'Car ready for pickup', true, '{}'),
  ('review_request', 'Ask for feedback after the visit', true, '{"delay_hours": 2}'),
  ('loyalty_earned', 'Loyalty reward earned', true, '{}'),
  ('winback_60d', 'We miss you (lapsed customers)', false, '{"days": 60}')
on conflict (key) do nothing;

-- Message copy. SMS aims for one 160-character segment.
insert into message_templates (key, channel, name, category, subject, body) values
  ('booking_received', 'sms', 'Booking received', 'transactional', null,
   'Hi {{first_name}}, OzShine Beenleigh got your {{service}} request for {{date}} {{time}} (ref {{reference}}). We''ll confirm shortly. {{manage_url}}'),
  ('booking_received', 'email', 'Booking received', 'transactional', 'We''ve got your booking request — {{reference}}',
   E'Hi {{first_name}},\n\nThanks for booking with OzShine Beenleigh. Here''s what we''ve got:\n\n{{service}}\n{{date}} at {{time}}\nVehicle: {{rego}}\nReference: {{reference}}\n\nWe''ll confirm your spot shortly. You can check, change or cancel it any time here:\n{{manage_url}}\n\nCheers,\nThe OzShine team\n{{shop_phone}}'),
  ('booking_approved', 'sms', 'Booking confirmed', 'transactional', null,
   'You''re locked in, {{first_name}}! {{service}} at OzShine Beenleigh, {{date}} {{time}}. Ref {{reference}}. Manage: {{manage_url}}'),
  ('booking_approved', 'email', 'Booking confirmed', 'transactional', 'Confirmed: {{service}} on {{date}}',
   E'Hi {{first_name}},\n\nYou''re confirmed for {{service}} on {{date}} at {{time}}.\nVehicle: {{rego}} · Reference: {{reference}}\n\nFind us at 114-118 George St, Beenleigh. Need to change something? {{manage_url}}\n\nSee you then,\nThe OzShine team'),
  ('booking_declined', 'sms', 'Booking declined', 'transactional', null,
   'Sorry {{first_name}}, we can''t fit in your {{date}} {{time}} booking. Give us a call on {{shop_phone}} and we''ll find another time.'),
  ('booking_declined', 'email', 'Booking declined', 'transactional', 'About your booking {{reference}}',
   E'Hi {{first_name}},\n\nUnfortunately we can''t take your booking for {{date}} at {{time}}. {{reason}}\n\nGive us a call on {{shop_phone}} or book another time online and we''ll look after you.\n\nThe OzShine team'),
  ('reminder_24h', 'sms', 'Reminder', 'transactional', null,
   'Reminder: {{service}} at OzShine Beenleigh {{date}} {{time}}. Need to change it? {{manage_url}}'),
  ('reminder_24h', 'email', 'Reminder', 'transactional', 'See you soon — {{service}} on {{date}}',
   E'Hi {{first_name}},\n\nJust a reminder that {{rego}} is booked in for {{service}} on {{date}} at {{time}}.\n\nRunning late or need to move it? {{manage_url}}\n\nThe OzShine team'),
  ('ready_for_pickup', 'sms', 'Ready for pickup', 'transactional', null,
   'Good news {{first_name}} — {{rego}} is ready for pickup at OzShine Beenleigh. See you soon!'),
  ('receipt', 'sms', 'Receipt', 'transactional', null,
   'Thanks {{first_name}}! Your OzShine receipt {{invoice_number}} (${{amount}}): {{receipt_url}}'),
  ('receipt', 'email', 'Receipt', 'transactional', 'Your OzShine receipt {{invoice_number}}',
   E'Hi {{first_name}},\n\nThanks for coming in. Your tax invoice {{invoice_number}} for ${{amount}} is here:\n{{receipt_url}}\n\nThe OzShine team'),
  ('payment_reminder', 'sms', 'Payment reminder', 'transactional', null,
   'Hi {{first_name}}, a friendly reminder there''s ${{balance}} owing on OzShine invoice {{invoice_number}}. Details: {{receipt_url}}'),
  ('review_request', 'sms', 'How did we go?', 'transactional', null,
   'Thanks for visiting OzShine, {{first_name}}! How did we go? Rate your visit in 10 seconds: {{feedback_url}}'),
  ('review_request', 'email', 'How did we go?', 'transactional', 'How did we go, {{first_name}}?',
   E'Hi {{first_name}},\n\nThanks for trusting us with {{rego}}. We''d love to know how we went — it takes 10 seconds:\n{{feedback_url}}\n\nThe OzShine team'),
  ('loyalty_earned', 'sms', 'Reward earned', 'transactional', null,
   'Legend, {{first_name}}! You''ve earned {{reward}} at OzShine. Code {{reward_code}} — we''ll apply it next visit.'),
  ('loyalty_earned', 'email', 'Reward earned', 'transactional', 'You''ve earned a reward, {{first_name}}',
   E'Hi {{first_name}},\n\nThanks for being a regular. You''ve earned: {{reward}}.\nYour code is {{reward_code}} — just mention it at the counter or it''ll be applied when you book online.\n\nThe OzShine team'),
  ('winback_60d', 'sms', 'We miss you', 'marketing', null,
   'Hi {{first_name}}, it''s been a while! Your car''s due for a shine — book at OzShine Beenleigh anytime.'),
  ('winback_60d', 'email', 'We miss you', 'marketing', 'Your car''s due for a shine, {{first_name}}',
   E'Hi {{first_name}},\n\nIt''s been a couple of months since we last saw you. Beenleigh sun and road grime add up fast — book a wash and we''ll bring the shine back.\n\nThe OzShine team')
on conflict (key, channel) do nothing;

-- =============================================================================
-- End of upgrade_v2.sql
-- =============================================================================
