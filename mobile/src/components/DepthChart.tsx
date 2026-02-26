/**
 * Depth Progression Chart — TASK-012
 *
 * Line chart showing depth score trends per pillar over time.
 * Built with react-native-svg.
 */

import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Dimensions } from 'react-native';
import Svg, { Path, Line, Circle, Text as SvgText } from 'react-native-svg';
import { DepthProgressionPoint } from '../api/client';

interface DepthChartProps {
  data: DepthProgressionPoint[];
  width?: number;
  height?: number;
}

const PILLAR_COLORS: Record<number, string> = {
  1: '#3b82f6',
  2: '#f59e0b',
  3: '#8b5cf6',
  4: '#10b981',
  5: '#ef4444',
};

const PILLAR_NAMES: Record<number, string> = {
  1: 'QF',
  2: 'MI',
  3: 'ML',
  4: 'AI',
  5: 'PS',
};

const PADDING = { top: 10, right: 10, bottom: 30, left: 35 };

export default function DepthChart({ data, width: propWidth, height = 200 }: DepthChartProps) {
  const screenWidth = Dimensions.get('window').width - 72; // account for card padding
  const width = propWidth || screenWidth;
  const [selectedPillar, setSelectedPillar] = useState<number | null>(null);

  if (data.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>No depth data yet</Text>
      </View>
    );
  }

  // Group by pillar
  const byPillar = new Map<number, DepthProgressionPoint[]>();
  for (const point of data) {
    const arr = byPillar.get(point.pillar_id) || [];
    arr.push(point);
    byPillar.set(point.pillar_id, arr);
  }

  const pillarIds = Array.from(byPillar.keys()).sort();
  const visiblePillars = selectedPillar !== null ? [selectedPillar] : pillarIds;

  // Date range
  const allDates = data.map((d) => new Date(d.date + 'T00:00:00').getTime());
  const minDate = Math.min(...allDates);
  const maxDate = Math.max(...allDates);
  const dateRange = maxDate - minDate || 1;

  const chartW = width - PADDING.left - PADDING.right;
  const chartH = height - PADDING.top - PADDING.bottom;

  const xScale = (d: string) => {
    const t = new Date(d + 'T00:00:00').getTime();
    return PADDING.left + ((t - minDate) / dateRange) * chartW;
  };
  const yScale = (v: number) => PADDING.top + chartH - (v / 100) * chartH;

  // Build paths with moving average (3-point)
  const buildPath = (points: DepthProgressionPoint[]): string => {
    if (points.length === 0) return '';
    // Sort by date
    const sorted = [...points].sort((a, b) => a.date.localeCompare(b.date));

    // Simple moving average for smoothing
    const smoothed = sorted.map((p, i) => {
      const window = sorted.slice(Math.max(0, i - 1), i + 2);
      const avg = window.reduce((s, w) => s + w.depth_score, 0) / window.length;
      return { ...p, depth_score: avg };
    });

    return smoothed
      .map((p, i) => {
        const x = xScale(p.date);
        const y = yScale(p.depth_score);
        return `${i === 0 ? 'M' : 'L'}${x},${y}`;
      })
      .join(' ');
  };

  // Y-axis labels
  const yLabels = [0, 25, 50, 75, 100];

  return (
    <View>
      <Svg width={width} height={height}>
        {/* Y-axis grid lines + labels */}
        {yLabels.map((v) => (
          <React.Fragment key={v}>
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
              {v}
            </SvgText>
          </React.Fragment>
        ))}

        {/* Lines per pillar */}
        {visiblePillars.map((pid) => {
          const points = byPillar.get(pid);
          if (!points || points.length === 0) return null;
          const path = buildPath(points);
          const color = PILLAR_COLORS[pid] || '#fff';
          return (
            <React.Fragment key={pid}>
              <Path d={path} fill="none" stroke={color} strokeWidth={2} />
              {/* Data points */}
              {points.map((p, i) => (
                <Circle
                  key={`${pid}-${i}`}
                  cx={xScale(p.date)}
                  cy={yScale(p.depth_score)}
                  r={3}
                  fill={color}
                  opacity={0.7}
                />
              ))}
            </React.Fragment>
          );
        })}
      </Svg>

      {/* Pillar filter chips */}
      <View style={styles.filterRow}>
        <TouchableOpacity
          style={[styles.filterChip, selectedPillar === null && styles.filterChipActive]}
          onPress={() => setSelectedPillar(null)}
        >
          <Text style={[styles.filterText, selectedPillar === null && styles.filterTextActive]}>
            All
          </Text>
        </TouchableOpacity>
        {pillarIds.map((pid) => (
          <TouchableOpacity
            key={pid}
            style={[
              styles.filterChip,
              selectedPillar === pid && { backgroundColor: PILLAR_COLORS[pid] + '33', borderColor: PILLAR_COLORS[pid] },
            ]}
            onPress={() => setSelectedPillar(selectedPillar === pid ? null : pid)}
          >
            <View style={[styles.filterDot, { backgroundColor: PILLAR_COLORS[pid] }]} />
            <Text style={[styles.filterText, selectedPillar === pid && { color: PILLAR_COLORS[pid] }]}>
              {PILLAR_NAMES[pid] || pid}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { height: 120, alignItems: 'center', justifyContent: 'center' },
  emptyText: { color: '#666', fontSize: 14 },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#333',
    gap: 4,
  },
  filterChipActive: { backgroundColor: '#2563eb22', borderColor: '#2563eb' },
  filterDot: { width: 8, height: 8, borderRadius: 4 },
  filterText: { color: '#aaa', fontSize: 12, fontWeight: '600' },
  filterTextActive: { color: '#2563eb' },
});
