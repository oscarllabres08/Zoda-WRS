import { useEffect, useState } from 'react';
import { Image, Platform, Pressable, ScrollView, useWindowDimensions, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';

import { Screen } from '../../ui/components/Screen';
import { Card } from '../../ui/components/Card';
import { Text } from '../../ui/components/Text';
import { Button } from '../../ui/components/Button';
import { theme } from '../../ui/theme';
import { NotificationsMenu } from '../../ui/components/NotificationsMenu';
import { useNotifications } from '../../providers/NotificationsProvider';

const heroImage = require('../../assets/store.jpeg');

/** RN Web does not support `Image.resolveAssetSource` on the Image export (runtime error). */
function heroAspectRatioFromAsset(source: typeof heroImage): number {
  if (Platform.OS === 'web') return 4 / 3;
  const resolve = Image.resolveAssetSource as
    | ((s: typeof heroImage) => { width: number; height: number } | undefined)
    | undefined;
  if (typeof resolve !== 'function') return 4 / 3;
  try {
    const meta = resolve(source);
    if (meta && meta.width > 0 && meta.height > 0) return meta.width / meta.height;
  } catch {
    /* ignore */
  }
  return 4 / 3;
}

const HERO_ASPECT_RATIO = heroAspectRatioFromAsset(heroImage);

export default function HomeScreen() {
  const router = useRouter();
  const { width: winW } = useWindowDimensions();
  const { unreadCount } = useNotifications();
  const [notifOpen, setNotifOpen] = useState(false);
  const pulse = useSharedValue(0);
  const heroTitleSize = winW < 360 ? 22 : 26;
  const heroTitleLineHeight = winW < 360 ? 26 : 28;

  useEffect(() => {
    pulse.value = withRepeat(
      withTiming(1, { duration: 1200, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
  }, [pulse]);

  const ctaGlowStyle = useAnimatedStyle(() => {
    const s = 1 + 0.03 * pulse.value;
    const glow = 0.14 + 0.18 * pulse.value;
    return {
      transform: [{ scale: s }],
      shadowOpacity: 0.16 + 0.18 * pulse.value,
      opacity: 1,
      backgroundColor: `rgba(18,101,214,${glow})`,
    };
  });

  return (
    <Screen style={{ padding: 0 }}>
      <NotificationsMenu visible={notifOpen} onClose={() => setNotifOpen(false)} />
      <ScrollView contentContainerStyle={{ padding: theme.spacing.md, paddingBottom: theme.spacing.xl }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ flex: 1 }}>
            <Text variant="title" weight="extrabold" style={{ letterSpacing: -0.2 }}>
              AQUABEAST
            </Text>
            <Text variant="muted" weight="regular" style={{ marginTop: 2 }}>
              Water refilling station
            </Text>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Pressable
              onPress={() => setNotifOpen(true)}
              style={{
                width: 44,
                height: 44,
                borderRadius: 14,
                borderWidth: 1,
                borderColor: theme.colors.border,
                backgroundColor: '#fff',
                alignItems: 'center',
                justifyContent: 'center',
                position: 'relative',
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
                    paddingHorizontal: 4,
                    borderRadius: 999,
                    backgroundColor: theme.colors.primary,
                    borderWidth: 2,
                    borderColor: '#fff',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text variant="chip" weight="extrabold" style={{ color: '#fff', fontSize: 10 }}>
                    {unreadCount > 99 ? '99+' : String(unreadCount)}
                  </Text>
                </View>
              ) : null}
            </Pressable>
          </View>
        </View>

        <View style={{ marginTop: theme.spacing.md, gap: theme.spacing.sm }}>
        <View
          style={{
            width: '100%',
            aspectRatio: HERO_ASPECT_RATIO,
            borderRadius: 26,
            overflow: 'hidden',
            borderWidth: 1,
            borderColor: theme.colors.border,
            backgroundColor: '#0B1B3A',
            position: 'relative',
          }}
        >
          <Image source={heroImage} style={{ width: '100%', height: '100%' }} resizeMode="cover" accessibilityLabel="Aquabeast store" />
          {/* Web-like overlay layers (horizontal dark fade + subtle vertical highlight) */}
          <LinearGradient
            colors={['rgba(6,28,78,0.78)', 'rgba(6,28,78,0.55)', 'rgba(6,28,78,0.18)', 'rgba(6,28,78,0.00)']}
            locations={[0, 0.38, 0.7, 1]}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0 }}
            pointerEvents="none"
          />
          <LinearGradient
            colors={['rgba(0,0,0,0.08)', 'rgba(0,0,0,0.00)', 'rgba(255,255,255,0.22)', 'rgba(255,255,255,0.60)']}
            locations={[0, 0.35, 0.78, 1]}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0 }}
            pointerEvents="none"
          />

          <View
            style={{
              position: 'absolute',
              left: 14,
              right: 14,
              bottom: 14,
              maxWidth: 320,
              gap: 10,
            }}
          >
            <Text
              weight="bold"
              style={{
                color: 'rgba(255,255,255,0.96)',
                letterSpacing: -0.6,
                fontSize: heroTitleSize,
                lineHeight: heroTitleLineHeight,
                textShadowColor: 'rgba(0,0,0,0.35)',
                textShadowRadius: 28,
                textShadowOffset: { width: 0, height: 10 },
              }}
            >
              Pure Water, Delivered to You
            </Text>
            <Text variant="muted" weight="semibold" style={{ color: 'rgba(255,255,255,0.92)', fontSize: 13 }}>
              Safe. Clean. Refreshing.
            </Text>

            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 10,
                width: '100%',
                flexWrap: 'wrap',
              }}
            >
              <Animated.View
                style={[
                  {
                    borderRadius: 16,
                    padding: 2,
                    shadowColor: theme.colors.primary,
                    shadowRadius: 16,
                    shadowOffset: { width: 0, height: 10 },
                    elevation: 6,
                  },
                  ctaGlowStyle,
                ]}
              >
                <Button title="Order now" onPress={() => router.push('/(tabs)/order')} />
              </Animated.View>
              <Text
                weight="bold"
                style={{
                  flex: 1,
                  minWidth: 120,
                  color: 'rgba(255,255,255,0.95)',
                  letterSpacing: -0.2,
                  textShadowColor: 'rgba(0,0,0,0.22)',
                  textShadowRadius: 18,
                  textShadowOffset: { width: 0, height: 6 },
                }}
              >
                Doorstep water refilling
              </Text>
            </View>
          </View>
        </View>

        <Card>
          <Text variant="h2" weight="extrabold">
            Why choose Aquabeast?
          </Text>
          <View style={{ marginTop: 10, gap: 10 }}>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <MiniFeature icon="shield-checkmark-outline" title="Purified Water" subtitle="High-quality refilling station." />
              <MiniFeature icon="bicycle-outline" title="Fast Delivery" subtitle="Quick and reliable service." />
            </View>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <MiniFeature icon="pricetag-outline" title="Affordable" subtitle="Great quality at fair prices." />
              <MiniFeature icon="home-outline" title="Doorstep" subtitle="Home & office delivery." />
            </View>
          </View>
        </Card>

        <Card>
          <Text variant="h2" weight="extrabold">
            How it works
          </Text>
          <View style={{ marginTop: 10, gap: 10 }}>
            <HowRow step="1" title="Choose a product" subtitle="Select the water you need." />
            <HowRow step="2" title="Add quantity & details" subtitle="Enter delivery address and contact." />
            <HowRow step="3" title="Checkout" subtitle="Review and confirm your order." />
            <HowRow step="4" title="Track your order" subtitle="We’ll keep you updated." />
          </View>
          <View style={{ marginTop: 12 }}>
            <Button title="Start your order" onPress={() => router.push('/(tabs)/order')} />
          </View>
        </Card>

        <Card>
          <Text variant="h2" weight="extrabold">
            Our services
          </Text>
          <View style={{ marginTop: 10 }}>
            <ServiceRow icon="water-outline" title="Water Refilling" subtitle="Purified drinking water for your needs." />
            <Divider />
            <ServiceRow icon="home-outline" title="Home & Office Delivery" subtitle="Delivered safely to your doorstep." />
            <Divider />
            <ServiceRow icon="checkmark-circle-outline" title="Clean & Safe" subtitle="Strict quality control for your safety." />
          </View>
        </Card>
        </View>
      </ScrollView>
    </Screen>
  );
}

