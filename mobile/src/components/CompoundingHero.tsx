/**
 * CompoundingHero — daily mantra hero card.
 *
 * Visual port of `Hero` from `app.jsx` in the design canvas:
 *   • Radial bloom corners over a warm surface gradient
 *   • Day pill (top-right), eyebrow label, italic-serif mantra
 *   • InteractiveCompoundChart (ideal-vs-actual with scrubber + range)
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import InteractiveCompoundChart from './InteractiveCompoundChart';
import { colors, fonts, radius, spacing } from '../theme';

interface Props {
  /** Day index (1+). Determines curve length and "DAY ###" pill. */
  day: number;
  /** Per-day actual multipliers (length day+1). Optional — falls back to demo walk. */
  actualSeries?: number[];
  /** Eyebrow label above the title. */
  eyebrow?: string;
  /** Two-line italic-serif title with an accent fragment in the middle. */
  titleLead?: string;
  titleAccent?: string;
  titleTail?: string;
}

export default function CompoundingHero({
  day,
  actualSeries,
  eyebrow = 'THE 1% LINE',
  titleLead = 'Get ',
  titleAccent = '1% better',
  titleTail = '\nevery single day.',
}: Props) {
  const safeDay = Math.max(1, Math.round(day));
  const dayLabel = `DAY · ${String(safeDay).padStart(3, '0')}`;

  return (
    <View style={styles.wrap}>
      <LinearGradient colors={['#1F2030', '#262738']} style={styles.bg} />
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

      {/* Mantra */}
      <Text style={styles.mantra}>
        {titleLead}
        <Text style={styles.mantraAccent}>{titleAccent}</Text>
        {titleTail}
      </Text>

      {/* Interactive compound chart */}
      <InteractiveCompoundChart day={safeDay} actualSeries={actualSeries} />
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
  bg: { ...StyleSheet.absoluteFillObject },
  bloomTopRight: {
    position: 'absolute',
    top: 0, right: 0,
    width: '70%', height: '70%',
    borderTopRightRadius: radius.xl,
  },
  bloomBottomLeft: {
    position: 'absolute',
    bottom: 0, left: 0,
    width: '60%', height: '60%',
    borderBottomLeftRadius: radius.xl,
  },
  dayPill: {
    position: 'absolute',
    top: 18, right: 18,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: 'rgba(15,15,24,0.55)',
    zIndex: 2,
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
    fontSize: 24,
    lineHeight: 28,
    color: colors.text,
    marginTop: 6,
    marginBottom: 14,
    letterSpacing: -0.5,
  },
  mantraAccent: {
    fontFamily: fonts.serifItalic,
    color: colors.accent,
  },
});
