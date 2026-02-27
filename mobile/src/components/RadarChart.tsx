/**
 * Radar Chart — TASK-011, P5-1 polish
 *
 * Five-axis spider chart showing relative pillar development.
 * Built with react-native-svg. Animated polygon scale on mount.
 */

import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
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

// Animated polygon component
const AnimatedPolygon = Animated.createAnimatedComponent(Polygon);

export default function RadarChart({ data, size = 220 }: RadarChartProps) {
  const center = size / 2;
  const radius = size / 2 - 30;
  const levels = 4;
  const animProgress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    animProgress.setValue(0);
    Animated.spring(animProgress, {
      toValue: 1,
      tension: 40,
      friction: 8,
      useNativeDriver: false,
    }).start();
  }, [data]);

  if (data.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>No data yet</Text>
      </View>
    );
  }

  const n = data.length;
  const angleStep = (2 * Math.PI) / n;
  const startAngle = -Math.PI / 2;

  const getPoint = (index: number, value: number): [number, number] => {
    const angle = startAngle + index * angleStep;
    const r = (value / 100) * radius;
    return [center + r * Math.cos(angle), center + r * Math.sin(angle)];
  };

  // Grid rings
  const gridRings = Array.from({ length: levels }, (_, i) => {
    const r = ((i + 1) / levels) * radius;
    return Array.from({ length: n }, (_, j) => {
      const angle = startAngle + j * angleStep;
      return `${center + r * Math.cos(angle)},${center + r * Math.sin(angle)}`;
    }).join(' ');
  });

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

  // Animated data polygon points — interpolate from center to actual position
  const animatedPoints = animProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [
      // All at center
      data.map(() => `${center},${center}`).join(' '),
      // Actual data positions
      data.map((d, i) => {
        const [x, y] = getPoint(i, d.score);
        return `${x},${y}`;
      }).join(' '),
    ],
  });

  return (
    <Svg width={size} height={size}>
      {/* Grid rings */}
      {gridRings.map((points, i) => (
        <Polygon key={`ring-${i}`} points={points} fill="none" stroke="#333" strokeWidth={1} opacity={0.5} />
      ))}

      {/* Axis lines */}
      {axes.map((a, i) => (
        <Line key={`axis-${i}`} x1={a.x1} y1={a.y1} x2={a.x2} y2={a.y2}
          stroke="#333" strokeWidth={1} opacity={0.5} />
      ))}

      {/* Animated data polygon */}
      <AnimatedPolygon
        points={animatedPoints}
        fill="#6366F1"
        fillOpacity={0.2}
        stroke="#6366F1"
        strokeWidth={2}
      />

      {/* Data points (static, appear at final position) */}
      {data.map((d, i) => {
        const [x, y] = getPoint(i, d.score);
        return (
          <Circle key={`pt-${i}`} cx={x} cy={y} r={4}
            fill={PILLAR_COLORS[d.pillar_id] || '#6366F1'} />
        );
      })}

      {/* Labels */}
      {labels.map((l, i) => (
        <SvgText key={`label-${i}`} x={l.x} y={l.y}
          fill="#aaa" fontSize={11} fontWeight="600" textAnchor="middle" alignmentBaseline="middle">
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
