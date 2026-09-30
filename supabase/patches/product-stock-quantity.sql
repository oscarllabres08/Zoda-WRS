-- Stock quantity for non–water-refill products (Others). Water refills use null = unlimited.

alter table public.products
  add column if not exists stock_quantity integer
  check (stock_quantity is null or stock_quantity >= 0);

create or replace function public.decrement_product_stock(p_product_id uuid, p_quantity integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_quantity is null or p_quantity < 1 then
    return;
  end if;
  update public.products
  set
    stock_quantity = greatest(0, stock_quantity - p_quantity),
    updated_at = now()
  where id = p_product_id
    and category = 'other'
    and stock_quantity is not null
    and seller_id = public.seller_business_id(auth.uid());
end;
$$;

revoke all on function public.decrement_product_stock(uuid, integer) from public;
grant execute on function public.decrement_product_stock(uuid, integer) to authenticated;
grant execute on function public.decrement_product_stock(uuid, integer) to service_role;
