import { useCallback, useEffect, useState } from 'react';

import { ModulePageHeader } from '../components/ModulePageHeader';
import { useAuth } from '../auth/AuthProvider';
import { money } from '../lib/format';
import { supabase } from '../lib/supabase';

type ServiceRow = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  is_available: boolean;
  sort_order: number;
};

const emptyForm = { name: '', description: '', price: '', available: true };

export function LaundryServicesPage() {
  const { businessId, profile } = useAuth();
  const [rows, setRows] = useState<ServiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ServiceRow | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ServiceRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  const branch =
    profile?.display_name?.trim() ? `${profile.display_name.trim()} · Laundry` : 'Zoda Laundry';

  const load = useCallback(async () => {
    if (!businessId) return;
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase
      .from('laundry_services')
      .select('id,name,description,price,is_available,sort_order')
      .eq('seller_id', businessId)
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true });
    if (err) setError(err.message);
    setRows((data ?? []) as ServiceRow[]);
    setLoading(false);
  }, [businessId]);

  useEffect(() => {
    void load();
  }, [load]);

  function openAdd() {
    setEditing(null);
    setForm(emptyForm);
    setModalOpen(true);
  }

  function openEdit(row: ServiceRow) {
    setEditing(row);
    setForm({
      name: row.name,
      description: row.description ?? '',
      price: String(row.price),
      available: row.is_available,
    });
    setModalOpen(true);
  }

  async function save() {
    if (!businessId) return;
    const name = form.name.trim();
    const description = form.description.trim();
    const price = Number(form.price);
    if (!name || !Number.isFinite(price) || price < 0) {
      setError('Enter a service name and valid price.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (editing) {
        const { error: err } = await supabase
          .from('laundry_services')
          .update({
            name,
            description: description || null,
            price,
            is_available: form.available,
            updated_at: new Date().toISOString(),
          })
          .eq('id', editing.id);
        if (err) throw err;
      } else {
        const { error: err } = await supabase.from('laundry_services').insert({
          seller_id: businessId,
          name,
          description: description || null,
          price,
          is_available: form.available,
          sort_order: rows.length,
        });
        if (err) throw err;
      }
      setModalOpen(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save service');
    } finally {
      setSaving(false);
    }
  }

  async function toggleAvailable(row: ServiceRow) {
    const { error: err } = await supabase
      .from('laundry_services')
      .update({ is_available: !row.is_available, updated_at: new Date().toISOString() })
      .eq('id', row.id);
    if (err) setError(err.message);
    else void load();
  }

  function requestDelete(row: ServiceRow) {
    setError(null);
    setDeleteTarget(row);
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    setError(null);
    try {
      const { error: err } = await supabase.from('laundry_services').delete().eq('id', deleteTarget.id);
      if (err) throw err;
      if (editing?.id === deleteTarget.id) {
        setModalOpen(false);
        setEditing(null);
        setForm(emptyForm);
      }
      setDeleteTarget(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete service');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <ModulePageHeader
        title="Laundry services"
        subtitle="Add services, descriptions, and prices for your POS."
        branch={branch}
      />
      {error ? <p className="error-text module-alert">{error}</p> : null}

      <div className="card card-flat" style={{ marginBottom: 16 }}>
        <button type="button" className="btn btn-primary btn-sm" onClick={openAdd}>
          Add service
        </button>
      </div>

      <div className="card">
        {loading ? <p className="muted-block">Loading…</p> : null}
        {!loading && rows.length === 0 ? (
          <p className="muted-block">No services yet. Add wash, dry, fold, and other offerings.</p>
        ) : null}
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Service</th>
                <th>Description</th>
                <th>Price</th>
                <th>POS</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    <strong>{r.name}</strong>
                  </td>
                  <td style={{ maxWidth: 320, fontSize: 13, color: 'var(--muted)' }}>{r.description || '—'}</td>
                  <td>{money(Number(r.price))}</td>
                  <td>
                    {r.is_available ? (
                      <span className="chip ok">Available</span>
                    ) : (
                      <span className="chip pending">Hidden</span>
                    )}
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => openEdit(r)}>
                      Edit
                    </button>{' '}
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => void toggleAvailable(r)}>
                      {r.is_available ? 'Hide' : 'Show'}
                    </button>{' '}
                    <button type="button" className="btn btn-danger btn-sm" onClick={() => requestDelete(r)}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {modalOpen ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setModalOpen(false)}>
          <div className="modal-card" role="dialog" onClick={(e) => e.stopPropagation()}>
            <h2 className="card-title">{editing ? 'Edit service' : 'New service'}</h2>
            <div className="field">
              <label htmlFor="svc-name">Service name</label>
              <input
                id="svc-name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Wash & fold (per kg)"
              />
            </div>
            <div className="field">
              <label htmlFor="svc-desc">Description</label>
              <textarea
                id="svc-desc"
                rows={3}
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="What is included in this service?"
              />
            </div>
            <div className="field">
              <label htmlFor="svc-price">Price (₱)</label>
              <input
                id="svc-price"
                type="number"
                min={0}
                step="0.01"
                value={form.price}
                onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
              />
            </div>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={form.available}
                onChange={(e) => setForm((f) => ({ ...f, available: e.target.checked }))}
              />
              Show on POS
            </label>
            <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap', alignItems: 'center' }}>
              <button type="button" className="btn btn-primary btn-sm" disabled={saving || deleting} onClick={() => void save()}>
                {saving ? 'Saving…' : 'Save'}
              </button>
              <button type="button" className="btn btn-ghost btn-sm" disabled={saving || deleting} onClick={() => setModalOpen(false)}>
                Cancel
              </button>
              {editing ? (
                <button
                  type="button"
                  className="btn btn-danger btn-sm"
                  disabled={saving || deleting}
                  style={{ marginLeft: 'auto' }}
                  onClick={() => requestDelete(editing)}
                >
                  Delete service
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {deleteTarget ? (
        <div className="modal-backdrop" role="presentation" onClick={() => !deleting && setDeleteTarget(null)}>
          <div className="modal-card" role="dialog" onClick={(e) => e.stopPropagation()}>
            <h2 className="card-title">Delete service?</h2>
            <p className="muted-block" style={{ marginTop: 8 }}>
              Remove <strong>{deleteTarget.name}</strong> from your catalog? It will disappear from POS. Past sales
              receipts keep the service name on record.
            </p>
            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button type="button" className="btn btn-danger btn-sm" disabled={deleting} onClick={() => void confirmDelete()}>
                {deleting ? 'Deleting…' : 'Yes, delete'}
              </button>
              <button type="button" className="btn btn-ghost btn-sm" disabled={deleting} onClick={() => setDeleteTarget(null)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
