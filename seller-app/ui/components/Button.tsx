import type { PropsWithChildren, ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, type PressableProps, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { theme } from '../theme';
import { Text } from './Text';

type Variant = 'primary' | 'ghost' | 'danger';

type Props = PressableProps & {
  variant?: Variant;
  title?: string;
  leadingIcon?: ReactNode;
};

export function Button({ variant = 'primary', title, leadingIcon, children, style, disabled, ...rest }: PropsWithChildren<Props>) {
  const pressed = useSharedValue(0);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: withTiming(pressed.value ? 0.98 : 1, { duration: 120 }) }],
  }));

  const colors = (() => {
    if (variant === 'danger') {
      return { bg: 'rgba(239,68,68,0.14)', border: 'transparent', text: theme.colors.danger };
    }
    if (variant === 'ghost') {
      return { bg: '#FFFFFF', border: theme.colors.border, text: theme.colors.text };
    }
    return { bg: theme.colors.primary, border: 'transparent', text: '#FFFFFF' };
  })();

  const basePressableStyle = {
    borderRadius: 14,
    overflow: 'hidden' as const,
    paddingVertical: 12,
    paddingHorizontal: 14,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: colors.bg,
    borderWidth: variant === 'ghost' ? StyleSheet.hairlineWidth : 0,
    borderColor: variant === 'ghost' ? colors.border : 'transparent',
    ...(variant === 'danger'
      ? { elevation: 0, shadowOpacity: 0, shadowRadius: 0, shadowOffset: { width: 0, height: 0 } }
      : theme.shadow.card),
  };

  const wrapperStyle = typeof style === 'function' ? undefined : style;
  const pressableStyle = typeof style === 'function' ? style : undefined;

  return (
    <Animated.View style={[animatedStyle, { opacity: disabled ? 0.6 : 1 }, wrapperStyle]}>
      <Pressable
        {...rest}
        disabled={disabled}
        android_ripple={
          variant === 'primary'
            ? { color: 'rgba(255,255,255,0.22)', borderless: true }
            : variant === 'danger'
              ? { color: 'rgba(239,68,68,0.16)', borderless: true }
              : { color: 'rgba(11,27,58,0.08)', borderless: true }
        }
        onPressIn={(e) => {
          pressed.value = 1;
          rest.onPressIn?.(e);
        }}
        onPressOut={(e) => {
          pressed.value = 0;
          rest.onPressOut?.(e);
        }}
        style={
          pressableStyle
            ? (state) => [basePressableStyle, pressableStyle(state)]
            : [basePressableStyle, typeof style === 'function' ? undefined : style]
        }
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {leadingIcon}
          {typeof title === 'string' ? (
            <Text
              weight="extrabold"
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.86}
              style={{
                color: colors.text,
                fontSize: 16,
                lineHeight: Platform.OS === 'android' ? 20 : 18,
                textAlign: 'center',
                ...(Platform.OS === 'android' ? { includeFontPadding: false } : {}),
              }}
            >
              {title}
            </Text>
          ) : null}
          {children}
        </View>
      </Pressable>
    </Animated.View>
  );
}

