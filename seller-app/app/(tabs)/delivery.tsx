import { useCallback, useEffect, useMemo, useState } from 'react';
import { Image, Linking, Pressable, RefreshControl, ScrollView, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import * as Location from 'expo-location';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';

import { haversineKm } from '../../lib/geo';
import { formatOrderDistance, orderDistanceKm } from '../../lib/orderDistance';
import { publicWrsAssetUrl } from '../../lib/publicAssetUrl';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../providers/AuthProvider';
import { Screen } from '../../ui/components/Screen';
import { Card } from '../../ui/components/Card';
import { Text } from '../../ui/components/Text';
import { theme } from '../../ui/theme';
import { useViewedOrders } from '../../lib/useViewedOrders';
import { SellerScreenHeader } from '../../ui/components/SellerScreenHeader';
import { NewOrderBadge } from '../../ui/components/NewOrderBadge';
import { orderGrandTotal } from '../../lib/orderTotal';

type OrderItemPreview = {
  product_name: string;
  unit_price: number;
  quantity: number;
};

type OrderRow = {
  id: string;
  customer_id: string;
  customer_name: string;
  contact_number: string;
  delivery_address: string;
  landmark: string | null;
  status: string;
  latitude: number | null;
  longitude: number | null;
  created_at: string;
  payment_method?: string | null;
  payment_settled?: boolean | null;
  delivery_fee?: number | null;
  delivery_distance_meters?: number | null;
  order_items?: OrderItemPreview[];
};

type DeliveryTab = 'pending' | 'ongoing' | 'delivered';
type PayFilter = 'all' | 'paid' | 'unpaid';

const DELIVERED_PAGE_SIZE = 20;

function orderShortId(id: string) {
  return id.replace(/-/g, '').slice(0, 8).toUpperCase();
}

function orderItemsLabel(order: OrderRow) {
  const items = order.order_items ?? [];
  if (items.length === 0) return 'Order items';
  const first = items[0]!;
  let line = `${first.quantity}x ${first.product_name}`;
  const extra = items.length - 1;
  if (extra > 0) line += ` +${extra} more`;
  return line;
}

function openMaps(lat: number, lng: number, label: string) {
  const q = encodeURIComponent(label);
  void Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&query=${q}`);
}

function isPending(status: string) {
  return status === 'pending';
}

function isOngoing(status: string) {
  return status === 'confirmed' || status === 'preparing' || status === 'on_the_way';
}

function isDelivered(status: string) {
  return status === 'delivered';
}

export default function DeliveryScreen() {
  const router = useRouter();
  const { user, businessId } = useAuth();
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<DeliveryTab>('delivered');
  const [query, setQuery] = useState('');
  const [payFilter, setPayFilter] = useState<PayFilter>('all');
  const [deliveredPage, setDeliveredPage] = useState(0);
  const [deviceCoords, setDeviceCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [storeCoords, setStoreCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [avatarPathByCustomerId, setAvatarPathByCustomerId] = useState<Record<string, string | null>>({});
  const { seedIfNeeded, markViewed, isNewOrder } = useViewedOrders(businessId);

  const openOrder = useCallback(
    (orderId: string) => {
      void markViewed(orderId);
      router.push(`/order/${orderId}`);
    },
    [markViewed, router]
  );

  const load = useCallback(async () => {
    if (!user || !businessId) return;
    setError(null);
    setLoading(true);
    const { data, error: err } = await supabase
      .from('orders')
      .select(
        'id,customer_id,customer_name,contact_number,delivery_address,landmark,status,latitude,longitude,created_at,payment_method,payment_settled,delivery_fee,delivery_distance_meters,order_items(product_name,unit_price,quantity)'
      )
      .eq('seller_id', businessId)
      .neq('status', 'cancelled')
      .order('created_at', { ascending: false });
    if (err) setError(err.message);
    const list = (data ?? []) as OrderRow[];
    setOrders(list);
    await seedIfNeeded(list.map((o) => o.id));
    const custIds = [...new Set(list.map((o) => o.customer_id).filter(Boolean))];
    if (custIds.length > 0) {
      const { data: profs } = await supabase.from('profiles').select('user_id,avatar_path').in('user_id', custIds);
      const m: Record<string, string | null> = {};
      for (const p of (profs ?? []) as { user_id: string; avatar_path: string | null }[]) {
        m[p.user_id] = p.avatar_path ?? null;
      }
      setAvatarPathByCustomerId(m);
    } else {
      setAvatarPathByCustomerId({});
    }
    setLoading(false);
  }, [user, businessId, seedIfNeeded]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  useEffect(() => {
    if (!businessId) return;
    const ch = supabase
      .channel(`seller-delivery-${businessId}-${Date.now()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `seller_id=eq.${businessId}` }, () => void load())
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [businessId, load]);

  useEffect(() => {
    if (!businessId) return;
    let cancelled = false;
    void (async () => {
      const { data } = await supabase
        .from('profiles')
        .select('latitude,longitude')
        .eq('user_id', businessId)
        .maybeSingle();
      if (cancelled) return;
      const lat = (data as { latitude?: number | null })?.latitude;
      const lng = (data as { longitude?: number | null })?.longitude;
      if (typeof lat === 'number' && typeof lng === 'number' && Number.isFinite(lat) && Number.isFinite(lng)) {
        setStoreCoords({ lat, lng });
      } else {
        setStoreCoords(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [businessId]);

  useEffect(() => {
    let sub: Location.LocationSubscription | null = null;
    let cancelled = false;
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (cancelled || status !== 'granted') return;
      try {
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        if (!cancelled) {
          setDeviceCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        }
        sub = await Location.watchPositionAsync({ accuracy: Location.Accuracy.Balanced, distanceInterval: 80 }, (pos) => {
          setDeviceCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        });
      } catch {
        /* store fallback */
      }
    })();
    return () => {
      cancelled = true;
      sub?.remove();
    };
  }, []);

  const distanceReference = deviceCoords ?? storeCoords;

  const counts = useMemo(
    () => ({
      pending: orders.filter((o) => isPending(o.status)).length,
      ongoing: orders.filter((o) => isOngoing(o.status)).length,
      delivered: orders.filter((o) => isDelivered(o.status)).length,
    }),
    [orders]
  );

  const filtered = useMemo(() => {
    let list = orders;
    if (tab === 'pending') list = list.filter((o) => isPending(o.status));
    else if (tab === 'ongoing') list = list.filter((o) => isOngoing(o.status));
    else list = list.filter((o) => isDelivered(o.status));

    if (tab === 'delivered') {
      if (payFilter === 'paid') list = list.filter((o) => o.payment_settled === true);
      if (payFilter === 'unpaid') list = list.filter((o) => o.payment_settled !== true);
    }

    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter((o) => {
      const shortId = orderShortId(o.id).toLowerCase();
      return (
        o.customer_name.toLowerCase().includes(q) ||
        o.id.toLowerCase().includes(q) ||
        shortId.includes(q) ||
        o.contact_number.toLowerCase().includes(q)
      );
    });
  }, [orders, tab, query, payFilter]);

  const sorted = useMemo(() => {
    const list = [...filtered];
    if (tab === 'ongoing' && deviceCoords) {
      list.sort((a, b) => {
        const da =
          a.latitude != null && a.longitude != null
            ? haversineKm(deviceCoords.lat, deviceCoords.lng, a.latitude, a.longitude)
            : Number.POSITIVE_INFINITY;
        const db =
          b.latitude != null && b.longitude != null
            ? haversineKm(deviceCoords.lat, deviceCoords.lng, b.latitude, b.longitude)
            : Number.POSITIVE_INFINITY;
        return da - db;
      });
      return list;
    }
    list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    return list;
  }, [filtered, tab, deviceCoords]);

  useEffect(() => {
    setDeliveredPage(0);
  }, [tab, payFilter, query]);

  const deliveredPageCount = useMemo(() => {
    if (tab !== 'delivered') return 0;
    return Math.max(1, Math.ceil(sorted.length / DELIVERED_PAGE_SIZE));
  }, [tab, sorted.length]);

  const deliveredPageItems = useMemo(() => {
    if (tab !== 'delivered') return [];
    const start = deliveredPage * DELIVERED_PAGE_SIZE;
    return sorted.slice(start, start + DELIVERED_PAGE_SIZE);
  }, [tab, sorted, deliveredPage]);

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{ paddingBottom: theme.spacing.xl, gap: theme.spacing.sm }}
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
      >
        <Animated.View entering={FadeInDown.duration(240)}>
          <SellerScreenHeader subtitle="Delivery" />
          <Text variant="muted" weight="semibold" style={{ marginTop: 4, lineHeight: 20 }}>
            Track delivered orders and view customer details, order history, and payment status.
          </Text>
        </Animated.View>

        <View
          style={{
            flexDirection: 'row',
            padding: 5,
            borderRadius: 16,
            backgroundColor: '#EAF2FF',
            borderWidth: 1,
            borderColor: 'rgba(18,101,214,0.10)',
            gap: 5,
          }}
        >
          <StatusTab
            label={`Pending (${counts.pending})`}
            icon="time-outline"
            active={tab === 'pending'}
            onPress={() => setTab('pending')}
          />
          <StatusTab
            label={`On-going (${counts.ongoing})`}
            icon="car-outline"
            active={tab === 'ongoing'}
            onPress={() => setTab('ongoing')}
          />
          <StatusTab
            label={`Delivered (${counts.delivered})`}
            icon="checkmark-done-outline"
            active={tab === 'delivered'}
            filled
            onPress={() => setTab('delivered')}
          />
        </View>

        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
            backgroundColor: '#FFFFFF',
            borderWidth: 1,
            borderColor: theme.colors.border,
            borderRadius: 14,
            paddingHorizontal: 12,
            paddingVertical: 10,
          }}
        >
          <Ionicons name="search-outline" size={18} color={theme.colors.muted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search customer name or order ID…"
            placeholderTextColor="rgba(106,122,149,0.9)"
            style={{ flex: 1, color: theme.colors.text, fontFamily: theme.font.bold }}
          />
        </View>

        {tab === 'delivered' ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {(['all', 'paid', 'unpaid'] as const).map((key) => (
              <Pressable
                key={key}
                onPress={() => setPayFilter(key)}
                style={{
                  paddingHorizontal: 14,
                  paddingVertical: 8,
                  borderRadius: 999,
                  borderWidth: 1.5,
                  borderColor: payFilter === key ? theme.colors.primary : theme.colors.border,
                  backgroundColor: payFilter === key ? 'rgba(18,101,214,0.1)' : '#FFF',
                }}
              >
                <Text weight="extrabold" style={{ fontSize: 13, color: payFilter === key ? theme.colors.primary : theme.colors.muted }}>
                  {key === 'all' ? 'All' : key === 'paid' ? 'Paid' : 'Unpaid'}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : null}

        {error ? (
          <Text style={{ color: theme.colors.danger }} weight="bold">
            {error}
          </Text>
        ) : null}
        {loading ? <Text variant="muted">Loading…</Text> : null}

        {!loading && sorted.length === 0 ? (
          <Card>
            <Text weight="extrabold">
              {tab === 'delivered' ? 'No delivered orders yet' : tab === 'pending' ? 'No pending deliveries' : 'No on-going deliveries'}
            </Text>
            <Text variant="muted" style={{ marginTop: 6 }}>
              {tab === 'delivered'
                ? 'Completed orders appear here after you mark them delivered in Orders.'
                : 'Orders move here as their status updates.'}
            </Text>
          </Card>
        ) : null}

        {tab === 'delivered' && sorted.length > 0 ? (
          <>
            <View
              style={{
                backgroundColor: '#FFFFFF',
                borderRadius: 16,
                borderWidth: 1,
                borderColor: theme.colors.border,
                overflow: 'hidden',
              }}
            >
              {deliveredPageItems.map((order, index) => (
                <Animated.View key={order.id} entering={FadeInDown.delay(index * 24).duration(200)}>
                  <DeliveredOrderRow
                    order={order}
                    avatarUrl={publicWrsAssetUrl(avatarPathByCustomerId[order.customer_id])}
                    onOpen={() => openOrder(order.id)}
                    isLast={index === deliveredPageItems.length - 1}
                  />
                </Animated.View>
              ))}
            </View>
            {sorted.length > DELIVERED_PAGE_SIZE ? (
              <DeliveredListPagination
                page={deliveredPage}
                pageCount={deliveredPageCount}
                total={sorted.length}
                pageSize={DELIVERED_PAGE_SIZE}
                onPrev={() => setDeliveredPage((p) => Math.max(0, p - 1))}
                onNext={() => setDeliveredPage((p) => Math.min(deliveredPageCount - 1, p + 1))}
              />
            ) : null}
          </>
        ) : null}

        {sorted.map((order, index) =>
          tab !== 'delivered' ? (
            <Animated.View
              key={order.id}
              entering={FadeInDown.delay(index * 35).duration(220)}
              style={{ width: '100%' }}
            >
              <ActiveDeliveryCard
                order={order}
                isNew={isNewOrder(order.id)}
                distanceReference={distanceReference}
                onOpen={() => openOrder(order.id)}
              />
            </Animated.View>
          ) : null
        )}
      </ScrollView>
    </Screen>
  );
}

function DeliveredListPagination({
  page,
  pageCount,
  total,
  pageSize,
  onPrev,
  onNext,
}: {
  page: number;
  pageCount: number;
  total: number;
  pageSize: number;
  onPrev: () => void;
  onNext: () => void;
}) {
  const from = page * pageSize + 1;
  const to = Math.min(total, (page + 1) * pageSize);
  const p = theme.colors.primary;
  const canPrev = page > 0;
  const canNext = page < pageCount - 1;

  return (
    <View style={{ gap: 10 }}>
      <Text variant="muted" weight="semibold" style={{ textAlign: 'center', fontSize: 13 }}>
        Showing {from}–{to} of {total}
      </Text>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Pressable
          onPress={onPrev}
          disabled={!canPrev}
          style={{
            flex: 1,
            paddingVertical: 12,
            borderRadius: 14,
            borderWidth: 1.5,
            borderColor: canPrev ? p : theme.colors.border,
            backgroundColor: canPrev ? '#FFFFFF' : 'rgba(106,122,149,0.06)',
            alignItems: 'center',
            opacity: canPrev ? 1 : 0.5,
          }}
        >
          <Text weight="extrabold" style={{ color: canPrev ? p : theme.colors.muted }}>
            Previous
          </Text>
        </Pressable>
        <Pressable
          onPress={onNext}
          disabled={!canNext}
          style={{
            flex: 1,
            paddingVertical: 12,
            borderRadius: 14,
            borderWidth: 1.5,
            borderColor: canNext ? p : theme.colors.border,
            backgroundColor: canNext ? 'rgba(18,101,214,0.1)' : 'rgba(106,122,149,0.06)',
            alignItems: 'center',
            opacity: canNext ? 1 : 0.5,
          }}
        >
          <Text weight="extrabold" style={{ color: canNext ? p : theme.colors.muted }}>
            Show more
          </Text>
        </Pressable>
      </View>
      <Text variant="muted" weight="bold" style={{ textAlign: 'center', fontSize: 12 }}>
        Page {page + 1} of {pageCount}
      </Text>
    </View>
  );
}

function StatusTab({
  label,
  icon,
  active,
  filled,
  onPress,
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  active: boolean;
  filled?: boolean;
  onPress: () => void;
}) {
  const activeBg = filled && active ? theme.colors.primary : active ? 'rgba(18,101,214,0.14)' : 'transparent';
  const activeColor = filled && active ? '#FFFFFF' : active ? theme.colors.primary : theme.colors.muted;

  return (
    <Pressable
      onPress={onPress}
      style={{
        flex: 1,
        minHeight: 44,
        borderRadius: 12,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 4,
        gap: 4,
        backgroundColor: activeBg,
        borderWidth: active && !filled ? 1 : 0,
        borderColor: 'rgba(18,101,214,0.22)',
      }}
    >
      <Ionicons name={icon} size={16} color={activeColor} />
      <Text weight="extrabold" numberOfLines={2} style={{ fontSize: 10, color: activeColor, textAlign: 'center', flex: 1 }}>
        {label}
      </Text>
    </Pressable>
  );
}

function DeliveredOrderRow({
  order,
  isNew = false,
  avatarUrl,
  onOpen,
  isLast,
}: {
  order: OrderRow;
  isNew?: boolean;
  avatarUrl?: string | null;
  onOpen: () => void;
  isLast: boolean;
}) {
  const p = theme.colors.primary;
  const paid = order.payment_settled === true;
  const total = orderGrandTotal(order.order_items, order.delivery_fee);
  const initial = (order.customer_name.trim()[0] ?? '?').toUpperCase();

  return (
    <Pressable
      onPress={onOpen}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12,
        paddingHorizontal: 14,
        gap: 12,
        backgroundColor: pressed ? 'rgba(18,101,214,0.04)' : '#FFFFFF',
        borderBottomWidth: isLast ? 0 : 1,
        borderBottomColor: theme.colors.border,
      })}
    >
      <View
        style={{
          width: 44,
          height: 44,
          borderRadius: 22,
          overflow: 'hidden',
          backgroundColor: '#EEF4FF',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {avatarUrl ? (
          <Image source={{ uri: avatarUrl }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
        ) : (
          <Text weight="extrabold" style={{ color: p, fontSize: 17 }}>
            {initial}
          </Text>
        )}
      </View>

      <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <Text weight="extrabold" numberOfLines={1} style={{ flex: 1, fontSize: 16, minWidth: 120 }}>
            {order.customer_name}
          </Text>
          {isNew ? <NewOrderBadge /> : null}
          <Text
            weight="extrabold"
            style={{
              fontSize: 11,
              color: paid ? theme.colors.success : theme.colors.muted,
            }}
          >
            {paid
              ? 'Paid'
              : (order.payment_method ?? '').toLowerCase() === 'gcash'
                ? 'GCash payment'
                : 'Unpaid'}
          </Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text variant="muted" weight="semibold" numberOfLines={1} style={{ flex: 1, fontSize: 13 }}>
            {orderItemsLabel(order)}
          </Text>
          <Text weight="extrabold" style={{ fontSize: 15, color: theme.colors.text }}>
            ₱{total.toFixed(2)}
          </Text>
        </View>
      </View>

      <Ionicons name="chevron-forward" size={18} color={theme.colors.muted} />
    </Pressable>
  );
}

function ActiveDeliveryCard({
  order,
  isNew = false,
  distanceReference,
  onOpen,
}: {
  order: OrderRow;
  isNew?: boolean;
  distanceReference: { lat: number; lng: number } | null;
  onOpen: () => void;
}) {
  const p = theme.colors.primary;
  const km = orderDistanceKm(order, distanceReference);
  const distanceLabel = formatOrderDistance(km);
  const statusLabel = order.status.replaceAll('_', ' ');
  const hasPin = order.latitude != null && order.longitude != null;

  return (
    <Card
      style={
        isNew
          ? {
              borderWidth: 2,
              borderColor: 'rgba(239,68,68,0.55)',
              backgroundColor: '#FEF2F2',
              overflow: 'hidden',
            }
          : { overflow: 'hidden' }
      }
    >
      <Pressable
        onPress={onOpen}
        style={({ pressed }) => ({
          width: '100%',
          backgroundColor: 'transparent',
          opacity: pressed ? 0.88 : 1,
        })}
      >
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, width: '100%' }}>
          <View
            style={{
              width: 42,
              height: 42,
              borderRadius: 14,
              backgroundColor: 'rgba(18,101,214,0.1)',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <Ionicons name="navigate-outline" size={22} color={p} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text weight="extrabold" style={{ flex: 1, minWidth: 0 }} numberOfLines={1}>
                {order.customer_name}
              </Text>
              {isNew ? <NewOrderBadge /> : null}
            </View>
            <Text variant="muted" weight="semibold" style={{ marginTop: 4 }} numberOfLines={2}>
              {order.delivery_address}
            </Text>
            <Text variant="chip" weight="bold" style={{ marginTop: 8, color: p }}>
              {statusLabel}
              {distanceLabel ? ` · ~ ${distanceLabel}` : ''}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={theme.colors.muted} style={{ flexShrink: 0, marginTop: 2 }} />
        </View>
      </Pressable>
      {hasPin ? (
        <Pressable
          onPress={() => openMaps(order.latitude!, order.longitude!, order.delivery_address)}
          style={({ pressed }) => ({
            marginTop: 12,
            width: '100%',
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            paddingVertical: 10,
            borderRadius: 12,
            borderWidth: 1.5,
            borderColor: p,
            backgroundColor: pressed ? 'rgba(18,101,214,0.06)' : '#FFFFFF',
          })}
        >
          <Ionicons name="map-outline" size={18} color={p} />
          <Text weight="extrabold" style={{ color: p }}>
            Open in Maps
          </Text>
        </Pressable>
      ) : null}
    </Card>
  );
}
