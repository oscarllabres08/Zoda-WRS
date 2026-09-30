import { Navigate, Route, Routes } from 'react-router-dom';

import { useAuth } from './auth/AuthProvider';
import { AdminLayout } from './layout/AdminLayout';
import { AuthPage } from './pages/AuthPage';
import { CustomersPage } from './pages/CustomersPage';
import { DashboardPage } from './pages/DashboardPage';
import { InventoryPage } from './pages/InventoryPage';
import { LoyaltyPage } from './pages/LoyaltyPage';
import { PosPage } from './pages/PosPage';
import { SalesPage } from './pages/SalesPage';
import { StaffPage } from './pages/StaffPage';
import { LaundryPosPage } from './pages/LaundryPosPage';
import { LaundrySalesPage } from './pages/LaundrySalesPage';
import { LaundryServicesPage } from './pages/LaundryServicesPage';

function ProtectedAdmin() {
  const { user, loading, profileLoading, isStoreOwner } = useAuth();

  if (loading || profileLoading) {
    return (
      <div className="auth-page">
        <p style={{ fontWeight: 700 }}>Loading admin session…</p>
      </div>
    );
  }

  if (!user || !isStoreOwner) {
    return <Navigate to="/auth" replace />;
  }

  return <AdminLayout />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/auth" element={<AuthPage />} />
      <Route element={<ProtectedAdmin />}>
        <Route index element={<DashboardPage />} />
        <Route path="staff" element={<StaffPage />} />
        <Route path="pos" element={<PosPage />} />
        <Route path="inventory" element={<InventoryPage />} />
        <Route path="loyalty" element={<LoyaltyPage />} />
        <Route path="sales" element={<SalesPage />} />
        <Route path="analytics" element={<Navigate to="/sales" replace />} />
        <Route path="customers" element={<CustomersPage />} />
        <Route path="laundry">
          <Route index element={<Navigate to="/laundry/pos" replace />} />
          <Route path="pos" element={<LaundryPosPage />} />
          <Route path="services" element={<LaundryServicesPage />} />
          <Route path="sales" element={<LaundrySalesPage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
