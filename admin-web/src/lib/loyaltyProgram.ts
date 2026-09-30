import { supabase } from './supabase';

export async function fetchLoyaltyProgramActive(businessId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('profiles')
    .select('loyalty_points_active')
    .eq('user_id', businessId)
    .maybeSingle();
  if (error) throw error;
  return data?.loyalty_points_active === true;
}

export async function setLoyaltyProgramActive(businessId: string, active: boolean): Promise<void> {
  const { error } = await supabase.from('profiles').update({ loyalty_points_active: active }).eq('user_id', businessId);
  if (error) throw error;
}

export async function countLoyaltyEligibleProducts(businessId: string): Promise<number> {
  const { count, error } = await supabase
    .from('products')
    .select('id', { count: 'exact', head: true })
    .eq('seller_id', businessId)
    .eq('earn_loyalty_points', true);
  if (error) throw error;
  return count ?? 0;
}
