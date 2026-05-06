import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import * as Location from 'expo-location';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';

import { formatDistanceKm, haversineKm } from '../../lib/geo';
import { publicWrsAssetUrl } from '../../lib/publicAssetUrl';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../providers/AuthProvider';
import { Screen } from '../../ui/components/Screen';
import { Card } from '../../ui/components/Card';
import { Text } from '../../ui/components/Text';
import { theme } from '../../ui/theme';
import { SellerOrdersSkeleton } from '../../ui/components/Skeleton';

type OrderItemPreview = {
  id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  product_id: string | null;
  products?: {
    image_url?: string | null;
  } | null;
};

type OrderRow = {
  id: string;
  customer_id: string;
  customer_name: string;
  contact_number: string;
  delivery_address: string;
  landmark: string | null;
  latitude: number | null;
  longitude: number | null;
  notes: string | null;
  status: string;
  created_at: string;
  payment_method?: string | null;
  payment_settled?: boolean | null;
  order_items?: OrderItemPreview[];
};

/** Min height for action controls; text may wrap to 2 lines. */
const ACTION_BTN_MIN_HEIGHT = 44;
const ACTION_BTN_RADIUS = 12;

const STATUS_OPTIONS: Array<{ key: string; label: string }> = [
  { key: 'pending', label: 'Pending' },
  { key: 'confirmed', label: 'Confirmed' },
  { key: 'preparing', label: 'Preparing' },
  { key: 'on_the_way', label: 'On the way' },
  { key: 'delivered', label: 'Delivered' },
];

function statusOptionIcon(key: string): keyof typeof Ionicons.glyphMap {
  switch (key) {
    case 'pending':
      return 'time-outline';
    case 'confirmed':
      return 'checkmark-circle-outline';
    case 'preparing':
      return 'sync-outline';
    case 'on_the_way':
      return 'navigate-outline';
    case 'delivered':
      return 'checkmark-done-outline';
    default:
      return 'ellipse-outline';
  }
}

function statusOptionTint(key: string): { bg: string; border: string; icon: string } {
  const p = theme.colors.primary;
  const g = theme.colors.success;
  const w = theme.colors.warning;
  const m = theme.colors.muted;
  switch (key) {
    case 'pending':
      return { bg: 'rgba(106,122,149,0.12)', border: 'rgba(106,122,149,0.2)', icon: m };
    case 'confirmed':
      return { bg: 'rgba(18,101,214,0.1)', border: 'rgba(18,101,214,0.2)', icon: p };
    case 'preparing':
      return { bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.25)', icon: w };
    case 'on_the_way':
      return { bg: 'rgba(155,89,182,0.12)', border: 'rgba(155,89,182,0.22)', icon: '#8B5CF6' };
    case 'delivered':
      return { bg: 'rgba(34,197,94,0.12)', border: 'rgba(34,197,94,0.22)', icon: g };
    default:
      return { bg: 'rgba(10,27,58,0.06)', border: theme.colors.border, icon: m };
  }
}

function dialablePhone(raw: string) {
  return raw.trim().replace(/\s/g, '');
}

async function openDialer(phone: string) {
  const t = dialablePhone(phone);
  if (!t) {
    Alert.alert('No number', 'No phone number on this order.');
    return;
  }
  const url = `tel:${t}`;
  try {
    if (await Linking.canOpenURL(url)) await Linking.openURL(url);
    else Alert.alert('Call', t);
  } catch {
    Alert.alert('Call', t);
  }
}

