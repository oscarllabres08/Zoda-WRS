import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import 'react-native-reanimated';
import { Platform, Pressable, View } from 'react-native';

import { useColorScheme } from '../components/useColorScheme';
import { AuthProvider, useAuth } from '../providers/AuthProvider';
import { NotificationsProvider, useNotifications } from '../providers/NotificationsProvider';
import { Ionicons } from '@expo/vector-icons';
import * as Notifications from 'expo-notifications';
import {
  Nunito_400Regular,
  Nunito_600SemiBold,
  Nunito_700Bold,
  Nunito_800ExtraBold,
} from '@expo-google-fonts/nunito';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '../ui/components/Text';
import { theme } from '../ui/theme';
import { usePendingOrderReminder } from '../hooks/usePendingOrderReminder';
import { ensureAndroidNotificationChannels } from '../lib/notificationChannels';
import { getNotificationRuntimePrefs } from '../lib/notificationRuntime';
import { PendingOrderReminderBanner } from '../ui/components/PendingOrderReminderBanner';

export {
  // Catch any errors thrown by the Layout component.
  ErrorBoundary,
} from 'expo-router';

export const unstable_settings = {
  // Ensure that reloading on `/modal` keeps a back button present.
  initialRouteName: '(tabs)',
};

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

Notifications.setNotificationHandler({
  handleNotification: async () => {
    const { notificationsEnabled, soundEnabled } = getNotificationRuntimePrefs();
    const show = notificationsEnabled;
    return {
      shouldShowAlert: show,
      shouldShowBanner: show,
      shouldShowList: show,
      shouldPlaySound: show && soundEnabled,
      shouldSetBadge: false,
    };
  },
});

export default function RootLayout() {
  const [loaded, error] = useFonts({
    Nunito_400Regular,
    Nunito_600SemiBold,
    Nunito_700Bold,
    Nunito_800ExtraBold,
    ...Ionicons.font,
  });

  // Expo Router uses Error Boundaries to catch errors in the navigation tree.
  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  useEffect(() => {
    void (async () => {
      try {
        await ensureAndroidNotificationChannels();
      } catch (e) {
        if (__DEV__) console.warn('[notifications] channel setup:', e);
      }
    })();
  }, []);

  if (!loaded) {
    return null;
  }

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
  const colorScheme = useColorScheme();

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <NotificationsProvider>
          <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : zodaNavigationTheme}>
            <AuthGate />
          </ThemeProvider>
        </NotificationsProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}

function AuthGate() {
  const { user, loading, profileLoading, gateMessage } = useAuth();
  const { toast, dismissToast } = useNotifications();
  const { staleOrders } = usePendingOrderReminder();
  const segments = useSegments();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const reminderBannerVisible = user != null && staleOrders.length > 0;
  const toastTop = Math.max(insets.top, 10) + 6 + (reminderBannerVisible ? 78 : 0);

  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as
        | { orderId?: string; kind?: string; pendingUserId?: string }
        | undefined;
      if (data?.kind === 'seller_registration_pending') {
        router.push('/(tabs)/notifications');
        return;
      }
      if (data?.orderId) {
        router.push(`/order/${data.orderId}`);
        return;
      }
      router.push('/(tabs)/orders');
    });
    return () => sub.remove();
  }, [router]);

  useEffect(() => {
    if (loading || (user && profileLoading)) return;
    const inAuth = segments[0] === '(auth)';

    if (!user && !inAuth) {
      router.replace('/(auth)/sign-in');
      return;
    }

    // Only proceed into the app when the profile check passed (no gate message).
    if (user && inAuth && !gateMessage) router.replace('/(tabs)/orders');
  }, [user, loading, profileLoading, gateMessage, segments, router]);

  return (
    <>
      <Stack
        screenOptions={{
          animation: 'fade_from_bottom',
          animationDuration: 220,
          /** Avoid double headers: e.g. native "order" bar + in-screen "Order details". */
          headerShown: false,
        }}
      >
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="modal" options={{ presentation: 'modal' }} />
      </Stack>

      {reminderBannerVisible ? (
        <PendingOrderReminderBanner orders={staleOrders} topInset={Math.max(insets.top, 8)} />
      ) : null}

      {toast ? (
        <View
          pointerEvents="box-none"
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: toastTop,
            alignItems: 'center',
            zIndex: 60,
          }}
        >
          <Pressable
            onPress={() => {
              const data = (toast.data ?? {}) as { orderId?: string; kind?: string; pendingUserId?: string };
              dismissToast();
              if (data?.kind === 'seller_registration_pending') {
                router.push('/(tabs)/notifications');
                return;
              }
              if (data?.orderId) {
                router.push(`/order/${data.orderId}`);
                return;
              }
              router.push('/(tabs)/orders');
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
