import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import type { StalePendingOrder } from '../../lib/pendingOrderReminder';
import { Text } from './Text';
import { theme } from '../theme';

type Props = {
  orders: StalePendingOrder[];
  topInset: number;
  onDismiss: () => void;
};

export function PendingOrderReminderBanner({ orders, topInset, onDismiss }: Props) {
  const router = useRouter();
  if (orders.length === 0) return null;

  const count = orders.length;
  const first = orders[0];
  const label =
    count === 1
      ? `${first.customer_name?.trim() || 'Customer'}'s order is still pending (30+ min unopened).`
      : `${count} customer orders are still pending (30+ min unopened).`;

  return (
    <View
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        top: Math.max(topInset, 8),
        alignItems: 'center',
        zIndex: 50,
      }}
    >
      <View
        style={{
          width: '94%',
          maxWidth: 420,
          borderRadius: 14,
          backgroundColor: '#FEF3C7',
          borderWidth: 1.5,
          borderColor: '#F59E0B',
          paddingVertical: 11,
          paddingHorizontal: 12,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          shadowColor: theme.shadow.ink,
          shadowOpacity: 0.1,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 6 },
          elevation: 5,
        }}
      >
        <Pressable
          onPress={() => {
            if (count === 1) router.push(`/order/${first.id}`);
            else router.push('/(tabs)/orders');
          }}
          style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 0 }}
        >
          <Ionicons name="alert-circle" size={22} color="#B45309" />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text weight="extrabold" style={{ fontSize: 13, color: '#92400E' }}>
              Pending order reminder
            </Text>
            <Text style={{ marginTop: 2, fontSize: 12, lineHeight: 16, color: '#78350F' }} numberOfLines={3}>
              {label} Tap to open order details.
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#B45309" />
        </Pressable>
        <Pressable
          onPress={onDismiss}
          accessibilityLabel="Dismiss reminder for 30 minutes"
          hitSlop={8}
          style={({ pressed }) => ({
            width: 28,
            height: 28,
            borderRadius: 8,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: pressed ? 'rgba(180, 83, 9, 0.18)' : 'rgba(180, 83, 9, 0.1)',
          })}
        >
          <Ionicons name="close" size={18} color="#B45309" />
        </Pressable>
      </View>
    </View>
  );
}
