-- =============================================================================
-- OzShine V2 — PATCH: equal logins (managed in Supabase) + "Clear all data"
-- =============================================================================
-- 1. Every staff login is a full admin with the same access, and per-person
--    PINs stay off however many logins there are.
-- 2. Logins are managed ONLY here in Supabase:
--      a) Authentication → Users → Add user (email + password)
--      b) SQL Editor:  select grant_staff_access('their@email.com', 'Their Name');
--    To take access away:  select remove_staff_access('their@email.com');
--    Neither app can call these.
-- 3. Adds the function behind Settings → Clear all data in the staff app.
--
-- Safe to run more than once. Running it does NOT delete anything — the wipe
-- only happens when someone presses the button and types the confirmation.
-- =============================================================================

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

revoke execute on function public.grant_staff_access(text, text) from public, anon, authenticated;
revoke execute on function public.remove_staff_access(text) from public, anon, authenticated;

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

revoke execute on function public.reset_shop_data(text, boolean, uuid) from public, anon;
grant execute on function public.reset_shop_data(text, boolean, uuid) to authenticated;

-- Make any existing staff logins full admins too.
update staff set role = 'admin' where active and role <> 'admin';

-- Check: lists everyone who can log in to the staff app.
select s.name, coalesce(s.email, u.email) as email, s.role
from staff s left join auth.users u on u.id = s.auth_user_id
where s.active order by s.name;
