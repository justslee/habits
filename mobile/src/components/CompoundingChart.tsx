/**
 * Compounding Progress View — TASK-013
 *
 * Shows theoretical 1% daily compound curve vs actual cumulative progress.
 */

import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Dimensions } from 'react-native';
import Svg, { Path, Line, Text as SvgText, Defs, LinearGradient, Stop, Rect } from 'react-native-svg';
import { DashboardStats } from '../api/client';

interface CompoundingChartProps {
  stats: DashboardStats;
  firstEntryDate?: string; // YYYY-MM-DD, if known
  width?: number;
  height?: number;
}

const TIMEFRAMES = [
  { label: '30d', days: 30 },
  { label: '90d', days: 90 },
  { label: '1y', days: 365 },
];

const PADDING = { top: 10, right: 10, bottom: 30, left: 45 };

export default function CompoundingChart({
  stats,
  firstEntryDate,
  width: propWidth,
  height = 200,
}: CompoundingChartProps) {
  const screenWidth = Dimensions.get('window').width - 72;
  const width = propWidth || screenWidth;
  const [timeframe, setTimeframe] = useState(90);

  // Calculate theoretical 1% daily compound: (1.01)^n
  // We normalize to a 0-based score that starts at 1.0
  const chartW = width - PADDING.left - PADDING.right;
  const chartH = height - PADDING.top - PADDING.bottom;

  const days = Math.min(timeframe, 365);

  // Theoretical curve values
  const theoreticalValues = Array.from({ length: days + 1 }, (_, i) =>
    Math.pow(1.01, i)
  );
  const maxTheoretical = theoreticalValues[theoreticalValues.length - 1];

  // Actual progress: cumulative depth score normalized
  // We use total hours as a proxy since we don't have day-by-day data here
  // Actual = entries logged / days * some factor
  const totalEntries = stats.pillar_breakdown.reduce((s, p) => s + p.entry_count, 0);
  const avgDepth = stats.avg_depth_score || 0;

  // Simulate actual curve: each day you log, you compound. Days you don't, flat.
  // Approximate: (entry_count / days) gives daily rate. Compound that.
  const dailyRate = totalEntries > 0 ? totalEntries / days : 0;
  const actualCompound = dailyRate > 0 ? (1 + 0.01 * dailyRate * (avgDepth / 50)) : 1;

  const actualValues = Array.from({ length: days + 1 }, (_, i) =>
    Math.pow(actualCompound, i)
  );
  const maxActual = actualValues[actualValues.length - 1];

  const maxY = Math.max(maxTheoretical, maxActual, 1.1);

  const xScale = (i: number) => PADDING.left + (i / days) * chartW;
  const yScale = (v: number) => PADDING.top + chartH - ((v - 1) / (maxY - 1)) * chartH;

  const buildPath = (values: number[]): string =>
    values
      .map((v, i) => `${i === 0 ? 'M' : 'L'}${xScale(i)},${yScale(v)}`)
      .join(' ');

  const theoreticalPath = buildPath(theoreticalValues);
  const actualPath = buildPath(actualValues);

  // Y labels
  const ySteps = 4;
  const yLabels = Array.from({ length: ySteps + 1 }, (_, i) => {
    const val = 1 + ((maxY - 1) / ySteps) * i;
    return val;
  });

  return (
    <View>
      <Svg width={width} height={height}>
        {/* Y grid + labels */}
        {yLabels.map((v, i) => (
          <React.Fragment key={i}>
            <Line
              x1={PADDING.left}
              y1={yScale(v)}
              x2={width - PADDING.right}
              y2={yScale(v)}
              stroke="#333"
              strokeWidth={1}
              opacity={0.4}
            />
            <SvgText
              x={PADDING.left - 5}
              y={yScale(v) + 4}
              fill="#666"
              fontSize={10}
              textAnchor="end"
            >
              {v.toFixed(1)}x
            </SvgText>
          </React.Fragment>
        ))}

        {/* Theoretical line (dashed) */}
        <Path
          d={theoreticalPath}
          fill="none"
          stroke="#666"
          strokeWidth={1.5}
          strokeDasharray="6,3"
        />

        {/* Actual line */}
        <Path
          d={actualPath}
          fill="none"
          stroke="#2563eb"
          strokeWidth={2.5}
        />
      </Svg>

      {/* Legend */}
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendLine, { backgroundColor: '#2563eb' }]} />
          <Text style={styles.legendText}>Your progress</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendLine, { backgroundColor: '#666', borderStyle: 'dashed' }]} />
          <Text style={styles.legendText}>1% daily (ideal)</Text>
        </View>
      </View>

      {/* Timeframe selector */}
      <View style={styles.timeRow}>
        {TIMEFRAMES.map((tf) => (
          <TouchableOpacity
            key={tf.days}
            style={[styles.timeChip, timeframe === tf.days && styles.timeChipActive]}
            onPress={() => setTimeframe(tf.days)}
          >
            <Text style={[styles.timeText, timeframe === tf.days && styles.timeTextActive]}>
              {tf.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  legend: { flexDirection: 'row', gap: 16, marginTop: 8 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendLine: { width: 16, height: 3, borderRadius: 1 },
  legendText: { fontSize: 11, color: '#666' },
  timeRow: { flexDirection: 'row', gap: 6, marginTop: 12 },
  timeChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#333',
  },
  timeChipActive: { backgroundColor: '#2563eb22', borderColor: '#2563eb' },
  timeText: { fontSize: 12, color: '#aaa', fontWeight: '600' },
  timeTextActive: { color: '#2563eb' },
});
