-- Store owner toggles loyalty promo on/off (admin web). Run in Supabase SQL Editor.

alter table public.profiles
  add column if not exists loyalty_points_active boolean not null default false;

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
  v_loyalty_on boolean;
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

  select coalesce(p.loyalty_points_active, false) into v_loyalty_on
  from public.profiles p
  where p.user_id = new.seller_id;

  if not v_loyalty_on then
    return new;
  end if;

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
  v_loyalty_on boolean;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;
  if not exists (select 1 from public.profiles p where p.user_id = v_uid and p.role = 'customer') then
    raise exception 'Only customers can redeem loyalty rewards';
  end if;

  select coalesce(p.loyalty_points_active, false) into v_loyalty_on
  from public.profiles p
  where p.user_id = p_seller_id;

  if not v_loyalty_on then
    return jsonb_build_object('ok', false, 'error', 'loyalty_inactive');
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
    v_code := 'REF-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));

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
