/**
 * StreakStrip — flame icon + day count + 14-day dot strip with pulsing today dot.
 * Ported from `app.jsx` `Streak` in the design canvas.
 */

import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Easing } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, radius, spacing } from '../theme';

interface Props {
  /** Current streak in days. */
  count: number;
  /** Number of dots to render in the strip (default 14). */
  windowDays?: number;
}

export default function StreakStrip({ count, windowDays = 14 }: Props) {
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.15, duration: 1000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 1000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  // Last cell is "today"; cells before that are "on" if within streak.
  const dots = Array.from({ length: windowDays }, (_, i) => {
    if (i === windowDays - 1) return 'today' as const;
    return i >= windowDays - count ? ('on' as const) : ('off' as const);
  });

  return (
    <View style={styles.wrap}>
      <View style={styles.left}>
        <View style={styles.flame}>
          <Ionicons name="flame" size={18} color="#E0B775" />
        </View>
        <View>
          <Text style={styles.label}>CURRENT STREAK</Text>
          <Text style={styles.val}>
            {count}
            <Text style={styles.unit}> days</Text>
          </Text>
        </View>
      </View>
      <View style={styles.dotRow}>
        {dots.map((kind, i) => {
          if (kind === 'today') {
            return (
              <Animated.View
                key={i}
                style={[
                  styles.dot,
                  styles.dotOn,
                  { transform: [{ scale: pulse }] },
                ]}
              />
            );
          }
          return (
            <View key={i} style={[styles.dot, kind === 'on' ? styles.dotOn : styles.dotOff]} />
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    
    marginBottom: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: radius.xl,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 14,
  },
  left: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  flame: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    // Canvas hardcodes ember tints for the flame box even on ink theme
    backgroundColor: 'rgba(224,183,117,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(224,183,117,0.3)',
  },
  label: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: colors.textTertiary,
    letterSpacing: 1.6,
  },
  val: {
    fontFamily: fonts.mono,
    fontSize: 22,
    color: colors.text,
    letterSpacing: -0.7,
  },
  unit: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: colors.textTertiary,
    letterSpacing: 0,
  },
  dotRow: { flexDirection: 'row', gap: 5 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  dotOff: { backgroundColor: colors.line },
  dotOn: {
    backgroundColor: colors.accent,
  },
});
