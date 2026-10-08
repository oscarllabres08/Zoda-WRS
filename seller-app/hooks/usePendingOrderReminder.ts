import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { onPendingReminderRefresh } from '../lib/pendingReminderEvents';
import {
  fetchStaleUnviewedPendingOrders,
  requestPendingOrderReminders,
  type StalePendingOrder,
} from '../lib/pendingOrderReminder';
import { getBannerSnoozeUntil, snoozeBanner } from '../lib/pendingReminderSnooze';
import { getViewedOrderIds } from '../lib/viewedOrders';
import { supabase } from '../lib/supabase';
import { useAuth } from '../providers/AuthProvider';

export function usePendingOrderReminder() {
  const { businessId, user } = useAuth();
  const scopeId = businessId && user?.id ? `${businessId}:${user.id}` : null;
  const [staleOrders, setStaleOrders] = useState<StalePendingOrder[]>([]);
  const [snoozeUntil, setSnoozeUntil] = useState(0);

  const refresh = useCallback(async () => {
    if (!businessId || !user || !scopeId) {
      setStaleOrders([]);
      setSnoozeUntil(0);
      return;
    }
    const until = await getBannerSnoozeUntil(scopeId);
    setSnoozeUntil(until);
    const viewed = await getViewedOrderIds(businessId);
    const stale = await fetchStaleUnviewedPendingOrders(businessId, viewed);
    setStaleOrders(stale);
    const snoozed = until > Date.now();
    if (stale.length > 0 && !snoozed) {
      await requestPendingOrderReminders(stale.map((o) => o.id));
    }
  }, [businessId, user, scopeId]);

  const dismissBanner = useCallback(async () => {
    if (!scopeId) return;
    const until = await snoozeBanner(scopeId);
    setSnoozeUntil(until);
  }, [scopeId]);

  const visibleOrders = useMemo(() => {
    if (snoozeUntil > Date.now()) return [];
    return staleOrders;
  }, [staleOrders, snoozeUntil]);

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

  useEffect(() => {
    if (snoozeUntil <= Date.now()) return;
    const delay = snoozeUntil - Date.now() + 250;
    const t = setTimeout(() => void refresh(), delay);
    return () => clearTimeout(t);
  }, [snoozeUntil, refresh]);

  return { visibleOrders, dismissBanner, refresh };
}
