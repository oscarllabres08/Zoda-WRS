-- Run in Supabase SQL Editor: staff list with email for admin Staff Management page.

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
