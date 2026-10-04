import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { ModulePageHeader } from '../components/ModulePageHeader';
import { useAuth } from '../auth/AuthProvider';
import { todayDateInputValue } from '../lib/expenseTypes';
import { money } from '../lib/format';
import { supabase } from '../lib/supabase';

type LaundrySaleRow = {
  id: string;
  receipt_no: string;
  customer_name: string;
  created_at: string;
  laundry_pos_sale_items: { service_name: string; unit_price: number; quantity: number }[];
};

const RECENT_PAGE = 10;

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function saleTotal(items: { unit_price: number; quantity: number }[]) {
  return items.reduce((sum, it) => sum + Number(it.unit_price) * Number(it.quantity), 0);
}

function servicesLabel(items: { service_name: string; quantity: number }[]) {
  return items.map((i) => `${i.service_name} ×${i.quantity}`).join(', ') || '—';
}

export function LaundryDashboardPage() {
  const { businessId, profile } = useAuth();
  const [salesToday, setSalesToday] = useState(0);
  const [txnToday, setTxnToday] = useState(0);
  const [expensesToday, setExpensesToday] = useState(0);
  const [recent, setRecent] = useState<LaundrySaleRow[]>([]);
  const [recentHasMore, setRecentHasMore] = useState(false);
  const [recentLoadingMore, setRecentLoadingMore] = useState(false);
  const [loading, setLoading] = useState(true);

  const branch = profile?.display_name?.trim() ? `${profile.display_name.trim()} · Laundry` : 'Zoda Laundry';

  const fetchRecent = useCallback(
    async (offset: number) => {
      if (!businessId) return [] as LaundrySaleRow[];
      const { data, error } = await supabase
        .from('laundry_pos_sales')
        .select('id,receipt_no,customer_name,created_at,laundry_pos_sale_items(service_name,unit_price,quantity)')
        .eq('seller_id', businessId)
        .order('created_at', { ascending: false })
        .range(offset, offset + RECENT_PAGE - 1);
      if (error) throw error;
      return (data ?? []) as LaundrySaleRow[];
    },
    [businessId]
  );

  const load = useCallback(async () => {
    if (!businessId) return;
    setLoading(true);
    const from = startOfToday().toISOString();
    const today = todayDateInputValue();

    const [salesRes, expensesRes, recentRows] = await Promise.all([
      supabase
        .from('laundry_pos_sales')
        .select('id,laundry_pos_sale_items(unit_price,quantity)')
        .eq('seller_id', businessId)
        .gte('created_at', from),
      supabase
        .from('business_expenses')
        .select('amount')
        .eq('seller_id', businessId)
        .eq('business_unit', 'laundry')
        .eq('expense_date', today),
      fetchRecent(0),
    ]);

    let gross = 0;
    for (const row of salesRes.data ?? []) {
      gross += saleTotal((row as LaundrySaleRow).laundry_pos_sale_items ?? []);
    }

    let expenses = 0;
    if (!expensesRes.error) {
      for (const row of expensesRes.data ?? []) {
        expenses += Number((row as { amount: number }).amount);
      }
    }

    setSalesToday(gross);
    setTxnToday((salesRes.data ?? []).length);
    setExpensesToday(expenses);
    setRecent(recentRows);
    setRecentHasMore(recentRows.length === RECENT_PAGE);
    setLoading(false);
  }, [businessId, fetchRecent]);

  useEffect(() => {
    void load();
    if (!businessId) return;
    const ch = supabase
      .channel(`admin-laundry-dash-${businessId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'laundry_pos_sales', filter: `seller_id=eq.${businessId}` },
        () => void load()
      )
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

  async function showMoreRecent() {
    if (!businessId || recentLoadingMore || !recentHasMore) return;
    setRecentLoadingMore(true);
    try {
      const next = await fetchRecent(recent.length);
      setRecent((prev) => [...prev, ...next]);
      setRecentHasMore(next.length === RECENT_PAGE);
    } finally {
      setRecentLoadingMore(false);
    }
  }

  const netIncomeToday = salesToday - expensesToday;

  return (
    <div className="laundry-dashboard">
      <ModulePageHeader
        title="Laundry dashboard"
        subtitle="Today's net income and recent POS transactions at a glance."
        branch={branch}
      />

      <div className="card dashboard-profit-card laundry-dashboard-profit">
        <h2 className="dashboard-profit-title">Today&apos;s net income</h2>
        <div className="grid-stats dashboard-profit-grid laundry-dashboard-profit-grid">
          <div className="stat-card">
            <div className="label">POS sales today</div>
            <div className="value">{loading ? '…' : money(salesToday)}</div>
            <p className="stat-card-sub">{loading ? '…' : `${txnToday} transaction${txnToday === 1 ? '' : 's'}`}</p>
          </div>
          <div className="stat-card stat-card--expense">
            <div className="label">Expenses today</div>
            <div className="value">{loading ? '…' : money(expensesToday)}</div>
            <p className="stat-card-sub">
              <Link to="/laundry/expenses">Manage expenses →</Link>
            </p>
          </div>
          <div className={`stat-card stat-card--net${netIncomeToday < 0 ? ' negative' : ''}`}>
            <div className="label">Net income</div>
            <div className="value">{loading ? '…' : money(netIncomeToday)}</div>
            <p className="stat-card-sub">POS sales minus expenses (today)</p>
          </div>
        </div>
      </div>

      <div className="card laundry-dashboard-recent">
        <div className="laundry-dashboard-recent-head">
          <h2 className="card-title">Recent transactions</h2>
          <Link to="/laundry/pos" className="btn btn-ghost btn-sm">
            Open POS →
          </Link>
        </div>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Customer</th>
                <th>Receipt</th>
                <th>Services</th>
                <th>Amount</th>
                <th>When</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} style={{ color: 'var(--muted)' }}>
                    Loading…
                  </td>
                </tr>
              ) : recent.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ color: 'var(--muted)' }}>
                    No transactions yet. Complete a sale in POS to see it here.
                  </td>
                </tr>
              ) : (
                recent.map((row) => {
                  const items = row.laundry_pos_sale_items ?? [];
                  return (
                    <tr key={row.id}>
                      <td>{row.customer_name?.trim() || 'Walk-in customer'}</td>
                      <td>{row.receipt_no?.toUpperCase() ?? '—'}</td>
                      <td>{servicesLabel(items)}</td>
                      <td>{money(saleTotal(items))}</td>
                      <td>{new Date(row.created_at).toLocaleString()}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        {recentHasMore ? (
          <div className="laundry-dashboard-more">
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
      </div>
    </div>
  );
}
