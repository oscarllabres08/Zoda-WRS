import type { SupabaseClient } from '@supabase/supabase-js';

/** Points & seller context so Profile/Loyalty match where orders (and triggers) credited points. */

export type CustomerLoyaltySummary = {
  totalPoints: number;
  redeemSellerId: string | null;
  balanceRows: { seller_id: string; points_balance: number }[];
};

export async function fetchCustomerLoyaltySummary(supabase: SupabaseClient, customerId: string): Promise<CustomerLoyaltySummary> {
  const { data: balanceRowsRaw, error: balErr } = await supabase
    .from('loyalty_balances')
    .select('seller_id,points_balance')
    .eq('customer_id', customerId);
  if (balErr) throw balErr;

  const balanceRows = (balanceRowsRaw ?? []).map((r: { seller_id: string; points_balance: number }) => ({
    seller_id: r.seller_id,
    points_balance: Number(r.points_balance ?? 0),
  }));

  const totalPoints = balanceRows.reduce((s, r) => s + r.points_balance, 0);

  /** Seller to pass to redeem RPC — account with ≥10 pts, else best balance, else last order seller, else first owner. */
  let redeemSellerId: string | null =
    [...balanceRows].sort((a, b) => b.points_balance - a.points_balance).find((r) => r.points_balance >= 10)?.seller_id ?? null;

  if (!redeemSellerId) {
    const best = [...balanceRows].sort((a, b) => b.points_balance - a.points_balance)[0];
    if (best?.seller_id) redeemSellerId = best.seller_id;
  }

  if (!redeemSellerId) {
    const { data: lastOrd } = await supabase
      .from('orders')
      .select('seller_id')
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    redeemSellerId = (lastOrd as { seller_id?: string } | null)?.seller_id ?? null;
  }

  if (!redeemSellerId) {
    const { data: owner } = await supabase
      .from('profiles')
      .select('user_id')
      .eq('role', 'seller')
      .eq('seller_team_role', 'owner')
      .limit(1)
      .maybeSingle();
    redeemSellerId = owner?.user_id ?? null;

    if (!redeemSellerId) {
      const { data: anySeller } = await supabase.from('profiles').select('user_id').eq('role', 'seller').limit(1).maybeSingle();
      redeemSellerId = anySeller?.user_id ?? null;
    }
  }

  return { totalPoints, redeemSellerId, balanceRows };
}
