import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { useAuth } from '../auth/AuthProvider';
import { supabase } from '../lib/supabase';
import { OrderPageSkeleton } from '../ui/Skeleton';

type Product = {
  id: string;
  seller_id: string;
  name: string;
  price: number;
  is_available: boolean;
  image_url: string | null;
  category?: 'water' | 'other' | null;
};

type CartLine = { product: Product; qty: number };

function formatMoney(amount: number) {
  return `₱${amount.toFixed(2)}`;
}

export function OrderPage() {
  const nav = useNavigate();
  const { user, loading: authLoading } = useAuth();

  const [sellerId, setSellerId] = useState<string | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [qtyById, setQtyById] = useState<Record<string, number>>({});

  const [categoryFilter, setCategoryFilter] = useState<'all' | 'water' | 'other'>(
    'all'
  );
  const [step, setStep] = useState<'menu' | 'checkout'>('menu');

  const [customerName, setCustomerName] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [contactNumber, setContactNumber] = useState('');
  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [locationMessage, setLocationMessage] = useState<string | null>(null);
  const [profileDefaults, setProfileDefaults] = useState<{
    display_name?: string | null;
    phone?: string | null;
    address?: string | null;
  } | null>(null);
  const [notes, setNotes] = useState('');
  const [placing, setPlacing] = useState(false);
  const [placedOrderId, setPlacedOrderId] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    async function load() {
      setErr(null);
      setLoading(true);
      try {
        const { data: ownerRow, error: ownerErr } = await supabase
          .from('profiles')
          .select('user_id')
          .eq('role', 'seller')
          .eq('seller_team_role', 'owner')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (ownerErr) throw ownerErr;
        let sellerUserId = ownerRow?.user_id ?? null;
        if (!sellerUserId) {
          const { data: fallbackRow, error: fallbackErr } = await supabase
            .from('profiles')
            .select('user_id')
            .eq('role', 'seller')
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          if (fallbackErr) throw fallbackErr;
          sellerUserId = fallbackRow?.user_id ?? null;
        }
        if (!sellerUserId) throw new Error('No seller configured yet.');

        const { data: prod, error: prodErr } = await supabase
          .from('products')
          .select('id,seller_id,name,price,is_available,image_url,category')
          .eq('seller_id', sellerUserId)
          .order('sort_order', { ascending: true })
          .order('created_at', { ascending: true });
        if (prodErr) throw prodErr;

        if (!alive) return;
        setSellerId(sellerUserId);
        setProducts((prod ?? []) as Product[]);
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Failed to load products';
        if (!alive) return;
        setErr(msg);
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    }
    load();
    return () => {
      alive = false;
    };
  }, []);

  function publicImageUrl(pathOrUrl?: string | null) {
    if (!pathOrUrl) return null;
    if (pathOrUrl.startsWith('http')) return pathOrUrl;
    const { data } = supabase.storage.from('wrs-assets').getPublicUrl(pathOrUrl);
    return data.publicUrl;
  }

  // Prefill checkout fields from customer profile (editable).
  useEffect(() => {
    if (authLoading) return;
    const userId = user?.id;
    if (!userId) return;
    let alive = true;
    async function loadProfile() {
      const { data, error } = await supabase
        .from('profiles')
        .select('display_name,phone,address')
        .eq('user_id', userId)
        .maybeSingle();
      if (!alive) return;
      if (error) return;
      setProfileDefaults(data ?? null);

      const name = (data?.display_name ?? '').trim();
      const phone = (data?.phone ?? '').trim();
      const addr = (data?.address ?? '').trim();

      // Only fill if still empty; keep user edits intact.
      setCustomerName((prev) => (prev.trim() ? prev : name));
      setContactNumber((prev) => (prev.trim() ? prev : phone));
      setDeliveryAddress((prev) => (prev.trim() ? prev : addr));
    }
    loadProfile();
    return () => {
      alive = false;
    };
  }, [user, authLoading]);

  const cart = useMemo<CartLine[]>(() => {
    const lines: CartLine[] = [];
    for (const p of products) {
      const q = qtyById[p.id] ?? 0;
      if (q > 0) lines.push({ product: p, qty: q });
    }
    return lines;
  }, [products, qtyById]);

  const total = useMemo(() => {
    return cart.reduce((sum, l) => sum + l.product.price * l.qty, 0);
  }, [cart]);

  function bump(productId: string, delta: number) {
    setQtyById((prev) => {
      const next = { ...prev };
      const current = next[productId] ?? 0;
      const v = Math.max(0, current + delta);
      if (v === 0) delete next[productId];
      else next[productId] = v;
      return next;
    });
  }

  const filtered = useMemo(() => {
    return products.filter((p) => {
      const cat = (p.category ?? 'water') as 'water' | 'other';
      if (categoryFilter === 'all') return true;
      return cat === categoryFilter;
    });
  }, [products, categoryFilter]);

  async function placeOrder() {
    setPlacedOrderId(null);
    setErr(null);

    if (authLoading) return;
    if (!user) {
      nav('/auth');
      return;
    }
    if (!sellerId) {
      setErr('Seller is not configured yet.');
      return;
    }
    if (cart.length === 0) {
      setErr('Please add at least 1 product.');
      return;
    }
    if (!customerName.trim() || !deliveryAddress.trim() || !contactNumber.trim()) {
      setErr('Please fill Name, Address, and Contact number.');
      return;
    }

    setPlacing(true);
    try {
      const { data: order, error: orderErr } = await supabase
        .from('orders')
        .insert({
          customer_id: user.id,
          seller_id: sellerId,
          customer_name: customerName.trim(),
          delivery_address: deliveryAddress.trim(),
          contact_number: contactNumber.trim(),
          latitude: coords?.latitude ?? null,
          longitude: coords?.longitude ?? null,
          notes: notes.trim() ? notes.trim() : null,
          status: 'pending',
          payment_settled: false,
        })
        .select('id')
        .single();
      if (orderErr) throw orderErr;

      const rows = cart.map((l) => ({
        order_id: order.id,
        product_id: l.product.id,
        product_name: l.product.name,
        unit_price: l.product.price,
        quantity: l.qty,
      }));

      const { error: itemsErr } = await supabase.from('order_items').insert(rows);
      if (itemsErr) throw itemsErr;

      setQtyById({});
      setCustomerName((profileDefaults?.display_name ?? '').trim());
      setDeliveryAddress((profileDefaults?.address ?? '').trim());
      setContactNumber((profileDefaults?.phone ?? '').trim());
      setCoords(null);
      setLocationMessage(null);
      setNotes('');
      setPlacedOrderId(order.id);
      setStep('menu');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to place order';
      setErr(msg);
    } finally {
      setPlacing(false);
    }
  }

  function useCurrentLocation() {
    setLocationMessage(null);
    if (!('geolocation' in navigator)) {
      setLocationMessage('Geolocation is not supported on this device/browser.');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCoords({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
        setLocationMessage('Location captured successfully.');
      },
      () => {
        setLocationMessage('Location access denied. You can still submit manually.');
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 30000,
      }
    );
  }

  return (
    <div className="page">
      <header className="topbar">
        <div>
          <div className="muted">Tap a product</div>
          <div className="h2">{step === 'menu' ? 'Menu' : 'Checkout'}</div>
        </div>
        <div className="spacer" />
        {!user ? (
          <Link to="/auth" className="btn btn-ghost">
            Login
          </Link>
        ) : (
          <Link to="/profile" className="btn btn-ghost">
            Profile
          </Link>
        )}
      </header>

      {loading ? (
        <OrderPageSkeleton />
      ) : err ? (
        <section className="card">
          <div className="alert alert-error">{err}</div>
        </section>
      ) : null}

      {!loading && !err && (
        <>
          {step === 'menu' ? (
            <>
              <section className="card">
                <div className="tabs-row" aria-label="Category filter">
                  <button
                    type="button"
                    className={`tab-chip ${categoryFilter === 'all' ? 'tab-chip-active' : ''}`}
                    onClick={() => setCategoryFilter('all')}
                  >
                    All
                  </button>
                  <button
                    type="button"
                    className={`tab-chip ${categoryFilter === 'water' ? 'tab-chip-active' : ''}`}
                    onClick={() => setCategoryFilter('water')}
                  >
                    Water
                  </button>
                  <button
                    type="button"
                    className={`tab-chip ${categoryFilter === 'other' ? 'tab-chip-active' : ''}`}
                    onClick={() => setCategoryFilter('other')}
                  >
                    Other
                  </button>
                </div>

                <div className="divider" />

                {filtered.length === 0 ? (
                  <div className="muted">No products yet.</div>
                ) : (
                  <div className="product-grid">
                    {filtered.map((p) => {
                      const cat = (p.category ?? 'water') as 'water' | 'other';
                      return (
                        <div
                          key={p.id}
                          style={{ opacity: p.is_available ? 1 : 0.6 }}
                        >
                          <div className="product-card">
                            <div className="product-media">
                              {publicImageUrl(p.image_url) ? (
                                <img className="product-img" src={publicImageUrl(p.image_url)!} alt={p.name} />
                              ) : (
                                <div className="product-img" aria-hidden="true" />
                              )}
                            </div>
                            <div className="product-meta">
                              <div className="product-title">{p.name}</div>
                              <div className="muted" style={{ marginTop: 2, fontWeight: 700 }}>
                                Purified Drinking Water
                              </div>
                              <div className="product-sub" style={{ marginTop: 6 }}>
                                <span style={{ color: 'var(--primary)', fontWeight: 900 }}>
                                  {formatMoney(p.price)}
                                </span>
                                <span className="tag">{cat === 'water' ? 'Water' : 'Other'}</span>
                              </div>
                              <div className="row" style={{ marginTop: 10 }}>
                                <button
                                  className="qty-btn"
                                  type="button"
                                  onClick={() => bump(p.id, -1)}
                                  disabled={!p.is_available}
                                >
                                  −
                                </button>
                                <div className="qty-num" aria-label="Quantity">
                                  {qtyById[p.id] ?? 0}
                                </div>
                                <button
                                  className="qty-btn"
                                  type="button"
                                  onClick={() => bump(p.id, +1)}
                                  disabled={!p.is_available}
                                >
                                  +
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>

              {cart.length > 0 && (
                <div className="checkout-bar">
                  <div className="card">
                    <div className="row">
                      <div>
                        <div className="muted">Total</div>
                        <div className="h2">{formatMoney(total)}</div>
                      </div>
                      <div className="spacer" />
                      <button className="btn btn-primary" type="button" onClick={() => setStep('checkout')}>
                        Proceed to checkout
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </>
          ) : (
            <section className="card">
              <div className="row">
                <button
                  className="btn btn-ghost btn-icon"
                  type="button"
                  onClick={() => setStep('menu')}
                  aria-label="Back to menu"
                  title="Back"
                >
                  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path
                      d="M15 18l-6-6 6-6"
                      stroke="currentColor"
                      strokeWidth="2.4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
                <div className="spacer" />
                <div className="h2">{formatMoney(total)}</div>
              </div>

              <div className="divider" />

              <div className="muted" style={{ marginBottom: 8 }}>
                Checkout details
              </div>
              <div className="grid">
                <label className="field">
                  <div className="field-label">Name</div>
                  <input
                    className="input"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="Juan Dela Cruz"
                    autoComplete="name"
                  />
                </label>
                <label className="field">
                  <div className="field-label">Address</div>
                  <textarea
                    className="input"
                    value={deliveryAddress}
                    onChange={(e) => setDeliveryAddress(e.target.value)}
                    placeholder="House no., street, barangay, city"
                    autoComplete="street-address"
                    required
                    rows={3}
                  />
                </label>
                <label className="field">
                  <div className="field-label">Contact number</div>
                  <input
                    className="input"
                    value={contactNumber}
                    onChange={(e) => setContactNumber(e.target.value)}
                    placeholder="09xx xxx xxxx"
                    inputMode="tel"
                    autoComplete="tel"
                  />
                </label>
                <label className="field">
                  <div className="field-label">Notes / Instruction (optional)</div>
                  <input
                    className="input"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Gate code, landmark, etc."
                  />
                </label>
              </div>
              <div className="row" style={{ marginTop: 10 }}>
                <button className="btn btn-ghost" type="button" onClick={useCurrentLocation}>
                  <span className="btn-inline-icon">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
                      <path
                        d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 1 1 18 0z"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      <circle cx="12" cy="10" r="3" stroke="currentColor" strokeWidth="2" />
                    </svg>
                    Use Current Location
                  </span>
                </button>
                {coords ? (
                  <div className="muted" style={{ fontSize: 12 }}>
                    📍 {coords.latitude.toFixed(5)}, {coords.longitude.toFixed(5)}
                  </div>
                ) : null}
              </div>
              {locationMessage ? (
                <div
                  className={locationMessage.includes('successfully') ? 'alert alert-ok' : 'alert alert-error'}
                  style={{ marginTop: 10, fontSize: 13 }}
                >
                  {locationMessage}
                </div>
              ) : null}

              <div className="divider" />

              <button className="btn btn-primary" onClick={placeOrder} disabled={placing}>
                {placing ? 'Placing…' : 'Place order'}
              </button>

              {placedOrderId && (
                <div className="alert alert-ok" style={{ marginTop: 12 }}>
                  Order placed! <Link to="/profile">View My Orders</Link>
                </div>
              )}
            </section>
          )}
        </>
      )}
    </div>
  );
}

