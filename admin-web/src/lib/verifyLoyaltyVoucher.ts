import { supabase } from './supabase';

export type VoucherVerifyResponse = {
  ok?: boolean;
  error?: string;
  message?: string;
  code?: string;
  used_at?: string;
  expires_at?: string;
};

export async function verifyLoyaltyVoucherCode(code: string): Promise<VoucherVerifyResponse> {
  const trimmed = code.trim();
  const { data, error } = await supabase.rpc('seller_verify_loyalty_voucher', { p_code: trimmed });
  if (error) throw error;
  return (data ?? {}) as VoucherVerifyResponse;
}
