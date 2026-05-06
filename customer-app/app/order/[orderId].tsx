import { useEffect, useMemo, useState } from 'react';
import { BackHandler, Image, Pressable, ScrollView, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter, useSegments } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { useAuth } from '../../providers/AuthProvider';
import { supabase } from '../../lib/supabase';
import { Screen } from '../../ui/components/Screen';
import { Card } from '../../ui/components/Card';
import { Text } from '../../ui/components/Text';
import { Skeleton } from '../../ui/components/Skeleton';
import { theme } from '../../ui/theme';

type OrderRow = {
  id: string;
  status: string;
  created_at: string;
  customer_name: string;
  delivery_address: string;
  contact_number: string;
  notes: string | null;
  payment_method: string | null;
  payment_settled: boolean | null;
  payment_due_date: string | null;
  credit_note: string | null;
};

type OrderItemRow = {
  id: string;
  product_name: string;
  unit_price: number;
  quantity: number;
  products?: { image_url?: string | null } | null;
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

function formatMoney(amount: number) {
  return `₱${amount.toFixed(2)}`;
}

function paymentMethodLabel(m: string | null | undefined) {
  const x = (m ?? 'cod').toLowerCase();
  if (x === 'gcash') return 'GCash';
  if (x === 'maya') return 'Maya';
  if (x === 'utang') return 'Utang (pay later)';
  return 'Cash on delivery (COD)';
}

/** Same short code as seller order screen (`#` + first UUID segment). */
function orderDisplayId(fullId: string) {
  return `#${fullId.slice(0, 8)}`;
}

export default function OrderDetailsScreen() {
  const { orderId, returnTo } = useLocalSearchParams<{ orderId: string; returnTo?: string }>();
  const router = useRouter();
  const segments = useSegments();
  const { user, loading: authLoading } = useAuth();

  const [order, setOrder] = useState<OrderRow | null>(null);
  const [items, setItems] = useState<OrderItemRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!orderId) return;
    if (authLoading) return;
    if (!user) return;

    let alive = true;
    async function load() {
      setErr(null);
      setLoading(true);

      const { data: o, error: oErr } = await supabase
        .from('orders')
        .select(
          'id,status,created_at,customer_name,delivery_address,contact_number,notes,payment_method,payment_settled,payment_due_date,credit_note'
        )
        .eq('id', orderId)
        .single();
      if (!alive) return;
      if (oErr) {
        setErr(oErr.message);
        setLoading(false);
        return;
      }
      setOrder(o as OrderRow);

      const { data: it, error: itErr } = await supabase
        .from('order_items')
        .select('id,product_name,unit_price,quantity,products(image_url)')
        .eq('order_id', orderId)
        .order('created_at', { ascending: true });
      if (!alive) return;
      if (itErr) {
        setErr(itErr.message);
        setLoading(false);
        return;
      }
      setItems((it ?? []) as OrderItemRow[]);
      setLoading(false);
    }

    load();
    const timer = setInterval(load, 12000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [orderId, user, authLoading]);

  function publicImageUrl(pathOrUrl?: string | null) {
    if (!pathOrUrl) return null;
    if (pathOrUrl.startsWith('http')) return pathOrUrl;
    const { data } = supabase.storage.from('wrs-assets').getPublicUrl(pathOrUrl);
    return data.publicUrl;
  }

  const total = items.reduce((sum, i) => sum + i.unit_price * i.quantity, 0);

  const backHref = useMemo(() => {
    const rt = String(returnTo ?? '').toLowerCase();
    if (rt === 'profile-orders') return '/(tabs)/profile/orders' as const;
    const segs = segments as string[];
    if (segs.includes('profile') && segs.includes('orders')) return '/(tabs)/profile/orders' as const;
    return null;
  }, [returnTo, segments]);

  function goBackFromOrder() {
    if (backHref) {
      router.replace(backHref);
      return;
    }
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)');
  }

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      goBackFromOrder();
      return true;
    });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backHref, orderId]);

  return (
    <Screen style={{ padding: 0 }}>
      <Stack.Screen
        options={{
          headerLeft: () => (
            <Pressable
              onPress={goBackFromOrder}
              hitSlop={10}
              style={{ paddingVertical: 6, paddingHorizontal: 10, marginLeft: -6 }}
            >
              <Ionicons name="chevron-back" size={22} color={theme.colors.text} />
            </Pressable>
          ),
        }}
      />
      <ScrollView contentContainerStyle={{ padding: theme.spacing.md, paddingBottom: theme.spacing.xl }}>
        {loading ? (
          <Card style={{ marginTop: 0 }}>
            <View style={{ gap: 10 }}>
              <Skeleton height={14} width="44%" radius={10} />
              <Skeleton height={22} width="72%" radius={12} />
              <Skeleton height={12} width="58%" radius={10} />
              <Skeleton height={12} width="86%" radius={10} />
              <Skeleton height={12} width="64%" radius={10} />
            </View>
          </Card>
        ) : err ? (
          <Card style={{ marginTop: 0 }}>
            <Text weight="bold" style={{ color: theme.colors.danger }}>
              {err}
            </Text>
          </Card>
        ) : !order ? (
          <Card style={{ marginTop: 0 }}>
            <Text variant="muted">Order not found.</Text>
          </Card>
        ) : (
          <>
            <Card style={{ marginTop: 0 }}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                <View style={{ flex: 1 }}>
                  <Text variant="muted">Order ID</Text>
                  <Text variant="h2" weight="extrabold" style={{ marginTop: 4, letterSpacing: 0.5 }}>
                    {orderDisplayId(order.id)}
                  </Text>
                  <Text variant="muted" style={{ marginTop: 6 }}>
                    Placed {new Date(order.created_at).toLocaleString()}
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
                    {statusLabel(order.status)}
                  </Text>
                </View>
              </View>

              <View style={{ height: 1, backgroundColor: theme.colors.border, marginVertical: 12 }} />

              <Text variant="muted">Payment</Text>
              <Text weight="extrabold" style={{ marginTop: 6 }}>
                {paymentMethodLabel(order.payment_method)}
              </Text>
              {(order.payment_method ?? '').toLowerCase() === 'utang' ? (
                <View style={{ marginTop: 8 }}>
                  <Text
                    variant="chip"
                    weight="extrabold"
                    style={{
                      alignSelf: 'flex-start',
                      color: order.payment_settled === true ? theme.colors.success : theme.colors.danger,
                    }}
                  >
                    {order.payment_settled === true ? 'Bayad na' : 'May utang · Pending payment'}
                  </Text>
                  {order.payment_due_date ? (
                    <Text variant="muted" style={{ marginTop: 6 }}>
                      Pay by:{' '}
                      {new Date(order.payment_due_date + 'T12:00:00').toLocaleDateString('en-PH', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </Text>
                  ) : null}
                  {order.credit_note ? <Text style={{ marginTop: 6 }}>{order.credit_note}</Text> : null}
                </View>
              ) : (
                <View style={{ marginTop: 8 }}>
                  <Text
                    variant="chip"
                    weight="extrabold"
                    style={{
                      alignSelf: 'flex-start',
                      color: order.payment_settled === true ? theme.colors.success : theme.colors.warning,
                    }}
                  >
                    {order.payment_settled === true
                      ? 'Payment confirmed by store'
                      : 'Payment pending — store will confirm when received'}
                  </Text>
                </View>
              )}

              <View style={{ height: 1, backgroundColor: theme.colors.border, marginVertical: 12 }} />

              <Text variant="muted">Delivery details</Text>
              <Text weight="extrabold" style={{ marginTop: 6 }}>
                {order.customer_name}
              </Text>
              <Text variant="muted" style={{ marginTop: 2 }}>
                {order.contact_number}
              </Text>
              <Text style={{ marginTop: 8 }}>{order.delivery_address}</Text>

              {order.notes ? (
                <View
                  style={{
                    marginTop: 12,
                    borderWidth: 1,
                    borderColor: theme.colors.border,
                    borderRadius: 14,
                    backgroundColor: 'rgba(18,101,214,0.04)',
                    padding: 12,
                  }}
                >
                  <Text variant="muted">Notes / Instruction</Text>
                  <Text style={{ marginTop: 4 }}>{order.notes}</Text>
                </View>
              ) : null}
            </Card>

            <Card style={{ marginTop: theme.spacing.sm }}>
              <Text variant="h2" weight="extrabold">
                Items
              </Text>
              <View style={{ marginTop: 8, gap: 10 }}>
                {items.map((i) => {
                  const img = publicImageUrl(i.products?.image_url);
                  return (
                    <View key={i.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      {img ? (
                        <Image
                          source={{ uri: img }}
                          style={{
                            width: 48,
                            height: 48,
                            borderRadius: 14,
                            borderWidth: 1,
                            borderColor: theme.colors.border,
                            backgroundColor: 'rgba(18,101,214,0.04)',
                          }}
                          resizeMode="contain"
                        />
                      ) : (
                        <View style={{ width: 48, height: 48, borderRadius: 14, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: 'rgba(18,101,214,0.06)' }} />
                      )}
                      <View style={{ flex: 1 }}>
                        <Text weight="extrabold">{i.product_name}</Text>
                        <Text variant="muted">
                          {i.quantity} × {formatMoney(i.unit_price)}
                        </Text>
                      </View>
                      <View style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: 'rgba(18,101,214,0.06)' }}>
                        <Text weight="extrabold">{formatMoney(i.unit_price * i.quantity)}</Text>
                      </View>
                    </View>
                  );
                })}
              </View>
              <View style={{ height: 1, backgroundColor: theme.colors.border, marginVertical: 12 }} />
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text variant="muted" weight="bold">
                  Total
                </Text>
                <View style={{ flex: 1 }} />
                <Text variant="h2" weight="extrabold">
                  {formatMoney(total)}
                </Text>
              </View>
            </Card>
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

