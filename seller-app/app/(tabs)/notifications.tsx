import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';

import { navigateFromSellerNotification } from '../../lib/notificationNavigation';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../providers/AuthProvider';
import { useNotifications } from '../../providers/NotificationsProvider';
import { Screen } from '../../ui/components/Screen';
import { Card } from '../../ui/components/Card';
import { Text } from '../../ui/components/Text';
import { Button } from '../../ui/components/Button';
import { theme } from '../../ui/theme';

type NotifRow = {
  id: string;
  kind: string;
  title: string;
  body: string;
  created_at: string;
  read_at: string | null;
  data: Record<string, unknown> | null;
  order_id: string | null;
};

function timeLabel(iso: string) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export default function NotificationsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { refresh, unreadCount } = useNotifications();
  const [rows, setRows] = useState<NotifRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setErr(null);
    setLoading(true);
    const { data, error } = await supabase
      .from('notifications')
      .select('id,kind,title,body,created_at,read_at,data,order_id')
      .eq('recipient_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) setErr(error.message);
    setRows((data ?? []) as NotifRow[]);
    setLoading(false);
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      void load();
      void refresh();
    }, [load, refresh])
  );

  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel(`seller-notifs-tab-${user.id}-${Date.now()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `recipient_id=eq.${user.id}` }, () => void load())
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [user, load]);

  const localUnread = useMemo(() => rows.filter((r) => !r.read_at).length, [rows]);

  async function markRead(id: string) {
    if (!user) return false;
    const now = new Date().toISOString();
    const { error } = await supabase.from('notifications').update({ read_at: now }).eq('id', id).eq('recipient_id', user.id);
    if (error) {
      Alert.alert('Could not mark as read', error.message);
      return false;
    }
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, read_at: now } : r)));
    await refresh();
    return true;
  }

  async function clearAll() {
    if (!user) return;
    const { error } = await supabase.from('notifications').delete().eq('recipient_id', user.id);
    if (error) setErr(error.message);
    setRows([]);
    await refresh();
  }

  async function onRefresh() {
    setRefreshing(true);
    await load();
    await refresh();
    setRefreshing(false);
  }

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Text variant="title" weight="extrabold" style={{ flex: 1 }}>
          Notifications
        </Text>
        <Button variant="ghost" title="Clear all" onPress={() => void clearAll()} />
      </View>
      <Text variant="muted" weight="semibold" style={{ marginTop: 4 }}>
        {localUnread || unreadCount ? `${Math.max(localUnread, unreadCount)} unread` : 'All caught up'} — synced with push alerts
      </Text>

      {err ? (
        <Text style={{ color: theme.colors.danger, marginTop: 8 }} weight="bold">
          {err}
        </Text>
      ) : null}

      <ScrollView
        style={{ marginTop: theme.spacing.md }}
        contentContainerStyle={{ paddingBottom: theme.spacing.xl, gap: 10 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} />}
      >
        {loading ? <Text variant="muted">Loading…</Text> : null}
        {!loading && rows.length === 0 ? (
          <Card>
            <Text weight="extrabold">No notifications yet</Text>
            <Text variant="muted" style={{ marginTop: 6 }}>
              New customer orders and updates from the admin site appear here in realtime.
            </Text>
          </Card>
        ) : null}

        {rows.map((n) => (
          <Pressable
            key={n.id}
            onPress={async () => {
              const ok = await markRead(n.id);
              if (!ok) return;
              navigateFromSellerNotification(router, {
                order_id: n.order_id,
                kind: n.kind,
                data: n.data ?? undefined,
              });
            }}
            style={{
              padding: 14,
              borderRadius: 16,
              borderWidth: 1,
              borderColor: theme.colors.border,
              backgroundColor: n.read_at ? '#FFFFFF' : 'rgba(18,101,214,0.06)',
            }}
          >
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Ionicons
                name={n.read_at ? 'notifications-outline' : 'notifications'}
                size={22}
                color={theme.colors.primary}
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
            </View>
          </Pressable>
        ))}
      </ScrollView>
    </Screen>
  );
}
