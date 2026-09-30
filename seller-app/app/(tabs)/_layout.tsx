import { Tabs } from 'expo-router';
import type { ParamListBase, RouteProp } from '@react-navigation/native';
import { getFocusedRouteNameFromRoute } from '@react-navigation/native';

import { useColorScheme } from '@/components/useColorScheme';
import { theme } from '../../ui/theme';
import { AnimatedTabBar } from '../../ui/components/AnimatedTabBar';

function profileTabBarStyle(route: Partial<RouteProp<ParamListBase>>) {
  const routeName = getFocusedRouteNameFromRoute(route as RouteProp<ParamListBase>) ?? 'index';
  if (routeName === 'index') return undefined;
  return { display: 'none' as const };
}

export default function TabLayout() {
  useColorScheme();

  return (
    <Tabs
      initialRouteName="orders"
      tabBar={(props) => <AnimatedTabBar {...props} />}
      screenOptions={{
        tabBarActiveTintColor: theme.colors.primary,
        headerShown: false,
      }}>
      <Tabs.Screen name="index" options={{ href: null }} />
      <Tabs.Screen
        name="orders"
        options={{
          title: 'Orders',
          tabBarLabel: 'Orders',
        }}
      />
      <Tabs.Screen
        name="delivery"
        options={{
          title: 'Delivery',
          tabBarLabel: 'Delivery',
        }}
      />
      <Tabs.Screen name="customers" options={{ href: null }} />
      <Tabs.Screen name="notifications" options={{ href: null }} />
      <Tabs.Screen
        name="profile"
        options={({ route }) => ({
          title: 'Profile',
          tabBarLabel: 'Profile',
          tabBarStyle: profileTabBarStyle(route),
        })}
      />
      <Tabs.Screen name="products" options={{ href: null }} />
    </Tabs>
  );
}
