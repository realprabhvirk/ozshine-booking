-- =============================================================================
-- OzShine V2 — PATCH: email updates (run after patch_messaging_live.sql)
-- =============================================================================
-- 1. Adds a "ready for pickup" EMAIL (until now it was text-only, so with
--    texts off nobody heard their car was ready).
-- 2. In Live mode with no SMS account, texts are labelled "Not sent · SMS off"
--    instead of "Sent (demo)".
--
-- Additive and safe to run more than once. No table changes; an edited
-- template is never overwritten. Already in upgrade_v2.sql / schema.sql.
-- =============================================================================

insert into message_templates (key, channel, name, category, subject, body) values
  ('ready_for_pickup', 'email', 'Ready for pickup', 'transactional', '{{rego}} is ready for pickup',
   E'Hi {{first_name}},\n\nGood news: {{rego}} is ready for pickup at OzShine Beenleigh.\n\nSee you soon,\nThe OzShine team')
on conflict (key, channel) do nothing;

-- Live mode with only one provider set up (e.g. email through Resend but no
-- SMS account yet): messages for the channel that isn't set up aren't sent.
-- They're marked with provider 'sms_off' / 'email_off', which the staff app
-- shows as "Not sent · SMS off" (not "Sent (demo)", which reads as demo mode).
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
  update message_outbox set status = 'simulated_sent', provider = channel || '_off', sent_at = now(), error = null
  where id = p_id and status = 'queued';
end;
$$;
