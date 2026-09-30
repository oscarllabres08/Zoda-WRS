import { orderCountsTowardOnlineSales } from './orderSalesEligible';
import { categoryFromProductName, type SalesCategoryKey } from './productCategory';
import { supabase } from './supabase';

export type DashboardPeriod = 'week' | 'month' | 'year';

type OrderRow = {
  id: string;
  created_at: string;
  status: string;
  payment_settled: boolean | null;
  payment_method: string | null;
  order_items: { product_name: string; unit_price: number; quantity: number; product_id?: string | null }[];
};

type PosRow = {
  id: string;
  created_at: string;
  pos_sale_items: { product_name: string; unit_price: number; quantity: number; product_id?: string | null }[];
};

export type TimelinePoint = {
  key: string;
  label: string;
  online: number;
  walkIn: number;
  total: number;
};

export type RecentSaleRow = {
  id: string;
  at: Date;
  type: 'online' | 'walk-in';
  amount: number;
  status: 'paid' | 'unpaid';
  productLabel: string;
};

export type SalesDashboardData = {
  onlineSales: number;
  walkInSales: number;
  totalSales: number;
  onlineOrderCount: number;
  walkInTxnCount: number;
  totalOrderCount: number;
  paidOrders: number;
  unpaidOrders: number;
  timeline: TimelinePoint[];
  categoryTotals: Record<SalesCategoryKey, number>;
  topProducts: { name: string; units: number; revenue: number }[];
  recentSales: RecentSaleRow[];
  prevTotalSales: number;
  prevTotalOrders: number;
};

export function periodBounds(period: DashboardPeriod, ref = new Date()): { from: Date; to: Date; label: string } {
  const to = new Date(ref);
  to.setHours(23, 59, 59, 999);
  if (period === 'week') {
    const from = new Date(ref);
    from.setDate(from.getDate() - 6);
    from.setHours(0, 0, 0, 0);
    return { from, to, label: 'Last 7 days' };
  }
  if (period === 'month') {
    const from = new Date(ref.getFullYear(), ref.getMonth(), 1);
    from.setHours(0, 0, 0, 0);
    return { from, to, label: ref.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) };
  }
  const from = new Date(ref.getFullYear(), 0, 1);
  from.setHours(0, 0, 0, 0);
  return { from, to, label: String(ref.getFullYear()) };
}

export function previousPeriodBounds(period: DashboardPeriod, ref = new Date()): { from: Date; to: Date } {
  if (period === 'week') {
    const to = new Date(ref);
    to.setDate(to.getDate() - 7);
    to.setHours(23, 59, 59, 999);
    const from = new Date(to);
    from.setDate(from.getDate() - 6);
    from.setHours(0, 0, 0, 0);
    return { from, to };
  }
  if (period === 'month') {
    const from = new Date(ref.getFullYear(), ref.getMonth() - 1, 1);
    from.setHours(0, 0, 0, 0);
    const to = new Date(ref.getFullYear(), ref.getMonth(), 0, 23, 59, 59, 999);
    return { from, to };
  }
  const from = new Date(ref.getFullYear() - 1, 0, 1);
  const to = new Date(ref.getFullYear() - 1, 11, 31, 23, 59, 59, 999);
  return { from, to };
}

export function monthBounds(year: number, monthIndex: number): { from: Date; to: Date } {
  const from = new Date(year, monthIndex, 1, 0, 0, 0, 0);
  const to = new Date(year, monthIndex + 1, 0, 23, 59, 59, 999);
  return { from, to };
}

export function yearBounds(year: number): { from: Date; to: Date } {
  return {
    from: new Date(year, 0, 1, 0, 0, 0, 0),
    to: new Date(year, 11, 31, 23, 59, 59, 999),
  };
}

function lineTotal(items: { unit_price: number; quantity: number }[]): number {
  return items.reduce((s, it) => s + Number(it.unit_price) * Number(it.quantity), 0);
}

