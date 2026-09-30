import type { PropsWithChildren } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet, View, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import { theme } from '../theme';

export function PrimaryGradient({ style }: { style?: StyleProp<ViewStyle> }) {
  return (
    <LinearGradient
      colors={[...theme.gradient.primary]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[StyleSheet.absoluteFillObject, style]}
      pointerEvents="none"
    />
  );
}

type GradientPressableProps = PressableProps & {
  innerStyle?: StyleProp<ViewStyle>;
};

/** Primary action control — cyan → blue gradient (logo). */
export function GradientPressable({
  children,
  style,
  innerStyle,
  disabled,
  ...rest
}: PropsWithChildren<GradientPressableProps>) {
  return (
    <Pressable
      {...rest}
      disabled={disabled}
      style={[
        {
          borderRadius: 14,
          overflow: 'hidden',
          opacity: disabled ? 0.55 : 1,
        },
        style,
      ]}
    >
      <PrimaryGradient />
      <View style={[{ alignItems: 'center', justifyContent: 'center' }, innerStyle]}>{children}</View>
    </Pressable>
  );
}
