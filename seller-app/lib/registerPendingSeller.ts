import { supabase } from './supabase';

export type RegisterPendingSellerResult = {
  ok?: boolean;
  owner?: boolean;
  approved?: boolean;
  pending?: boolean;
  already?: string;
  error?: string;
  message?: string;
};

export async function registerPendingSeller(input: {
  displayName: string;
  phone?: string | null;
}): Promise<{ data: RegisterPendingSellerResult | null; error: string | null }> {
  const payload: { p_display_name: string; p_phone?: string } = {
    p_display_name: input.displayName.trim(),
  };
  const phone = input.phone?.trim();
  if (phone) payload.p_phone = phone;

  const { data, error } = await supabase.rpc('register_pending_seller', payload);
  if (error) return { data: null, error: error.message };

  const regObj = (data ?? null) as RegisterPendingSellerResult | null;
  if (regObj?.ok === false) {
    return { data: regObj, error: regObj.message ?? 'Registration could not be submitted.' };
  }
  return { data: regObj, error: null };
}
