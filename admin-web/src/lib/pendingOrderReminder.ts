import { supabase } from './supabase';

export type StalePendingOrder = {
  id: string;
  customer_name: string | null;
  created_at: string;
};

export const PENDING_REMINDER_MS = 30 * 60 * 1000;

export async function fetchStaleUnviewedPendingOrders(
  businessId: string,
  viewedOrderIds: Set<string>
): Promise<StalePendingOrder[]> {
  const cutoff = new Date(Date.now() - PENDING_REMINDER_MS).toISOString();
  const { data, error } = await supabase
    .from('orders')
    .select('id,customer_name,created_at')
    .eq('seller_id', businessId)
    .eq('status', 'pending')
    .lt('created_at', cutoff);

  if (error) return [];
  return (data ?? []).filter((o) => !viewedOrderIds.has(o.id)) as StalePendingOrder[];
}

export async function requestPendingOrderReminders(orderIds: string[]): Promise<void> {
  for (const id of orderIds) {
    await supabase.rpc('request_pending_order_reminder', { p_order_id: id });
  }
}
