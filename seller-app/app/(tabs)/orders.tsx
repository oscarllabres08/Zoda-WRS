import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
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

import { haversineKm } from '../../lib/geo';
import { getOrderDistanceDisplay } from '../../lib/orderDistance';
import { publicWrsAssetUrl } from '../../lib/publicAssetUrl';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../providers/AuthProvider';
import { Screen } from '../../ui/components/Screen';
import { Card } from '../../ui/components/Card';
import { Text } from '../../ui/components/Text';
import { theme } from '../../ui/theme';
import { useViewedOrders } from '../../lib/useViewedOrders';
import { SellerOrdersSkeleton } from '../../ui/components/Skeleton';
import { SellerScreenHeader } from '../../ui/components/SellerScreenHeader';
import { NewOrderBadge } from '../../ui/components/NewOrderBadge';
import { GradientPressable } from '../../ui/components/PrimaryGradient';

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
  delivery_distance_meters?: number | null;
  order_items?: OrderItemPreview[];
};

function formatOrderCardTimestamp(iso: string) {
  const d = new Date(iso);
  const date = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return `${date} • ${time}`;
}

function orderItemSummary(items?: OrderItemPreview[]) {
  let units = 0;
  let total = 0;
  for (const it of items ?? []) {
    const q = Number(it.quantity) || 0;
    units += q;
    total += q * (Number(it.unit_price) || 0);
  }
  return { units, total };
}

function formatMoney(amount: number) {
  return `₱${amount.toFixed(2)}`;
}

export default function OrdersScreen() {
  const router = useRouter();
  const { user, businessId } = useAuth();
  const { width } = useWindowDimensions();
  const isTablet = width >= 768;
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sortNearestFirst, setSortNearestFirst] = useState(true);
  const [deviceCoords, setDeviceCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [storeCoords, setStoreCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locationRefreshing, setLocationRefreshing] = useState(false);
  const [avatarPathByCustomerId, setAvatarPathByCustomerId] = useState<Record<string, string | null>>({});
  const { seedIfNeeded, markViewed, isNewOrder, viewedOrderIds } = useViewedOrders(businessId);

  const load = useCallback(async () => {
    if (!user || !businessId) return;
    setError(null);
    setLoading(true);
    const { data, error: err } = await supabase
      .from('orders')
      .select(
        'id,customer_id,customer_name,contact_number,delivery_address,landmark,latitude,longitude,notes,status,created_at,payment_method,payment_settled,delivery_distance_meters,order_items(id,product_name,quantity,unit_price,product_id,products(image_url))'
      )
      .eq('seller_id', businessId)
      .order('created_at', { ascending: false });
    if (err) setError(err.message);
    const list = (data ?? []) as OrderRow[];
    setOrders(list);
    await seedIfNeeded(list.map((o) => o.id));
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
  }, [user, businessId, seedIfNeeded]);

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

  const activeOrders = useMemo(
    () => orders.filter((o) => o.status !== 'delivered' && o.status !== 'cancelled'),
    [orders]
  );
  const newOrderCount = useMemo(
    () => activeOrders.filter((o) => !viewedOrderIds.has(o.id)).length,
    [activeOrders, viewedOrderIds]
  );
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
        map.set(o.id, haversineKm(referencePoint.lat, referencePoint.lng, o.latitude, o.longitude));
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
          <SellerScreenHeader subtitle="Manage Orders" />

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
                {newOrderCount > 0 ? (
                  <View
                    style={{
                      minWidth: 18,
                      height: 18,
                      borderRadius: 999,
                      backgroundColor: theme.colors.danger,
                      alignItems: 'center',
                      justifyContent: 'center',
                      paddingHorizontal: 4,
                    }}
                  >
                    <Text weight="extrabold" style={{ color: '#FFFFFF', fontSize: 10, lineHeight: 12 }}>
                      {newOrderCount > 99 ? '99+' : newOrderCount}
                    </Text>
                  </View>
                ) : null}
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

            <View
              style={{
                flexDirection: 'row',
                alignItems: 'flex-start',
                gap: 10,
                paddingVertical: 12,
                paddingHorizontal: 14,
                borderRadius: 14,
                backgroundColor: theme.colors.bgTint,
                borderWidth: 1,
                borderColor: theme.colors.border,
              }}
            >
              <Ionicons name="location-outline" size={20} color={theme.colors.primaryDark} style={{ marginTop: 1 }} />
              <Text weight="semibold" style={{ flex: 1, fontSize: 13, lineHeight: 19, color: theme.colors.primaryDark }}>
                Tap on an order to view full details, update delivery status, and mark as delivered.
              </Text>
            </View>

            {!referencePoint ? (
              <Text variant="muted" weight="semibold" style={{ fontSize: 12, paddingHorizontal: 2 }}>
                Turn on location or set store GPS in Business Profile. Saved checkout distance still shows when the customer shared their location.
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
                const ref = referencePoint ? { lat: referencePoint.lat, lng: referencePoint.lng } : null;
                const distanceDisplay = getOrderDistanceDisplay(item, ref);
                const distanceText =
                  distanceDisplay.kind === 'distance'
                    ? distanceDisplay.label
                    : distanceDisplay.kind === 'no-pin'
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
                      isNew={isNewOrder(item.id)}
                      customerAvatarUrl={publicWrsAssetUrl(avatarPathByCustomerId[item.customer_id])}
                      onViewDetails={() => {
                        void markViewed(item.id);
                        router.push(`/order/${item.id}`);
                      }}
                      distanceText={distanceText}
                    />
                  </Animated.View>
                );
              })}
            </View>
          </View>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

