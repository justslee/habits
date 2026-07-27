/**
 * WhoopHeroCard — compact recovery card matching the design canvas.
 * Recovery ring on the left, italic-serif "your body is asking to push" on the
 * right, and three metric pills (STRAIN / SLEEP / HRV) below.
 *
 * Direct port of `WhoopCard` from `home-extras.jsx` in the design canvas.
 *
 * The existing `WhoopCard.tsx` (Whoop-branded green/yellow/red palette + sleep
 * stages + HR zones) remains for screens that want the rich detail; this is the
 * Ink-themed compact variant for the Train TODAY view.
 */

import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Easing } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, Defs, LinearGradient as SvgLG, Stop } from 'react-native-svg';
import { WhoopData } from '../api/client';
import { colors, fonts, radius } from '../theme';

interface Props {
  data: WhoopData;
}

const RECOVERY_GREEN = colors.recoveryGreen; // #7DD3A4

function recoveryMessage(score: number | null): string {
  if (score == null) return 'No recovery data yet — sync your wearable.';
  if (score >= 67) return 'Green — your body is asking to push.';
  if (score >= 34) return 'Yellow — train, but with restraint.';
  return 'Red — recover, do not stack stress.';
}

export default function WhoopHeroCard({ data }: Props) {
  const recovery = data.recovery_score ?? 0;
  const strain = data.strain_score ?? 0;
  const sleepHours = data.total_sleep_minutes != null
    ? Math.round((data.total_sleep_minutes / 60) * 10) / 10
    : null;
  const hrv = data.hrv ?? null;
  const ringColor = recovery >= 67 ? RECOVERY_GREEN
    : recovery >= 34 ? colors.warn
    : colors.error;

  const r = 26;
  const c = 2 * Math.PI * r;
  const dashOffset = c - (recovery / 100) * c;

  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 1000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  return (
    <View style={styles.wrap}>
      {/* layered radial blooms — green + violet + amber */}
      <LinearGradient
        colors={['rgba(125,211,164,0.22)', 'transparent']}
        start={{ x: 0, y: 0 }}
        end={{ x: 0.6, y: 0.6 }}
        style={[StyleSheet.absoluteFill, styles.bloom]}
      />
      <LinearGradient
        colors={['rgba(155,138,232,0.14)', 'transparent']}
        start={{ x: 1, y: 0 }}
        end={{ x: 0.4, y: 0.6 }}
        style={[StyleSheet.absoluteFill, styles.bloom]}
      />
      <LinearGradient
        colors={['rgba(155,138,232,0.18)', 'transparent']}
        start={{ x: 1, y: 1 }}
        end={{ x: 0.4, y: 0.4 }}
        style={[StyleSheet.absoluteFill, styles.bloom]}
      />

      <View style={styles.heroRow}>
        <View style={styles.ringBox}>
          <Svg width={72} height={72} viewBox="0 0 72 72" style={{ transform: [{ rotate: '-90deg' }] }}>
            <Defs>
              <SvgLG id="whoopRecov" x1="0" y1="0" x2="1" y2="1">
                <Stop offset="0" stopColor={ringColor} />
                <Stop offset="1" stopColor={ringColor} stopOpacity="0.7" />
              </SvgLG>
            </Defs>
            <Circle cx={36} cy={36} r={r} fill="none" stroke={colors.line} strokeWidth={4} />
            <Circle
              cx={36} cy={36} r={r}
              fill="none"
              stroke="url(#whoopRecov)"
              strokeWidth={4}
              strokeLinecap="round"
              strokeDasharray={c}
              strokeDashoffset={dashOffset}
            />
          </Svg>
          <View style={styles.ringScore}>
            <Text style={[styles.ringScoreText, { color: ringColor }]}>{Math.round(recovery)}</Text>
          </View>
        </View>

        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={styles.eyebrowRow}>
            <Animated.View
              style={[
                styles.eyebrowDot,
                { backgroundColor: ringColor, opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] }) },
              ]}
            />
            <Text style={[styles.eyebrowText, { color: ringColor }]}>WHOOP · RECOVERY</Text>
          </View>
          <Text style={styles.message}>{recoveryMessage(data.recovery_score)}</Text>
        </View>
      </View>

      {/* 3 metric pills */}
      <View style={styles.pillRow}>
        <MetricPill label="STRAIN" value={strain ? strain.toFixed(1) : '—'} color="#E8B07A" />
        <MetricPill label="SLEEP" value={sleepHours != null ? `${sleepHours}h` : '—'} color="#9B8AE8" />
        <MetricPill label="HRV" value={hrv != null ? `${Math.round(hrv)}` : '—'} color="#7AB0E8" />
      </View>
    </View>
  );
}

function MetricPill({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={[styles.pill, { borderColor: `${color}55` }]}>
      <Text style={[styles.pillVal, { color }]}>{value}</Text>
      <Text style={styles.pillLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginHorizontal: 16,
    marginBottom: 14,
    paddingHorizontal: 18,
    paddingVertical: 16,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: 'rgba(125,211,164,0.35)',
    backgroundColor: colors.card,
    overflow: 'hidden',
    position: 'relative',
  },
  bloom: { borderRadius: radius.xl },

  heroRow: {
    flexDirection: 'row',
    gap: 16,
    alignItems: 'center',
  },
  ringBox: { width: 72, height: 72, position: 'relative' },
  ringScore: {
    position: 'absolute', inset: 0,
    alignItems: 'center', justifyContent: 'center',
  },
  ringScoreText: {
    fontFamily: fonts.mono,
    fontSize: 18,
  },

  eyebrowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  eyebrowDot: {
    width: 6, height: 6, borderRadius: 3,
  },
  eyebrowText: {
    fontFamily: fonts.mono,
    fontSize: 9,
    letterSpacing: 1.8,
  },
  message: {
    fontFamily: fonts.serifItalic,
    fontSize: 19,
    color: colors.text,
    marginTop: 6,
    lineHeight: 24,
  },

  pillRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 14,
  },
  pill: {
    flex: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: 'rgba(15,15,24,0.5)',
    borderWidth: 1,
  },
  pillVal: {
    fontFamily: fonts.mono,
    fontSize: 16,
    letterSpacing: -0.4,
  },
  pillLabel: {
    fontFamily: fonts.mono,
    fontSize: 9,
    color: colors.textTertiary,
    letterSpacing: 1.4,
    marginTop: 2,
  },
});
