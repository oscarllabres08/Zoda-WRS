import { useCallback, useEffect, useMemo, useState } from 'react';

import { ContainerReturnPanel } from '../components/ContainerReturnPanel';
import { PageHeader } from '../components/PageHeader';
import { useAuth } from '../auth/AuthProvider';
import { money, publicWrsAssetUrl } from '../lib/format';
import { orderGrandTotal } from '../lib/orderTotal';
import {
  formatPosPaymentMethod,
  normalizeCustomerName,
  posCustomerRowId,
  posNameFromRowId,
} from '../lib/posPayment';
import { supabase } from '../lib/supabase';

type CustomerRow = {
  id: string;
  name: string;
  avatarPath: string | null;
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
  isPosOnly: boolean;
  posNameKey: string | null;
};

type HistoryItem = {
  name: string;
  qty: number;
  unit_price: number;
};

type HistoryEntry = {
  id: string;
  source: 'order' | 'pos';
  created_at: string;
  status: string;
  payment_settled: boolean;
  payment_method: string | null;
  total: number;
  items: HistoryItem[];
  channelLabel: string;
};

type PayFilter = 'all' | 'paid' | 'unpaid';
type ContainerFilter = 'all' | 'borrowed';

const ORDER_HISTORY_PAGE = 10;

const ORDER_HISTORY_SELECT =
  'id,created_at,status,payment_settled,payment_method,delivery_fee,order_items(product_name,unit_price,quantity)';

const POS_HISTORY_SELECT =
  'id,created_at,payment_settled,payment_method,customer_name,pos_sale_items(product_name,unit_price,quantity)';

type OrderHistorySource = {
  id: string;
  created_at: string;
  status: string;
  payment_settled: boolean | null;
  payment_method: string | null;
  delivery_fee: number | null;
  order_items: { product_name?: string | null; unit_price: number; quantity: number }[];
};

type PosHistorySource = {
  id: string;
  created_at: string;
  payment_settled: boolean | null;
  payment_method: string | null;
  customer_name: string | null;
  pos_sale_items: { product_name?: string | null; unit_price: number; quantity: number }[];
};

function mapOrderHistoryRow(o: OrderHistorySource): HistoryEntry {
  const items = (o.order_items ?? []).map((it) => ({
    name: it.product_name?.trim() || 'Item',
    qty: it.quantity,
    unit_price: Number(it.unit_price),
  }));
  return {
    id: o.id,
    source: 'order',
    created_at: o.created_at,
    status: o.status,
    payment_settled: o.payment_settled === true,
    payment_method: o.payment_method,
    total: orderGrandTotal(o.order_items, o.delivery_fee),
    items,
    channelLabel: 'Online order',
  };
}

function mapPosHistoryRow(o: PosHistorySource): HistoryEntry {
  const items = (o.pos_sale_items ?? []).map((it) => ({
    name: it.product_name?.trim() || 'Item',
    qty: it.quantity,
    unit_price: Number(it.unit_price),
  }));
  const total = items.reduce((s, it) => s + it.unit_price * it.qty, 0);
  return {
    id: o.id,
    source: 'pos',
    created_at: o.created_at,
    status: 'walk-in',
    payment_settled: o.payment_settled === true,
    payment_method: o.payment_method,
    total,
    items,
    channelLabel: 'Walk-in POS',
  };
}

