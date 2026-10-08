import { useCallback, useEffect, useState } from 'react';

import {
  fetchStaleUnviewedPendingOrders,
  requestPendingOrderReminders,
  type StalePendingOrder,
} from '../lib/pendingOrderReminder';
import { getViewedOrderIds } from '../lib/viewedOrders';
import { supabase } from '../lib/supabase';

export function usePendingOrderReminder(businessId: string | null) {
  const [staleOrders, setStaleOrders] = useState<StalePendingOrder[]>([]);

  const refresh = useCallback(async () => {
    if (!businessId) {
      setStaleOrders([]);
      return;
    }
    const viewed = getViewedOrderIds(businessId);
    const stale = await fetchStaleUnviewedPendingOrders(businessId, viewed);
    setStaleOrders(stale);
    if (stale.length > 0) {
      await requestPendingOrderReminders(stale.map((o) => o.id));
    }
  }, [businessId]);

  useEffect(() => {
    void refresh();
    const t = setInterval(() => void refresh(), 60_000);
    function onViewedChange(e: Event) {
      const detail = (e as CustomEvent<{ businessId?: string }>).detail;
      if (!businessId || detail?.businessId === businessId) void refresh();
    }
    window.addEventListener('admin-viewed-orders-changed', onViewedChange);
    window.addEventListener('focus', onViewedChange);
    return () => {
      clearInterval(t);
      window.removeEventListener('admin-viewed-orders-changed', onViewedChange);
      window.removeEventListener('focus', onViewedChange);
    };
  }, [refresh, businessId]);

  useEffect(() => {
    if (!businessId) return;
    const channel = supabase
      .channel(`admin-pending-reminder-${businessId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders', filter: `seller_id=eq.${businessId}` },
        () => void refresh()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [businessId, refresh]);

  return { staleOrders, refresh };
}
