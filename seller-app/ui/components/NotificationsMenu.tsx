import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

import { supabase } from '../../lib/supabase';
import { useAuth } from '../../providers/AuthProvider';
import { useNotifications } from '../../providers/NotificationsProvider';
import { theme } from '../theme';
import { Card } from './Card';
import { Text } from './Text';
import { Button } from './Button';

type NotifRow = {
  id: string;
  kind: string;
  title: string;
  body: string;
  created_at: string;
  read_at: string | null;
  data: any;
  order_id: string | null;
};

function timeLabel(iso: string) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export function NotificationsMenu({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const { user } = useAuth();
  const { refresh } = useNotifications();
  const channelInstanceIdRef = useRef(Math.random().toString(36).slice(2));
  const [rows, setRows] = useState<NotifRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    if (!user) return;
    setErr(null);
    setLoading(true);
    const { data, error } = await supabase
      .from('notifications')
      .select('id,kind,title,body,created_at,read_at,data,order_id')
      .eq('recipient_id', user.id)
      .order('created_at', { ascending: false })
      .limit(30);
    if (error) setErr(error.message);
    setRows((data ?? []) as NotifRow[]);
    setLoading(false);
  }

  useEffect(() => {
    if (!visible) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, user?.id]);

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`seller-notifs-menu-${user.id}-${channelInstanceIdRef.current}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notifications', filter: `recipient_id=eq.${user.id}` },
        () => load()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const unreadCount = useMemo(() => rows.filter((r) => !r.read_at).length, [rows]);

  async function markRead(id: string): Promise<boolean> {
    if (!user) return false;
    const now = new Date().toISOString();
    const { error } = await supabase.from('notifications').update({ read_at: now }).eq('id', id).eq('recipient_id', user.id);
    if (error) {
      setErr(error.message);
      Alert.alert('Could not mark as read', error.message);
      return false;
    }
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, read_at: now } : r)));
    await refresh();
    return true;
  }

  async function clearAll() {
    if (!user) return;
    setErr(null);
    const { error } = await supabase.from('notifications').delete().eq('recipient_id', user.id);
    if (error) setErr(error.message);
    setRows([]);
    await refresh();
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.20)', padding: theme.spacing.md }}>
        <Pressable
          onPress={() => {}}
          style={{
            marginTop: 54,
            borderRadius: 18,
            backgroundColor: theme.colors.card,
            borderWidth: 1,
            borderColor: theme.colors.border,
            overflow: 'hidden',
            ...theme.shadow.card,
          }}
        >
          <View style={{ padding: theme.spacing.md, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View
              style={{
                width: 38,
                height: 38,
                borderRadius: 12,
                backgroundColor: 'rgba(18,101,214,0.08)',
                borderWidth: 1,
                borderColor: 'rgba(18,101,214,0.12)',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Ionicons name="notifications-outline" size={18} color={theme.colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text variant="h2" weight="extrabold">
                Notifications
              </Text>
              <Text variant="muted">{unreadCount ? `${unreadCount} unread` : 'All caught up'}</Text>
            </View>
            <Button variant="ghost" title="Clear" onPress={clearAll} />
          </View>

          <View style={{ height: 1, backgroundColor: theme.colors.border }} />

          <ScrollView style={{ maxHeight: 420 }} contentContainerStyle={{ padding: theme.spacing.md, gap: 10 }}>
            {loading ? <Text variant="muted">Loading…</Text> : null}
            {err ? <Text style={{ color: theme.colors.danger }}>{err}</Text> : null}
            {!loading && !err && rows.length === 0 ? (
              <Card style={{ backgroundColor: '#FBFDFF' }}>
                <Text weight="extrabold">No notifications yet</Text>
                <Text variant="muted" style={{ marginTop: 6 }}>
                  New orders and updates will show here.
                </Text>
              </Card>
            ) : null}

            {rows.map((n) => {
              const orderId = (n.order_id ?? n.data?.orderId) as string | undefined;
              const kind = (n.kind ?? n.data?.kind ?? n.data?.type) as string | undefined;
              const isRegistrationRequest = kind === 'seller_registration_pending';
              return (
                <Pressable
                  key={n.id}
                  onPress={async () => {
                    const ok = await markRead(n.id);
                    if (!ok) return;
                    onClose();
                    if (isRegistrationRequest) {
                      router.push('/(tabs)/profile/registrations?returnTo=fromNotification');
                      return;
                    }
                    if (orderId) router.push(`/order/${orderId}`);
                    else router.push('/(tabs)/orders');
                  }}
                  style={{
                    padding: 12,
                    borderRadius: 16,
                    borderWidth: 1,
                    borderColor: theme.colors.border,
                    backgroundColor: n.read_at ? '#FFFFFF' : 'rgba(18,101,214,0.06)',
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
                    <View
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: 999,
                        backgroundColor: n.read_at ? 'transparent' : theme.colors.primary,
                        marginTop: 6,
                        borderWidth: n.read_at ? 1 : 0,
                        borderColor: n.read_at ? theme.colors.border : 'transparent',
                      }}
                    />
                    <View style={{ flex: 1 }}>
                      <Text weight="extrabold">{n.title}</Text>
                      <Text variant="muted" style={{ marginTop: 4 }}>
                        {n.body}
                      </Text>
                      <Text variant="muted" weight="bold" style={{ marginTop: 6 }}>
                        {timeLabel(n.created_at)}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={theme.colors.muted} />
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

