import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { useAuth } from '../auth/AuthProvider';
import { navigateFromAdminNotification } from '../lib/notificationNavigation';
import { supabase } from '../lib/supabase';
import { useNotifications } from '../notifications/NotificationsProvider';

type NotifRow = {
  id: string;
  kind: string;
  title: string;
  body: string;
  created_at: string;
  read_at: string | null;
  data: Record<string, unknown> | null;
  order_id: string | null;
};

function timeLabel(iso: string) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function BellIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 3a5 5 0 0 0-5 5v2.1c0 .5-.2 1-.5 1.4L5.1 14.2A1 1 0 0 0 6 16h12a1 1 0 0 0 .9-1.8l-1.4-2.7c-.3-.4-.5-.9-.5-1.4V8a5 5 0 0 0-5-5z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path d="M10 18a2 2 0 0 0 4 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function AdminNotificationsButton({ variant = 'sidebar' }: { variant?: 'sidebar' | 'mobile' }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { unreadCount, refresh } = useNotifications();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<NotifRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    if (!user?.id) return;
    setErr(null);
    setLoading(true);
    const { data, error } = await supabase
      .from('notifications')
      .select('id,kind,title,body,created_at,read_at,data,order_id')
      .eq('recipient_id', user.id)
      .order('created_at', { ascending: false })
      .limit(40);
    if (error) setErr(error.message);
    setRows((data ?? []) as NotifRow[]);
    setLoading(false);
  }, [user?.id]);

  useEffect(() => {
    if (!open) return;
    void load();
  }, [open, unreadCount, load]);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  const localUnread = useMemo(() => rows.filter((r) => !r.read_at).length, [rows]);
  const badge = Math.max(unreadCount, localUnread);

  async function markRead(id: string) {
    if (!user?.id) return false;
    const now = new Date().toISOString();
    const { error } = await supabase.from('notifications').update({ read_at: now }).eq('id', id).eq('recipient_id', user.id);
    if (error) {
      setErr(error.message);
      return false;
    }
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, read_at: now } : r)));
    await refresh();
    return true;
  }

  async function clearAll() {
    if (!user?.id) return;
    const { error } = await supabase.from('notifications').delete().eq('recipient_id', user.id);
    if (error) setErr(error.message);
    else setRows([]);
    await refresh();
  }

  async function onItemClick(n: NotifRow) {
    await markRead(n.id);
    setOpen(false);
    navigateFromAdminNotification(navigate, {
      kind: n.kind,
      order_id: n.order_id,
      data: n.data,
    });
  }

  return (
    <div
      ref={rootRef}
      className={`admin-notifications${variant === 'mobile' ? ' admin-notifications--mobile' : ''}`}
    >
      <button
        type="button"
        className="admin-notifications-btn"
        aria-label={badge ? `${badge} unread notifications` : 'Notifications'}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <BellIcon />
        {badge > 0 ? <span className="admin-notifications-badge">{badge > 99 ? '99+' : badge}</span> : null}
      </button>

      {open ? (
        <div className="admin-notifications-panel" role="dialog" aria-label="Notifications">
          <div className="admin-notifications-panel-head">
            <strong>Notifications</strong>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => void clearAll()}>
              Clear all
            </button>
          </div>
          <p className="admin-notifications-panel-hint">
            New orders, delivery updates, and staff registrations from Seller &amp; Customer apps.
          </p>
          {err ? <p className="error-text admin-notifications-error">{err}</p> : null}
          <div className="admin-notifications-list">
            {loading ? <p className="hint">Loading…</p> : null}
            {!loading && rows.length === 0 ? (
              <p className="hint" style={{ margin: 0 }}>
                No notifications yet.
              </p>
            ) : null}
            {rows.map((n) => (
              <button
                key={n.id}
                type="button"
                className={`admin-notifications-item${n.read_at ? '' : ' unread'}`}
                onClick={() => void onItemClick(n)}
              >
                <span className="admin-notifications-item-title">{n.title}</span>
                <span className="admin-notifications-item-body">{n.body}</span>
                <span className="admin-notifications-item-time">{timeLabel(n.created_at)}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function AdminNotificationToast() {
  const { toast, dismissToast } = useNotifications();
  const navigate = useNavigate();

  if (!toast) return null;

  return (
    <button
      type="button"
      className="admin-notification-toast"
      onClick={() => {
        dismissToast();
        navigateFromAdminNotification(navigate, {
          kind: toast.kind,
          order_id: toast.orderId,
        });
      }}
    >
      <strong>{toast.title}</strong>
      <span>{toast.body}</span>
    </button>
  );
}
