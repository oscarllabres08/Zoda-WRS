import { useCallback, useEffect, useMemo, useState } from 'react';

import { useAuth } from '../auth/AuthProvider';
import {
  fetchStaleUnviewedPendingOrders,
  requestPendingOrderReminders,
  type StalePendingOrder,
} from '../lib/pendingOrderReminder';
import { getBannerSnoozeUntil, snoozeBanner } from '../lib/pendingReminderSnooze';
import { getViewedOrderIds } from '../lib/viewedOrders';
import { supabase } from '../lib/supabase';

export function usePendingOrderReminder(businessId: string | null) {
  const { user } = useAuth();
  const scopeId = businessId && user?.id ? `${businessId}:${user.id}` : null;
  const [staleOrders, setStaleOrders] = useState<StalePendingOrder[]>([]);
  const [snoozeUntil, setSnoozeUntil] = useState(0);

  const refresh = useCallback(async () => {
    if (!businessId || !scopeId) {
      setStaleOrders([]);
      setSnoozeUntil(0);
      return;
    }
    const until = getBannerSnoozeUntil(scopeId);
    setSnoozeUntil(until);
    const viewed = getViewedOrderIds(businessId);
    const stale = await fetchStaleUnviewedPendingOrders(businessId, viewed);
    setStaleOrders(stale);
    const snoozed = until > Date.now();
    if (stale.length > 0 && !snoozed) {
      await requestPendingOrderReminders(stale.map((o) => o.id));
    }
  }, [businessId, scopeId]);

  const dismissBanner = useCallback(() => {
    if (!scopeId) return;
    const until = snoozeBanner(scopeId);
    setSnoozeUntil(until);
  }, [scopeId]);

  const visibleOrders = useMemo(() => {
    if (snoozeUntil > Date.now()) return [];
    return staleOrders;
  }, [staleOrders, snoozeUntil]);

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

  useEffect(() => {
    if (snoozeUntil <= Date.now()) return;
    const delay = snoozeUntil - Date.now() + 250;
    const t = setTimeout(() => void refresh(), delay);
    return () => clearTimeout(t);
  }, [snoozeUntil, refresh]);

  return { visibleOrders, dismissBanner, refresh };
}
