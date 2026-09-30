-- =============================================================================
-- OzShine V2 — PATCH: pick an existing customer on the New sale screen
-- =============================================================================
-- Lets staff attach a walk-in or phone booking to a customer they picked from
-- search, instead of matching only by mobile/rego (which made duplicates when
-- a customer was typed by name, or had no mobile on file).
--
-- Additive and safe to run more than once: it adds one helper function and
-- replaces two existing ones with the same inputs/outputs. No data changes.
-- Already included in upgrade_v2.sql / schema.sql for fresh installs.
-- =============================================================================

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

-- Internal helper: only the booking functions below call it.
revoke execute on function public.staff_resolve_customer(uuid, text, text, text, text) from public, anon, authenticated;

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

-- Check: should return 1 row.
select proname from pg_proc where proname = 'staff_resolve_customer' and pronamespace = 'public'::regnamespace;