function paymentBadgeStyle(tone: 'paid' | 'gcash' | 'unpaid') {
  if (tone === 'paid') {
    return {
      backgroundColor: 'rgba(57,181,74,0.12)',
      borderColor: 'rgba(57,181,74,0.28)',
      color: theme.colors.success,
      icon: 'checkmark-circle' as const,
    };
  }
  if (tone === 'gcash') {
    return {
      backgroundColor: 'rgba(18,101,214,0.10)',
      borderColor: 'rgba(18,101,214,0.22)',
      color: theme.colors.primary,
      icon: 'wallet-outline' as const,
    };
  }
  return {
    backgroundColor: 'rgba(245,158,11,0.12)',
    borderColor: 'rgba(245,158,11,0.28)',
    color: '#B45309',
    icon: 'time-outline' as const,
  };
}

function PaymentStatusBadge({ paid, utang, gcash }: { paid: boolean; utang: boolean; gcash?: boolean }) {
  const tone = paid ? 'paid' : gcash ? 'gcash' : 'unpaid';
  const label = paid ? 'Paid' : gcash ? 'GCash' : utang ? 'Utang' : 'Unpaid';
  const s = paymentBadgeStyle(tone);

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingVertical: 4,
        paddingHorizontal: 8,
        borderRadius: 8,
        backgroundColor: s.backgroundColor,
        borderWidth: 1,
        borderColor: s.borderColor,
      }}
    >
      <Ionicons name={s.icon} size={13} color={s.color} />
      <Text weight="extrabold" style={{ fontSize: 11, color: s.color }}>
        {label}
      </Text>
    </View>
  );
}

function ViewDetailsButton({ onPress }: { onPress: () => void }) {
  return (
    <GradientPressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="View order details"
      style={{ flexShrink: 0, borderRadius: 10 }}
      innerStyle={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 4,
        paddingVertical: 8,
        paddingHorizontal: 10,
      }}
    >
      <Ionicons name="eye-outline" size={15} color={theme.colors.onPrimary} />
      <Text weight="extrabold" style={{ color: theme.colors.onPrimary, fontSize: 12 }}>
        View
      </Text>
      <Ionicons name="chevron-forward" size={14} color={theme.colors.onPrimary} />
    </GradientPressable>
  );
}

