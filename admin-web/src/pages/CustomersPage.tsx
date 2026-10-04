import { useCallback, useEffect, useMemo, useState } from 'react';

import { ContainerReturnPanel } from '../components/ContainerReturnPanel';
import { PageHeader } from '../components/PageHeader';
import { useAuth } from '../auth/AuthProvider';
import { money } from '../lib/format';
import { orderGrandTotal } from '../lib/orderTotal';
import { supabase } from '../lib/supabase';

type CustomerRow = {
  id: string;
  name: string;
  phone: string;
  address: string;
  orderCount: number;
  lastOrder: string | null;
  hasUnpaidUtang: boolean;
  unpaidDeliveredCount: number;
  unpaidDeliveredTotal: number;
  totalSpent: number;
  containersOutstanding: number;
  containerIdentifierNotes: string | null;
};

type OrderHistoryRow = {
  id: string;
  created_at: string;
  status: string;
  payment_settled: boolean | null;
  payment_method: string | null;
  total: number;
};

type PayFilter = 'all' | 'paid' | 'unpaid';
type ContainerFilter = 'all' | 'borrowed';

const ORDER_HISTORY_PAGE = 10;

const ORDER_HISTORY_SELECT =
  'id,created_at,status,payment_settled,payment_method,delivery_fee,order_items(product_name,unit_price,quantity)';

type OrderHistorySource = {
  id: string;
  created_at: string;
  status: string;
  payment_settled: boolean | null;
  payment_method: string | null;
  delivery_fee: number | null;
  order_items: { product_name?: string | null; unit_price: number; quantity: number }[];
};

function mapOrderHistoryRow(o: OrderHistorySource): OrderHistoryRow {
  return {
    id: o.id,
    created_at: o.created_at,
    status: o.status,
    payment_settled: o.payment_settled,
    payment_method: o.payment_method,
    total: orderGrandTotal(o.order_items, o.delivery_fee),
  };
}

