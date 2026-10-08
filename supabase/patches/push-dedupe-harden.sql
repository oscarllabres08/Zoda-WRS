-- Harden push dedupe: one FCM send per order per physical device token.
-- Run in Supabase SQL Editor, then redeploy Edge Function push-notify.

create table if not exists public.push_deliveries (
  dedupe_key text primary key,
  sent_at timestamptz not null default now()
);

create index if not exists push_deliveries_sent_at_idx on public.push_deliveries (sent_at desc);

alter table public.push_deliveries enable row level security;

-- Atomic claim (no race between concurrent webhooks for owner + staff on same phone).
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

-- Clean duplicates BEFORE unique indexes (same phone often registered on owner + staff accounts).
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

-- One seller token globally (same phone must not stay on multiple accounts).
drop index if exists public.push_tokens_seller_token_unique;
create unique index push_tokens_seller_token_unique
  on public.push_tokens (token)
  where app = 'seller';

drop index if exists public.push_tokens_customer_token_unique;
create unique index push_tokens_customer_token_unique
  on public.push_tokens (token)
  where app = 'customer';

-- Fail-safe triggers: orders must not fail if push/dedupe errors.
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
