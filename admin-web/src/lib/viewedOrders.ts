const viewedKey = (businessId: string) => `admin_viewed_orders_${businessId}`;

export function getViewedOrderIds(businessId: string): Set<string> {
  try {
    const raw = localStorage.getItem(viewedKey(businessId));
    if (!raw) return new Set();
    const ids = JSON.parse(raw) as string[];
    return new Set(Array.isArray(ids) ? ids : []);
  } catch {
    return new Set();
  }
}

export function markOrderViewed(businessId: string, orderId: string): void {
  if (!orderId) return;
  const set = getViewedOrderIds(businessId);
  if (set.has(orderId)) return;
  set.add(orderId);
  localStorage.setItem(viewedKey(businessId), JSON.stringify([...set]));
  window.dispatchEvent(new CustomEvent('admin-viewed-orders-changed', { detail: { businessId } }));
}
