-- Run in Supabase SQL Editor so new customer orders create seller/admin notifications.
-- Test notifications use seller_send_test_notification(); orders need this trigger on order_items.

create or replace function public.notify_seller_new_order()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_order public.orders%rowtype;
  v_item_count int;
  v_body text;
begin
  select * into v_order from public.orders where id = new.order_id;
  if not found then
    return new;
  end if;

  -- One notification batch per order (handles multi-item carts + delivery fee rows).
  if exists (
    select 1
    from public.notifications n
    where n.order_id = v_order.id
      and n.kind = 'new_order'
  ) then
    return new;
  end if;

  -- Ignore delivery-fee-only rows if they ever fire before product lines.
  if new.product_id is null and coalesce(new.product_name, '') ilike 'delivery%' then
    return new;
  end if;

  select count(*)::int
  into v_item_count
  from public.order_items oi
  where oi.order_id = new.order_id
    and oi.product_id is not null;

  v_body := coalesce(v_order.customer_name, 'Customer') || ' placed an order';
  if v_item_count > 1 then
    v_body := v_body || ' (' || v_item_count::text || ' items).';
  else
    v_body := v_body || '. ' || coalesce(new.product_name, 'Item') || ' • Qty ' || new.quantity::text;
  end if;

  insert into public.notifications(recipient_id, order_id, kind, title, body, data)
  values (
    v_order.seller_id,
    v_order.id,
    'new_order',
    'New order',
    v_body,
    jsonb_build_object(
      'orderId', v_order.id,
      'app', 'seller',
      'customerName', v_order.customer_name,
      'itemCount', v_item_count,
      'firstItem', new.product_name,
      'qty', new.quantity
    )
  );

  -- Approved staff each get their own row (RLS + push tokens use auth.uid()).
  insert into public.notifications(recipient_id, order_id, kind, title, body, data)
  select
    p.user_id,
    v_order.id,
    'new_order',
    'New order',
    v_body,
    jsonb_build_object(
      'orderId', v_order.id,
      'app', 'seller',
      'customerName', v_order.customer_name,
      'itemCount', v_item_count,
      'firstItem', new.product_name,
      'qty', new.quantity
    )
  from public.profiles p
  where p.seller_workspace_owner_id = v_order.seller_id
    and p.seller_team_role = 'staff'
    and p.seller_join_status = 'approved';

  return new;
end;
$$;

drop trigger if exists orders_notify_seller_new_order on public.orders;
drop trigger if exists order_items_notify_seller_new_order on public.order_items;
create trigger order_items_notify_seller_new_order
after insert on public.order_items
for each row execute function public.notify_seller_new_order();