/** Rough ETA for display (urban delivery ~18 km/h). */
function formatEtaAway(km: number | undefined): string | null {
  if (km == null || !Number.isFinite(km)) return null;
  const minutes = Math.max(1, Math.round((km / 18) * 60));
  if (minutes < 60) return `${minutes} min away`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h}h ${m}m away` : `${h}h away`;
}

function formatOrderCardTimestamp(iso: string) {
  const d = new Date(iso);
  const date = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return `${date} • ${time}`;
}

function isUtangUnpaid(order: OrderRow) {
  return (order.payment_method ?? '').toLowerCase() === 'utang' && order.payment_settled !== true;
}

/** Human-readable status: first letter capitalized, underscores → spaces. */
function formatStatusLabel(status: string) {
  const s = status.replaceAll('_', ' ').trim();
  if (!s) return status;
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

/** Compact status label for tight UI (order cards). */
function compactStatusTitle(status: string) {
  const s = (status ?? '').trim().toLowerCase();
  if (s === 'pending') return 'Pending';
  if (s === 'confirmed') return 'Confirmed';
  if (s === 'preparing') return 'Preparing';
  if (s === 'on_the_way') return 'On the way';
  if (s === 'delivered') return 'Delivered';
  if (s === 'cancelled') return 'Cancelled';
  return formatStatusLabel(status);
}

export default function OrdersScreen() {
  const router = useRouter();
  const { user, businessId } = useAuth();
  const { width } = useWindowDimensions();
  const isTablet = width >= 768;
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<'orders' | 'delivered'>('orders');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [payingId, setPayingId] = useState<string | null>(null);
  const [sortNearestFirst, setSortNearestFirst] = useState(true);
  const [deviceCoords, setDeviceCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [storeCoords, setStoreCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locationRefreshing, setLocationRefreshing] = useState(false);
  const [avatarPathByCustomerId, setAvatarPathByCustomerId] = useState<Record<string, string | null>>({});

  const load = useCallback(async () => {
    if (!user || !businessId) return;
    setError(null);
    setLoading(true);
    const { data, error: err } = await supabase
      .from('orders')
      .select(
        'id,customer_id,customer_name,contact_number,delivery_address,landmark,latitude,longitude,notes,status,created_at,payment_method,payment_settled,order_items(id,product_name,quantity,unit_price,product_id,products(image_url))'
      )
      .eq('seller_id', businessId)
      .order('created_at', { ascending: false });
    if (err) setError(err.message);
    const list = (data ?? []) as OrderRow[];
    setOrders(list);
    const custIds = [...new Set(list.map((o) => o.customer_id).filter(Boolean))];
    if (custIds.length > 0) {
      const { data: profs, error: pErr } = await supabase
        .from('profiles')
        .select('user_id,avatar_path')
        .in('user_id', custIds);
      if (!pErr && profs) {
        const m: Record<string, string | null> = {};
        for (const p of profs as { user_id: string; avatar_path: string | null }[]) {
          m[p.user_id] = p.avatar_path ?? null;
        }
        setAvatarPathByCustomerId(m);
      } else {
        setAvatarPathByCustomerId({});
      }
    } else {
      setAvatarPathByCustomerId({});
    }
    setLoading(false);
  }, [user, businessId]);

  useFocusEffect(
    useCallback(() => {
      if (!user || !businessId) return;
      void load();
    }, [user, businessId, load])
  );

  useEffect(() => {
    if (!user || !businessId) return;
    const instanceId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const channel = supabase
      .channel(`seller-orders-${businessId}-${instanceId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders', filter: `seller_id=eq.${businessId}` },
        () => load()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, businessId, load]);

  useEffect(() => {
    if (!user || !businessId) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('profiles')
        .select('latitude,longitude')
        .eq('user_id', businessId)
        .maybeSingle();
      if (cancelled || !data) return;
      if (data.latitude != null && data.longitude != null) {
        setStoreCoords({ lat: data.latitude, lng: data.longitude });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id, businessId]);

  useEffect(() => {
    let subscription: Location.LocationSubscription | null = null;
    let cancelled = false;

    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (cancelled || status !== 'granted') return;

      try {
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        if (!cancelled) {
          setDeviceCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        }
        subscription = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.Balanced,
            distanceInterval: 25,
            timeInterval: 15000,
          },
          (loc) => {
            setDeviceCoords({ lat: loc.coords.latitude, lng: loc.coords.longitude });
          }
        );
      } catch {
        /* keep store fallback */
      }
    })();

    return () => {
      cancelled = true;
      subscription?.remove();
    };
  }, []);

  const refreshDeviceLocation = useCallback(async () => {
    setLocationRefreshing(true);
    try {
      const { status } = await Location.getForegroundPermissionsAsync();
      if (status !== 'granted') {
        const req = await Location.requestForegroundPermissionsAsync();
        if (req.status !== 'granted') return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      setDeviceCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
    } catch {
      /* ignore */
    } finally {
      setLocationRefreshing(false);
    }
  }, []);

  async function setStatusForOrder(orderId: string, next: string) {
    const previous = orders.find((o) => o.id === orderId)?.status;
    // Optimistic update: move cards immediately between sections.
    setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, status: next } : o)));

    setUpdatingId(orderId);
    setError(null);
    try {
      const { error: err } = await supabase.from('orders').update({ status: next }).eq('id', orderId);
      if (err) throw err;
    } catch (e) {
      // Revert on failure.
      if (typeof previous === 'string') {
        setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, status: previous } : o)));
      }
      setError(e instanceof Error ? e.message : 'Failed to update order');
    } finally {
      setUpdatingId(null);
    }
  }

  async function setPaidForOrder(orderId: string, nextPaid: boolean) {
    const previous = orders.find((o) => o.id === orderId)?.payment_settled ?? null;
    // Optimistic update: reflect paid badge + card tint immediately.
    setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, payment_settled: nextPaid } : o)));

    setPayingId(orderId);
    setError(null);
    try {
      const { error: err } = await supabase.from('orders').update({ payment_settled: nextPaid }).eq('id', orderId);
      if (err) throw err;
    } catch (e) {
      // Revert on failure.
      setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, payment_settled: previous } : o)));
      setError(e instanceof Error ? e.message : 'Failed to update payment');
    } finally {
      setPayingId(null);
    }
  }

  const activeOrders = useMemo(
    () => orders.filter((o) => o.status !== 'delivered' && o.status !== 'cancelled'),
    [orders]
  );
  const deliveredOrders = useMemo(() => orders.filter((o) => o.status === 'delivered'), [orders]);
  const filteredActive = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return activeOrders;
    return activeOrders.filter((o) => {
      const idOk = o.id.toLowerCase().includes(q);
      const nameOk = o.customer_name.toLowerCase().includes(q);
      const phoneOk = o.contact_number.toLowerCase().includes(q);
      return idOk || nameOk || phoneOk;
    });
  }, [activeOrders, query]);

  const filteredDelivered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return deliveredOrders;
    return deliveredOrders.filter((o) => {
      const idOk = o.id.toLowerCase().includes(q);
      const nameOk = o.customer_name.toLowerCase().includes(q);
      const phoneOk = o.contact_number.toLowerCase().includes(q);
      return idOk || nameOk || phoneOk;
    });
  }, [deliveredOrders, query]);

  const referencePoint = useMemo(() => {
    if (deviceCoords) return { ...deviceCoords, source: 'gps' as const };
    if (storeCoords) return { ...storeCoords, source: 'store' as const };
    return null;
  }, [deviceCoords, storeCoords]);

  const distanceByOrderId = useMemo(() => {
    const map = new Map<string, number>();
    if (!referencePoint) return map;
    for (const o of filteredActive) {
      if (o.latitude != null && o.longitude != null) {
        map.set(
          o.id,
          haversineKm(referencePoint.lat, referencePoint.lng, o.latitude, o.longitude)
        );
      }
    }
    return map;
  }, [filteredActive, referencePoint]);

  const sortedActive = useMemo(() => {
    const list = [...filteredActive];
    if (!sortNearestFirst || !referencePoint) {
      list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      return list;
    }
    list.sort((a, b) => {
      const da = distanceByOrderId.get(a.id) ?? Number.POSITIVE_INFINITY;
      const db = distanceByOrderId.get(b.id) ?? Number.POSITIVE_INFINITY;
      if (da !== db) return da - db;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
    return list;
  }, [filteredActive, sortNearestFirst, referencePoint, distanceByOrderId]);

  return (
    <Screen>
      <ScrollView
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              await Promise.all([load(), refreshDeviceLocation()]);
              setRefreshing(false);
            }}
          />
        }
        contentContainerStyle={{ paddingBottom: theme.spacing.xl, gap: theme.spacing.sm }}
      >
        <Animated.View entering={FadeInDown.duration(240)} style={{ gap: theme.spacing.sm }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <View style={{ flex: 1 }}>
              <Text variant="title" weight="extrabold">
                Aquabeast WRS
              </Text>
              <Text variant="muted" weight="bold" style={{ marginTop: 2 }}>
                Manage Orders
              </Text>
            </View>
            <View
              style={{
                width: 44,
                height: 44,
                borderRadius: 14,
                backgroundColor: '#FFFFFF',
                borderWidth: 1,
                borderColor: theme.colors.border,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Ionicons name="receipt-outline" size={20} color={theme.colors.primary} />
            </View>
          </View>

          <View
            style={{
              backgroundColor: '#FFFFFF',
              borderWidth: 1,
              borderColor: theme.colors.border,
              borderRadius: 14,
              paddingHorizontal: 12,
              paddingVertical: 10,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
            }}
          >
            <Ionicons name="search-outline" size={18} color={theme.colors.muted} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search orders"
              placeholderTextColor="rgba(106,122,149,0.9)"
              style={{ flex: 1, color: theme.colors.text, fontFamily: theme.font.bold }}
            />
            {query ? (
              <Pressable
                onPress={() => setQuery('')}
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 12,
                  backgroundColor: 'rgba(18,101,214,0.08)',
                  borderWidth: 1,
                  borderColor: 'rgba(18,101,214,0.12)',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Ionicons name="close" size={16} color={theme.colors.primary} />
              </Pressable>
            ) : null}
          </View>
          {loading ? <SellerOrdersSkeleton /> : null}
          {error ? <Text style={{ color: theme.colors.danger }}>{error}</Text> : null}
        </Animated.View>

        {!loading ? (
          <Animated.View entering={FadeInDown.duration(240).delay(40)} style={{ gap: theme.spacing.sm }}>
            <View
              style={{
                flexDirection: 'row',
                padding: 6,
                borderRadius: 18,
                backgroundColor: '#EAF2FF',
                borderWidth: 1,
                borderColor: 'rgba(18,101,214,0.10)',
                gap: 6,
              }}
            >
              <CategoryTab
                label={`Orders (${activeOrders.length})`}
                icon="bag-handle-outline"
                active={selectedCategory === 'orders'}
                tone="primary"
                onPress={() => setSelectedCategory('orders')}
              />
              <CategoryTab
                label={`Delivered (${deliveredOrders.length})`}
                icon="clipboard-outline"
                active={selectedCategory === 'delivered'}
                tone="success"
                onPress={() => setSelectedCategory('delivered')}
              />
            </View>
          </Animated.View>
        ) : null}

        {!loading && selectedCategory === 'orders' ? (
          <View style={{ gap: theme.spacing.sm }}>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'stretch',
                flexWrap: 'nowrap',
                padding: 4,
                borderRadius: 14,
                backgroundColor: '#EAF2FF',
                borderWidth: 1,
                borderColor: 'rgba(18,101,214,0.10)',
                gap: 4,
              }}
            >
              <Pressable
                onPress={() => setSortNearestFirst(true)}
                style={{
                  flex: 1,
                  minWidth: 0,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 4,
                  paddingVertical: 10,
                  paddingHorizontal: 4,
                  borderRadius: 11,
                  backgroundColor: sortNearestFirst ? 'rgba(18,101,214,0.18)' : 'transparent',
                  borderWidth: sortNearestFirst ? 1 : 0,
                  borderColor: sortNearestFirst ? 'rgba(18,101,214,0.28)' : 'transparent',
                }}
              >
                <Ionicons
                  name="location-outline"
                  size={16}
                  color={sortNearestFirst ? theme.colors.primary : theme.colors.muted}
                />
                <Text
                  weight="extrabold"
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.85}
                  style={{ fontSize: 11, color: sortNearestFirst ? theme.colors.primary : theme.colors.muted }}
                >
                  Nearest
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setSortNearestFirst(false)}
                style={{
                  flex: 1,
                  minWidth: 0,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 4,
                  paddingVertical: 10,
                  paddingHorizontal: 4,
                  borderRadius: 11,
                  backgroundColor: !sortNearestFirst ? 'rgba(18,101,214,0.18)' : 'transparent',
                  borderWidth: !sortNearestFirst ? 1 : 0,
                  borderColor: !sortNearestFirst ? 'rgba(18,101,214,0.28)' : 'transparent',
                }}
              >
                <Ionicons
                  name="time-outline"
                  size={16}
                  color={!sortNearestFirst ? theme.colors.primary : theme.colors.muted}
                />
                <Text
                  weight="extrabold"
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.85}
                  style={{ fontSize: 11, color: !sortNearestFirst ? theme.colors.primary : theme.colors.muted }}
                >
                  Newest
                </Text>
              </Pressable>
              <Pressable
                onPress={() => void refreshDeviceLocation()}
                disabled={locationRefreshing}
                accessibilityLabel="Refresh distance"
                style={{
                  flex: 1,
                  minWidth: 0,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 4,
                  paddingVertical: 10,
                  paddingHorizontal: 4,
                  borderRadius: 11,
                  backgroundColor: '#FFFFFF',
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                  opacity: locationRefreshing ? 0.7 : 1,
                }}
              >
                {locationRefreshing ? (
                  <ActivityIndicator size="small" color={theme.colors.primary} />
                ) : (
                  <Ionicons name="refresh-circle-outline" size={18} color={theme.colors.primary} />
                )}
                <Text
                  weight="extrabold"
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.85}
                  style={{ color: theme.colors.primary, fontSize: 11 }}
                >
                  Refresh
                </Text>
              </Pressable>
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
              <Ionicons name="paper-plane-outline" size={17} color={theme.colors.primary} style={{ marginTop: 2 }} />
              <Text variant="muted" weight="semibold" style={{ flex: 1, fontSize: 13, lineHeight: 18 }}>
                Distance updates as you move. Nearest stops first when sorted by distance.
              </Text>
            </View>

            {!referencePoint ? (
              <Text variant="muted" weight="semibold" style={{ fontSize: 12 }}>
                Allow location to see live distance from you. Until then, set store coordinates in Business Profile for
                distance from store.
              </Text>
            ) : !deviceCoords && storeCoords ? (
              <Text variant="muted" weight="semibold" style={{ fontSize: 12 }}>
                Using store location for distance — turn on GPS for live updates while delivering.
              </Text>
            ) : null}

            {!loading && !error && filteredActive.length === 0 ? (
              <Card>
                <Text weight="extrabold">No active orders yet</Text>
                <Text variant="muted" style={{ marginTop: 6 }}>
                  New customer orders will appear here automatically.
                </Text>
              </Card>
            ) : null}

            <View
              style={{
                flexDirection: isTablet ? 'row' : 'column',
                flexWrap: isTablet ? 'wrap' : 'nowrap',
                gap: theme.spacing.sm,
                justifyContent: 'space-between',
              }}
            >
              {sortedActive.map((item, index) => {
                const km = distanceByOrderId.get(item.id);
                const hasPin = item.latitude != null && item.longitude != null;
                const distanceText =
                  referencePoint && hasPin && km != null
                    ? formatDistanceKm(km)
                    : referencePoint
                      ? 'No map pin'
                      : null;
                return (
                  <Animated.View
                    key={item.id}
                    entering={FadeInDown.duration(220).delay(30 * index)}
                    style={{ width: isTablet ? '48%' : '100%' }}
                  >
                    <OrderCard
                      order={item}
                      customerAvatarUrl={publicWrsAssetUrl(avatarPathByCustomerId[item.customer_id])}
                      updating={updatingId === item.id}
                      paying={payingId === item.id}
                      onChangeStatus={(next) => setStatusForOrder(item.id, next)}
                      onTogglePaid={(nextPaid) => setPaidForOrder(item.id, nextPaid)}
                      onViewDetails={() => router.push(`/order/${item.id}`)}
                      distanceKm={hasPin ? km : undefined}
                      distanceText={distanceText}
                    />
                  </Animated.View>
                );
              })}
            </View>
          </View>
        ) : !loading ? (
          <View style={{ gap: theme.spacing.sm }}>
            <SectionHeader
              title="Delivered"
              subtitle="Completed orders kept as history."
              icon="archive-outline"
            />
            {!loading && !error && filteredDelivered.length === 0 ? (
              <Card>
                <Text weight="extrabold">No delivered orders yet</Text>
                <Text variant="muted" style={{ marginTop: 6 }}>
                  Delivered orders will stay here as your record history.
                </Text>
              </Card>
            ) : null}

            <View
              style={{
                flexDirection: isTablet ? 'row' : 'column',
                flexWrap: isTablet ? 'wrap' : 'nowrap',
                gap: theme.spacing.sm,
                justifyContent: 'space-between',
              }}
            >
              {filteredDelivered.map((item, index) => (
                <Animated.View
                  key={item.id}
                  entering={FadeInDown.duration(220).delay(30 * index)}
                  style={{ width: isTablet ? '48%' : '100%' }}
                >
                  <OrderCard
                    order={item}
                    customerAvatarUrl={publicWrsAssetUrl(avatarPathByCustomerId[item.customer_id])}
                    updating={updatingId === item.id}
                    paying={payingId === item.id}
                    onChangeStatus={(next) => setStatusForOrder(item.id, next)}
                    onViewDetails={() => router.push(`/order/${item.id}`)}
                    delivered
                    onTogglePaid={(nextPaid) => setPaidForOrder(item.id, nextPaid)}
                  />
                </Animated.View>
              ))}
            </View>
          </View>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

function CategoryTab({
  label,
  icon,
  active,
  tone,
  onPress,
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  active: boolean;
  tone: 'primary' | 'success';
  onPress: () => void;
}) {
  const activeBackground = tone === 'success' ? 'rgba(34,197,94,0.16)' : 'rgba(18,101,214,0.14)';
  const activeBorder = tone === 'success' ? 'rgba(34,197,94,0.30)' : 'rgba(18,101,214,0.24)';
  const activeText = tone === 'success' ? theme.colors.success : theme.colors.primary;

  return (
    <Pressable
      onPress={onPress}
      style={{
        flex: 1,
        minHeight: 48,
        borderRadius: 14,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 10,
        gap: 8,
        backgroundColor: active ? activeBackground : 'transparent',
        borderWidth: active ? 1 : 0,
        borderColor: active ? activeBorder : 'transparent',
      }}
    >
      <Ionicons name={icon} size={18} color={active ? activeText : theme.colors.muted} />
      <Text
        numberOfLines={1}
        weight="extrabold"
        style={{
          color: active ? activeText : theme.colors.muted,
          textAlign: 'center',
          fontSize: 13,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function DistanceBadge({ distanceText, eta }: { distanceText: string; eta: string | null }) {
  const p = theme.colors.primary;
  const isNoPin = distanceText === 'No map pin';
  return (
    <View
      style={{
        minWidth: 78,
        maxWidth: 98,
        paddingVertical: 8,
        paddingHorizontal: 8,
        borderRadius: 12,
        backgroundColor: isNoPin ? 'rgba(245,158,11,0.10)' : 'rgba(234,242,255,0.98)',
        borderWidth: 1,
        borderColor: isNoPin ? 'rgba(245,158,11,0.28)' : 'rgba(18,101,214,0.16)',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 3,
      }}
    >
      <Ionicons name="navigate-outline" size={15} color={isNoPin ? theme.colors.warning : p} />
      <Text weight="extrabold" numberOfLines={2} style={{ fontSize: 12, color: p, textAlign: 'center', lineHeight: 15 }}>
        {distanceText}
      </Text>
      {eta ? (
        <Text variant="muted" weight="semibold" numberOfLines={2} style={{ fontSize: 10, textAlign: 'center', lineHeight: 12 }}>
          {eta}
        </Text>
      ) : null}
    </View>
  );
}

function StatusSelectTrigger({
  currentStatus,
  delivered,
  updating,
  onSelect,
}: {
  currentStatus: string;
  delivered: boolean;
  updating: boolean;
  onSelect: (next: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const primary = theme.colors.primary;
  const tint = statusOptionTint(delivered ? 'delivered' : currentStatus);

  if (delivered) {
    return (
      <View
        style={{
          width: '100%',
          minHeight: ACTION_BTN_MIN_HEIGHT,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          paddingVertical: 10,
          paddingHorizontal: 14,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: 'rgba(34,197,94,0.28)',
          backgroundColor: 'rgba(240,253,244,0.95)',
        }}
      >
        <Ionicons name="checkmark-done-outline" size={20} color={theme.colors.success} />
        <Text weight="extrabold" style={{ color: theme.colors.text, fontSize: 15, flex: 1, minWidth: 0, textAlign: 'center' }}>
          {formatStatusLabel('delivered')}
        </Text>
      </View>
    );
  }

  return (
    <>
      <Pressable
        onPress={() => !updating && setOpen(true)}
        disabled={updating}
        style={{
          width: '100%',
          minHeight: ACTION_BTN_MIN_HEIGHT,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          paddingVertical: 10,
          paddingHorizontal: 12,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: 'rgba(18,101,214,0.22)',
          backgroundColor: '#FFFFFF',
          opacity: updating ? 0.55 : 1,
        }}
      >
        <View
          style={{
            width: 34,
            height: 34,
            borderRadius: 11,
            backgroundColor: tint.bg,
            borderWidth: 1,
            borderColor: tint.border,
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <Ionicons name={statusOptionIcon(currentStatus)} size={20} color={tint.icon} />
        </View>
        <Text
          weight="extrabold"
          style={{ color: theme.colors.text, fontSize: 15, flex: 1, minWidth: 0 }}
          numberOfLines={2}
        >
          {compactStatusTitle(currentStatus)}
        </Text>
        <Ionicons name="chevron-down" size={22} color={theme.colors.muted} style={{ flexShrink: 0 }} />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable
          style={{
            flex: 1,
            backgroundColor: 'rgba(11,27,58,0.48)',
            justifyContent: 'center',
            padding: theme.spacing.md,
          }}
          onPress={() => setOpen(false)}
        >
          <Pressable onPress={() => {}} style={{ width: '100%', maxWidth: 400, alignSelf: 'center' }}>
            <View
              style={{
                borderRadius: 20,
                backgroundColor: '#FFFFFF',
                borderWidth: 1,
                borderColor: theme.colors.border,
                overflow: 'hidden',
                ...theme.shadow.card,
              }}
            >
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingHorizontal: 16,
                  paddingVertical: 14,
                  borderBottomWidth: 1,
                  borderBottomColor: theme.colors.border,
                  backgroundColor: 'rgba(18,101,214,0.05)',
                }}
              >
                <Text variant="h2" weight="extrabold">
                  Update status
                </Text>
                <Pressable onPress={() => setOpen(false)} hitSlop={12} accessibilityLabel="Close">
                  <Ionicons name="close" size={22} color={theme.colors.muted} />
                </Pressable>
              </View>
              <ScrollView
                style={{ maxHeight: 380 }}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
                {STATUS_OPTIONS.map((option, idx) => {
                  const active = option.key === currentStatus;
                  const t = statusOptionTint(option.key);
                  const hint =
                    option.key === 'pending'
                      ? 'Waiting for confirmation'
                      : option.key === 'confirmed'
                        ? 'Order accepted'
                        : option.key === 'preparing'
                          ? 'Getting order ready'
                          : option.key === 'on_the_way'
                            ? 'Out for delivery'
                            : 'Completed';

                  return (
                    <Pressable
                      key={option.key}
                      onPress={() => {
                        setOpen(false);
                        if (option.key !== currentStatus) onSelect(option.key);
                      }}
                      style={({ pressed }) => ({
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 12,
                        paddingVertical: 14,
                        paddingHorizontal: 14,
                        borderBottomWidth: idx < STATUS_OPTIONS.length - 1 ? 1 : 0,
                        borderBottomColor: theme.colors.border,
                        backgroundColor: active
                          ? 'rgba(18,101,214,0.12)'
                          : pressed
                            ? 'rgba(11,27,58,0.04)'
                            : '#FFFFFF',
                      })}
                    >
                      <View
                        style={{
                          width: 44,
                          height: 44,
                          borderRadius: 14,
                          backgroundColor: t.bg,
                          borderWidth: 1,
                          borderColor: t.border,
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Ionicons name={statusOptionIcon(option.key)} size={22} color={t.icon} />
                      </View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text weight="extrabold" style={{ fontSize: 16, color: theme.colors.text }}>
                          {option.label}
                        </Text>
                        <Text variant="muted" style={{ marginTop: 3, fontSize: 12 }}>
                          {hint}
                        </Text>
                      </View>
                      {active ? <Ionicons name="checkmark-circle" size={24} color={primary} /> : null}
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

function OrderCard({
  order,
  customerAvatarUrl,
  updating,
  onChangeStatus,
  paying,
  onTogglePaid,
  onViewDetails,
  delivered = false,
  distanceKm,
  distanceText,
}: {
  order: OrderRow;
  customerAvatarUrl?: string | null;
  updating: boolean;
  paying: boolean;
  onChangeStatus: (next: string) => void;
  onTogglePaid?: (nextPaid: boolean) => void;
  onViewDetails: () => void;
  delivered?: boolean;
  distanceKm?: number;
  distanceText?: string | null;
}) {
  const [addressExpanded, setAddressExpanded] = useState(false);
  const firstItem = order.order_items?.[0];
  const extraCount = Math.max(0, (order.order_items?.length ?? 0) - 1);
  const avatarUri = customerAvatarUrl ?? null;
  const customerInitial = (order.customer_name.trim()[0] ?? '?').toUpperCase();
  const p = theme.colors.primary;
  const showDistancePanel = !delivered && distanceText != null && distanceText.length > 0;
  const eta = showDistancePanel && distanceText !== 'No map pin' ? formatEtaAway(distanceKm) : null;
  const isUtang = (order.payment_method ?? '').toLowerCase() === 'utang';
  const isPaid = order.payment_settled === true;
  const utangUnpaid = isUtang && !isPaid;
  const paidLook = isPaid;
  const fullAddress = `${order.delivery_address}${order.landmark ? ` • ${order.landmark}` : ''}`.trim();

  return (
    <Card
      accessibilityLabel={`Order: ${order.customer_name}`}
      style={{
        borderRadius: 18,
        borderWidth: 1,
        borderColor: utangUnpaid ? 'rgba(239,68,68,0.22)' : paidLook ? 'rgba(34,197,94,0.22)' : theme.colors.border,
        backgroundColor: '#FFFFFF',
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
        <View style={{ width: 58, alignItems: 'center' }}>
          <View
            style={{
              width: 50,
              height: 50,
              borderRadius: 25,
              overflow: 'hidden',
              borderWidth: 1,
              borderColor: utangUnpaid ? 'rgba(239,68,68,0.35)' : paidLook ? 'rgba(34,197,94,0.35)' : 'rgba(18,101,214,0.22)',
              backgroundColor: utangUnpaid ? 'rgba(239,68,68,0.06)' : paidLook ? 'rgba(34,197,94,0.08)' : '#EEF4FF',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {avatarUri ? (
              <Image source={{ uri: avatarUri }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
            ) : (
              <Text weight="extrabold" style={{ color: p, fontSize: 20 }}>
                {customerInitial}
              </Text>
            )}
          </View>
        </View>

        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
                <Text weight="extrabold" style={{ fontSize: 16, flex: 1, minWidth: 120 }}>
                  {order.customer_name}
                </Text>
                <View
                  style={{
                    paddingVertical: 5,
                    paddingHorizontal: 10,
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: paidLook ? 'rgba(34,197,94,0.28)' : 'rgba(106,122,149,0.22)',
                    backgroundColor: paidLook ? 'rgba(34,197,94,0.10)' : 'rgba(106,122,149,0.08)',
                  }}
                >
                  <Text weight="extrabold" style={{ fontSize: 11, color: paidLook ? theme.colors.success : theme.colors.muted }}>
                    {paidLook ? 'Paid' : isUtang ? 'Utang' : 'Unpaid'}
                  </Text>
                </View>
              </View>
              <Text variant="muted" weight="semibold" numberOfLines={2} style={{ marginTop: 6, fontSize: 13, lineHeight: 18 }}>
                {firstItem ? `${firstItem.quantity} pc • ₱${firstItem.unit_price.toFixed(2)}` : 'No item info'}
                {extraCount > 0 ? ` • +${extraCount} more item${extraCount > 1 ? 's' : ''}` : ''}
              </Text>
            </View>

            {showDistancePanel ? <DistanceBadge distanceText={distanceText} eta={eta} /> : null}
          </View>

          <Pressable
            onPress={() => void openDialer(order.contact_number)}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 }}
            hitSlop={6}
          >
            <Ionicons name="call-outline" size={16} color={p} />
            <Text weight="bold" numberOfLines={1} ellipsizeMode="tail" style={{ color: p, fontSize: 13, flex: 1, minWidth: 0 }}>
              {order.contact_number || '—'}
            </Text>
          </Pressable>
        </View>
      </View>

      <Pressable onPress={() => setAddressExpanded((v) => !v)} style={{ marginTop: 10 }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'flex-start',
            gap: 8,
            paddingVertical: 9,
            paddingHorizontal: 10,
            borderRadius: 14,
            borderWidth: 1,
            borderColor: theme.colors.border,
            backgroundColor: '#F8FBFF',
          }}
        >
          <Ionicons name="location-outline" size={18} color={p} style={{ marginTop: 1 }} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text variant="muted" weight="extrabold" style={{ fontSize: 11 }}>
              Delivery Address
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 }}>
              <Text
                weight="extrabold"
                numberOfLines={addressExpanded ? 6 : 2}
                ellipsizeMode="tail"
                style={{ flex: 1, minWidth: 0, fontSize: 15, lineHeight: 19, color: theme.colors.text }}
              >
                {fullAddress || '—'}
              </Text>
              <Ionicons name="chevron-forward" size={18} color={theme.colors.muted} />
            </View>
            <Text variant="muted" weight="bold" style={{ marginTop: 6, fontSize: 11, color: p }}>
              {addressExpanded ? 'Tap to show less' : 'Tap to show full address'}
            </Text>
          </View>
        </View>
      </Pressable>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Ionicons name="time-outline" size={15} color={theme.colors.muted} />
        <Text variant="muted" weight="semibold" style={{ fontSize: 12 }}>
          {formatOrderCardTimestamp(order.created_at)}
        </Text>
      </View>

      <View
        style={{
          marginTop: 12,
          borderRadius: 16,
          borderWidth: 1,
          borderColor: theme.colors.border,
          backgroundColor: '#FFFFFF',
          overflow: 'hidden',
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'stretch' }}>
          <View style={{ flex: 2, minWidth: 0, paddingVertical: 10, paddingHorizontal: 10 }}>
            <Text variant="muted" weight="bold" style={{ fontSize: 11 }}>
              Status
            </Text>
            <View style={{ marginTop: 8 }}>
              <StatusSelectTrigger currentStatus={order.status} delivered={delivered} updating={updating} onSelect={onChangeStatus} />
            </View>
          </View>
          <View style={{ width: 1, backgroundColor: theme.colors.border }} />
          <View style={{ flex: 1, minWidth: 0, paddingVertical: 10, paddingHorizontal: 10, justifyContent: 'center' }}>
            <Text variant="muted" weight="bold" style={{ fontSize: 11 }}>
              Payment
            </Text>
            <View style={{ marginTop: 9 }}>
              <View
                style={{
                  alignSelf: 'flex-start',
                  paddingVertical: 7,
                  paddingHorizontal: 10,
                  borderRadius: 999,
                  borderWidth: 1,
                  backgroundColor: paidLook ? 'rgba(34,197,94,0.12)' : 'rgba(106,122,149,0.10)',
                  borderColor: paidLook ? 'rgba(34,197,94,0.3)' : 'rgba(106,122,149,0.22)',
                }}
              >
                <Text weight="extrabold" style={{ color: paidLook ? theme.colors.success : theme.colors.muted, fontSize: 12 }}>
                  {paidLook ? 'Paid' : isUtang ? 'Utang' : 'Unpaid'}
                </Text>
              </View>
            </View>
          </View>
        </View>
      </View>

      {order.notes ? (
        <View
          style={{
            marginTop: theme.spacing.sm,
            padding: 10,
            borderRadius: 12,
            backgroundColor: utangUnpaid ? 'rgba(239,68,68,0.04)' : paidLook ? 'rgba(34,197,94,0.04)' : '#F8FBFF',
            borderWidth: 1,
            borderColor: utangUnpaid ? 'rgba(239,68,68,0.2)' : paidLook ? 'rgba(34,197,94,0.16)' : theme.colors.border,
          }}
        >
          <Text variant="muted" weight="bold">
            Notes / Instruction
          </Text>
          <Text style={{ marginTop: 4 }}>{order.notes}</Text>
        </View>
      ) : null}

      <View style={{ marginTop: theme.spacing.md }}>
        <View style={{ flexDirection: 'row', alignItems: 'stretch', gap: 10 }}>
          <Pressable
            onPress={onViewDetails}
            style={{
              flex: 1,
              minWidth: 0,
              minHeight: ACTION_BTN_MIN_HEIGHT,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              borderRadius: ACTION_BTN_RADIUS,
              borderWidth: 1.5,
              borderColor: p,
              backgroundColor: '#FFFFFF',
              paddingVertical: 11,
              paddingHorizontal: 12,
            }}
          >
            <Ionicons name="list-outline" size={18} color={p} />
            <Text weight="extrabold" style={{ color: p, fontSize: 13 }}>
              Details
            </Text>
          </Pressable>

          {!delivered && onTogglePaid ? (
            <Pressable
              onPress={() => {
                if (paying || updating) return;
                const nextPaid = !isPaid;
                // Immediate toggle (no modal) so it always feels responsive.
                if (!paying && !updating) onTogglePaid(nextPaid);
              }}
              hitSlop={8}
              android_ripple={{ color: isPaid ? 'rgba(239,68,68,0.14)' : 'rgba(34,197,94,0.16)', borderless: false }}
              accessibilityRole="button"
              accessibilityLabel={isPaid ? 'Mark as unpaid' : 'Mark as paid'}
              style={({ pressed }) => ({
                flex: 1,
                minWidth: 0,
                minHeight: ACTION_BTN_MIN_HEIGHT,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                borderRadius: ACTION_BTN_RADIUS,
                borderWidth: 1.5,
                borderColor: isPaid ? 'rgba(239,68,68,0.55)' : 'rgba(34,197,94,0.55)',
                backgroundColor: isPaid ? 'rgba(239,68,68,0.04)' : 'rgba(34,197,94,0.06)',
                paddingVertical: 11,
                paddingHorizontal: 12,
                opacity: paying || updating ? 0.5 : pressed ? 0.92 : 1,
              })}
            >
              <Ionicons
                name={isPaid ? 'close-circle-outline' : 'checkmark-circle'}
                size={18}
                color={isPaid ? theme.colors.danger : theme.colors.success}
              />
              <Text
                weight="extrabold"
                style={{ color: isPaid ? theme.colors.danger : theme.colors.success, fontSize: 13 }}
                numberOfLines={1}
              >
                {isPaid ? 'Mark as Unpaid' : 'Mark as Paid'}
              </Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </Card>
  );
}

function SectionHeader({
  title,
  subtitle,
  icon,
}: {
  title: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
}) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingHorizontal: 2,
      }}
    >
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
        <Ionicons name={icon} size={18} color={theme.colors.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text variant="h2" weight="extrabold">
          {title}
        </Text>
        <Text variant="muted">{subtitle}</Text>
      </View>
    </View>
  );
}
