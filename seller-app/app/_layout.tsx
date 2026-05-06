import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import 'react-native-reanimated';
import { Platform, Pressable, View } from 'react-native';

import { useColorScheme } from '@/components/useColorScheme';
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
    if (Platform.OS !== 'android') return;
    Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      // Android channel sounds use the raw resource name (no extension).
      // `../notification.wav` is bundled via the expo-notifications config plugin.
      sound: 'notification',
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#1265D6',
    });
    Notifications.setNotificationChannelAsync('silent', {
      name: 'silent',
      importance: Notifications.AndroidImportance.MAX,
      sound: null,
      vibrationPattern: [0],
      lightColor: '#1265D6',
    });
  }, []);

  if (!loaded) {
    return null;
  }

  return <RootLayoutNav />;
}

function RootLayoutNav() {
  const colorScheme = useColorScheme();

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <NotificationsProvider>
          <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
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
  const segments = useSegments();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as
        | { orderId?: string; kind?: string; pendingUserId?: string }
        | undefined;
      if (data?.kind === 'seller_registration_pending') {
        router.push('/(tabs)/profile/registrations?returnTo=fromNotification');
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
    if (user && inAuth && !gateMessage) router.replace('/(tabs)');
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
              const data = (toast.data ?? {}) as { orderId?: string; kind?: string; pendingUserId?: string };
              dismissToast();
              if (data?.kind === 'seller_registration_pending') {
                router.push('/(tabs)/profile/registrations?returnTo=fromNotification');
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
              backgroundColor: '#FFFFFF',
              borderWidth: 1,
              borderColor: 'rgba(231,238,249,0.95)',
              paddingVertical: 12,
              paddingHorizontal: 12,
              ...{
                shadowColor: '#0B1B3A',
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
