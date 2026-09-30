import { Alert } from 'react-native';
import type { Router } from 'expo-router';

type NotifPayload = {
  order_id?: string | null;
  kind?: string;
  data?: { orderId?: string; kind?: string; type?: string };
};

export function navigateFromSellerNotification(router: Router, n: NotifPayload) {
  const orderId = (n.order_id ?? n.data?.orderId) as string | undefined;
  const kind = (n.kind ?? n.data?.kind ?? n.data?.type) as string | undefined;

  if (kind === 'seller_registration_pending') {
    Alert.alert(
      'Staff registration',
      'Approve or reject staff in the Zoda WRS Admin website (Staff Management).'
    );
    router.push('/(tabs)/notifications');
    return;
  }

  if (orderId) {
    router.push(`/order/${orderId}`);
    return;
  }

  router.push('/(tabs)/orders');
}
