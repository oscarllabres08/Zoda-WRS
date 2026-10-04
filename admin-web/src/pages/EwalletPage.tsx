import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';

import { ImageUploadField } from '../components/ImageUploadField';
import { PageHeader } from '../components/PageHeader';
import { useAuth } from '../auth/AuthProvider';
import { publicWrsAssetUrl } from '../lib/format';
import { supabase } from '../lib/supabase';
import { uploadWalletQr } from '../lib/uploadWalletQr';

const PROVIDER = 'GCash';

type WalletRow = {
  id: string;
  account_name: string | null;
  account_number: string | null;
  qr_image_path: string | null;
  is_active: boolean;
};

export function EwalletPage() {
  const { businessId } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [row, setRow] = useState<WalletRow | null>(null);
  const [accountName, setAccountName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [showToCustomers, setShowToCustomers] = useState(true);
  const [qrFile, setQrFile] = useState<File | null>(null);

  const load = useCallback(async () => {
    if (!businessId) return;
    setLoading(true);
    setError(null);
    const { data, error: loadErr } = await supabase
      .from('ewallet_accounts')
      .select('id,account_name,account_number,qr_image_path,is_active')
      .eq('seller_id', businessId)
      .eq('provider', PROVIDER)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (loadErr) {
      setError(loadErr.message);
      setRow(null);
      setLoading(false);
      return;
    }
    const w = (data as WalletRow | null) ?? null;
    setRow(w);
    setAccountName(w?.account_name?.trim() ?? '');
    setAccountNumber(w?.account_number?.trim() ?? '');
    setShowToCustomers(w?.is_active ?? true);
    setLoading(false);
  }, [businessId]);

  useEffect(() => {
    void load();
    if (!businessId) return;
    const channel = supabase
      .channel(`admin-ewallet-${businessId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'ewallet_accounts', filter: `seller_id=eq.${businessId}` },
        () => void load()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [businessId, load]);

  useEffect(() => {
    if (!success) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setSuccess(null);
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [success]);

  const qrPreviewUrl = publicWrsAssetUrl(supabase, row?.qr_image_path);

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    if (!businessId) return;
    const number = accountNumber.trim();
    if (!number) {
      setError('GCash number is required.');
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      let qrPath = row?.qr_image_path ?? null;
      if (qrFile) {
        qrPath = await uploadWalletQr(businessId, qrFile);
      }

      const payload = {
        account_name: accountName.trim() || null,
        account_number: number,
        qr_image_path: qrPath,
        is_active: showToCustomers,
      };

      if (row?.id) {
        const { error: updateErr } = await supabase.from('ewallet_accounts').update(payload).eq('id', row.id);
        if (updateErr) throw updateErr;
      } else {
        const { error: insertErr } = await supabase.from('ewallet_accounts').insert({
          seller_id: businessId,
          provider: PROVIDER,
          ...payload,
        });
        if (insertErr) throw insertErr;
      }

      setQrFile(null);
      setSuccess(
        showToCustomers
          ? 'GCash saved. Customers will see your number and QR code at checkout.'
          : 'GCash saved. Turn on “Show to customers” so it appears in the customer app.'
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save GCash details.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeader
        title="E-wallet"
        description="Set up GCash for online orders. Saved details appear in the Customer app checkout."
      />

      {error ? <p className="error-text module-alert">{error}</p> : null}

      <div className="card card-flat ewallet-page-card">
        <div className="ewallet-provider-head">
          <span className="ewallet-provider-badge" aria-hidden>
            GC
          </span>
          <div>
            <h2 className="inventory-section-title" style={{ margin: 0 }}>
              GCash
            </h2>
            <p className="muted-block" style={{ margin: '4px 0 0' }}>
              Account name, mobile number, and QR code for customer payments.
            </p>
          </div>
        </div>

        {loading ? <p className="muted-block">Loading…</p> : null}

        <form className="ewallet-form" onSubmit={(ev) => void handleSave(ev)}>
          <label className="field">
            <span>Account name</span>
            <input
              type="text"
              placeholder="e.g. Juan Dela Cruz / Zoda WRS"
              value={accountName}
              onChange={(e) => setAccountName(e.target.value)}
              disabled={saving || loading}
              autoComplete="name"
            />
          </label>

          <label className="field">
            <span>GCash number</span>
            <input
              type="text"
              inputMode="numeric"
              placeholder="09xx xxx xxxx"
              value={accountNumber}
              onChange={(e) => setAccountNumber(e.target.value)}
              disabled={saving || loading}
              required
            />
          </label>

          <ImageUploadField
            label="GCash QR code"
            hint="Upload your GCash receive-money QR — shown to customers when they pay online"
            disabled={saving || loading}
            previewUrl={qrFile ? null : qrPreviewUrl}
            onFileSelect={setQrFile}
          />

          <div className="settings-toggle-row">
            <div className="settings-toggle-copy">
              <strong>Show to customers</strong>
              <p>When on, the Customer app checkout shows your GCash number and QR code.</p>
            </div>
            <label className={`loyalty-toggle settings-toggle${showToCustomers ? ' loyalty-toggle--on' : ''}`}>
              <input
                type="checkbox"
                checked={showToCustomers}
                disabled={saving || loading}
                onChange={(e) => setShowToCustomers(e.target.checked)}
                aria-label="Show GCash to customers"
              />
              <span className="loyalty-toggle-track" aria-hidden />
              <span className="loyalty-toggle-label">{showToCustomers ? 'On' : 'Off'}</span>
            </label>
          </div>

          <button type="submit" className="btn btn-primary" disabled={saving || loading}>
            {saving ? 'Saving…' : 'Save GCash'}
          </button>
        </form>
      </div>

      {success
        ? createPortal(
            <div className="modal-backdrop ewallet-success-backdrop" role="presentation" onClick={() => setSuccess(null)}>
              <div
                className="modal-card ewallet-success-modal"
                role="dialog"
                aria-labelledby="ewallet-success-title"
                aria-modal="true"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="ewallet-success-icon" aria-hidden>
                  ✓
                </div>
                <h2 id="ewallet-success-title" className="ewallet-success-title">
                  GCash saved
                </h2>
                <p className="ewallet-success-body">{success}</p>
                <button type="button" className="btn btn-primary btn-block" onClick={() => setSuccess(null)}>
                  OK
                </button>
              </div>
            </div>,
            document.body
          )
        : null}
    </>
  );
}
