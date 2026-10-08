export function orderCountsTowardOnlineSales(o: {
  status: string;
  payment_method?: string | null;
  payment_settled?: boolean | null;
}): boolean {
  if (o.payment_settled !== true) return false;
  if (o.status === 'cancelled') return false;
  return true;
}

export function posCountsTowardWalkInSales(s: { payment_settled?: boolean | null }): boolean {
  return s.payment_settled === true;
}

export function saleRecordedAt(row: {
  created_at: string;
  payment_settled_at?: string | null;
  payment_settled?: boolean | null;
}): Date | null {
  if (row.payment_settled !== true) return null;
  return new Date(row.payment_settled_at ?? row.created_at);
}

export function isSaleRecordedInRange(
  row: {
    created_at: string;
    payment_settled_at?: string | null;
    payment_settled?: boolean | null;
  },
  from: Date,
  to: Date
): boolean {
  const at = saleRecordedAt(row);
  if (!at) return false;
  return at >= from && at <= to;
}
