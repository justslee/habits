/**
 * VerdictCard — pillar verdict card with depth ring and 1%/FLAT pill.
 * Ported from `daily-review-sheet.jsx` `VerdictCard` in the design canvas.
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, fonts, radius, spacing } from '../theme';

interface Props {
  /** Pillar full name. */
  name: string;
  /** Pillar accent color (left border). */
  color?: string;
  /** Minutes logged today. 0 means no work logged. */
  minutes: number;
  /** Depth score 0–100. */
  depth: number;
  /** True if the pillar earned the +1% verdict today. */
  oneP: boolean;
  /** One-line reason from the AI. */
  reason: string;
}

function depthColor(d: number) {
  if (d >= 60) return colors.recoveryGreen;
  if (d >= 40) return colors.warn;
  if (d > 0) return colors.error;
  return colors.textTertiary;
}

export default function VerdictCard({ name, color, minutes, depth, oneP, reason }: Props) {
  const c = depthColor(depth);
  const accent = color ?? colors.accent;
  return (
    <View style={[styles.card, { borderLeftColor: accent }]}>
      <View style={styles.row}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.name}>{name}</Text>
          <Text style={styles.minutes}>
            {minutes > 0 ? `${minutes} min logged` : 'no work logged'}
          </Text>
        </View>
        <View style={[styles.depthRing, { borderColor: c }]}>
          <Text style={[styles.depth, { color: c }]}>{depth}</Text>
        </View>
        <View style={[
          styles.pill,
          oneP
            ? { backgroundColor: 'rgba(125,211,164,0.14)', borderColor: 'rgba(125,211,164,0.4)' }
            : { backgroundColor: 'rgba(111,112,138,0.08)', borderColor: colors.line },
        ]}>
          <Text style={[styles.pillText, { color: oneP ? colors.recoveryGreen : colors.textTertiary }]}>
            {oneP ? '↑ 1%' : 'FLAT'}
          </Text>
        </View>
      </View>
      <Text style={styles.reason}>{reason}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.bg2,
    borderWidth: 1,
    borderColor: colors.line,
    borderLeftWidth: 3,
    borderRadius: 12,
    padding: 14,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  name: {
    fontFamily: fonts.semibold,
    fontSize: 14,
    color: colors.text,
  },
  minutes: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: colors.textTertiary,
    letterSpacing: 1,
    marginTop: 3,
  },
  depthRing: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  depth: {
    fontFamily: fonts.mono,
    fontSize: 14,
    letterSpacing: -0.5,
  },
  pill: {
    alignSelf: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
  },
  pillText: {
    fontFamily: fonts.mono,
    fontSize: 10,
    letterSpacing: 1.4,
  },
  reason: {
    fontFamily: fonts.regular,
    fontSize: 13,
    lineHeight: 19,
    color: colors.textSecondary,
    marginTop: 10,
  },
});