function bucketKey(d: Date, period: DashboardPeriod): string {
  if (period === 'year') return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function bucketLabel(key: string, period: DashboardPeriod): string {
  if (period === 'year') {
    const [y, m] = key.split('-');
    const dt = new Date(Number(y), Number(m) - 1, 1);
    return dt.toLocaleDateString('en-US', { month: 'short' });
  }
  const dt = new Date(key + 'T12:00:00');
  return dt.toLocaleDateString('en-US', { weekday: 'short' });
}

function initTimeline(from: Date, to: Date, period: DashboardPeriod): Map<string, TimelinePoint> {
  const map = new Map<string, TimelinePoint>();
  if (period === 'year') {
    const y = from.getFullYear();
    for (let m = 0; m < 12; m++) {
      const key = `${y}-${String(m + 1).padStart(2, '0')}`;
      map.set(key, { key, label: bucketLabel(key, period), online: 0, walkIn: 0, total: 0 });
    }
    return map;
  }
  const cur = new Date(from);
  cur.setHours(0, 0, 0, 0);
  const end = new Date(to);
  end.setHours(0, 0, 0, 0);
  while (cur <= end) {
    const key = bucketKey(cur, period);
    map.set(key, { key, label: bucketLabel(key, period), online: 0, walkIn: 0, total: 0 });
    cur.setDate(cur.getDate() + 1);
  }
  return map;
}

async function loadProductCategories(businessId: string): Promise<Map<string, 'water' | 'other'>> {
  const { data } = await supabase.from('products').select('id,category').eq('seller_id', businessId);
  const map = new Map<string, 'water' | 'other'>();
  for (const p of data ?? []) {
    const row = p as { id: string; category: 'water' | 'other' };
    map.set(row.id, row.category);
  }
  return map;
}

function aggregate(
  orders: OrderRow[],
  posSales: PosRow[],
  productCats: Map<string, 'water' | 'other'>,
  period: DashboardPeriod,
  from: Date,
  to: Date
): SalesDashboardData {
  const timelineMap = initTimeline(from, to, period);
  const categoryTotals: Record<SalesCategoryKey, number> = {
    water: 0,
    containers: 0,
    others: 0,
    accessories: 0,
  };
  const prodMap = new Map<string, { name: string; units: number; revenue: number }>();

  let onlineSales = 0;
  let walkInSales = 0;
  let onlineOrderCount = 0;
  let paidOrders = 0;
  let unpaidOrders = 0;

  const recentSales: RecentSaleRow[] = [];

  for (const o of orders) {
    const amt = lineTotal(o.order_items ?? []);
    const at = new Date(o.created_at);
    const countsOnline = orderCountsTowardOnlineSales(o);
    const isPaid = o.payment_settled === true && o.status !== 'cancelled';
    const isUnpaid = o.status !== 'cancelled' && o.payment_settled !== true;

    if (isUnpaid) unpaidOrders += 1;
    if (isPaid) paidOrders += 1;

    if (countsOnline) {
      onlineSales += amt;
      onlineOrderCount += 1;
      const key = bucketKey(at, period);
      const pt = timelineMap.get(key);
      if (pt) {
        pt.online += amt;
        pt.total += amt;
      }
    }

    for (const it of o.order_items ?? []) {
      if (!countsOnline) continue;
      const cat = categoryFromProductName(it.product_name, it.product_id ? productCats.get(it.product_id) : null);
      const lineAmt = Number(it.unit_price) * Number(it.quantity);
      categoryTotals[cat] += lineAmt;
      const prev = prodMap.get(it.product_name) ?? { name: it.product_name, units: 0, revenue: 0 };
      prev.units += Number(it.quantity);
      prev.revenue += lineAmt;
      prodMap.set(it.product_name, prev);
    }

    if (o.status !== 'cancelled') {
      const names = (o.order_items ?? []).map((i) => i.product_name).slice(0, 2);
      recentSales.push({
        id: `o-${o.id}`,
        at,
        type: 'online',
        amount: amt,
        status: isPaid ? 'paid' : 'unpaid',
        productLabel: names.join(', ') || 'Online order',
      });
    }
  }

  for (const s of posSales) {
    const amt = lineTotal(s.pos_sale_items ?? []);
    walkInSales += amt;
    const at = new Date(s.created_at);
    const key = bucketKey(at, period);
    const pt = timelineMap.get(key);
    if (pt) {
      pt.walkIn += amt;
      pt.total += amt;
    }

    for (const it of s.pos_sale_items ?? []) {
      const cat = categoryFromProductName(it.product_name, it.product_id ? productCats.get(it.product_id) : null);
      const lineAmt = Number(it.unit_price) * Number(it.quantity);
      categoryTotals[cat] += lineAmt;
      const prev = prodMap.get(it.product_name) ?? { name: it.product_name, units: 0, revenue: 0 };
      prev.units += Number(it.quantity);
      prev.revenue += lineAmt;
      prodMap.set(it.product_name, prev);
    }

    const names = (s.pos_sale_items ?? []).map((i) => i.product_name).slice(0, 2);
    recentSales.push({
      id: `p-${s.id}`,
      at,
      type: 'walk-in',
      amount: amt,
      status: 'paid',
      productLabel: names.join(', ') || 'Walk-in sale',
    });
  }

  recentSales.sort((a, b) => b.at.getTime() - a.at.getTime());

  const timeline = [...timelineMap.values()].sort((a, b) => a.key.localeCompare(b.key));
  const topProducts = [...prodMap.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 5);

  return {
    onlineSales,
    walkInSales,
    totalSales: onlineSales + walkInSales,
    onlineOrderCount,
    walkInTxnCount: posSales.length,
    totalOrderCount: onlineOrderCount + posSales.length,
    paidOrders: paidOrders + posSales.length,
    unpaidOrders,
    timeline,
    categoryTotals,
    topProducts,
    recentSales: recentSales.slice(0, 12),
    prevTotalSales: 0,
    prevTotalOrders: 0,
  };
}

async function fetchRange(businessId: string, from: Date, to: Date): Promise<{ orders: OrderRow[]; pos: PosRow[] }> {
  const fromIso = from.toISOString();
  const toIso = to.toISOString();
  const [ordersRes, posRes] = await Promise.all([
    supabase
      .from('orders')
      .select('id,created_at,status,payment_settled,payment_method,order_items(product_name,unit_price,quantity,product_id)')
      .eq('seller_id', businessId)
      .gte('created_at', fromIso)
      .lte('created_at', toIso),
    supabase
      .from('pos_sales')
      .select('id,created_at,pos_sale_items(product_name,unit_price,quantity,product_id)')
      .eq('seller_id', businessId)
      .gte('created_at', fromIso)
      .lte('created_at', toIso),
  ]);
  return {
    orders: (ordersRes.data ?? []) as OrderRow[],
    pos: (posRes.data ?? []) as PosRow[],
  };
}

export type SalesDisplayMode = 'day' | 'month' | 'year';

export type SalesOverviewMonth = {
  timeline: TimelinePoint[];
  onlineSales: number;
  walkInSales: number;
  totalSales: number;
};

async function loadRangeDashboard(
  businessId: string,
  from: Date,
  to: Date,
  timelinePeriod: DashboardPeriod,
  prevFrom: Date,
  prevTo: Date,
  labelTimeline: (pts: TimelinePoint[]) => TimelinePoint[]
): Promise<SalesDashboardData> {
  const productCats = await loadProductCategories(businessId);
  const [current, previous] = await Promise.all([
    fetchRange(businessId, from, to),
    fetchRange(businessId, prevFrom, prevTo),
  ]);
  const data = aggregate(current.orders, current.pos, productCats, timelinePeriod, from, to);
  data.timeline = labelTimeline(data.timeline);
  const prevAgg = aggregate(previous.orders, previous.pos, productCats, timelinePeriod, prevFrom, prevTo);
  data.prevTotalSales = prevAgg.totalSales;
  data.prevTotalOrders = prevAgg.totalOrderCount;
  return data;
}

/** KPIs + chart for day / month / year display filters. */
export async function loadSalesAnalyticsView(
  businessId: string,
  mode: SalesDisplayMode,
  year: number,
  monthIndex: number
): Promise<SalesDashboardData> {
  if (mode === 'day') {
    const { from, to } = monthBounds(year, monthIndex);
    const prev =
      monthIndex === 0 ? monthBounds(year - 1, 11) : monthBounds(year, monthIndex - 1);
    return loadRangeDashboard(businessId, from, to, 'month', prev.from, prev.to, (pts) =>
      pts.map((pt) => ({ ...pt, label: String(Number(pt.key.slice(8, 10))) }))
    );
  }

  if (mode === 'month') {
    const { from, to } = yearBounds(year);
    const prev = yearBounds(year - 1);
    return loadRangeDashboard(businessId, from, to, 'year', prev.from, prev.to, (pts) => pts);
  }

  const productCats = await loadProductCategories(businessId);
  const spanStart = year - 4;
  const timeline: TimelinePoint[] = [];
  const { from: curFrom, to: curTo } = yearBounds(year);
  const { from: prevFrom, to: prevTo } = yearBounds(year - 1);

  const [currentYear, previousYear] = await Promise.all([
    fetchRange(businessId, curFrom, curTo),
    fetchRange(businessId, prevFrom, prevTo),
  ]);
  const current = aggregate(currentYear.orders, currentYear.pos, productCats, 'year', curFrom, curTo);

  for (let y = spanStart; y <= year; y++) {
    const { from, to } = yearBounds(y);
    const { orders, pos } = await fetchRange(businessId, from, to);
    const slice = aggregate(orders, pos, productCats, 'year', from, to);
    timeline.push({
      key: String(y),
      label: String(y),
      online: slice.onlineSales,
      walkIn: slice.walkInSales,
      total: slice.totalSales,
    });
  }

  const prevAgg = aggregate(previousYear.orders, previousYear.pos, productCats, 'year', prevFrom, prevTo);
  current.timeline = timeline;
  current.prevTotalSales = prevAgg.totalSales;
  current.prevTotalOrders = prevAgg.totalOrderCount;
  return current;
}

/** Daily sales timeline for one calendar month (x-axis: day 1 … last day). */
export async function loadSalesOverviewMonth(
  businessId: string,
  year: number,
  monthIndex: number
): Promise<SalesOverviewMonth> {
  const data = await loadSalesAnalyticsView(businessId, 'day', year, monthIndex);
  return {
    timeline: data.timeline,
    onlineSales: data.onlineSales,
    walkInSales: data.walkInSales,
    totalSales: data.totalSales,
  };
}

export async function loadSalesDashboard(
  businessId: string,
  period: DashboardPeriod
): Promise<SalesDashboardData> {
  const { from, to } = periodBounds(period);
  const prev = previousPeriodBounds(period);
  const productCats = await loadProductCategories(businessId);
  const [current, previous] = await Promise.all([fetchRange(businessId, from, to), fetchRange(businessId, prev.from, prev.to)]);

  const data = aggregate(current.orders, current.pos, productCats, period, from, to);
  const prevAgg = aggregate(previous.orders, previous.pos, productCats, period, prev.from, prev.to);
  data.prevTotalSales = prevAgg.totalSales;
  data.prevTotalOrders = prevAgg.totalOrderCount;
  return data;
}

export type ExportTransaction = {
  at: Date;
  type: 'Online' | 'Walk-in';
  status: 'Paid' | 'Unpaid';
  amount: number;
  products: string;
};

function buildTransactions(orders: OrderRow[], pos: PosRow[]): ExportTransaction[] {
  const rows: ExportTransaction[] = [
    ...orders.flatMap((o) => {
      const amt = lineTotal(o.order_items ?? []);
      const paid = orderCountsTowardOnlineSales(o);
      if (o.status === 'cancelled') return [];
      return [
        {
          at: new Date(o.created_at),
          type: 'Online' as const,
          status: paid ? ('Paid' as const) : ('Unpaid' as const),
          amount: amt,
          products: (o.order_items ?? []).map((i) => i.product_name).join('; '),
        },
      ];
    }),
    ...pos.map((s) => ({
      at: new Date(s.created_at),
      type: 'Walk-in' as const,
      status: 'Paid' as const,
      amount: lineTotal(s.pos_sale_items ?? []),
      products: (s.pos_sale_items ?? []).map((i) => i.product_name).join('; '),
    })),
  ];
  rows.sort((a, b) => b.at.getTime() - a.at.getTime());
  return rows;
}

export type MonthExportPayload = {
  monthLabel: string;
  generatedAt: Date;
  data: SalesDashboardData;
  transactions: ExportTransaction[];
};

export async function fetchMonthExportPayload(
  businessId: string,
  year: number,
  monthIndex: number
): Promise<MonthExportPayload> {
  const { from, to } = monthBounds(year, monthIndex);
  const productCats = await loadProductCategories(businessId);
  const { orders, pos } = await fetchRange(businessId, from, to);
  const data = aggregate(orders, pos, productCats, 'month', from, to);
  const monthLabel = from.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  return {
    monthLabel,
    generatedAt: new Date(),
    data,
    transactions: buildTransactions(orders, pos),
  };
}

export type YearMonthRow = {
  monthLabel: string;
  online: number;
  walkIn: number;
  total: number;
  onlineOrders: number;
  walkInTxns: number;
};

export type YearExportPayload = {
  year: number;
  generatedAt: Date;
  months: YearMonthRow[];
  yearTotals: {
    totalSales: number;
    onlineSales: number;
    walkInSales: number;
    onlineOrders: number;
    walkInTxns: number;
  };
  categoryTotals: Record<SalesCategoryKey, number>;
  topProducts: { name: string; units: number; revenue: number }[];
};

export async function fetchYearExportPayload(businessId: string, year: number): Promise<YearExportPayload> {
  const productCats = await loadProductCategories(businessId);
  const months: YearMonthRow[] = [];
  let yearOnline = 0;
  let yearWalk = 0;
  let yearOrders = 0;
  let yearWalkTx = 0;

  for (let m = 0; m < 12; m++) {
    const { from, to } = monthBounds(year, m);
    const { orders, pos } = await fetchRange(businessId, from, to);
    const data = aggregate(orders, pos, productCats, 'month', from, to);
    yearOnline += data.onlineSales;
    yearWalk += data.walkInSales;
    yearOrders += data.onlineOrderCount;
    yearWalkTx += data.walkInTxnCount;
    months.push({
      monthLabel: from.toLocaleDateString('en-US', { month: 'long' }),
      online: data.onlineSales,
      walkIn: data.walkInSales,
      total: data.totalSales,
      onlineOrders: data.onlineOrderCount,
      walkInTxns: data.walkInTxnCount,
    });
  }

  const { from, to } = yearBounds(year);
  const { orders, pos } = await fetchRange(businessId, from, to);
  const yearData = aggregate(orders, pos, productCats, 'year', from, to);

  return {
    year,
    generatedAt: new Date(),
    months,
    yearTotals: {
      totalSales: yearOnline + yearWalk,
      onlineSales: yearOnline,
      walkInSales: yearWalk,
      onlineOrders: yearOrders,
      walkInTxns: yearWalkTx,
    },
    categoryTotals: yearData.categoryTotals,
    topProducts: yearData.topProducts,
  };
}

export function pctChange(current: number, previous: number): number | null {
  if (previous <= 0) return current > 0 ? 100 : null;
  return ((current - previous) / previous) * 100;
}
