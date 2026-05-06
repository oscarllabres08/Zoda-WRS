import { useEffect, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

import { useAuth } from '../../../providers/AuthProvider';
import { supabase } from '../../../lib/supabase';
import { Screen } from '../../../ui/components/Screen';
import { Card } from '../../../ui/components/Card';
import { Text } from '../../../ui/components/Text';
import { Skeleton } from '../../../ui/components/Skeleton';
import { theme } from '../../../ui/theme';

type OrderRow = {
  id: string;
  status: string;
  created_at: string;
  customer_name: string;
  delivery_address: string;
};

function statusLabel(s: string) {
  if (s === 'pending') return 'Pending';
  if (s === 'confirmed') return 'Confirmed';
  if (s === 'preparing') return 'Preparing';
  if (s === 'on_the_way') return 'On the way';
  if (s === 'delivered') return 'Delivered';
  if (s === 'cancelled') return 'Cancelled';
  return s;
}

type OrderFilter = 'all' | 'active' | 'delivered';

export default function MyOrdersScreen() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [rows, setRows] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [olderOpen, setOlderOpen] = useState(false);
  const [filter, setFilter] = useState<OrderFilter>('all');

  async function load() {
    if (authLoading) return;
    if (!user) return;
    setErr(null);
    setLoading(true);
    const { data, error } = await supabase
      .from('orders')
      .select('id,status,created_at,customer_name,delivery_address')
      .eq('customer_id', user.id)
      .order('created_at', { ascending: false });
    if (error) setErr(error.message);
    setRows((data ?? []) as OrderRow[]);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, authLoading]);

  const active = useMemo(() => rows.filter((r) => r.status !== 'delivered'), [rows]);
  const delivered = useMemo(() => rows.filter((r) => r.status === 'delivered'), [rows]);
  const deliveredSplit = useMemo(() => {
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const recent: OrderRow[] = [];
    const older: OrderRow[] = [];
    for (const o of delivered) {
      const ts = new Date(o.created_at).getTime();
      if (!Number.isFinite(ts) || ts >= cutoff) recent.push(o);
      else older.push(o);
    }
    return { recent, older };
  }, [delivered]);

  return (
    <Screen style={{ padding: 0 }}>
      <ScrollView
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              await load();
              setRefreshing(false);
            }}
          />
        }
        contentContainerStyle={{ padding: theme.spacing.md, paddingBottom: theme.spacing.xl }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Pressable
            onPress={() => router.back()}
            style={{ padding: 10, borderRadius: 14, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: '#fff' }}
          >
            <Ionicons name="arrow-back" size={20} color={theme.colors.text} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text variant="title" weight="extrabold">
              My Orders
            </Text>
            <Text variant="muted" style={{ marginTop: 2 }}>
              {filter === 'all'
                ? 'Active and delivered orders.'
                : filter === 'active'
                  ? 'Orders still in progress.'
                  : 'Completed deliveries.'}
            </Text>
          </View>
        </View>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: theme.spacing.md }}>
          {(
            [
              { key: 'all' as const, label: 'All' },
              { key: 'active' as const, label: 'Active' },
              { key: 'delivered' as const, label: 'Delivered' },
            ] as const
          ).map((opt) => {
            const selected = filter === opt.key;
            const count =
              opt.key === 'all'
                ? rows.length
                : opt.key === 'active'
                  ? active.length
                  : delivered.length;
            return (
              <Pressable
                key={opt.key}
                onPress={() => setFilter(opt.key)}
                style={{
                  paddingVertical: 10,
                  paddingHorizontal: 14,
                  borderRadius: 14,
                  borderWidth: 1,
                  borderColor: selected ? theme.colors.primary : theme.colors.border,
                  backgroundColor: selected ? theme.colors.primary : '#fff',
                }}
              >
                <Text weight="extrabold" style={{ color: selected ? '#fff' : theme.colors.text }}>
                  {opt.label}
                  {!loading ? ` (${count})` : ''}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {err ? (
          <Card style={{ marginTop: theme.spacing.md }}>
            <Text weight="bold" style={{ color: theme.colors.danger }}>
              {err}
            </Text>
          </Card>
        ) : null}

        {(filter === 'all' || filter === 'active') ? (
          <Card style={{ marginTop: theme.spacing.md }}>
            <Text variant="h2" weight="extrabold">
              Active
            </Text>
            {loading ? (
              <View style={{ marginTop: 12, gap: 10 }}>
                <Skeleton height={74} width="100%" radius={16} />
                <Skeleton height={74} width="100%" radius={16} />
              </View>
            ) : active.length === 0 ? (
              <Text variant="muted" style={{ marginTop: 10 }}>
                No active orders.
              </Text>
            ) : (
              <View style={{ marginTop: 10, gap: 10 }}>
                {active.map((o) => (
                  <OrderRowCard key={o.id} row={o} onPress={() => router.push(`/order/${o.id}`)} />
                ))}
              </View>
            )}
          </Card>
        ) : null}

        {(filter === 'all' || filter === 'delivered') ? (
          <Card style={{ marginTop: filter === 'delivered' ? theme.spacing.md : theme.spacing.sm }}>
            <Text variant="h2" weight="extrabold">
              Delivered
            </Text>
            {loading ? (
              <View style={{ marginTop: 12, gap: 10 }}>
                <Skeleton height={74} width="100%" radius={16} />
                <Skeleton height={74} width="100%" radius={16} />
              </View>
            ) : delivered.length === 0 ? (
              <Text variant="muted" style={{ marginTop: 10 }}>
                No delivered orders yet.
              </Text>
            ) : (
              <View style={{ marginTop: 10, gap: 12 }}>
                {deliveredSplit.recent.length > 0 ? (
                  <View style={{ gap: 10 }}>
                    {deliveredSplit.recent.map((o) => (
                      <OrderRowCard key={o.id} row={o} onPress={() => router.push(`/order/${o.id}`)} />
                    ))}
                  </View>
                ) : (
                  <Text variant="muted">No delivered orders in the last 7 days.</Text>
                )}

                {deliveredSplit.older.length > 0 ? (
                  <View style={{ gap: 10 }}>
                    <Pressable
                      onPress={() => setOlderOpen((v) => !v)}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        paddingVertical: 10,
                        paddingHorizontal: 12,
                        borderRadius: 16,
                        borderWidth: 1,
                        borderColor: theme.colors.border,
                        backgroundColor: 'rgba(18,101,214,0.06)',
                      }}
                    >
                      <Text weight="extrabold" style={{ color: theme.colors.text }}>
                        Older than 7 days ({deliveredSplit.older.length})
                      </Text>
                      <Ionicons name={olderOpen ? 'chevron-up' : 'chevron-down'} size={18} color={theme.colors.muted} />
                    </Pressable>
                    {olderOpen ? (
                      <View style={{ gap: 10 }}>
                        {deliveredSplit.older.map((o) => (
                          <OrderRowCard key={o.id} row={o} onPress={() => router.push(`/order/${o.id}`)} />
                        ))}
                      </View>
                    ) : null}
                  </View>
                ) : null}
              </View>
            )}
          </Card>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

function OrderRowCard({ row, onPress }: { row: OrderRow; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        borderWidth: 1,
        borderColor: theme.colors.border,
        borderRadius: 16,
        backgroundColor: 'rgba(255,255,255,0.90)',
        padding: 12,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
        <View style={{ flex: 1 }}>
          <Text weight="extrabold">{row.customer_name || 'Order'}</Text>
          <Text variant="muted" style={{ marginTop: 2 }}>
            {new Date(row.created_at).toLocaleString()}
          </Text>
          <Text variant="muted" style={{ marginTop: 2 }}>
            {row.delivery_address}
          </Text>
        </View>
        <View
          style={{
            paddingHorizontal: 10,
            paddingVertical: 6,
            borderRadius: 999,
            borderWidth: 1,
            borderColor: theme.colors.border,
            backgroundColor: 'rgba(18,101,214,0.06)',
          }}
        >
          <Text variant="chip" weight="extrabold" style={{ color: 'rgba(10,27,55,0.8)' }}>
            {statusLabel(row.status)}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

