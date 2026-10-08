import type { NavigateFunction } from 'react-router-dom';

type NotifNavInput = {
  kind: string;
  order_id?: string | null;
  data?: Record<string, unknown> | null;
};

export function navigateFromAdminNotification(navigate: NavigateFunction, n: NotifNavInput) {
  const kind = String(n.kind ?? (n.data?.kind as string | undefined) ?? '');
  if (kind === 'seller_registration_pending') {
    navigate('/staff');
    return;
  }
  if (kind === 'new_order' || kind === 'order_activity' || kind === 'pending_order_reminder' || n.order_id) {
    navigate('/');
    return;
  }
  navigate('/');
}
