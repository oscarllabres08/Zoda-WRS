export type OrderItemLine = {
  product_name?: string | null;
  unit_price: number;
  quantity: number;
};

export function orderGrandTotal(
  items: OrderItemLine[] | null | undefined,
  deliveryFee?: number | null
): number {
  const sub = (items ?? []).reduce((s, it) => s + Number(it.unit_price) * Number(it.quantity), 0);
  const fee = Math.max(0, Number(deliveryFee ?? 0));
  if (fee <= 0) return sub;
  const hasFeeLine = (items ?? []).some(
    (it) => String(it.product_name ?? '').trim().toLowerCase() === 'delivery fee'
  );
  return hasFeeLine ? sub : sub + fee;
}
