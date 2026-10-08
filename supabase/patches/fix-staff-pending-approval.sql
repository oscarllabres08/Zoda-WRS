-- Staff registration: single-store WRS flow (no store code).
-- Run in Supabase SQL Editor (safe to re-run).

-- Remove ALL overloaded register_pending_seller versions (fixes "Could not choose the best candidate function").
drop function if exists public.register_pending_seller(text);
drop function if exists public.register_pending_seller(text, text);
drop function if exists public.register_pending_seller(text, text, text);
drop function if exists public.register_pending_seller(text, text, boolean);

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

create or replace function public.register_pending_seller(
  p_display_name text default null,
  p_phone text default null
)
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

  perform set_config('app.register_pending_seller', '1', true);

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
    insert into public.profiles(user_id, role, display_name, phone)
    values (
      v_uid,
      'customer',
      coalesce(nullif(trim(p_display_name), ''), split_part(coalesce(v_email, ''), '@', 1)),
      nullif(trim(p_phone), '')
    )
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

  -- Single WRS store: use the first registered approved owner.
  select o.user_id
  into v_owner
  from public.profiles o
  where o.role = 'seller'
    and o.seller_team_role = 'owner'
    and coalesce(o.seller_join_status, 'approved') = 'approved'
  order by o.created_at asc
  limit 1;

  if v_owner is null then
    v_name := coalesce(nullif(trim(p_display_name), ''), nullif(trim(coalesce(v_name, '')), ''), split_part(coalesce(v_email, ''), '@', 1));

    update public.profiles p
    set
      role = 'seller',
      seller_team_role = 'owner',
      seller_join_status = 'approved',
      seller_workspace_owner_id = v_uid,
      display_name = coalesce(nullif(trim(p_display_name), ''), p.display_name),
      phone = coalesce(nullif(trim(p_phone), ''), p.phone)
    where p.user_id = v_uid;

    get diagnostics v_n = row_count;
    if v_n <> 1 then
      raise exception 'PROFILE_UPDATE_FAILED: Could not update your profile.';
    end if;

    return jsonb_build_object('ok', true, 'owner', true, 'approved', true, 'first_owner', true);
  end if;

  v_name := coalesce(nullif(trim(p_display_name), ''), nullif(trim(coalesce(v_name, '')), ''), split_part(coalesce(v_email, ''), '@', 1));

  update public.profiles p
  set
    role = 'seller',
    seller_team_role = 'staff',
    seller_join_status = 'pending',
    seller_workspace_owner_id = v_owner,
    display_name = coalesce(nullif(trim(p_display_name), ''), p.display_name),
    phone = coalesce(nullif(trim(p_phone), ''), p.phone)
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
    'New staff registration',
    coalesce(v_name, 'Someone') || ' registered in the Seller app and needs approval.'
      || case when v_email is not null and length(trim(v_email)) > 0 then ' · ' || v_email else '' end,
    jsonb_build_object('pending_user_id', v_uid, 'kind', 'seller_registration_pending', 'app', 'admin')
  );

  return jsonb_build_object('ok', true, 'pending', true);
end;
$$;

revoke all on function public.register_pending_seller(text, text) from public;
grant execute on function public.register_pending_seller(text, text) to authenticated;
grant execute on function public.register_pending_seller(text, text) to service_role;

-- Reject = delete staff account (hard delete when possible).
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
  v_status text := lower(trim(p_status));
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
  if v_status not in ('approved', 'rejected') then
    raise exception 'Invalid status';
  end if;

  if v_status = 'rejected' then
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

-- Allow deleting pending staff (not only approved).
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

  begin
    delete from public.profiles where user_id = p_staff_user_id;
    delete from auth.users where id = p_staff_user_id;
    return jsonb_build_object('ok', true, 'deleted', true);
  exception
    when others then
      update public.profiles
      set
        seller_join_status = 'rejected',
        seller_workspace_owner_id = null,
        role = 'customer',
        seller_team_role = null
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
