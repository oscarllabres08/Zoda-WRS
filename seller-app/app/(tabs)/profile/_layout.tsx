import { Stack } from 'expo-router';

import { profileSubpageScreenOptions } from './stackOptions';

export default function ProfileLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="customers" options={profileSubpageScreenOptions('Customers list')} />
      <Stack.Screen name="settings" options={profileSubpageScreenOptions('Account settings')} />
      <Stack.Screen name="help" options={profileSubpageScreenOptions('Help Center')} />
      <Stack.Screen name="notification-settings" options={profileSubpageScreenOptions('Notification settings')} />
      <Stack.Screen name="business" options={profileSubpageScreenOptions('Business profile')} />
      <Stack.Screen name="wallets" options={profileSubpageScreenOptions('E-wallets')} />
      <Stack.Screen name="voucher-verify" options={profileSubpageScreenOptions('Verify voucher')} />
      <Stack.Screen name="registrations" options={{ headerShown: false }} />
    </Stack>
  );
}
