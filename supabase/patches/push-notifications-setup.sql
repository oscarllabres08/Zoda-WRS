-- Background push (app closed / screen off) — one-time Supabase setup checklist.
-- In-app bell badge works without this; FCM does not.

-- 1) Extension (run once)
create extension if not exists pg_net with schema extensions;

-- 2) Verify settings (replace placeholders — see supabase/functions/README.md)
-- select key,
--   case when value like 'CONFIGURE_%' then 'NOT SET' else 'set' end as status
-- from public.system_settings
-- where key in ('push_webhook_url', 'push_webhook_secret', 'push_function_jwt');

-- Example updates (edit values):
-- update public.system_settings set value = 'https://YOUR_PROJECT.supabase.co/functions/v1/push-notify'
--   where key = 'push_webhook_url';
-- update public.system_settings set value = 'YOUR_STRONG_SECRET_SAME_AS_EDGE_SECRET'
--   where key = 'push_webhook_secret';
-- update public.system_settings set value = 'YOUR_ANON_JWT_eyJ...'
--   where key = 'push_function_jwt';

-- 3) After a test order, check pg_net calls (optional):
-- select id, status_code, error_msg, created
-- from net._http_response
-- order by created desc
-- limit 10;

-- 4) Seller device token:
-- select user_id, app, platform, left(token, 24) || '…' as token_prefix, updated_at
-- from public.push_tokens
-- where app = 'seller' and platform = 'android';
