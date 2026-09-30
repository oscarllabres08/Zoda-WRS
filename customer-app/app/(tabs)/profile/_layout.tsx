import { Stack } from 'expo-router';

import { profileSubpageScreenOptions } from './stackOptions';

export default function ProfileLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="orders" options={profileSubpageScreenOptions('My Orders')} />
      <Stack.Screen name="account-settings" options={profileSubpageScreenOptions('Account settings')} />
      <Stack.Screen name="notifications" options={profileSubpageScreenOptions('Notifications')} />
      <Stack.Screen name="help" options={profileSubpageScreenOptions('Help Center')} />
      <Stack.Screen name="loyalty" options={{ headerShown: false }} />
    </Stack>
  );
}
