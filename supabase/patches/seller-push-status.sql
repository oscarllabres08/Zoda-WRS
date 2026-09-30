-- Run in Supabase SQL Editor. Lets seller app show if background FCM can work.

create or replace function public.seller_push_status()
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_uid uuid := auth.uid();
  v_has_token boolean;
  v_url text;
  v_secret text;
  v_jwt text;
  v_server_ok boolean;
begin
  if not public.is_seller(v_uid) then
    return jsonb_build_object('ok', false, 'message', 'Only sellers can view push status.');
  end if;

  select exists(
    select 1
    from public.push_tokens
    where user_id = v_uid
      and app = 'seller'
      and platform = 'android'
      and nullif(trim(token), '') is not null
  ) into v_has_token;

  select value into v_url from public.system_settings where key = 'push_webhook_url';
  select value into v_secret from public.system_settings where key = 'push_webhook_secret';
  select value into v_jwt from public.system_settings where key = 'push_function_jwt';

  v_server_ok := coalesce(v_url, '') not like 'CONFIGURE_%'
    and nullif(trim(coalesce(v_url, '')), '') is not null
    and coalesce(v_secret, '') not like 'CONFIGURE_%'
    and nullif(trim(coalesce(v_secret, '')), '') is not null
    and coalesce(v_jwt, '') not like 'CONFIGURE_%'
    and nullif(trim(coalesce(v_jwt, '')), '') is not null;

  return jsonb_build_object(
    'ok', true,
    'device_token_registered', v_has_token,
    'server_push_configured', v_server_ok,
    'background_push_ready', v_has_token and v_server_ok
  );
end;
$$;

grant execute on function public.seller_push_status() to authenticated;
grant execute on function public.seller_push_status() to service_role;
