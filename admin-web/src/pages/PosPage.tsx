import { useCallback, useEffect, useMemo, useState } from 'react';

import { useAuth } from '../auth/AuthProvider';
import { ModulePageHeader } from '../components/ModulePageHeader';
import { money, publicWrsAssetUrl } from '../lib/format';
import { isLowStock, stockLabel, tracksStock } from '../lib/inventoryStock';
import { supabase } from '../lib/supabase';

type ProductRow = {
  id: string;
  name: string;
  price: number;
  is_available: boolean;
  category: 'water' | 'other';
  stock_quantity: number | null;
  image_url?: string | null;
};

type CartLine = {
  productId: string;
  name: string;
  unitPrice: number;
  quantity: number;
  image_url?: string | null;
};

type PosCategory = 'all' | 'water' | 'others';

function productMatchesCategory(p: ProductRow, cat: PosCategory): boolean {
  if (cat === 'all') return true;
  return cat === 'water' ? p.category === 'water' : p.category === 'other';
}

const POS_CATEGORIES: { id: PosCategory; label: string; icon?: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'water', label: 'Water', icon: '💧' },
  { id: 'others', label: 'Others', icon: '📦' },
];

export function PosPage() {
  const { businessId, profile } = useAuth();
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<PosCategory>('all');
  const [cashReceived, setCashReceived] = useState('');

  const branch =
    profile?.display_name?.trim() ? `${profile.display_name.trim()} · Zoda WRS` : 'Zoda WRS Main Branch';

  const loadProducts = useCallback(async () => {
    if (!businessId) return;
    setLoading(true);
    const { data, error: err } = await supabase
      .from('products')
      .select('id,name,price,is_available,category,stock_quantity,image_url')
      .eq('seller_id', businessId)
      .eq('is_available', true)
      .order('sort_order', { ascending: true });
    if (err) setError(err.message);
    setProducts((data ?? []) as ProductRow[]);
    setLoading(false);
  }, [businessId]);

  useEffect(() => {
    void loadProducts();
    if (!businessId) return;
    const ch = supabase
      .channel(`admin-pos-products-${businessId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'products', filter: `seller_id=eq.${businessId}` },
        () => void loadProducts()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [businessId, loadProducts]);

  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter((p) => {
      if (tracksStock(p.category) && p.stock_quantity != null && p.stock_quantity <= 0) return false;
      if (!productMatchesCategory(p, category)) return false;
      if (!q) return true;
      return p.name.toLowerCase().includes(q);
    });
  }, [products, search, category]);

  function remainingStock(productId: string): number | null {
    const p = products.find((x) => x.id === productId);
    if (!p || !tracksStock(p.category) || p.stock_quantity == null) return null;
    const inCart = cart.find((c) => c.productId === productId)?.quantity ?? 0;
    return p.stock_quantity - inCart;
  }

  const cartCount = useMemo(() => cart.reduce((s, l) => s + l.quantity, 0), [cart]);
  const cartTotal = useMemo(() => cart.reduce((s, l) => s + l.unitPrice * l.quantity, 0), [cart]);
  const cashNum = Number(cashReceived);
  const change = Number.isFinite(cashNum) && cashNum >= cartTotal ? cashNum - cartTotal : 0;

  function addProduct(p: ProductRow) {
    const left = remainingStock(p.id);
    if (left != null && left < 1) {
      setError(`Not enough stock for ${p.name}.`);
      return;
    }
    setError(null);
    setCart((prev) => {
      const idx = prev.findIndex((c) => c.productId === p.id);
      if (idx === -1) {
        return [
          ...prev,
          {
            productId: p.id,
            name: p.name,
            unitPrice: Number(p.price),
            quantity: 1,
            image_url: p.image_url,
          },
        ];
      }
      const next = [...prev];
      next[idx] = { ...next[idx]!, quantity: next[idx]!.quantity + 1 };
      return next;
    });
    setSuccess(null);
  }

  function setLineQty(productId: string, quantity: number) {
    if (quantity < 1) {
      setCart((prev) => prev.filter((l) => l.productId !== productId));
      return;
    }
    const p = products.find((x) => x.id === productId);
    if (p && tracksStock(p.category) && p.stock_quantity != null && quantity > p.stock_quantity) {
      setError(`Only ${p.stock_quantity} in stock for ${p.name}.`);
      quantity = p.stock_quantity;
    } else {
      setError(null);
    }
    setCart((prev) => prev.map((l) => (l.productId === productId ? { ...l, quantity } : l)));
  }

  function removeLine(productId: string) {
    setCart((prev) => prev.filter((l) => l.productId !== productId));
  }

  function clearCart() {
    setCart([]);
    setCashReceived('');
    setSuccess(null);
  }

  async function submitSale() {
    if (!businessId || cart.length === 0) return;
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      const { data: saleRow, error: saleErr } = await supabase.from('pos_sales').insert({ seller_id: businessId }).select('id').single();
      if (saleErr) throw saleErr;
      const saleId = saleRow.id as string;
      const rows = cart.map((l) => ({
        pos_sale_id: saleId,
        product_id: l.productId,
        product_name: l.name,
        unit_price: l.unitPrice,
        quantity: l.quantity,
      }));
      const { error: itemsErr } = await supabase.from('pos_sale_items').insert(rows);
      if (itemsErr) {
        await supabase.from('pos_sales').delete().eq('id', saleId);
        throw itemsErr;
      }
      for (const line of cart) {
        const p = products.find((x) => x.id === line.productId);
        if (p && tracksStock(p.category) && p.stock_quantity != null) {
          const { error: stockErr } = await supabase.rpc('decrement_product_stock', {
            p_product_id: line.productId,
            p_quantity: line.quantity,
          });
          if (stockErr) throw stockErr;
        }
      }
      await loadProducts();
      clearCart();
      setSuccess('Order completed. Sale recorded for reports.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save sale');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="pos-layout">
      <ModulePageHeader
        title="POS"
        subtitle="Walk-in Sales • Fast • Easy • Reliable"
        branch={branch}
      />
      {error ? <p className="error-text module-alert">{error}</p> : null}
      {success ? <p className="success-text module-alert">{success}</p> : null}

      <div className="pos-grid">
        <section className="pos-main card card-flat">
          <div className="pos-toolbar">
            <div className="pos-search">
              <SearchIcon />
              <input
                type="search"
                placeholder="Search products…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Search products"
              />
              <span className="pos-search-scan" title="Barcode scan (coming soon)" aria-hidden>
                <ScanIcon />
              </span>
            </div>
            <div className="pos-category-tabs" role="tablist">
              {POS_CATEGORIES.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  role="tab"
                  aria-selected={category === c.id}
                  className={`pos-category-tab${category === c.id ? ' active' : ''}`}
                  onClick={() => setCategory(c.id)}
                >
                  {c.icon ? <span aria-hidden>{c.icon}</span> : null}
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          {loading ? <p className="muted-block pos-loading">Loading products…</p> : null}
          {!loading && filteredProducts.length === 0 ? (
            <p className="muted-block pos-loading">No products match your search.</p>
          ) : null}
          <div className="pos-product-grid">
            {filteredProducts.map((p) => {
              const img = publicWrsAssetUrl(supabase, p.image_url);
              return (
                <article key={p.id} className="pos-product-card">
                  <div className="pos-product-media">
                    {img ? <img src={img} alt="" /> : <div className="pos-product-placeholder" />}
                  </div>
                  <h3>{p.name}</h3>
                  <p className="pos-product-price">{money(Number(p.price))}</p>
                  <p className={`pos-stock${isLowStock(p.stock_quantity) ? ' pos-stock--low' : ''}`}>
                    <CheckIcon />{' '}
                    {tracksStock(p.category) && p.stock_quantity != null
                      ? stockLabel(p.stock_quantity)
                      : 'In Stock'}
                  </p>
                  <button type="button" className="pos-add-btn" aria-label={`Add ${p.name}`} onClick={() => addProduct(p)}>
                    +
                  </button>
                </article>
              );
            })}
          </div>
        </section>

        <aside className="pos-cart card card-flat">
          <div className="pos-cart-head">
            <h2>
              <CartIcon /> Cart ({cartCount} {cartCount === 1 ? 'item' : 'items'})
            </h2>
            <button type="button" className="pos-link-danger" disabled={cart.length === 0} onClick={clearCart}>
              Clear Cart
            </button>
          </div>

          <div className="pos-cart-lines">
            {cart.length === 0 ? (
              <p className="muted-block">Tap + on a product to add it here.</p>
            ) : (
              cart.map((l) => {
                const img = publicWrsAssetUrl(supabase, l.image_url);
                return (
                  <div key={l.productId} className="pos-cart-line">
                    <div className="pos-cart-line-thumb">{img ? <img src={img} alt="" /> : null}</div>
                    <div className="pos-cart-line-body">
                      <div className="pos-cart-line-title">{l.name}</div>
                      <div className="pos-cart-line-unit">
                        {money(l.unitPrice)} / pc
                      </div>
                      <div className="pos-cart-line-foot">
                        <div className="qty-stepper">
                          <button type="button" aria-label="Decrease quantity" onClick={() => setLineQty(l.productId, l.quantity - 1)}>
                            −
                          </button>
                          <span>{l.quantity}</span>
                          <button type="button" aria-label="Increase quantity" onClick={() => setLineQty(l.productId, l.quantity + 1)}>
                            +
                          </button>
                        </div>
                        <span className="pos-cart-line-total">{money(l.unitPrice * l.quantity)}</span>
                        <button type="button" className="pos-icon-btn danger" aria-label="Remove" onClick={() => removeLine(l.productId)}>
                          <TrashIcon />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div className="pos-totals">
            <div className="pos-total-row">
              <span>Subtotal</span>
              <span>{money(cartTotal)}</span>
            </div>
            <div className="pos-total-row pos-total-row--grand">
              <span>Total</span>
              <span>{money(cartTotal)}</span>
            </div>
          </div>

          <label className="field pos-cash-field">
            <span className="pos-cash-label">
              <CashIcon /> Cash Received
            </span>
            <input
              type="number"
              min={0}
              step="0.01"
              placeholder="0.00"
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
            disabled={cart.length === 0 || submitting}
            onClick={() => void submitSale()}
          >
            <CheckIcon /> {submitting ? 'Saving…' : 'Complete Order'}
          </button>
          <button type="button" className="btn btn-ghost btn-block" disabled={cart.length === 0} onClick={clearCart}>
            <TrashIcon /> Clear Cart
          </button>
        </aside>
      </div>
    </div>
  );
}

function SearchIcon() {
  return (
    <svg className="pos-search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
      <path d="M20 20l-3-3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function ScanIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M4 7V5a1 1 0 011-1h2M20 7V5a1 1 0 00-1-1h-2M4 17v2a1 1 0 001 1h2M20 17v2a1 1 0 01-1 1h-2" stroke="currentColor" strokeWidth="1.8" />
      <path d="M7 12h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M5 12l4 4L19 6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CartIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M6 6h15l-1.5 9H8L6 6zM6 6L5 3H2M9 20a1 1 0 100-2 1 1 0 000 2zm8 0a1 1 0 100-2 1 1 0 000 2z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M4 7h16M9 7V5h6v2M10 11v6M14 11v6M6 7l1 14h10l1-14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function CashIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="3" y="6" width="18" height="12" rx="2" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="12" cy="12" r="2.5" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}
