-- Walk-in POS borrowed containers (by customer name) + lend for registered customers without an online order.
-- Run in Supabase SQL Editor after fix-container-return-overload.sql.

create table if not exists public.seller_pos_container_balance (
  seller_id uuid not null references public.profiles(user_id) on delete cascade,
  customer_name_key text not null,
  display_name text,
  outstanding_count integer not null default 0 check (outstanding_count >= 0),
  identifier_notes text,
  updated_at timestamptz not null default now(),
  primary key (seller_id, customer_name_key)
);

create index if not exists seller_pos_container_balance_seller_idx
  on public.seller_pos_container_balance (seller_id);

create table if not exists public.seller_pos_container_movements (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.profiles(user_id) on delete cascade,
  customer_name_key text not null,
  pos_sale_id uuid references public.pos_sales(id) on delete set null,
  movement_type text not null check (movement_type in ('lend', 'return')),
  quantity integer not null check (quantity > 0),
  container_numbers text,
  created_at timestamptz not null default now()
);

create index if not exists seller_pos_container_movements_lookup_idx
  on public.seller_pos_container_movements (seller_id, customer_name_key, created_at desc);

alter table public.seller_pos_container_balance enable row level security;
alter table public.seller_pos_container_movements enable row level security;

drop policy if exists "seller_pos_container_balance seller read" on public.seller_pos_container_balance;
create policy "seller_pos_container_balance seller read"
  on public.seller_pos_container_balance for select
  using (
    public.is_seller(auth.uid())
    and seller_id = public.seller_business_id(auth.uid())
  );

drop policy if exists "seller_pos_container_movements seller read" on public.seller_pos_container_movements;
create policy "seller_pos_container_movements seller read"
  on public.seller_pos_container_movements for select
  using (
    public.is_seller(auth.uid())
    and seller_id = public.seller_business_id(auth.uid())
  );

revoke insert, update, delete on public.seller_pos_container_balance from authenticated;
revoke insert, update, delete on public.seller_pos_container_movements from authenticated;

create or replace function public.normalize_pos_customer_name_key(p_name text)
returns text
language sql
immutable
as $$
  select nullif(lower(trim(coalesce(p_name, ''))), '');
$$;

