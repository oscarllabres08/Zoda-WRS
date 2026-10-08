import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { PageHeader } from '../components/PageHeader';
import { useAuth } from '../auth/AuthProvider';
import { todayDateInputValue } from '../lib/expenseTypes';
import { money } from '../lib/format';
import { orderCountsTowardOnlineSales, posCountsTowardWalkInSales, saleRecordedAt } from '../lib/orderSalesEligible';
import { LOW_STOCK_THRESHOLD } from '../lib/inventoryStock';
import { supabase } from '../lib/supabase';

type RecentOrderRow = {
  id: string;
  source: 'online' | 'walk-in';
  status: string;
  customer_name: string;
  created_at: string;
  payment_settled: boolean;
};

const RECENT_ORDERS_PAGE = 10;

function mapOnlineRecent(o: {
  id: string;
  status: string;
  customer_name: string;
  created_at: string;
  payment_settled: boolean | null;
}): RecentOrderRow {
  return {
    id: o.id,
    source: 'online',
    status: o.status,
    customer_name: o.customer_name?.trim() || 'Customer',
    created_at: o.created_at,
    payment_settled: o.payment_settled === true,
  };
}

function mapWalkInRecent(s: {
  id: string;
  customer_name: string | null;
  created_at: string;
  payment_settled: boolean | null;
}): RecentOrderRow {
  return {
    id: s.id,
    source: 'walk-in',
    status: 'completed',
    customer_name: s.customer_name?.trim() || 'Walk-in customer',
    created_at: s.created_at,
    payment_settled: s.payment_settled === true,
  };
}

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export function DashboardPage() {
  const { businessId, profile } = useAuth();
  const [onlineToday, setOnlineToday] = useState(0);
  const [walkInToday, setWalkInToday] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);
  const [recent, setRecent] = useState<RecentOrderRow[]>([]);
  const [recentHasMore, setRecentHasMore] = useState(false);
  const [recentLoadingMore, setRecentLoadingMore] = useState(false);
  const [staffPending, setStaffPending] = useState(0);
  const [productCount, setProductCount] = useState(0);
  const [lowStockCount, setLowStockCount] = useState(0);
  const [expensesToday, setExpensesToday] = useState(0);

  const fetchRecentOrders = useCallback(
    async (offset: number) => {
      if (!businessId) return { rows: [] as RecentOrderRow[], hasMore: false };
      const fetchLimit = offset + RECENT_ORDERS_PAGE + 1;
      const [ordersRes, posRes] = await Promise.all([
        supabase
          .from('orders')
          .select('id,status,customer_name,created_at,payment_settled')
          .eq('seller_id', businessId)
          .order('created_at', { ascending: false })
          .limit(fetchLimit),
        supabase
          .from('pos_sales')
          .select('id,customer_name,created_at,payment_settled')
          .eq('seller_id', businessId)
          .order('created_at', { ascending: false })
          .limit(fetchLimit),
      ]);
      if (ordersRes.error) throw ordersRes.error;
      if (posRes.error) throw posRes.error;

      const merged = [
        ...(ordersRes.data ?? []).map((o) => mapOnlineRecent(o as Parameters<typeof mapOnlineRecent>[0])),
        ...(posRes.data ?? []).map((s) => mapWalkInRecent(s as Parameters<typeof mapWalkInRecent>[0])),
      ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      const rows = merged.slice(offset, offset + RECENT_ORDERS_PAGE);
      const hasMore = merged.length > offset + RECENT_ORDERS_PAGE;
      return { rows, hasMore };
    },
    [businessId]
  );

  const load = useCallback(async () => {
    if (!businessId) return;
    const from = startOfToday().toISOString();

    const today = todayDateInputValue();

    const [ordersRes, posRes, pendingRes, recentResult, staffRes, prodRes, lowStockRes, expensesRes] = await Promise.all([
      supabase
        .from('orders')
        .select('id,status,created_at,payment_settled,payment_settled_at,payment_method,order_items(unit_price,quantity)')
        .eq('seller_id', businessId)
        .or(`and(payment_settled.eq.true,payment_settled_at.gte.${from}),and(created_at.gte.${from})`),
      supabase
        .from('pos_sales')
        .select('id,created_at,payment_settled,payment_settled_at,pos_sale_items(unit_price,quantity)')
        .eq('seller_id', businessId)
        .or(`and(payment_settled.eq.true,payment_settled_at.gte.${from}),and(created_at.gte.${from})`),
      supabase.from('orders').select('id', { count: 'exact', head: true }).eq('seller_id', businessId).eq('status', 'pending'),
      fetchRecentOrders(0),
      supabase
        .from('profiles')
        .select('user_id', { count: 'exact', head: true })
        .eq('seller_workspace_owner_id', businessId)
        .eq('seller_team_role', 'staff')
        .eq('seller_join_status', 'pending'),
      supabase.from('products').select('id', { count: 'exact', head: true }).eq('seller_id', businessId),
      supabase
        .from('products')
        .select('id', { count: 'exact', head: true })
        .eq('seller_id', businessId)
        .eq('category', 'other')
        .not('stock_quantity', 'is', null)
        .lte('stock_quantity', LOW_STOCK_THRESHOLD),
      supabase
        .from('business_expenses')
        .select('amount')
        .eq('seller_id', businessId)
        .eq('business_unit', 'wrs')
        .eq('expense_date', today),
    ]);

    let online = 0;
    const todayStart = startOfToday();
    for (const o of ordersRes.data ?? []) {
      const row = o as {
        status: string;
        created_at: string;
        payment_settled: boolean | null;
        payment_settled_at: string | null;
        payment_method: string | null;
        order_items: { unit_price: number; quantity: number }[];
      };
      if (!orderCountsTowardOnlineSales(row)) continue;
      const recordedAt = saleRecordedAt(row);
      if (!recordedAt || recordedAt < todayStart) continue;
      for (const it of row.order_items ?? []) {
        online += Number(it.unit_price) * Number(it.quantity);
      }
    }

    let walk = 0;
    for (const s of posRes.data ?? []) {
      const sale = s as {
        payment_settled: boolean | null;
        payment_settled_at: string | null;
        created_at: string;
        pos_sale_items: { unit_price: number; quantity: number }[];
      };
      if (!posCountsTowardWalkInSales(sale)) continue;
      const recordedAt = saleRecordedAt(sale);
      if (!recordedAt || recordedAt < todayStart) continue;
      for (const it of sale.pos_sale_items ?? []) {
        walk += Number(it.unit_price) * Number(it.quantity);
      }
    }

    let expenses = 0;
    if (!expensesRes.error) {
      for (const row of expensesRes.data ?? []) {
        expenses += Number((row as { amount: number }).amount);
      }
    }

    setOnlineToday(online);
    setWalkInToday(walk);
    setExpensesToday(expenses);
    setPendingCount(pendingRes.count ?? 0);
    setRecent(recentResult.rows);
    setRecentHasMore(recentResult.hasMore);
    setStaffPending(staffRes.count ?? 0);
    setProductCount(prodRes.count ?? 0);
    setLowStockCount(lowStockRes.count ?? 0);
  }, [businessId, fetchRecentOrders]);

  async function showMoreRecent() {
    if (!businessId || recentLoadingMore || !recentHasMore) return;
    setRecentLoadingMore(true);
    try {
      const next = await fetchRecentOrders(recent.length);
      setRecent((prev) => [...prev, ...next.rows]);
      setRecentHasMore(next.hasMore);
    } finally {
      setRecentLoadingMore(false);
    }
  }

  useEffect(() => {
    void load();
    if (!businessId) return;
    const ch = supabase
      .channel(`admin-dash-${businessId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `seller_id=eq.${businessId}` }, () => void load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pos_sales', filter: `seller_id=eq.${businessId}` }, () => void load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products', filter: `seller_id=eq.${businessId}` }, () => void load())
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'business_expenses', filter: `seller_id=eq.${businessId}` },
        () => void load()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [businessId, load]);

  const storeLabel = profile?.display_name?.trim() || 'Your store';
  const grossToday = onlineToday + walkInToday;
  const netIncomeToday = grossToday - expensesToday;

  return (
    <>
      <PageHeader
        title="Dashboard"
        description={`${storeLabel} — connected to Seller & Customer apps (POS, inventory, orders, staff).`}
      />

      <div className="grid-stats">
        <div className="stat-card">
          <div className="label">Online sales today</div>
          <div className="value">{money(onlineToday)}</div>
        </div>
        <div className="stat-card">
          <div className="label">Walk-in (POS) today</div>
          <div className="value">{money(walkInToday)}</div>
        </div>
        <div className="stat-card">
          <div className="label">Pending orders</div>
          <div className="value">{pendingCount}</div>
        </div>
        <div className="stat-card">
          <div className="label">Products in inventory</div>
          <div className="value">{productCount}</div>
        </div>
      </div>

      <div className="card dashboard-profit-card">
        <h2 className="dashboard-profit-title">Today&apos;s net income</h2>
        <div className="grid-stats dashboard-profit-grid">
          <div className="stat-card">
            <div className="label">Gross sales</div>
            <div className="value">{money(grossToday)}</div>
            <p className="stat-card-sub">Online {money(onlineToday)} · POS {money(walkInToday)}</p>
          </div>
          <div className="stat-card stat-card--expense">
            <div className="label">Expenses today</div>
            <div className="value">{money(expensesToday)}</div>
            <p className="stat-card-sub">
              <Link to="/expenses">Manage expenses →</Link>
            </p>
          </div>
          <div className={`stat-card stat-card--net${netIncomeToday < 0 ? ' negative' : ''}`}>
            <div className="label">Net income</div>
            <div className="value">{money(netIncomeToday)}</div>
            <p className="stat-card-sub">Gross sales minus expenses (today)</p>
          </div>
        </div>
      </div>

      {staffPending > 0 ? (
        <div className="card" style={{ marginBottom: 14, borderColor: 'rgba(255,193,7,0.5)' }}>
          <strong>{staffPending}</strong> staff registration{staffPending === 1 ? '' : 's'} waiting for approval.{' '}
          <Link to="/staff">Review in Staff Management →</Link>
        </div>
      ) : null}

      {lowStockCount > 0 ? (
        <div className="inventory-low-stock-alert card" style={{ marginBottom: 14 }}>
          <strong>Low stock alert</strong>
          <p className="muted-block" style={{ margin: '6px 0 0' }}>
            {lowStockCount} Others item{lowStockCount === 1 ? '' : 's'} at {LOW_STOCK_THRESHOLD} pcs or below.{' '}
            <Link to="/inventory">Review inventory →</Link>
          </p>
        </div>
      ) : null}

      <div className="card">
        <h2 style={{ margin: '0 0 12px', fontSize: 18 }}>Recent orders</h2>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Customer</th>
                <th>Type</th>
                <th>Status</th>
                <th>Payment</th>
                <th>When</th>
              </tr>
            </thead>
            <tbody>
              {recent.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ color: 'var(--muted)' }}>
                    No orders yet.
                  </td>
                </tr>
              ) : (
                recent.map((o) => (
                  <tr key={`${o.source}-${o.id}`}>
                    <td>{o.customer_name}</td>
                    <td>
                      <span className={`sales-pill ${o.source === 'online' ? 'online' : 'walk'}`}>
                        {o.source === 'online' ? 'Online' : 'Walk-in'}
                      </span>
                    </td>
                    <td>
                      <span className={`chip ${o.status === 'pending' ? 'pending' : 'ok'}`}>{o.status}</span>
                    </td>
                    <td>
                      <span className={`sales-pill ${o.payment_settled ? 'paid' : 'unpaid'}`}>
                        {o.payment_settled ? 'Paid' : 'Unpaid'}
                      </span>
                    </td>
                    <td>{new Date(o.created_at).toLocaleString()}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {recentHasMore ? (
          <div style={{ marginTop: 12, textAlign: 'center' }}>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={recentLoadingMore}
              onClick={() => void showMoreRecent()}
            >
              {recentLoadingMore ? 'Loading…' : 'Show more'}
            </button>
          </div>
        ) : null}
        <p style={{ margin: '12px 0 0', color: 'var(--muted)', fontSize: 13, fontWeight: 600 }}>
          Online orders come from the <strong>Customer app</strong>; walk-in sales are recorded in{' '}
          <Link to="/pos">POS</Link>.
        </p>
      </div>
    </>
  );
}
