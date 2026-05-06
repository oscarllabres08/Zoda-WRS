import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { useAuth } from '../auth/AuthProvider';
import { supabase } from '../lib/supabase';
import logoImg from '../assets/icon.jpeg';
import { NotificationsDropdown } from '../ui/NotificationsDropdown';
import { useNotificationsUnreadCount } from '../ui/useNotificationsUnreadCount';
import { ProfilePageSkeleton, SkeletonBlock } from '../ui/Skeleton';

type OrderRow = {
  id: string;
  status: string;
  created_at: string;
  customer_name: string;
  delivery_address: string;
};

function statusLabel(s: string) {
  if (s === 'pending') return 'Pending';
  if (s === 'confirmed') return 'Confirmed';
  if (s === 'preparing') return 'Preparing';
  if (s === 'on_the_way') return 'On the way';
  if (s === 'delivered') return 'Delivered';
  if (s === 'cancelled') return 'Cancelled';
  return s;
}

export function ProfilePage() {
  const nav = useNavigate();
  const { user, loading: authLoading, signOut } = useAuth();
  const { unreadCount, refresh: refreshUnreadBadge } = useNotificationsUnreadCount();
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [profile, setProfile] = useState<{ display_name?: string | null; phone?: string | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [notifOpen, setNotifOpen] = useState(false);
  const [activeSection, setActiveSection] = useState<'profile' | 'wallets' | 'settings' | 'help'>('profile');

  useEffect(() => {
    if (!user) {
      setOrders([]);
      setProfile(null);
      setLoading(false);
      return;
    }

    const userId = user.id;
    let alive = true;
    async function load() {
      setErr(null);
      setLoading(true);
      const { data: prof } = await supabase
        .from('profiles')
        .select('display_name,phone')
        .eq('user_id', userId)
        .maybeSingle();
      if (!alive) return;
      setProfile((prof ?? null) as any);

      const { data, error } = await supabase
        .from('orders')
        .select('id,status,created_at,customer_name,delivery_address')
        .eq('customer_id', userId)
        .order('created_at', { ascending: false });
      if (!alive) return;
      if (error) setErr(error.message);
      setOrders((data ?? []) as OrderRow[]);
      setLoading(false);
    }

    load();

    const timer = window.setInterval(() => {
      load();
    }, 12000);

    const onVisible = () => {
      if (document.visibilityState === 'visible') load();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      alive = false;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [user]);

  if (authLoading) {
    return (
      <div className="page">
        <ProfilePageSkeleton />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="page">
        <header className="topbar">
          <div>
            <div className="muted">Profile</div>
            <div className="h2">Account</div>
          </div>
        </header>
        <section className="card">
          <div className="muted">Login to view your orders.</div>
          <div className="row" style={{ marginTop: 12 }}>
            <Link className="btn btn-primary" to="/auth">
              Login / Register
            </Link>
            <Link className="btn btn-ghost" to="/order">
              Order
            </Link>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="page">
      <NotificationsDropdown open={notifOpen} onClose={() => setNotifOpen(false)} onUnreadChange={refreshUnreadBadge} />
      <header className="topbar">
        <img className="brand-logo" src={logoImg} alt="Aquabeast logo" />
        <div className="brand-title brand-title-center">Aquabeast WRS</div>
        <button
          type="button"
          className="icon-btn"
          aria-label="Notifications"
          onClick={() => setNotifOpen((v) => !v)}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M12 22a2.5 2.5 0 0 0 2.45-2h-4.9A2.5 2.5 0 0 0 12 22Z"
              fill="currentColor"
            />
            <path
              d="M19 17H5a2 2 0 0 1 2-2V10a5 5 0 0 1 10 0v5a2 2 0 0 1 2 2Z"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinejoin="round"
            />
          </svg>
          {unreadCount > 0 ? (
            <span className="notif-badge" aria-label={`${unreadCount} unread notifications`}>
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          ) : null}
        </button>
      </header>

      <section
        className="card"
        style={{
          background: 'linear-gradient(180deg, rgba(26,99,255,0.95), rgba(10,69,201,0.95))',
          borderColor: 'rgba(255,255,255,0.15)',
          color: '#fff',
        }}
      >
        <div className="row" style={{ alignItems: 'center' }}>
          <div
            style={{
              width: 54,
              height: 54,
              borderRadius: 18,
              background: 'rgba(255,255,255,0.15)',
              border: '1px solid rgba(255,255,255,0.22)',
              display: 'grid',
              placeItems: 'center',
              fontWeight: 900,
            }}
          >
            {(profile?.display_name?.[0] ?? user.email?.[0] ?? 'A').toUpperCase()}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 900, letterSpacing: '-0.2px' }}>
              {profile?.display_name || 'Customer'}
            </div>
            <div style={{ opacity: 0.9, fontSize: 13, fontWeight: 700 }}>
              {profile?.phone ? `📞 ${profile.phone}` : '📞 Add phone in your profile'}
            </div>
            <div style={{ opacity: 0.92, fontSize: 13, fontWeight: 700 }}>{user.email}</div>
          </div>
        </div>
      </section>

      <section className="card">
        <button type="button" className={`profile-section-row ${activeSection === 'profile' ? 'profile-section-active' : ''}`} onClick={() => setActiveSection('profile')}>
          <span>Profile</span>
          <span className="chev">›</span>
        </button>
        <button type="button" className={`profile-section-row ${activeSection === 'wallets' ? 'profile-section-active' : ''}`} onClick={() => setActiveSection('wallets')}>
          <span>E-wallet accounts</span>
          <span className="chev">›</span>
        </button>
        <button type="button" className={`profile-section-row ${activeSection === 'settings' ? 'profile-section-active' : ''}`} onClick={() => setActiveSection('settings')}>
          <span>Account settings</span>
          <span className="chev">›</span>
        </button>
        <button type="button" className={`profile-section-row ${activeSection === 'help' ? 'profile-section-active' : ''}`} onClick={() => setActiveSection('help')}>
          <span>Help Center</span>
          <span className="chev">›</span>
        </button>
      </section>

      {activeSection === 'profile' ? (
        <section className="card">
          <div className="section-title">Profile</div>
          <div style={{ marginTop: 10 }}>
            {loading ? (
              <div className="skeleton-stack">
                <SkeletonBlock width="100%" height={72} radius={14} />
                <SkeletonBlock width="100%" height={72} radius={14} />
              </div>
            ) : err ? (
              <div className="alert alert-error">{err}</div>
            ) : orders.length === 0 ? (
              <div className="muted">No orders yet.</div>
            ) : (
              <div className="order-history">
                {orders.slice(0, 3).map((o) => (
                  <Link key={o.id} to={`/profile/orders/${o.id}`} className="order-history-card">
                    <div className="row" style={{ alignItems: 'flex-start' }}>
                      <div style={{ flex: 1 }}>
                        <div className="item-title">{o.customer_name || 'Order'}</div>
                        <div className="muted" style={{ marginTop: 2 }}>{new Date(o.created_at).toLocaleString()}</div>
                        <div className="muted" style={{ marginTop: 2 }}>{o.delivery_address}</div>
                      </div>
                      <div className={`pill pill-${o.status}`}>{statusLabel(o.status)}</div>
                      <div className="chev" aria-hidden="true">›</div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </section>
      ) : null}

      {activeSection === 'wallets' ? (
        <section className="card">
          <div className="section-title">E-wallet accounts</div>
          <div className="list" style={{ marginTop: 10 }}>
            <Link className="list-tile" to="/profile/addresses">
              <div style={{ flex: 1 }}>
                <div className="item-title">Saved payment details</div>
                <div className="muted">Manage GCash, Maya, and other payment details</div>
              </div>
              <div className="chev">›</div>
            </Link>
            <div className="list-tile">
              <div style={{ flex: 1 }}>
                <div className="item-title">Primary account</div>
                <div className="muted">Set your default e-wallet for faster checkout</div>
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {activeSection === 'settings' ? (
        <section className="card">
          <div className="section-title">Account settings</div>
          <div className="list" style={{ marginTop: 10 }}>
            <Link className="list-tile" to="/profile/edit">
              <div style={{ flex: 1 }}>
                <div className="item-title">Edit profile</div>
                <div className="muted">Update name and phone</div>
              </div>
              <div className="chev">›</div>
            </Link>
            <Link className="list-tile" to="/profile/password">
              <div style={{ flex: 1 }}>
                <div className="item-title">Change password</div>
                <div className="muted">Secure your account</div>
              </div>
              <div className="chev">›</div>
            </Link>
            <button
              className="btn btn-ghost"
              onClick={async () => {
                await signOut();
                nav('/');
              }}
            >
              Logout
            </button>
          </div>
        </section>
      ) : null}

      {activeSection === 'help' ? (
        <section className="card">
          <div className="section-title">Help Center</div>
          <div className="list" style={{ marginTop: 10 }}>
            <div className="list-tile">
              <div style={{ flex: 1 }}>
                <div className="item-title">Developer team</div>
                <div className="muted">Aquabeast WRS Dev Team</div>
              </div>
            </div>
            <div className="list-tile">
              <div style={{ flex: 1 }}>
                <div className="item-title">Email</div>
                <div className="muted">aquabeastwrs.dev@gmail.com</div>
              </div>
            </div>
            <div className="list-tile">
              <div style={{ flex: 1 }}>
                <div className="item-title">Phone</div>
                <div className="muted">+63 912 345 6789</div>
              </div>
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}

