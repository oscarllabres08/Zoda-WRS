-- Fix duplicate phone push notifications (multiple stale FCM tokens / repeated webhook sends).
-- Run in Supabase SQL Editor, then redeploy Edge Function push-notify.

-- 1) Idempotency: one FCM send per dedupe key (order+device, or notification+device).
create table if not exists public.push_deliveries (
  dedupe_key text primary key,
  sent_at timestamptz not null default now()
);

create index if not exists push_deliveries_sent_at_idx on public.push_deliveries (sent_at desc);

alter table public.push_deliveries enable row level security;

-- Migrate older push_deliveries shape if present.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'push_deliveries'
      and column_name = 'notification_id'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'push_deliveries'
      and column_name = 'dedupe_key'
  ) then
    alter table public.push_deliveries rename to push_deliveries_legacy;
    create table public.push_deliveries (
      dedupe_key text primary key,
      sent_at timestamptz not null default now()
    );
    insert into public.push_deliveries (dedupe_key, sent_at)
    select notification_id::text || ':' || fcm_token, sent_at
    from public.push_deliveries_legacy
    on conflict (dedupe_key) do nothing;
    drop table public.push_deliveries_legacy;
  end if;
end $$;

-- 2) Ensure one row per user + app + platform (may already exist from schema.sql).
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'push_tokens_user_id_app_platform_key'
      and conrelid = 'public.push_tokens'::regclass
  ) then
    alter table public.push_tokens
      add constraint push_tokens_user_id_app_platform_key unique (user_id, app, platform);
  end if;
end $$;

-- 3) Remove duplicate rows (keep newest updated_at per user/app/platform).
delete from public.push_tokens a
using public.push_tokens b
where a.user_id = b.user_id
  and a.app = b.app
  and a.platform = b.platform
  and a.id <> b.id
  and coalesce(a.updated_at, a.created_at) < coalesce(b.updated_at, b.created_at);

-- 4) Same physical device token must not stay on multiple accounts (keep newest login).
delete from public.push_tokens a
using public.push_tokens b
where a.token = b.token
  and a.id <> b.id
  and coalesce(a.updated_at, a.created_at) < coalesce(b.updated_at, b.created_at);

-- 5) One seller device token globally (same phone reused across old seller accounts).
create unique index if not exists push_tokens_seller_token_unique
  on public.push_tokens (token)
  where app = 'seller';

create unique index if not exists push_tokens_customer_token_unique
  on public.push_tokens (token)
  where app = 'customer';

-- Diagnostic (optional): should return 0 rows — one token must not map to many users.
-- select token, count(*) from public.push_tokens where app = 'seller' group by 1 having count(*) > 1;
