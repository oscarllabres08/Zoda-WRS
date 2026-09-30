import { useEffect, useMemo } from 'react';
import { Pressable, View } from 'react-native';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';

import { theme } from '../theme';
import { Text } from './Text';

type TabDef = {
  key: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  iconActive: keyof typeof Ionicons.glyphMap;
};

const INACTIVE_COLOR = theme.colors.muted;
const INACTIVE_LABEL = theme.colors.tabInactiveLabel;

const TABS: TabDef[] = [
  { key: 'orders', label: 'Orders', icon: 'list-outline', iconActive: 'list' },
  { key: 'delivery', label: 'Delivery', icon: 'navigate-outline', iconActive: 'navigate' },
  { key: 'profile', label: 'Profile', icon: 'person-outline', iconActive: 'person' },
];

/** Left → right tab order (Profile last = rightmost). */
const TAB_ROUTE_ORDER = ['orders', 'delivery', 'profile'] as const;

function normalizeRouteName(name: string) {
  return name.replace(/\/index$/, '');
}

function tabLabel(routeName: string, options: BottomTabBarProps['descriptors'][string]['options']) {
  const tb = options?.tabBarLabel;
  if (typeof tb === 'string' && tb.trim()) return tb;
  if (typeof options?.title === 'string' && options.title.trim()) return options.title;
  const key = normalizeRouteName(routeName);
  const fromTabs = TABS.find((t) => t.key === key)?.label;
  return fromTabs ?? key;
}

function TabButton({
  label,
  iconName,
  iconActiveName,
  isFocused,
  onPress,
}: {
  label: string;
  iconName: keyof typeof Ionicons.glyphMap;
  iconActiveName: keyof typeof Ionicons.glyphMap;
  isFocused: boolean;
  onPress: () => void;
}) {
  const focus = useSharedValue(isFocused ? 1 : 0);

  useEffect(() => {
    focus.value = withTiming(isFocused ? 1 : 0, { duration: 180 });
  }, [isFocused, focus]);

  const iconAnim = useAnimatedStyle(() => {
    const s = 1 + 0.06 * focus.value;
    return {
      transform: [{ scale: s }],
    };
  });

  const resolvedIcon = isFocused ? iconActiveName : iconName;

  return (
    <Pressable
      onPress={onPress}
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 4,
      }}
    >
      <Animated.View style={[{ width: 38, height: 38, alignItems: 'center', justifyContent: 'center' }, iconAnim]}>
        <Ionicons
          name={resolvedIcon}
          size={22}
          color={isFocused ? theme.colors.primary : INACTIVE_COLOR}
        />
      </Animated.View>
      <Text
        variant="chip"
        weight={isFocused ? 'extrabold' : 'semibold'}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.68}
        style={{
          color: isFocused ? theme.colors.primary : INACTIVE_LABEL,
          textAlign: 'center',
          width: '100%',
          paddingHorizontal: 1,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function AnimatedTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();

  const orderedRoutes = useMemo(() => {
    const order = [...TAB_ROUTE_ORDER];
    return [...state.routes]
      .filter((r) => order.includes(normalizeRouteName(r.name) as (typeof order)[number]))
      .sort((a, b) => {
        const ia = order.indexOf(normalizeRouteName(a.name) as (typeof order)[number]);
        const ib = order.indexOf(normalizeRouteName(b.name) as (typeof order)[number]);
        return ia - ib;
      });
  }, [state.routes]);

  const activeKey = state.routes[state.index]?.key;

  return (
    <View
      style={{
        backgroundColor: theme.colors.tabBar,
        borderTopWidth: 1,
        borderTopColor: theme.colors.border,
        paddingHorizontal: 4,
        paddingTop: 8,
        paddingBottom: 8 + Math.max(insets.bottom, 0),
      }}
    >
      <View style={{ flexDirection: 'row', minHeight: 52, alignItems: 'center' }}>
        {orderedRoutes.map((route) => {
          const options = descriptors[route.key]?.options;
          const label = tabLabel(route.name, options);
          const isFocused = route.key === activeKey;

          const def =
            TABS.find((t) => t.key === normalizeRouteName(route.name)) ??
            TABS.find((t) => route.name === `${t.key}/index` || route.name.startsWith(`${t.key}/`));
          const iconName = def?.icon ?? 'ellipse-outline';
          const iconActiveName = def?.iconActive ?? iconName;

          const onPress = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });
            if (!isFocused && !event.defaultPrevented) {
              navigation.navigate(route.name as never);
            }
          };

          return (
            <TabButton
              key={route.key}
              label={label}
              iconName={iconName}
              iconActiveName={iconActiveName}
              isFocused={isFocused}
              onPress={onPress}
            />
          );
        })}
      </View>
    </View>
  );
}

