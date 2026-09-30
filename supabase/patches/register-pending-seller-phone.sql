-- Seller/staff registration: save contact number on profiles.phone



drop function if exists public.register_pending_seller(text);



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

    v_name := coalesce(nullif(trim(p_display_name), ''), nullif(trim(coalesce(v_name, '')), ''), split_part(coalesce(v_email, ''), '@', 1));



    begin

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

    exception

      when unique_violation then

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

    'New registration request',

    coalesce(v_name, 'Someone') || ' asked to join your workspace'

      || case when v_email is not null and length(trim(v_email)) > 0 then ' · ' || v_email else '' end,

    jsonb_build_object('pending_user_id', v_uid, 'kind', 'seller_registration_pending', 'app', 'seller')

  );



  return jsonb_build_object('ok', true, 'pending', true);

end;

$$;



revoke all on function public.register_pending_seller(text, text) from public;

grant execute on function public.register_pending_seller(text, text) to authenticated;

grant execute on function public.register_pending_seller(text, text) to service_role;

