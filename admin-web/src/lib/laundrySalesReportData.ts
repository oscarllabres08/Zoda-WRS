import { supabase } from './supabase';
import type { SalesDashboardData, SalesDisplayMode, TimelinePoint } from './salesReportData';
import { monthBounds, yearBounds } from './salesReportData';

type LaundryPosRow = {
  id: string;
  created_at: string;
  receipt_no?: string;
  customer_name?: string;
  laundry_pos_sale_items: { service_name: string; unit_price: number; quantity: number }[];
};

function lineTotal(items: { unit_price: number; quantity: number }[]): number {
  return items.reduce((s, it) => s + Number(it.unit_price) * Number(it.quantity), 0);
}

function bucketKey(d: Date, mode: 'day' | 'month'): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  if (mode === 'month') return `${y}-${m}`;
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function aggregateLaundry(pos: LaundryPosRow[], timelineMode: 'day' | 'month'): SalesDashboardData {
  const timelineMap = new Map<string, TimelinePoint>();
  const prodMap = new Map<string, { name: string; units: number; revenue: number }>();
  let totalSales = 0;
  const recentSales: SalesDashboardData['recentSales'] = [];

  for (const s of pos) {
    const at = new Date(s.created_at);
    const amt = lineTotal(s.laundry_pos_sale_items ?? []);
    totalSales += amt;
    const key = bucketKey(at, timelineMode);
    const cur = timelineMap.get(key) ?? { key, label: key, online: 0, walkIn: 0, total: 0 };
    cur.walkIn += amt;
    cur.total += amt;
    timelineMap.set(key, cur);

    for (const it of s.laundry_pos_sale_items ?? []) {
      const prev = prodMap.get(it.service_name) ?? { name: it.service_name, units: 0, revenue: 0 };
      prev.units += Number(it.quantity);
      prev.revenue += Number(it.unit_price) * Number(it.quantity);
      prodMap.set(it.service_name, prev);
    }

    const names = (s.laundry_pos_sale_items ?? []).map((i) => i.service_name).slice(0, 2);
    recentSales.push({
      id: `l-${s.id}`,
      at,
      type: 'walk-in',
      amount: amt,
      status: 'paid',
      productLabel: names.join(', ') || 'Laundry sale',
      customerName: s.customer_name?.trim() || 'Walk-in customer',
    });
  }

  recentSales.sort((a, b) => b.at.getTime() - a.at.getTime());
  const timeline = [...timelineMap.values()].sort((a, b) => a.key.localeCompare(b.key));

  return {
    onlineSales: 0,
    walkInSales: totalSales,
    totalSales,
    onlineOrderCount: 0,
    walkInTxnCount: pos.length,
    totalOrderCount: pos.length,
    paidOrders: pos.length,
    unpaidOrders: 0,
    timeline,
    categoryTotals: { water: 0, containers: 0, accessories: 0, others: totalSales },
    topProducts: [...prodMap.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 8),
    recentSales: recentSales.slice(0, 12),
    prevTotalSales: 0,
    prevTotalOrders: 0,
  };
}

async function fetchLaundryRange(businessId: string, from: Date, to: Date): Promise<LaundryPosRow[]> {
  const { data } = await supabase
    .from('laundry_pos_sales')
    .select('id,created_at,receipt_no,customer_name,laundry_pos_sale_items(service_name,unit_price,quantity)')
    .eq('seller_id', businessId)
    .gte('created_at', from.toISOString())
    .lte('created_at', to.toISOString());
  return (data ?? []) as LaundryPosRow[];
}

export type LaundryExportTransaction = {
  at: Date;
  customerName: string;
  receiptNo: string;
  amount: number;
  services: string;
};

function buildLaundryTransactions(pos: LaundryPosRow[]): LaundryExportTransaction[] {
  const rows = pos.map((s) => ({
    at: new Date(s.created_at),
    customerName: (s.customer_name ?? '').trim() || 'Walk-in customer',
    receiptNo: (s.receipt_no ?? s.id.slice(0, 8)).toUpperCase(),
    amount: lineTotal(s.laundry_pos_sale_items ?? []),
    services: (s.laundry_pos_sale_items ?? []).map((i) => `${i.service_name} ×${i.quantity}`).join('; '),
  }));
  rows.sort((a, b) => b.at.getTime() - a.at.getTime());
  return rows;
}

