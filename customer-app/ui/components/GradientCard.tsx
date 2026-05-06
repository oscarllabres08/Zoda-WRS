import type { PropsWithChildren } from 'react';
import { View, type ViewProps } from 'react-native';
import { LinearGradient, type LinearGradientProps } from 'expo-linear-gradient';
import { theme } from '../theme';

type Props = ViewProps & {
  colors?: LinearGradientProps['colors'];
  locations?: LinearGradientProps['locations'];
  start?: { x: number; y: number };
  end?: { x: number; y: number };
};

export function GradientCard({
  children,
  style,
  colors = ['#082D73', '#0A45C9', '#4AA3FF'] as const,
  locations = [0, 0.6, 1] as const,
  start = { x: 0.0, y: 0.55 },
  end = { x: 1, y: 0.2 },
  ...rest
}: PropsWithChildren<Props>) {
  return (
    <LinearGradient
      colors={colors}
      locations={locations}
      start={start}
      end={end}
      style={[
        {
          borderRadius: theme.radius.xl,
          borderWidth: 1,
          borderColor: 'rgba(255,255,255,0.18)',
          overflow: 'hidden',
          ...theme.shadow.card,
        },
        style,
      ]}
    >
      <LinearGradient
        colors={['rgba(255,255,255,0.16)', 'rgba(255,255,255,0.00)']}
        start={{ x: 0.75, y: 0.05 }}
        end={{ x: 0.35, y: 0.85 }}
        style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0 }}
        pointerEvents="none"
      />
      <View {...rest} style={{ padding: theme.spacing.md }}>
        {children}
      </View>
    </LinearGradient>
  );
}

