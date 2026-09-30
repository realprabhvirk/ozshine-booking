-- =============================================================================
-- OzShine V2 — REMOVE DEMO DATA
-- =============================================================================
-- Deletes everything seed_demo.sql created (every row flagged is_demo) and
-- NOTHING else. Real customers, bookings and invoices are never touched.
-- Safe to run any time, safe to run twice.
-- =============================================================================

begin;

-- Anything hanging off a demo customer counts as demo too (e.g. a test
-- booking someone made in the admin app for a demo customer).
create temporary table demo_customers on commit drop as
  select id from customers where is_demo;
create temporary table demo_bookings on commit drop as
  select id from bookings where is_demo or customer_id in (select id from demo_customers);
create temporary table demo_invoices on commit drop as
  select id from invoices where is_demo
     or customer_id in (select id from demo_customers)
     or booking_id in (select id from demo_bookings);

-- Children first (payments deliberately block invoice deletes).
delete from voucher_redemptions where payment_id in
  (select id from payments where invoice_id in (select id from demo_invoices));
delete from payments where is_demo or invoice_id in (select id from demo_invoices);
delete from invoices where id in (select id from demo_invoices);   -- items cascade
delete from message_outbox where is_demo
   or customer_id in (select id from demo_customers)
   or booking_id in (select id from demo_bookings);
delete from feedback where is_demo or booking_id in (select id from demo_bookings);
delete from loyalty_rewards where is_demo or customer_id in (select id from demo_customers);
delete from vouchers where is_demo;
delete from audit_log where entity_id in (select id from demo_bookings)
   or entity_id in (select id from demo_invoices)
   or entity_id in (select id from demo_customers);
delete from bookings where id in (select id from demo_bookings);   -- add-ons cascade
delete from vehicles where is_demo or customer_id in (select id from demo_customers);
delete from customers where id in (select id from demo_customers); -- notes/timeline cascade

commit;

select
  (select count(*) from customers where is_demo) as demo_customers_left,
  (select count(*) from bookings where is_demo) as demo_bookings_left,
  (select count(*) from invoices where is_demo) as demo_invoices_left;
