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

function kindLabel(kind: string) {
  if (kind === 'new_order') return 'Order';
  if (kind === 'order_activity') return 'Update';
  if (kind === 'seller_registration_pending') return 'Staff';
  return 'Alert';
}

function BellIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden>
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

function CloseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function AdminNotificationsButton({ placement = 'desktop' }: { placement?: 'desktop' | 'header' }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { unreadCount, refresh, toast, dismissToast } = useNotifications();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<NotifRow | null>(null);
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
    if (!open || selected) return;
    function onDocClick(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open, selected]);

  useEffect(() => {
    if (!selected) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setSelected(null);
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [selected]);

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
    if (!n.read_at) await markRead(n.id);
    setSelected(n);
  }

  function closeDetail() {
    setSelected(null);
  }

  function goFromDetail() {
    if (!selected) return;
    const n = selected;
    setSelected(null);
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
      className={`admin-notifications-fixed admin-notifications-fixed--${placement}`}
    >
      {open ? (
        <button
          type="button"
          className="admin-notifications-backdrop"
          aria-label="Close notifications"
          onClick={() => setOpen(false)}
        />
      ) : null}

      {toast ? (
        <div className="admin-notification-popup" role="status" aria-live="polite">
          <span className="admin-notification-popup-icon" aria-hidden>
            <BellIcon />
          </span>
          <div className="admin-notification-popup-content">
            <strong>{toast.title}</strong>
            <span>{toast.body}</span>
          </div>
          <button
            type="button"
            className="admin-notification-popup-close"
            aria-label="Dismiss notification"
            onClick={dismissToast}
          >
            <CloseIcon />
          </button>
        </div>
      ) : null}

      <div className="admin-notifications">
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
            <div className="admin-notifications-panel-header">
              <div>
                <strong>Notifications</strong>
                <p className="admin-notifications-panel-hint">
                  Orders, deliveries &amp; staff requests
                </p>
              </div>
              <button type="button" className="admin-notifications-clear" onClick={() => void clearAll()}>
                Clear all
              </button>
            </div>
            {err ? <p className="error-text admin-notifications-error">{err}</p> : null}
            <div className="admin-notifications-list">
              {loading ? <p className="admin-notifications-empty">Loading…</p> : null}
              {!loading && rows.length === 0 ? (
                <p className="admin-notifications-empty">No notifications yet.</p>
              ) : null}
              {rows.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  className={`admin-notifications-item${n.read_at ? '' : ' unread'} kind-${n.kind.replace(/[^a-z0-9_-]/gi, '')}`}
                  onClick={() => void onItemClick(n)}
                >
                  <span className="admin-notifications-item-meta">
                    <span className="admin-notifications-item-tag">{kindLabel(n.kind)}</span>
                    {!n.read_at ? <span className="admin-notifications-item-new">New</span> : null}
                  </span>
                  <span className="admin-notifications-item-title">{n.title}</span>
                  <span className="admin-notifications-item-body">{n.body}</span>
                  <span className="admin-notifications-item-time">{timeLabel(n.created_at)}</span>
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      {selected ? (
        <div
          className="modal-backdrop admin-notification-detail-backdrop"
          role="presentation"
          onClick={closeDetail}
        >
          <div
            className={`modal-card admin-notification-detail-modal kind-${selected.kind.replace(/[^a-z0-9_-]/gi, '')}`}
            role="dialog"
            aria-labelledby="admin-notification-detail-title"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="admin-notification-detail-head">
              <span className="admin-notifications-item-meta">
                <span className="admin-notifications-item-tag">{kindLabel(selected.kind)}</span>
                {!selected.read_at ? <span className="admin-notifications-item-new">New</span> : null}
              </span>
              <button
                type="button"
                className="admin-notification-detail-close"
                aria-label="Close notification"
                onClick={closeDetail}
              >
                <CloseIcon />
              </button>
            </div>
            <h2 id="admin-notification-detail-title" className="admin-notification-detail-title">
              {selected.title}
            </h2>
            <p className="admin-notification-detail-body">{selected.body}</p>
            <p className="admin-notification-detail-time">{timeLabel(selected.created_at)}</p>
            <div className="admin-notification-detail-actions">
              <button type="button" className="btn btn-primary btn-sm" onClick={goFromDetail}>
                Open related page
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={closeDetail}>
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