function MiniFeature({ icon, title, subtitle }: { icon: keyof typeof Ionicons.glyphMap; title: string; subtitle: string }) {
  return (
    <View
      style={{
        flex: 1,
        minWidth: 0,
        borderWidth: 1,
        borderColor: theme.colors.border,
        borderRadius: 18,
        padding: 12,
        backgroundColor: 'rgba(255,255,255,0.86)',
        alignItems: 'center',
        gap: 8,
      }}
    >
      <View
        style={{
          width: 38,
          height: 38,
          borderRadius: 14,
          backgroundColor: 'rgba(18,101,214,0.10)',
          borderWidth: 1,
          borderColor: 'rgba(18,101,214,0.18)',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Ionicons name={icon} size={20} color={theme.colors.primary} />
      </View>
      <Text weight="extrabold" style={{ textAlign: 'center' }} numberOfLines={2}>
        {title}
      </Text>
      <Text variant="muted" style={{ textAlign: 'center' }} numberOfLines={3}>
        {subtitle}
      </Text>
    </View>
  );
}

function Divider() {
  return <View style={{ height: 1, backgroundColor: theme.colors.border, marginVertical: 10, opacity: 0.75 }} />;
}

function HowRow({ step, title, subtitle }: { step: string; title: string; subtitle: string }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingVertical: 10,
        paddingHorizontal: 10,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: '#F8FBFF',
      }}
    >
      <View
        style={{
          width: 34,
          height: 34,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: theme.colors.border,
          backgroundColor: 'rgba(18,101,214,0.10)',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text weight="extrabold" style={{ color: theme.colors.primary }}>
          {step}
        </Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text weight="extrabold">{title}</Text>
        <Text variant="muted" style={{ marginTop: 2 }}>
          {subtitle}
        </Text>
      </View>
    </View>
  );
}

function ServiceRow({ icon, title, subtitle }: { icon: keyof typeof Ionicons.glyphMap; title: string; subtitle: string }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingVertical: 10,
        paddingHorizontal: 10,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: '#F8FBFF',
      }}
    >
      <View
        style={{
          width: 40,
          height: 40,
          borderRadius: 14,
          borderWidth: 1,
          borderColor: 'rgba(18,101,214,0.14)',
          backgroundColor: 'rgba(18,101,214,0.08)',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Ionicons name={icon} size={20} color={theme.colors.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text weight="extrabold">{title}</Text>
        <Text variant="muted" style={{ marginTop: 2 }}>
          {subtitle}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color="rgba(10,27,55,0.30)" />
    </View>
  );
}

