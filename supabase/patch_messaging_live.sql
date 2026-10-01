-- =============================================================================
-- OzShine V2 — PATCH: instant, safe live sending (email through Resend)
-- =============================================================================
-- 1. Claiming messages to send now "leases" them for 10 minutes and skips
--    any another run is already sending, so a customer never gets the same
--    text or email twice (the staff app now sends straight away, and the
--    daily job also runs).
-- 2. New: with live mode on but only email set up, texts are marked
--    "Sent (demo)" instead of piling up as failed.
--
-- Additive and safe to run more than once. No table changes, no data changes.
-- Already included in upgrade_v2.sql / schema.sql for fresh installs.
-- =============================================================================

-- Live provider hand-off (only used when message_provider = 'live'): the
-- staff app claims queued messages, sends them through Twilio/Resend, then
-- reports the result. Claiming leases each message for 10 minutes and skips
-- rows another run already holds, so two runs at once (the daily job and an
-- instant send after a booking) never send the same message twice. If a run
-- dies mid-way, its messages are picked up again once the lease runs out.
create or replace function public.claim_outbox_batch_with_key(p_key text, p_limit int default 50)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, extensions
as $$
declare
  h text;
  result jsonb;
begin
  select cron_key_hash into h from settings where location_id = default_location_id();
  if h is null or coalesce(p_key, '') = '' or extensions.crypt(p_key, h) <> h then
    perform oz_raise('INVALID_KEY', 'Cron key not recognised.');
  end if;
  with picked as (
    select o.id from message_outbox o
    where o.status = 'queued' and o.scheduled_for <= now() and not o.is_demo
      and not exists (select 1 from customers c where c.id = o.customer_id and c.is_demo)
    order by o.scheduled_for, o.created_at
    limit greatest(1, least(coalesce(p_limit, 50), 200))
    for update of o skip locked
  ), leased as (
    update message_outbox m set scheduled_for = now() + interval '10 minutes'
    from picked where m.id = picked.id
    returning m.id, m.channel, m.to_address, m.subject, m.body, m.created_at
  )
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'channel', channel, 'to', to_address,
           'subject', subject, 'body', body) order by created_at), '[]'::jsonb)
  into result from leased;
  return result;
end;
$$;

-- Live mode with only one provider set up (e.g. email through Resend but no
-- SMS account yet): messages for the channel that isn't set up are marked
-- "Sent (demo)" instead of failing, exactly as in demo mode.
create or replace function public.simulate_outbox_message_with_key(p_key text, p_id uuid)
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
  update message_outbox set status = 'simulated_sent', provider = 'demo', sent_at = now(), error = null
  where id = p_id and status = 'queued';
end;
$$;

revoke execute on function public.simulate_outbox_message_with_key(text, uuid) from public;
grant execute on function public.simulate_outbox_message_with_key(text, uuid) to anon, authenticated;