function OrderCard({
  order,
  isNew = false,
  customerAvatarUrl,
  onViewDetails,
  distanceText,
}: {
  order: OrderRow;
  isNew?: boolean;
  customerAvatarUrl?: string | null;
  onViewDetails: () => void;
  distanceText?: string | null;
}) {
  const avatarUri = customerAvatarUrl ?? null;
  const customerInitial = (order.customer_name.trim()[0] ?? '?').toUpperCase();
  const isUtang = (order.payment_method ?? '').toLowerCase() === 'utang';
  const isGcash = (order.payment_method ?? '').toLowerCase() === 'gcash';
  const isPaid = order.payment_settled === true;
  const fullAddress = `${order.delivery_address}${order.landmark ? `, ${order.landmark}` : ''}`.trim();
  const { units, total } = orderItemSummary(order.order_items);
  const distanceLabel =
    distanceText && distanceText !== 'No map pin'
      ? distanceText.includes('km') || distanceText.includes('m')
        ? `~ ${distanceText}`
        : distanceText
      : null;
  const locationLine = [distanceLabel, fullAddress].filter(Boolean).join(' · ');

  return (
    <Card
      accessibilityLabel={`Order: ${order.customer_name}${isNew ? ', new order' : ''}`}
      style={{
        borderRadius: 14,
        borderWidth: isNew ? 2 : 1,
        borderColor: isNew ? 'rgba(229,72,77,0.45)' : theme.colors.border,
        backgroundColor: theme.colors.card,
        paddingVertical: 12,
        paddingHorizontal: 12,
        overflow: 'hidden',
      }}
    >
      {isNew ? (
        <View style={{ position: 'absolute', top: 10, right: 10, zIndex: 2 }}>
          <NewOrderBadge />
        </View>
      ) : null}

      <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start', paddingRight: isNew ? 52 : 0 }}>
        <View
          style={{
            width: 44,
            height: 44,
            borderRadius: 22,
            overflow: 'hidden',
            borderWidth: 1.5,
            borderColor: theme.colors.bgTint,
            backgroundColor: theme.colors.bgSoft,
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          {avatarUri ? (
            <Image source={{ uri: avatarUri }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
          ) : (
            <Text weight="extrabold" style={{ color: theme.colors.primaryDark, fontSize: 17 }}>
              {customerInitial}
            </Text>
          )}
        </View>

        <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
          <Text weight="extrabold" numberOfLines={1} style={{ fontSize: 15, color: theme.colors.text, paddingRight: 4 }}>
            {order.customer_name}
          </Text>
          {locationLine ? (
            <Text weight="semibold" numberOfLines={2} style={{ fontSize: 12, lineHeight: 17, color: theme.colors.muted }}>
              {locationLine}
            </Text>
          ) : distanceText === 'No map pin' ? (
            <Text variant="muted" weight="semibold" style={{ fontSize: 12 }}>
              No map pin on this order
            </Text>
          ) : null}
        </View>
      </View>

      <View
        style={{
          marginTop: 10,
          paddingTop: 10,
          borderTopWidth: 1,
          borderTopColor: theme.colors.border,
          gap: 8,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <PaymentStatusBadge paid={isPaid} utang={isUtang && !isPaid} gcash={isGcash && !isPaid} />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 0 }}>
            <Ionicons name="cube-outline" size={13} color={theme.colors.muted} />
            <Text weight="extrabold" style={{ fontSize: 13, color: theme.colors.text }}>
              {units} item{units === 1 ? '' : 's'} · {formatMoney(total)}
            </Text>
          </View>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, flex: 1, minWidth: 0 }}>
            <Ionicons name="time-outline" size={13} color={theme.colors.muted} />
            <Text variant="muted" weight="semibold" numberOfLines={1} style={{ fontSize: 11, flex: 1 }}>
              {formatOrderCardTimestamp(order.created_at)}
            </Text>
          </View>
          <ViewDetailsButton onPress={onViewDetails} />
        </View>
      </View>

      {order.notes ? (
        <View
          style={{
            marginTop: 8,
            paddingVertical: 6,
            paddingHorizontal: 8,
            borderRadius: 8,
            backgroundColor: theme.colors.bgSoft,
            borderWidth: 1,
            borderColor: theme.colors.border,
          }}
        >
          <Text variant="muted" weight="bold" style={{ fontSize: 10 }}>
            Note
          </Text>
          <Text weight="semibold" numberOfLines={2} style={{ marginTop: 2, fontSize: 12 }}>
            {order.notes}
          </Text>
        </View>
      ) : null}
    </Card>
  );
}

