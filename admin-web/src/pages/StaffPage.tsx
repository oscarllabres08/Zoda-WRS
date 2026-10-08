import { useCallback, useEffect, useMemo, useState } from 'react';

import { useAuth } from '../auth/AuthProvider';
import { supabase } from '../lib/supabase';

type Row = {
  user_id: string;
  display_name: string | null;
  email: string | null;
  phone: string | null;
  seller_join_status: string | null;
  created_at: string;
};

export function StaffPage() {
  const { user, businessId, refreshProfile } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user?.id || !businessId) return;
    setLoading(true);
    setError(null);

    const { data, error: qErr } = await supabase.rpc('owner_list_workspace_staff');
    if (!qErr) {
      const list = (Array.isArray(data) ? data : (data ?? [])) as Row[];
      setRows(list);
      setLoading(false);
      return;
    }

    // Fallback when RPC patch not applied yet — still show pending staff.
    const { data: fallback, error: fbErr } = await supabase
      .from('profiles')
      .select('user_id,display_name,phone,seller_join_status,created_at')
      .eq('seller_workspace_owner_id', businessId)
      .eq('seller_team_role', 'staff')
      .order('created_at', { ascending: false });

    if (fbErr) {
      setError(qErr.message || fbErr.message);
      setRows([]);
    } else {
      setRows(
        (fallback ?? []).map((r) => ({
          ...(r as Omit<Row, 'email'>),
          email: null,
        }))
      );
      if (qErr.message.includes('owner_list_workspace_staff')) {
        setError('Staff list loaded without email. Run supabase/patches/fix-staff-pending-approval.sql in Supabase.');
      }
    }
    setLoading(false);
  }, [user?.id, businessId]);

  useEffect(() => {
    void load();
    if (!businessId) return;
    const ch = supabase
      .channel(`admin-staff-${businessId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'profiles', filter: `seller_workspace_owner_id=eq.${businessId}` },
        () => void load()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [businessId, load]);

  async function setStatus(applicantUserId: string, status: 'approved' | 'rejected') {
    setBusyId(applicantUserId);
    setError(null);
    try {
      const { data, error: uErr } = await supabase.rpc('owner_set_staff_join_status', {
        p_staff_user_id: applicantUserId,
        p_status: status,
      });
      if (uErr) throw uErr;
      const res = data as { ok?: boolean } | null;
      if (res && res.ok === false) throw new Error('Could not update this account.');
      await load();
      void refreshProfile();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Update failed');
    } finally {
      setBusyId(null);
    }
  }

  async function deleteAccount(staffUserId: string) {
    if (!window.confirm('Remove this staff account? They will lose Seller app access.')) return;
    setBusyId(staffUserId);
    setError(null);
    try {
      const { data, error: delErr } = await supabase.rpc('owner_delete_staff_account', {
        p_staff_user_id: staffUserId,
      });
      if (delErr) throw delErr;
      const res = data as { ok?: boolean; message?: string; error?: string } | null;
      if (res && res.ok === false) throw new Error(res.message ?? res.error ?? 'Delete failed');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed');
    } finally {
      setBusyId(null);
    }
  }

  const pending = useMemo(() => rows.filter((r) => r.seller_join_status === 'pending'), [rows]);
  const approved = useMemo(() => rows.filter((r) => r.seller_join_status === 'approved'), [rows]);

  return (
    <>
      <header className="page-header">
        <h1>Staff Management</h1>
        <p>Approve staff who register in the Seller mobile app — they share this store&apos;s orders and customers.</p>
      </header>
      {error ? <p className="error-text">{error}</p> : null}
      {loading ? <p>Loading…</p> : null}

      <div className="card">
        <h2 style={{ margin: '0 0 10px', fontSize: 17 }}>Pending approval ({pending.length})</h2>
        {pending.length === 0 ? (
          <p style={{ color: 'var(--muted)', fontWeight: 600 }}>No pending registrations.</p>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Contact No.</th>
                  <th>Registered</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {pending.map((r) => (
                  <tr key={r.user_id}>
                    <td>{r.display_name ?? '—'}</td>
                    <td>{r.email ?? '—'}</td>
                    <td>{r.phone ?? '—'}</td>
                    <td>{new Date(r.created_at).toLocaleDateString()}</td>
                    <td>
                      <div className="row-actions">
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          disabled={busyId === r.user_id}
                          onClick={() => void setStatus(r.user_id, 'approved')}
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          className="btn btn-danger btn-sm"
                          disabled={busyId === r.user_id}
                          onClick={() => void setStatus(r.user_id, 'rejected')}
                        >
                          Reject
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card">
        <h2 style={{ margin: '0 0 10px', fontSize: 17 }}>Active staff ({approved.length})</h2>
        {approved.length === 0 ? (
          <p style={{ color: 'var(--muted)', fontWeight: 600 }}>No approved staff yet.</p>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Contact No.</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {approved.map((r) => (
                  <tr key={r.user_id}>
                    <td>{r.display_name ?? '—'}</td>
                    <td>{r.email ?? '—'}</td>
                    <td>{r.phone ?? '—'}</td>
                    <td>
                      <button
                        type="button"
                        className="btn btn-danger btn-sm"
                        disabled={busyId === r.user_id}
                        onClick={() => void deleteAccount(r.user_id)}
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
