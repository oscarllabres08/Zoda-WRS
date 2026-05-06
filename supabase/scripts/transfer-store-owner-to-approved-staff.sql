-- Transfer Aquabeast store ownership from the current approved owner to an approved staff seller.
--
-- When to use:
--   Lumabas na ang dating Owner sa Auth; na-approve mo na ang bagong seller bilang staff sa parehong workspace.
--   Patakbuhin sa Dashboard → SQL Editor para ang negosyo (orders, products, loyalty, …)
--   ay nakatali na sa bagong owner UUID.
--
-- IMPORTANT:
--   1. Palitan ang dalawang UUID sa baba (OLD_OWNER_USER_ID, NEW_OWNER_USER_ID).
--   2. NEW_OWNER dapat: role = seller, seller_team_role = staff, seller_join_status = approved,
--      seller_workspace_owner_id = OLD_OWNER (bago mo pa tumakbo ang script).
--   3. Pagkatapos ng script: ang lumang account ay naka-downgrade sa customer at cleared ang seller/store fields.
--      OK lang na HUWAG na i-delete ang lumang Auth user — malimit mas simple (iwas RESTRICT FK sa orders.customer_id).
--      Kung sakaling ide-delete mo pa rin kailangan, siguruhing WALANG order na customer_id = lumang UUID.
--   4. Run bilang database owner / service role (karaniwan sa SQL Editor — auth.uid() NULL kaya safe sa staff self-update triggers).

BEGIN;

DO $$
DECLARE
  old_owner uuid := 'PASTE_OLD_OWNER_USER_ID_HERE'; -- outgoing master admin (seller_team_role = owner)
  new_owner uuid := 'PASTE_NEW_OWNER_USER_ID_HERE';   -- approved staff under that workspace
BEGIN
  IF old_owner IS NULL OR new_owner IS NULL OR old_owner = new_owner THEN
    RAISE EXCEPTION 'Set valid OLD_OWNER and NEW_OWNER UUIDs';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.user_id = old_owner
      AND p.role = 'seller'
      AND p.seller_team_role = 'owner'
      AND coalesce(p.seller_join_status, 'approved') = 'approved'
  ) THEN
    RAISE EXCEPTION 'OLD_OWNER is not an approved store owner (seller + seller_team_role owner + approved)';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.user_id = new_owner
      AND p.role = 'seller'
      AND p.seller_team_role = 'staff'
      AND p.seller_join_status = 'approved'
      AND p.seller_workspace_owner_id = old_owner
  ) THEN
    RAISE EXCEPTION 'NEW_OWNER must be approved staff with seller_workspace_owner_id = OLD_OWNER';
  END IF;

  -- Copy storefront fields from old owner → new owner (keep new_owner values kung walang ililipat)
  UPDATE public.profiles AS n
  SET
    store_name = coalesce(nullif(trim(o.store_name), ''), n.store_name),
    store_code = coalesce(nullif(trim(o.store_code), ''), n.store_code),
    business_hours = coalesce(nullif(trim(o.business_hours), ''), n.business_hours),
    store_address = coalesce(nullif(trim(o.store_address), ''), n.store_address),
    store_logo_url = coalesce(o.store_logo_url, n.store_logo_url),
    latitude = coalesce(o.latitude, n.latitude),
    longitude = coalesce(o.longitude, n.longitude)
  FROM public.profiles o
  WHERE o.user_id = old_owner
    AND n.user_id = new_owner;

  -- Business scope: lahat ng seller_id sa schema ay ang workspace owner user_id
  UPDATE public.products SET seller_id = new_owner WHERE seller_id = old_owner;
  UPDATE public.orders SET seller_id = new_owner WHERE seller_id = old_owner;
  UPDATE public.ewallet_accounts SET seller_id = new_owner WHERE seller_id = old_owner;
  UPDATE public.pos_sales SET seller_id = new_owner WHERE seller_id = old_owner;
  UPDATE public.loyalty_balances SET seller_id = new_owner WHERE seller_id = old_owner;
  UPDATE public.order_loyalty_awards SET seller_id = new_owner WHERE seller_id = old_owner;
  UPDATE public.loyalty_vouchers SET seller_id = new_owner WHERE seller_id = old_owner;
  UPDATE public.seller_customer_container_balance SET seller_id = new_owner WHERE seller_id = old_owner;
  UPDATE public.seller_container_movements SET seller_id = new_owner WHERE seller_id = old_owner;
  UPDATE public.seller_hidden_customers SET seller_id = new_owner WHERE seller_id = old_owner;

  -- Ibang staff sa parehong workspace: bagong owner pointer
  UPDATE public.profiles
  SET seller_workspace_owner_id = new_owner
  WHERE seller_workspace_owner_id = old_owner
    AND user_id IS DISTINCT FROM new_owner;

  -- Alisin muna ang lumang owner sa index ng “isang approved owner” (profiles_single_approved_owner_idx)
  UPDATE public.profiles
  SET
    role = 'customer'::public.user_role,
    seller_team_role = NULL,
    seller_join_status = NULL,
    seller_workspace_owner_id = NULL,
    store_name = NULL,
    store_code = NULL,
    business_hours = NULL,
    store_address = NULL,
    store_logo_url = NULL,
    latitude = NULL,
    longitude = NULL
  WHERE user_id = old_owner;

  -- I-promote ang bagong owner
  UPDATE public.profiles
  SET
    seller_team_role = 'owner',
    seller_join_status = 'approved',
    seller_workspace_owner_id = new_owner,
    role = 'seller'::public.user_role
  WHERE user_id = new_owner;
END $$;

COMMIT;
