import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { useAuth } from '../auth/AuthProvider';
import { playNotificationSound } from '../lib/playNotificationSound';
import { supabase } from '../lib/supabase';

type Toast = {
  id: string;
  title: string;
  body: string;
  kind: string;
  orderId?: string;
};

type NotificationsContextValue = {
  unreadCount: number;
  refresh: () => Promise<void>;
  toast: Toast | null;
  dismissToast: () => void;
};

const NotificationsContext = createContext<NotificationsContextValue | undefined>(undefined);

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { user, isStoreOwner } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);
  const [toast, setToast] = useState<Toast | null>(null);
  const lastPopupIdRef = useRef<string | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prefsRef = useRef({ notificationsEnabled: true, soundEnabled: true });
  const channelInstanceRef = useRef(Math.random().toString(36).slice(2));

  const refresh = useCallback(async () => {
    if (!user?.id || !isStoreOwner) {
      setUnreadCount(0);
      return;
    }
    const { count, error } = await supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('recipient_id', user.id)
      .is('read_at', null);
    if (!error && typeof count === 'number') {
      setUnreadCount(count);
      return;
    }
    const { data } = await supabase
      .from('notifications')
      .select('id')
      .eq('recipient_id', user.id)
      .is('read_at', null)
      .limit(5000);
    setUnreadCount((data ?? []).length);
  }, [user?.id, isStoreOwner]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!user?.id || !isStoreOwner) return;
    const t = setInterval(() => void refresh(), 45_000);
    return () => clearInterval(t);
  }, [user?.id, isStoreOwner, refresh]);

  useEffect(() => {
    if (!user?.id || !isStoreOwner) return;
    let alive = true;
    void (async () => {
      const { data } = await supabase
        .from('profiles')
        .select('notifications_enabled,notification_sound_enabled')
        .eq('user_id', user.id)
        .maybeSingle();
      if (!alive) return;
      const row = data as { notifications_enabled?: boolean; notification_sound_enabled?: boolean } | null;
      prefsRef.current = {
        notificationsEnabled: row?.notifications_enabled ?? true,
        soundEnabled: row?.notification_sound_enabled ?? true,
      };
    })();
    return () => {
      alive = false;
    };
  }, [user?.id, isStoreOwner]);

  useEffect(() => {
    if (!user?.id || !isStoreOwner) return;
    const channel = supabase
      .channel(`admin-notif-${user.id}-${channelInstanceRef.current}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `recipient_id=eq.${user.id}` },
        (payload) => {
          const n = payload.new as Record<string, unknown>;
          const id = String(n.id ?? '');
          if (!id || lastPopupIdRef.current === id) return;
          lastPopupIdRef.current = id;

          if (prefsRef.current.notificationsEnabled) {
            const rowData =
              n.data && typeof n.data === 'object' && !Array.isArray(n.data)
                ? (n.data as Record<string, unknown>)
                : {};
            setToast({
              id,
              title: String(n.title ?? 'Notification'),
              body: String(n.body ?? ''),
              kind: String(n.kind ?? rowData.kind ?? ''),
              orderId: (n.order_id as string | undefined) ?? (rowData.orderId as string | undefined),
            });
            if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
            toastTimerRef.current = setTimeout(() => setToast(null), 5000);

            if (prefsRef.current.soundEnabled) {
              playNotificationSound();
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
  }, [user?.id, isStoreOwner, refresh]);

  const dismissToast = useCallback(() => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = null;
    setToast(null);
  }, []);

  const value = useMemo<NotificationsContextValue>(
    () => ({ unreadCount, refresh, toast, dismissToast }),
    [unreadCount, refresh, toast, dismissToast]
  );

  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
}

export function useNotifications() {
  const ctx = useContext(NotificationsContext);
  if (!ctx) throw new Error('useNotifications must be used within NotificationsProvider');
  return ctx;
}
