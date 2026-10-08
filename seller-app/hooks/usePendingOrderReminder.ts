import { useCallback, useEffect, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { onPendingReminderRefresh } from '../lib/pendingReminderEvents';
import { getViewedOrderIds } from '../lib/viewedOrders';
import {
  fetchStaleUnviewedPendingOrders,
  requestPendingOrderReminders,
  type StalePendingOrder,
} from '../lib/pendingOrderReminder';
import { supabase } from '../lib/supabase';
import { useAuth } from '../providers/AuthProvider';

export function usePendingOrderReminder() {
  const { businessId, user } = useAuth();
  const [staleOrders, setStaleOrders] = useState<StalePendingOrder[]>([]);

  const refresh = useCallback(async () => {
    if (!businessId || !user) {
      setStaleOrders([]);
      return;
    }
    const viewed = await getViewedOrderIds(businessId);
    const stale = await fetchStaleUnviewedPendingOrders(businessId, viewed);
    setStaleOrders(stale);
    if (stale.length > 0) {
      await requestPendingOrderReminders(stale.map((o) => o.id));
    }
  }, [businessId, user]);

  useEffect(() => {
    void refresh();
    const t = setInterval(() => void refresh(), 60_000);
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next === 'active') void refresh();
    });
    const off = onPendingReminderRefresh(() => void refresh());
    return () => {
      clearInterval(t);
      sub.remove();
      off();
    };
  }, [refresh]);

  useEffect(() => {
    if (!businessId) return;
    const channel = supabase
      .channel(`seller-pending-reminder-${businessId}`)
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
