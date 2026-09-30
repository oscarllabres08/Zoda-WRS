-- Notify store owner (admin + seller inbox) when order status changes (e.g. delivered in Seller app).

create or replace function public.notify_order_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_status_label text;
begin
  if new.status is distinct from old.status then
    v_status_label := replace(new.status::text, '_', ' ');

    insert into public.notifications(recipient_id, order_id, kind, title, body, data)
    values (
      new.customer_id,
      new.id,
      'order_status',
      'Order update',
      'Your order is now ' || v_status_label || '.',
      jsonb_build_object(
        'orderId', new.id,
        'app', 'customer',
        'status', new.status::text
      )
    );

    insert into public.notifications(recipient_id, order_id, kind, title, body, data)
    values (
      new.seller_id,
      new.id,
      'order_activity',
      'Order ' || v_status_label,
      coalesce(new.customer_name, 'Customer') || '''s order is now ' || v_status_label || '.',
      jsonb_build_object(
        'orderId', new.id,
        'app', 'seller',
        'status', new.status::text,
        'customerName', new.customer_name
      )
    );
  end if;
  return new;
end;
$$;

drop trigger if exists orders_notify_customer_status on public.orders;
drop trigger if exists orders_notify_order_status_change on public.orders;
create trigger orders_notify_order_status_change
after update of status on public.orders
for each row execute function public.notify_order_status_change();
