/**
 * Skeleton shimmer loading component (P5-1).
 *
 * Replaces ActivityIndicator with a premium pulsing animation.
 * Uses Animated API — no extra dependencies.
 */

import React, { useEffect, useRef } from 'react';
import { View, Animated, StyleSheet, ViewStyle } from 'react-native';
import { colors, radius } from '../theme';

interface SkeletonProps {
  width: number | string;
  height: number;
  borderRadius?: number;
  style?: ViewStyle;
}

export function Skeleton({ width, height, borderRadius = radius.sm, style }: SkeletonProps) {
  const opacity = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.7, duration: 800, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.3, duration: 800, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, []);

  return (
    <Animated.View
      style={[
        {
          width: width as any,
          height,
          borderRadius,
          backgroundColor: colors.cardElevated,
          opacity,
        },
        style,
      ]}
    />
  );
}

/** Skeleton card matching the stat card layout. */
export function SkeletonStatCard() {
  return (
    <View style={skStyles.statCard}>
      <Skeleton width={60} height={28} borderRadius={4} />
      <Skeleton width={50} height={10} borderRadius={3} style={{ marginTop: 6 }} />
    </View>
  );
}

/** Skeleton row for a list item. */
export function SkeletonRow() {
  return (
    <View style={skStyles.row}>
      <Skeleton width={24} height={24} borderRadius={12} />
      <View style={{ flex: 1, gap: 6 }}>
        <Skeleton width="80%" height={14} borderRadius={4} />
        <Skeleton width="50%" height={10} borderRadius={3} />
      </View>
    </View>
  );
}

/** Full skeleton for progress screen loading state. */
export function ProgressSkeleton() {
  return (
    <View style={skStyles.container}>
      {/* Stat cards */}
      <View style={skStyles.statsGrid}>
        <SkeletonStatCard />
        <SkeletonStatCard />
        <SkeletonStatCard />
      </View>
      {/* Chart placeholder */}
      <Skeleton width="100%" height={200} borderRadius={radius.lg} style={{ marginBottom: 16 }} />
      {/* Pillar rows */}
      <Skeleton width="100%" height={160} borderRadius={radius.lg} style={{ marginBottom: 16 }} />
      <Skeleton width="100%" height={100} borderRadius={radius.lg} />
    </View>
  );
}

const skStyles = StyleSheet.create({
  container: { padding: 16 },
  statsGrid: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  statCard: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
  },
});
