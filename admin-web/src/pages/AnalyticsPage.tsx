import { useCallback, useEffect, useMemo, useState } from 'react';

import { PageHeader } from '../components/PageHeader';
import { useAuth } from '../auth/AuthProvider';
import { money } from '../lib/format';
import { supabase } from '../lib/supabase';

type StatusCount = { status: string; count: number };
type TopProduct = { name: string; units: number };
type Period = 'week' | 'month' | 'year';

function rangeStart(period: Period): Date {
  const now = new Date();
  if (period === 'week') {
    const d = new Date(now);
    d.setDate(d.getDate() - 7);
    return d;
  }
  if (period === 'month') {
    return new Date(now.getFullYear(), now.getMonth(), 1);
  }
  return new Date(now.getFullYear(), 0, 1);
}

export function AnalyticsPage() {
  const { businessId } = useAuth();
  const [period, setPeriod] = useState<Period>('month');
  const [byStatus, setByStatus] = useState<StatusCount[]>([]);
  const [topProducts, setTopProducts] = useState<TopProduct[]>([]);
  const [onlineSales, setOnlineSales] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!businessId) return;
    setLoading(true);
    const from = rangeStart(period);

    const { data: orders } = await supabase
      .from('orders')
      .select('id,status,payment_settled,order_items(unit_price,quantity)')
      .eq('seller_id', businessId)
      .gte('created_at', from.toISOString());

    const statusMap = new Map<string, number>();
    let sales = 0;
    for (const o of orders ?? []) {
      const row = o as {
        status: string;
        payment_settled: boolean | null;
        order_items: { unit_price: number; quantity: number }[];
      };
      statusMap.set(row.status, (statusMap.get(row.status) ?? 0) + 1);
      if (row.payment_settled === true && row.status !== 'cancelled') {
        for (const it of row.order_items ?? []) {
          sales += Number(it.unit_price) * Number(it.quantity);
        }
      }
    }
    setOnlineSales(sales);
    setByStatus([...statusMap.entries()].map(([status, count]) => ({ status, count })).sort((a, b) => b.count - a.count));

    const orderIds = (orders ?? []).map((o) => (o as { id: string }).id);
    if (orderIds.length === 0) {
      setTopProducts([]);
      setLoading(false);
      return;
    }

    const { data: items } = await supabase
      .from('order_items')
      .select('product_name,quantity,order_id')
      .in('order_id', orderIds.slice(0, 500));

    const prodMap = new Map<string, number>();
    for (const it of items ?? []) {
      const row = it as { product_name: string; quantity: number };
      prodMap.set(row.product_name, (prodMap.get(row.product_name) ?? 0) + Number(row.quantity));
    }
    setTopProducts(
      [...prodMap.entries()]
        .map(([name, units]) => ({ name, units }))
        .sort((a, b) => b.units - a.units)
        .slice(0, 8)
    );
    setLoading(false);
  }, [businessId, period]);

  useEffect(() => {
    void load();
  }, [load]);

  const maxStatus = useMemo(() => Math.max(1, ...byStatus.map((s) => s.count)), [byStatus]);
  const periodLabel = period === 'week' ? 'Last 7 days' : period === 'month' ? 'This month' : 'This year';

  return (
    <>
      <PageHeader title="Analytics" description="Graphs and trends — week, month, or year. Connected to seller and customer orders." />
      <div className="filter-tabs">
        {(['week', 'month', 'year'] as Period[]).map((p) => (
          <button
            key={p}
            type="button"
            className={period === p ? 'btn btn-primary btn-sm' : 'btn btn-ghost btn-sm'}
            onClick={() => setPeriod(p)}
          >
            {p === 'week' ? 'Week' : p === 'month' ? 'Month' : 'Year'}
          </button>
        ))}
      </div>

      <div className="grid-stats">
        <div className="stat-card">
          <div className="label">Online sales ({periodLabel})</div>
          <div className="value">{money(onlineSales)}</div>
        </div>
        <div className="stat-card">
          <div className="label">Orders ({periodLabel})</div>
          <div className="value">{byStatus.reduce((s, x) => s + x.count, 0)}</div>
        </div>
      </div>

      {loading ? <p className="muted-block">Loading…</p> : null}

      <div className="card card-accent" style={{ marginBottom: 16 }}>
        <h2 className="card-title">Orders by status — {periodLabel}</h2>
        {byStatus.length === 0 ? (
          <p className="muted-block">No orders in this period.</p>
        ) : (
          byStatus.map((s) => (
            <div key={s.status} style={{ marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: 14 }}>
                <span>{s.status}</span>
                <span>{s.count}</span>
              </div>
              <div style={{ height: 10, background: '#e8eef9', borderRadius: 999, marginTop: 4, overflow: 'hidden' }}>
                <div
                  style={{
                    width: `${(s.count / maxStatus) * 100}%`,
                    height: '100%',
                    background: 'linear-gradient(90deg, var(--wrs-cyan), var(--wrs-blue))',
                    borderRadius: 999,
                  }}
                />
              </div>
            </div>
          ))
        )}
      </div>

      <div className="card">
        <h2 className="card-title">Top products (units)</h2>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Product</th>
                <th>Units</th>
              </tr>
            </thead>
            <tbody>
              {topProducts.length === 0 ? (
                <tr>
                  <td colSpan={2} className="muted-block">
                    No line items yet.
                  </td>
                </tr>
              ) : (
                topProducts.map((p) => (
                  <tr key={p.name}>
                    <td>{p.name}</td>
                    <td>{p.units}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
