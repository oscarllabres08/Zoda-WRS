/**
 * Online sales (dashboard + reports): count orders once the seller marks payment received.
 * Fulfillment status does not matter (pending + paid still counts); cancelled orders never count.
 */
export function orderCountsTowardOnlineSales(o: {
  status: string;
  payment_method?: string | null;
  payment_settled?: boolean | null;
}): boolean {
  if (o.payment_settled !== true) return false;
  if (o.status === 'cancelled') return false;
  return true;
}
