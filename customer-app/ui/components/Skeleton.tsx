import { useEffect } from 'react';
import { View, type DimensionValue, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { theme } from '../theme';

type Props = {
  width?: DimensionValue;
  height: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
};

export function Skeleton({ width = '100%', height, radius = 14, style }: Props) {
  const x = useSharedValue(-1);

  useEffect(() => {
    x.value = withRepeat(withTiming(1, { duration: 1100, easing: Easing.inOut(Easing.ease) }), -1, true);
  }, [x]);

  const shimmerStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value * 220 }],
    opacity: 0.75,
  }));

  return (
    <View
      style={[
        {
          width,
          height,
          borderRadius: radius,
          backgroundColor: 'rgba(10,27,55,0.07)',
          overflow: 'hidden',
          borderWidth: 1,
          borderColor: theme.colors.border,
        },
        style,
      ]}
    >
      <Animated.View
        style={[
          {
            position: 'absolute',
            top: 0,
            bottom: 0,
            width: 160,
            backgroundColor: 'rgba(255,255,255,0.55)',
          },
          shimmerStyle,
        ]}
      />
    </View>
  );
}

export function SkeletonText({ lines = 3 }: { lines?: number }) {
  return (
    <View style={{ gap: 10 }}>
      {Array.from({ length: lines }).map((_, idx) => (
        <Skeleton key={idx} height={12} width={idx === lines - 1 ? '62%' : '100%'} radius={10} />
      ))}
    </View>
  );
}

