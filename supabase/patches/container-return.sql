-- Run this in Supabase SQL Editor if container return buttons fail or IDs do not update after return.
-- (Also included in supabase/schema.sql)

create or replace function public.seller_container_notes_remove_ids(
  p_notes text,
  p_remove_csv text
)
returns text
language plpgsql
immutable
as $$
declare
  tok text;
  keep_ids text[] := array[]::text[];
  remove_set text[];
  r text;
begin
  if p_notes is null or trim(p_notes) = '' then
    return null;
  end if;
  if p_remove_csv is null or trim(p_remove_csv) = '' then
    return nullif(trim(p_notes), '');
  end if;

  select coalesce(array_agg(distinct lower(trim(x))), array[]::text[])
  into remove_set
  from unnest(regexp_split_to_array(p_remove_csv, '\s*[,;]\s*')) as x
  where trim(x) <> '';

  foreach tok in array regexp_split_to_array(p_notes, '\s*[,;]\s*') loop
    tok := trim(tok);
    if tok = '' then
      continue;
    end if;
    if not (lower(tok) = any(remove_set)) then
      keep_ids := array_append(keep_ids, tok);
    end if;
  end loop;

  if keep_ids is null or coalesce(array_length(keep_ids, 1), 0) = 0 then
    return null;
  end if;

  select string_agg(r, ', ' order by r)
  into r
  from unnest(keep_ids) as r;

  return nullif(trim(r), '');
end;
$$;

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

  select b.outstanding_count, b.identifier_notes
  into v_current, v_notes
  from public.seller_customer_container_balance b
  where b.seller_id = v_business and b.customer_id = p_customer_id;

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

grant execute on function public.seller_container_notes_remove_ids(text, text) to authenticated;
grant execute on function public.seller_container_notes_remove_ids(text, text) to service_role;
grant execute on function public.seller_record_container_return(uuid, integer, uuid, text) to authenticated;
grant execute on function public.seller_record_container_return(uuid, integer, uuid, text) to service_role;
