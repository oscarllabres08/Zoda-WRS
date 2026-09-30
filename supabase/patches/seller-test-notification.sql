-- Run in Supabase SQL Editor to enable "Send test notification" in seller app settings.

create or replace function public.seller_send_test_notification()
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
begin
  if not public.is_seller(v_uid) then
    return jsonb_build_object('ok', false, 'message', 'Only sellers can run this test.');
  end if;

  insert into public.notifications (recipient_id, order_id, kind, title, body, data)
  values (
    v_uid,
    null,
    'test_notification',
    'Test notification',
    'Kung nakita mo ito, gumagana ang seller alerts. (Test mula sa Notification settings.)',
    jsonb_build_object('app', 'seller', 'kind', 'test_notification', 'source', 'seller_send_test_notification')
  )
  returning id into v_id;

  return jsonb_build_object('ok', true, 'notification_id', v_id);
end;
$$;

grant execute on function public.seller_send_test_notification() to authenticated;
grant execute on function public.seller_send_test_notification() to service_role;
