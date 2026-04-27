/**
 * CompoundingHero — daily mantra hero with self-drawing compounding curve.
 *
 * Visual design ported from Habits.html design canvas:
 *   • Radial ember bloom corners on a warm surface gradient
 *   • Day pill (top-right), eyebrow label, italic-serif mantra
 *   • Big mono multiplier (e.g. "5.4×") with green delta pill
 *   • Self-drawing 1.011^n curve with pulsing ember endpoint
 */

import React, { useEffect, useMemo, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Easing } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path, Line, Circle, Defs, LinearGradient as SvgGradient, Stop } from 'react-native-svg';
import { colors, fonts, radius, spacing } from '../theme';

const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

interface Props {
  /** Day index (1+). Determines curve length and "DAY ###" pill. */
  day: number;
  /** Per-day growth rate. 0.011 ≈ ~1.1% daily, the canonical "1% better" curve. */
  growthRate?: number;
  /** Mantra label shown as eyebrow above the title. */
  eyebrow?: string;
  /** Two-line italic-serif title. The accent fragment is rendered in ember. */
  titleLead?: string;
  titleAccent?: string;
  titleTail?: string;
}

export default function CompoundingHero({
  day,
  growthRate = 0.011,
  eyebrow = 'DAILY MANTRA',
  titleLead = 'Get ',
  titleAccent = '1% better',
  titleTail = '\nevery single day.',
}: Props) {
  const W = 320;
  const H = 96;
  const safeDay = Math.max(1, Math.round(day));
  const growth = Math.pow(1 + growthRate, safeDay);

  // Build the polyline points for the compounding curve, normalised to viewBox.
  const { path, fillPath, lastX, lastY, pathLength } = useMemo(() => {
    const pts: [number, number][] = [];
    const max = Math.pow(1 + growthRate, safeDay);
    for (let i = 0; i <= safeDay; i++) {
      const x = (i / safeDay) * W;
      const v = Math.pow(1 + growthRate, i);
      const denom = max - 1 || 1;
      const y = H - 6 - ((v - 1) / denom) * (H - 14);
      pts.push([x, y]);
    }
    const p = `M ${pts.map(pt => `${pt[0].toFixed(2)},${pt[1].toFixed(2)}`).join(' L ')}`;
    const fp = `${p} L ${W},${H} L 0,${H} Z`;
    // Approximate the path length for stroke-dasharray animation.
    let len = 0;
    for (let i = 1; i < pts.length; i++) {
      const dx = pts[i][0] - pts[i - 1][0];
      const dy = pts[i][1] - pts[i - 1][1];
      len += Math.sqrt(dx * dx + dy * dy);
    }
    return {
      path: p,
      fillPath: fp,
      lastX: pts[pts.length - 1][0],
      lastY: pts[pts.length - 1][1],
      pathLength: Math.max(len, 1),
    };
  }, [safeDay, growthRate]);

  // Self-drawing animation for the curve line.
  const drawAnim = useRef(new Animated.Value(0)).current;
  // Endpoint pulse (radius 4 → 6 → 4).
  const pulseAnim = useRef(new Animated.Value(4)).current;

  useEffect(() => {
    drawAnim.setValue(0);
    Animated.timing(drawAnim, {
      toValue: 1,
      duration: 2400,
      delay: 200,
      easing: Easing.bezier(0.2, 0.7, 0.2, 1),
      useNativeDriver: false,
    }).start();
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 6, duration: 1200, useNativeDriver: false }),
        Animated.timing(pulseAnim, { toValue: 4, duration: 1200, useNativeDriver: false }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [drawAnim, pulseAnim, pathLength]);

  const dashOffset = drawAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [pathLength, 0],
  });

  const dayLabel = `DAY · ${String(safeDay).padStart(3, '0')}`;
  const growthDisplay = growth >= 100 ? growth.toFixed(0) : growth.toFixed(1);
  const todayDelta = (growth * growthRate).toFixed(2);

  // Axis labels (4 ticks).
  const tick = (i: number) => `D ${Math.max(1, Math.round((safeDay * i) / 3))}`;

  return (
    <View style={styles.wrap}>
      <LinearGradient
        colors={['#1F2030', '#262738']}
        style={styles.bg}
      />
      {/* Violet bloom — top-right */}
      <LinearGradient
        colors={['rgba(155,138,232,0.22)', 'rgba(155,138,232,0)']}
        start={{ x: 1, y: 0 }}
        end={{ x: 0.4, y: 0.6 }}
        style={styles.bloomTopRight}
        pointerEvents="none"
      />
      {/* Magenta bloom — bottom-left */}
      <LinearGradient
        colors={['rgba(216,154,217,0.12)', 'rgba(216,154,217,0)']}
        start={{ x: 0, y: 1 }}
        end={{ x: 0.6, y: 0.4 }}
        style={styles.bloomBottomLeft}
        pointerEvents="none"
      />

      {/* Day pill */}
      <View style={styles.dayPill}>
        <Text style={styles.dayPillText}>{dayLabel}</Text>
      </View>

      {/* Eyebrow */}
      <Text style={styles.eyebrow}>{eyebrow}</Text>

      {/* Mantra — italic serif with ember accent on titleAccent */}
      <Text style={styles.mantra}>
        {titleLead}
        <Text style={styles.mantraAccent}>{titleAccent}</Text>
        {titleTail}
      </Text>

      {/* Compound row: big number + delta pill */}
      <View style={styles.compoundRow}>
        <Text style={styles.bigNumber}>
          {growthDisplay}
          <Text style={styles.bigNumberTimes}>×</Text>
        </Text>
        <View style={styles.deltaPill}>
          <Text style={styles.deltaText}>↗ +{todayDelta} today</Text>
        </View>
      </View>

      {/* Curve */}
      <View style={styles.curveWrap}>
        <Svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
          <Defs>
            <SvgGradient id="curveGrad" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0%" stopColor={colors.accent} stopOpacity="0.35" />
              <Stop offset="100%" stopColor={colors.accent} stopOpacity="0" />
            </SvgGradient>
          </Defs>
          <Line x1="0" y1={H - 6} x2={W} y2={H - 6} stroke={colors.line} strokeWidth="1" strokeDasharray="2 4" />
          <Path d={fillPath} fill="url(#curveGrad)" />
          <AnimatedPath
            d={path}
            fill="none"
            stroke={colors.accent}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray={pathLength as any}
            strokeDashoffset={dashOffset as any}
          />
          <AnimatedCircle cx={lastX} cy={lastY} r={pulseAnim as any} fill={colors.accent} stroke={colors.bg} strokeWidth="2" />
        </Svg>
        <View style={styles.axisRow} pointerEvents="none">
          <Text style={styles.axisText}>{tick(0)}</Text>
          <Text style={styles.axisText}>{tick(1)}</Text>
          <Text style={styles.axisText}>{tick(2)}</Text>
          <Text style={styles.axisText}>{tick(3)}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 22,
    paddingTop: 22,
    paddingBottom: 18,
    overflow: 'hidden',
    marginBottom: spacing.md,
  },
  bg: {
    ...StyleSheet.absoluteFillObject,
  },
  bloomTopRight: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: '70%',
    height: '70%',
    borderTopRightRadius: radius.xl,
  },
  bloomBottomLeft: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    width: '60%',
    height: '60%',
    borderBottomLeftRadius: radius.xl,
  },
  dayPill: {
    position: 'absolute',
    top: 18,
    right: 18,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: 'rgba(15,15,24,0.55)',
  },
  dayPillText: {
    fontFamily: fonts.mono,
    fontSize: 10,
    color: colors.textSecondary,
    letterSpacing: 1.6,
  },
  eyebrow: {
    fontFamily: fonts.mono,
    fontSize: 10,
    color: colors.textTertiary,
    letterSpacing: 1.8,
  },
  mantra: {
    fontFamily: fonts.serifItalic,
    fontSize: 28,
    lineHeight: 32,
    color: colors.text,
    marginTop: 8,
    marginBottom: 16,
    letterSpacing: -0.5,
  },
  mantraAccent: {
    fontFamily: fonts.serifItalic,
    color: colors.accent,
  },
  compoundRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginTop: 4,
    gap: 10,
  },
  bigNumber: {
    fontFamily: fonts.monoMedium,
    fontSize: 56,
    color: colors.text,
    letterSpacing: -2,
    lineHeight: 56,
  },
  bigNumberTimes: {
    fontFamily: fonts.monoMedium,
    fontSize: 56,
    color: colors.accent,
  },
  deltaPill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(118,201,156,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(118,201,156,0.3)',
    marginBottom: 6,
  },
  deltaText: {
    fontFamily: fonts.mono,
    fontSize: 12,
    color: colors.success,
  },
  curveWrap: {
    marginTop: 14,
    height: 96,
    position: 'relative',
  },
  axisRow: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  axisText: {
    fontFamily: fonts.mono,
    fontSize: 9,
    color: colors.textTertiary,
    letterSpacing: 1,
  },
});
