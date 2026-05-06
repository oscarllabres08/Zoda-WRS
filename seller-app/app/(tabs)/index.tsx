import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Image, Platform, Pressable, ScrollView, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Notifications from 'expo-notifications';

import { publicWrsAssetUrl } from '../../lib/publicAssetUrl';
import { orderCountsTowardOnlineSales } from '../../lib/orderSalesEligible';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../providers/AuthProvider';
import { useNotifications } from '../../providers/NotificationsProvider';
import { theme } from '../../ui/theme';
import { Screen } from '../../ui/components/Screen';
import { Card } from '../../ui/components/Card';
import { GradientCard } from '../../ui/components/GradientCard';
import { NotificationsMenu } from '../../ui/components/NotificationsMenu';
import { CalendarPickerModal } from '../../ui/components/CalendarPickerModal';
import { Text } from '../../ui/components/Text';
import { Button } from '../../ui/components/Button';
import { SellerDashboardSkeleton } from '../../ui/components/Skeleton';

type OrderRow = {
  id: string;
  status: string;
  created_at: string;
  customer_id: string;
  customer_name: string;
};

type ItemRow = {
  order_id: string;
  unit_price: number;
  quantity: number;
};

function money(n: number) {
  return `₱${n.toFixed(2)}`;
}

function startOfLocalDayForDate(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfLocalDayExclusive(d: Date) {
  const x = startOfLocalDayForDate(d);
  x.setDate(x.getDate() + 1);
  return x;
}

function isSameLocalCalendarDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function greetingLabel() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export default function DashboardScreen() {
  const router = useRouter();
  const tabBarHeight = useBottomTabBarHeight();
  const { user, businessId } = useAuth();
  const { unreadCount } = useNotifications();

  const [recentOrders, setRecentOrders] = useState<OrderRow[]>([]);
  const [recentItems, setRecentItems] = useState<ItemRow[]>([]);
  const [recentAvatarPathByCustomerId, setRecentAvatarPathByCustomerId] = useState<Record<string, string | null>>({});
  const [todayOnlineSales, setTodayOnlineSales] = useState(0);
  const [todayWalkInSales, setTodayWalkInSales] = useState(0);
  const [todayTotalOrders, setTodayTotalOrders] = useState(0);
  const [todayPending, setTodayPending] = useState(0);
  const [todayCompleted, setTodayCompleted] = useState(0);
  const [todayCancelled, setTodayCancelled] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notifOpen, setNotifOpen] = useState(false);
  const [overviewDate, setOverviewDate] = useState(() => new Date());
  const [calendarOpen, setCalendarOpen] = useState(false);
  const lastSeenOrderIdRef = useRef<string | null>(null);
  const realtimeInstanceIdRef = useRef(0);

  const load = useCallback(async () => {
    if (!user || !businessId) return;
    const sellerId = businessId;
    setError(null);
    setLoading(true);

    const dayStart = startOfLocalDayForDate(overviewDate);
    const dayEndExcl = endOfLocalDayExclusive(overviewDate);
    const dayStartIso = dayStart.toISOString();
    const dayEndIso = dayEndExcl.toISOString();

    const { data: todayOrds, error: todayErr } = await supabase
      .from('orders')
      .select('id,status,payment_method,payment_settled')
      .eq('seller_id', sellerId)
      .gte('created_at', dayStartIso)
      .lt('created_at', dayEndIso)
      .limit(5000);

    if (todayErr) {
      setError(todayErr.message);
      setLoading(false);
      return;
    }

    const tlist = (todayOrds ?? []) as {
      id: string;
      status: string;
      payment_method?: string | null;
      payment_settled?: boolean | null;
    }[];
    setTodayTotalOrders(tlist.length);
    let pend = 0;
    let comp = 0;
    let canc = 0;
    const salesEligibleTodayIds: string[] = [];
    for (const o of tlist) {
      if (o.status === 'delivered') comp += 1;
      else if (o.status === 'confirmed') {
        /* pending bucket handled below */
      } else if (o.status === 'cancelled') {
        canc += 1;
      } else {
        pend += 1;
      }
      // Online sales: marked paid (any status except cancelled).
      if (orderCountsTowardOnlineSales(o)) salesEligibleTodayIds.push(o.id);
    }
    setTodayPending(pend);
    setTodayCompleted(comp);
    setTodayCancelled(canc);

    let onlineToday = 0;
    if (salesEligibleTodayIds.length > 0) {
      const { data: delItems, error: diErr } = await supabase
        .from('order_items')
        .select('unit_price,quantity')
        .in('order_id', salesEligibleTodayIds);
      if (diErr) setError(diErr.message);
      for (const it of delItems ?? []) {
        onlineToday += Number((it as ItemRow).unit_price) * Number((it as ItemRow).quantity);
      }
    }
    setTodayOnlineSales(onlineToday);

    const { data: posRows, error: posErr } = await supabase
      .from('pos_sales')
      .select('pos_sale_items(unit_price,quantity)')
      .eq('seller_id', sellerId)
      .gte('created_at', dayStartIso)
      .lt('created_at', dayEndIso);
    if (posErr) {
      setTodayWalkInSales(0);
    } else {
      let walk = 0;
      for (const row of posRows ?? []) {
        const nested = (row as { pos_sale_items?: { unit_price: number; quantity: number }[] }).pos_sale_items;
        for (const it of nested ?? []) {
          walk += Number(it.unit_price) * Number(it.quantity);
        }
      }
      setTodayWalkInSales(walk);
    }

    const { data: recent, error: rErr } = await supabase
      .from('orders')
      .select('id,status,created_at,customer_id,customer_name')
      .eq('seller_id', sellerId)
      .order('created_at', { ascending: false })
      .limit(5);
    if (rErr) {
      setError(rErr.message);
      setLoading(false);
      return;
    }
    const rec = (recent ?? []) as OrderRow[];
    setRecentOrders(rec);
    const rCustIds = [...new Set(rec.map((r) => r.customer_id).filter(Boolean))];
    if (rCustIds.length > 0) {
      const { data: avs } = await supabase.from('profiles').select('user_id,avatar_path').in('user_id', rCustIds);
      const map: Record<string, string | null> = {};
      for (const p of (avs ?? []) as { user_id: string; avatar_path: string | null }[]) {
        map[p.user_id] = p.avatar_path ?? null;
      }
      setRecentAvatarPathByCustomerId(map);
    } else {
      setRecentAvatarPathByCustomerId({});
    }
    if (!lastSeenOrderIdRef.current && rec.length > 0) {
      lastSeenOrderIdRef.current = rec[0]!.id;
    }

    const rids = rec.map((x) => x.id);
    if (rids.length === 0) {
      setRecentItems([]);
    } else {
      const { data: it, error: itErr } = await supabase
        .from('order_items')
        .select('order_id,unit_price,quantity')
        .in('order_id', rids);
      if (itErr) setError(itErr.message);
      setRecentItems((it ?? []) as ItemRow[]);
    }

    setLoading(false);
  }, [user, businessId, overviewDate]);

  useEffect(() => {
    if (!user || !businessId) return;
    const sellerId = businessId;
    let alive = true;
    realtimeInstanceIdRef.current += 1;
    const instance = realtimeInstanceIdRef.current;

    async function run() {
      await load();
    }

    run();

    // Use a unique channel name per mount to avoid "cannot add postgres_changes callbacks ... after subscribe()"
    // when the underlying client reuses an already-subscribed channel by name.
    const channel = supabase
      .channel(`seller-dashboard-${sellerId}-${instance}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders', filter: `seller_id=eq.${sellerId}` },
        () => {
          if (alive) load();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'pos_sales', filter: `seller_id=eq.${sellerId}` },
        () => {
          if (alive) load();
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'orders', filter: `seller_id=eq.${sellerId}` },
        (payload) => {
          const newRow = payload.new as { id?: string; customer_name?: string } | null;
          const newId = newRow?.id;
          if (!newId) return;
          if (lastSeenOrderIdRef.current === newId) return;
          lastSeenOrderIdRef.current = newId;
        }
      )
      .subscribe();

    return () => {
      alive = false;
      supabase.removeChannel(channel);
    };
  }, [user, businessId, load]);

  const totalsByOrder = useMemo(() => {
    const map = new Map<string, number>();
    for (const it of recentItems) {
      map.set(it.order_id, (map.get(it.order_id) ?? 0) + it.unit_price * it.quantity);
    }
    return map;
  }, [recentItems]);

  const todaySales = todayOnlineSales + todayWalkInSales;

  const handleLabel = user?.email?.split('@')[0] ? `@${user.email!.split('@')[0]}` : 'Seller';

  const dateDisplay = overviewDate.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  const isOverviewToday = useMemo(() => isSameLocalCalendarDay(overviewDate, new Date()), [overviewDate]);

  const primary = theme.colors.primary;

  const scrollBottomPad = Math.max(tabBarHeight, 72) + theme.spacing.lg;

  return (
    <Screen style={{ paddingBottom: 0 }}>
      <NotificationsMenu visible={notifOpen} onClose={() => setNotifOpen(false)} />
      <CalendarPickerModal
        visible={calendarOpen}
        selectedDate={overviewDate}
        onClose={() => setCalendarOpen(false)}
        onSelectDate={(d) => setOverviewDate(d)}
      />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingBottom: scrollBottomPad,
          flexGrow: 1,
        }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: theme.spacing.md }}>
        <View style={{ flex: 1, paddingRight: 12 }}>
          <Text style={{ fontSize: 22, color: theme.colors.text, fontFamily: theme.font.extrabold, letterSpacing: -0.4 }}>
            Aquabeast WRS
          </Text>
          <Text variant="muted" weight="bold" style={{ marginTop: 4, fontSize: 13 }}>
            Seller dashboard
          </Text>
        </View>
        <Pressable
          onPress={() => setNotifOpen(true)}
          style={{
            width: 46,
            height: 46,
            borderRadius: 16,
            backgroundColor: '#FFFFFF',
            borderWidth: 1,
            borderColor: theme.colors.border,
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'visible',
            ...theme.shadow.card,
          }}
        >
          <Ionicons name="notifications-outline" size={22} color={theme.colors.text} />
          {unreadCount > 0 ? (
            <View
              style={{
                position: 'absolute',
                top: 5,
                right: 5,
                minWidth: 18,
                height: 18,
                paddingHorizontal: unreadCount > 9 ? 5 : 0,
                borderRadius: 999,
                backgroundColor: primary,
                borderWidth: 2,
                borderColor: '#FFFFFF',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 2,
              }}
            >
              <Text
                variant="chip"
                weight="extrabold"
                style={{
                  color: '#FFFFFF',
                  fontSize: 10,
                  lineHeight: 12,
                  textAlign: 'center',
                  includeFontPadding: false,
                }}
              >
                {unreadCount > 99 ? '99+' : String(unreadCount)}
              </Text>
            </View>
          ) : null}
        </Pressable>
      </View>

      <Animated.View entering={FadeInDown.duration(240)} style={{ gap: theme.spacing.md }}>
        {/* Hero */}
        <GradientCard style={{ borderRadius: 24 }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
            <View style={{ flex: 1 }}>
              <Text weight="bold" style={{ color: 'rgba(255,255,255,0.9)', fontSize: 14 }}>
                {greetingLabel()}, 👋
              </Text>
              <Text
                style={{
                  color: '#FFFFFF',
                  marginTop: 6,
                  fontSize: 18,
                  fontFamily: theme.font.extrabold,
                  letterSpacing: -0.3,
                }}
              >
                {handleLabel}!
              </Text>
              <Text style={{ color: 'rgba(255,255,255,0.88)', marginTop: 8, fontSize: 13, lineHeight: 18 }}>
                {"Here's your business overview."}
              </Text>
            </View>
            <View
              style={{
                width: 64,
                height: 64,
                borderRadius: 22,
                backgroundColor: 'rgba(255,255,255,0.16)',
                borderWidth: 1,
                borderColor: 'rgba(255,255,255,0.28)',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Ionicons name="water" size={32} color="rgba(255,255,255,0.95)" />
            </View>
          </View>

          <View style={{ height: 1, backgroundColor: 'rgba(255,255,255,0.28)', marginTop: 18, marginBottom: 16 }} />

          <View>
            <Text weight="bold" style={{ color: 'rgba(255,255,255,0.88)', fontSize: 13 }}>
              {isOverviewToday
                ? "Today's sales (online + walk-in)"
                : `Sales on ${dateDisplay} (online + walk-in)`}
            </Text>
            <Text
              style={{
                color: '#FFFFFF',
                marginTop: 6,
                fontSize: 34,
                fontFamily: theme.font.extrabold,
                letterSpacing: -1,
              }}
            >
              {money(todaySales)}
            </Text>
            <Text style={{ color: 'rgba(255,255,255,0.82)', marginTop: 8, fontSize: 12, lineHeight: 17 }}>
              Online (marked paid): {money(todayOnlineSales)} · Walk-in (POS): {money(todayWalkInSales)}
            </Text>
          </View>

          <View style={{ flexDirection: 'row', gap: 10, marginTop: 18 }}>
            <Pressable
              onPress={() => router.push('/pos')}
              style={{
                flex: 1,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                backgroundColor: '#FFFFFF',
                borderRadius: 16,
                paddingVertical: 14,
                paddingHorizontal: 12,
              }}
            >
              <Ionicons name="cash-outline" size={20} color={primary} />
              <Text weight="extrabold" style={{ color: primary, fontSize: 14, flex: 1 }} numberOfLines={1}>
                Start POS
              </Text>
              <Ionicons name="chevron-forward" size={18} color={primary} />
            </Pressable>
            <Pressable
              onPress={() => router.push('/sales-report')}
              style={{
                flex: 1,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                backgroundColor: 'rgba(255,255,255,0.14)',
                borderRadius: 16,
                paddingVertical: 14,
                paddingHorizontal: 10,
                borderWidth: 1,
                borderColor: 'rgba(255,255,255,0.32)',
              }}
            >
              <Ionicons name="bar-chart-outline" size={20} color="#FFFFFF" />
              <Text weight="extrabold" style={{ color: '#FFFFFF', fontSize: 13, flex: 1 }} numberOfLines={1}>
                Sales report
              </Text>
              <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.9)" />
            </Pressable>
          </View>
        </GradientCard>

        {loading ? <SellerDashboardSkeleton /> : null}
        {error ? <Text style={{ color: theme.colors.danger }}>{error}</Text> : null}

        {!loading ? (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
              <Text variant="h2" weight="extrabold" style={{ flex: 1 }}>
                {isOverviewToday ? "Today's overview" : 'Daily overview'}
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Pressable
                  onPress={() => setCalendarOpen(true)}
                  accessibilityRole="button"
                  accessibilityLabel="Choose overview date"
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 6,
                    paddingVertical: 8,
                    paddingHorizontal: 10,
                    borderRadius: 14,
                    backgroundColor: '#FFFFFF',
                    borderWidth: 1,
                    borderColor: theme.colors.border,
                    ...theme.shadow.card,
                  }}
                >
                  <Ionicons name="calendar-outline" size={16} color={primary} />
                  <Text weight="bold" style={{ color: theme.colors.text, fontSize: 13 }}>
                    {dateDisplay}
                  </Text>
                  <Ionicons name="chevron-down" size={14} color={theme.colors.muted} />
                </Pressable>
                {!isOverviewToday ? (
                  <Pressable onPress={() => setOverviewDate(new Date())} accessibilityRole="button" accessibilityLabel="Show today">
                    <Text weight="extrabold" style={{ color: primary, fontSize: 13 }}>
                      Today
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            </View>

            <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
              <OverviewStatCard
                icon="cart-outline"
                iconBg="rgba(18,101,214,0.12)"
                iconColor={primary}
                value={todayTotalOrders}
                title="Total Orders"
                subtitle={
                  isOverviewToday ? 'All orders placed today' : `All orders placed on ${dateDisplay}`
                }
              />
              <OverviewStatCard
                icon="time-outline"
                iconBg="rgba(245,158,11,0.14)"
                iconColor={theme.colors.warning}
                value={todayPending}
                title="Pending"
                subtitle="Orders waiting to be fulfilled"
              />
            </View>
            <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
              <OverviewStatCard
                icon="checkmark-circle-outline"
                iconBg="rgba(34,197,94,0.14)"
                iconColor={theme.colors.success}
                value={todayCompleted}
                title="Completed"
                subtitle="Orders successfully completed"
              />
              <OverviewStatCard
                icon="close-circle-outline"
                iconBg="rgba(239,68,68,0.12)"
                iconColor={theme.colors.danger}
                value={todayCancelled}
                title="Cancelled"
                subtitle="Orders cancelled"
              />
            </View>

            {/* Insights */}
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                paddingVertical: 16,
                paddingHorizontal: 14,
                borderRadius: 20,
                backgroundColor: 'rgba(18,101,214,0.08)',
                borderWidth: 1,
                borderColor: 'rgba(18,101,214,0.12)',
              }}
            >
              <View
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 14,
                  backgroundColor: 'rgba(18,101,214,0.14)',
                  borderWidth: 1,
                  borderColor: 'rgba(18,101,214,0.2)',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Ionicons name="bar-chart-outline" size={22} color={primary} />
              </View>
              <Text style={{ flex: 1, color: theme.colors.text, fontSize: 13, lineHeight: 19, fontFamily: theme.font.semibold }}>
                {"Keep it up! You're doing great. Check your sales report to see more insights."}
              </Text>
              <Pressable
                onPress={() => router.push('/sales-report')}
                style={{
                  paddingVertical: 10,
                  paddingHorizontal: 12,
                  borderRadius: 14,
                  backgroundColor: '#FFFFFF',
                  borderWidth: 1.5,
                  borderColor: primary,
                }}
              >
                <Text weight="extrabold" style={{ color: primary, fontSize: 12 }}>
                  View insights ›
                </Text>
              </Pressable>
            </View>

            <Card>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text variant="h2" weight="extrabold">
                  Recent Orders
                </Text>
                <View style={{ flex: 1 }} />
                <Button variant="ghost" title="View all" onPress={() => router.push('/(tabs)/orders')} />
              </View>

              <View style={{ marginTop: theme.spacing.sm }}>
                <FlatList
                  data={recentOrders}
                  keyExtractor={(o) => o.id}
                  scrollEnabled={false}
                  ItemSeparatorComponent={() => (
                    <View style={{ height: 1, backgroundColor: theme.colors.border, marginVertical: 10 }} />
                  )}
                  renderItem={({ item }) => {
                    const avUri = publicWrsAssetUrl(recentAvatarPathByCustomerId[item.customer_id]);
                    const initial = (item.customer_name.trim()[0] ?? 'C').toUpperCase();
                    return (
                    <Button
                      variant="ghost"
                      onPress={() => router.push(`/order/${item.id}`)}
                      style={{ alignSelf: 'stretch' }}
                    >
                      <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                        <View
                          style={{
                            width: 44,
                            height: 44,
                            borderRadius: 22,
                            overflow: 'hidden',
                            backgroundColor: 'rgba(18,101,214,0.10)',
                            borderWidth: 1,
                            borderColor: 'rgba(18,101,214,0.18)',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          {avUri ? (
                            <Image source={{ uri: avUri }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                          ) : (
                            <Text weight="extrabold" style={{ color: primary, fontSize: 16 }}>
                              {initial}
                            </Text>
                          )}
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text weight="extrabold">{item.customer_name}</Text>
                          <Text variant="muted" style={{ marginTop: 2 }}>
                            {new Date(item.created_at).toLocaleString()}
                          </Text>
                        </View>
                        <Text weight="extrabold" style={{ color: primary }}>
                          {money(totalsByOrder.get(item.id) ?? 0)}
                        </Text>
                      </View>
                    </Button>
                  );
                  }}
                />
              </View>
            </Card>
          </>
        ) : null}
      </Animated.View>
      </ScrollView>
    </Screen>
  );
}

function OverviewStatCard({
  icon,
  iconBg,
  iconColor,
  value,
  title,
  subtitle,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  iconBg: string;
  iconColor: string;
  value: number;
  title: string;
  subtitle: string;
}) {
  return (
    <Card style={{ flex: 1, paddingVertical: theme.spacing.sm, paddingHorizontal: theme.spacing.md }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 6,
        }}
      >
        <View
          style={{
            width: 36,
            height: 36,
            borderRadius: 11,
            backgroundColor: iconBg,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons name={icon} size={19} color={iconColor} />
        </View>
        <Text
          style={{
            fontSize: 22,
            fontFamily: theme.font.extrabold,
            color: theme.colors.text,
            letterSpacing: -0.5,
            lineHeight: 26,
          }}
        >
          {value}
        </Text>
      </View>
      <Text weight="extrabold" style={{ color: theme.colors.text, fontSize: 13 }}>
        {title}
      </Text>
      <Text variant="muted" style={{ marginTop: 2, fontSize: 11, lineHeight: 14 }} numberOfLines={2}>
        {subtitle}
      </Text>
    </Card>
  );
}