create or replace function public.seller_record_container_lend_for_customer(
  p_customer_id uuid,
  p_quantity integer,
  p_container_numbers text default null,
  p_pos_sale_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_business uuid := public.seller_business_id(auth.uid());
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
  if p_customer_id is null then
    return jsonb_build_object('ok', false, 'error', 'customer', 'message', 'Customer is required.');
  end if;

  if not exists (select 1 from public.profiles p where p.user_id = p_customer_id) then
    return jsonb_build_object('ok', false, 'error', 'unknown_customer', 'message', 'Customer not found.');
  end if;

  if p_pos_sale_id is not null then
    if not exists (
      select 1 from public.pos_sales ps
      where ps.id = p_pos_sale_id and ps.seller_id = v_business
    ) then
      return jsonb_build_object('ok', false, 'error', 'bad_sale', 'message', 'POS sale not found.');
    end if;
  end if;

  insert into public.seller_container_movements (
    seller_id, customer_id, order_id, movement_type, quantity, container_numbers
  ) values (
    v_business, p_customer_id, null, 'lend', p_quantity, v_nums
  );

  insert into public.seller_customer_container_balance (
    seller_id, customer_id, outstanding_count, identifier_notes
  )
  values (
    v_business,
    p_customer_id,
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
    'customer_id', p_customer_id,
    'outstanding_added', p_quantity
  );
end;
$$;

create or replace function public.seller_record_pos_container_lend(
  p_customer_name text,
  p_quantity integer,
  p_container_numbers text default null,
  p_pos_sale_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_business uuid := public.seller_business_id(auth.uid());
  v_key text := public.normalize_pos_customer_name_key(p_customer_name);
  v_display text := nullif(trim(coalesce(p_customer_name, '')), '');
  v_nums text := nullif(trim(coalesce(p_container_numbers, '')), '');
begin
  if not public.is_seller(auth.uid()) then
    raise exception 'Only sellers can record container lends';
  end if;
  if v_business is null then
    raise exception 'Seller workspace not available';
  end if;
  if v_key is null then
    return jsonb_build_object('ok', false, 'error', 'name', 'message', 'Customer name is required.');
  end if;
  if p_quantity is null or p_quantity < 1 then
    return jsonb_build_object('ok', false, 'error', 'quantity', 'message', 'Quantity must be at least 1.');
  end if;

  if p_pos_sale_id is not null then
    if not exists (
      select 1 from public.pos_sales ps
      where ps.id = p_pos_sale_id and ps.seller_id = v_business
    ) then
      return jsonb_build_object('ok', false, 'error', 'bad_sale', 'message', 'POS sale not found.');
    end if;
  end if;

  insert into public.seller_pos_container_movements (
    seller_id, customer_name_key, pos_sale_id, movement_type, quantity, container_numbers
  ) values (
    v_business, v_key, p_pos_sale_id, 'lend', p_quantity, v_nums
  );

  insert into public.seller_pos_container_balance (
    seller_id, customer_name_key, display_name, outstanding_count, identifier_notes
  )
  values (
    v_business, v_key, v_display, p_quantity, v_nums
  )
  on conflict (seller_id, customer_name_key) do update set
    display_name = coalesce(excluded.display_name, public.seller_pos_container_balance.display_name),
    outstanding_count = public.seller_pos_container_balance.outstanding_count + excluded.outstanding_count,
    identifier_notes = case
      when v_nums is null then public.seller_pos_container_balance.identifier_notes
      else trim(both from
        coalesce(nullif(trim(public.seller_pos_container_balance.identifier_notes), ''), '')
        ||
        case
          when coalesce(trim(public.seller_pos_container_balance.identifier_notes), '') <> '' then '; '
          else ''
        end
        || v_nums
      )
    end,
    updated_at = now();

  return jsonb_build_object(
    'ok', true,
    'seller_id', v_business,
    'customer_name_key', v_key,
    'outstanding_added', p_quantity
  );
end;
$$;

create or replace function public.seller_record_pos_container_return(
  p_customer_name text,
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
  v_key text := public.normalize_pos_customer_name_key(p_customer_name);
  v_current integer;
  v_notes text;
  v_nums text := nullif(trim(coalesce(p_container_numbers, '')), '');
  v_id_count integer;
  v_tok text;
begin
  if not public.is_seller(auth.uid()) then
    raise exception 'Only sellers can record container returns';
  end if;
  if v_business is null then
    raise exception 'Seller workspace not available';
  end if;
  if v_key is null then
    return jsonb_build_object('ok', false, 'error', 'name', 'message', 'Customer name is required.');
  end if;
  if p_quantity is null or p_quantity < 1 then
    return jsonb_build_object('ok', false, 'error', 'quantity', 'message', 'Quantity must be at least 1.');
  end if;

  select b.outstanding_count, b.identifier_notes
  into v_current, v_notes
  from public.seller_pos_container_balance b
  where b.seller_id = v_business and b.customer_name_key = v_key;

  if coalesce(v_current, 0) < 1 then
    return jsonb_build_object(
      'ok', false,
      'error', 'none_outstanding',
      'message', 'This customer has no borrowed containers recorded.'
    );
  end if;

  if v_nums is not null then
    select count(*)::integer
    into v_id_count
    from unnest(regexp_split_to_array(v_nums, '\s*[,;]\s*')) as x
    where trim(x) <> '';

    if coalesce(v_id_count, 0) < 1 then
      return jsonb_build_object('ok', false, 'error', 'bad_numbers', 'message', 'Invalid container numbers.');
    end if;

    if v_id_count <> p_quantity then
      return jsonb_build_object(
        'ok', false,
        'error', 'count_mismatch',
        'message', 'Number of container IDs must match the return quantity.'
      );
    end if;

    if coalesce(trim(v_notes), '') <> '' then
      foreach v_tok in array regexp_split_to_array(v_nums, '\s*[,;]\s*') loop
        v_tok := trim(v_tok);
        if v_tok = '' then
          continue;
        end if;
        if not exists (
          select 1
          from unnest(regexp_split_to_array(v_notes, '\s*[,;]\s*')) as n(id)
          where trim(n.id) <> '' and lower(trim(n.id)) = lower(v_tok)
        ) then
          return jsonb_build_object(
            'ok', false,
            'error', 'unknown_id',
            'message',
            format('Container ID not found on this customer: %s', v_tok)
          );
        end if;
      end loop;
    end if;
  end if;

  if coalesce(v_current, 0) < p_quantity then
    return jsonb_build_object(
      'ok', false,
      'error', 'too_many',
      'message',
      format('Only %s container(s) are recorded as borrowed for this customer.', coalesce(v_current, 0))
    );
  end if;

  insert into public.seller_pos_container_movements (
    seller_id, customer_name_key, movement_type, quantity, container_numbers
  ) values (
    v_business, v_key, 'return', p_quantity, v_nums
  );

  update public.seller_pos_container_balance b
    set
      outstanding_count = b.outstanding_count - p_quantity,
      identifier_notes = case
        when b.outstanding_count - p_quantity <= 0 then null
        when v_nums is not null then public.seller_container_notes_remove_ids(b.identifier_notes, v_nums)
        else b.identifier_notes
      end,
      updated_at = now()
  where b.seller_id = v_business and b.customer_name_key = v_key;

  return jsonb_build_object(
    'ok', true,
    'seller_id', v_business,
    'customer_name_key', v_key,
    'returned', p_quantity,
    'outstanding_remaining', greatest(coalesce(v_current, 0) - p_quantity, 0)
  );
end;
$$;

-- Allow returns when balance exists (POS / lend-for-customer), not only when online orders exist.
create or replace function public.seller_record_container_return(
  p_customer_id uuid,
  p_quantity integer,
  p_order_id uuid default null,
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
  v_current integer;
  v_notes text;
  v_order_customer uuid;
  v_order_seller uuid;
  v_nums text := nullif(trim(coalesce(p_container_numbers, '')), '');
  v_id_count integer;
  v_tok text;
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

  select b.outstanding_count, b.identifier_notes
  into v_current, v_notes
  from public.seller_customer_container_balance b
  where b.seller_id = v_business and b.customer_id = p_customer_id;

  if coalesce(v_current, 0) < 1 then
    if not exists (
      select 1 from public.orders o
      where o.seller_id = v_business and o.customer_id = p_customer_id
    ) then
      return jsonb_build_object(
        'ok', false,
        'error', 'unknown_customer',
        'message', 'No orders found for this customer at your store.'
      );
    end if;
    return jsonb_build_object(
      'ok', false,
      'error', 'none_outstanding',
      'message', 'This customer has no borrowed containers recorded.'
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

  if v_nums is not null then
    select count(*)::integer
    into v_id_count
    from unnest(regexp_split_to_array(v_nums, '\s*[,;]\s*')) as x
    where trim(x) <> '';

    if coalesce(v_id_count, 0) < 1 then
      return jsonb_build_object('ok', false, 'error', 'bad_numbers', 'message', 'Invalid container numbers.');
    end if;

    if v_id_count <> p_quantity then
      return jsonb_build_object(
        'ok', false,
        'error', 'count_mismatch',
        'message', 'Number of container IDs must match the return quantity.'
      );
    end if;

    if coalesce(trim(v_notes), '') <> '' then
      foreach v_tok in array regexp_split_to_array(v_nums, '\s*[,;]\s*') loop
        v_tok := trim(v_tok);
        if v_tok = '' then
          continue;
        end if;
        if not exists (
          select 1
          from unnest(regexp_split_to_array(v_notes, '\s*[,;]\s*')) as n(id)
          where trim(n.id) <> '' and lower(trim(n.id)) = lower(v_tok)
        ) then
          return jsonb_build_object(
            'ok', false,
            'error', 'unknown_id',
            'message',
            format('Container ID not found on this customer: %s', v_tok)
          );
        end if;
      end loop;
    end if;
  end if;

  if coalesce(v_current, 0) < p_quantity then
    return jsonb_build_object(
      'ok', false,
      'error', 'too_many',
      'message',
      format('Only %s container(s) are recorded as borrowed for this customer.', coalesce(v_current, 0))
    );
  end if;

  insert into public.seller_container_movements (
    seller_id, customer_id, order_id, movement_type, quantity, container_numbers
  ) values (
    v_business, p_customer_id, p_order_id, 'return', p_quantity, v_nums
  );

  update public.seller_customer_container_balance b
    set
      outstanding_count = b.outstanding_count - p_quantity,
      identifier_notes = case
        when b.outstanding_count - p_quantity <= 0 then null
        when v_nums is not null then public.seller_container_notes_remove_ids(b.identifier_notes, v_nums)
        else b.identifier_notes
      end
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

revoke all on function public.seller_record_container_lend_for_customer(uuid, integer, text, uuid) from public;
grant execute on function public.seller_record_container_lend_for_customer(uuid, integer, text, uuid) to authenticated;
grant execute on function public.seller_record_container_lend_for_customer(uuid, integer, text, uuid) to service_role;

revoke all on function public.seller_record_pos_container_lend(text, integer, text, uuid) from public;
grant execute on function public.seller_record_pos_container_lend(text, integer, text, uuid) to authenticated;
grant execute on function public.seller_record_pos_container_lend(text, integer, text, uuid) to service_role;

revoke all on function public.seller_record_pos_container_return(text, integer, text) from public;
grant execute on function public.seller_record_pos_container_return(text, integer, text) to authenticated;
grant execute on function public.seller_record_pos_container_return(text, integer, text) to service_role;
