-- =============================================================================
-- OzShine V2 — POST-MERGE HARDENING
-- =============================================================================
-- Run this ONCE, only AFTER the V2 apps are merged to main and live on the
-- production URLs. Running it earlier breaks the old (V1) booking form,
-- because V1 writes straight into the tables.
--
-- What it does: removes the old "anyone can write to these tables directly"
-- permissions that V1 needed. V2 does every write through checked server
-- functions (price is recalculated, time slots are validated, the booking
-- status flow is enforced, spam is throttled), so direct writes are only a
-- way to get around those checks.
--
-- Non-destructive: no data is touched. Safe to run twice.
-- To undo (only needed if you ever roll the apps back to V1), run
-- supabase/rollback_hardening.sql.
-- =============================================================================

-- Public (not signed in): no more direct inserts. Guest bookings go through
-- create_public_booking().
drop policy if exists "anyone can create a customer" on customers;
drop policy if exists "anyone can create a vehicle" on vehicles;
drop policy if exists "anyone can create a booking" on bookings;

-- Signed-in customers: profile/garage edits go through update_my_profile(),
-- upsert_my_vehicle(), archive_my_vehicle(); changes to a booking through
-- the manage-booking functions (which enforce the cancel cut-off).
drop policy if exists "customers can update own row" on customers;
drop policy if exists "customers can update own vehicles" on vehicles;
drop policy if exists "customers can update own bookings" on bookings;

-- Staff: every change goes through the V2 functions, which record WHO did it
-- (PIN user), enforce the booking status flow and keep invoices consistent.
drop policy if exists "staff can update all customers" on customers;
drop policy if exists "staff can update all vehicles" on vehicles;
drop policy if exists "staff can update bookings at own location" on bookings;

-- Belt and braces: the public role can't write to any table at all.
revoke insert, update, delete, truncate on all tables in schema public from anon;

-- V1's account-claim function is replaced by link_account_to_customer().
do $$ begin
  if exists (select 1 from pg_proc where proname = 'claim_customer_by_phone'
             and pronamespace = 'public'::regnamespace) then
    revoke execute on function public.claim_customer_by_phone(text) from anon, authenticated;
  end if;
end $$;

-- Check: should list no insert/update policies on these three tables.
select tablename, policyname, cmd
from pg_policies
where schemaname = 'public' and tablename in ('customers', 'vehicles', 'bookings')
order by tablename, cmd, policyname;
