import AsyncStorage from '@react-native-async-storage/async-storage';

const viewedKey = (businessId: string) => `seller_viewed_orders_${businessId}`;
const seededKey = (businessId: string) => `seller_viewed_orders_seeded_${businessId}`;

export async function getViewedOrderIds(businessId: string): Promise<Set<string>> {
  const raw = await AsyncStorage.getItem(viewedKey(businessId));
  if (!raw) return new Set();
  try {
    const ids = JSON.parse(raw) as string[];
    return new Set(Array.isArray(ids) ? ids : []);
  } catch {
    return new Set();
  }
}

export async function markOrderViewed(businessId: string, orderId: string): Promise<void> {
  if (!orderId) return;
  const set = await getViewedOrderIds(businessId);
  if (set.has(orderId)) return;
  set.add(orderId);
  await AsyncStorage.setItem(viewedKey(businessId), JSON.stringify([...set]));
}

/** One-time: treat existing orders as already seen so only newly arriving orders show NEW. */
export async function seedViewedOrdersIfNeeded(businessId: string, orderIds: string[]): Promise<void> {
  const done = await AsyncStorage.getItem(seededKey(businessId));
  if (done) return;
  await AsyncStorage.setItem(viewedKey(businessId), JSON.stringify(orderIds));
  await AsyncStorage.setItem(seededKey(businessId), '1');
}
