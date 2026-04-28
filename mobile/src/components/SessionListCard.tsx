/**
 * SessionListCard — recent training sessions table with mini sparklines.
 * Ported from `tabs.jsx` `RecentSessions` in the design canvas.
 */

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import Svg, { Polyline } from 'react-native-svg';
import { colors, fonts, radius, spacing } from '../theme';

export interface SessionRow {
  id: string | number;
  /** Day pill, e.g. "TODAY", "WED", "MON". */
  day: string;
  /** Sub line, e.g. "Apr 23". */
  when: string;
  /** Session title — wrapping for length. */
  title: string;
  /** Three column metrics in display order — labels chosen by the screen. */
  metrics: [string, string, string];
  /** Show a small "PR" pill next to the title. */
  pr?: boolean;
  /** Highlight as the currently active/today row. */
  active?: boolean;
  /** Mini sparkline data — 4–12 numbers. */
  trend?: number[];
}

interface Props {
  sessions: SessionRow[];
  /** Three column header labels matching the row metrics order. */
  labels: [string, string, string];
  onPress?: (s: SessionRow) => void;
}

export default function SessionListCard({ sessions, labels, onPress }: Props) {
  return (
    <View style={styles.card}>
      {/* Header */}
      <View style={[styles.row, styles.header]}>
        <Text style={[styles.headerCell, { width: 54 }]}>DATE</Text>
        <Text style={[styles.headerCell, { flex: 1 }]}>SESSION</Text>
        <Text style={[styles.headerCell, { width: 64, textAlign: 'right' }]}>{labels[0]}</Text>
        <Text style={[styles.headerCell, { width: 64, textAlign: 'right' }]}>{labels[1]}</Text>
        <Text style={[styles.headerCell, { width: 56, textAlign: 'right' }]}>{labels[2]}</Text>
      </View>
      {/* Rows */}
      {sessions.map((s, i) => (
        <TouchableOpacity
          key={s.id}
          activeOpacity={0.85}
          onPress={() => onPress?.(s)}
          style={[
            styles.row,
            { paddingVertical: 11 },
            i > 0 && { borderTopWidth: 1, borderTopColor: colors.line },
            s.active && { backgroundColor: 'rgba(155,138,232,0.06)' },
          ]}
        >
          <View style={{ width: 54 }}>
            <Text style={[styles.day, { color: s.active ? colors.accent : colors.textSecondary }]}>{s.day}</Text>
            <Text style={styles.when}>{s.when}</Text>
          </View>
          <View style={{ flex: 1, paddingRight: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text numberOfLines={1} style={styles.title}>{s.title}</Text>
              {s.pr && <View style={styles.prPill}><Text style={styles.prText}>PR</Text></View>}
            </View>
            {s.trend && s.trend.length > 1 && (
              <Spark trend={s.trend} active={!!s.active} />
            )}
          </View>
          <Text style={[styles.metricA, { width: 64 }]}>{s.metrics[0]}</Text>
          <Text style={[styles.metricB, { width: 64 }]}>{s.metrics[1]}</Text>
          <Text style={[styles.metricC, { width: 56 }]}>{s.metrics[2]}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

function Spark({ trend, active }: { trend: number[]; active: boolean }) {
  const min = Math.min(...trend);
  const max = Math.max(...trend);
  const range = max - min || 1;
  const tw = 50, th = 16;
  const points = trend
    .map((v, j) => {
      const x = (j / (trend.length - 1)) * tw;
      const y = th - ((v - min) / range) * th;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  return (
    <Svg width={tw} height={th} viewBox={`0 0 ${tw} ${th}`} style={{ marginTop: 4, opacity: 0.7 }}>
      <Polyline
        points={points}
        fill="none"
        stroke={active ? colors.accent : colors.textSecondary}
        strokeWidth={1}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: spacing.md,
    borderRadius: radius.xl,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    gap: 10,
  },
  header: {
    paddingVertical: 9,
    backgroundColor: 'rgba(0,0,0,0.25)',
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  headerCell: {
    fontFamily: fonts.mono,
    fontSize: 9,
    color: colors.textTertiary,
    letterSpacing: 1.8,
  },
  day: {
    fontFamily: fonts.mono,
    fontSize: 10,
    letterSpacing: 1.4,
  },
  when: {
    fontFamily: fonts.mono,
    fontSize: 8,
    color: colors.textTertiary,
    letterSpacing: 1,
    marginTop: 2,
  },
  title: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.text,
  },
  prPill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: 'rgba(217,197,111,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(217,197,111,0.4)',
  },
  prText: {
    fontFamily: fonts.mono,
    fontSize: 8,
    color: colors.prGold,
    letterSpacing: 1.4,
  },
  metricA: {
    fontFamily: fonts.mono,
    fontSize: 12,
    color: colors.text,
    textAlign: 'right',
  },
  metricB: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: colors.textSecondary,
    textAlign: 'right',
  },
  metricC: {
    fontFamily: fonts.mono,
    fontSize: 10,
    color: colors.textTertiary,
    textAlign: 'right',
    letterSpacing: 1,
  },
});
