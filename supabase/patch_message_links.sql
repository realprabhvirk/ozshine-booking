-- =============================================================================
-- OzShine V2 — PATCH: working links + Google review in messages
-- =============================================================================
-- 1. Links in texts/emails (manage booking, receipt) always include the
--    website: they fall back to https://ozshine-booking.vercel.app when
--    Settings > Business > "Booking website address" is empty. Before this they
--    started with "/manage/..." and went nowhere.
-- 2. The after-visit message now asks for a Google review and links to
--    Settings > Business > "Review link" (until that's filled in, it links to
--    the booking's own rating page). A template you've edited is left alone.
--
-- Additive and safe to run more than once. No table or data changes.
-- Already in upgrade_v2.sql / schema.sql for fresh installs.
-- =============================================================================

create or replace function public.site_url(p_path text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  -- Falls back to the live booking site so message links always work, even
  -- before Settings > Business > Booking website address is filled in.
  select coalesce(nullif(rtrim((select public_site_url from settings where location_id = default_location_id()), '/'), ''),
                  'https://ozshine-booking.vercel.app') || p_path;
$$;

create or replace function public.booking_message_vars(p_booking_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'first_name', first_name(c.name),
    'service', s.name,
    'rego', coalesce(v.rego, 'your car'),
    'date', to_char(b.requested_date, 'Dy FMDD Mon'),
    'time', lower(to_char(b.requested_time, 'FMHH12:MIam')),
    'reference', b.reference_code,
    'manage_url', site_url('/manage/' || b.manage_token::text),
    'feedback_url', site_url('/manage/' || b.manage_token::text || '#feedback'),
    'business_name', st.business_name,
    'shop_phone', st.phone,
    -- The Google review link from Settings > Business; until it's filled in,
    -- the booking's own rating page.
    'review_url', coalesce(nullif(btrim(st.review_url), ''), site_url('/manage/' || b.manage_token::text || '#feedback'))
  )
  from bookings b
  join customers c on c.id = b.customer_id
  join services s on s.id = b.service_id
  left join vehicles v on v.id = b.vehicle_id
  left join settings st on st.location_id = b.location_id
  where b.id = p_booking_id;
$$;

update message_templates set name = 'Google review request',
  body = 'Thanks for visiting OzShine Beenleigh, {{first_name}}! If we did a great job, a quick Google review really helps: {{review_url}}'
where key = 'review_request' and channel = 'sms'
  and body = 'Thanks for visiting OzShine, {{first_name}}! How did we go? Rate your visit in 10 seconds: {{feedback_url}}';

update message_templates set name = 'Google review request',
  subject = 'Thanks for visiting, {{first_name}}',
  body = E'Hi {{first_name}},\n\nThanks for trusting us with {{rego}} today. We hope it''s shining!\n\nIf we did a great job, a quick Google review helps other locals find us. It takes less than a minute.\n{{review_url}}\n\nThe OzShine team'
where key = 'review_request' and channel = 'email'
  and body = E'Hi {{first_name}},\n\nThanks for trusting us with {{rego}}. We''d love to know how we went — it takes 10 seconds:\n{{feedback_url}}\n\nThe OzShine team';
