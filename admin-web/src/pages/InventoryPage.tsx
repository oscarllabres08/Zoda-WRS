import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';

import { ImageUploadField } from '../components/ImageUploadField';
import { ModulePageHeader } from '../components/ModulePageHeader';
import { useAuth } from '../auth/AuthProvider';
import { money, publicWrsAssetUrl } from '../lib/format';
import { supabase } from '../lib/supabase';
import { fetchLoyaltyProgramActive } from '../lib/loyaltyProgram';
import { isLowStock, LOW_STOCK_THRESHOLD, stockLabel, tracksStock } from '../lib/inventoryStock';
import { uploadProductImage } from '../lib/uploadProductImage';

type ProductRow = {
  id: string;
  name: string;
  price: number;
  is_available: boolean;
  category: 'water' | 'other';
  earn_loyalty_points: boolean;
  stock_quantity: number | null;
  image_url?: string | null;
};

type InvFilter = 'all' | 'water' | 'other';

export function InventoryPage() {
  const { businessId, profile } = useAuth();
  const location = useLocation();
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [category, setCategory] = useState<'water' | 'other'>('water');
  const [stockQty, setStockQty] = useState('');
  const [earnLoyalty, setEarnLoyalty] = useState(false);
  const [newImageFile, setNewImageFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [listFilter, setListFilter] = useState<InvFilter>('all');
  const [editing, setEditing] = useState<ProductRow | null>(null);
  const [editName, setEditName] = useState('');
  const [editPrice, setEditPrice] = useState('');
  const [editCategory, setEditCategory] = useState<'water' | 'other'>('water');
  const [editStockQty, setEditStockQty] = useState('');
  const [editEarnLoyalty, setEditEarnLoyalty] = useState(false);
  const [editImageFile, setEditImageFile] = useState<File | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [loyaltyProgramActive, setLoyaltyProgramActive] = useState(false);
  const [loyaltyLoading, setLoyaltyLoading] = useState(true);

  const branch =
    profile?.display_name?.trim() ? `${profile.display_name.trim()} · Zoda WRS` : 'Zoda WRS Main Branch';

  const load = useCallback(async () => {
    if (!businessId) return;
    setLoading(true);
    const { data, error: err } = await supabase
      .from('products')
      .select('id,name,price,is_available,category,earn_loyalty_points,stock_quantity,image_url')
      .eq('seller_id', businessId)
      .order('sort_order', { ascending: true });
    if (err) setError(err.message);
    setProducts((data ?? []) as ProductRow[]);
    setLoading(false);
  }, [businessId]);

  const loadLoyaltyFlag = useCallback(async () => {
    if (!businessId) return;
    setLoyaltyLoading(true);
    try {
      setLoyaltyProgramActive(await fetchLoyaltyProgramActive(businessId));
    } catch {
      setLoyaltyProgramActive(false);
    } finally {
      setLoyaltyLoading(false);
    }
  }, [businessId]);

  useEffect(() => {
    void loadLoyaltyFlag();
  }, [location.pathname, loadLoyaltyFlag]);

  useEffect(() => {
    void load();
    if (!businessId) return;
    const ch = supabase
      .channel(`admin-inventory-${businessId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'products', filter: `seller_id=eq.${businessId}` },
        () => void load()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [businessId, load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter((p) => {
      if (listFilter !== 'all' && p.category !== listFilter) return false;
      if (!q) return true;
      return p.name.toLowerCase().includes(q);
    });
  }, [products, search, listFilter]);

  const waterProducts = filtered.filter((p) => p.category === 'water');
  const otherProducts = filtered.filter((p) => p.category === 'other');

  const lowStockProducts = useMemo(
    () => products.filter((p) => p.category === 'other' && isLowStock(p.stock_quantity)),
    [products]
  );

  async function toggleAvailability(id: string, next: boolean) {
    setProducts((prev) => prev.map((p) => (p.id === id ? { ...p, is_available: next } : p)));
    const { error: err } = await supabase.from('products').update({ is_available: next }).eq('id', id);
    if (err) {
      setError(err.message);
      void load();
    }
  }

  async function addProduct(e: React.FormEvent) {
    e.preventDefault();
    if (!businessId) return;
    const p = Number(price);
    if (!name.trim() || !Number.isFinite(p) || p < 0) {
      setError('Enter a valid name and price.');
      return;
    }
    let stock: number | null = null;
    if (tracksStock(category)) {
      const q = Number(stockQty);
      if (!Number.isInteger(q) || q < 0) {
        setError('Enter stock quantity (0 or more pieces) for Others products.');
        return;
      }
      stock = q;
    }
    setSaving(true);
    setError(null);
    try {
      let imagePath: string | null = null;
      if (newImageFile) {
        imagePath = await uploadProductImage(businessId, newImageFile);
      }
      const { error: err } = await supabase.from('products').insert({
        seller_id: businessId,
        name: name.trim(),
        price: p,
        is_available: true,
        category,
        earn_loyalty_points: loyaltyProgramActive && earnLoyalty,
        stock_quantity: stock,
        image_url: imagePath,
      });
      if (err) throw err;
      setName('');
      setPrice('');
      setStockQty('');
      setEarnLoyalty(false);
      setNewImageFile(null);
      await load();
    } catch (ex) {
      setError(ex instanceof Error ? ex.message : 'Failed to add product');
    } finally {
      setSaving(false);
    }
  }

  async function replaceImage(productId: string, file: File) {
    if (!businessId) return;
    setUploadingId(productId);
    setError(null);
    try {
      const path = await uploadProductImage(businessId, file);
      const { error: err } = await supabase.from('products').update({ image_url: path }).eq('id', productId);
      if (err) throw err;
      await load();
    } catch (ex) {
      setError(ex instanceof Error ? ex.message : 'Upload failed');
    } finally {
      setUploadingId(null);
    }
  }

  function openEdit(p: ProductRow) {
    setEditing(p);
    setEditName(p.name);
    setEditPrice(String(p.price));
    setEditCategory(p.category);
    setEditStockQty(p.stock_quantity != null ? String(p.stock_quantity) : '');
    setEditEarnLoyalty(p.earn_loyalty_points);
    setEditImageFile(null);
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    const p = Number(editPrice);
    if (!editName.trim() || !Number.isFinite(p) || p < 0) {
      setError('Enter a valid name and price.');
      return;
    }
    let stock: number | null = null;
    if (tracksStock(editCategory)) {
      const q = Number(editStockQty);
      if (!Number.isInteger(q) || q < 0) {
        setError('Enter stock quantity (0 or more pieces) for Others products.');
        return;
      }
      stock = q;
    }
    setEditSaving(true);
    setError(null);
    try {
      let imagePath = editing.image_url ?? null;
      if (editImageFile && businessId) {
        imagePath = await uploadProductImage(businessId, editImageFile);
      }
      const { error: err } = await supabase
        .from('products')
        .update({
          name: editName.trim(),
          price: p,
          category: editCategory,
          image_url: imagePath,
          earn_loyalty_points: loyaltyProgramActive && editEarnLoyalty,
          stock_quantity: stock,
        })
        .eq('id', editing.id);
      if (err) throw err;
      setEditing(null);
      setEditImageFile(null);
      await load();
    } catch (ex) {
      setError(ex instanceof Error ? ex.message : 'Update failed');
    } finally {
      setEditSaving(false);
    }
  }

  async function deleteProduct(p: ProductRow) {
    if (!window.confirm(`Delete “${p.name}”? This cannot be undone.`)) return;
    setError(null);
    const { error: err } = await supabase.from('products').delete().eq('id', p.id);
    if (err) setError(err.message);
    else await load();
  }

  return (
    <div className="inventory-layout">
      <ModulePageHeader
        title="Inventory"
        subtitle="Manage your water refilling products, containers and accessories."
        branch={branch}
      />
      {error ? <p className="error-text module-alert">{error}</p> : null}

      {lowStockProducts.length > 0 ? (
        <div className="inventory-low-stock-alert card card-flat" role="status">
          <strong>Low stock alert</strong>
          <p className="muted-block" style={{ margin: '6px 0 0' }}>
            {lowStockProducts.length} item{lowStockProducts.length === 1 ? '' : 's'} at {LOW_STOCK_THRESHOLD} pcs or
            below:{' '}
            {lowStockProducts
              .map((p) => `${p.name} (${p.stock_quantity ?? 0})`)
              .slice(0, 6)
              .join(' · ')}
            {lowStockProducts.length > 6 ? ' …' : ''}
          </p>
        </div>
      ) : null}

      <div className="card card-flat inventory-add-card">
        <h2 className="inventory-section-title">
          <PlusIcon /> Add Product
        </h2>
        <form className="inventory-form-v2" onSubmit={(e) => void addProduct(e)}>
          <div className="inventory-form-v2-fields">
            <div className="field">
              <label htmlFor="pname">Name</label>
              <input id="pname" placeholder="e.g. 5-Gallon Water Refill" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div className="field">
              <label htmlFor="pprice">Price (₱)</label>
              <input id="pprice" type="number" min={0} step="0.01" placeholder="e.g. 25.00" value={price} onChange={(e) => setPrice(e.target.value)} required />
            </div>
            <div className="field">
              <label htmlFor="pcat">Category</label>
              <select
                id="pcat"
                value={category}
                onChange={(e) => {
                  const next = e.target.value as 'water' | 'other';
                  setCategory(next);
                  if (next === 'water') setStockQty('');
                }}
              >
                <option value="water">Water Refill</option>
                <option value="other">Others (containers, accessories)</option>
              </select>
            </div>
            {tracksStock(category) ? (
              <div className="field">
                <label htmlFor="pstock">Stock quantity (pcs)</label>
                <input
                  id="pstock"
                  type="number"
                  min={0}
                  step={1}
                  placeholder="e.g. 50"
                  value={stockQty}
                  onChange={(e) => setStockQty(e.target.value)}
                  required
                />
                <p className="field-hint">Low stock alert when {LOW_STOCK_THRESHOLD} pcs or less remain.</p>
              </div>
            ) : null}
            <label className={`checkbox-row inventory-loyalty-row${!loyaltyProgramActive ? ' disabled' : ''}`}>
              <input
                type="checkbox"
                checked={loyaltyProgramActive && earnLoyalty}
                disabled={!loyaltyProgramActive || loyaltyLoading}
                onChange={(e) => setEarnLoyalty(e.target.checked)}
              />
              Available for Loyalty Points
            </label>
            {!loyaltyProgramActive && !loyaltyLoading ? (
              <p className="muted-block inventory-loyalty-hint">
                Turn on the program in <Link to="/loyalty">Loyalty points</Link> to mark products.
              </p>
            ) : null}
            <button type="submit" className="btn btn-primary btn-water inventory-save-btn" disabled={saving}>
              <SaveIcon /> {saving ? 'Saving…' : 'Save Product'}
            </button>
          </div>
          <ImageUploadField
            label="Product Image"
            hint="Resized & compressed before saving"
            disabled={saving}
            onFileSelect={setNewImageFile}
          />
        </form>
      </div>

      <div className="card card-flat inventory-list-card">
        <div className="inventory-list-toolbar">
          <div className="inventory-filter-tabs" role="tablist">
            {(
              [
                { id: 'all' as const, label: 'All', icon: null },
                { id: 'water' as const, label: 'Water Refill', icon: '💧' },
                { id: 'other' as const, label: 'Others', icon: '📦' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={listFilter === tab.id}
                className={`pos-category-tab${listFilter === tab.id ? ' active' : ''}`}
                onClick={() => setListFilter(tab.id)}
              >
                {tab.icon ? <span aria-hidden>{tab.icon}</span> : null}
                {tab.label}
              </button>
            ))}
          </div>
          <div className="inventory-search pos-search">
            <SearchIcon />
            <input
              type="search"
              placeholder="Search inventory…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search inventory"
            />
          </div>
        </div>

        {loading ? <p className="muted-block">Loading catalog…</p> : null}
        {!loading && filtered.length === 0 ? (
          <p className="muted-block">No products yet. Add your first item above.</p>
        ) : null}

        {waterProducts.length > 0 ? (
          <InventorySection title="Water Refill" icon="💧" count={waterProducts.length}>
            {waterProducts.map((p) => (
              <InventoryRow
                key={p.id}
                product={p}
                loyaltyProgramActive={loyaltyProgramActive}
                uploading={uploadingId === p.id}
                onEdit={() => openEdit(p)}
                onDelete={() => void deleteProduct(p)}
                onToggleAvail={(v) => void toggleAvailability(p.id, v)}
                onReplaceImage={(f) => void replaceImage(p.id, f)}
              />
            ))}
          </InventorySection>
        ) : null}

        {otherProducts.length > 0 ? (
          <InventorySection title="Others" icon="📦" count={otherProducts.length}>
            {otherProducts.map((p) => (
              <InventoryRow
                key={p.id}
                product={p}
                loyaltyProgramActive={loyaltyProgramActive}
                uploading={uploadingId === p.id}
                onEdit={() => openEdit(p)}
                onDelete={() => void deleteProduct(p)}
                onToggleAvail={(v) => void toggleAvailability(p.id, v)}
                onReplaceImage={(f) => void replaceImage(p.id, f)}
              />
            ))}
          </InventorySection>
        ) : null}
      </div>

      {editing ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setEditing(null)}>
          <div className="modal-card" role="dialog" aria-labelledby="edit-product-title" onClick={(e) => e.stopPropagation()}>
            <h2 id="edit-product-title" style={{ marginTop: 0 }}>
              Edit product
            </h2>
            <form onSubmit={(e) => void saveEdit(e)}>
              <div className="field">
                <label htmlFor="ename">Name</label>
                <input
                  id="ename"
                  placeholder="e.g. 5-Gallon Water Refill"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  required
                />
              </div>
              <div className="field">
                <label htmlFor="eprice">Price (₱)</label>
                <input
                  id="eprice"
                  type="number"
                  min={0}
                  step="0.01"
                  placeholder="e.g. 25.00"
                  value={editPrice}
                  onChange={(e) => setEditPrice(e.target.value)}
                  required
                />
              </div>
              <div className="field">
                <label htmlFor="ecat">Category</label>
                <select
                  id="ecat"
                  value={editCategory}
                  onChange={(e) => {
                    const next = e.target.value as 'water' | 'other';
                    setEditCategory(next);
                    if (next === 'water') setEditStockQty('');
                  }}
                >
                  <option value="water">Water Refill</option>
                  <option value="other">Others</option>
                </select>
              </div>
              {tracksStock(editCategory) ? (
                <div className="field">
                  <label htmlFor="estock">Stock quantity (pcs)</label>
                  <input
                    id="estock"
                    type="number"
                    min={0}
                    step={1}
                    placeholder="e.g. 50"
                    value={editStockQty}
                    onChange={(e) => setEditStockQty(e.target.value)}
                    required
                  />
                </div>
              ) : null}
              <label className={`checkbox-row inventory-loyalty-row${!loyaltyProgramActive ? ' disabled' : ''}`}>
                <input
                  type="checkbox"
                  checked={loyaltyProgramActive && editEarnLoyalty}
                  disabled={!loyaltyProgramActive}
                  onChange={(e) => setEditEarnLoyalty(e.target.checked)}
                />
                Available for Loyalty Points
              </label>
              {!loyaltyProgramActive ? (
                <p className="muted-block inventory-loyalty-hint">Enable Loyalty points in the sidebar first.</p>
              ) : null}
              <ImageUploadField
                label="Product image"
                hint="Replace current photo"
                disabled={editSaving}
                previewUrl={editImageFile ? undefined : publicWrsAssetUrl(supabase, editing.image_url) ?? undefined}
                onFileSelect={setEditImageFile}
              />
              <div className="row-actions" style={{ marginTop: 8 }}>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing(null)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary btn-sm" disabled={editSaving}>
                  {editSaving ? 'Saving…' : 'Save changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function InventorySection({
  title,
  icon,
  count,
  children,
}: {
  title: string;
  icon: string;
  count: number;
  children: ReactNode;
}) {
  return (
    <section className="inventory-section">
      <header className="inventory-section-head">
        <h3>
          <span aria-hidden>{icon}</span> {title}
        </h3>
        <span className="inventory-section-count">
          {count} product{count === 1 ? '' : 's'}
        </span>
      </header>
      <div className="inventory-row-list">{children}</div>
    </section>
  );
}

function InventoryRow({
  product: p,
  loyaltyProgramActive,
  uploading,
  onEdit,
  onDelete,
  onToggleAvail,
  onReplaceImage,
}: {
  product: ProductRow;
  loyaltyProgramActive: boolean;
  uploading: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onToggleAvail: (v: boolean) => void;
  onReplaceImage: (f: File) => void;
}) {
  const img = publicWrsAssetUrl(supabase, p.image_url);
  const categoryLabel =
    p.category === 'water' ? 'Water Refill' : /container|gallon|jug|slim|round/i.test(p.name) ? 'Container' : 'Accessory';

  return (
    <article className={`inventory-row${p.is_available ? '' : ' unavailable'}`}>
      <div className="inventory-row-media">
        {img ? <img src={img} alt={p.name} /> : <div className="inventory-no-img">No photo</div>}
        <label className="inventory-row-photo-btn">
          {uploading ? '…' : 'Photo'}
          <input
            type="file"
            accept="image/*"
            hidden
            disabled={uploading}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onReplaceImage(f);
            }}
          />
        </label>
      </div>
      <div className="inventory-row-body">
        <div className="inventory-row-top">
          <h4>{p.name}</h4>
          <div className="inventory-row-actions">
            <button type="button" className="inventory-action-btn edit" aria-label="Edit" onClick={onEdit}>
              <EditIcon />
            </button>
            <button type="button" className="inventory-action-btn delete" aria-label="Delete" onClick={onDelete}>
              <TrashIcon />
            </button>
          </div>
        </div>
        <div className="inventory-row-badges">
          <span className="inventory-row-badge">{categoryLabel}</span>
          {loyaltyProgramActive && p.earn_loyalty_points ? (
            <span className="inventory-row-badge loyalty">Loyalty points</span>
          ) : null}
        </div>
        <div className="inventory-row-info">
          <p className="inventory-row-price">
            {money(Number(p.price))} <span>/ pc</span>
          </p>
          {tracksStock(p.category) ? (
            p.stock_quantity == null ? (
              <p className="inventory-row-stock low">
                <span className="stock-dot" /> Set stock (edit)
              </p>
            ) : (
              <p
                className={`inventory-row-stock${p.stock_quantity <= 0 ? ' out' : isLowStock(p.stock_quantity) ? ' low' : ' in'}`}
              >
                <span className="stock-dot" /> {stockLabel(p.stock_quantity)}
              </p>
            )
          ) : (
            <p className={`inventory-row-stock${p.is_available ? ' in' : ' out'}`}>
              <span className="stock-dot" /> {p.is_available ? 'In Stock' : 'Hidden'}
            </p>
          )}
        </div>
        <label className="checkbox-row compact inventory-avail-toggle">
          <input type="checkbox" checked={p.is_available} onChange={(e) => onToggleAvail(e.target.checked)} />
          <span className="inventory-avail-label-long">Available in customer app</span>
          <span className="inventory-avail-label-short">In app</span>
        </label>
      </div>
    </article>
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

function PlusIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

function SaveIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M5 20h14a1 1 0 001-1V8l-4-4H5a1 1 0 00-1 1v14a1 1 0 001 1z" stroke="currentColor" strokeWidth="1.8" />
      <path d="M9 4v4h6V4M8 14h8M8 17h5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function EditIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M4 20h4l10-10-4-4L4 16v4z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
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
