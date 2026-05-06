import { useCallback } from 'react';
import { Tabs } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';

import { useNotifications } from '../../providers/NotificationsProvider';
import { theme } from '../../ui/theme';
import { AnimatedTabBar } from '../../ui/components/AnimatedTabBar';

function NotificationsBadgeSync() {
  const { refresh } = useNotifications();
  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh])
  );
  return null;
}

export default function TabLayout() {
  return (
    <>
      <NotificationsBadgeSync />
      <Tabs
      tabBar={(props) => <AnimatedTabBar {...props} />}
      screenOptions={{
        tabBarActiveTintColor: theme.colors.primary,
        headerShown: false,
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Home' }} />
      <Tabs.Screen name="order" options={{ title: 'Order' }} />
      <Tabs.Screen name="rewards" options={{ title: 'Vouchers', tabBarLabel: 'Vouchers' }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
      </Tabs>
    </>
  );
}