function posSaleTotal(
  items: { unit_price: number; quantity: number }[] | null | undefined
): number {
  return (items ?? []).reduce((s, it) => s + Number(it.unit_price) * Number(it.quantity), 0);
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
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyHasMore, setHistoryHasMore] = useState(false);
  const [historyLoadingMore, setHistoryLoadingMore] = useState(false);
  const [returnBusyId, setReturnBusyId] = useState<string | null>(null);
  const [selectedEntry, setSelectedEntry] = useState<HistoryEntry | null>(null);
  const [paymentBusy, setPaymentBusy] = useState(false);

  const load = useCallback(async () => {
    if (!businessId) return;
    setLoading(true);
    setError(null);

    const { data: customers, error: custErr } = await supabase
      .from('profiles')
      .select('user_id,display_name,phone,address,avatar_path')
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

    const { data: posSales } = await supabase
      .from('pos_sales')
      .select('id,customer_name,created_at,payment_settled,payment_method,pos_sale_items(unit_price,quantity)')
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
      const row = o as OrderHistorySource & { customer_id: string };
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
          last: cur.last > row.created_at ? cur.last : row.created_at,
          hasUnpaidUtang: cur.hasUnpaidUtang || utangUnpaid,
          unpaidDeliveredCount: cur.unpaidDeliveredCount + (deliveredUnpaid ? 1 : 0),
          unpaidDeliveredTotal: cur.unpaidDeliveredTotal + (deliveredUnpaid ? orderTotal : 0),
          totalSpent: cur.totalSpent + orderTotal,
        });
      }
    }

    const posAgg = new Map<
      string,
      {
        displayName: string;
        count: number;
        last: string;
        unpaidCount: number;
        unpaidTotal: number;
        totalSpent: number;
      }
    >();

    for (const s of posSales ?? []) {
      const row = s as {
        customer_name: string | null;
        created_at: string;
        payment_settled: boolean | null;
        pos_sale_items: { unit_price: number; quantity: number }[];
      };
      const rawName = row.customer_name?.trim();
      if (!rawName) continue;
      const key = normalizeCustomerName(rawName);
      const amt = posSaleTotal(row.pos_sale_items);
      const unpaid = row.payment_settled !== true;
      const cur = posAgg.get(key);
      if (!cur) {
        posAgg.set(key, {
          displayName: rawName,
          count: 1,
          last: row.created_at,
          unpaidCount: unpaid ? 1 : 0,
          unpaidTotal: unpaid ? amt : 0,
          totalSpent: amt,
        });
      } else {
        posAgg.set(key, {
          displayName: cur.displayName,
          count: cur.count + 1,
          last: cur.last > row.created_at ? cur.last : row.created_at,
          unpaidCount: cur.unpaidCount + (unpaid ? 1 : 0),
          unpaidTotal: cur.unpaidTotal + (unpaid ? amt : 0),
          totalSpent: cur.totalSpent + amt,
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

    const mergedPosKeys = new Set<string>();
    const list: CustomerRow[] = (customers ?? []).map((c) => {
      const p = c as {
        user_id: string;
        display_name: string | null;
        phone: string | null;
        address: string | null;
        avatar_path: string | null;
      };
      const a = agg.get(p.user_id);
      const displayName = p.display_name?.trim() || 'Customer';
      const nameKey = normalizeCustomerName(displayName);
      const pos = nameKey ? posAgg.get(nameKey) : undefined;
      if (pos && nameKey) mergedPosKeys.add(nameKey);

      const bal = balByCustomer.get(p.user_id);
      const outstanding = bal?.outstanding_count ?? 0;
      const unpaidPosCount = pos?.unpaidCount ?? 0;
      const unpaidPosTotal = pos?.unpaidTotal ?? 0;

      return {
        id: p.user_id,
        name: displayName,
        avatarPath: p.avatar_path ?? null,
        phone: p.phone?.trim() || '—',
        address: p.address?.trim() || '—',
        orderCount: (a?.count ?? 0) + (pos?.count ?? 0),
        lastOrder: [a?.last, pos?.last].filter(Boolean).sort().reverse()[0] ?? null,
        hasUnpaidUtang: a?.hasUnpaidUtang ?? false,
        unpaidDeliveredCount: (a?.unpaidDeliveredCount ?? 0) + unpaidPosCount,
        unpaidDeliveredTotal: (a?.unpaidDeliveredTotal ?? 0) + unpaidPosTotal,
        totalSpent: (a?.totalSpent ?? 0) + (pos?.totalSpent ?? 0),
        containersOutstanding: outstanding,
        containerIdentifierNotes: outstanding > 0 ? bal?.identifier_notes?.trim() || null : null,
        isPosOnly: false,
        posNameKey: nameKey || null,
      };
    });

    for (const [key, pos] of posAgg) {
      if (mergedPosKeys.has(key)) continue;
      list.push({
        id: posCustomerRowId(key),
        name: pos.displayName,
        avatarPath: null,
        phone: 'Walk-in POS',
        address: '—',
        orderCount: pos.count,
        lastOrder: pos.last,
        hasUnpaidUtang: false,
        unpaidDeliveredCount: pos.unpaidCount,
        unpaidDeliveredTotal: pos.unpaidTotal,
        totalSpent: pos.totalSpent,
        containersOutstanding: 0,
        containerIdentifierNotes: null,
        isPosOnly: true,
        posNameKey: key,
      });
    }

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
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pos_sales', filter: `seller_id=eq.${businessId}` }, () => void load())
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

  const [historyAll, setHistoryAll] = useState<HistoryEntry[]>([]);
  const [historyVisibleCount, setHistoryVisibleCount] = useState(ORDER_HISTORY_PAGE);

  const fetchAllHistory = useCallback(
    async (customer: CustomerRow): Promise<HistoryEntry[]> => {
      if (!businessId) return [];

      const entries: HistoryEntry[] = [];
      const nameKey = customer.posNameKey ?? posNameFromRowId(customer.id);

      if (!customer.isPosOnly) {
        const { data, error: err } = await supabase
          .from('orders')
          .select(ORDER_HISTORY_SELECT)
          .eq('seller_id', businessId)
          .eq('customer_id', customer.id)
          .order('created_at', { ascending: false })
          .limit(200);
        if (err) throw err;
        entries.push(...(data ?? []).map((o) => mapOrderHistoryRow(o as OrderHistorySource)));
      }

      if (nameKey) {
        const { data: posData, error: posErr } = await supabase
          .from('pos_sales')
          .select(POS_HISTORY_SELECT)
          .eq('seller_id', businessId)
          .not('customer_name', 'is', null)
          .order('created_at', { ascending: false })
          .limit(500);
        if (posErr) throw posErr;
        const filtered = (posData ?? []).filter((row) => {
          const name = (row as PosHistorySource).customer_name?.trim();
          return name ? normalizeCustomerName(name) === nameKey : false;
        });
        entries.push(...filtered.map((o) => mapPosHistoryRow(o as PosHistorySource)));
      }

      entries.sort((a, b) => b.created_at.localeCompare(a.created_at));
      return entries;
    },
    [businessId]
  );

  async function openHistory(c: CustomerRow) {
    if (!businessId) return;
    setHistoryFor(c);
    setHistory([]);
    setHistoryAll([]);
    setHistoryVisibleCount(ORDER_HISTORY_PAGE);
    setSelectedEntry(null);
    setHistoryHasMore(false);
    setHistoryLoading(true);
    try {
      const list = await fetchAllHistory(c);
      setHistoryAll(list);
      setHistory(list.slice(0, ORDER_HISTORY_PAGE));
      setHistoryHasMore(list.length > ORDER_HISTORY_PAGE);
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
      const nextCount = historyVisibleCount + ORDER_HISTORY_PAGE;
      setHistoryVisibleCount(nextCount);
      setHistory(historyAll.slice(0, nextCount));
      setHistoryHasMore(historyAll.length > nextCount);
    } finally {
      setHistoryLoadingMore(false);
    }
  }

  function closeHistory() {
    setHistoryFor(null);
    setHistory([]);
    setSelectedEntry(null);
    setHistoryHasMore(false);
  }

  async function setEntryPaymentSettled(entry: HistoryEntry, settled: boolean) {
    if (!businessId) return;
    setPaymentBusy(true);
    setError(null);
    try {
      if (entry.source === 'order') {
        const { error: upErr } = await supabase
          .from('orders')
          .update({ payment_settled: settled })
          .eq('id', entry.id)
          .eq('seller_id', businessId);
        if (upErr) throw upErr;
      } else {
        const { error: upErr } = await supabase
          .from('pos_sales')
          .update({ payment_settled: settled })
          .eq('id', entry.id)
          .eq('seller_id', businessId);
        if (upErr) throw upErr;
      }
      const nextEntry = { ...entry, payment_settled: settled };
      setSelectedEntry(nextEntry);
      setHistory((prev) => prev.map((h) => (h.id === entry.id && h.source === entry.source ? nextEntry : h)));
      setHistoryAll((prev) => prev.map((h) => (h.id === entry.id && h.source === entry.source ? nextEntry : h)));
      await load();
    } catch (ex) {
      setError(ex instanceof Error ? ex.message : 'Could not update payment status');
    } finally {
      setPaymentBusy(false);
    }
  }

  function paymentMethodLabel(entry: HistoryEntry): string {
    if (entry.source === 'pos') return formatPosPaymentMethod(entry.payment_method);
    const m = (entry.payment_method ?? '').toLowerCase();
    if (m === 'gcash') return 'GCash';
    if (m === 'cod') return 'Cash on delivery';
    if (m === 'maya') return 'Maya';
    if (m === 'utang') return 'Utang';
    return entry.payment_method ?? '—';
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
        description="Customer list, walk-in POS names, borrowed containers, and order history."
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
              {filtered.slice(0, 100).map((r) => {
                const avatarUrl = publicWrsAssetUrl(supabase, r.avatarPath);
                const initial = (r.name.trim()[0] ?? 'C').toUpperCase();
                return (
                <tr key={r.id}>
                  <td>
                    <div className="customer-list-name-cell">
                      <span className="customer-list-avatar" aria-hidden>
                        {avatarUrl ? (
                          <img src={avatarUrl} alt="" />
                        ) : (
                          <span className="customer-list-avatar-fallback">{initial}</span>
                        )}
                      </span>
                      <div className="customer-list-name-meta">
                        <strong>{r.name}</strong>
                        {r.isPosOnly ? (
                          <div className="customer-list-sub">Walk-in POS</div>
                        ) : (
                          <div className="customer-list-sub">{r.phone}</div>
                        )}
                      </div>
                    </div>
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
                    {!r.isPosOnly ? (
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
                    ) : (
                      '—'
                    )}
                  </td>
                  <td>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => void openHistory(r)}>
                      Order history
                    </button>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {historyFor ? (
        <div className="modal-backdrop" role="presentation" onClick={closeHistory}>
          <div className="modal-card customer-history-modal" role="dialog" onClick={(e) => e.stopPropagation()}>
            <h2 className="card-title">{historyFor.name} — order history</h2>
            {historyLoading ? <p className="muted-block">Loading…</p> : null}
            {!historyLoading && history.length === 0 ? <p className="muted-block">No orders yet.</p> : null}
            <ul className="history-list customer-history-list">
              {history.map((h) => (
                <li key={`${h.source}-${h.id}`}>
                  <button type="button" className="customer-history-item" onClick={() => setSelectedEntry(h)}>
                    <div className="customer-history-item-top">
                      <strong>{new Date(h.created_at).toLocaleString()}</strong>
                      <span className="chip">{h.channelLabel}</span>
                    </div>
                    <div className="customer-history-item-meta">
                      {money(h.total)} · {paymentMethodLabel(h)} ·{' '}
                      {h.payment_settled ? (
                        <span className="chip ok">Paid</span>
                      ) : (
                        <span className="chip pending">Unpaid</span>
                      )}
                    </div>
                  </button>
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

            {selectedEntry ? (
              <div className="customer-order-detail card card-flat">
                <h3 className="inventory-section-title">Order details</h3>
                <p className="muted-block">
                  {new Date(selectedEntry.created_at).toLocaleString()} · {selectedEntry.channelLabel}
                </p>
                <p>
                  <strong>Payment:</strong> {paymentMethodLabel(selectedEntry)} ·{' '}
                  {selectedEntry.payment_settled ? (
                    <span className="chip ok">Paid</span>
                  ) : (
                    <span className="chip pending">Unpaid</span>
                  )}
                </p>
                <ul className="customer-order-detail-items">
                  {selectedEntry.items.map((it, i) => (
                    <li key={`${it.name}-${i}`}>
                      {it.name} × {it.qty} — {money(it.unit_price * it.qty)}
                    </li>
                  ))}
                </ul>
                <p className="customer-order-detail-total">
                  <strong>Total: {money(selectedEntry.total)}</strong>
                </p>
                <div className="row-actions">
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    disabled={paymentBusy || selectedEntry.payment_settled}
                    onClick={() => void setEntryPaymentSettled(selectedEntry, true)}
                  >
                    Mark as paid
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    disabled={paymentBusy || !selectedEntry.payment_settled}
                    onClick={() => void setEntryPaymentSettled(selectedEntry, false)}
                  >
                    Mark as unpaid
                  </button>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSelectedEntry(null)}>
                    Close detail
                  </button>
                </div>
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
