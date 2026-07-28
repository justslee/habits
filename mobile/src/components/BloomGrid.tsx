/**
 * BloomGrid — yearly compounding heatmap. Each cell is a day; intensity 0–4.
 * Ported from `app.jsx` `BloomGrid` in the design canvas.
 */

import React from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import { colors, fonts, radius } from '../theme';

interface Props {
  /** Per-day intensity values (0–4). The last cell is "today" and gets an outline. */
  values: number[];
  /** Section title (e.g. "The bloom · 182 days"). */
  title?: string;
  /** Sub line on right (e.g. "EVERY DOT IS A 1%"). */
  subtitle?: string;
  /** Footer left label (e.g. "JUL → JAN"). */
  rangeLabel?: string;
  /** Cells per row (default 26 → 7 rows ≈ 182 cells). */
  columns?: number;
}

const TINTS = [
  'rgba(155,138,232,0)',     // l0 — base (we'll fall back to `colors.line` background)
  'rgba(155,138,232,0.25)',  // l1
  'rgba(155,138,232,0.5)',   // l2
  'rgba(155,138,232,0.75)',  // l3
  'rgba(155,138,232,1.0)',   // l4
];

export default function BloomGrid({
  values,
  title = 'The bloom',
  subtitle = 'EVERY DOT IS A 1%',
  rangeLabel,
  columns = 26,
}: Props) {
  const screenW = Dimensions.get('window').width;
  // 16px page margin on each side, 16px card padding, (cols-1) * 3px gap
  const innerW = screenW - 32 - 36 - (columns - 1) * 3;
  const cell = Math.max(6, Math.floor(innerW / columns));

  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.sub}>{subtitle}</Text>
      </View>
      <View style={[styles.grid, { width: cell * columns + (columns - 1) * 3 }]}>
        {values.map((v, i) => {
          const lvl = Math.max(0, Math.min(4, Math.round(v)));
          const isToday = i === values.length - 1;
          return (
            <View
              key={i}
              style={{
                width: cell,
                height: cell,
                borderRadius: 2,
                backgroundColor: lvl === 0 ? colors.line : TINTS[lvl],
                marginRight: (i + 1) % columns === 0 ? 0 : 3,
                marginBottom: 3,
                borderWidth: isToday ? 1.5 : 0,
                borderColor: colors.text,
              }}
            />
          );
        })}
      </View>
      <View style={styles.foot}>
        <Text style={styles.footText}>{rangeLabel ?? ''}</Text>
        <View style={styles.legend}>
          <Text style={styles.legendLabel}>LESS</Text>
          {TINTS.slice(0, 5).map((c, i) => (
            <View
              key={i}
              style={{
                width: 10, height: 10, borderRadius: 2,
                backgroundColor: i === 0 ? colors.line : c,
              }}
            />
          ))}
          <Text style={styles.legendLabel}>MORE</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    
    marginBottom: 18,
    paddingVertical: 18,
    paddingHorizontal: 18,
    borderRadius: radius.xl,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
  },
  head: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 14,
  },
  title: {
    fontFamily: fonts.serifItalic,
    fontSize: 18,
    color: colors.text,
    letterSpacing: -0.5,
  },
  sub: {
    fontFamily: fonts.mono,
    fontSize: 10,
    color: colors.textTertiary,
    letterSpacing: 1.4,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  foot: {
    marginTop: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  footText: {
    fontFamily: fonts.mono,
    fontSize: 10,
    color: colors.textTertiary,
    letterSpacing: 1,
  },
  legend: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  legendLabel: {
    fontFamily: fonts.mono,
    fontSize: 10,
    color: colors.textTertiary,
    letterSpacing: 1.4,
  },
});
