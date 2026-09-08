-- =============================================================================
-- OzShine Beenleigh — Database Schema + RLS
-- =============================================================================
-- Paste this whole file into Supabase Dashboard → SQL Editor → New Query → Run.
-- Safe to re-run: everything is wrapped in DROP IF EXISTS / CREATE, so running
-- it twice on a fresh project won't error. Running it on a project that
-- already has data in these tables WILL wipe that data (drops the tables).
--
-- Order: tables -> seed data -> RLS enable -> policies.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Clean slate (drop in dependency order)
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
  id          uuid primary key default gen_random_uuid(),
  location_id uuid not null references locations(id) on delete cascade,
  name        text not null,
  price_from  numeric(10, 2) not null,
  description text,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now()
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
  id          uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id) on delete cascade,
  rego        text,
  make_model  text,
  notes       text,
  created_at  timestamptz not null default now()
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
-- Seed data — Beenleigh only
-- -----------------------------------------------------------------------------

insert into locations (name, address, phone)
values ('OzShine Hand Car Wash — Beenleigh', 'Beenleigh, QLD', null);

insert into services (location_id, name, price_from, description, sort_order)
select id, 'OzShine Wash', 40.00, 'Our signature hand wash.', 1
from locations where name = 'OzShine Hand Car Wash — Beenleigh';

insert into services (location_id, name, price_from, description, sort_order)
select id, 'Platinum Wash', 65.00, 'Our most popular wash — the full works.', 2
from locations where name = 'OzShine Hand Car Wash — Beenleigh';

insert into services (location_id, name, price_from, description, sort_order)
select id, 'OzShine Full Detail', 330.00, 'Complete interior + exterior detail.', 3
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

-- =============================================================================
-- Manual test to confirm this worked (run AFTER the script above, in the same
-- SQL Editor — this runs as the Supabase service role so it bypasses RLS,
-- which is what lets you seed a test row directly like this):
--
--   insert into customers (name, phone) values ('Test Customer', '0400000000');
--   insert into bookings (customer_id, service_id, location_id, requested_date, requested_time)
--   select c.id, s.id, s.location_id, current_date + 1, '10:00'
--   from customers c, services s
--   where c.phone = '0400000000' and s.name = 'OzShine Wash';
--
-- Then to prove RLS is actually blocking anon reads of OTHER people's rows,
-- go to Supabase → Project Settings → API, grab the anon public key, and hit
-- the REST API with it (e.g. via a browser fetch or curl) rather than the SQL
-- editor: e.g.
--   curl "<PROJECT_URL>/rest/v1/bookings?select=*" -H "apikey: <ANON_KEY>"
-- should come back an EMPTY array (anon has no select policy on bookings at
-- all — only insert), even though the row you just seeded exists in the table.
-- =============================================================================
