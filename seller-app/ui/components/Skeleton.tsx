import { type ReactNode, useEffect, useRef } from 'react';
import { Animated, Easing, View, type ViewStyle } from 'react-native';

import { theme } from '../theme';

type SkeletonProps = {
  width?: number | `${number}%`;
  height?: number;
  borderRadius?: number;
  style?: ViewStyle;
};

export function Skeleton({ width = '100%', height = 14, borderRadius = 10, style }: SkeletonProps) {
  const opacity = useRef(new Animated.Value(0.45)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.9,
          duration: 700,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.45,
          duration: 700,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={[
        {
          width,
          height,
          borderRadius,
          opacity,
          backgroundColor: theme.colors.border,
        },
        style,
      ]}
    />
  );
}

export function SellerPageSkeleton() {
  return (
    <View style={{ gap: theme.spacing.sm }}>
      <View style={{ gap: 8 }}>
        <Skeleton width="45%" height={22} />
        <Skeleton width="35%" />
      </View>
      <View
        style={{
          backgroundColor: theme.colors.card,
          borderRadius: theme.radius.xl,
          borderWidth: 1,
          borderColor: theme.colors.border,
          padding: theme.spacing.md,
        }}
      >
        <Skeleton width="52%" height={18} />
        <Skeleton width="38%" style={{ marginTop: 10 }} />
        <Skeleton width="62%" height={30} style={{ marginTop: 12 }} />
      </View>
      {[0, 1, 2].map((item) => (
        <View
          key={item}
          style={{
            backgroundColor: theme.colors.card,
            borderRadius: theme.radius.xl,
            borderWidth: 1,
            borderColor: theme.colors.border,
            padding: theme.spacing.md,
            flexDirection: 'row',
            gap: 12,
            alignItems: 'center',
          }}
        >
          <Skeleton width={54} height={54} borderRadius={14} />
          <View style={{ flex: 1, gap: 8 }}>
            <Skeleton width="70%" />
            <Skeleton width="52%" />
          </View>
        </View>
      ))}
    </View>
  );
}

function SkeletonCard({ children }: { children: ReactNode }) {
  return (
    <View
      style={{
        backgroundColor: theme.colors.card,
        borderRadius: theme.radius.xl,
        borderWidth: 1,
        borderColor: theme.colors.border,
        padding: theme.spacing.md,
      }}
    >
      {children}
    </View>
  );
}

export function SellerDashboardSkeleton() {
  return (
    <View style={{ gap: theme.spacing.sm }}>
      <SkeletonCard>
        <Skeleton width="42%" />
        <Skeleton width="58%" height={28} style={{ marginTop: 8 }} />
        <Skeleton width="36%" style={{ marginTop: 8 }} />
      </SkeletonCard>
      <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
        <SkeletonCard><Skeleton width="70%" /><Skeleton width="45%" style={{ marginTop: 8 }} /></SkeletonCard>
        <SkeletonCard><Skeleton width="70%" /><Skeleton width="45%" style={{ marginTop: 8 }} /></SkeletonCard>
      </View>
      <SkeletonCard>
        <Skeleton width="40%" />
        <Skeleton width="100%" height={52} borderRadius={14} style={{ marginTop: 12 }} />
        <Skeleton width="100%" height={52} borderRadius={14} style={{ marginTop: 10 }} />
      </SkeletonCard>
    </View>
  );
}

export function SellerOrdersSkeleton() {
  return (
    <View style={{ gap: theme.spacing.sm }}>
      <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
        <Skeleton width="32%" height={74} borderRadius={16} />
        <Skeleton width="32%" height={74} borderRadius={16} />
        <Skeleton width="32%" height={74} borderRadius={16} />
      </View>
      <Skeleton width="100%" height={46} borderRadius={16} />
      {[0, 1, 2].map((row) => (
        <SkeletonCard key={row}>
          <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
            <Skeleton width={60} height={60} borderRadius={14} />
            <View style={{ flex: 1, gap: 8 }}>
              <Skeleton width="56%" />
              <Skeleton width="80%" />
              <Skeleton width="42%" />
            </View>
          </View>
        </SkeletonCard>
      ))}
    </View>
  );
}

/** Customer list rows (matches Customers tab cards). */
export function SellerCustomersSkeleton() {
  return (
    <View style={{ gap: theme.spacing.sm, marginTop: theme.spacing.xs }}>
      {[0, 1, 2, 3, 4, 5].map((row) => (
        <View
          key={row}
          style={{
            backgroundColor: theme.colors.card,
            borderRadius: theme.radius.xl,
            borderWidth: 1,
            borderColor: theme.colors.border,
            padding: theme.spacing.md,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <Skeleton width={44} height={44} borderRadius={14} />
          <View style={{ flex: 1, gap: 8 }}>
            <Skeleton width="58%" height={16} />
            <Skeleton width="44%" />
          </View>
          <Skeleton width={14} height={14} borderRadius={4} />
        </View>
      ))}
    </View>
  );
}

export function SellerProductsSkeleton() {
  return (
    <View style={{ gap: theme.spacing.sm }}>
      <SkeletonCard>
        <Skeleton width="48%" />
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
          <Skeleton width="31%" height={58} borderRadius={14} />
          <Skeleton width="31%" height={58} borderRadius={14} />
          <Skeleton width="31%" height={58} borderRadius={14} />
        </View>
      </SkeletonCard>
      <Skeleton width="100%" height={46} borderRadius={14} />
      <Skeleton width="100%" height={42} borderRadius={14} />
      {[0, 1, 2, 3, 4].map((row) => (
        <SkeletonCard key={row}>
          <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
            <Skeleton width={44} height={44} borderRadius={14} />
            <View style={{ flex: 1, gap: 8 }}>
              <Skeleton width="60%" />
              <Skeleton width="38%" />
            </View>
            <Skeleton width={60} height={28} borderRadius={12} />
          </View>
        </SkeletonCard>
      ))}
    </View>
  );
}

export function SellerProfileSkeleton() {
  return (
    <View style={{ gap: theme.spacing.sm }}>
      <SkeletonCard>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Skeleton width={54} height={54} borderRadius={18} />
          <View style={{ flex: 1, gap: 8 }}>
            <Skeleton width="40%" />
            <Skeleton width="68%" />
          </View>
        </View>
      </SkeletonCard>
      <SkeletonCard>
        <Skeleton width="44%" />
        <Skeleton width="100%" height={42} borderRadius={12} style={{ marginTop: 10 }} />
        <Skeleton width="100%" height={42} borderRadius={12} style={{ marginTop: 8 }} />
        <Skeleton width="100%" height={42} borderRadius={12} style={{ marginTop: 8 }} />
      </SkeletonCard>
    </View>
  );
}
