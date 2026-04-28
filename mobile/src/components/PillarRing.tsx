/**
 * PillarRing — circular progress ring with `L{level}` in the center.
 * Ported from `tabs.jsx` `Ring` + Pillars list in the design canvas.
 */

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { colors, fonts, radius, spacing } from '../theme';

interface Props {
  /** Pillar display name. */
  name: string;
  /** Sub-line, e.g. "Run · Lift · Recovery" or "DB id 1 · 4 fields". */
  sub?: string;
  /** Pillar color (e.g. `colors.pillarQuant`). Falls back to accent. */
  color?: string;
  /** Mastery level, e.g. 4. */
  level: number;
  /** Progress 0..1. */
  progress: number;
  /** Number of habits / fields tracked under this pillar. */
  count?: number;
  /** Lifetime hours. */
  hours?: number;
  /** Tap handler — opens detail screen. */
  onPress?: () => void;
}

export default function PillarRing({
  name,
  sub,
  color = colors.accent,
  level,
  progress,
  count,
  hours,
  onPress,
}: Props) {
  const r = 24;
  const c = 2 * Math.PI * r;
  const dashOffset = c - Math.max(0, Math.min(1, progress)) * c;

  return (
    <TouchableOpacity activeOpacity={0.85} onPress={onPress} style={styles.row}>
      <View style={styles.ringWrap}>
        <Svg width={60} height={60} viewBox="0 0 60 60" style={{ transform: [{ rotate: '-90deg' }] }}>
          <Circle cx={30} cy={30} r={r} fill="none" stroke={colors.line} strokeWidth={3} />
          <Circle
            cx={30}
            cy={30}
            r={r}
            fill="none"
            stroke={color}
            strokeWidth={3}
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={dashOffset}
          />
        </Svg>
        <View style={styles.lvlOverlay}>
          <Text style={[styles.lvl, { color }]}>L{level}</Text>
        </View>
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.name}>{name}</Text>
        {!!sub && <Text style={styles.sub}>{sub}</Text>}
        {(count != null || hours != null) && (
          <Text style={styles.meta}>
            {count != null ? `${count} HABITS` : ''}
            {count != null && hours != null ? ' · ' : ''}
            {hours != null ? `${hours}h LIFETIME` : ''}
          </Text>
        )}
      </View>
      <View style={styles.right}>
        <Text style={[styles.pct, { color }]}>{Math.round(progress * 100)}%</Text>
        <Text style={styles.pctLabel}>THIS WEEK</Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: {
    
    marginBottom: 10,
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderRadius: radius.xl,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  ringWrap: { width: 60, height: 60, position: 'relative' },
  lvlOverlay: {
    position: 'absolute', inset: 0,
    alignItems: 'center', justifyContent: 'center',
  },
  lvl: {
    fontFamily: fonts.mono,
    fontSize: 13,
    letterSpacing: -0.3,
  },
  name: {
    fontFamily: fonts.serifItalic,
    fontSize: 22,
    color: colors.text,
    letterSpacing: -0.5,
  },
  sub: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  meta: {
    fontFamily: fonts.mono,
    fontSize: 9,
    color: colors.textTertiary,
    letterSpacing: 1.4,
    marginTop: 6,
  },
  right: { alignItems: 'flex-end' },
  pct: {
    fontFamily: fonts.mono,
    fontSize: 18,
  },
  pctLabel: {
    fontFamily: fonts.mono,
    fontSize: 9,
    color: colors.textTertiary,
    letterSpacing: 1.4,
    marginTop: 2,
  },
});
