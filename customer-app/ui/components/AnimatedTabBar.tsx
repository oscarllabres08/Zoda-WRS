import { useEffect } from 'react';
import { Pressable, View } from 'react-native';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
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
  { key: 'index', label: 'Home', icon: 'home-outline', iconActive: 'home' },
  { key: 'order', label: 'Order', icon: 'water-outline', iconActive: 'water' },
  { key: 'rewards', label: 'Vouchers', icon: 'ticket-outline', iconActive: 'ticket' },
  { key: 'profile', label: 'Profile', icon: 'person-outline', iconActive: 'person' },
];

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
    <Pressable onPress={onPress} style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4 }}>
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
        minimumFontScale={0.72}
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
        {state.routes.map((route, index) => {
          const options = descriptors[route.key]?.options;
          const label =
            options?.tabBarLabel?.toString() ??
            (typeof options?.title === 'string' ? options.title : undefined) ??
            route.name;
          const isFocused = state.index === index;
          const def = TABS.find((t) => t.key === route.name);
          const iconName = def?.icon ?? 'ellipse-outline';
          const iconActiveName = def?.iconActive ?? iconName;

          const onPress = () => {
            const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
            if (!isFocused && !event.defaultPrevented) navigation.navigate(route.name as never);
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

