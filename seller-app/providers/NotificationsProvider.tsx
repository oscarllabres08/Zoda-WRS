import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import * as Notifications from 'expo-notifications';
import { AppState, type AppStateStatus } from 'react-native';

import { ensureAndroidNotificationChannels } from '../lib/notificationChannels';
import { registerSellerPushToken } from '../lib/registerPushToken';
import { setNotificationRuntimePrefs } from '../lib/notificationRuntime';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthProvider';

type Ctx = {
  unreadCount: number;
  refresh: () => Promise<void>;
  toast: { id: string; title: string; body: string; data?: Record<string, unknown> } | null;
  dismissToast: () => void;
};

const NotificationsContext = createContext<Ctx | undefined>(undefined);

export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);
  const [toast, setToast] = useState<Ctx['toast']>(null);
  const lastPopupIdRef = useRef<string | null>(null);
  const lastOrderAlertRef = useRef<{ orderId: string; kind: string; at: number } | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prefsRef = useRef<{ notificationsEnabled: boolean; soundEnabled: boolean }>({
    notificationsEnabled: true,
    soundEnabled: true,
  });

  function applyPrefsToRuntime(p: { notificationsEnabled: boolean; soundEnabled: boolean }) {
    prefsRef.current = p;
    setNotificationRuntimePrefs(p);
  }

  async function ensurePushTokenRegistered() {
    if (!user) return;
    const res = await registerSellerPushToken(user.id);
    if (!res.ok && __DEV__) {
      console.warn('[push] registerSellerPushToken:', res.reason);
    }
  }

  const refresh = useCallback(async () => {
    if (!user) {
      setUnreadCount(0);
      return;
    }
    // Prefer HEAD count (fast), but fall back to selecting ids if count is missing.
    const { count, error } = await supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('recipient_id', user.id)
      .is('read_at', null);
    if (!error && typeof count === 'number') {
      setUnreadCount(count);
      return;
    }
    if (error && __DEV__) console.warn('[NotificationsProvider] badge count:', error.message);
    const { data, error: fallbackErr } = await supabase
      .from('notifications')
      .select('id')
      .eq('recipient_id', user.id)
      .is('read_at', null)
      .limit(5000);
    if (fallbackErr) {
      if (__DEV__) console.warn('[NotificationsProvider] badge fallback:', fallbackErr.message);
      setUnreadCount(0);
      return;
    }
    setUnreadCount((data ?? []).length);
  }, [user?.id]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Fallback when Realtime is off or postgres_changes is not subscribed: still pick up new rows periodically.
  useEffect(() => {
    if (!user?.id) return;
    const t = setInterval(() => {
      void refresh();
    }, 45_000);
    return () => clearInterval(t);
  }, [user?.id, refresh]);

  useEffect(() => {
    void ensureAndroidNotificationChannels();
  }, []);

  useEffect(() => {
    void ensurePushTokenRegistered();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) return;
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next === 'active') void ensurePushTokenRegistered();
    });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  useEffect(() => {
    if (!user) return;
    let alive = true;
    async function loadPrefs() {
      if (!user) return;
      const { data, error } = await supabase
        .from('profiles')
        .select('notifications_enabled,notification_sound_enabled')
        .eq('user_id', user.id)
        .maybeSingle();
      if (!alive) return;
      if (error) {
        if (__DEV__) console.warn('[NotificationsProvider] profile prefs:', error.message);
        applyPrefsToRuntime({ notificationsEnabled: true, soundEnabled: true });
        return;
      }
      applyPrefsToRuntime({
        notificationsEnabled: (data as any)?.notifications_enabled ?? true,
        soundEnabled: (data as any)?.notification_sound_enabled ?? true,
      });
    }
    loadPrefs();
    const channel = supabase
      .channel(`notif-prefs-${user.id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `user_id=eq.${user.id}` }, () => loadPrefs())
      .subscribe();
    return () => {
      alive = false;
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`notif-badge-${user.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `recipient_id=eq.${user.id}` },
        async (payload) => {
          const n = payload.new as any;
          const id = String(n.id ?? '');
          if (id && lastPopupIdRef.current !== id) {
            lastPopupIdRef.current = id;

            const rowData =
              n.data && typeof n.data === 'object' && !Array.isArray(n.data) ? (n.data as Record<string, unknown>) : {};
            const orderId = (n.order_id as string | undefined) ?? (rowData.orderId as string | undefined);
            const kind = String(n.kind ?? rowData.kind ?? '');
            const toastData = {
              orderId,
              kind,
              pendingUserId: (rowData.pending_user_id as string | undefined) ?? (rowData.pendingUserId as string | undefined),
            } as Record<string, unknown>;

            if (orderId && (kind === 'new_order' || kind === 'order_activity')) {
              const now = Date.now();
              const prev = lastOrderAlertRef.current;
              if (prev && prev.orderId === orderId && prev.kind === kind && now - prev.at < 60_000) {
                void refresh();
                return;
              }
              lastOrderAlertRef.current = { orderId, kind, at: now };
            }

            if (prefsRef.current.notificationsEnabled) {
              setToast({
                id: id || String(Date.now()),
                title: String(n.title ?? 'Notification'),
                body: String(n.body ?? ''),
                data: toastData,
              });
              if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
              const toastMs = kind === 'pending_order_reminder' ? 6000 : 3000;
              toastTimerRef.current = setTimeout(() => setToast(null), toastMs);
            }
          }
          void refresh();
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'notifications', filter: `recipient_id=eq.${user.id}` },
        () => void refresh()
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'notifications', filter: `recipient_id=eq.${user.id}` },
        () => void refresh()
      )
      .subscribe();
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const dismissToast = useCallback(() => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = null;
    setToast(null);
  }, []);

  const value = useMemo<Ctx>(() => ({ unreadCount, refresh, toast, dismissToast }), [unreadCount, refresh, toast, dismissToast]);

  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
}

export function useNotifications() {
  const ctx = useContext(NotificationsContext);
  if (!ctx) throw new Error('useNotifications must be used within NotificationsProvider');
  return ctx;
}

