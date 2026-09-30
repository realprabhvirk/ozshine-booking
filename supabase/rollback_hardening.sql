-- =============================================================================
-- OzShine V2 — UNDO post_merge_hardening.sql
-- =============================================================================
-- Only needed if the apps are ever rolled back to V1 AFTER the hardening
-- script was run. Restores the direct-write permissions V1 relies on
-- (staff ones gated on an ACTIVE staff row, same as upgrade_v2.sql).
-- Non-destructive, safe to run twice.
-- =============================================================================

grant insert on customers, vehicles, bookings to anon;

drop policy if exists "anyone can create a customer" on customers;
create policy "anyone can create a customer" on customers for insert to anon, authenticated with check (true);
drop policy if exists "anyone can create a vehicle" on vehicles;
create policy "anyone can create a vehicle" on vehicles for insert to anon, authenticated with check (true);
drop policy if exists "anyone can create a booking" on bookings;
create policy "anyone can create a booking" on bookings for insert to anon, authenticated with check (true);

drop policy if exists "customers can update own row" on customers;
create policy "customers can update own row" on customers for update to authenticated
  using (auth_user_id = auth.uid()) with check (auth_user_id = auth.uid());
drop policy if exists "customers can update own vehicles" on vehicles;
create policy "customers can update own vehicles" on vehicles for update to authenticated
  using (exists (select 1 from customers where customers.id = vehicles.customer_id and customers.auth_user_id = auth.uid()))
  with check (exists (select 1 from customers where customers.id = vehicles.customer_id and customers.auth_user_id = auth.uid()));
drop policy if exists "customers can update own bookings" on bookings;
create policy "customers can update own bookings" on bookings for update to authenticated
  using (exists (select 1 from customers where customers.id = bookings.customer_id and customers.auth_user_id = auth.uid()))
  with check (exists (select 1 from customers where customers.id = bookings.customer_id and customers.auth_user_id = auth.uid()));

drop policy if exists "staff can update all customers" on customers;
create policy "staff can update all customers" on customers for update to authenticated
  using (is_staff()) with check (is_staff());
drop policy if exists "staff can update all vehicles" on vehicles;
create policy "staff can update all vehicles" on vehicles for update to authenticated
  using (is_staff()) with check (is_staff());
drop policy if exists "staff can update bookings at own location" on bookings;
create policy "staff can update bookings at own location" on bookings for update to authenticated
  using (is_staff() and location_id = staff_location_id())
  with check (is_staff() and location_id = staff_location_id());

do $$ begin
  if exists (select 1 from pg_proc where proname = 'claim_customer_by_phone'
             and pronamespace = 'public'::regnamespace) then
    grant execute on function public.claim_customer_by_phone(text) to authenticated;
  end if;
end $$;
