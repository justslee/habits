/**
 * Radar Chart — TASK-011
 *
 * Five-axis spider chart showing relative pillar development.
 * Built with react-native-svg for lightweight rendering.
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Polygon, Line, Circle, Text as SvgText } from 'react-native-svg';

interface PillarScore {
  pillar_id: number;
  pillar_name: string;
  score: number; // 0-100 normalized
}

interface RadarChartProps {
  data: PillarScore[];
  size?: number;
}

const PILLAR_COLORS: Record<number, string> = {
  1: '#3b82f6',
  2: '#f59e0b',
  3: '#8b5cf6',
  4: '#10b981',
  5: '#ef4444',
};

const SHORT_NAMES: Record<number, string> = {
  1: 'QF',
  2: 'MI',
  3: 'ML',
  4: 'AI',
  5: 'PS',
};

export default function RadarChart({ data, size = 220 }: RadarChartProps) {
  const center = size / 2;
  const radius = size / 2 - 30;
  const levels = 4; // concentric rings

  if (data.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>No data yet</Text>
      </View>
    );
  }

  const n = data.length;
  const angleStep = (2 * Math.PI) / n;
  // Start from top (-π/2)
  const startAngle = -Math.PI / 2;

  const getPoint = (index: number, value: number): [number, number] => {
    const angle = startAngle + index * angleStep;
    const r = (value / 100) * radius;
    return [center + r * Math.cos(angle), center + r * Math.sin(angle)];
  };

  // Build grid rings
  const gridRings = Array.from({ length: levels }, (_, i) => {
    const r = ((i + 1) / levels) * radius;
    const points = Array.from({ length: n }, (_, j) => {
      const angle = startAngle + j * angleStep;
      return `${center + r * Math.cos(angle)},${center + r * Math.sin(angle)}`;
    }).join(' ');
    return points;
  });

  // Build data polygon
  const dataPoints = data.map((d, i) => {
    const [x, y] = getPoint(i, d.score);
    return `${x},${y}`;
  }).join(' ');

  // Axis lines
  const axes = data.map((_, i) => {
    const [x, y] = getPoint(i, 100);
    return { x1: center, y1: center, x2: x, y2: y };
  });

  // Labels
  const labels = data.map((d, i) => {
    const [x, y] = getPoint(i, 120);
    return { x, y, text: SHORT_NAMES[d.pillar_id] || d.pillar_name.substring(0, 2) };
  });

  return (
    <Svg width={size} height={size}>
      {/* Grid rings */}
      {gridRings.map((points, i) => (
        <Polygon
          key={`ring-${i}`}
          points={points}
          fill="none"
          stroke="#333"
          strokeWidth={1}
          opacity={0.5}
        />
      ))}

      {/* Axis lines */}
      {axes.map((a, i) => (
        <Line
          key={`axis-${i}`}
          x1={a.x1}
          y1={a.y1}
          x2={a.x2}
          y2={a.y2}
          stroke="#333"
          strokeWidth={1}
          opacity={0.5}
        />
      ))}

      {/* Data polygon */}
      <Polygon
        points={dataPoints}
        fill="#2563eb"
        fillOpacity={0.2}
        stroke="#2563eb"
        strokeWidth={2}
      />

      {/* Data points */}
      {data.map((d, i) => {
        const [x, y] = getPoint(i, d.score);
        return (
          <Circle
            key={`pt-${i}`}
            cx={x}
            cy={y}
            r={4}
            fill={PILLAR_COLORS[d.pillar_id] || '#2563eb'}
          />
        );
      })}

      {/* Labels */}
      {labels.map((l, i) => (
        <SvgText
          key={`label-${i}`}
          x={l.x}
          y={l.y}
          fill="#aaa"
          fontSize={11}
          fontWeight="600"
          textAnchor="middle"
          alignmentBaseline="middle"
        >
          {l.text}
        </SvgText>
      ))}
    </Svg>
  );
}

const styles = StyleSheet.create({
  empty: { height: 120, alignItems: 'center', justifyContent: 'center' },
  emptyText: { color: '#666', fontSize: 14 },
});
