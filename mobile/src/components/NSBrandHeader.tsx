/**
 * NSBrandHeader — cosmic header for the North Star tab.
 * Gradient background + animated starfield + the big amber north star icon.
 *
 * Direct port of `NSBrandHeader` from `northstar.jsx` in the design canvas.
 */

import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Easing } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, Path, G } from 'react-native-svg';
import { colors, fonts } from '../theme';

const AMBER = '#E0B775';   // oklch(0.74 0.15 45)
const AMBER_BRIGHT = '#F5DDB0'; // oklch(0.92 0.12 70)
const AMBER_SOFT_22 = 'rgba(224,183,117,0.22)';
const AMBER_SOFT_40 = 'rgba(224,183,117,0.4)';
const AMBER_SOFT_18 = 'rgba(224,183,117,0.18)';

interface Props {
  subtitle: string;
  /** Safe-area top inset to absorb so the gradient bleeds under the status bar. */
  insetsTop?: number;
}

export default function NSBrandHeader({ subtitle, insetsTop = 0 }: Props) {
  const haloPulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(haloPulse, { toValue: 1, duration: 1600, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(haloPulse, { toValue: 0, duration: 1600, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [haloPulse]);

  return (
    <View style={[styles.wrap, { paddingTop: insetsTop + 24 }]}>
      {/* Layered radial gradients — amber + violet + blue against deep ink */}
      <LinearGradient
        colors={['#1A1130', colors.bg]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <LinearGradient
        colors={['rgba(224,183,117,0.22)', 'transparent']}
        start={{ x: 0.5, y: 0.3 }}
        end={{ x: 0.5, y: 1 }}
        style={[StyleSheet.absoluteFill, { opacity: 0.9 }]}
      />
      <LinearGradient
        colors={['rgba(155,92,232,0.18)', 'transparent']}
        start={{ x: 0.8, y: 0.8 }}
        end={{ x: 0.2, y: 0.2 }}
        style={[StyleSheet.absoluteFill, { opacity: 0.7 }]}
      />

      {/* Starfield + the north star */}
      <Svg
        viewBox="0 0 360 160"
        width="100%"
        height={160}
        preserveAspectRatio="xMidYMid slice"
        style={StyleSheet.absoluteFill}
      >
        {Array.from({ length: 36 }).map((_, i) => {
          const x = ((i * 37) % 360) + ((i * 13) % 17);
          const y = (i * 53) % 160;
          const r = i % 7 === 0 ? 1.4 : i % 3 === 0 ? 0.9 : 0.5;
          const op = 0.25 + ((i * 17) % 60) / 100;
          return <Circle key={i} cx={x} cy={y} r={r} fill="white" opacity={op} />;
        })}
        {/* The north star — top right */}
        <G x={310} y={70}>
          <Circle r={5} fill="rgba(224,183,117,0.4)" />
          <Path
            d="M0 -9 L1.6 -1.6 L9 0 L1.6 1.6 L0 9 L-1.6 1.6 L-9 0 L-1.6 -1.6 Z"
            fill={AMBER_BRIGHT}
          />
        </G>
      </Svg>

      {/* Animated halo around the star — separate Animated.View on top */}
      <Animated.View
        style={[
          styles.halo,
          {
            opacity: haloPulse.interpolate({ inputRange: [0, 1], outputRange: [0.3, 0.6] }),
            transform: [{ scale: haloPulse.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1.15] }) }],
          },
        ]}
      />

      {/* Center pill + subtitle */}
      <View style={styles.centerCol}>
        <View style={styles.pill}>
          <View style={styles.pillDot} />
          <Text style={styles.pillText}>NORTH · STAR</Text>
        </View>
        <Text style={styles.subtitle}>{subtitle}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'relative',
    overflow: 'hidden',
    paddingHorizontal: 16,
    paddingBottom: 18,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  halo: {
    position: 'absolute',
    top: 60,
    right: 36,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(224,183,117,0.18)',
  },
  centerCol: {
    alignItems: 'center',
    paddingTop: 18,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(15,15,24,0.6)',
    borderWidth: 1,
    borderColor: 'rgba(224,183,117,0.4)',
  },
  pillDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: colors.accent,
  },
  pillText: {
    fontFamily: fonts.mono,
    fontSize: 9,
    color: AMBER,
    letterSpacing: 3.2,
  },
  subtitle: {
    fontFamily: fonts.serifItalic,
    fontSize: 13,
    color: colors.textTertiary,
    marginTop: 8,
    letterSpacing: 0.4,
    textAlign: 'center',
  },
});
