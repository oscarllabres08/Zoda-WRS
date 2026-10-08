-- Seller app download PIN (admin Settings + download site). Run in Supabase SQL Editor.

alter table public.profiles
  add column if not exists seller_download_pin text;

comment on column public.profiles.seller_download_pin is
  'PIN required on the public download site to unlock seller-app.apk. Set by store owner in admin Settings.';

create or replace function public.set_seller_download_pin(p_new_pin text)
returns void
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_owner uuid := auth.uid();
  v_pin text := trim(coalesce(p_new_pin, ''));
begin
  if v_owner is null then
    raise exception 'Not authenticated';
  end if;
  if not public.is_seller(v_owner) then
    raise exception 'Only sellers can set the download PIN';
  end if;
  if v_owner is distinct from public.seller_business_id(v_owner) then
    raise exception 'Only the store owner can set the download PIN';
  end if;
  if char_length(v_pin) < 4 then
    raise exception 'PIN must be at least 4 characters';
  end if;
  if char_length(v_pin) > 32 then
    raise exception 'PIN must be at most 32 characters';
  end if;

  update public.profiles
  set seller_download_pin = v_pin
  where user_id = v_owner
    and role = 'seller'::public.user_role
    and coalesce(seller_team_role, 'owner') = 'owner';

  if not found then
    raise exception 'Could not save PIN. Log in as the store owner (master admin) and try again.';
  end if;
end;
$$;

revoke all on function public.set_seller_download_pin(text) from public;
grant execute on function public.set_seller_download_pin(text) to authenticated;
grant execute on function public.set_seller_download_pin(text) to service_role;

drop function if exists public.verify_seller_download_pin(text, text, uuid);

create or replace function public.verify_seller_download_pin(p_pin text)
returns boolean
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_entered text := trim(coalesce(p_pin, ''));
  v_stored text;
begin
  if v_entered = '' then
    return false;
  end if;

  -- Single-store download site: use the master admin (store owner) PIN from Settings.
  select p.seller_download_pin into v_stored
  from public.profiles p
  where p.role = 'seller'::public.user_role
    and coalesce(p.seller_join_status, 'approved') = 'approved'
    and coalesce(p.seller_team_role, 'owner') = 'owner'
    and p.seller_download_pin is not null
    and trim(p.seller_download_pin) <> ''
  order by p.updated_at desc nulls last
  limit 1;

  if v_stored is null or trim(v_stored) = '' then
    return false;
  end if;

  return trim(v_stored) = v_entered;
end;
$$;

revoke all on function public.verify_seller_download_pin(text) from public;
grant execute on function public.verify_seller_download_pin(text) to anon;
grant execute on function public.verify_seller_download_pin(text) to authenticated;
grant execute on function public.verify_seller_download_pin(text) to service_role;