export type LaundryMonthExportPayload = {
  monthLabel: string;
  generatedAt: Date;
  data: SalesDashboardData;
  transactions: LaundryExportTransaction[];
};

export async function fetchLaundryMonthExportPayload(
  businessId: string,
  year: number,
  monthIndex: number
): Promise<LaundryMonthExportPayload> {
  const { from, to } = monthBounds(year, monthIndex);
  const pos = await fetchLaundryRange(businessId, from, to);
  const data = aggregateLaundry(pos, 'day');
  const monthLabel = from.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  return {
    monthLabel,
    generatedAt: new Date(),
    data,
    transactions: buildLaundryTransactions(pos),
  };
}

export type LaundryYearMonthRow = {
  monthLabel: string;
  total: number;
  txnCount: number;
};

export type LaundryYearExportPayload = {
  year: number;
  generatedAt: Date;
  months: LaundryYearMonthRow[];
  yearTotals: { totalSales: number; txnCount: number };
  topServices: { name: string; units: number; revenue: number }[];
};

export async function fetchLaundryYearExportPayload(
  businessId: string,
  year: number
): Promise<LaundryYearExportPayload> {
  const months: LaundryYearMonthRow[] = [];
  let yearTotal = 0;
  let yearTx = 0;

  for (let m = 0; m < 12; m++) {
    const { from, to } = monthBounds(year, m);
    const pos = await fetchLaundryRange(businessId, from, to);
    const slice = aggregateLaundry(pos, 'day');
    yearTotal += slice.totalSales;
    yearTx += slice.totalOrderCount;
    months.push({
      monthLabel: from.toLocaleDateString('en-US', { month: 'long' }),
      total: slice.totalSales,
      txnCount: slice.totalOrderCount,
    });
  }

  const { from, to } = yearBounds(year);
  const pos = await fetchLaundryRange(businessId, from, to);
  const yearData = aggregateLaundry(pos, 'month');

  return {
    year,
    generatedAt: new Date(),
    months,
    yearTotals: { totalSales: yearTotal, txnCount: yearTx },
    topServices: yearData.topProducts,
  };
}

export async function loadLaundrySalesView(
  businessId: string,
  mode: SalesDisplayMode,
  year: number,
  monthIndex: number
): Promise<SalesDashboardData> {
  if (mode === 'day') {
    const { from, to } = monthBounds(year, monthIndex);
    const pos = await fetchLaundryRange(businessId, from, to);
    const data = aggregateLaundry(pos, 'day');
    data.timeline = data.timeline.map((pt) => ({
      ...pt,
      label: String(Number(pt.key.slice(8, 10))),
    }));
    const prevMonth = monthIndex === 0 ? monthBounds(year - 1, 11) : monthBounds(year, monthIndex - 1);
    const prevPos = await fetchLaundryRange(businessId, prevMonth.from, prevMonth.to);
    const prev = aggregateLaundry(prevPos, 'day');
    data.prevTotalSales = prev.totalSales;
    data.prevTotalOrders = prev.totalOrderCount;
    return data;
  }

  if (mode === 'month') {
    const { from, to } = yearBounds(year);
    const pos = await fetchLaundryRange(businessId, from, to);
    const data = aggregateLaundry(pos, 'month');
    const prevBounds = yearBounds(year - 1);
    const prev = await fetchLaundryRange(businessId, prevBounds.from, prevBounds.to);
    const prevAgg = aggregateLaundry(prev, 'month');
    data.prevTotalSales = prevAgg.totalSales;
    data.prevTotalOrders = prevAgg.totalOrderCount;
    return data;
  }

  const { from, to } = yearBounds(year);
  const pos = await fetchLaundryRange(businessId, from, to);
  return aggregateLaundry(pos, 'month');
}
