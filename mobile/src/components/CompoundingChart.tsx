/**
 * Compounding Progress View — TASK-013, P5-1 polish
 *
 * Shows theoretical 1% daily compound curve vs actual cumulative progress.
 * Pan/scrub with floating tooltip + haptics.
 */

import React, { useState, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Dimensions, PanResponder } from 'react-native';
import Svg, { Path, Line, Text as SvgText, Circle } from 'react-native-svg';
import { DashboardStats } from '../api/client';
import { haptic } from '../utils/haptics';

interface CompoundingChartProps {
  stats: DashboardStats;
  firstEntryDate?: string;
  width?: number;
  height?: number;
  compact?: boolean;
}

const TIMEFRAMES = [
  { label: '30d', days: 30 },
  { label: '90d', days: 90 },
  { label: '1y', days: 365 },
];

const PADDING = { top: 10, right: 10, bottom: 30, left: 28 };

export default function CompoundingChart({
  stats,
  firstEntryDate,
  width: propWidth,
  height = 200,
  compact = false,
}: CompoundingChartProps) {
  const screenWidth = Dimensions.get('window').width - 72;
  const width = propWidth || screenWidth;
  const [timeframe, setTimeframe] = useState(90);
  const [scrubDay, setScrubDay] = useState<number | null>(null);
  const lastScrubDay = useRef<number>(-1);

  const chartW = width - PADDING.left - PADDING.right;
  const chartH = height - PADDING.top - PADDING.bottom;
  const days = Math.min(timeframe, 365);

  // Theoretical curve
  const theoreticalValues = Array.from({ length: days + 1 }, (_, i) => Math.pow(1.01, i));
  const maxTheoretical = theoreticalValues[theoreticalValues.length - 1];

  // Actual progress
  const totalEntries = (stats.pillar_breakdown || []).reduce((s, p) => s + (p.entry_count || 0), 0);
  const avgDepth = stats.avg_depth_score || 0;
  const dailyRate = totalEntries > 0 ? totalEntries / days : 0;
  const actualCompound = dailyRate > 0 ? (1 + 0.01 * dailyRate * (avgDepth / 50)) : 1;
  const actualValues = Array.from({ length: days + 1 }, (_, i) => Math.pow(actualCompound, i));
  const maxActual = actualValues[actualValues.length - 1] || 1.1;
  const maxY = Math.max(maxTheoretical || 1.1, maxActual, 1.1);

  const xScale = (i: number) => PADDING.left + (i / days) * chartW;
  const yScale = (v: number) => PADDING.top + chartH - ((v - 1) / (maxY - 1)) * chartH;

  const buildPath = (values: number[]): string =>
    values.map((v, i) => `${i === 0 ? 'M' : 'L'}${xScale(i)},${yScale(v)}`).join(' ');

  const theoreticalPath = buildPath(theoreticalValues);
  const actualPath = buildPath(actualValues);

  // Y labels
  const ySteps = 4;
  const yLabels = Array.from({ length: ySteps + 1 }, (_, i) => 1 + ((maxY - 1) / ySteps) * i);

  // Scrub handler
  const handleScrub = (locationX: number) => {
    const dayIdx = Math.round(((locationX - PADDING.left) / chartW) * days);
    const clamped = Math.max(0, Math.min(days, dayIdx));
    if (clamped !== lastScrubDay.current) {
      lastScrubDay.current = clamped;
      haptic.selection();
    }
    setScrubDay(clamped);
  };

  const panResponder = PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: (e) => handleScrub(e.nativeEvent.locationX),
    onPanResponderMove: (e) => handleScrub(e.nativeEvent.locationX),
    onPanResponderRelease: () => { setScrubDay(null); lastScrubDay.current = -1; },
  });

  return (
    <View>
      <View {...panResponder.panHandlers}>
        <Svg width={width} height={height}>
          {/* Y grid + labels */}
          {yLabels.map((v, i) => (
            <React.Fragment key={i}>
              <Line x1={PADDING.left} y1={yScale(v)} x2={width - PADDING.right} y2={yScale(v)}
                stroke="#333" strokeWidth={1} opacity={0.4} />
              <SvgText x={PADDING.left - 4} y={yScale(v) + 3} fill="#666" fontSize={9} textAnchor="end">
                {(v ?? 0).toFixed(1)}
              </SvgText>
            </React.Fragment>
          ))}

          {/* Theoretical (dashed) */}
          <Path d={theoreticalPath} fill="none" stroke="#666" strokeWidth={1.5} strokeDasharray="6,3" />

          {/* Actual */}
          <Path d={actualPath} fill="none" stroke="#6366F1" strokeWidth={2.5} />

          {/* Scrub indicator */}
          {scrubDay !== null && (
            <>
              <Line x1={xScale(scrubDay)} y1={PADDING.top} x2={xScale(scrubDay)}
                y2={height - PADDING.bottom} stroke="#fff" strokeWidth={1} opacity={0.3} />
              <Circle cx={xScale(scrubDay)} cy={yScale(actualValues[scrubDay])}
                r={5} fill="#6366F1" stroke="#fff" strokeWidth={2} />
              <Circle cx={xScale(scrubDay)} cy={yScale(theoreticalValues[scrubDay])}
                r={4} fill="#666" stroke="#fff" strokeWidth={1.5} />
            </>
          )}
        </Svg>
      </View>

      {/* Scrub tooltip */}
      {scrubDay !== null && (
        <View style={[styles.tooltip, {
          left: Math.max(0, Math.min(xScale(scrubDay) - 55, width - 120)),
        }]}>
          <Text style={styles.tooltipLabel}>Day {scrubDay}</Text>
          <Text style={[styles.tooltipVal, { color: '#6366F1' }]}>
            Actual: {(actualValues[scrubDay] ?? 0).toFixed(2)}x
          </Text>
          <Text style={[styles.tooltipVal, { color: '#888' }]}>
            Ideal: {(theoreticalValues[scrubDay] ?? 0).toFixed(2)}x
          </Text>
        </View>
      )}

      {/* Legend */}
      {!compact && (
        <View style={styles.legend}>
          <View style={styles.legendItem}>
            <View style={[styles.legendLine, { backgroundColor: '#6366F1' }]} />
            <Text style={styles.legendText}>Your progress</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendLine, { backgroundColor: '#666' }]} />
            <Text style={styles.legendText}>1% daily (ideal)</Text>
          </View>
        </View>
      )}

      {/* Timeframe selector */}
      {!compact && (
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
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  tooltip: {
    position: 'absolute', top: -12, backgroundColor: '#1a1a2e',
    borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', minWidth: 100,
  },
  tooltipLabel: { fontSize: 10, color: '#999', marginBottom: 2 },
  tooltipVal: { fontSize: 12, fontWeight: '600', fontVariant: ['tabular-nums'] as any },
  legend: { flexDirection: 'row', gap: 16, marginTop: 8 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendLine: { width: 16, height: 3, borderRadius: 1 },
  legendText: { fontSize: 11, color: '#666' },
  timeRow: { flexDirection: 'row', gap: 6, marginTop: 12 },
  timeChip: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12,
    backgroundColor: '#1a1a1a', borderWidth: 1, borderColor: '#333',
  },
  timeChipActive: { backgroundColor: '#6366F122', borderColor: '#6366F1' },
  timeText: { fontSize: 12, color: '#aaa', fontWeight: '600' },
  timeTextActive: { color: '#6366F1' },
});
