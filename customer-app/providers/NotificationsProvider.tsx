import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { AppState, type AppStateStatus, Platform } from 'react-native';

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
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prefsRef = useRef<{ notificationsEnabled: boolean; soundEnabled: boolean }>({
    notificationsEnabled: true,
    soundEnabled: true,
  });

  async function ensurePushTokenRegistered() {
    if (!user) return;
    if (!Device.isDevice) return;
    if (Platform.OS === 'web') return;

    try {
      const perm = await Notifications.getPermissionsAsync();
      const status = perm.status === 'granted' ? perm.status : (await Notifications.requestPermissionsAsync()).status;
      if (status !== 'granted') {
        console.warn('[push] Notification permission not granted.');
        return;
      }

      const token = await Notifications.getDevicePushTokenAsync();
      const deviceToken = token?.data ? String(token.data) : '';
      if (!deviceToken) {
        console.warn('[push] No device push token.');
        return;
      }

      const { error } = await supabase.from('push_tokens').upsert(
        {
          user_id: user.id,
          app: 'customer',
          platform: Platform.OS,
          token: deviceToken,
        },
        { onConflict: 'user_id,app,platform' }
      );
      if (error) console.warn('[push] push_tokens upsert failed:', error.message);
    } catch (e) {
      console.warn('[push] ensurePushTokenRegistered:', e instanceof Error ? e.message : String(e));
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
      .select('id', { count: 'exact', head: true })
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
    const userId = user.id;
    let alive = true;
    async function loadPrefs() {
      const { data, error } = await supabase
        .from('profiles')
        .select('notifications_enabled,notification_sound_enabled')
        .eq('user_id', userId)
        .maybeSingle();
      if (!alive) return;
      if (error) {
        if (__DEV__) console.warn('[NotificationsProvider] profile prefs:', error.message);
        prefsRef.current = { notificationsEnabled: true, soundEnabled: true };
        return;
      }
      prefsRef.current = {
        notificationsEnabled: (data as any)?.notifications_enabled ?? true,
        soundEnabled: (data as any)?.notification_sound_enabled ?? true,
      };
    }
    loadPrefs();
    const channel = supabase
      .channel(`notif-prefs-customer-${userId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `user_id=eq.${userId}` }, () => loadPrefs())
      .subscribe();
    return () => {
      alive = false;
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  useEffect(() => {
    if (!user) return;
    const userId = user.id;
    const channel = supabase
      .channel(`notif-badge-customer-${userId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `recipient_id=eq.${userId}` },
        async (payload) => {
          const n = payload.new as any;
          const id = String(n.id ?? '');
          if (id && lastPopupIdRef.current !== id) {
            lastPopupIdRef.current = id;

            // In-app toast (shows on any page). Auto dismiss after 3s.
            const rowData =
              n.data && typeof n.data === 'object' && !Array.isArray(n.data) ? (n.data as Record<string, unknown>) : {};
            setToast({
              id: id || String(Date.now()),
              title: String(n.title ?? 'Notification'),
              body: String(n.body ?? ''),
              data: {
                orderId: (n.order_id as string | undefined) ?? (rowData.orderId as string | undefined),
              } as Record<string, unknown>,
            });
            if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
            toastTimerRef.current = setTimeout(() => setToast(null), 3000);
          }
          void refresh();
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'notifications', filter: `recipient_id=eq.${userId}` },
        () => void refresh()
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'notifications', filter: `recipient_id=eq.${userId}` },
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

