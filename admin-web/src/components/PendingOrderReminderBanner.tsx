import { useNavigate } from 'react-router-dom';

import type { StalePendingOrder } from '../lib/pendingOrderReminder';

type Props = {
  orders: StalePendingOrder[];
};

export function PendingOrderReminderBanner({ orders }: Props) {
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
          <p>
            {label} Open the dashboard to review.
          </p>
        </div>
        <button
          type="button"
          className="btn btn-primary btn-sm pending-order-reminder-action"
          onClick={() => navigate('/')}
        >
          View orders
        </button>
      </div>
    </div>
  );
}
