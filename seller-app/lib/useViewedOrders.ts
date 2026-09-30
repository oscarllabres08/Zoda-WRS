import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';

import { getViewedOrderIds, markOrderViewed, seedViewedOrdersIfNeeded } from './viewedOrders';

export function useViewedOrders(businessId: string | null) {
  const [viewedOrderIds, setViewedOrderIds] = useState<Set<string>>(() => new Set());

  const reloadViewed = useCallback(async () => {
    if (!businessId) {
      setViewedOrderIds(new Set());
      return;
    }
    setViewedOrderIds(await getViewedOrderIds(businessId));
  }, [businessId]);

  useFocusEffect(
    useCallback(() => {
      void reloadViewed();
    }, [reloadViewed])
  );

  const seedIfNeeded = useCallback(
    async (orderIds: string[]) => {
      if (!businessId) return;
      await seedViewedOrdersIfNeeded(businessId, orderIds);
      await reloadViewed();
    },
    [businessId, reloadViewed]
  );

  const markViewed = useCallback(
    async (orderId: string) => {
      if (!businessId || !orderId) return;
      await markOrderViewed(businessId, orderId);
      setViewedOrderIds((prev) => {
        if (prev.has(orderId)) return prev;
        const next = new Set(prev);
        next.add(orderId);
        return next;
      });
    },
    [businessId]
  );

  const isNewOrder = useCallback((orderId: string) => !viewedOrderIds.has(orderId), [viewedOrderIds]);

  return { viewedOrderIds, seedIfNeeded, markViewed, isNewOrder, reloadViewed };
}
