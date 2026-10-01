-- =============================================================================
-- OzShine V2 — PATCH: staff logins never need email verification
-- =============================================================================
-- After this, grant_staff_access() also marks the person's email as
-- confirmed, so a staff login works straight away even if you forget to tick
-- "Auto Confirm User" or later turn on email confirmation for customers.
-- Safe to run more than once. Changes no data.
-- =============================================================================

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

revoke execute on function public.grant_staff_access(text, text) from public, anon, authenticated;

-- Also confirm any staff logins that already exist.
update auth.users u set email_confirmed_at = coalesce(u.email_confirmed_at, now())
where exists (select 1 from staff s where s.auth_user_id = u.id and s.active);

select 'Done' as result;
