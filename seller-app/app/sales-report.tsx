import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Dimensions,
  LayoutChangeEvent,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Stack, useRouter } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { supabase } from '../lib/supabase';
import { orderCountsTowardOnlineSales } from '../lib/orderSalesEligible';
import { useAuth } from '../providers/AuthProvider';
import { Screen } from '../ui/components/Screen';
import { Card } from '../ui/components/Card';
import { Text } from '../ui/components/Text';
import { theme } from '../ui/theme';

type OrderRow = { id: string; created_at: string };
type ItemRow = { order_id: string; unit_price: number; quantity: number };

type Period = 'today' | 'week' | 'month' | 'year';
type SourceTab = 'all' | 'online' | 'walkin';

const CHART_LINE_THICK = 3;

function money(n: number) {
  return `₱${n.toFixed(2)}`;
}

function moneyAxis(n: number) {
  if (!Number.isFinite(n) || n < 0) return '₱0';
  if (n >= 1_000_000) return `₱${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `₱${(n / 1000).toFixed(0)}k`;
  if (n >= 1000) return `₱${(n / 1000).toFixed(1)}k`;
  return `₱${Math.round(n)}`;
}

function niceChartMax(raw: number) {
  if (raw <= 0) return 100;
  const exp = Math.floor(Math.log10(raw));
  const f = raw / 10 ** exp;
  const nf = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10;
  return nf * 10 ** exp;
}

function pctVsPrevious(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  return ((current - previous) / previous) * 100;
}

function previousPeriodRange(
  period: Period,
  rangeStart: Date,
  rangeEnd: Date
): { prevStart: Date; prevEnd: Date } {
  if (period === 'today') {
    const prevEnd = rangeStart;
    const prevStart = startOfDay(new Date(prevEnd.getTime() - 86400000));
    return { prevStart, prevEnd };
  }
  if (period === 'week') {
    const span = rangeEnd.getTime() - rangeStart.getTime();
    const prevEnd = rangeStart;
    const prevStart = new Date(prevEnd.getTime() - span);
    return { prevStart, prevEnd };
  }
  if (period === 'month') {
    const prevEnd = rangeStart;
    const prevStart = startOfMonth(new Date(rangeStart.getFullYear(), rangeStart.getMonth() - 1, 1));
    return { prevStart, prevEnd };
  }
  const prevEnd = rangeStart;
  const prevStart = startOfYear(new Date(rangeStart.getFullYear() - 1, 0, 1));
  return { prevStart, prevEnd };
}

function previousPeriodHint(period: Period): string {
  if (period === 'today') return 'vs yesterday';
  if (period === 'week') return 'vs previous week';
  if (period === 'month') return 'vs previous month';
  return 'vs previous year';
}

/** Snapshot for Overview cards (supports source filter). */
async function aggregatePeriodForSeller(
  businessId: string,
  rangeStart: Date,
  rangeEnd: Date,
  mode: SourceTab
): Promise<{ sales: number; txnCount: number; buyerCount: number; units: number }> {
  let sales = 0;
  let txnCount = 0;
  let units = 0;
  const buyers = new Set<string>();

  if (mode === 'all' || mode === 'online') {
    const { data: orders, error: ordErr } = await supabase
      .from('orders')
      .select('id,customer_id,status,payment_method,payment_settled')
      .eq('seller_id', businessId)
      .neq('status', 'cancelled')
      .gte('created_at', rangeStart.toISOString())
      .lt('created_at', rangeEnd.toISOString());

    if (ordErr) throw ordErr;
    const olist = ((orders ?? []) as {
      id: string;
      customer_id: string;
      status: string;
      payment_method?: string | null;
      payment_settled?: boolean | null;
    }[]).filter(orderCountsTowardOnlineSales);
    txnCount += olist.length;
    for (const o of olist) buyers.add(o.customer_id);

    if (olist.length > 0) {
      const ids = olist.map((o) => o.id);
      const { data: items, error: itErr } = await supabase.from('order_items').select('unit_price,quantity').in('order_id', ids);
      if (itErr) throw itErr;
      for (const it of (items ?? []) as Pick<ItemRow, 'unit_price' | 'quantity'>[]) {
        const q = Number(it.quantity);
        sales += Number(it.unit_price) * q;
        units += q;
      }
    }
  }

  if (mode === 'all' || mode === 'walkin') {
    const { data: posRows, error: posErr } = await supabase
      .from('pos_sales')
      .select('id, pos_sale_items(unit_price,quantity)')
      .eq('seller_id', businessId)
      .gte('created_at', rangeStart.toISOString())
      .lt('created_at', rangeEnd.toISOString());

    if (posErr) throw posErr;
    const rows = (posRows ?? []) as {
      id: string;
      pos_sale_items?: { unit_price: number; quantity: number }[];
    }[];
    txnCount += rows.length;
    for (const row of rows) {
      for (const it of row.pos_sale_items ?? []) {
        const q = Number(it.quantity);
        sales += Number(it.unit_price) * q;
        units += q;
      }
    }
  }

  const buyerCount = mode === 'walkin' ? 0 : buyers.size;
  return { sales, txnCount, buyerCount, units };
}

function periodLabel(p: Period) {
  if (p === 'today') return 'Today';
  if (p === 'week') return 'This week';
  if (p === 'month') return 'This month';
  return 'Year';
}

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function startOfWeekMonday(d: Date) {
  const x = startOfDay(d);
  const day = x.getDay();
  const diff = (day + 6) % 7;
  x.setDate(x.getDate() - diff);
  return x;
}

function startOfMonth(d: Date, monthIndex?: number, year?: number) {
  const y = typeof year === 'number' ? year : d.getFullYear();
  const m = typeof monthIndex === 'number' ? monthIndex : d.getMonth();
  return new Date(y, m, 1, 0, 0, 0, 0);
}

function startOfYear(d: Date, year?: number) {
  const y = typeof year === 'number' ? year : d.getFullYear();
  return new Date(y, 0, 1, 0, 0, 0, 0);
}

type AnalyticsMode = 'daily' | 'monthly';

type AnalyticsBarDatum = {
  key: string;
  label: string;
  shortLabel: string;
  total: number;
  online: number;
  walkin: number;
};

type KpiSnapshot = { sales: number; txnCount: number; buyerCount: number; units: number };

function localDayKeyFromIso(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function analyticsBucketKey(iso: string, mode: AnalyticsMode, yearP: number, monthIdx: number): string | null {
  const d = new Date(iso);
  if (mode === 'daily') {
    if (d.getFullYear() !== yearP || d.getMonth() !== monthIdx) return null;
    return localDayKeyFromIso(iso);
  }
  if (d.getFullYear() !== yearP) return null;
  return String(d.getMonth());
}

function AnalyticsSegment({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  const primary = theme.colors.primary;
  return (
    <Pressable
      onPress={onPress}
      android_ripple={{ color: 'rgba(18,101,214,0.08)', borderless: true }}
      style={{
        flex: 1,
        paddingVertical: 10,
        borderRadius: 12,
        backgroundColor: active ? '#FFFFFF' : 'transparent',
        alignItems: 'center',
        borderWidth: active ? StyleSheet.hairlineWidth : 0,
        borderColor: active ? 'rgba(18,101,214,0.18)' : 'transparent',
        elevation: 0,
        shadowOpacity: 0,
      }}
    >
      <Text weight="extrabold" style={{ fontSize: 13, color: active ? primary : theme.colors.muted }}>
        {label}
      </Text>
    </Pressable>
  );
}

function SelectListModal<T extends string | number>({
  visible,
  title,
  items,
  getLabel,
  selected,
  onSelect,
  onClose,
}: {
  visible: boolean;
  title: string;
  items: T[];
  getLabel: (v: T) => string;
  selected: T;
  onSelect: (v: T) => void;
  onClose: () => void;
}) {
  const primary = theme.colors.primary;
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.24)', padding: theme.spacing.md }}>
        <Pressable
          onPress={() => {}}
          style={{
            marginTop: 64,
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
              <Ionicons name="list-outline" size={18} color={primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text variant="h2" weight="extrabold">
                {title}
              </Text>
              <Text variant="muted">Tap an item to select</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={10} style={{ padding: 6 }}>
              <Ionicons name="close" size={18} color={theme.colors.muted} />
            </Pressable>
          </View>
          <View style={{ height: 1, backgroundColor: theme.colors.border }} />
          <ScrollView style={{ maxHeight: 360 }} contentContainerStyle={{ padding: theme.spacing.md, gap: 8 }}>
            {items.map((v) => {
              const active = v === selected;
              return (
                <Pressable
                  key={String(v)}
                  onPress={() => {
                    onSelect(v);
                    onClose();
                  }}
                  style={{
                    paddingVertical: 12,
                    paddingHorizontal: 12,
                    borderRadius: 14,
                    borderWidth: 1,
                    borderColor: active ? 'rgba(18,101,214,0.22)' : theme.colors.border,
                    backgroundColor: active ? 'rgba(18,101,214,0.08)' : '#fff',
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 10,
                  }}
                >
                  <Text weight="extrabold" style={{ flex: 1 }}>
                    {getLabel(v)}
                  </Text>
                  {active ? <Ionicons name="checkmark" size={18} color={primary} /> : null}
                </Pressable>
              );
            })}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function SelectField({
  icon,
  label,
  onPress,
  width,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  width?: number;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        flex: width ? undefined : 1,
        width,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingHorizontal: 12,
        height: 44,
        borderWidth: 1,
        borderColor: theme.colors.border,
        borderRadius: 14,
        backgroundColor: '#fff',
      }}
    >
      <Ionicons name={icon} size={16} color={theme.colors.muted} />
      <Text weight="extrabold" style={{ flex: 1, color: theme.colors.text }} numberOfLines={1}>
        {label}
      </Text>
      <Ionicons name="chevron-down" size={16} color={theme.colors.muted} />
    </Pressable>
  );
}

/** Line chart without react-native-svg (avoids Metro / Windows resolution issues). */
function ChartLineSegment({
  x1,
  y1,
  x2,
  y2,
  color,
}: {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
}) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  if (!Number.isFinite(len) || len < 0.75) return null;
  const angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: x1,
        top: y1 - CHART_LINE_THICK / 2,
        width: len,
        height: CHART_LINE_THICK,
        borderRadius: CHART_LINE_THICK / 2,
        backgroundColor: color,
        transform: [{ rotateZ: `${angleDeg}deg` }],
        transformOrigin: '0px 50%',
      }}
    />
  );
}

function SalesAnalyticsBarChart({
  data,
  loading,
  emptyHint,
  analyticsMode,
}: {
  data: AnalyticsBarDatum[];
  loading: boolean;
  emptyHint: string;
  analyticsMode: AnalyticsMode;
}) {
  const primary = theme.colors.primary;
  const green = theme.colors.success;
  const [chartW, setChartW] = useState(0);
  const chartInnerH = 168;
  const padL = 48;
  const padR = 8;
  const padT = 28;
  const padB = analyticsMode === 'daily' ? 46 : 36;

  const maxVal = useMemo(() => {
    const m = Math.max(0, ...data.map((d) => d.total));
    return niceChartMax(m);
  }, [data]);

  const onLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    if (w > 0) setChartW(w);
  };

  const fallbackW = Math.max(320, Dimensions.get('window').width - theme.spacing.md * 2 - 24);
  const svgW = Math.max(chartW || 0, fallbackW);
  const svgH = padT + chartInnerH + padB;
  const innerW = Math.max(1, svgW - padL - padR);
  const n = data.length;
  const chartBaseY = padT + chartInnerH;
  const groupW = innerW / Math.max(1, n);
  const groupGap = Math.max(2, Math.min(10, groupW * 0.18));
  const barGap = Math.max(1, Math.min(6, groupW * 0.12));
  const usableGroupW = Math.max(8, groupW - groupGap);
  const barW = Math.max(4, Math.min(12, (usableGroupW - barGap) / 2));
  const groupContentW = barW * 2 + barGap;

  const yTicks = useMemo(() => [0, 0.25, 0.5, 0.75, 1].map((t) => t * maxVal), [maxVal]);

  const labelEvery = analyticsMode === 'daily' ? 1 : n <= 10 ? 1 : n <= 18 ? 2 : Math.max(1, Math.ceil(n / 7));

  function barHeight(v: number) {
    if (maxVal <= 0) return 0;
    return Math.max(0, Math.min(chartInnerH, (v / maxVal) * chartInnerH));
  }

  if (loading) {
    return (
      <View style={{ height: svgH + 24, justifyContent: 'center', alignItems: 'center' }}>
        <Text variant="muted">Loading chart…</Text>
      </View>
    );
  }

  if (data.length === 0) {
    return (
      <View
        style={{
          height: svgH,
          justifyContent: 'center',
          alignItems: 'center',
          paddingHorizontal: theme.spacing.md,
        }}
      >
        <Ionicons name="analytics-outline" size={28} color={theme.colors.muted} />
        <Text variant="muted" style={{ marginTop: 8, textAlign: 'center' }}>
          {emptyHint}
        </Text>
      </View>
    );
  }

  const formatXLabel = (d: AnalyticsBarDatum) => {
    if (analyticsMode === 'monthly') return d.shortLabel;
    const parts = d.key.split('-').map(Number);
    if (parts.length >= 3 && parts.every((x) => !Number.isNaN(x))) {
      const dt = new Date(parts[0], parts[1], parts[2]);
      const weekday = dt.toLocaleDateString(undefined, { weekday: 'short' });
      return `${weekday}\n${parts[2]}`;
    }
    return d.shortLabel;
  };

  return (
    <View onLayout={onLayout} style={{ width: '100%' }}>
      <Text variant="muted" style={{ fontSize: 12, marginBottom: 8, lineHeight: 18 }}>
        Bar graph of sales per {analyticsMode === 'daily' ? 'day' : 'month'}. Blue is walk‑in POS, green is online orders you marked paid.
      </Text>
      <View style={{ width: '100%', maxWidth: svgW, height: svgH, position: 'relative' }}>
          {yTicks.map((tick, ti) => {
            const gy = padT + chartInnerH - (tick / maxVal) * chartInnerH;
            return (
              <Text
                key={`yl-${ti}`}
                style={{
                  position: 'absolute',
                  left: 0,
                  width: padL - 6,
                  top: gy - 6,
                  fontSize: 10,
                  color: theme.colors.muted,
                  textAlign: 'right',
                }}
              >
                {moneyAxis(tick)}
              </Text>
            );
          })}

          {yTicks.map((tick, ti) => {
            const gy = padT + chartInnerH - (tick / maxVal) * chartInnerH;
            return (
              <View
                key={`hg-${ti}`}
                pointerEvents="none"
                style={{
                  position: 'absolute',
                  left: padL,
                  right: padR,
                  top: gy,
                  height: 1,
                  backgroundColor: 'rgba(10,27,55,0.09)',
                }}
              />
            );
          })}

          <LinearGradient
            pointerEvents="none"
            colors={['rgba(18,101,214,0.08)', 'rgba(18,101,214,0.00)']}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={{
              position: 'absolute',
              left: padL,
              right: padR,
              top: padT,
              height: chartInnerH,
            }}
          />

          {data.map((d, i) => {
            const x0 = padL + i * groupW + (groupW - groupContentW) / 2;

            const hWalkin = barHeight(d.walkin);
            const hOnline = barHeight(d.online);

            const showX = i % labelEvery === 0 || i === n - 1;

            return (
              <View key={`g-${d.key}`} pointerEvents="none" style={{ position: 'absolute', left: x0, top: padT, width: groupContentW, height: chartInnerH }}>
                <View
                  style={{
                    position: 'absolute',
                    left: 0,
                    width: barW,
                    bottom: 0,
                    height: hWalkin,
                    borderRadius: 6,
                    backgroundColor: primary,
                  }}
                />
                <View
                  style={{
                    position: 'absolute',
                    left: barW + barGap,
                    width: barW,
                    bottom: 0,
                    height: hOnline,
                    borderRadius: 6,
                    backgroundColor: green,
                  }}
                />
                {showX ? (
                  <Text
                    style={{
                      position: 'absolute',
                      left: -(groupW - groupContentW) / 2,
                      width: groupW,
                      top: chartInnerH + 4,
                      fontSize: analyticsMode === 'daily' ? 8 : 10,
                      lineHeight: analyticsMode === 'daily' ? 10 : 12,
                      color: theme.colors.muted,
                      textAlign: 'center',
                    }}
                    numberOfLines={analyticsMode === 'daily' ? 2 : 1}
                  >
                    {formatXLabel(d)}
                  </Text>
                ) : null}
              </View>
            );
          })}

          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: padL,
              right: padR,
              top: chartBaseY,
              height: 1,
              backgroundColor: 'rgba(10,27,55,0.12)',
            }}
          />
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 16, marginTop: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: primary }} />
          <Text style={{ fontSize: 12, color: theme.colors.muted }}>Walk-in (POS)</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: green }} />
          <Text style={{ fontSize: 12, color: theme.colors.muted }}>Online</Text>
        </View>
      </View>
    </View>
  );
}

function OverviewKpiDelta({ pct }: { pct: number | null }) {
  if (pct === null) {
    return (
      <Text variant="muted" style={{ fontSize: 11, marginTop: 6 }}>
        No baseline (previous period had no activity)
      </Text>
    );
  }
  const up = pct >= 0;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 }}>
      <Ionicons name={up ? 'trending-up' : 'trending-down'} size={14} color={up ? theme.colors.success : theme.colors.danger} />
      <Text weight="bold" style={{ fontSize: 12, color: up ? theme.colors.success : theme.colors.danger }}>
        {up ? '+' : ''}
        {pct.toFixed(1)}%
      </Text>
      <Text variant="muted" style={{ fontSize: 11 }}>
        change
      </Text>
    </View>
  );
}

function OverviewKpiCard({
  title,
  value,
  subtitle,
  icon,
  iconColor,
  bg,
  border: _border,
  deltaPct,
  deltaHidden,
  hint,
}: {
  title: string;
  value: string;
  subtitle?: string;
  icon: keyof typeof Ionicons.glyphMap;
  iconColor: string;
  bg: string;
  border: string;
  deltaPct: number | null;
  /** When true, show note instead of % vs previous period (e.g. POS-only view). */
  deltaHidden?: boolean;
  hint: string;
}) {
  return (
    <View
      style={{
        flex: 1,
        minWidth: '46%',
        maxWidth: '50%',
        borderRadius: 18,
        backgroundColor: bg,
        borderWidth: 0,
        padding: 14,
        elevation: 0,
        shadowOpacity: 0,
      }}
    >
      <View
        style={{
          width: 40,
          height: 40,
          borderRadius: 12,
          backgroundColor: `${iconColor}28`,
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 8,
        }}
      >
        <Ionicons name={icon} size={22} color={iconColor} />
      </View>
      <Text weight="bold" style={{ fontSize: 12, color: iconColor }}>
        {title}
      </Text>
      <Text style={{ fontSize: 22, fontFamily: theme.font.extrabold, color: theme.colors.text, marginTop: 4 }}>{value}</Text>
      {subtitle ? (
        <Text variant="muted" style={{ fontSize: 11, marginTop: 2 }}>
          {subtitle}
        </Text>
      ) : null}
      {deltaHidden ? (
        <Text variant="muted" style={{ fontSize: 11, marginTop: 6 }}>
          Buyer count applies to online orders only
        </Text>
      ) : (
        <OverviewKpiDelta pct={deltaPct} />
      )}
      <Text variant="muted" style={{ fontSize: 10, marginTop: 6, opacity: 0.85 }}>
        {hint}
      </Text>
    </View>
  );
}

export default function SalesReportScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, businessId } = useAuth();

  const [period, setPeriod] = useState<Period>('today');
  const [periodOpen, setPeriodOpen] = useState(false);
  const [sourceTab, setSourceTab] = useState<SourceTab>('all');
  const now = new Date();
  const [monthIndex, setMonthIndex] = useState<number>(now.getMonth());
  const [monthYear, setMonthYear] = useState<number>(now.getFullYear());
  const [year, setYear] = useState<number>(now.getFullYear());
  const [monthSelectOpen, setMonthSelectOpen] = useState(false);
  const [monthYearSelectOpen, setMonthYearSelectOpen] = useState(false);
  const [yearSelectOpen, setYearSelectOpen] = useState(false);

  const [analyticsMode, setAnalyticsMode] = useState<AnalyticsMode>('daily');
  const [analyticsMonthIndex, setAnalyticsMonthIndex] = useState<number>(now.getMonth());
  const [analyticsYearPick, setAnalyticsYearPick] = useState<number>(now.getFullYear());
  const [analyticsMonthSelectOpen, setAnalyticsMonthSelectOpen] = useState(false);
  const [analyticsYearSelectOpen, setAnalyticsYearSelectOpen] = useState(false);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [analyticsSeries, setAnalyticsSeries] = useState<AnalyticsBarDatum[]>([]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [onlineOrderCount, setOnlineOrderCount] = useState(0);
  const [onlineSales, setOnlineSales] = useState(0);
  const [walkInTxnCount, setWalkInTxnCount] = useState(0);
  const [walkInSales, setWalkInSales] = useState(0);

  const [kpiCompare, setKpiCompare] = useState<{ curr: KpiSnapshot; prev: KpiSnapshot } | null>(null);

  const { rangeStart, rangeEnd } = useMemo(() => {
    const n = new Date();
    if (period === 'today') {
      const s = startOfDay(n);
      const e = new Date(s);
      e.setDate(e.getDate() + 1);
      return { rangeStart: s, rangeEnd: e };
    }
    if (period === 'week') {
      const s = startOfWeekMonday(n);
      const e = new Date(s);
      e.setDate(e.getDate() + 7);
      return { rangeStart: s, rangeEnd: e };
    }
    if (period === 'month') {
      const s = startOfMonth(n, monthIndex, monthYear);
      const e = new Date(monthYear, monthIndex + 1, 1, 0, 0, 0, 0);
      return { rangeStart: s, rangeEnd: e };
    }
    const s = startOfYear(n, year);
    const e = new Date(year + 1, 0, 1, 0, 0, 0, 0);
    return { rangeStart: s, rangeEnd: e };
  }, [period, monthIndex, monthYear, year]);

  const periodTitle = useMemo(() => {
    if (period === 'today') return 'Today';
    if (period === 'week') return 'This week';
    if (period === 'month') {
      const d = new Date(monthYear, monthIndex, 1);
      return d.toLocaleString(undefined, { month: 'long', year: 'numeric' });
    }
    return String(year);
  }, [period, monthIndex, monthYear, year]);

  const load = useCallback(async () => {
    if (!user || !businessId) return;
    setError(null);
    setLoading(true);

    const { data: orders, error: ordErr } = await supabase
      .from('orders')
      .select('id,created_at,status,payment_method,payment_settled')
      .eq('seller_id', businessId)
      .neq('status', 'cancelled')
      .gte('created_at', rangeStart.toISOString())
      .lt('created_at', rangeEnd.toISOString())
      .order('created_at', { ascending: false })
      .limit(5000);

    if (ordErr) {
      setError(ordErr.message);
      setOnlineOrderCount(0);
      setOnlineSales(0);
      setWalkInTxnCount(0);
      setWalkInSales(0);
      setLoading(false);
      return;
    }

    const ids = ((orders ?? []) as (OrderRow & {
      status: string;
      payment_method?: string | null;
      payment_settled?: boolean | null;
    })[]).filter(orderCountsTowardOnlineSales);
    setOnlineOrderCount(ids.length);
    let onlineSum = 0;
    if (ids.length > 0) {
      const orderIds = ids.map((o) => o.id);
      const { data: items, error: itErr } = await supabase
        .from('order_items')
        .select('order_id,unit_price,quantity')
        .in('order_id', orderIds);

      if (itErr) {
        setError(itErr.message);
        setOnlineSales(0);
        setWalkInTxnCount(0);
        setWalkInSales(0);
        setLoading(false);
        return;
      }
      for (const it of (items ?? []) as ItemRow[]) {
        onlineSum += Number(it.unit_price) * Number(it.quantity);
      }
    }
    setOnlineSales(onlineSum);

    const { data: posRows, error: posErr } = await supabase
      .from('pos_sales')
      .select('id, pos_sale_items(unit_price,quantity)')
      .eq('seller_id', businessId)
      .gte('created_at', rangeStart.toISOString())
      .lt('created_at', rangeEnd.toISOString());

    if (posErr) {
      setWalkInTxnCount(0);
      setWalkInSales(0);
    } else {
      const rows = (posRows ?? []) as {
        id: string;
        pos_sale_items?: { unit_price: number; quantity: number }[];
      }[];
      setWalkInTxnCount(rows.length);
      let w = 0;
      for (const row of rows) {
        for (const it of row.pos_sale_items ?? []) {
          w += Number(it.unit_price) * Number(it.quantity);
        }
      }
      setWalkInSales(w);
    }

    setLoading(false);
  }, [user, businessId, rangeStart, rangeEnd]);

  const loadKpiCompare = useCallback(async () => {
    if (!user || !businessId) return;
    try {
      const { prevStart, prevEnd } = previousPeriodRange(period, rangeStart, rangeEnd);
      const [curr, prevSnap] = await Promise.all([
        aggregatePeriodForSeller(businessId, rangeStart, rangeEnd, sourceTab),
        aggregatePeriodForSeller(businessId, prevStart, prevEnd, sourceTab),
      ]);
      setKpiCompare({ curr, prev: prevSnap });
    } catch {
      setKpiCompare(null);
    }
  }, [user, businessId, rangeStart, rangeEnd, period, sourceTab]);

  const loadAnalytics = useCallback(async () => {
    if (!user || !businessId) return;
    setAnalyticsLoading(true);

    let aStart: Date;
    let aEnd: Date;
    if (analyticsMode === 'daily') {
      aStart = startOfMonth(new Date(), analyticsMonthIndex, analyticsYearPick);
      aEnd = new Date(analyticsYearPick, analyticsMonthIndex + 1, 1, 0, 0, 0, 0);
    } else {
      aStart = startOfYear(new Date(), analyticsYearPick);
      aEnd = new Date(analyticsYearPick + 1, 0, 1, 0, 0, 0, 0);
    }

    const { data: orders, error: ordErr } = await supabase
      .from('orders')
      .select('id,created_at,status,payment_method,payment_settled')
      .eq('seller_id', businessId)
      .neq('status', 'cancelled')
      .gte('created_at', aStart.toISOString())
      .lt('created_at', aEnd.toISOString())
      .order('created_at', { ascending: true })
      .limit(8000);

    const onlineByBucket = new Map<string, number>();
    const walkByBucket = new Map<string, number>();

    const resetAndFinish = () => {
      setAnalyticsSeries([]);
      setAnalyticsLoading(false);
    };

    if (ordErr) {
      resetAndFinish();
      return;
    }

    const ids = ((orders ?? []) as (OrderRow & {
      status: string;
      payment_method?: string | null;
      payment_settled?: boolean | null;
    })[]).filter(orderCountsTowardOnlineSales);
    if (ids.length > 0) {
      const orderIds = ids.map((o) => o.id);
      const { data: items, error: itErr } = await supabase
        .from('order_items')
        .select('order_id,unit_price,quantity')
        .in('order_id', orderIds);

      if (itErr) {
        resetAndFinish();
        return;
      }

      const sumByOrder = new Map<string, number>();
      for (const it of (items ?? []) as ItemRow[]) {
        const add = Number(it.unit_price) * Number(it.quantity);
        sumByOrder.set(it.order_id, (sumByOrder.get(it.order_id) ?? 0) + add);
      }

      for (const o of ids) {
        const b = analyticsBucketKey(o.created_at, analyticsMode, analyticsYearPick, analyticsMonthIndex);
        if (b === null) continue;
        const amt = sumByOrder.get(o.id) ?? 0;
        onlineByBucket.set(b, (onlineByBucket.get(b) ?? 0) + amt);
      }
    }

    const { data: posRows, error: posErr } = await supabase
      .from('pos_sales')
      .select('created_at, pos_sale_items(unit_price,quantity)')
      .eq('seller_id', businessId)
      .gte('created_at', aStart.toISOString())
      .lt('created_at', aEnd.toISOString());

    if (!posErr && posRows) {
      for (const row of posRows as {
        created_at: string;
        pos_sale_items?: { unit_price: number; quantity: number }[];
      }[]) {
        const b = analyticsBucketKey(row.created_at, analyticsMode, analyticsYearPick, analyticsMonthIndex);
        if (b === null) continue;
        let w = 0;
        for (const it of row.pos_sale_items ?? []) {
          w += Number(it.unit_price) * Number(it.quantity);
        }
        walkByBucket.set(b, (walkByBucket.get(b) ?? 0) + w);
      }
    }

    const series: AnalyticsBarDatum[] = [];
    if (analyticsMode === 'daily') {
      const daysInMonth = new Date(analyticsYearPick, analyticsMonthIndex + 1, 0).getDate();
      for (let day = 1; day <= daysInMonth; day++) {
        const key = `${analyticsYearPick}-${analyticsMonthIndex}-${day}`;
        const online = onlineByBucket.get(key) ?? 0;
        const walkin = walkByBucket.get(key) ?? 0;
        const labelD = new Date(analyticsYearPick, analyticsMonthIndex, day);
        const wk = labelD.toLocaleDateString(undefined, { weekday: 'short' });
        series.push({
          key,
          label: labelD.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }),
          shortLabel: `${wk} ${day}`,
          total: online + walkin,
          online,
          walkin,
        });
      }
    } else {
      for (let m = 0; m < 12; m++) {
        const key = String(m);
        const online = onlineByBucket.get(key) ?? 0;
        const walkin = walkByBucket.get(key) ?? 0;
        const labelM = new Date(analyticsYearPick, m, 1);
        series.push({
          key,
          label: labelM.toLocaleString(undefined, { month: 'long', year: 'numeric' }),
          shortLabel: labelM.toLocaleString(undefined, { month: 'short' }),
          total: online + walkin,
          online,
          walkin,
        });
      }
    }

    setAnalyticsSeries(series);
    setAnalyticsLoading(false);
  }, [user, businessId, analyticsMode, analyticsMonthIndex, analyticsYearPick]);

  useEffect(() => {
    if (!user || !businessId) return;
    load();
  }, [user, businessId, load]);

  useEffect(() => {
    if (!user || !businessId) return;
    void loadKpiCompare();
  }, [user, businessId, loadKpiCompare]);

  useEffect(() => {
    if (!user || !businessId) return;
    loadAnalytics();
  }, [user, businessId, loadAnalytics]);

  useEffect(() => {
    if (!user || !businessId) return;
    const sync = () => {
      load();
      loadAnalytics();
      void loadKpiCompare();
    };
    const channel = supabase
      .channel(`seller-sales-${businessId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `seller_id=eq.${businessId}` }, sync)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items' }, sync)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pos_sales', filter: `seller_id=eq.${businessId}` }, sync)
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, businessId, load, loadAnalytics, loadKpiCompare]);

  const totalSales = onlineSales + walkInSales;
  const txnCount = onlineOrderCount + walkInTxnCount;

  const heroTotal = sourceTab === 'all' ? totalSales : sourceTab === 'online' ? onlineSales : walkInSales;

  const rangeEndDisplay = new Date(rangeEnd.getTime() - 1);
  const rangeLabel = `${rangeStart.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })} – ${rangeEndDisplay.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}`;

  const primary = theme.colors.primary;
  const green = theme.colors.success;

  async function exportReport() {
    const body = [
      `Aquabeast WRS — Sales report`,
      `Range: ${rangeLabel}`,
      `Total sales: ${money(totalSales)}`,
      `Online (marked paid): ${money(onlineSales)} (${onlineOrderCount} orders)`,
      `Walk-in (POS): ${money(walkInSales)} (${walkInTxnCount} transactions)`,
      `Average per transaction: ${money(txnCount > 0 ? totalSales / txnCount : 0)}`,
    ].join('\n');
    try {
      await Share.share({ message: body, title: 'Sales report' });
    } catch {
      Alert.alert('Export', body);
    }
  }

  const periodButtonLabel = period === 'month' || period === 'year' ? periodTitle : periodLabel(period);
  const periodYears = useMemo(() => Array.from({ length: 6 }).map((_, idx) => now.getFullYear() - idx), [now]);
  const monthItems = useMemo(() => Array.from({ length: 12 }).map((_, i) => i), []);

  const analyticsInsights = useMemo(() => {
    const total = analyticsSeries.reduce((s, d) => s + d.total, 0);
    const onlineSum = analyticsSeries.reduce((s, d) => s + d.online, 0);
    const active = analyticsSeries.filter((d) => d.total > 0).length;
    const avgOnActive = active > 0 ? total / active : 0;
    const onlinePct = total > 0 ? (onlineSum / total) * 100 : 0;
    let peak: AnalyticsBarDatum | null = null;
    for (const d of analyticsSeries) {
      if (d.total <= 0) continue;
      if (!peak || d.total > peak.total) peak = d;
    }
    return {
      total,
      peak,
      active,
      avgOnActive,
      onlinePct,
      walkPct: total > 0 ? 100 - onlinePct : 0,
    };
  }, [analyticsSeries]);

  return (
    <Screen style={{ padding: 0, paddingBottom: 0 }}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Header */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: theme.spacing.md,
          paddingTop: Math.max(insets.top, 12) + 4,
          paddingBottom: 12,
          borderBottomWidth: 1,
          borderBottomColor: theme.colors.border,
          backgroundColor: theme.colors.bg,
        }}
      >
        <Pressable onPress={() => router.back()} hitSlop={12} style={{ width: 44, height: 44, justifyContent: 'center' }}>
          <Ionicons name="chevron-back" size={26} color={theme.colors.text} />
        </Pressable>
        <Text style={{ flex: 1, fontSize: 20, fontFamily: theme.font.extrabold, color: theme.colors.text, letterSpacing: -0.3 }}>
          Sales Report
        </Text>
        <Pressable
          onPress={() => setPeriodOpen(true)}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            paddingHorizontal: 12,
            height: 40,
            borderRadius: 14,
            borderWidth: 1,
            borderColor: theme.colors.border,
            backgroundColor: '#FFFFFF',
            ...theme.shadow.card,
          }}
        >
          <Ionicons name="calendar-outline" size={17} color={primary} />
          <Text weight="extrabold" style={{ fontSize: 13, color: theme.colors.text }}>
            {periodButtonLabel}
          </Text>
          <Ionicons name="chevron-down" size={16} color={theme.colors.muted} />
        </Pressable>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              await Promise.all([load(), loadAnalytics(), loadKpiCompare()]);
              setRefreshing(false);
            }}
          />
        }
        contentContainerStyle={{
          padding: theme.spacing.md,
          paddingBottom: theme.spacing.xl + insets.bottom,
          gap: theme.spacing.md,
        }}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View entering={FadeInDown.duration(200)}>
          {/* Segmented source filter */}
          <View
            style={{
              flexDirection: 'row',
              backgroundColor: 'rgba(18,101,214,0.08)',
              borderRadius: 16,
              padding: 4,
              gap: 4,
            }}
          >
            <SourceSegment
              label="All"
              icon="pie-chart-outline"
              active={sourceTab === 'all'}
              onPress={() => setSourceTab('all')}
            />
            <SourceSegment
              label="Online Orders"
              icon="bag-handle-outline"
              active={sourceTab === 'online'}
              onPress={() => setSourceTab('online')}
            />
            <SourceSegment
              label="Walk-in (POS)"
              icon="person-outline"
              active={sourceTab === 'walkin'}
              onPress={() => setSourceTab('walkin')}
            />
          </View>
        </Animated.View>

        {/* Overview — summary cards (same filter as tabs: All / Online / Walk-in) */}
        <Animated.View entering={FadeInDown.duration(200).delay(30)}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Text variant="h2" weight="extrabold">
                Overview
              </Text>
              <Text variant="muted" weight="semibold" style={{ marginTop: 4 }}>
                {periodTitle}
                {sourceTab === 'all' ? '' : sourceTab === 'online' ? ' · online orders' : ' · walk-in POS'}
                {' · '}Trend % is {previousPeriodHint(period)}.
              </Text>
            </View>
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 14 }}>
            <OverviewKpiCard
              title={sourceTab === 'walkin' ? 'POS sales' : 'Total sales'}
              value={
                kpiCompare
                  ? money(kpiCompare.curr.sales)
                  : loading
                    ? '—'
                    : money(heroTotal)
              }
              subtitle={sourceTab === 'all' ? 'Online + walk-in' : undefined}
              icon={sourceTab === 'walkin' ? 'storefront-outline' : 'cash-outline'}
              iconColor={primary}
              bg="rgba(18,101,214,0.10)"
              border="rgba(18,101,214,0.22)"
              deltaPct={
                kpiCompare ? pctVsPrevious(kpiCompare.curr.sales, kpiCompare.prev.sales) : null
              }
              hint={previousPeriodHint(period)}
            />
            <OverviewKpiCard
              title="Total transactions"
              subtitle="Online orders + POS (respects tab filter)"
              icon="bag-handle-outline"
              iconColor={green}
              bg="rgba(34,197,94,0.10)"
              border="rgba(34,197,94,0.22)"
              value={kpiCompare ? String(kpiCompare.curr.txnCount) : loading ? '—' : String(txnCount)}
              deltaPct={
                kpiCompare ? pctVsPrevious(kpiCompare.curr.txnCount, kpiCompare.prev.txnCount) : null
              }
              hint={previousPeriodHint(period)}
            />
            <OverviewKpiCard
              title="Online buyers"
              subtitle={
                sourceTab === 'walkin'
                  ? 'Not tracked separately for POS'
                  : 'Unique customers who placed an online order'
              }
              icon="people-outline"
              iconColor="#D97706"
              bg="rgba(245,158,11,0.12)"
              border="rgba(245,158,11,0.28)"
              value={sourceTab === 'walkin' ? '—' : kpiCompare ? String(kpiCompare.curr.buyerCount) : loading ? '—' : '—'}
              deltaHidden={sourceTab === 'walkin'}
              deltaPct={
                sourceTab === 'walkin' || !kpiCompare
                  ? null
                  : pctVsPrevious(kpiCompare.curr.buyerCount, kpiCompare.prev.buyerCount)
              }
              hint={previousPeriodHint(period)}
            />
            <OverviewKpiCard
              title="Containers / units"
              subtitle="Sum of quantities (order line items + POS)"
              icon="cube-outline"
              iconColor="#7C3AED"
              bg="rgba(139,92,246,0.10)"
              border="rgba(139,92,246,0.26)"
              value={kpiCompare ? String(kpiCompare.curr.units) : loading ? '—' : '—'}
              deltaPct={
                kpiCompare ? pctVsPrevious(kpiCompare.curr.units, kpiCompare.prev.units) : null
              }
              hint={previousPeriodHint(period)}
            />
          </View>
        </Animated.View>

        {error ? (
          <Card>
            <Text weight="bold" style={{ color: theme.colors.danger }}>
              {error}
            </Text>
          </Card>
        ) : null}

        {/* Summary */}
        <Animated.View entering={FadeInDown.duration(200).delay(70)}>
          <Card style={{ borderRadius: 20, padding: theme.spacing.lg }}>
            <Text variant="h2" weight="extrabold" style={{ marginBottom: 4 }}>
              Summary
            </Text>
            {loading ? (
              <Text variant="muted" style={{ marginTop: 12 }}>
                Loading…
            </Text>
            ) : (
              <View style={{ marginTop: 14, gap: 0 }}>
                <SummaryIconRow icon="cash-outline" iconColor={primary} label="Total Sales" value={money(totalSales)} valueColor={primary} />
                <SummaryIconRow icon="bag-handle-outline" iconColor={green} label="Online (marked paid)" value={money(onlineSales)} valueColor={green} />
                <SummaryIconRow
                  icon="storefront-outline"
                  iconColor={primary}
                  label="Walk-in (POS)"
                  value={money(walkInSales)}
                  valueColor={primary}
                />
                <View style={{ height: 1, backgroundColor: theme.colors.border, marginVertical: 14 }} />
                <SummaryIconRow
                  icon="bag-outline"
                  iconColor={theme.colors.muted}
                  label="Online Orders"
                  sublabel="Paid online orders (any status except cancelled)"
                  value={String(onlineOrderCount)}
                  valueColor={theme.colors.text}
                />
                <SummaryIconRow
                  icon="person-outline"
                  iconColor={theme.colors.muted}
                  label="Walk-in Transactions"
                  sublabel="Number of POS transactions"
                  value={String(walkInTxnCount)}
                  valueColor={theme.colors.text}
                />
                <SummaryIconRow
                  icon="trending-up-outline"
                  iconColor={theme.colors.muted}
                  label="Average per Transaction"
                  sublabel="Based on all transactions"
                  value={money(txnCount > 0 ? totalSales / txnCount : 0)}
                  valueColor={theme.colors.text}
                />
                <View style={{ height: 1, backgroundColor: theme.colors.border, marginVertical: 14 }} />
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
                  <Ionicons name="calendar-outline" size={18} color={theme.colors.muted} style={{ marginTop: 2 }} />
                  <Text variant="muted" style={{ flex: 1, lineHeight: 20 }}>
                    {rangeLabel}
                  </Text>
                </View>
              </View>
            )}
          </Card>
        </Animated.View>

        {/* Quick actions */}
        <Animated.View entering={FadeInDown.duration(200).delay(90)}>
          <View style={{ gap: 10 }}>
            <Text variant="h2" weight="extrabold">
              Quick Actions
            </Text>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Pressable
                onPress={() => load()}
                style={{
                  flex: 1,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  paddingVertical: 14,
                  borderRadius: 16,
                  backgroundColor: '#FFFFFF',
                  borderWidth: 1.5,
                  borderColor: primary,
                  ...theme.shadow.card,
                }}
              >
                <Ionicons name="refresh-outline" size={20} color={primary} />
                <Text weight="extrabold" style={{ color: primary, fontSize: 14 }}>
                  Refresh Report
                </Text>
              </Pressable>
              <Pressable
                onPress={exportReport}
                android_ripple={{ color: 'rgba(255,255,255,0.2)', borderless: true }}
                style={{
                  flex: 1,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  paddingVertical: 14,
                  borderRadius: 16,
                  backgroundColor: primary,
                  borderWidth: 0,
                  ...theme.shadow.card,
                }}
              >
                <Ionicons name="download-outline" size={20} color="#FFFFFF" />
                <Text weight="extrabold" style={{ color: '#FFFFFF', fontSize: 14 }}>
                  Export Report
                </Text>
              </Pressable>
            </View>
          </View>
        </Animated.View>

        <Animated.View entering={FadeInDown.duration(200).delay(110)}>
          <Card style={{ borderRadius: 20, padding: theme.spacing.lg, gap: theme.spacing.md }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
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
                <Ionicons name="analytics-outline" size={20} color={primary} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text variant="h2" weight="extrabold">
                  Sales overview
                </Text>
                <Text variant="muted" style={{ marginTop: 2 }}>
                  Daily or monthly totals (paid online orders + POS). Use granularity below.
                </Text>
              </View>
            </View>

            <View
              style={{
                flexDirection: 'row',
                backgroundColor: 'rgba(18,101,214,0.08)',
                borderRadius: 16,
                padding: 4,
                gap: 4,
              }}
            >
              <AnalyticsSegment label="Daily" active={analyticsMode === 'daily'} onPress={() => setAnalyticsMode('daily')} />
              <AnalyticsSegment label="Monthly" active={analyticsMode === 'monthly'} onPress={() => setAnalyticsMode('monthly')} />
            </View>

            {analyticsMode === 'daily' ? (
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <SelectField
                  icon="calendar-number-outline"
                  label={new Date(analyticsYearPick, analyticsMonthIndex, 1).toLocaleString(undefined, { month: 'long' })}
                  onPress={() => setAnalyticsMonthSelectOpen(true)}
                />
                <SelectField
                  icon="time-outline"
                  width={132}
                  label={String(analyticsYearPick)}
                  onPress={() => setAnalyticsYearSelectOpen(true)}
                />
              </View>
            ) : (
              <SelectField icon="time-outline" label={String(analyticsYearPick)} onPress={() => setAnalyticsYearSelectOpen(true)} />
            )}

            <Text weight="bold" style={{ fontSize: 13, color: theme.colors.muted }}>
              {analyticsMode === 'daily'
                ? `${new Date(analyticsYearPick, analyticsMonthIndex, 1).toLocaleString(undefined, { month: 'long', year: 'numeric' })} · daily`
                : `${analyticsYearPick} · monthly (Jan–Dec)`}
            </Text>

            <SalesAnalyticsBarChart
              analyticsMode={analyticsMode}
              data={analyticsSeries}
              loading={analyticsLoading}
              emptyHint={
                analyticsMode === 'daily'
                  ? 'No sales this month. Includes paid online orders and POS walk-ins.'
                  : 'No sales this year. Change year or pull to refresh.'
              }
            />

            {!analyticsLoading && analyticsInsights.total > 0 ? (
              <View style={{ gap: 12, marginTop: 4 }}>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                  <AnalyticsInsightPill icon="cash-outline" label="Period total" value={money(analyticsInsights.total)} />
                  <AnalyticsInsightPill
                    icon="trophy-outline"
                    label={analyticsMode === 'daily' ? 'Best day' : 'Best month'}
                    value={
                      analyticsInsights.peak
                        ? `${analyticsInsights.peak.shortLabel} · ${money(analyticsInsights.peak.total)}`
                        : '—'
                    }
                  />
                </View>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                  <AnalyticsInsightPill
                    icon="pulse-outline"
                    label={analyticsMode === 'daily' ? 'Avg on days with sales' : 'Avg on months with sales'}
                    value={money(analyticsInsights.avgOnActive)}
                  />
                  <AnalyticsInsightPill
                    icon="pie-chart-outline"
                    label="Channel mix"
                    value={`${analyticsInsights.onlinePct.toFixed(0)}% online`}
                    sub={`${analyticsInsights.walkPct.toFixed(0)}% walk-in`}
                  />
                </View>
                <Text variant="muted" style={{ fontSize: 12, lineHeight: 18 }}>
                  Use <Text weight="bold">By day</Text> to plan riders and refills around busy dates; <Text weight="bold">By month</Text>{' '}
                  shows seasonality. Online totals count orders you <Text weight="bold">marked paid</Text> (cancelled excluded), matching your summary above.
                </Text>
              </View>
            ) : null}
          </Card>
        </Animated.View>

        {/* Period modal + month/year pickers */}
        <Modal visible={periodOpen} transparent animationType="fade" onRequestClose={() => setPeriodOpen(false)}>
          <Pressable onPress={() => setPeriodOpen(false)} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.22)', padding: theme.spacing.md }}>
            <Pressable
              onPress={() => {}}
              style={{
                marginTop: 56,
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
                  <Ionicons name="calendar-outline" size={18} color={primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text variant="h2" weight="extrabold">
                    Filter
                  </Text>
                  <Text variant="muted">Choose a time range</Text>
                </View>
              </View>
              <View style={{ height: 1, backgroundColor: theme.colors.border }} />
              <View style={{ padding: theme.spacing.md, gap: 8 }}>
                {(['today', 'week', 'month', 'year'] as const).map((p) => {
                  const active = period === p;
                  return (
                    <Pressable
                      key={p}
                      onPress={() => {
                        setPeriod(p);
                        if (p !== 'month' && p !== 'year') setPeriodOpen(false);
                      }}
                      style={{
                        paddingVertical: 12,
                        paddingHorizontal: 12,
                        borderRadius: 14,
                        borderWidth: 1,
                        borderColor: active ? 'rgba(18,101,214,0.22)' : theme.colors.border,
                        backgroundColor: active ? 'rgba(18,101,214,0.08)' : '#fff',
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 10,
                      }}
                    >
                      <View
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: 10,
                          backgroundColor: active ? 'rgba(18,101,214,0.12)' : 'rgba(10,27,55,0.06)',
                          borderWidth: 1,
                          borderColor: active ? 'rgba(18,101,214,0.18)' : theme.colors.border,
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Ionicons
                          name={p === 'today' ? 'sunny-outline' : p === 'week' ? 'calendar-outline' : p === 'month' ? 'calendar-number-outline' : 'time-outline'}
                          size={16}
                          color={active ? primary : theme.colors.muted}
                        />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text weight="extrabold">{periodLabel(p)}</Text>
                        <Text variant="muted">
                          {p === 'today' ? 'This day only' : p === 'week' ? 'Monday to Sunday' : p === 'month' ? 'Choose month & year' : 'Choose a year'}
                        </Text>
                      </View>
                      {active ? <Ionicons name="checkmark" size={18} color={primary} /> : null}
                    </Pressable>
                  );
                })}
              </View>
              {period === 'month' ? (
                <View style={{ paddingHorizontal: theme.spacing.md, paddingBottom: theme.spacing.md, gap: 10 }}>
                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <SelectField
                      icon="calendar-number-outline"
                      label={new Date(2000, monthIndex, 1).toLocaleString(undefined, { month: 'long' })}
                      onPress={() => setMonthSelectOpen(true)}
                    />
                    <SelectField icon="time-outline" width={132} label={String(monthYear)} onPress={() => setMonthYearSelectOpen(true)} />
                  </View>
                  <Pressable
                    onPress={() => setPeriodOpen(false)}
                    style={{ alignSelf: 'flex-end', paddingVertical: 10, paddingHorizontal: 16 }}
                  >
                    <Text weight="extrabold" style={{ color: primary }}>
                      Done
                    </Text>
                  </Pressable>
                </View>
              ) : null}
              {period === 'year' ? (
                <View style={{ paddingHorizontal: theme.spacing.md, paddingBottom: theme.spacing.md, gap: 10 }}>
                  <SelectField icon="time-outline" label={String(year)} onPress={() => setYearSelectOpen(true)} />
                  <Pressable onPress={() => setPeriodOpen(false)} style={{ alignSelf: 'flex-end', paddingVertical: 10, paddingHorizontal: 16 }}>
                    <Text weight="extrabold" style={{ color: primary }}>
                      Done
                    </Text>
                  </Pressable>
                </View>
              ) : null}
            </Pressable>
          </Pressable>
        </Modal>

        <SelectListModal
          visible={analyticsMonthSelectOpen}
          title="Month"
          items={monthItems}
          selected={analyticsMonthIndex}
          getLabel={(m) => new Date(2000, Number(m), 1).toLocaleString(undefined, { month: 'long' })}
          onSelect={(m) => setAnalyticsMonthIndex(Number(m))}
          onClose={() => setAnalyticsMonthSelectOpen(false)}
        />
        <SelectListModal
          visible={analyticsYearSelectOpen}
          title="Year"
          items={Array.from({ length: 10 }).map((_, idx) => now.getFullYear() - idx)}
          selected={analyticsYearPick}
          getLabel={(y) => String(y)}
          onSelect={(y) => setAnalyticsYearPick(Number(y))}
          onClose={() => setAnalyticsYearSelectOpen(false)}
        />

        <SelectListModal
          visible={monthSelectOpen}
          title="Month"
          items={monthItems}
          selected={monthIndex}
          getLabel={(m) => new Date(2000, Number(m), 1).toLocaleString(undefined, { month: 'long' })}
          onSelect={(m) => setMonthIndex(Number(m))}
          onClose={() => setMonthSelectOpen(false)}
        />
        <SelectListModal
          visible={monthYearSelectOpen}
          title="Year"
          items={periodYears}
          selected={monthYear}
          getLabel={(y) => String(y)}
          onSelect={(y) => setMonthYear(Number(y))}
          onClose={() => setMonthYearSelectOpen(false)}
        />
        <SelectListModal
          visible={yearSelectOpen}
          title="Year"
          items={periodYears}
          selected={year}
          getLabel={(y) => String(y)}
          onSelect={(y) => setYear(Number(y))}
          onClose={() => setYearSelectOpen(false)}
        />
      </ScrollView>
    </Screen>
  );
}

function AnalyticsInsightPill({
  icon,
  label,
  value,
  sub,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <View
      style={{
        flex: 1,
        minWidth: 148,
        borderRadius: 14,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: 'rgba(10,27,55,0.08)',
        backgroundColor: theme.colors.card,
        padding: 12,
        gap: 4,
        elevation: 0,
        shadowOpacity: 0,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Ionicons name={icon} size={16} color={theme.colors.primary} />
        <Text weight="bold" style={{ fontSize: 11, color: theme.colors.muted }} numberOfLines={1}>
          {label}
        </Text>
      </View>
      <Text weight="extrabold" style={{ fontSize: 15, color: theme.colors.text }} numberOfLines={2}>
        {value}
      </Text>
      {sub ? (
        <Text variant="muted" style={{ fontSize: 11 }}>
          {sub}
        </Text>
      ) : null}
    </View>
  );
}

function SourceSegment({
  label,
  icon,
  active,
  onPress,
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  active: boolean;
  onPress: () => void;
}) {
  const primary = theme.colors.primary;
  return (
    <Pressable
      onPress={onPress}
      android_ripple={{ color: 'rgba(18,101,214,0.08)', borderless: true }}
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 10,
        paddingHorizontal: 4,
        borderRadius: 12,
        backgroundColor: active ? '#FFFFFF' : 'transparent',
        borderWidth: active ? StyleSheet.hairlineWidth : 0,
        borderColor: active ? 'rgba(18,101,214,0.18)' : 'transparent',
        elevation: 0,
        shadowOpacity: 0,
      }}
    >
      <Ionicons name={icon} size={16} color={active ? primary : theme.colors.muted} />
      <Text
        numberOfLines={1}
        weight="extrabold"
        style={{
          marginTop: 4,
          fontSize: 10,
          color: active ? primary : theme.colors.muted,
          textAlign: 'center',
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function SummaryIconRow({
  icon,
  iconColor,
  label,
  sublabel,
  value,
  valueColor,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  iconColor: string;
  label: string;
  sublabel?: string;
  value: string;
  valueColor: string;
}) {
  return (
    <View style={{ paddingVertical: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View
          style={{
            width: 36,
            height: 36,
            borderRadius: 11,
            backgroundColor: 'rgba(10,27,55,0.05)',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons name={icon} size={18} color={iconColor} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text weight="bold" style={{ color: theme.colors.text, fontSize: 14 }}>
            {label}
          </Text>
          {sublabel ? (
            <Text variant="muted" style={{ marginTop: 2, fontSize: 12 }}>
              {sublabel}
            </Text>
          ) : null}
        </View>
        <Text weight="extrabold" style={{ color: valueColor, fontSize: 15 }}>
          {value}
        </Text>
      </View>
    </View>
  );
}
