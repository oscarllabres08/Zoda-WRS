import { useCallback, useEffect, useState, type FormEvent } from 'react';



import { ModulePageHeader } from '../components/ModulePageHeader';

import { useAuth } from '../auth/AuthProvider';

import {

  countLoyaltyEligibleProducts,

  fetchLoyaltyProgramActive,

  setLoyaltyProgramActive,

} from '../lib/loyaltyProgram';

import { verifyLoyaltyVoucherCode } from '../lib/verifyLoyaltyVoucher';



type VerifyUiState =

  | { kind: 'idle' }

  | { kind: 'success'; message: string; code: string }

  | { kind: 'used'; message: string; usedAt?: string }

  | { kind: 'error'; message: string };



export function LoyaltyPage() {

  const { businessId, profile } = useAuth();

  const [active, setActive] = useState(false);

  const [eligibleCount, setEligibleCount] = useState(0);

  const [loading, setLoading] = useState(true);

  const [saving, setSaving] = useState(false);

  const [error, setError] = useState<string | null>(null);



  const [voucherCode, setVoucherCode] = useState('');

  const [verifyBusy, setVerifyBusy] = useState(false);

  const [verifyState, setVerifyState] = useState<VerifyUiState>({ kind: 'idle' });



  const branch =

    profile?.display_name?.trim() ? `${profile.display_name.trim()} · Zoda WRS` : 'Zoda WRS Main Branch';



  const load = useCallback(async () => {

    if (!businessId) return;

    setLoading(true);

    setError(null);

    try {

      const [on, count] = await Promise.all([

        fetchLoyaltyProgramActive(businessId),

        countLoyaltyEligibleProducts(businessId),

      ]);

      setActive(on);

      setEligibleCount(count);

    } catch (e) {

      setError(e instanceof Error ? e.message : 'Failed to load loyalty settings');

    } finally {

      setLoading(false);

    }

  }, [businessId]);



  useEffect(() => {

    void load();

  }, [load]);



  async function onToggle(next: boolean) {

    if (!businessId) return;

    setSaving(true);

    setError(null);

    try {

      await setLoyaltyProgramActive(businessId, next);

      setActive(next);

    } catch (e) {

      setError(e instanceof Error ? e.message : 'Could not update loyalty program');

    } finally {

      setSaving(false);

    }

  }



  async function onVerifyVoucher(e: FormEvent) {

    e.preventDefault();

    const trimmed = voucherCode.trim();

    if (trimmed.length < 6) {

      setVerifyState({ kind: 'error', message: 'Enter the customer’s voucher code (e.g. REF-A1B2C3).' });

      return;

    }

    setVerifyBusy(true);

    setVerifyState({ kind: 'idle' });

    try {

      const r = await verifyLoyaltyVoucherCode(trimmed);

      if (r.ok) {

        setVerifyState({

          kind: 'success',

          message: r.message ?? 'Verified — give 1 free container refill.',

          code: r.code ?? trimmed.toUpperCase(),

        });

        setVoucherCode('');

      } else if (r.error === 'already_used') {

        setVerifyState({

          kind: 'used',

          message: r.message ?? 'This voucher was already used.',

          usedAt: r.used_at,

        });

      } else {

        setVerifyState({

          kind: 'error',

          message: r.message ?? 'Verification failed. Check the code and try again.',

        });

      }

    } catch (ex) {

      const msg = ex instanceof Error ? ex.message : 'Could not verify voucher';

      setVerifyState({

        kind: 'error',

        message:

          msg.includes('seller_verify_loyalty') || msg.includes('schema cache')

            ? `${msg} Run the latest loyalty SQL in Supabase (schema.sql).`

            : msg,

      });

    } finally {

      setVerifyBusy(false);

    }

  }



  return (

    <div className="loyalty-layout">

      <ModulePageHeader

        title="Loyalty points"

        subtitle="Turn the loyalty promo on when you want customers to earn and redeem points."

        branch={branch}

      />

      {error ? <p className="error-text module-alert">{error}</p> : null}



      <div className="card card-flat loyalty-settings-card">

        <div className="loyalty-settings-row">

          <div className="loyalty-settings-copy">

            <h2 className="inventory-section-title">Program status</h2>

            <p className="muted-block loyalty-settings-desc">

              When <strong>Active</strong>, delivered online orders can earn points on products you mark in Inventory.

              Customers can redeem vouchers (10 points = 1 free refill code). When <strong>Off</strong>, no new points

              are awarded and redemption is paused — existing voucher codes still work at the store.

            </p>

            {!loading ? (

              <p className="loyalty-eligible-summary">

                <strong>{eligibleCount}</strong> product{eligibleCount === 1 ? '' : 's'} marked for loyalty in Inventory

                {active ? '' : ' (enable program to start earning)'}.

              </p>

            ) : null}

          </div>

          <label className={`loyalty-toggle${active ? ' loyalty-toggle--on' : ''}`}>

            <input

              type="checkbox"

              checked={active}

              disabled={loading || saving}

              onChange={(e) => void onToggle(e.target.checked)}

              aria-label="Loyalty points program active"

            />

            <span className="loyalty-toggle-track" aria-hidden />

            <span className="loyalty-toggle-label">{active ? 'Active' : 'Off'}</span>

          </label>

        </div>

        {saving ? <p className="muted-block">Saving…</p> : null}

      </div>



      <div className="card card-flat loyalty-verify-card">

        <h2 className="inventory-section-title">Verify voucher (free refill)</h2>

        <p className="muted-block loyalty-settings-desc">

          Customer shows their code from the app after redeeming 10 points. Enter the code here — if valid, it is marked{' '}

          <strong>used</strong> and you may give <strong>1 free container refill</strong>. Codes expire 3 days after issue.

        </p>

        <form className="loyalty-verify-form" onSubmit={(e) => void onVerifyVoucher(e)}>

          <div className="field loyalty-verify-field">

            <label htmlFor="voucher-code">Voucher code</label>

            <input

              id="voucher-code"

              type="text"

              value={voucherCode}

              onChange={(e) => {

                setVoucherCode(e.target.value);

                setVerifyState({ kind: 'idle' });

              }}

              placeholder="e.g. REF-A1B2C3"

              autoComplete="off"

              spellCheck={false}

              disabled={verifyBusy}

            />

          </div>

          <button type="submit" className="btn btn-primary btn-sm" disabled={verifyBusy}>

            {verifyBusy ? 'Verifying…' : 'Verify code'}

          </button>

        </form>



        {verifyState.kind === 'success' ? (

          <div className="loyalty-verify-result loyalty-verify-result--success" role="status">

            <strong>Success</strong>

            <p>{verifyState.message}</p>

            <p className="loyalty-verify-code">{verifyState.code}</p>

          </div>

        ) : null}

        {verifyState.kind === 'used' ? (

          <div className="loyalty-verify-result loyalty-verify-result--muted" role="status">

            <strong>Already used</strong>

            <p>{verifyState.message}</p>

            {verifyState.usedAt ? (

              <p className="muted-block">Used at: {new Date(verifyState.usedAt).toLocaleString('en-PH')}</p>

            ) : null}

          </div>

        ) : null}

        {verifyState.kind === 'error' ? (

          <div className="loyalty-verify-result loyalty-verify-result--error" role="alert">

            <strong>Could not verify</strong>

            <p>{verifyState.message}</p>

          </div>

        ) : null}

      </div>



      <div className="card card-flat">

        <h2 className="inventory-section-title">How it works</h2>

        <ul className="loyalty-help-list">

          <li>Turn the program <strong>Active</strong> during promos or ongoing loyalty.</li>

          <li>In <strong>Inventory</strong>, edit each product and check &quot;Available for loyalty points&quot; (only when active).</li>

          <li>1 delivered unit of an eligible product = 1 point (online orders, not utang, not walk-in POS).</li>

          <li>10 points → customer redeems a 3-day refill voucher code in the app.</li>

          <li>At the store, verify the code on this page before giving the free refill.</li>

        </ul>

      </div>

    </div>

  );

}

