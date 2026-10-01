-- =============================================================================
-- OzShine V2 — PATCH: show cash handed over + change on receipts
-- =============================================================================
-- Adds two columns to payments (cash handed over, change given), a small
-- function the checkout screen calls to save them, and includes them in the
-- customer's online receipt.
--
-- Additive and safe to run more than once. No existing data changes.
-- Already included in upgrade_v2.sql / schema.sql for fresh installs.
-- =============================================================================

alter table payments add column if not exists tendered numeric(10, 2);
alter table payments add column if not exists change_given numeric(10, 2);

create or replace function public.set_payment_tendered(p_payment_id uuid, p_tendered numeric, p_actor uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  actor uuid := resolve_actor(p_actor);
  p record;
  t numeric(10, 2) := round(coalesce(p_tendered, 0), 2);
begin
  select pa.* into p from payments pa join invoices i on i.id = pa.invoice_id
  where pa.id = p_payment_id and i.location_id = staff_location_id() for update of pa;
  if not found then
    perform oz_raise('NOT_FOUND', 'We couldn''t find that payment.');
  end if;
  if p.method <> 'cash' or p.amount <= 0 then
    perform oz_raise('INVALID_INPUT', 'Only cash payments have change.');
  end if;
  if t < p.amount then
    perform oz_raise('INVALID_INPUT', 'The cash handed over is less than the payment.');
  end if;
  update payments set tendered = t, change_given = t - p.amount where id = p.id;
  return jsonb_build_object('tendered', t, 'change_given', t - p.amount);
end;
$$;

revoke execute on function public.set_payment_tendered(uuid, numeric, uuid) from public, anon;
grant execute on function public.set_payment_tendered(uuid, numeric, uuid) to authenticated;

create or replace function public.get_receipt_by_token(p_token uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'number', i.number,
    'status', i.status,
    'issued_at', i.issued_at,
    'subtotal', i.subtotal,
    'discount_total', i.discount_total,
    'gst_amount', i.gst_amount,
    'total', i.total,
    'amount_paid', i.amount_paid,
    'balance_due', i.balance_due,
    'customer_first_name', first_name(c.name),
    'rego', v.rego,
    'items', coalesce((select jsonb_agg(jsonb_build_object('description', it.description, 'quantity', it.quantity,
                 'unit_price', it.unit_price, 'line_total', it.line_total) order by it.sort, it.created_at)
               from invoice_items it where it.invoice_id = i.id), '[]'::jsonb),
    'payments', coalesce((select jsonb_agg(jsonb_build_object('method', p.method, 'amount', p.amount, 'received_at', p.received_at,
                  'tendered', p.tendered, 'change_given', p.change_given)
                  order by p.received_at) from payments p where p.invoice_id = i.id), '[]'::jsonb),
    'business', jsonb_build_object('name', st.business_name, 'abn', st.abn, 'address', st.address,
                  'phone', st.phone, 'email', st.email, 'footer', st.invoice_footer, 'tax_rate', st.tax_rate)
  )
  from invoices i
  left join customers c on c.id = i.customer_id
  left join bookings b on b.id = i.booking_id
  left join vehicles v on v.id = b.vehicle_id
  left join settings st on st.location_id = i.location_id
  where i.public_token = p_token and i.status <> 'draft';
$$;

-- Check: should return 2 rows (tendered, change_given).
select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'payments' and column_name in ('tendered', 'change_given');