export function CustomersPage() {
  const { businessId } = useAuth();
  const [rows, setRows] = useState<CustomerRow[]>([]);
  const [query, setQuery] = useState('');
  const [payFilter, setPayFilter] = useState<PayFilter>('all');
  const [containerFilter, setContainerFilter] = useState<ContainerFilter>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [historyFor, setHistoryFor] = useState<CustomerRow | null>(null);
  const [history, setHistory] = useState<OrderHistoryRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyHasMore, setHistoryHasMore] = useState(false);
  const [historyLoadingMore, setHistoryLoadingMore] = useState(false);
  const [returnBusyId, setReturnBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!businessId) return;
    setLoading(true);
    setError(null);

    const { data: customers, error: custErr } = await supabase
      .from('profiles')
      .select('user_id,display_name,phone,address')
      .eq('role', 'customer')
      .order('created_at', { ascending: false })
      .limit(400);

    if (custErr) {
      setError(custErr.message);
      setRows([]);
      setLoading(false);
      return;
    }

    const { data: orders } = await supabase
      .from('orders')
      .select(
        'id,customer_id,created_at,status,payment_settled,payment_method,delivery_fee,order_items(product_name,unit_price,quantity)'
      )
      .eq('seller_id', businessId)
      .order('created_at', { ascending: false })
      .limit(2000);

    const agg = new Map<
      string,
      {
        count: number;
        last: string;
        hasUnpaidUtang: boolean;
        unpaidDeliveredCount: number;
        unpaidDeliveredTotal: number;
        totalSpent: number;
      }
    >();

    for (const o of orders ?? []) {
      const row = o as {
        customer_id: string;
        created_at: string;
        status: string;
        payment_settled: boolean | null;
        payment_method: string | null;
        delivery_fee: number | null;
        order_items: { product_name?: string | null; unit_price: number; quantity: number }[];
      };
      const orderTotal = orderGrandTotal(row.order_items, row.delivery_fee);
      const utangUnpaid =
        (row.payment_method ?? '').toLowerCase() === 'utang' && row.payment_settled !== true;
      const deliveredUnpaid = row.status === 'delivered' && row.payment_settled !== true;
      const cur = agg.get(row.customer_id);
      if (!cur) {
        agg.set(row.customer_id, {
          count: 1,
          last: row.created_at,
          hasUnpaidUtang: utangUnpaid,
          unpaidDeliveredCount: deliveredUnpaid ? 1 : 0,
          unpaidDeliveredTotal: deliveredUnpaid ? orderTotal : 0,
          totalSpent: orderTotal,
        });
      } else {
        agg.set(row.customer_id, {
          count: cur.count + 1,
          last: cur.last,
          hasUnpaidUtang: cur.hasUnpaidUtang || utangUnpaid,
          unpaidDeliveredCount: cur.unpaidDeliveredCount + (deliveredUnpaid ? 1 : 0),
          unpaidDeliveredTotal: cur.unpaidDeliveredTotal + (deliveredUnpaid ? orderTotal : 0),
          totalSpent: cur.totalSpent + orderTotal,
        });
      }
    }

    const { data: balances } = await supabase
      .from('seller_customer_container_balance')
      .select('customer_id,outstanding_count,identifier_notes')
      .eq('seller_id', businessId);

    const balByCustomer = new Map<
      string,
      { outstanding_count: number; identifier_notes: string | null }
    >();
    for (const b of balances ?? []) {
      const row = b as {
        customer_id: string;
        outstanding_count: number;
        identifier_notes: string | null;
      };
      balByCustomer.set(row.customer_id, {
        outstanding_count: Math.max(0, row.outstanding_count ?? 0),
        identifier_notes: row.identifier_notes,
      });
    }

    const list: CustomerRow[] = (customers ?? []).map((c) => {
      const p = c as { user_id: string; display_name: string | null; phone: string | null; address: string | null };
      const a = agg.get(p.user_id);
      const bal = balByCustomer.get(p.user_id);
      const outstanding = bal?.outstanding_count ?? 0;
      return {
        id: p.user_id,
        name: p.display_name?.trim() || 'Customer',
        phone: p.phone?.trim() || '—',
        address: p.address?.trim() || '—',
        orderCount: a?.count ?? 0,
        lastOrder: a?.last ?? null,
        hasUnpaidUtang: a?.hasUnpaidUtang ?? false,
        unpaidDeliveredCount: a?.unpaidDeliveredCount ?? 0,
        unpaidDeliveredTotal: a?.unpaidDeliveredTotal ?? 0,
        totalSpent: a?.totalSpent ?? 0,
        containersOutstanding: outstanding,
        containerIdentifierNotes:
          outstanding > 0 ? (bal?.identifier_notes?.trim() || null) : null,
      };
    });

    list.sort((a, b) => b.orderCount - a.orderCount);
    setRows(list);
    setLoading(false);
  }, [businessId]);

  useEffect(() => {
    void load();
    if (!businessId) return;
    const ch = supabase
      .channel(`admin-customers-${businessId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `seller_id=eq.${businessId}` }, () => void load())
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'seller_customer_container_balance', filter: `seller_id=eq.${businessId}` },
        () => void load()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [businessId, load]);

  const fetchCustomerOrders = useCallback(
    async (customerId: string, offset: number) => {
      if (!businessId) return [] as OrderHistoryRow[];
      const { data, error: err } = await supabase
        .from('orders')
        .select(ORDER_HISTORY_SELECT)
        .eq('seller_id', businessId)
        .eq('customer_id', customerId)
        .order('created_at', { ascending: false })
        .range(offset, offset + ORDER_HISTORY_PAGE - 1);
      if (err) throw err;
      return (data ?? []).map((o) => mapOrderHistoryRow(o as OrderHistorySource));
    },
    [businessId]
  );

  async function openHistory(c: CustomerRow) {
    if (!businessId) return;
    setHistoryFor(c);
    setHistory([]);
    setHistoryHasMore(false);
    setHistoryLoading(true);
    try {
      const list = await fetchCustomerOrders(c.id, 0);
      setHistory(list);
      setHistoryHasMore(list.length === ORDER_HISTORY_PAGE);
    } catch (ex) {
      setError(ex instanceof Error ? ex.message : 'Could not load order history');
      setHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  }

  async function showMoreHistory() {
    if (!historyFor || historyLoadingMore || !historyHasMore) return;
    setHistoryLoadingMore(true);
    try {
      const next = await fetchCustomerOrders(historyFor.id, history.length);
      setHistory((prev) => [...prev, ...next]);
      setHistoryHasMore(next.length === ORDER_HISTORY_PAGE);
    } catch (ex) {
      setError(ex instanceof Error ? ex.message : 'Could not load more orders');
    } finally {
      setHistoryLoadingMore(false);
    }
  }

  function closeHistory() {
    setHistoryFor(null);
    setHistory([]);
    setHistoryHasMore(false);
  }

  const filtered = useMemo(() => {
    let list = rows.filter((r) => r.orderCount > 0 || payFilter === 'all' || containerFilter === 'borrowed');
    if (payFilter === 'paid')
      list = list.filter((r) => r.orderCount > 0 && r.unpaidDeliveredCount === 0 && !r.hasUnpaidUtang);
    if (payFilter === 'unpaid') list = list.filter((r) => r.unpaidDeliveredCount > 0 || r.hasUnpaidUtang);
    if (containerFilter === 'borrowed') list = list.filter((r) => r.containersOutstanding > 0);
    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (r) =>
          r.name.toLowerCase().includes(q) ||
          r.phone.toLowerCase().includes(q) ||
          (r.containerIdentifierNotes ?? '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [rows, query, payFilter, containerFilter]);

  return (
    <>
      <PageHeader
        title="Customers"
        description="Customer list, borrowed containers, and order history — filter by payment or containers."
      />
      {error ? <p className="error-text">{error}</p> : null}

      <div className="filter-tabs">
        {(['all', 'paid', 'unpaid'] as PayFilter[]).map((f) => (
          <button
            key={f}
            type="button"
            className={payFilter === f ? 'btn btn-primary btn-sm' : 'btn btn-ghost btn-sm'}
            onClick={() => setPayFilter(f)}
          >
            {f === 'all' ? 'All' : f === 'paid' ? 'Paid' : 'Unpaid / Utang'}
          </button>
        ))}
      </div>

      <div className="filter-tabs" style={{ marginTop: 8 }}>
        {(['all', 'borrowed'] as ContainerFilter[]).map((f) => (
          <button
            key={f}
            type="button"
            className={containerFilter === f ? 'btn btn-primary btn-sm' : 'btn btn-ghost btn-sm'}
            onClick={() => setContainerFilter(f)}
          >
            {f === 'all' ? 'All customers' : 'Borrowed containers'}
          </button>
        ))}
      </div>

      <div className="field" style={{ maxWidth: 360 }}>
        <label htmlFor="q">Search</label>
        <input id="q" placeholder="Name or phone" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>

      <div className="card">
        {loading ? <p className="muted-block">Loading…</p> : null}
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Customer</th>
                <th>Orders</th>
                <th>Spent</th>
                <th>Payment</th>
                <th>Containers</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, 100).map((r) => (
                <tr key={r.id}>
                  <td>
                    <strong>{r.name}</strong>
                    <div style={{ fontSize: 12, color: 'var(--muted)', maxWidth: 220 }}>{r.phone}</div>
                  </td>
                  <td>{r.orderCount}</td>
                  <td>{money(r.totalSpent)}</td>
                  <td>
                    {r.unpaidDeliveredCount > 0 ? (
                      <span className="chip pending">
                        {r.unpaidDeliveredCount} unpaid · {money(r.unpaidDeliveredTotal)}
                      </span>
                    ) : r.hasUnpaidUtang ? (
                      <span className="chip pending">Unpaid utang</span>
                    ) : r.orderCount > 0 ? (
                      <span className="chip ok">Paid</span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td>
                    <ContainerReturnPanel
                      customerId={r.id}
                      customerName={r.name}
                      outstanding={r.containersOutstanding}
                      identifierNotes={r.containerIdentifierNotes}
                      busy={returnBusyId === r.id}
                      onBusyChange={(b) => setReturnBusyId(b ? r.id : null)}
                      onSuccess={() => void load()}
                      onError={(msg) => setError(msg || null)}
                    />
                  </td>
                  <td>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => void openHistory(r)}>
                      Order history
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {historyFor ? (
        <div className="modal-backdrop" role="presentation" onClick={closeHistory}>
          <div className="modal-card" role="dialog" onClick={(e) => e.stopPropagation()}>
            <h2 className="card-title">{historyFor.name} — order history</h2>
            {historyLoading ? <p className="muted-block">Loading…</p> : null}
            {!historyLoading && history.length === 0 ? <p className="muted-block">No orders yet.</p> : null}
            <ul className="history-list">
              {history.map((h) => (
                <li key={h.id}>
                  <div>
                    <strong>{new Date(h.created_at).toLocaleString()}</strong>
                    <span className="chip" style={{ marginLeft: 8 }}>
                      {h.status}
                    </span>
                  </div>
                  <div style={{ marginTop: 4 }}>
                    {money(h.total)} ·{' '}
                    {h.payment_settled ? (
                      <span className="chip ok">Paid</span>
                    ) : (
                      <span className="chip pending">{h.payment_method ?? 'Unpaid'}</span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
            {historyHasMore ? (
              <div style={{ marginBottom: 12, textAlign: 'center' }}>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  disabled={historyLoadingMore}
                  onClick={() => void showMoreHistory()}
                >
                  {historyLoadingMore ? 'Loading…' : 'Show more'}
                </button>
              </div>
            ) : null}
            <button type="button" className="btn btn-ghost btn-sm" onClick={closeHistory}>
              Close
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
