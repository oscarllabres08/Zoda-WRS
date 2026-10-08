-- Record when payment was confirmed; sales reports use this date (not order created_at).
-- Run in Supabase SQL Editor.

alter table public.pos_sales add column if not exists payment_settled_at timestamptz;
alter table public.orders add column if not exists payment_settled_at timestamptz;

update public.pos_sales
set payment_settled_at = created_at
where payment_settled = true and payment_settled_at is null;

update public.orders
set payment_settled_at = created_at
where payment_settled = true and payment_settled_at is null;

create or replace function public.seller_mark_order_paid(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_business uuid := public.seller_business_id(auth.uid());
  v_n int;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if not public.is_seller(auth.uid()) then
    raise exception 'Only sellers can mark orders paid';
  end if;
  if v_business is null then
    raise exception 'Seller workspace not available';
  end if;
  update public.orders o
  set payment_settled = true,
      payment_settled_at = now()
  where o.id = p_order_id
    and o.seller_id = v_business
    and o.status <> 'cancelled'
    and coalesce(o.payment_settled, false) = false;
  get diagnostics v_n = row_count;
  if v_n = 0 then
    raise exception 'Order not found, already paid, cancelled, or not yours';
  end if;
end;
$$;

revoke all on function public.seller_mark_order_paid(uuid) from public;
grant execute on function public.seller_mark_order_paid(uuid) to authenticated;
grant execute on function public.seller_mark_order_paid(uuid) to service_role;
