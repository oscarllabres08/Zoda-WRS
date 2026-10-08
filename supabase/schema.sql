  -- Aquabeast WRS (Supabase/Postgres) schema
  -- Run this in Supabase SQL Editor.

  -- Extensions
  create extension if not exists "pgcrypto";
  -- Needed to call Edge Functions from DB triggers (async HTTP).
  create extension if not exists "pg_net";

  -- Enums
  do $$ begin
    create type public.user_role as enum ('customer', 'seller');
  exception when duplicate_object then null; end $$;

  do $$ begin
    create type public.order_status as enum ('pending', 'confirmed', 'preparing', 'on_the_way', 'delivered', 'cancelled');
  exception when duplicate_object then null; end $$;

  do $$ begin
    create type public.product_category as enum ('water', 'other');
  exception when duplicate_object then null; end $$;

  -- Profiles (one row per auth user)
  create table if not exists public.profiles (
    user_id uuid primary key references auth.users(id) on delete cascade,
    role public.user_role not null default 'customer',
    display_name text,
    phone text,
    address text,
    avatar_path text,
    store_name text,
    store_code text,
    business_hours text,
    store_address text,
    store_logo_url text,
    expo_push_token text,
    latitude double precision,
    longitude double precision,
    notifications_enabled boolean not null default true,
    notification_sound_enabled boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );

  -- Backfill/upgrade safety: ensure columns exist on older DBs
  alter table public.profiles add column if not exists store_name text;
  alter table public.profiles add column if not exists store_code text;
  alter table public.profiles add column if not exists business_hours text;
  alter table public.profiles add column if not exists store_address text;
  alter table public.profiles add column if not exists store_logo_url text;
  alter table public.profiles add column if not exists expo_push_token text;
  alter table public.profiles add column if not exists avatar_path text;
  alter table public.profiles add column if not exists latitude double precision;
  alter table public.profiles add column if not exists longitude double precision;
  alter table public.profiles add column if not exists notifications_enabled boolean not null default true;
  alter table public.profiles add column if not exists notification_sound_enabled boolean not null default true;

  -- Seller team: master admin (owner) vs staff (refill/delivery); staff need owner approval
  alter table public.profiles add column if not exists seller_team_role text;
  alter table public.profiles add column if not exists seller_join_status text;
  alter table public.profiles add column if not exists seller_workspace_owner_id uuid references public.profiles(user_id) on delete set null;

  alter table public.profiles drop constraint if exists profiles_seller_team_role_check;
  alter table public.profiles add constraint profiles_seller_team_role_check
    check (seller_team_role is null or seller_team_role in ('owner', 'staff'));

  alter table public.profiles drop constraint if exists profiles_seller_join_status_check;
  alter table public.profiles add constraint profiles_seller_join_status_check
    check (
      seller_join_status is null
      or seller_join_status in ('approved', 'pending', 'rejected')
    );

  -- Backfill legacy sellers as approved store owners
  update public.profiles p
  set
    seller_team_role = coalesce(p.seller_team_role, 'owner'),
    seller_join_status = coalesce(p.seller_join_status, 'approved'),
    seller_workspace_owner_id = coalesce(p.seller_workspace_owner_id, p.user_id)
  where p.role = 'seller'
    and p.seller_team_role is null;

  create unique index if not exists profiles_owner_store_code_upper_uidx
    on public.profiles (upper(trim(store_code)))
    where role = 'seller'
      and seller_team_role = 'owner'
      and coalesce(trim(store_code), '') <> '';

  -- Auto-update updated_at
  create or replace function public.set_updated_at()
  returns trigger language plpgsql as $$
  begin
    new.updated_at = now();
    return new;
  end $$;

  drop trigger if exists profiles_set_updated_at on public.profiles;
  create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

  create or replace function public.profiles_enforce_staff_join_updates()
  returns trigger
  language plpgsql
  security definer
  set search_path = public
  set row_security = off
  as $$
  begin
    -- Allow controlled self-registration updates via register_pending_seller RPC.
    if current_setting('app.register_pending_seller', true) = '1' then
      return new;
    end if;
    if tg_op = 'UPDATE'
       and new.role = 'seller'
       and new.seller_team_role = 'staff'
       and new.seller_join_status is distinct from old.seller_join_status
       and auth.uid() = new.user_id
    then
      raise exception 'Staff cannot change their own approval status';
    end if;
    return new;
  end;
  $$;

  drop trigger if exists profiles_enforce_staff_join on public.profiles;
  create trigger profiles_enforce_staff_join
  before update on public.profiles
  for each row execute function public.profiles_enforce_staff_join_updates();

  -- Staff cannot change role / workspace / approval status on their own row (RPC + owner updates only).
  create or replace function public.profiles_block_staff_self_privileged_updates()
  returns trigger
  language plpgsql
  as $$
  begin
    -- Allow controlled self-registration updates via register_pending_seller RPC.
    if current_setting('app.register_pending_seller', true) = '1' then
      return new;
    end if;
    if tg_op = 'UPDATE' and auth.uid() is not null and new.user_id = auth.uid() then
      if old.role = 'seller' and old.seller_team_role = 'staff' then
        -- Allow rejected users to re-submit pending via register_pending_seller (same workspace).
        if old.seller_join_status = 'rejected'
          and new.seller_join_status = 'pending'
          and new.seller_team_role = 'staff'
          and new.role = 'seller'::public.user_role
          and new.seller_workspace_owner_id is not distinct from old.seller_workspace_owner_id
        then
          return new;
        end if;
        if new.role is distinct from old.role
          or new.seller_team_role is distinct from old.seller_team_role
          or new.seller_workspace_owner_id is distinct from old.seller_workspace_owner_id
          or new.seller_join_status is distinct from old.seller_join_status
        then
          raise exception 'Cannot change account status from the app.';
        end if;
      end if;
    end if;
    return new;
  end;
  $$;

  drop trigger if exists profiles_block_staff_priv on public.profiles;
  create trigger profiles_block_staff_priv
  before update on public.profiles
  for each row execute function public.profiles_block_staff_self_privileged_updates();

  -- Platform-controlled secret for approving NEW store-owner self-registration (set in Dashboard → SQL or Table Editor).
  create table if not exists public.system_settings (
    key text primary key,
    value text not null,
    updated_at timestamptz not null default now()
  );

  alter table public.system_settings enable row level security;

  insert into public.system_settings (key, value)
  values ('seller_owner_invite_code', 'CONFIGURE_IN_SUPABASE_SQL_EDITOR')
  on conflict (key) do nothing;

  -- Push notification webhook config (set these in Supabase after deploying the Edge Function).
  insert into public.system_settings (key, value)
  values
    ('push_webhook_url', 'CONFIGURE_HTTPS_ENDPOINT'),
    ('push_webhook_secret', 'CONFIGURE_SECRET'),
    -- Project anon key (JWT) so pg_net can call Edge Functions (gateway requires Authorization: Bearer).
    ('push_function_jwt', 'CONFIGURE_PROJECT_ANON_JWT')
  on conflict (key) do nothing;

  drop function if exists public.system_setting_value(text);

  -- Products
  create table if not exists public.products (
    id uuid primary key default gen_random_uuid(),
    seller_id uuid not null references public.profiles(user_id) on delete cascade,
    category public.product_category not null default 'water',
    name text not null,
    price numeric(12,2) not null check (price >= 0),
    is_available boolean not null default true,
    image_url text,
    sort_order int not null default 0,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );

  -- Backfill/upgrade safety: ensure column exists on older DBs
  alter table public.products
    add column if not exists category public.product_category not null default 'water';

  -- Per-product: seller opts in which SKUs earn loyalty (e.g. 5-gal refill only, not small containers).
  alter table public.products
    add column if not exists earn_loyalty_points boolean not null default false;

  drop trigger if exists products_set_updated_at on public.products;
  create trigger products_set_updated_at
  before update on public.products
  for each row execute function public.set_updated_at();

  create index if not exists products_seller_id_idx on public.products(seller_id);

  -- Orders
  create table if not exists public.orders (
    id uuid primary key default gen_random_uuid(),
    customer_id uuid not null references public.profiles(user_id) on delete restrict,
    seller_id uuid not null references public.profiles(user_id) on delete restrict,
    customer_name text not null,
    delivery_address text not null,
    landmark text,
    contact_number text not null,
    latitude double precision,
    longitude double precision,
    notes text,
    status public.order_status not null default 'pending',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );

  alter table public.orders add column if not exists landmark text;
  alter table public.orders add column if not exists latitude double precision;
  alter table public.orders add column if not exists longitude double precision;

  drop trigger if exists orders_set_updated_at on public.orders;
  create trigger orders_set_updated_at
  before update on public.orders
  for each row execute function public.set_updated_at();

  create index if not exists orders_customer_id_idx on public.orders(customer_id);
  create index if not exists orders_seller_id_idx on public.orders(seller_id);
  create index if not exists orders_status_idx on public.orders(status);

  -- Order items (snapshot unit_price)
  create table if not exists public.order_items (
    id uuid primary key default gen_random_uuid(),
    order_id uuid not null references public.orders(id) on delete cascade,
    product_id uuid references public.products(id) on delete set null,
    product_name text not null,
    unit_price numeric(12,2) not null check (unit_price >= 0),
    quantity int not null check (quantity > 0),
    created_at timestamptz not null default now()
  );

  create index if not exists order_items_order_id_idx on public.order_items(order_id);

  -- Cleanup helper: delete orders older than 1 month (cascades to order_items + notifications.order_id).
  -- NOTE: To make this truly "auto", schedule it daily in Supabase Dashboard → Database → Scheduled jobs
  -- or enable pg_cron and schedule `select public.cleanup_old_orders();`.
  create or replace function public.cleanup_old_orders()
  returns integer
  language plpgsql
  security definer
  set search_path = public
  set row_security = off
  as $$
  declare
    v_n integer;
  begin
    delete from public.orders o
    where o.created_at < (now() - interval '1 month');
    get diagnostics v_n = row_count;
    return v_n;
  end;
  $$;

  revoke all on function public.cleanup_old_orders() from public;
  grant execute on function public.cleanup_old_orders() to service_role;

  -- Create profile row automatically for new auth users
  create or replace function public.handle_new_user()
  returns trigger
  language plpgsql
  security definer
  set search_path = public
  set row_security = off
  as $$
  begin
    insert into public.profiles(user_id, role, display_name)
    values (new.id, 'customer', coalesce(new.raw_user_meta_data->>'display_name', new.email))
    on conflict (user_id) do nothing;
    return new;
  end;
  $$;

  drop trigger if exists on_auth_user_created on auth.users;
  create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

  -- RLS
  alter table public.profiles enable row level security;
  alter table public.products enable row level security;
  alter table public.orders enable row level security;
  alter table public.order_items enable row level security;

  -- Storage (Supabase Storage policies for app uploads)
  -- NOTE: Run these in Supabase SQL editor (Storage schema must exist).
  -- Make bucket public for simple image rendering via getPublicUrl.
  insert into storage.buckets (id, name, public)
  values ('wrs-assets', 'wrs-assets', true)
  on conflict (id) do update set public = true;

  -- Allow anyone to read objects from wrs-assets (public bucket).
  drop policy if exists "wrs-assets public read" on storage.objects;
  create policy "wrs-assets public read"
  on storage.objects for select
  using (bucket_id = 'wrs-assets');

  -- Allow authenticated users to upload/update/delete ONLY their own avatar files.
  -- Path convention used by apps: avatars/customer-<uid>.<ext> and avatars/seller-<uid>.<ext>
  drop policy if exists "wrs-assets avatar insert own" on storage.objects;
  create policy "wrs-assets avatar insert own"
  on storage.objects for insert
  with check (
    bucket_id = 'wrs-assets'
    and auth.role() = 'authenticated'
    and (
      name like ('avatars/customer-' || auth.uid()::text || '.%')
      or name like ('avatars/seller-' || auth.uid()::text || '.%')
    )
  );

  drop policy if exists "wrs-assets avatar update own" on storage.objects;
  create policy "wrs-assets avatar update own"
  on storage.objects for update
  using (
    bucket_id = 'wrs-assets'
    and auth.role() = 'authenticated'
    and (
      name like ('avatars/customer-' || auth.uid()::text || '.%')
      or name like ('avatars/seller-' || auth.uid()::text || '.%')
    )
  )
  with check (
    bucket_id = 'wrs-assets'
    and auth.role() = 'authenticated'
    and (
      name like ('avatars/customer-' || auth.uid()::text || '.%')
      or name like ('avatars/seller-' || auth.uid()::text || '.%')
    )
  );

  drop policy if exists "wrs-assets avatar delete own" on storage.objects;
  create policy "wrs-assets avatar delete own"
  on storage.objects for delete
  using (
    bucket_id = 'wrs-assets'
    and auth.role() = 'authenticated'
    and (
      name like ('avatars/customer-' || auth.uid()::text || '.%')
      or name like ('avatars/seller-' || auth.uid()::text || '.%')
    )
  );

  -- Allow authenticated customers to upload payment proofs under their own folder.
  -- Path convention: payment-proofs/<uid>/<anything>
  drop policy if exists "wrs-assets payment proof insert own" on storage.objects;
  create policy "wrs-assets payment proof insert own"
  on storage.objects for insert
  with check (
    bucket_id = 'wrs-assets'
    and auth.role() = 'authenticated'
    and name like ('payment-proofs/' || auth.uid()::text || '/%')
  );

  drop policy if exists "wrs-assets payment proof update own" on storage.objects;
  create policy "wrs-assets payment proof update own"
  on storage.objects for update
  using (
    bucket_id = 'wrs-assets'
    and auth.role() = 'authenticated'
    and name like ('payment-proofs/' || auth.uid()::text || '/%')
  )
  with check (
    bucket_id = 'wrs-assets'
    and auth.role() = 'authenticated'
    and name like ('payment-proofs/' || auth.uid()::text || '/%')
  );

  drop policy if exists "wrs-assets payment proof delete own" on storage.objects;
  create policy "wrs-assets payment proof delete own"
  on storage.objects for delete
  using (
    bucket_id = 'wrs-assets'
    and auth.role() = 'authenticated'
    and name like ('payment-proofs/' || auth.uid()::text || '/%')
  );

  -- Notifications (in-app inbox for seller/customer)
  create table if not exists public.notifications (
    id uuid primary key default gen_random_uuid(),
    recipient_id uuid not null references public.profiles(user_id) on delete cascade,
    order_id uuid references public.orders(id) on delete cascade,
    kind text not null, -- e.g. 'new_order' | 'order_status'
    title text not null,
    body text not null,
    data jsonb not null default '{}'::jsonb,
    read_at timestamptz,
    created_at timestamptz not null default now()
  );

  create index if not exists notifications_recipient_id_idx on public.notifications(recipient_id, created_at desc);
  create index if not exists notifications_order_id_idx on public.notifications(order_id);

  alter table public.notifications enable row level security;

  drop policy if exists "notifications read own" on public.notifications;
  create policy "notifications read own"
  on public.notifications for select
  using (auth.uid() = recipient_id);

  drop policy if exists "notifications delete own" on public.notifications;
  create policy "notifications delete own"
  on public.notifications for delete
  using (auth.uid() = recipient_id);

  drop policy if exists "notifications update own" on public.notifications;
  create policy "notifications update own"
  on public.notifications for update
  using (auth.uid() = recipient_id)
  with check (auth.uid() = recipient_id);

  -- Push tokens (FCM/APNs device tokens for real push notifications)
  create table if not exists public.push_tokens (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references public.profiles(user_id) on delete cascade,
    app text not null check (app in ('customer', 'seller')),
    platform text not null, -- e.g. 'android' | 'ios'
    token text not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (user_id, app, platform)
  );

  create index if not exists push_tokens_user_id_idx on public.push_tokens(user_id);
  create index if not exists push_tokens_token_idx on public.push_tokens(token);

  alter table public.push_tokens enable row level security;

  drop trigger if exists push_tokens_set_updated_at on public.push_tokens;
  create trigger push_tokens_set_updated_at
  before update on public.push_tokens
  for each row execute function public.set_updated_at();

  drop policy if exists "push_tokens read own" on public.push_tokens;
  create policy "push_tokens read own"
  on public.push_tokens for select
  using (auth.uid() = user_id);

  drop policy if exists "push_tokens upsert own" on public.push_tokens;
  create policy "push_tokens upsert own"
  on public.push_tokens for insert
  with check (auth.uid() = user_id);

  drop policy if exists "push_tokens update own" on public.push_tokens;
  create policy "push_tokens update own"
  on public.push_tokens for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

  drop policy if exists "push_tokens delete own" on public.push_tokens;
  create policy "push_tokens delete own"
  on public.push_tokens for delete
  using (auth.uid() = user_id);

  delete from public.push_tokens
  where id in (
    select id
    from (
      select id,
             row_number() over (
               partition by user_id, app, platform
               order by coalesce(updated_at, created_at) desc, id desc
             ) as rn
      from public.push_tokens
    ) ranked
    where rn > 1
  );

  delete from public.push_tokens
  where id in (
    select id
    from (
      select id,
             row_number() over (
               partition by token, app
               order by coalesce(updated_at, created_at) desc, id desc
             ) as rn
      from public.push_tokens
    ) ranked
    where rn > 1
  );

  create unique index if not exists push_tokens_seller_token_unique
    on public.push_tokens (token)
    where app = 'seller';

  create unique index if not exists push_tokens_customer_token_unique
    on public.push_tokens (token)
    where app = 'customer';

  create table if not exists public.push_deliveries (
    dedupe_key text primary key,
    sent_at timestamptz not null default now()
  );

  create index if not exists push_deliveries_sent_at_idx on public.push_deliveries (sent_at desc);

  alter table public.push_deliveries enable row level security;

  create or replace function public.claim_push_delivery(p_dedupe_key text)
  returns boolean
  language plpgsql
  security definer
  set search_path = public
  set row_security = off
  as $$
  begin
    if p_dedupe_key is null or length(trim(p_dedupe_key)) = 0 then
      return false;
    end if;
    insert into public.push_deliveries (dedupe_key) values (trim(p_dedupe_key));
    return true;
  exception
    when unique_violation then
      return false;
  end;
  $$;

  revoke all on function public.claim_push_delivery(text) from public;
  grant execute on function public.claim_push_delivery(text) to service_role;

  create unique index if not exists notifications_new_order_dedup_idx
    on public.notifications (order_id, recipient_id)
    where kind = 'new_order';

  -- Create notification when customer places an order (seller inbox).
  -- Runs after the first order_items row is inserted so line items exist (client inserts order, then items).
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
    if new.product_id is null and coalesce(new.product_name, '') ilike 'delivery%' then
      return new;
    end if;

    begin
      select * into v_order from public.orders where id = new.order_id;
      if not found then
        return new;
      end if;

      perform pg_advisory_xact_lock(hashtext(v_order.id::text));

      if exists (
        select 1
        from public.notifications n
        where n.order_id = v_order.id
          and n.kind = 'new_order'
          and n.recipient_id = v_order.seller_id
      ) then
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
      )
      on conflict do nothing;

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
        and p.seller_join_status = 'approved'
      on conflict do nothing;
    exception
      when others then
        raise warning 'notify_seller_new_order skipped: %', sqlerrm;
    end;

    return new;
  end;
  $$;

  -- Send real push (FCM/APNs) when a notification row is created.
  -- Uses pg_net to POST to an Edge Function. If not configured, it becomes a no-op.
  create or replace function public.push_on_notification_insert()
  returns trigger
  language plpgsql
  security definer
  set search_path = public
  set row_security = off
  as $$
  declare
    v_url text;
    v_secret text;
    v_jwt text;
    v_target_app text;
    v_token text;
    v_dedupe_key text;
    v_should_send boolean := true;
  begin
    begin
      select value into v_url from public.system_settings where key = 'push_webhook_url';
      select value into v_secret from public.system_settings where key = 'push_webhook_secret';
      select value into v_jwt from public.system_settings where key = 'push_function_jwt';

      if v_url is null or v_url like 'CONFIGURE_%' then
        return new;
      end if;
      if v_secret is null or v_secret like 'CONFIGURE_%' then
        return new;
      end if;
      if v_jwt is null or v_jwt like 'CONFIGURE_%' then
        return new;
      end if;

      v_target_app := case
        when new.kind in ('new_order', 'seller_registration_pending', 'order_activity', 'pending_order_reminder') then 'seller'
        when new.kind in ('order_status', 'seller_reminder', 'loyalty_points') then 'customer'
        else coalesce(new.data->>'app', null)
      end;

      if v_target_app is not null then
        select pt.token
        into v_token
        from public.push_tokens pt
        where pt.user_id = new.recipient_id
          and pt.app = v_target_app
          and pt.platform = 'android'
        order by coalesce(pt.updated_at, pt.created_at) desc
        limit 1;
      end if;

      if v_token is not null and length(trim(v_token)) > 0 then
        if new.order_id is not null and new.kind is not null then
          v_dedupe_key := new.kind || ':' || new.order_id::text || ':' || trim(v_token);
        else
          v_dedupe_key := new.id::text || ':' || trim(v_token);
        end if;

        begin
          v_should_send := public.claim_push_delivery(v_dedupe_key);
        exception
          when others then
            v_should_send := true;
        end;

        if not v_should_send then
          return new;
        end if;
      end if;

      perform net.http_post(
        url := v_url,
        headers := jsonb_build_object(
          'content-type', 'application/json',
          'x-webhook-secret', v_secret,
          'authorization', 'Bearer ' || v_jwt,
          'apikey', v_jwt
        ),
        body := jsonb_build_object(
          'notification_id', new.id,
          'recipient_id', new.recipient_id,
          'order_id', new.order_id,
          'kind', new.kind,
          'title', new.title,
          'body', new.body,
          'data', coalesce(new.data, '{}'::jsonb)
        )
      );
    exception
      when others then
        raise warning 'push_on_notification_insert skipped: %', sqlerrm;
    end;

    return new;
  end;
  $$;

  drop trigger if exists notifications_push_on_insert on public.notifications;
  create trigger notifications_push_on_insert
  after insert on public.notifications
  for each row
  execute function public.push_on_notification_insert();

  drop trigger if exists orders_notify_seller_new_order on public.orders;
  drop trigger if exists order_items_notify_seller_new_order on public.order_items;
  create trigger order_items_notify_seller_new_order
  after insert on public.order_items
  for each row execute function public.notify_seller_new_order();

  -- Create notification when order status changes (customer inbox + seller/admin inbox).
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

  -- E-wallet accounts (seller-managed)
  create table if not exists public.ewallet_accounts (
    id uuid primary key default gen_random_uuid(),
    seller_id uuid not null references public.profiles(user_id) on delete cascade,
    provider text not null,
    account_name text,
    account_number text,
    qr_image_path text,
    is_active boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );

  drop trigger if exists ewallet_accounts_set_updated_at on public.ewallet_accounts;
  create trigger ewallet_accounts_set_updated_at
  before update on public.ewallet_accounts
  for each row execute function public.set_updated_at();

  create index if not exists ewallet_accounts_seller_id_idx on public.ewallet_accounts(seller_id);

  alter table public.ewallet_accounts enable row level security;

  -- Helpers
  -- Business (store) owner user_id for data scoped by orders.seller_id / products.seller_id.
  -- Staff (approved) → workspace owner; owner → self; legacy seller → self; pending/rejected → null.
  create or replace function public.seller_business_id(uid uuid)
  returns uuid
  language sql
  stable
  security definer
  set search_path = public
  set row_security = off
  as $$
    select case
      when p.role <> 'seller' then null::uuid
      when p.seller_team_role = 'staff'
        and p.seller_join_status = 'approved'
        and p.seller_workspace_owner_id is not null
        then p.seller_workspace_owner_id
      when p.seller_team_role = 'owner'
        then p.user_id
      when p.seller_team_role is null
        then p.user_id
      else null::uuid
    end
    from public.profiles p
    where p.user_id = uid;
  $$;

  revoke all on function public.seller_business_id(uuid) from public;
  grant execute on function public.seller_business_id(uuid) to authenticated;
  grant execute on function public.seller_business_id(uuid) to service_role;

  -- Approved seller (owner or approved staff); legacy role=seller without team columns counts as owner.
  create or replace function public.is_seller(uid uuid)
  returns boolean
  language sql
  stable
  security definer
  set search_path = public
  set row_security = off
  as $$
    select exists (
      select 1 from public.profiles p
      where p.user_id = uid
        and p.role = 'seller'
        and (
          p.seller_team_role is null
          or p.seller_team_role = 'owner'
          or (p.seller_team_role = 'staff' and p.seller_join_status = 'approved')
        )
    );
  $$;

  revoke all on function public.is_seller(uuid) from public;
  grant execute on function public.is_seller(uuid) to authenticated;
  grant execute on function public.is_seller(uuid) to service_role;

  -- RLS helper: staff storefront updates must not use a bare subquery on profiles inside a profiles policy
  -- (PostgreSQL reports “infinite recursion detected in policy for relation profiles”).
  create or replace function public.profiles_is_approved_staff_for_workspace_owner(p_owner_user_id uuid)
  returns boolean
  language sql
  stable
  security definer
  set search_path = public
  set row_security = off
  as $$
    select exists (
      select 1 from public.profiles me
      where me.user_id = auth.uid()
        and me.role = 'seller'
        and me.seller_team_role = 'staff'
        and me.seller_join_status = 'approved'
        and me.seller_workspace_owner_id = p_owner_user_id
    );
  $$;

  revoke all on function public.profiles_is_approved_staff_for_workspace_owner(uuid) from public;
  grant execute on function public.profiles_is_approved_staff_for_workspace_owner(uuid) to authenticated;
  grant execute on function public.profiles_is_approved_staff_for_workspace_owner(uuid) to service_role;

  -- Seller app self-registration: applicants call register_pending_seller (pending, assigned to workspace).
  -- Create the store administrator in Supabase Dashboard (Authentication + profiles): role = seller,
  -- seller_team_role = owner, seller_join_status = approved, seller_workspace_owner_id = user_id.
  drop function if exists public.finalize_seller_registration(boolean, text, text);
  drop function if exists public.finalize_seller_registration(boolean, text);

  create or replace function public.register_pending_seller(p_display_name text default null)
  returns jsonb
  language plpgsql
  security definer
  set search_path = public
  set row_security = off
  as $$
  declare
    v_uid uuid := auth.uid();
    v_owner uuid;
    v_email text;
    v_name text;
    v_role public.user_role;
    v_team text;
    v_status text;
    v_n int;
  begin
    if v_uid is null then
      raise exception 'Not authenticated';
    end if;

    -- Tell triggers this UPDATE is from the controlled registration RPC.
    perform set_config('app.register_pending_seller', '1', true);

    -- Best-effort: email may be inaccessible in some environments; do not fail the registration.
    begin
      select email into v_email from auth.users where id = v_uid;
    exception
      when others then
        v_email := null;
    end;

    select p.role, p.seller_team_role, p.seller_join_status, p.display_name
    into v_role, v_team, v_status, v_name
    from public.profiles p
    where p.user_id = v_uid;

    if not found then
      -- Some environments can race: auth user exists but profile trigger hasn't inserted yet.
      -- Create a minimal profile row and continue.
      insert into public.profiles(user_id, role, display_name)
      values (v_uid, 'customer', coalesce(nullif(trim(p_display_name), ''), split_part(coalesce(v_email, ''), '@', 1)))
      on conflict (user_id) do nothing;

      select p.role, p.seller_team_role, p.seller_join_status, p.display_name
      into v_role, v_team, v_status, v_name
      from public.profiles p
      where p.user_id = v_uid;

      if not found then
        raise exception 'PROFILE_MISSING: Could not create profile row for this account.';
      end if;
    end if;

    if v_role = 'seller' and v_team = 'staff' and v_status = 'pending' then
      return jsonb_build_object('ok', true, 'already', 'pending');
    end if;

    if v_role = 'seller' and v_team = 'staff' and v_status = 'approved' then
      raise exception 'REGISTRATION_ALREADY_APPROVED: Your account is already active.';
    end if;

    if v_role = 'seller' and v_team = 'owner' then
      return jsonb_build_object('ok', true, 'owner', true, 'approved', true);
    end if;

    -- Normalize legacy/partial seller rows (e.g. role='seller' but team/status not set yet).
    if v_role = 'seller' and (v_team is null or length(trim(coalesce(v_team, ''))) = 0) then
      v_team := 'owner';
      v_status := 'approved';
    end if;

    if not (
      v_role = 'customer'
      or (v_role = 'seller' and v_team = 'staff' and v_status = 'rejected')
      or (v_role = 'seller' and v_team = 'owner')
    ) then
      return jsonb_build_object('ok', false, 'error', 'REGISTRATION_STATE_INVALID', 'message', 'Account state is invalid. Contact support.');
    end if;

    select o.user_id
    into v_owner
    from public.profiles o
    where o.role = 'seller'
      and o.seller_team_role = 'owner'
      and coalesce(o.seller_join_status, 'approved') = 'approved'
    order by o.created_at desc
    limit 1;

    if v_owner is null then
      -- First ever seller registration becomes the workspace owner (auto-approved).
      v_name := coalesce(nullif(trim(p_display_name), ''), nullif(trim(coalesce(v_name, '')), ''), split_part(coalesce(v_email, ''), '@', 1));

      begin
        update public.profiles p
        set
          role = 'seller',
          seller_team_role = 'owner',
          seller_join_status = 'approved',
          seller_workspace_owner_id = v_uid,
          display_name = coalesce(nullif(trim(p_display_name), ''), p.display_name)
        where p.user_id = v_uid;

        get diagnostics v_n = row_count;
        if v_n <> 1 then
          raise exception 'PROFILE_UPDATE_FAILED: Could not update your profile.';
        end if;

        return jsonb_build_object('ok', true, 'owner', true, 'approved', true, 'first_owner', true);
      exception
        when unique_violation then
          -- Another owner already exists (or concurrent first-owner race). Fall back to pending staff registration.
          select o.user_id
          into v_owner
          from public.profiles o
          where o.role = 'seller'
            and o.seller_team_role = 'owner'
            and coalesce(o.seller_join_status, 'approved') = 'approved'
          order by o.created_at desc
          limit 1;
          if v_owner is null then
            return jsonb_build_object('ok', false, 'error', 'OWNER_LOOKUP_FAILED', 'message', 'Could not find store administrator.');
          end if;
      end;
    end if;

    v_name := coalesce(nullif(trim(p_display_name), ''), nullif(trim(coalesce(v_name, '')), ''), split_part(coalesce(v_email, ''), '@', 1));

    update public.profiles p
    set
      role = 'seller',
      seller_team_role = 'staff',
      seller_join_status = 'pending',
      seller_workspace_owner_id = v_owner,
      display_name = coalesce(nullif(trim(p_display_name), ''), p.display_name)
    where p.user_id = v_uid;

    get diagnostics v_n = row_count;
    if v_n <> 1 then
      raise exception 'PROFILE_UPDATE_FAILED: Could not update your profile.';
    end if;

    insert into public.notifications (recipient_id, order_id, kind, title, body, data)
    values (
      v_owner,
      null,
      'seller_registration_pending',
      'New registration request',
      coalesce(v_name, 'Someone') || ' asked to join your workspace'
        || case when v_email is not null and length(trim(v_email)) > 0 then ' · ' || v_email else '' end,
      jsonb_build_object('pending_user_id', v_uid, 'kind', 'seller_registration_pending', 'app', 'seller')
    );

    return jsonb_build_object('ok', true, 'pending', true);
  end;
  $$;

  revoke all on function public.register_pending_seller(text) from public;
  grant execute on function public.register_pending_seller(text) to authenticated;
  grant execute on function public.register_pending_seller(text) to service_role;

  create or replace function public.owner_list_workspace_staff()
  returns jsonb
  language plpgsql
  security definer
  set search_path = public
  set row_security = off
  as $$
  declare
    v_owner uuid := auth.uid();
    v_business uuid := public.seller_business_id(v_owner);
  begin
    if v_owner is null then
      raise exception 'Not authenticated';
    end if;
    if v_business is null or v_business is distinct from v_owner then
      raise exception 'Only the store administrator can view staff';
    end if;

    return coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'user_id', p.user_id,
            'display_name', p.display_name,
            'phone', p.phone,
            'email', u.email,
            'seller_join_status', p.seller_join_status,
            'created_at', p.created_at
          )
          order by p.created_at desc
        )
        from public.profiles p
        left join auth.users u on u.id = p.user_id
        where p.seller_workspace_owner_id = v_owner
          and p.seller_team_role = 'staff'
      ),
      '[]'::jsonb
    );
  end;
  $$;

  revoke all on function public.owner_list_workspace_staff() from public;
  grant execute on function public.owner_list_workspace_staff() to authenticated;
  grant execute on function public.owner_list_workspace_staff() to service_role;

  -- Store owner removes a staff account from their workspace.
  -- Tries hard-delete (profile + auth user). If blocked by FK history (e.g., orders), falls back to disabling access.
  create or replace function public.owner_delete_staff_account(p_staff_user_id uuid)
  returns jsonb
  language plpgsql
  security definer
  set search_path = public
  set row_security = off
  as $$
  declare
    v_owner uuid := auth.uid();
    v_business uuid := public.seller_business_id(v_owner);
    v_ok boolean;
    v_rows int;
  begin
    if v_owner is null then
      raise exception 'Not authenticated';
    end if;
    if v_business is null or v_business <> v_owner then
      raise exception 'Only the store administrator can remove accounts';
    end if;
    if p_staff_user_id is null then
      raise exception 'Missing staff user id';
    end if;
    if p_staff_user_id = v_owner then
      raise exception 'Cannot delete the owner account';
    end if;

    -- Must be staff under this owner workspace.
    if not exists (
      select 1
      from public.profiles p
      where p.user_id = p_staff_user_id
        and p.role = 'seller'
        and p.seller_team_role = 'staff'
        and p.seller_workspace_owner_id = v_owner
    ) then
      return jsonb_build_object('ok', false, 'error', 'NOT_IN_WORKSPACE', 'message', 'Account not found in your workspace.');
    end if;

    -- Attempt hard delete.
    begin
      delete from public.profiles where user_id = p_staff_user_id;
      delete from auth.users where id = p_staff_user_id;
      return jsonb_build_object('ok', true, 'deleted', true);
    exception
      when others then
        -- Fall back: block access and detach from workspace (so it disappears from manage list).
        update public.profiles
        set
          seller_join_status = 'rejected',
          seller_workspace_owner_id = null
        where user_id = p_staff_user_id;
        get diagnostics v_rows = row_count;
        v_ok := (v_rows = 1);
        return jsonb_build_object(
          'ok', true,
          'deleted', false,
          'disabled', v_ok,
          'message', 'Account has history and cannot be deleted. Access removed instead.'
        );
    end;
  end;
  $$;

  revoke all on function public.owner_delete_staff_account(uuid) from public;
  grant execute on function public.owner_delete_staff_account(uuid) to authenticated;
  grant execute on function public.owner_delete_staff_account(uuid) to service_role;

  -- Approve / reject staff (owner only). Uses SECURITY DEFINER so PostgREST does not hit RLS/RETURNING edge cases on profiles PATCH.
  create or replace function public.owner_set_staff_join_status(p_staff_user_id uuid, p_status text)
  returns jsonb
  language plpgsql
  security definer
  set search_path = public
  set row_security = off
  as $$
  declare
    v_owner uuid := auth.uid();
    v_business uuid := public.seller_business_id(v_owner);
    v_rows int;
  begin
    if v_owner is null then
      raise exception 'Not authenticated';
    end if;
    if v_business is null or v_business is distinct from v_owner then
      raise exception 'Only the store administrator can approve or reject staff';
    end if;
    if p_staff_user_id is null then
      raise exception 'Missing staff user id';
    end if;
    if p_staff_user_id = v_owner then
      raise exception 'Cannot change approval for the owner account';
    end if;
    if p_status is null or lower(trim(p_status)) not in ('approved', 'rejected') then
      raise exception 'Invalid status';
    end if;

    if lower(trim(p_status)) = 'rejected' then
      return public.owner_delete_staff_account(p_staff_user_id);
    end if;

    update public.profiles p
    set seller_join_status = 'approved'
    where p.user_id = p_staff_user_id
      and p.role = 'seller'
      and p.seller_team_role = 'staff'
      and p.seller_workspace_owner_id = v_owner;

    get diagnostics v_rows = row_count;
    if v_rows <> 1 then
      raise exception 'Staff member not found or not in your workspace';
    end if;

    return jsonb_build_object('ok', true, 'status', 'approved');
  end;
  $$;

  revoke all on function public.owner_set_staff_join_status(uuid, text) from public;
  grant execute on function public.owner_set_staff_join_status(uuid, text) to authenticated;
  grant execute on function public.owner_set_staff_join_status(uuid, text) to service_role;

  -- Seller taps "Remind" on customer profile: insert notification for customer (Realtime → local push in app)
  create or replace function public.seller_send_customer_reminder(p_customer_id uuid)
  returns void
  language plpgsql
  security definer
  set search_path = public
  set row_security = off
  as $$
  declare
    v_seller_id uuid := public.seller_business_id(auth.uid());
    v_last timestamptz;
    v_days int;
    v_title text := 'Time to refill?';
    v_body text;
    v_seller_name text;
  begin
    if v_seller_id is null then
      raise exception 'Not authenticated';
    end if;
    if not public.is_seller(auth.uid()) then
      raise exception 'Only sellers can send reminders';
    end if;
    if v_seller_id is null then
      raise exception 'Seller workspace not available';
    end if;
    if not exists (
      select 1 from public.orders o
      where o.seller_id = v_seller_id and o.customer_id = p_customer_id
    ) then
      raise exception 'No orders with this customer yet';
    end if;

    select max(o.created_at) into v_last
    from public.orders o
    where o.seller_id = v_seller_id and o.customer_id = p_customer_id;

    -- Customer-facing copy should show the business name, not the owner’s personal display_name.
    select coalesce(nullif(trim(p.store_name), ''), nullif(trim(p.display_name), ''), 'Your store')
    into v_seller_name
    from public.profiles p
    where p.user_id = v_seller_id;

    if v_seller_name is null then
      raise exception 'Seller workspace not found';
    end if;

    if v_last is null then
      v_body := coalesce(v_seller_name, 'Your store') || ' sent you a reminder to order or refill your water.';
    else
      v_days := greatest(0, floor(extract(epoch from (now() - v_last)) / 86400)::int);
      if v_days = 0 then
        v_body := 'Your last order was today. Order or refill your water when you need to—Just a reminder from ' || coalesce(v_seller_name, 'your store') || '.';
      elsif v_days = 1 then
        v_body := 'Your last order was 1 day ago. You should order or refill your water—Just a reminder from ' || coalesce(v_seller_name, 'your store') || '.';
      else
        v_body := 'Your last order was ' || v_days::text || ' days ago. You should order or refill your water—Just a reminder from ' || coalesce(v_seller_name, 'your store') || '.';
      end if;
    end if;

    insert into public.notifications(recipient_id, order_id, kind, title, body, data)
    values (
      p_customer_id,
      null,
      'seller_reminder',
      v_title,
      v_body,
      jsonb_build_object(
        'kind', 'seller_reminder',
        'app', 'customer',
        'sellerId', v_seller_id,
        'lastOrderAt', v_last,
        'daysSince', case when v_last is null then null else v_days end
      )
    );
  end;
  $$;

  revoke all on function public.seller_send_customer_reminder(uuid) from public;
  grant execute on function public.seller_send_customer_reminder(uuid) to authenticated;
  grant execute on function public.seller_send_customer_reminder(uuid) to service_role;

  -- Seller marks utang order as paid (definer; reliable vs direct client updates under RLS)
  create or replace function public.seller_mark_order_utang_paid(p_order_id uuid)
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
    set payment_settled = true
    where o.id = p_order_id
      and o.seller_id = v_business
      and lower(coalesce(o.payment_method, '')) = 'utang';
    get diagnostics v_n = row_count;
    if v_n = 0 then
      raise exception 'Order not found, not utang, or not yours';
    end if;
  end;
  $$;

  revoke all on function public.seller_mark_order_utang_paid(uuid) from public;
  grant execute on function public.seller_mark_order_utang_paid(uuid) to authenticated;
  grant execute on function public.seller_mark_order_utang_paid(uuid) to service_role;

  -- Seller marks any order paid (COD, GCash, Maya, utang)
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

  -- profiles policies
  drop policy if exists "profiles read own" on public.profiles;
  create policy "profiles read own"
  on public.profiles for select
  using (auth.uid() = user_id);

  drop policy if exists "profiles public read sellers" on public.profiles;
  create policy "profiles public read sellers"
  on public.profiles for select
  using (
    role = 'seller'
    and coalesce(seller_join_status, 'approved') = 'approved'
  );

  -- Approved sellers read the business (store owner) profile row — e.g. staff loading store name / logo.
  drop policy if exists "profiles seller read business owner row" on public.profiles;
  create policy "profiles seller read business owner row"
  on public.profiles for select
  using (
    public.is_seller(auth.uid())
    and user_id = public.seller_business_id(auth.uid())
  );

  -- Store owner reads staff profiles under their workspace (pending / approved / rejected).
  drop policy if exists "profiles owner read staff" on public.profiles;
  create policy "profiles owner read staff"
  on public.profiles for select
  using (
    seller_team_role = 'staff'
    and seller_workspace_owner_id = auth.uid()
    -- Same as “caller is the workspace owner”, without a subquery on profiles (avoids RLS recursion).
    and auth.uid() = public.seller_business_id(auth.uid())
  );

  -- Allow approved sellers to list all customer profiles (single-station app; needed for Customers tab even before first order).
  drop policy if exists "profiles seller read all customers" on public.profiles;
  create policy "profiles seller read all customers"
  on public.profiles for select
  using (
    role = 'customer'
    and public.is_seller(auth.uid())
  );

  -- Ensure there is only ONE approved owner ("master admin") in the whole system.
  -- Pending/rejected owners are not allowed from the app flow, but this also prevents accidental duplicates in the Dashboard.
  create unique index if not exists profiles_single_approved_owner_idx
  on public.profiles (seller_team_role)
  where role = 'seller'
    and seller_team_role = 'owner'
    and coalesce(seller_join_status, 'approved') = 'approved';

  -- Store owner approves or declines staff (join status only — keep team + workspace stable).
  drop policy if exists "profiles owner update staff join" on public.profiles;
  create policy "profiles owner update staff join"
  on public.profiles for update
  using (
    seller_team_role = 'staff'
    and seller_workspace_owner_id = auth.uid()
    and auth.uid() = public.seller_business_id(auth.uid())
  )
  with check (
    seller_team_role = 'staff'
    and seller_workspace_owner_id = auth.uid()
  );

  -- Allow sellers to read profile info of customers who ordered from them.
  drop policy if exists "profiles seller read customers via orders" on public.profiles;
  create policy "profiles seller read customers via orders"
  on public.profiles for select 
  using (
    role = 'customer'
    and public.is_seller(auth.uid())
    and exists (
      select 1 from public.orders o
      where o.customer_id = user_id
        and o.seller_id = public.seller_business_id(auth.uid())
    )
  );

  drop policy if exists "profiles update own" on public.profiles;
  create policy "profiles update own"
  on public.profiles for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

  -- Approved staff may update the workspace owner's public storefront fields (same store; not their own row).
  drop policy if exists "profiles staff update owner storefront" on public.profiles;
  create policy "profiles staff update owner storefront"
  on public.profiles for update
  using (
    user_id = public.seller_business_id(auth.uid())
    and auth.uid() is distinct from user_id
    and public.profiles_is_approved_staff_for_workspace_owner(user_id)
  )
  with check (
    user_id = public.seller_business_id(auth.uid())
    and role = 'seller'::public.user_role
    and seller_team_role = 'owner'
    and coalesce(seller_join_status, 'approved') = 'approved'
  );

  -- products policies (seller-only)
  drop policy if exists "products public read available" on public.products;
  create policy "products public read available"
  on public.products for select
  using (is_available = true);

  drop policy if exists "products seller read own" on public.products;
  create policy "products seller read own"
  on public.products for select
  using (public.seller_business_id(auth.uid()) = seller_id);

  drop policy if exists "products seller insert" on public.products;
  create policy "products seller insert"
  on public.products for insert
  with check (public.seller_business_id(auth.uid()) = seller_id and public.is_seller(auth.uid()));

  drop policy if exists "products seller update" on public.products;
  create policy "products seller update"
  on public.products for update
  using (public.seller_business_id(auth.uid()) = seller_id and public.is_seller(auth.uid()))
  with check (public.seller_business_id(auth.uid()) = seller_id and public.is_seller(auth.uid()));

  drop policy if exists "products seller delete" on public.products;
  create policy "products seller delete"
  on public.products for delete
  using (public.seller_business_id(auth.uid()) = seller_id and public.is_seller(auth.uid()));

  -- orders policies
  drop policy if exists "orders customer read own" on public.orders;
  create policy "orders customer read own"
  on public.orders for select
  using (auth.uid() = customer_id);

  drop policy if exists "orders seller read own" on public.orders;
  create policy "orders seller read own"
  on public.orders for select
  using (public.seller_business_id(auth.uid()) = seller_id and public.is_seller(auth.uid()));

  drop policy if exists "orders customer insert own" on public.orders;
  create policy "orders customer insert own"
  on public.orders for insert
  with check (
    auth.uid() = customer_id
  );

  drop policy if exists "orders seller update status" on public.orders;
  create policy "orders seller update status"
  on public.orders for update
  using (public.seller_business_id(auth.uid()) = seller_id and public.is_seller(auth.uid()))
  with check (public.seller_business_id(auth.uid()) = seller_id and public.is_seller(auth.uid()));

  -- order_items policies
  drop policy if exists "order_items customer read via order" on public.order_items;
  create policy "order_items customer read via order"
  on public.order_items for select
  using (
    exists (select 1 from public.orders o where o.id = order_id and o.customer_id = auth.uid())
  );

  drop policy if exists "order_items seller read via order" on public.order_items;
  create policy "order_items seller read via order"
  on public.order_items for select
  using (
    exists (
      select 1 from public.orders o
      where o.id = order_id
        and o.seller_id = public.seller_business_id(auth.uid())
    )
  );

  drop policy if exists "order_items customer insert via order" on public.order_items;
  create policy "order_items customer insert via order"
  on public.order_items for insert
  with check (
    exists (select 1 from public.orders o where o.id = order_id and o.customer_id = auth.uid())
  );

  -- ewallet_accounts policies (seller-only)
  drop policy if exists "ewallet_accounts seller read own" on public.ewallet_accounts;
  create policy "ewallet_accounts seller read own"
  on public.ewallet_accounts for select
  using (public.seller_business_id(auth.uid()) = seller_id and public.is_seller(auth.uid()));

  drop policy if exists "ewallet_accounts seller insert" on public.ewallet_accounts;
  create policy "ewallet_accounts seller insert"
  on public.ewallet_accounts for insert
  with check (public.seller_business_id(auth.uid()) = seller_id and public.is_seller(auth.uid()));

  drop policy if exists "ewallet_accounts seller update" on public.ewallet_accounts;
  create policy "ewallet_accounts seller update"
  on public.ewallet_accounts for update
  using (public.seller_business_id(auth.uid()) = seller_id and public.is_seller(auth.uid()))
  with check (public.seller_business_id(auth.uid()) = seller_id and public.is_seller(auth.uid()));

  drop policy if exists "ewallet_accounts seller delete" on public.ewallet_accounts;
  create policy "ewallet_accounts seller delete"
  on public.ewallet_accounts for delete
  using (public.seller_business_id(auth.uid()) = seller_id and public.is_seller(auth.uid()));

  -- Walk-in POS (separate from online orders; used in sales reports)
  create table if not exists public.pos_sales (
    id uuid primary key default gen_random_uuid(),
    seller_id uuid not null references public.profiles(user_id) on delete cascade,
    customer_name text,
    payment_method text not null default 'cash',
    payment_settled boolean not null default true,
    payment_settled_at timestamptz,
    cash_received numeric(12,2),
    change_due numeric(12,2),
    created_at timestamptz not null default now()
  );

  alter table public.pos_sales add column if not exists customer_name text;
  alter table public.pos_sales add column if not exists payment_method text not null default 'cash';
  alter table public.pos_sales add column if not exists payment_settled boolean not null default true;
  alter table public.pos_sales add column if not exists payment_settled_at timestamptz;
  alter table public.pos_sales add column if not exists cash_received numeric(12,2);
  alter table public.pos_sales add column if not exists change_due numeric(12,2);

  alter table public.pos_sales drop constraint if exists pos_sales_payment_method_check;
  alter table public.pos_sales add constraint pos_sales_payment_method_check
    check (payment_method in ('cash', 'gcash'));

  create index if not exists pos_sales_seller_id_created_idx on public.pos_sales(seller_id, created_at desc);
  create index if not exists pos_sales_seller_customer_name_idx
    on public.pos_sales (seller_id, lower(trim(customer_name)))
    where customer_name is not null and trim(customer_name) <> '';

  create table if not exists public.pos_sale_items (
    id uuid primary key default gen_random_uuid(),
    pos_sale_id uuid not null references public.pos_sales(id) on delete cascade,
    product_id uuid references public.products(id) on delete set null,
    product_name text not null,
    unit_price numeric(12,2) not null check (unit_price >= 0),
    quantity int not null check (quantity > 0),
    created_at timestamptz not null default now()
  );

  create index if not exists pos_sale_items_sale_id_idx on public.pos_sale_items(pos_sale_id);

  alter table public.pos_sales enable row level security;
  alter table public.pos_sale_items enable row level security;

  drop policy if exists "pos_sales seller read own" on public.pos_sales;
  create policy "pos_sales seller read own"
  on public.pos_sales for select
  using (public.seller_business_id(auth.uid()) = seller_id and public.is_seller(auth.uid()));

  drop policy if exists "pos_sales seller insert" on public.pos_sales;
  create policy "pos_sales seller insert"
  on public.pos_sales for insert
  with check (public.seller_business_id(auth.uid()) = seller_id and public.is_seller(auth.uid()));

  drop policy if exists "pos_sales seller update own" on public.pos_sales;
  create policy "pos_sales seller update own"
  on public.pos_sales for update
  using (public.seller_business_id(auth.uid()) = seller_id and public.is_seller(auth.uid()))
  with check (public.seller_business_id(auth.uid()) = seller_id and public.is_seller(auth.uid()));

  drop policy if exists "pos_sale_items seller read own" on public.pos_sale_items;
  create policy "pos_sale_items seller read own"
  on public.pos_sale_items for select
  using (
    exists (
      select 1 from public.pos_sales ps
      where ps.id = pos_sale_id
        and ps.seller_id = public.seller_business_id(auth.uid())
    )
  );

  drop policy if exists "pos_sale_items seller insert own" on public.pos_sale_items;
  create policy "pos_sale_items seller insert own"
  on public.pos_sale_items for insert
  with check (
    exists (
      select 1 from public.pos_sales ps
      where ps.id = pos_sale_id
        and ps.seller_id = public.seller_business_id(auth.uid())
        and public.is_seller(auth.uid())
    )
  );

  -- Business expenses (admin web — store owner only)
  do $exp_enum$
  begin
    if not exists (select 1 from pg_type where typname = 'business_expense_type') then
      create type public.business_expense_type as enum (
        'water_bill',
        'electric_bill',
        'salaries_wages',
        'gas_allowance',
        'foods',
        'others'
      );
    end if;
  end $exp_enum$;

  do $exp_gas$
  begin
    if not exists (
      select 1 from pg_enum e
      join pg_type t on e.enumtypid = t.oid
      where t.typname = 'business_expense_type' and e.enumlabel = 'gas_allowance'
    ) then
      alter type public.business_expense_type add value 'gas_allowance';
    end if;
  end $exp_gas$;

  create table if not exists public.business_expenses (
    id uuid primary key default gen_random_uuid(),
    seller_id uuid not null references public.profiles(user_id) on delete cascade,
    business_unit text not null default 'wrs' check (business_unit in ('wrs', 'laundry')),
    expense_type public.business_expense_type not null,
    others_label text,
    amount numeric(12, 2) not null check (amount > 0),
    expense_date date not null default (timezone('utc', now()))::date,
    notes text,
    created_at timestamptz not null default now()
  );

  alter table public.business_expenses
    add column if not exists business_unit text not null default 'wrs'
    check (business_unit in ('wrs', 'laundry'));

  create index if not exists business_expenses_seller_date_idx
    on public.business_expenses (seller_id, expense_date desc);

  create index if not exists business_expenses_seller_unit_date_idx
    on public.business_expenses (seller_id, business_unit, expense_date desc);

  alter table public.business_expenses enable row level security;

  drop policy if exists "business_expenses owner read" on public.business_expenses;
  create policy "business_expenses owner read"
  on public.business_expenses for select
  using (
    seller_id = auth.uid()
    and exists (
      select 1 from public.profiles p
      where p.user_id = auth.uid()
        and p.role = 'seller'
        and coalesce(p.seller_team_role, 'owner') = 'owner'
    )
  );

  drop policy if exists "business_expenses owner insert" on public.business_expenses;
  create policy "business_expenses owner insert"
  on public.business_expenses for insert
  with check (
    seller_id = auth.uid()
    and exists (
      select 1 from public.profiles p
      where p.user_id = auth.uid()
        and p.role = 'seller'
        and coalesce(p.seller_team_role, 'owner') = 'owner'
    )
  );

  drop policy if exists "business_expenses owner update" on public.business_expenses;
  create policy "business_expenses owner update"
  on public.business_expenses for update
  using (
    seller_id = auth.uid()
    and exists (
      select 1 from public.profiles p
      where p.user_id = auth.uid()
        and p.role = 'seller'
        and coalesce(p.seller_team_role, 'owner') = 'owner'
    )
  )
  with check (seller_id = auth.uid());

  drop policy if exists "business_expenses owner delete" on public.business_expenses;
  create policy "business_expenses owner delete"
  on public.business_expenses for delete
  using (
    seller_id = auth.uid()
    and exists (
      select 1 from public.profiles p
      where p.user_id = auth.uid()
        and p.role = 'seller'
        and coalesce(p.seller_team_role, 'owner') = 'owner'
    )
  );

  -- Notes:
  -- - To make someone a seller, set their profile role to 'seller' in SQL editor:
  --   update public.profiles set role='seller' where user_id = '<uuid>';
  -- - Realtime: enable Realtime on tables in Supabase Dashboard if needed (Database -> Replication).

  -- ---------------------------------------------------------------------------
  -- E-wallet: one row per seller per provider + customer checkout payment method
  -- ---------------------------------------------------------------------------

  -- Remove duplicate e-wallet rows (keep newest by updated_at).
  delete from public.ewallet_accounts e
  using (
    select id
    from (
      select
        id,
        row_number() over (
          partition by seller_id, provider
          order by updated_at desc nulls last, created_at desc nulls last
        ) as rn
      from public.ewallet_accounts
    ) x
    where x.rn > 1
  ) d
  where e.id = d.id;

  create unique index if not exists ewallet_accounts_seller_provider_uidx
    on public.ewallet_accounts (seller_id, provider);

  alter table public.orders add column if not exists payment_method text not null default 'cod';

  alter table public.orders drop constraint if exists orders_payment_method_check;
  alter table public.orders add constraint orders_payment_method_check
    check (payment_method in ('cod', 'gcash', 'maya', 'utang'));

  alter table public.orders add column if not exists payment_due_date date;

  -- Payment proof (for GCash / Maya)
  alter table public.orders add column if not exists payment_reference text;
  alter table public.orders add column if not exists payment_proof_path text;
  alter table public.orders add column if not exists credit_note text;
  -- New orders start unpaid; seller marks paid when payment is received.
  alter table public.orders add column if not exists payment_settled boolean not null default false;
  alter table public.orders alter column payment_settled set default false;
  alter table public.orders add column if not exists payment_settled_at timestamptz;

  -- Customers can read active payment details only via this RPC (scoped by seller).
  create or replace function public.get_seller_payment_wallets(p_seller_id uuid)
  returns jsonb
  language sql
  security definer
  set search_path = public
  set row_security = off
  stable
  as $$
    select coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'provider', s.provider,
            'account_name', s.account_name,
            'account_number', s.account_number,
            'qr_image_path', s.qr_image_path
          )
        )
        from (
          select ea.provider, ea.account_name, ea.account_number, ea.qr_image_path
          from public.ewallet_accounts ea
          where ea.seller_id = p_seller_id
            and ea.is_active = true
            and ea.provider in ('GCash', 'Maya')
          order by ea.provider
        ) s
      ),
      '[]'::jsonb
    );
  $$;

  grant execute on function public.get_seller_payment_wallets(uuid) to authenticated;
  grant execute on function public.get_seller_payment_wallets(uuid) to anon;

  -- ---------------------------------------------------------------------------
  -- Loyalty (online orders only): water container qty = points; utang = no points;
  -- 10 points → voucher (1 free refill), code expires 3 days after redeem.
  -- ---------------------------------------------------------------------------

  create table if not exists public.loyalty_balances (
    customer_id uuid not null references public.profiles(user_id) on delete cascade,
    seller_id uuid not null references public.profiles(user_id) on delete cascade,
    points_balance int not null default 0 check (points_balance >= 0),
    updated_at timestamptz not null default now(),
    primary key (customer_id, seller_id)
  );

  create index if not exists loyalty_balances_seller_idx on public.loyalty_balances(seller_id);

  create table if not exists public.order_loyalty_awards (
    order_id uuid primary key references public.orders(id) on delete cascade,
    customer_id uuid not null references public.profiles(user_id) on delete cascade,
    seller_id uuid not null references public.profiles(user_id) on delete cascade,
    points_awarded int not null check (points_awarded >= 0),
    created_at timestamptz not null default now()
  );

  create index if not exists order_loyalty_awards_customer_idx on public.order_loyalty_awards(customer_id);

  do $$ begin
    create type public.loyalty_voucher_status as enum ('active', 'used', 'expired');
  exception when duplicate_object then null; end $$;

  create table if not exists public.loyalty_vouchers (
    id uuid primary key default gen_random_uuid(),
    customer_id uuid not null references public.profiles(user_id) on delete cascade,
    seller_id uuid not null references public.profiles(user_id) on delete cascade,
    code text not null,
    status public.loyalty_voucher_status not null default 'active',
    points_spent int not null default 10 check (points_spent > 0),
    issued_at timestamptz not null default now(),
    expires_at timestamptz not null,
    used_at timestamptz,
    constraint loyalty_vouchers_code_len check (char_length(trim(code)) >= 6)
  );

  create unique index if not exists loyalty_vouchers_code_uidx on public.loyalty_vouchers (upper(trim(code)));

  create index if not exists loyalty_vouchers_customer_idx on public.loyalty_vouchers(customer_id, issued_at desc);
  create index if not exists loyalty_vouchers_seller_idx on public.loyalty_vouchers(seller_id, issued_at desc);

  alter table public.loyalty_balances enable row level security;
  alter table public.order_loyalty_awards enable row level security;
  alter table public.loyalty_vouchers enable row level security;

  drop policy if exists "loyalty_balances customer read own" on public.loyalty_balances;
  create policy "loyalty_balances customer read own"
  on public.loyalty_balances for select
  using (auth.uid() = customer_id);

  drop policy if exists "loyalty_balances seller read store customers" on public.loyalty_balances;
  create policy "loyalty_balances seller read store customers"
  on public.loyalty_balances for select
  using (
    public.is_seller(auth.uid())
    and seller_id = public.seller_business_id(auth.uid())
  );

  drop policy if exists "order_loyalty_awards customer read own" on public.order_loyalty_awards;
  create policy "order_loyalty_awards customer read own"
  on public.order_loyalty_awards for select
  using (auth.uid() = customer_id);

  drop policy if exists "order_loyalty_awards seller read store" on public.order_loyalty_awards;
  create policy "order_loyalty_awards seller read store"
  on public.order_loyalty_awards for select
  using (
    public.is_seller(auth.uid())
    and seller_id = public.seller_business_id(auth.uid())
  );

  drop policy if exists "loyalty_vouchers customer read own" on public.loyalty_vouchers;
  create policy "loyalty_vouchers customer read own"
  on public.loyalty_vouchers for select
  using (auth.uid() = customer_id);

  drop policy if exists "loyalty_vouchers seller read store" on public.loyalty_vouchers;
  create policy "loyalty_vouchers seller read store"
  on public.loyalty_vouchers for select
  using (
    public.is_seller(auth.uid())
    and seller_id = public.seller_business_id(auth.uid())
  );

  create or replace function public.apply_order_loyalty_on_delivered()
  returns trigger
  language plpgsql
  security definer
  set search_path = public
  set row_security = off
  as $$
  declare
    v_pts int;
    v_body text;
  begin
    if new.status is distinct from 'delivered' then
      return new;
    end if;
    if old.status = 'delivered' then
      return new;
    end if;
    if lower(coalesce(new.payment_method, '')) = 'utang' then
      return new;
    end if;
    if exists (select 1 from public.order_loyalty_awards ola where ola.order_id = new.id) then
      return new;
    end if;

    -- 1 point per unit quantity for delivered lines whose product has earn_loyalty_points enabled (seller-controlled).
    select coalesce(sum(oi.quantity), 0)::int into v_pts
    from public.order_items oi
    join public.products pr on pr.id = oi.product_id
    where oi.order_id = new.id
      and pr.earn_loyalty_points = true;

    if v_pts <= 0 then
      return new;
    end if;

    insert into public.order_loyalty_awards (order_id, customer_id, seller_id, points_awarded)
    values (new.id, new.customer_id, new.seller_id, v_pts);

    if v_pts > 0 then
      insert into public.loyalty_balances (customer_id, seller_id, points_balance, updated_at)
      values (new.customer_id, new.seller_id, v_pts, now())
      on conflict (customer_id, seller_id) do update
      set
        points_balance = public.loyalty_balances.points_balance + v_pts,
        updated_at = now();

      if v_pts = 1 then
        v_body := 'You earned 1 loyalty point for eligible items in your delivered order. Online orders only — not walk-in POS.';
      else
        v_body := 'You earned ' || v_pts::text
          || ' loyalty points for eligible items in your delivered order. Online orders only — not walk-in POS.';
      end if;

      insert into public.notifications (recipient_id, order_id, kind, title, body, data)
      values (
        new.customer_id,
        new.id,
        'loyalty_points',
        'You earned loyalty points',
        v_body,
        jsonb_build_object('points', v_pts, 'orderId', new.id, 'app', 'customer')
      );
    end if;

    return new;
  end;
  $$;

  drop trigger if exists orders_apply_loyalty_on_delivered on public.orders;
  create trigger orders_apply_loyalty_on_delivered
  after update of status on public.orders
  for each row execute function public.apply_order_loyalty_on_delivered();

  create or replace function public.customer_redeem_loyalty_voucher(p_seller_id uuid)
  returns jsonb
  language plpgsql
  security definer
  set search_path = public
  set row_security = off
  as $$
  declare
    v_uid uuid := auth.uid();
    v_n int;
    v_code text;
    v_id uuid;
    v_exp timestamptz := now() + interval '3 days';
    v_attempt int;
  begin
    if v_uid is null then
      raise exception 'Not authenticated';
    end if;
    if not exists (select 1 from public.profiles p where p.user_id = v_uid and p.role = 'customer') then
      raise exception 'Only customers can redeem loyalty rewards';
    end if;

    update public.loyalty_balances lb
    set
      points_balance = lb.points_balance - 10,
      updated_at = now()
    where lb.customer_id = v_uid
      and lb.seller_id = p_seller_id
      and lb.points_balance >= 10;
    get diagnostics v_n = row_count;

    if v_n = 0 then
      return jsonb_build_object('ok', false, 'error', 'insufficient_points');
    end if;

    v_attempt := 0;
    loop
      v_attempt := v_attempt + 1;
      if v_attempt > 8 then
        update public.loyalty_balances lb
        set points_balance = lb.points_balance + 10, updated_at = now()
        where lb.customer_id = v_uid and lb.seller_id = p_seller_id;
        raise exception 'Could not generate a unique voucher code';
      end if;
      v_code := 'REF-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));

      begin
        insert into public.loyalty_vouchers (
          customer_id,
          seller_id,
          code,
          status,
          points_spent,
          expires_at
        )
        values (
          v_uid,
          p_seller_id,
          v_code,
          'active',
          10,
          v_exp
        )
        returning id into v_id;
        exit;
      exception when unique_violation then
        null;
      end;
    end loop;

    return jsonb_build_object(
      'ok', true,
      'voucher_id', v_id,
      'code', v_code,
      'expires_at', v_exp,
      'note', 'Show this code at the store for 1 free container refill. Valid for 3 days — redeem only when you are ready to refill.'
    );
  end;
  $$;

  revoke all on function public.customer_redeem_loyalty_voucher(uuid) from public;
  grant execute on function public.customer_redeem_loyalty_voucher(uuid) to authenticated;
  grant execute on function public.customer_redeem_loyalty_voucher(uuid) to service_role;

  create or replace function public.seller_verify_loyalty_voucher(p_code text)
  returns jsonb
  language plpgsql
  security definer
  set search_path = public
  set row_security = off
  as $$
  declare
    v_business uuid := public.seller_business_id(auth.uid());
    v_norm text := upper(trim(coalesce(p_code, '')));
    v_row public.loyalty_vouchers%rowtype;
    v_n int;
  begin
    if auth.uid() is null then
      raise exception 'Not authenticated';
    end if;
    if not public.is_seller(auth.uid()) then
      raise exception 'Only sellers can verify vouchers';
    end if;
    if v_business is null then
      raise exception 'Seller workspace not available';
    end if;
    if length(v_norm) < 6 then
      return jsonb_build_object('ok', false, 'error', 'invalid_code', 'message', 'Enter the voucher code.');
    end if;

    select * into v_row
    from public.loyalty_vouchers v
    where upper(trim(v.code)) = v_norm
      and v.seller_id = v_business;

    if not found then
      return jsonb_build_object('ok', false, 'error', 'not_found', 'message', 'No voucher matches this code for your store.');
    end if;

    if v_row.status = 'used' then
      return jsonb_build_object(
        'ok', false,
        'error', 'already_used',
        'message', 'This voucher was already used.',
        'used_at', v_row.used_at
      );
    end if;

    if v_row.expires_at < now() then
      update public.loyalty_vouchers
      set status = 'expired'
      where id = v_row.id and status = 'active';
      return jsonb_build_object(
        'ok', false,
        'error', 'expired',
        'message', 'This voucher has expired (3 days after issue).',
        'expires_at', v_row.expires_at
      );
    end if;

    update public.loyalty_vouchers
    set status = 'used', used_at = now()
    where id = v_row.id and status = 'active' and expires_at >= now();
    get diagnostics v_n = row_count;

    if v_n = 0 then
      return jsonb_build_object('ok', false, 'error', 'conflict', 'message', 'Could not apply voucher. Try again.');
    end if;

    return jsonb_build_object(
      'ok', true,
      'error', null,
      'message', 'Verified — you may give 1 free container refill.',
      'code', v_row.code,
      'customer_id', v_row.customer_id,
      'used_at', now()
    );
  end;
  $$;

  revoke all on function public.seller_verify_loyalty_voucher(text) from public;
  grant execute on function public.seller_verify_loyalty_voucher(text) to authenticated;
  grant execute on function public.seller_verify_loyalty_voucher(text) to service_role;

  -- ── Borrowed gallon container tracking (seller ↔ customer), optional ---
  create table if not exists public.seller_customer_container_balance (
    seller_id uuid not null references public.profiles(user_id) on delete cascade,
    customer_id uuid not null references public.profiles(user_id) on delete cascade,
    outstanding_count integer not null default 0 check (outstanding_count >= 0),
    identifier_notes text,
    updated_at timestamptz not null default now(),
    primary key (seller_id, customer_id)
  );

  create index if not exists seller_customer_container_balance_seller_customer_idx
    on public.seller_customer_container_balance (seller_id, customer_id);

  create table if not exists public.seller_container_movements (
    id uuid primary key default gen_random_uuid(),
    seller_id uuid not null references public.profiles(user_id) on delete cascade,
    customer_id uuid not null references public.profiles(user_id) on delete cascade,
    order_id uuid references public.orders(id) on delete set null,
    movement_type text not null check (movement_type in ('lend', 'return')),
    quantity integer not null check (quantity > 0),
    container_numbers text,
    created_at timestamptz not null default now()
  );

  create index if not exists seller_container_movements_lookup_idx
    on public.seller_container_movements (seller_id, customer_id, created_at desc);

  -- Customers hidden by seller from the Customers tab only (profile & order history unchanged).
  create table if not exists public.seller_hidden_customers (
    seller_id uuid not null references public.profiles(user_id) on delete cascade,
    customer_id uuid not null references public.profiles(user_id) on delete cascade,
    created_at timestamptz not null default now(),
    primary key (seller_id, customer_id),
    constraint seller_hidden_customers_distinct_roles check (seller_id <> customer_id)
  );

  create index if not exists seller_hidden_customers_seller_idx
    on public.seller_hidden_customers (seller_id);

  alter table public.seller_hidden_customers enable row level security;

  drop policy if exists "seller_hidden_customers seller read own" on public.seller_hidden_customers;
  create policy "seller_hidden_customers seller read own"
    on public.seller_hidden_customers for select
    using (
      public.is_seller(auth.uid())
      and seller_id = public.seller_business_id(auth.uid())
    );

  drop policy if exists "seller_hidden_customers seller insert own" on public.seller_hidden_customers;
  create policy "seller_hidden_customers seller insert own"
    on public.seller_hidden_customers for insert
    with check (
      public.is_seller(auth.uid())
      and seller_id = public.seller_business_id(auth.uid())
      and exists (
        select 1 from public.profiles p
        where p.user_id = customer_id
          and p.role = 'customer'
      )
    );

  drop policy if exists "seller_hidden_customers seller delete own" on public.seller_hidden_customers;
  create policy "seller_hidden_customers seller delete own"
    on public.seller_hidden_customers for delete
    using (
      public.is_seller(auth.uid())
      and seller_id = public.seller_business_id(auth.uid())
    );

  grant select, insert, delete on table public.seller_hidden_customers to authenticated;

  drop trigger if exists seller_customer_container_balance_set_updated_at
    on public.seller_customer_container_balance;
  create trigger seller_customer_container_balance_set_updated_at
    before update on public.seller_customer_container_balance
    for each row execute function public.set_updated_at();

  alter table public.seller_customer_container_balance enable row level security;
  alter table public.seller_container_movements enable row level security;

  drop policy if exists "seller_container_balance seller read own" on public.seller_customer_container_balance;
  create policy "seller_container_balance seller read own"
    on public.seller_customer_container_balance for select
    using (
      public.is_seller(auth.uid())
      and seller_id = public.seller_business_id(auth.uid())
    );

  drop policy if exists "seller_container_balance seller edit own notes" on public.seller_customer_container_balance;

  drop policy if exists "seller_container_movements seller read own" on public.seller_container_movements;
  create policy "seller_container_movements seller read own"
    on public.seller_container_movements for select
    using (
      public.is_seller(auth.uid())
      and seller_id = public.seller_business_id(auth.uid())
    );

  revoke insert, update, delete on public.seller_customer_container_balance from authenticated;
  revoke insert, update, delete on public.seller_container_movements from authenticated;

  create or replace function public.seller_record_container_lend(
    p_order_id uuid,
    p_quantity integer,
    p_container_numbers text default null
  )
  returns jsonb
  language plpgsql
  security definer
  set search_path = public
  set row_security = off
  as $$
  declare
    v_business uuid := public.seller_business_id(auth.uid());
    v_order_seller uuid;
    v_customer uuid;
    v_nums text := nullif(trim(coalesce(p_container_numbers, '')), '');
  begin
    if not public.is_seller(auth.uid()) then
      raise exception 'Only sellers can record container lends';
    end if;
    if v_business is null then
      raise exception 'Seller workspace not available';
    end if;
    if p_quantity is null or p_quantity < 1 then
      return jsonb_build_object('ok', false, 'error', 'quantity', 'message', 'Quantity must be at least 1.');
    end if;

    select o.seller_id, o.customer_id into v_order_seller, v_customer
    from public.orders o
    where o.id = p_order_id;

    if v_order_seller is null then
      return jsonb_build_object('ok', false, 'error', 'no_order', 'message', 'Order not found.');
    end if;
    if v_order_seller <> v_business then
      raise exception 'Not your order';
    end if;

    insert into public.seller_container_movements (
      seller_id, customer_id, order_id, movement_type, quantity, container_numbers
    ) values (
      v_business, v_customer, p_order_id, 'lend', p_quantity, v_nums
    );

    insert into public.seller_customer_container_balance (
      seller_id, customer_id, outstanding_count, identifier_notes
    )
    values (
      v_business,
      v_customer,
      p_quantity,
      v_nums
    )
    on conflict (seller_id, customer_id) do update set
      outstanding_count = public.seller_customer_container_balance.outstanding_count + excluded.outstanding_count,
      identifier_notes = case
        when v_nums is null then public.seller_customer_container_balance.identifier_notes
        else trim(both from
          coalesce(nullif(trim(public.seller_customer_container_balance.identifier_notes), ''), '')
          ||
          case
            when coalesce(trim(public.seller_customer_container_balance.identifier_notes), '') <> '' then '; '
            else ''
          end
          || v_nums
        )
      end;

    return jsonb_build_object(
      'ok', true,
      'seller_id', v_business,
      'customer_id', v_customer,
      'outstanding_added', p_quantity
    );
  end;
  $$;

  revoke all on function public.seller_record_container_lend(uuid, integer, text) from public;
  grant execute on function public.seller_record_container_lend(uuid, integer, text) to authenticated;
  grant execute on function public.seller_record_container_lend(uuid, integer, text) to service_role;

  create or replace function public.seller_record_container_return(
    p_customer_id uuid,
    p_quantity integer,
    p_order_id uuid default null
  )
  returns jsonb
  language plpgsql
  security definer
  set search_path = public
  set row_security = off
  as $$
  declare
    v_business uuid := public.seller_business_id(auth.uid());
    v_current integer;
    v_order_customer uuid;
    v_order_seller uuid;
  begin
    if not public.is_seller(auth.uid()) then
      raise exception 'Only sellers can record container returns';
    end if;
    if v_business is null then
      raise exception 'Seller workspace not available';
    end if;
    if p_quantity is null or p_quantity < 1 then
      return jsonb_build_object('ok', false, 'error', 'quantity', 'message', 'Quantity must be at least 1.');
    end if;

    if exists (
      select 1 from public.orders o
      where o.seller_id = v_business and o.customer_id = p_customer_id
    ) then
      null;
    else
      return jsonb_build_object(
        'ok', false,
        'error', 'unknown_customer',
        'message', 'No orders found for this customer at your store.'
      );
    end if;

    if p_order_id is not null then
      select o.customer_id, o.seller_id into v_order_customer, v_order_seller
      from public.orders o where o.id = p_order_id;
      if v_order_seller is null or v_order_seller <> v_business then
        return jsonb_build_object('ok', false, 'error', 'bad_order', 'message', 'Order does not belong to your store.');
      end if;
      if v_order_customer <> p_customer_id then
        return jsonb_build_object('ok', false, 'error', 'bad_order_customer', 'message', 'Order customer mismatch.');
      end if;
    end if;

    select b.outstanding_count into v_current
    from public.seller_customer_container_balance b
    where b.seller_id = v_business and b.customer_id = p_customer_id;

    if coalesce(v_current, 0) < p_quantity then
      return jsonb_build_object(
        'ok', false,
        'error', 'too_many',
        'message',
        format('Only %s container(s) are recorded as borrowed for this customer.', coalesce(v_current, 0))
      );
    end if;

    insert into public.seller_container_movements (
      seller_id, customer_id, order_id, movement_type, quantity
    ) values (
      v_business, p_customer_id, p_order_id, 'return', p_quantity
    );

    update public.seller_customer_container_balance b
      set outstanding_count = b.outstanding_count - p_quantity
    where b.seller_id = v_business and b.customer_id = p_customer_id;

    return jsonb_build_object(
      'ok', true,
      'seller_id', v_business,
      'customer_id', p_customer_id,
      'returned', p_quantity,
      'outstanding_remaining', greatest(coalesce(v_current, 0) - p_quantity, 0)
    );
  end;
  $$;

  revoke all on function public.seller_record_container_return(uuid, integer, uuid) from public;
  grant execute on function public.seller_record_container_return(uuid, integer, uuid) to authenticated;
  grant execute on function public.seller_record_container_return(uuid, integer, uuid) to service_role;

  -- ── Password reset codes (for PHPMailer reset flow) ---
  create table if not exists public.password_reset_codes (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null,
    email text not null,
    code_hash text not null,
    expires_at timestamptz not null,
    used_at timestamptz,
    created_at timestamptz not null default now()
  );

  create index if not exists password_reset_codes_email_created_idx
    on public.password_reset_codes (email, created_at desc);

  create index if not exists password_reset_codes_user_created_idx
    on public.password_reset_codes (user_id, created_at desc);

  alter table public.password_reset_codes enable row level security;

  -- No RLS policies: table is intended for server/service_role access only.

  -- Realtime (postgres_changes): add tables to the Supabase publication when present.
  -- Safe to re-run: ignores errors (already added, publication missing outside Supabase, etc.).
  do $realtime$ begin
    begin
      alter publication supabase_realtime add table public.notifications;
    exception when others then null;
    end;
    begin
      alter publication supabase_realtime add table public.orders;
    exception when others then null;
    end;
    begin
      alter publication supabase_realtime add table public.products;
    exception when others then null;
    end;
    begin
      alter publication supabase_realtime add table public.order_items;
    exception when others then null;
    end;
    begin
      alter publication supabase_realtime add table public.seller_hidden_customers;
    exception when others then null;
    end;
  end $realtime$;

