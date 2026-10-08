-- 30-minute pending order reminder (seller app + admin web).
-- Client calls request_pending_order_reminder(order_id) when a pending online order
-- is 30+ minutes old and not yet opened in order details.

create or replace function public.request_pending_order_reminder(p_order_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_order public.orders%rowtype;
  v_uid uuid := auth.uid();
  v_body text;
begin
  if v_uid is null then
    return false;
  end if;

  select * into v_order from public.orders where id = p_order_id;
  if not found or v_order.status <> 'pending' then
    return false;
  end if;

  if v_order.created_at > now() - interval '30 minutes' then
    return false;
  end if;

  if v_uid <> v_order.seller_id and not exists (
    select 1
    from public.profiles p
    where p.user_id = v_uid
      and p.seller_workspace_owner_id = v_order.seller_id
      and p.seller_join_status = 'approved'
  ) then
    return false;
  end if;

  if exists (
    select 1
    from public.notifications n
    where n.order_id = p_order_id
      and n.kind = 'pending_order_reminder'
      and n.recipient_id = v_uid
  ) then
    return false;
  end if;

  v_body := coalesce(v_order.customer_name, 'A customer')
    || '''s order is still pending and has not been opened for over 30 minutes.';

  insert into public.notifications(recipient_id, order_id, kind, title, body, data)
  values (
    v_uid,
    p_order_id,
    'pending_order_reminder',
    'Pending order reminder',
    v_body,
    jsonb_build_object(
      'orderId', p_order_id,
      'kind', 'pending_order_reminder',
      'customerName', v_order.customer_name
    )
  );

  return true;
end;
$$;

grant execute on function public.request_pending_order_reminder(uuid) to authenticated;
grant execute on function public.request_pending_order_reminder(uuid) to service_role;
