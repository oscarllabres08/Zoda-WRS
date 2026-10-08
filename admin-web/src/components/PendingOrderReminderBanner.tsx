import { useNavigate } from 'react-router-dom';

import type { StalePendingOrder } from '../lib/pendingOrderReminder';

type Props = {
  orders: StalePendingOrder[];
  onDismiss: () => void;
};

function CloseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function PendingOrderReminderBanner({ orders, onDismiss }: Props) {
  const navigate = useNavigate();
  if (orders.length === 0) return null;

  const count = orders.length;
  const first = orders[0];
  const label =
    count === 1
      ? `${first.customer_name?.trim() || 'Customer'}'s order is still pending (30+ min unopened).`
      : `${count} customer orders are still pending (30+ min unopened).`;

  return (
    <div className="pending-order-reminder-banner" role="alert">
      <div className="pending-order-reminder-banner-inner">
        <span className="pending-order-reminder-icon" aria-hidden>
          ⚠
        </span>
        <div className="pending-order-reminder-copy">
          <strong>Pending order reminder</strong>
          <p>{label} Open the dashboard to review.</p>
        </div>
        <div className="pending-order-reminder-actions">
          <button
            type="button"
            className="btn btn-primary btn-sm pending-order-reminder-action"
            onClick={() => navigate('/')}
          >
            View orders
          </button>
          <button
            type="button"
            className="pending-order-reminder-close"
            aria-label="Dismiss reminder for 30 minutes"
            onClick={onDismiss}
          >
            <CloseIcon />
          </button>
        </div>
      </div>
    </div>
  );
}
