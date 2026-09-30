import { DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack, useRouter, useSegments, type Href } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useCallback, useEffect } from 'react';
import 'react-native-reanimated';
import { Platform, Pressable, View } from 'react-native';

import { Ionicons } from '@expo/vector-icons';
import * as Notifications from 'expo-notifications';
import {
  Nunito_400Regular,
  Nunito_600SemiBold,
  Nunito_700Bold,
  Nunito_800ExtraBold,
} from '@expo-google-fonts/nunito';

import { AuthProvider, useAuth } from '../providers/AuthProvider';
import { NotificationsProvider, useNotifications } from '../providers/NotificationsProvider';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '../ui/components/Text';
import { theme } from '../ui/theme';

export { ErrorBoundary } from 'expo-router';

export const unstable_settings = { initialRouteName: '(tabs)' };

SplashScreen.preventAutoHideAsync();

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export default function RootLayout() {
  const [loaded, error] = useFonts({
    Nunito_400Regular,
    Nunito_600SemiBold,
    Nunito_700Bold,
    Nunito_800ExtraBold,
    ...Ionicons.font,
  });

  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    if (loaded) SplashScreen.hideAsync();
  }, [loaded]);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      // Android channel sounds use the raw resource name (no extension).
      // `../notification.wav` is bundled via the expo-notifications config plugin.
      sound: 'notification',
      vibrationPattern: [0, 250, 250, 250],
      lightColor: theme.colors.primaryDark,
    });
    Notifications.setNotificationChannelAsync('silent', {
      name: 'silent',
      importance: Notifications.AndroidImportance.MAX,
      sound: null,
      vibrationPattern: [0],
      lightColor: theme.colors.primaryDark,
    });
  }, []);

  if (!loaded) return null;
  return <RootLayoutNav />;
}

const zodaNavigationTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: theme.colors.primary,
    background: theme.colors.bg,
    card: theme.colors.card,
    text: theme.colors.text,
    border: theme.colors.border,
  },
};

function RootLayoutNav() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <NotificationsProvider>
          <ThemeProvider value={zodaNavigationTheme}>
            <AuthGate />
          </ThemeProvider>
        </NotificationsProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}

function AuthGate() {
  const { user, loading } = useAuth();
  const { toast, dismissToast } = useNotifications();
  const segments = useSegments();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const orderHrefFor = useCallback(
    (orderId: string) => {
      const segs = segments as string[];
      const inProfileOrders = segs.includes('profile') && segs.includes('orders');
      if (inProfileOrders) return `/order/${orderId}?returnTo=profile-orders`;
      return `/order/${orderId}`;
    },
    [segments]
  );

  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as { orderId?: string } | undefined;
      if (data?.orderId) router.push(orderHrefFor(data.orderId) as Href);
    });
    return () => sub.remove();
  }, [router, orderHrefFor]);

  useEffect(() => {
    if (loading) return;
    const inAuth = segments[0] === '(auth)';
    if (!user && !inAuth) router.replace('/(auth)/sign-in');
    if (user && inAuth) router.replace('/(tabs)');
  }, [user, loading, segments, router]);

  return (
    <>
      <Stack screenOptions={{ animation: 'fade_from_bottom', animationDuration: 220 }}>
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="order" options={{ headerShown: false }} />
      </Stack>

      {toast ? (
        <View
          pointerEvents="box-none"
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: Math.max(insets.top, 10) + 6,
            alignItems: 'center',
          }}
        >
          <Pressable
            onPress={() => {
              const data = (toast.data ?? {}) as { orderId?: string };
              dismissToast();
              if (data?.orderId) {
                router.push(orderHrefFor(data.orderId) as Href);
              }
            }}
            style={{
              width: '92%',
              maxWidth: 420,
              borderRadius: 16,
              backgroundColor: theme.colors.card,
              borderWidth: 1,
              borderColor: theme.colors.border,
              paddingVertical: 12,
              paddingHorizontal: 12,
              ...{
                shadowColor: theme.shadow.ink,
                shadowOpacity: 0.12,
                shadowRadius: 18,
                shadowOffset: { width: 0, height: 10 },
                elevation: 6,
              },
            }}
          >
            <Text weight="extrabold" numberOfLines={1} style={{ fontSize: 13 }}>
              {toast.title}
            </Text>
            <Text variant="muted" numberOfLines={2} style={{ marginTop: 2, fontSize: 12, lineHeight: 16 }}>
              {toast.body}
            </Text>
          </Pressable>
        </View>
      ) : null}
    </>
  );
}

