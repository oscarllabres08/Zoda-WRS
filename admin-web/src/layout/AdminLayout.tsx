import { useCallback, useEffect, useMemo, useState } from 'react';

import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';



import { useAuth } from '../auth/AuthProvider';
import { AdminNotificationsButton } from '../components/AdminNotificationsButton';
import { useBusinessMode, type BusinessMode } from '../business/BusinessModeProvider';
import { supabase } from '../lib/supabase';



type NavIconId =

  | 'dashboard'

  | 'pos'

  | 'inventory'

  | 'loyalty'

  | 'sales'

  | 'staff'

  | 'customers'

  | 'expenses'

  | 'settings'

  | 'signout';



function NavIcon({ id }: { id: NavIconId }) {

  const common = { width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none', 'aria-hidden': true as const };

  switch (id) {

    case 'dashboard':

      return (

        <svg {...common}>

          <path

            d="M4 13h6V4H4v9zm0 7h6v-5H4v5zm10 0h6V11h-6v9zm0-16v5h6V4h-6z"

            stroke="currentColor"

            strokeWidth="1.8"

            strokeLinejoin="round"

          />

        </svg>

      );

    case 'pos':

      return (

        <svg {...common}>

          <rect x="3" y="6" width="18" height="13" rx="2.5" stroke="currentColor" strokeWidth="1.8" />

          <path d="M7 10h10M7 14h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />

        </svg>

      );

    case 'inventory':

      return (

        <svg {...common}>

          <path

            d="M12 3L4 7v10l8 4 8-4V7l-8-4z"

            stroke="currentColor"

            strokeWidth="1.8"

            strokeLinejoin="round"

          />

          <path d="M4 7l8 4 8-4M12 11v10" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />

        </svg>

      );

    case 'loyalty':

      return (

        <svg {...common}>

          <path

            d="M12 3l2.4 4.9 5.4.8-3.9 3.8.9 5.4L12 15.8 7.2 18l.9-5.4-3.9-3.8 5.4-.8L12 3z"

            stroke="currentColor"

            strokeWidth="1.8"

            strokeLinejoin="round"

          />

        </svg>

      );

    case 'sales':

      return (

        <svg {...common}>

          <path d="M4 19V5M4 19h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />

          <path

            d="M7 15l3-4 3 2 5-7"

            stroke="currentColor"

            strokeWidth="1.8"

            strokeLinecap="round"

            strokeLinejoin="round"

          />

        </svg>

      );

    case 'staff':

      return (

        <svg {...common}>

          <circle cx="9" cy="8" r="3" stroke="currentColor" strokeWidth="1.8" />

          <path d="M3 19c0-3.3 2.7-5 6-5s6 1.7 6 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />

          <circle cx="17" cy="9" r="2.2" stroke="currentColor" strokeWidth="1.6" />

          <path d="M14.5 19c.3-2.2 1.8-3.5 4-3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />

        </svg>

      );

    case 'customers':

      return (

        <svg {...common}>

          <circle cx="12" cy="8" r="3.5" stroke="currentColor" strokeWidth="1.8" />

          <path d="M5 20c0-3.9 3.1-7 7-7s7 3.1 7 7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />

        </svg>

      );

    case 'expenses':

      return (

        <svg {...common}>

          <path d="M6 4h12v16H6V4z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />

          <path d="M9 8h6M9 12h6M9 16h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />

        </svg>

      );

    case 'settings':

      return (

        <svg {...common}>

          <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" />

          <path

            d="M12 2v2M12 20v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M2 12h2M20 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4"

            stroke="currentColor"

            strokeWidth="1.8"

            strokeLinecap="round"

          />

        </svg>

      );

    case 'signout':

      return (

        <svg {...common}>

          <path d="M10 7V5a2 2 0 012-2h7v18h-7a2 2 0 01-2-2v-2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />

          <path d="M14 12H3m0 0l3-3m-3 3l3 3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />

        </svg>

      );

    default:

      return null;

  }

}



function MenuIcon({ open }: { open: boolean }) {

  return (

    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>

      {open ? (

        <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />

      ) : (

        <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />

      )}

    </svg>

  );

}



const NAV_WRS = [

  { to: '/', label: 'Dashboard', end: true, icon: 'dashboard' as const },

  { to: '/pos', label: 'POS', icon: 'pos' as const },

  { to: '/inventory', label: 'Inventory', icon: 'inventory' as const },

  { to: '/loyalty', label: 'Loyalty points', icon: 'loyalty' as const },

  { to: '/sales', label: 'Sales & Analytics', icon: 'sales' as const },

  { to: '/expenses', label: 'Expenses', icon: 'expenses' as const },

  { to: '/staff', label: 'Staff management', icon: 'staff' as const },

  { to: '/customers', label: 'Customer list', icon: 'customers' as const },

  { to: '/settings', label: 'Settings', icon: 'settings' as const },

] as const;

const NAV_LAUNDRY = [

  { to: '/laundry/dashboard', label: 'Dashboard', end: true, icon: 'dashboard' as const },

  { to: '/laundry/pos', label: 'POS', icon: 'pos' as const },

  { to: '/laundry/services', label: 'Services', icon: 'inventory' as const },

  { to: '/laundry/sales', label: 'Sales & Analytics', icon: 'sales' as const },

  { to: '/laundry/expenses', label: 'Expenses', icon: 'expenses' as const },

  { to: '/settings', label: 'Settings', icon: 'settings' as const },

] as const;



export function AdminLayout() {

  const { user, profile, businessId, signOut } = useAuth();

  const { setMode, isLaundry } = useBusinessMode();

  const navigate = useNavigate();

  const location = useLocation();

  const NAV = isLaundry ? NAV_LAUNDRY : NAV_WRS;

  const [pendingOrders, setPendingOrders] = useState(0);

  const [navOpen, setNavOpen] = useState(false);

  const wideMain =
    location.pathname === '/pos' ||
    location.pathname === '/inventory' ||
    location.pathname === '/sales' ||
    location.pathname.startsWith('/laundry/');



  useEffect(() => {

    setNavOpen(false);

  }, [location.pathname]);



  useEffect(() => {

    if (!navOpen) return;

    const prev = document.body.style.overflow;

    document.body.style.overflow = 'hidden';

    return () => {

      document.body.style.overflow = prev;

    };

  }, [navOpen]);



  const loadPending = useCallback(async () => {

    if (!businessId) return;

    const { count, error } = await supabase

      .from('orders')

      .select('id', { count: 'exact', head: true })

      .eq('seller_id', businessId)

      .eq('status', 'pending');

    if (!error) setPendingOrders(count ?? 0);

  }, [businessId]);



  useEffect(() => {

    void loadPending();

    if (!businessId) return;

    const ch = supabase

      .channel(`admin-orders-${businessId}`)

      .on(

        'postgres_changes',

        { event: '*', schema: 'public', table: 'orders', filter: `seller_id=eq.${businessId}` },

        () => void loadPending()

      )

      .subscribe();

    return () => {

      supabase.removeChannel(ch);

    };

  }, [businessId, loadPending]);



  async function handleSignOut() {

    await signOut();

    navigate('/auth', { replace: true });

  }



  const displayName = profile?.display_name?.trim() || user?.email || 'Store owner';

  const userInitial = useMemo(() => (displayName.trim()[0] ?? 'Z').toUpperCase(), [displayName]);



  const activeNavLabel = NAV.find((item) =>

    item.to === '/' ? location.pathname === '/' : location.pathname.startsWith(item.to)

  )?.label;

  function switchBusiness(next: BusinessMode) {

    setMode(next);

    navigate(next === 'laundry' ? '/laundry/dashboard' : '/');

  }



  return (

    <div className={`admin-shell${navOpen ? ' admin-shell--nav-open' : ''}`}>

      <header className="admin-mobile-bar">

        <button

          type="button"

          className="admin-menu-btn"

          aria-expanded={navOpen}

          aria-controls="admin-sidebar"

          aria-label={navOpen ? 'Close menu' : 'Open menu'}

          onClick={() => setNavOpen((v) => !v)}

        >

          <MenuIcon open={navOpen} />

        </button>

        <div className="admin-mobile-bar-brand">

          <img src="/logo.png" alt="" className="admin-mobile-bar-logo" />

          <div className="admin-mobile-bar-text">

            <span className="admin-mobile-bar-title">{isLaundry ? 'Zoda Laundry' : 'Zoda WRS'}</span>

            <span className="admin-mobile-bar-page">{activeNavLabel ?? 'Admin'}</span>

          </div>

        </div>

        <div className="admin-mobile-bar-actions">

          {pendingOrders > 0 ? <span className="admin-mobile-bar-badge">{pendingOrders}</span> : null}

          <AdminNotificationsButton placement="header" />

        </div>

      </header>



      <button

        type="button"

        className="admin-nav-backdrop"

        aria-hidden={!navOpen}

        tabIndex={navOpen ? 0 : -1}

        onClick={() => setNavOpen(false)}

      />



      <aside id="admin-sidebar" className="admin-sidebar">

        <div className="admin-sidebar-glow" aria-hidden />

        <div className="admin-sidebar-inner">

        <div className="admin-brand">

          <div className="admin-brand-logo-wrap">

            <img src="/logo.png" alt="Zoda WRS" className="admin-brand-logo" />

          </div>

          <div>

            <div className="admin-brand-title">{isLaundry ? 'Zoda Laundry' : 'Zoda WRS'}</div>

            <div className="admin-brand-sub">{isLaundry ? 'Laundry admin' : 'Admin · Seller · Customer'}</div>

          </div>

        </div>



        <div className="business-mode-switch">
          {isLaundry ? (
            <button type="button" className="btn btn-ghost btn-sm btn-block" onClick={() => switchBusiness('wrs')}>
              Switch to Water Refilling Station
            </button>
          ) : (
            <button type="button" className="btn btn-ghost btn-sm btn-block" onClick={() => switchBusiness('laundry')}>
              Switch to Laundry
            </button>
          )}
        </div>

        <div className="admin-sidebar-body">

          <p className="admin-nav-section-label">Main menu</p>

          <nav className="admin-nav" aria-label="Main">

            {NAV.map((item) => (

              <NavLink

                key={item.to}

                to={item.to}

                end={'end' in item ? item.end : false}

                className={({ isActive }) => (isActive ? 'admin-nav-link active' : 'admin-nav-link')}

                onClick={() => setNavOpen(false)}

              >

                <span className="admin-nav-link-inner">

                  <span className="admin-nav-icon-wrap">

                    <NavIcon id={item.icon} />

                  </span>

                  <span className="admin-nav-label">{item.label}</span>

                </span>

                {item.to === '/' && pendingOrders > 0 ? <span className="admin-badge">{pendingOrders}</span> : null}

              </NavLink>

            ))}

          </nav>

          <div className="admin-sidebar-foot">

            <div className="admin-user-row">

              <span className="admin-user-avatar" aria-hidden>

                {userInitial}

              </span>

              <div className="admin-user-meta">

                <span className="admin-user-role">Store owner</span>

                <span className="admin-user">{displayName}</span>

              </div>

            </div>

            <button type="button" className="btn btn-sidebar-signout btn-sm" onClick={() => void handleSignOut()}>

              <NavIcon id="signout" />

              Sign out

            </button>

          </div>

        </div>

        </div>

      </aside>



      <main className="admin-main">

        <div className={`admin-main-inner${wideMain ? ' admin-main-inner--wide' : ''}`}>

          <Outlet context={{ pendingOrders, refreshPending: loadPending }} />

        </div>

      </main>

      <AdminNotificationsButton placement="desktop" />

    </div>

  );

}


