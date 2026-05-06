import { Stack } from 'expo-router';

import { theme } from '../../ui/theme';

export default function OrderLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerTitle: 'Order details',
        headerBackButtonDisplayMode: 'minimal',
        headerStyle: { backgroundColor: theme.colors.bg },
        headerTintColor: theme.colors.text,
        headerShadowVisible: false,
      }}
    />
  );
}
