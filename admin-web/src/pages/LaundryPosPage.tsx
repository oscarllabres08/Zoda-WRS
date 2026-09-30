import { useCallback, useEffect, useMemo, useState } from 'react';

import { DigitalReceipt, printReceiptElement, type ReceiptLine } from '../components/DigitalReceipt';
import { saveElementAsPng } from '../lib/receiptImage';
import { ModulePageHeader } from '../components/ModulePageHeader';
import { useAuth } from '../auth/AuthProvider';
import { money } from '../lib/format';
import { supabase } from '../lib/supabase';

type ServiceRow = {
  id: string;
  name: string;
  description: string | null;
  price: number;
};

type CartLine = {
  serviceId: string;
  name: string;
  unitPrice: number;
  quantity: number;
  description?: string | null;
};

function makeReceiptNo(saleId: string) {
  const d = new Date();
  const tag = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  return `LND-${tag}-${saleId.replace(/-/g, '').slice(0, 6).toUpperCase()}`;
}

export function LaundryPosPage() {
  const { businessId, profile } = useAuth();
  const [services, setServices] = useState<ServiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [search, setSearch] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [cashReceived, setCashReceived] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [savingImage, setSavingImage] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<{
    customerName: string;
    receiptNo: string;
    soldAt: Date;
    lines: ReceiptLine[];
    total: number;
    cashReceived: number;
    changeDue: number;
  } | null>(null);

  const businessName = profile?.display_name?.trim() || 'Zoda Laundry';
  const branch = `${businessName} · Laundry POS`;

  const load = useCallback(async () => {
    if (!businessId) return;
    setLoading(true);
    const { data, error: err } = await supabase
      .from('laundry_services')
      .select('id,name,description,price')
      .eq('seller_id', businessId)
      .eq('is_available', true)
      .order('sort_order', { ascending: true });
    if (err) setError(err.message);
    setServices((data ?? []) as ServiceRow[]);
    setLoading(false);
  }, [businessId]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return services;
    return services.filter(
      (s) => s.name.toLowerCase().includes(q) || (s.description ?? '').toLowerCase().includes(q)
    );
  }, [services, search]);

  const cartTotal = useMemo(() => cart.reduce((s, l) => s + l.unitPrice * l.quantity, 0), [cart]);
  const cashNum = Number(cashReceived);
  const change = Number.isFinite(cashNum) && cashNum >= cartTotal ? cashNum - cartTotal : 0;

  function addService(s: ServiceRow) {
    setCart((prev) => {
      const idx = prev.findIndex((c) => c.serviceId === s.id);
      if (idx === -1) {
        return [
          ...prev,
          {
            serviceId: s.id,
            name: s.name,
            unitPrice: Number(s.price),
            quantity: 1,
            description: s.description,
          },
        ];
      }
      const next = [...prev];
      next[idx] = { ...next[idx]!, quantity: next[idx]!.quantity + 1 };
      return next;
    });
  }

  function setQty(serviceId: string, quantity: number) {
    if (quantity < 1) {
      setCart((prev) => prev.filter((l) => l.serviceId !== serviceId));
      return;
    }
    setCart((prev) => prev.map((l) => (l.serviceId === serviceId ? { ...l, quantity } : l)));
  }

  function clearCart() {
    setCart([]);
    setCashReceived('');
    setCustomerName('');
  }

  async function completeSale() {
    if (!businessId || cart.length === 0) return;
    const customer = customerName.trim();
    if (!customer) {
      setError('Enter the customer name before completing the sale.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const saleId = crypto.randomUUID();
      const receiptNo = makeReceiptNo(saleId);
      const cash = Number.isFinite(cashNum) ? cashNum : cartTotal;
      const changeDue = Math.max(0, cash - cartTotal);

      const { data: saleRow, error: saleErr } = await supabase
        .from('laundry_pos_sales')
        .insert({
          id: saleId,
          seller_id: businessId,
          receipt_no: receiptNo,
          customer_name: customer,
          cash_received: cash,
          change_due: changeDue,
        })
        .select('id,created_at,receipt_no')
        .single();
      if (saleErr) throw saleErr;

      const rows = cart.map((l) => ({
        laundry_pos_sale_id: saleRow.id as string,
        service_id: l.serviceId,
        service_name: l.name,
        unit_price: l.unitPrice,
        quantity: l.quantity,
      }));
      const { error: itemsErr } = await supabase.from('laundry_pos_sale_items').insert(rows);
      if (itemsErr) {
        await supabase.from('laundry_pos_sales').delete().eq('id', saleRow.id);
        throw itemsErr;
      }

      const lines: ReceiptLine[] = cart.map((l) => ({
        name: l.name,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
      }));

      setReceipt({
        customerName: customer,
        receiptNo: (saleRow.receipt_no as string) ?? receiptNo,
        soldAt: new Date(saleRow.created_at as string),
        lines,
        total: cartTotal,
        cashReceived: cash,
        changeDue,
      });
      clearCart();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to complete sale');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="pos-layout">
      <ModulePageHeader title="Laundry POS" subtitle="Select services · Cash payment · Digital receipt" branch={branch} />
      {error ? <p className="error-text module-alert">{error}</p> : null}

      <div className="pos-grid">
        <section className="pos-main card card-flat">
          <div className="pos-toolbar">
            <div className="pos-search">
              <input
                type="search"
                placeholder="Search services…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Search services"
              />
            </div>
          </div>
          {loading ? <p className="muted-block pos-loading">Loading services…</p> : null}
          {!loading && filtered.length === 0 ? (
            <p className="muted-block pos-loading">
              No services on POS. Add services under Laundry → Services.
            </p>
          ) : null}
          <div className="pos-product-grid">
            {filtered.map((s) => (
              <article key={s.id} className="pos-product-card laundry-service-card">
                <h3>{s.name}</h3>
                {s.description ? <p className="laundry-service-desc">{s.description}</p> : null}
                <p className="pos-product-price">{money(Number(s.price))}</p>
                <button type="button" className="pos-add-btn" aria-label={`Add ${s.name}`} onClick={() => addService(s)}>
                  +
                </button>
              </article>
            ))}
          </div>
        </section>

        <aside className="pos-cart card card-flat">
          <div className="pos-cart-head">
            <h2>Cart ({cart.reduce((n, l) => n + l.quantity, 0)} items)</h2>
            <button type="button" className="pos-link-danger" disabled={cart.length === 0} onClick={clearCart}>
              Clear
            </button>
          </div>
          <div className="pos-cart-lines">
            {cart.length === 0 ? (
              <p className="muted-block">Tap + on a service to add it.</p>
            ) : (
              cart.map((l) => (
                <div key={l.serviceId} className="pos-cart-line">
                  <div className="pos-cart-line-body">
                    <div className="pos-cart-line-title">{l.name}</div>
                    <div className="pos-cart-line-foot">
                      <div className="qty-stepper">
                        <button type="button" onClick={() => setQty(l.serviceId, l.quantity - 1)}>
                          −
                        </button>
                        <span>{l.quantity}</span>
                        <button type="button" onClick={() => setQty(l.serviceId, l.quantity + 1)}>
                          +
                        </button>
                      </div>
                      <span className="pos-cart-line-total">{money(l.unitPrice * l.quantity)}</span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
          <div className="pos-totals">
            <div className="pos-total-row pos-total-row--grand">
              <span>Total</span>
              <span>{money(cartTotal)}</span>
            </div>
          </div>
          <label className="field pos-cash-field">
            <span className="pos-cash-label">Customer name</span>
            <input
              type="text"
              placeholder="e.g. Juan Dela Cruz"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              autoComplete="name"
            />
          </label>
          <label className="field pos-cash-field">
            <span className="pos-cash-label">Cash received</span>
            <input
              type="number"
              min={0}
              step="0.01"
              value={cashReceived}
              onChange={(e) => setCashReceived(e.target.value)}
            />
          </label>
          <div className="pos-change-box">
            <span>Change</span>
            <strong>{money(change)}</strong>
          </div>
          <button
            type="button"
            className="btn btn-primary btn-block pos-complete-btn"
            disabled={cart.length === 0 || submitting || !customerName.trim()}
            onClick={() => void completeSale()}
          >
            {submitting ? 'Saving…' : 'Complete sale'}
          </button>
        </aside>
      </div>

      {receipt ? (
        <div className="modal-backdrop" role="presentation">
          <div className="modal-card laundry-receipt-modal" role="dialog">
            <h2 className="card-title">Digital receipt</h2>
            <div id="laundry-receipt-print" className="digital-receipt-capture">
              <DigitalReceipt
                businessName={businessName}
                customerName={receipt.customerName}
                receiptNo={receipt.receiptNo}
                soldAt={receipt.soldAt}
                lines={receipt.lines}
                total={receipt.total}
                cashReceived={receipt.cashReceived}
                changeDue={receipt.changeDue}
              />
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
              <button type="button" className="btn btn-primary btn-sm" onClick={() => printReceiptElement('laundry-receipt-print')}>
                Print receipt
              </button>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={savingImage}
                onClick={() => {
                  setSavingImage(true);
                  setError(null);
                  void saveElementAsPng(
                    'laundry-receipt-print',
                    `receipt-${receipt.receiptNo.replace(/[^\w-]+/g, '-')}`
                  )
                    .catch((e) => setError(e instanceof Error ? e.message : 'Could not save image'))
                    .finally(() => setSavingImage(false));
                }}
              >
                {savingImage ? 'Saving…' : 'Save as image'}
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setReceipt(null)}>
                Done
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
