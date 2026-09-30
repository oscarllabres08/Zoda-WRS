import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useNotifications } from '../../providers/NotificationsProvider';
import { theme } from '../theme';
import { Text } from './Text';
import { NotificationsMenu } from './NotificationsMenu';

export function SellerNotificationsButton() {
  const { unreadCount } = useNotifications();
  const [open, setOpen] = useState(false);

  return (
    <>
      <NotificationsMenu visible={open} onClose={() => setOpen(false)} />
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel="Notifications"
        style={{
          width: 44,
          height: 44,
          borderRadius: 14,
          backgroundColor: '#FFFFFF',
          borderWidth: 1,
          borderColor: theme.colors.border,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Ionicons name="notifications-outline" size={22} color={theme.colors.primary} />
        {unreadCount > 0 ? (
          <View
            style={{
              position: 'absolute',
              top: 6,
              right: 6,
              minWidth: 18,
              height: 18,
              borderRadius: 999,
              backgroundColor: theme.colors.danger,
              alignItems: 'center',
              justifyContent: 'center',
              paddingHorizontal: 4,
              borderWidth: 2,
              borderColor: '#FFFFFF',
            }}
          >
            <Text variant="chip" weight="extrabold" style={{ color: '#FFF', fontSize: 10 }}>
              {unreadCount > 99 ? '99+' : unreadCount}
            </Text>
          </View>
        ) : null}
      </Pressable>
    </>
  );
}
