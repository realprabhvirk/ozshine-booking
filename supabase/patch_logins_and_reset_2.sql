-- =============================================================================
-- OzShine V2 — PATCH: fix Settings > Clear all data (replaces the function from patch_logins_and_reset.sql)
-- =============================================================================
-- "Delete all data now" failed with "Something went wrong": Supabase refuses
-- an UPDATE with no WHERE clause when it comes from the app, and the wipe had
-- three (invoice numbering, promo use counts, automation stats), so the whole
-- thing rolled back. Same data is cleared and kept as before; nothing else
-- changes. Also: if Supabase won't let the customer online accounts be
-- removed for any reason, the wipe still completes and says so.
--
-- Safe to run more than once. Doesn't delete anything by itself: the wipe only
-- happens when someone presses the button and types DELETE EVERYTHING.
-- =============================================================================

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

  -- "where true": Supabase rejects UPDATE without a WHERE clause on API
  -- requests (pg-safeupdate), which made this whole wipe fail and roll back.
  update invoice_counters set last_number = 0 where true;
  update promo_codes set used_count = 0 where true;
  update automations set last_run_at = null, last_run_count = 0 where true;
  insert into customers (name, phone, is_walkin_placeholder, marketing_opt_in)
  values ('Walk-in Guest', null, true, false);

  -- Online customer accounts (anyone who isn't a staff login).
  -- If Supabase ever refuses this, the wipe still completes and reports -1
  -- (the accounts can then be deleted under Authentication → Users).
  if coalesce(p_delete_customer_logins, false) then
    begin
      delete from auth.users u where not exists (select 1 from staff s where s.auth_user_id = u.id);
      get diagnostics logins = row_count;
    exception when others then
      logins := -1;
    end;
  end if;

  perform set_config('oz.actor_staff_id', actor::text, true);
  perform write_audit('data.reset', 'settings', null, counts, jsonb_build_object('customer_logins_deleted', logins));
  return counts || jsonb_build_object('customer_logins', logins);
end;
$$;
