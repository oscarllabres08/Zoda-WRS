-- Owner-only: wipe online orders, POS sales, containers, loyalty sales data for this store.
-- Password is verified in admin-web (signInWithPassword) before calling this RPC.
-- Run in Supabase SQL Editor. Does NOT delete products, inventory, expenses, or staff.

create or replace function public.owner_clear_store_sales_history()
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_owner uuid := auth.uid();
  v_business uuid := public.seller_business_id(v_owner);
  v_n integer;
  v_orders integer := 0;
  v_pos integer := 0;
  v_laundry_pos integer := 0;
  v_notifications integer := 0;
  v_containers integer := 0;
  v_loyalty_balances integer := 0;
  v_loyalty_vouchers integer := 0;
begin
  if v_owner is null then
    raise exception 'Not authenticated';
  end if;
  if v_business is null or v_business is distinct from v_owner then
    raise exception 'Only the store administrator can clear sales history';
  end if;

  if to_regclass('public.seller_pos_container_movements') is not null then
    delete from public.seller_pos_container_movements where seller_id = v_business;
    get diagnostics v_n = row_count;
    v_containers := v_containers + coalesce(v_n, 0);
  end if;

  if to_regclass('public.seller_pos_container_balance') is not null then
    delete from public.seller_pos_container_balance where seller_id = v_business;
    get diagnostics v_n = row_count;
    v_containers := v_containers + coalesce(v_n, 0);
  end if;

  delete from public.seller_container_movements where seller_id = v_business;
  get diagnostics v_n = row_count;
  v_containers := v_containers + coalesce(v_n, 0);

  delete from public.seller_customer_container_balance where seller_id = v_business;
  get diagnostics v_n = row_count;
  v_containers := v_containers + coalesce(v_n, 0);

  delete from public.loyalty_vouchers where seller_id = v_business;
  get diagnostics v_loyalty_vouchers = row_count;

  delete from public.loyalty_balances where seller_id = v_business;
  get diagnostics v_loyalty_balances = row_count;

  delete from public.notifications n
  where n.recipient_id in (
    select p.user_id
    from public.profiles p
    where p.user_id = v_owner
       or (p.seller_workspace_owner_id = v_owner and p.seller_team_role = 'staff')
  );
  get diagnostics v_notifications = row_count;

  delete from public.orders where seller_id = v_business;
  get diagnostics v_orders = row_count;

  delete from public.pos_sales where seller_id = v_business;
  get diagnostics v_pos = row_count;

  if to_regclass('public.laundry_pos_sales') is not null then
    execute format(
      'delete from public.laundry_pos_sales where seller_id = %L',
      v_business
    );
    get diagnostics v_laundry_pos = row_count;
  end if;

  return jsonb_build_object(
    'ok', true,
    'deleted_orders', v_orders,
    'deleted_pos_sales', v_pos,
    'deleted_laundry_pos_sales', v_laundry_pos,
    'deleted_team_notifications', v_notifications,
    'deleted_container_rows', v_containers,
    'deleted_loyalty_balances', v_loyalty_balances,
    'deleted_loyalty_vouchers', v_loyalty_vouchers
  );
end;
$$;

revoke all on function public.owner_clear_store_sales_history() from public;
grant execute on function public.owner_clear_store_sales_history() to authenticated;
grant execute on function public.owner_clear_store_sales_history() to service_role;
