-- =============================================================================
-- OzShine V2 — DEMO DATA (optional)
-- =============================================================================
-- Fills the system with ~60 made-up customers, ~90 cars and ~3 months of
-- bookings, invoices, payments, reviews and loyalty rewards so the dashboards
-- and reports have something to show. Also puts a realistic "today" on the
-- live board (cars in bays, one ready for pickup, requests waiting).
--
-- Safe to run on the real database:
--   * Every row it creates is flagged is_demo = true.
--   * supabase/remove_demo.sql deletes exactly those rows and nothing else.
--   * Phone numbers are in 0491 570 xxx (ACMA's range for fictional use) and
--     emails are @example.com, so nothing can reach a real person. Demo
--     customers are also hard-blocked from any live SMS/email provider.
--   * Demo invoices are numbered DEMO-000001… and don't touch the real
--     invoice number sequence.
--   * It refuses to run twice (run remove_demo.sql first to reload).
--
-- Needs upgrade_v2.sql to have been run first.
-- =============================================================================

select set_config('oz.seeding', 'on', false);

do $seed$
declare
  loc        uuid := default_location_id();
  tz         text := shop_tz();
  today      date := shop_today();
  staff_ids  uuid[];
  bay_ids    uuid[];
  svc        record;
  svc_ids    uuid[];
  addon_ids  uuid[];
  cust_ids   uuid[] := '{}';
  first_names text[] := array['Liam','Olivia','Noah','Charlotte','Jack','Amelia','William','Isla','Oliver',
    'Mia','Leo','Ava','Lucas','Grace','Henry','Chloe','Thomas','Zoe','James','Ruby','Ethan','Sophie','Mason',
    'Harper','Cooper','Ella','Hudson','Matilda','Archie','Willow','Kai','Aria','Harrison','Evie','Lachlan',
    'Sienna','Riley','Ivy','Jaxon','Layla','Tyler','Maddison','Brodie','Tahlia','Darcy','Jasmine','Declan',
    'Priya','Arjun','Mei','Tariq','Aroha','Sione','Anh','Lucia','Dimitri','Fatima','Nikhil','Ngaire','Hamish'];
  last_names text[] := array['Nguyen','Smith','Kelly','Brown','Walker','Harris','Morgan','Taylor','Wilson',
    'Martin','Lee','Clarke','Patel','Singh','Campbell','Murphy','Ryan','Tran','Robinson','Hughes','Evans',
    'Cooper','Fraser','Bennett','Doyle','Hall','Kaur','Wright','Nolan','Reid'];
  makes text[] := array['Toyota Corolla','Toyota Hilux','Mazda CX-5','Mazda 3','Ford Ranger','Hyundai i30',
    'Kia Sportage','Mitsubishi Triton','Toyota RAV4','Nissan Navara','Isuzu D-Max','Tesla Model 3',
    'Subaru Outback','Volkswagen Golf','Toyota LandCruiser','Hyundai Tucson','Kia Cerato','MG ZS',
    'Toyota HiAce','Honda CR-V','BYD Atto 3','Ford Everest','Suzuki Swift','Toyota Camry'];
  colours text[] := array['White','Silver','Black','Grey','Blue','Red','Graphite','Pearl white'];
  i int; j int; d int; n int;
  cid uuid; vid uuid; bid uuid; inv uuid;
  vtype text;
  fname text; lname text;
  bdate date; btime time;
  v_status text; v_source text;
  st uuid;
  v_dur int;
  v_starts timestamptz;
  v_created timestamptz;
  v_ready timestamptz;
  v_done timestamptz;
  v_price numeric(10, 2);
  add_id uuid;
  add_row record;
  inv_n int := 0;
  roll float;
  v_total numeric(10, 2);
  v_cnt int;
  rule_id uuid;
  v_m int;
  demo_comments text[] := array[
    'Car looks brand new, thanks team!', 'Quick and friendly as always.', 'Great job on the interior.',
    'Really happy with the polish.', 'Easy booking, car was ready on time.', null, null, null];
  low_comments text[] := array['Missed a few spots on the back windows.', 'Took longer than quoted.',
    'Some water marks left on the bonnet.'];
begin
  if exists (select 1 from customers where is_demo) then
    raise exception 'Demo data is already loaded. Run supabase/remove_demo.sql first if you want to reload it.';
  end if;
  if loc is null then
    raise exception 'No location found — run upgrade_v2.sql first.';
  end if;

  perform setseed(0.4207);

  select array_agg(id order by created_at) into staff_ids from staff where active and location_id = loc;
  select array_agg(id order by sort_order) into bay_ids from bays where active and location_id = loc;
  select array_agg(id order by random()) into addon_ids from addons where active and location_id = loc;

  -- ---- Customers + vehicles ------------------------------------------------
  for i in 1..60 loop
    fname := first_names[i];
    lname := last_names[1 + ((i * 7) % array_length(last_names, 1))];
    insert into customers (name, phone, email, marketing_opt_in, tags, is_vip, created_at, is_demo)
    values (
      fname || ' ' || lname,
      '0491570' || lpad((100 + i)::text, 3, '0'),
      case when random() < 0.65 then lower(fname || '.' || lname || i) || '@example.com' end,
      random() < 0.85,
      case when i % 17 = 0 then array['fleet'] when i % 11 = 0 then array['regular'] else '{}' end,
      i in (3, 8, 21),
      now() - make_interval(days => 95 + (random() * 300)::int),
      true)
    returning id into cid;
    cust_ids := cust_ids || cid;

    for j in 1..(case when random() < 0.5 then 2 else 1 end) loop
      roll := random();
      vtype := case when roll < 0.4 then 'sedan' when roll < 0.6 then 'small_wagon'
                    when roll < 0.9 then '4wd' else 'van' end;
      insert into vehicles (customer_id, rego, make_model, vehicle_type, colour, year, is_primary, is_demo)
      values (cid,
        (100 + (random() * 899)::int)::text || chr(65 + (random() * 25)::int) || chr(65 + (random() * 25)::int) || chr(65 + (random() * 25)::int),
        makes[1 + (random() * (array_length(makes, 1) - 1))::int],
        vtype,
        colours[1 + (random() * (array_length(colours, 1) - 1))::int],
        2012 + (random() * 13)::int,
        j = 1,
        true);
    end loop;
  end loop;

  -- A couple of referrals.
  update customers set referred_by_customer_id = cust_ids[1] where id = cust_ids[45];
  update customers set referred_by_customer_id = cust_ids[3] where id = cust_ids[52];

  -- ---- 90 days of history ---------------------------------------------------
  select array_agg(id order by sort_order) into svc_ids from services where location_id = loc and active;

  for d in reverse 90..1 loop
    bdate := today - d;
    n := case extract(isodow from bdate) when 6 then 5 when 7 then 3 else 2 end + (random() * 2)::int;
    for i in 1..n loop
      -- Squaring skews toward the first customers, so there are some regulars.
      cid := cust_ids[1 + floor(power(random(), 2) * 60)::int];
      select id, vehicle_type into vid, vtype from vehicles where customer_id = cid order by random() limit 1;
      roll := random();
      select * into svc from services where id = svc_ids[
        case when roll < 0.40 then 1 when roll < 0.72 then 2 when roll < 0.82 then 3
             when roll < 0.90 then 4 when roll < 0.97 then 5 else 6 end];
      btime := make_time(case extract(isodow from bdate) when 7 then 9 else 8 end + (random() * 5)::int,
                         case when random() < 0.5 then 0 else 30 end, 0);
      v_starts := (bdate + btime) at time zone tz;
      v_dur := coalesce(svc.duration_minutes, 60);
      roll := random();
      v_status := case when roll < 0.86 then 'completed' when roll < 0.91 then 'cancelled'
                     when roll < 0.95 then 'no_show' else 'declined' end;
      roll := random();
      v_source := case when roll < 0.5 then 'web' when roll < 0.8 then 'walk_in' else 'phone' end;
      v_created := case when v_source = 'walk_in' then v_starts - interval '5 minutes'
                      else v_starts - make_interval(hours => 4 + (random() * 140)::int) end;
      st := case when staff_ids is null then null else staff_ids[1 + (random() * (array_length(staff_ids, 1) - 1))::int] end;
      v_ready := v_starts + make_interval(mins => (v_dur * (0.8 + random() * 0.45))::int);
      v_done := v_ready + make_interval(mins => 5 + (random() * 35)::int);

      insert into bookings (customer_id, vehicle_id, service_id, location_id, requested_date, requested_time,
        status, source, vehicle_type, processed_by_staff_id, assigned_staff_id, created_at,
        approved_at, checked_in_at, started_at, ready_at, completed_at, cancelled_at, declined_at,
        cancel_reason, decline_reason, is_demo)
      values (cid, vid, svc.id, loc, bdate, btime, v_status, v_source, vtype, st,
        case when v_status = 'completed' then st end, v_created,
        case when v_status <> 'declined' then v_created + interval '20 minutes' end,
        case when v_status = 'completed' then v_starts - interval '5 minutes' end,
        case when v_status = 'completed' then v_starts end,
        case when v_status = 'completed' then v_ready end,
        case when v_status = 'completed' then v_done end,
        case when v_status = 'cancelled' then v_starts - interval '1 day' end,
        case when v_status = 'declined' then v_created + interval '30 minutes' end,
        case when v_status = 'cancelled' then 'Customer rescheduled' end,
        case when v_status = 'declined' then 'Fully booked at that time' end,
        true)
      returning id, service_price into bid, v_price;

      if random() < 0.2 and addon_ids is not null then
        -- (pick first: random() inside WHERE is re-evaluated for every row)
        add_id := addon_ids[1 + (random() * (array_length(addon_ids, 1) - 1))::int];
        select * into add_row from addons where id = add_id;
        insert into booking_addons (booking_id, addon_id, name_snapshot, price_snapshot, duration_snapshot, created_at)
        values (bid, add_row.id, add_row.name, add_row.price, add_row.duration_minutes, v_created);
      end if;

      if v_status = 'completed' then
        inv_n := inv_n + 1;
        insert into invoices (location_id, number, booking_id, customer_id, status, issued_at, due_at,
          created_by_staff_id, public_token, created_at, is_demo)
        values (loc, 'DEMO-' || lpad(inv_n::text, 6, '0'), bid, cid, 'issued', v_done, v_done, st,
          gen_random_uuid(), v_done, true)
        returning id into inv;
        insert into invoice_items (invoice_id, kind, description, quantity, unit_price, line_total, sort, created_at)
        values (inv, 'service', svc.name || ' — ' || vehicle_type_label(vtype), 1, v_price, v_price, 0, v_done);
        insert into invoice_items (invoice_id, kind, description, quantity, unit_price, line_total, sort, created_at)
        select inv, 'addon', ba.name_snapshot, 1, ba.price_snapshot, ba.price_snapshot, 1, v_done
        from booking_addons ba where ba.booking_id = bid;
        select i.total into v_total from invoices i where i.id = inv;

        roll := random();
        if roll < 0.93 then
          insert into payments (invoice_id, amount, method, received_by_staff_id, received_at, is_demo)
          values (inv, v_total, case when random() < 0.62 then 'eftpos' when random() < 0.9 then 'cash' else 'bank_transfer' end,
            st, v_done, true);
        elsif roll < 0.97 then
          insert into payments (invoice_id, amount, method, received_by_staff_id, received_at, is_demo)
          values (inv, round(v_total / 2), 'cash', st, v_done, true);
        end if;
        -- (the remaining ~3% stay unpaid so Debtors has something in it)

        if bdate > today - 35 and random() < 0.4 then
          roll := random();
          insert into feedback (booking_id, customer_id, rating, comment, created_at, is_demo)
          values (bid, cid,
            case when roll < 0.7 then 5 when roll < 0.9 then 4 when roll < 0.96 then 3 else 2 end,
            case when roll >= 0.9 then low_comments[1 + (random() * 2)::int]
                 else demo_comments[1 + (random() * (array_length(demo_comments, 1) - 1))::int] end,
            v_done + interval '3 hours', true);
        end if;
      end if;
    end loop;
  end loop;

  -- ---- Today: a realistic live board ---------------------------------------
  -- (times are fixed so the board looks the same whenever the seed is run)
  for i in 1..11 loop
    cid := cust_ids[5 + i * 4];
    select id, vehicle_type into vid, vtype from vehicles where customer_id = cid order by is_primary desc limit 1;
    select * into svc from services where id = svc_ids[case when i in (3, 8) then 3 when i in (5) then 5 when i % 2 = 0 then 2 else 1 end];
    btime := (array['08:00','08:30','09:00','09:30','10:00','10:30','11:30','13:00','14:00','14:30','15:00'])[i]::time;
    v_status := (array['completed','completed','ready','in_progress','in_progress','checked_in','approved','approved','approved','pending','pending'])[i];
    v_source := case when i in (2, 4) then 'walk_in' when i in (6) then 'phone' else 'web' end;
    v_starts := (today + btime) at time zone tz;
    st := case when staff_ids is null then null else staff_ids[1 + (i % array_length(staff_ids, 1))] end;
    insert into bookings (customer_id, vehicle_id, service_id, location_id, requested_date, requested_time,
      status, source, vehicle_type, processed_by_staff_id, assigned_staff_id, bay_id, created_at,
      approved_at, checked_in_at, started_at, ready_at, completed_at, customer_notes, is_demo)
    values (cid, vid, svc.id, loc, today, btime, v_status, v_source, vtype,
      case when v_status <> 'pending' then st end,
      case when v_status in ('in_progress', 'ready', 'completed') then st end,
      case when v_status in ('in_progress', 'ready') and bay_ids is not null
           then bay_ids[1 + (i % array_length(bay_ids, 1))] end,
      case when v_source = 'walk_in' then v_starts else now() - make_interval(hours => 20 + i) end,
      case when v_status <> 'pending' then now() - make_interval(hours => 18 + i) end,
      case when v_status in ('checked_in', 'in_progress', 'ready', 'completed') then v_starts end,
      case when v_status in ('in_progress', 'ready', 'completed') then v_starts + interval '5 minutes' end,
      case when v_status in ('ready', 'completed') then v_starts + interval '50 minutes' end,
      case when v_status = 'completed' then v_starts + interval '60 minutes' end,
      case i when 7 then 'Dog hair in the back, sorry!' when 10 then 'Can you do the tailgate too?' end,
      true)
    returning id, service_price into bid, v_price;

    if v_status in ('completed', 'ready') then
      inv_n := inv_n + 1;
      insert into invoices (location_id, number, booking_id, customer_id, status, issued_at, due_at,
        created_by_staff_id, created_at, is_demo)
      values (loc, 'DEMO-' || lpad(inv_n::text, 6, '0'), bid, cid, 'issued', v_starts + interval '55 minutes',
        v_starts + interval '55 minutes', st, v_starts + interval '55 minutes', true)
      returning id into inv;
      insert into invoice_items (invoice_id, kind, description, quantity, unit_price, line_total, sort)
      values (inv, 'service', svc.name || ' — ' || vehicle_type_label(vtype), 1, v_price, v_price, 0);
      if v_status = 'completed' then
        insert into payments (invoice_id, amount, method, received_by_staff_id, received_at, is_demo)
        values (inv, v_price, case when i = 1 then 'eftpos' else 'cash' end, st, v_starts + interval '60 minutes', true);
      end if;
    end if;
  end loop;

  -- Tomorrow: a few confirmed and a couple waiting for approval.
  for i in 1..6 loop
    cid := cust_ids[2 + i * 5];
    select id, vehicle_type into vid, vtype from vehicles where customer_id = cid order by is_primary desc limit 1;
    insert into bookings (customer_id, vehicle_id, service_id, location_id, requested_date, requested_time,
      status, source, vehicle_type, processed_by_staff_id, created_at, approved_at, is_demo)
    values (cid, vid, svc_ids[1 + (i % 3)], loc, today + 1,
      (array['08:30','09:30','10:00','11:00','13:30','15:00'])[i]::time,
      case when i <= 4 then 'approved' else 'pending' end,
      case when i = 3 then 'phone' else 'web' end, vtype,
      case when i <= 4 and staff_ids is not null then staff_ids[1] end,
      now() - make_interval(hours => 3 * i),
      case when i <= 4 then now() - make_interval(hours => 2 * i) end,
      true);
  end loop;

  -- ---- Loyalty: rewards for every 6-visit milestone reached ----------------
  select id into rule_id from loyalty_rules where location_id = loc and kind = 'visits' and active order by created_at limit 1;
  if rule_id is not null then
    for i in 1..60 loop
      select count(*) into v_cnt from bookings where customer_id = cust_ids[i] and status = 'completed';
      v_m := 6;
      while v_m <= v_cnt loop
        insert into loyalty_rewards (customer_id, rule_id, milestone, code, description, reward_type, reward_value,
          eligible_service_ids, status, issued_at, expires_at, redeemed_at, is_demo)
        select cust_ids[i], r.id, v_m::text, 'RW-' || gen_short_code(6), r.name, r.reward_type, r.reward_value,
          r.eligible_service_ids,
          case when v_m + 6 <= v_cnt then 'redeemed' else 'issued' end,
          now() - make_interval(days => greatest(1, (v_cnt - v_m) * 9)),
          now() + make_interval(days => coalesce(r.expires_after_days, 180) - greatest(1, (v_cnt - v_m) * 9)),
          case when v_m + 6 <= v_cnt then now() - make_interval(days => greatest(1, (v_cnt - v_m - 3) * 9)) end,
          true
        from loyalty_rules r where r.id = rule_id
        on conflict do nothing;
        v_m := v_m + 6;
      end loop;
    end loop;
  end if;

  -- ---- A few staff notes and a gift voucher ---------------------------------
  insert into customer_notes (customer_id, body, staff_id)
  values (cust_ids[1], 'Fleet account — 3 utes. Invoice monthly, they pay by bank transfer.', staff_ids[1]),
         (cust_ids[3], 'Prefers no tyre shine. Very particular about the dash.', staff_ids[1]),
         (cust_ids[8], 'Always books the Platinum before long weekends.', staff_ids[1]);
  insert into vouchers (location_id, code, initial_value, balance, issued_to_customer_id, note, created_by, is_demo)
  values (loc, 'DEMO-GIFT-50', 50, 50, cust_ids[12], 'Birthday gift voucher (demo)', staff_ids[1], true);

  -- Timeline entries were stamped "now" by the triggers; move them to when
  -- things actually happened so customer timelines read naturally.
  update customer_events e set created_at = b.created_at
  from bookings b where e.booking_id = b.id and b.is_demo;
end
$seed$;

select set_config('oz.seeding', '', false);

-- ---- Recent message history (last 10 days), rendered from the real templates
-- ---- and always simulated for demo customers.
do $msgs$
declare b record;
begin
  for b in select id, customer_id, status from bookings
           where is_demo and requested_date >= shop_today() - 10 order by starts_at loop
    if b.status in ('approved', 'completed', 'ready') then
      perform enqueue_message('booking_approved', b.customer_id, b.id, null, '{}'::jsonb, 'demo-approved:' || b.id::text);
    elsif b.status = 'pending' then
      perform enqueue_message('booking_received', b.customer_id, b.id, null, '{}'::jsonb, 'demo-received:' || b.id::text);
    end if;
    if b.status = 'ready' then
      perform enqueue_message('ready_for_pickup', b.customer_id, b.id, null, '{}'::jsonb, 'demo-ready:' || b.id::text);
    end if;
  end loop;
  update message_outbox set is_demo = true
  where customer_id in (select id from customers where is_demo);
end
$msgs$;

-- What was loaded:
select
  (select count(*) from customers where is_demo) as demo_customers,
  (select count(*) from vehicles where is_demo) as demo_vehicles,
  (select count(*) from bookings where is_demo) as demo_bookings,
  (select count(*) from invoices where is_demo) as demo_invoices,
  (select count(*) from payments where is_demo) as demo_payments,
  (select count(*) from loyalty_rewards where is_demo) as demo_rewards,
  (select count(*) from feedback where is_demo) as demo_reviews;
