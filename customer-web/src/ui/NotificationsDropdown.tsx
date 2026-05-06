import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { supabase } from '../lib/supabase';
import { useAuth } from '../auth/AuthProvider';

type NotifRow = {
  id: string;
  title: string;
  body: string;
  created_at: string;
  read_at: string | null;
  data: any;
  order_id: string | null;
};

function timeLabel(iso: string) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export function NotificationsDropdown({
  open,
  onClose,
  onUnreadChange,
}: {
  open: boolean;
  onClose: () => void;
  /** Refresh header badge after read/clear (same instance as ProfilePage unread hook). */
  onUnreadChange?: () => void;
}) {
  const nav = useNavigate();
  const { user } = useAuth();
  const [rows, setRows] = useState<NotifRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const didAskPermRef = useRef(false);

  async function load() {
    if (!user) return;
    setErr(null);
    setLoading(true);
    const { data, error } = await supabase
      .from('notifications')
      .select('id,title,body,created_at,read_at,data,order_id')
      .eq('recipient_id', user.id)
      .order('created_at', { ascending: false })
      .limit(30);
    if (error) setErr(error.message);
    setRows((data ?? []) as NotifRow[]);
    setLoading(false);
  }

  useEffect(() => {
    if (!open) return;
    load();
    // Ask permission once (best-effort)
    if (!didAskPermRef.current && typeof window !== 'undefined' && 'Notification' in window) {
      didAskPermRef.current = true;
      if (Notification.permission === 'default') {
        Notification.requestPermission().catch(() => {});
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, user?.id]);

  useEffect(() => {
    if (!user) return;
    const timer = window.setInterval(() => {
      load();
    }, 12000);

    const onVisible = () => {
      if (document.visibilityState === 'visible') load();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const unread = useMemo(() => rows.filter((r) => !r.read_at).length, [rows]);

  async function markRead(id: string): Promise<boolean> {
    if (!user) return false;
    const readAt = new Date().toISOString();
    const { error } = await supabase
      .from('notifications')
      .update({ read_at: readAt })
      .eq('id', id)
      .eq('recipient_id', user.id);
    if (error) {
      setErr(error.message);
      window.alert(`Could not mark as read: ${error.message}`);
      return false;
    }
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, read_at: readAt } : r)));
    onUnreadChange?.();
    return true;
  }

  async function clearAll() {
    if (!user) return;
    setErr(null);
    const { error } = await supabase.from('notifications').delete().eq('recipient_id', user.id);
    if (error) {
      setErr(error.message);
      return;
    }
    setRows([]);
    onUnreadChange?.();
  }

  if (!open) return null;

  return (
    <div className="notif-popover-wrap" role="dialog" aria-label="Notifications">
      <button className="notif-backdrop" type="button" onClick={onClose} aria-label="Close notifications" />
      <div className="notif-popover">
        <div className="notif-head">
          <div>
            <div className="section-title">Notifications</div>
            <div className="muted">{unread ? `${unread} unread` : 'All caught up'}</div>
          </div>
          <div className="spacer" />
          <button className="btn btn-ghost" type="button" onClick={clearAll}>
            Clear
          </button>
        </div>

        <div className="divider" />

        <div className="notif-list">
          {loading ? <div className="muted">Loading…</div> : null}
          {err ? <div className="alert alert-error">{err}</div> : null}
          {!loading && !err && rows.length === 0 ? <div className="muted">No notifications yet.</div> : null}

          {rows.map((n) => {
            const orderId = (n.order_id ?? n.data?.orderId) as string | undefined;
            return (
              <button
                key={n.id}
                type="button"
                className={`notif-item ${n.read_at ? '' : 'notif-item-unread'}`.trim()}
                onClick={async () => {
                  const ok = await markRead(n.id);
                  if (!ok) return;
                  onClose();
                  if (orderId) nav(`/profile/orders/${orderId}`);
                  else nav('/order');
                }}
              >
                <div className="notif-dot2" aria-hidden="true" />
                <div style={{ flex: 1, textAlign: 'left' }}>
                  <div className="item-title">{n.title}</div>
                  <div className="muted" style={{ marginTop: 2 }}>
                    {n.body}
                  </div>
                  <div className="muted" style={{ marginTop: 6, fontSize: 12, fontWeight: 800 }}>
                    {timeLabel(n.created_at)}
                  </div>
                </div>
                <div className="chev" aria-hidden="true">
                  ›
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

