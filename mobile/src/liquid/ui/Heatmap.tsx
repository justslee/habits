/**
 * The activity heatmap: one column per week, one cell per day, shaded by how much was logged.
 *
 * Tapping a day selects it; dragging across scrubs with a throttled selection tick. Both have
 * a visible equivalent in the stepper, and the grid carries increment/decrement actions for
 * VoiceOver. Logged activity and habit completion are separate measures and are never mixed.
 */

import React, { useCallback, useMemo, useState } from 'react';
import { LayoutChangeEvent, Pressable, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme';
import { gesture } from '../tokens';
import { feel } from '../haptics';
import { Small } from './Text';
import { InlineButton } from './Button';
import { prettyDate } from './Chart';

const ROWS = 7;
const GAP = 3;

export interface HeatCell { date: string; count: number }

export function Heatmap({
  cells, label, selected, onSelect, onOpenDay,
}: {
  cells: HeatCell[];
  label: string;
  selected: number;
  onSelect: (i: number) => void;
  onOpenDay?: () => void;
}) {
  const { c } = useTheme();
  const [width, setWidth] = useState(0);
  const columns = Math.ceil(cells.length / ROWS);
  const cellW = width > 0 ? (width - GAP * (columns - 1)) / columns : 0;

  const onLayout = useCallback((e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width), []);

  const shade = useCallback((count: number) => {
    if (count >= 4) return c.accent;
    if (count === 3) return c.jade;
    if (count === 2) return mix(c.jade, c.panel, 0.5);
    if (count === 1) return mix(c.jade, c.panel, 0.25);
    return c.panel2;
  }, [c]);

  const pick = useCallback((x: number, y: number) => {
    if (cellW <= 0) return;
    const col = Math.floor(x / (cellW + GAP));
    const row = Math.floor(y / (11 + GAP));
    const i = col * ROWS + Math.max(0, Math.min(ROWS - 1, row));
    const next = Math.max(0, Math.min(cells.length - 1, i));
    if (next !== selected) { feel.tick(); onSelect(next); }
  }, [cellW, cells.length, selected, onSelect]);

  const step = useCallback((d: number) => {
    const next = Math.max(0, Math.min(cells.length - 1, selected + d));
    if (next !== selected) { feel.tick(); onSelect(next); }
  }, [cells.length, selected, onSelect]);

  const pan = Gesture.Pan()
    .activeOffsetX([-gesture.horizontalIntent, gesture.horizontalIntent])
    .failOffsetY([-gesture.cancelMove, gesture.cancelMove])
    .onBegin(e => { runOnJS(pick)(e.x, e.y); })
    .onUpdate(e => { runOnJS(pick)(e.x, e.y); });

  const active = useMemo(() => cells.filter(d => d.count > 0).length, [cells]);
  const current = cells[selected];

  return (
    <View style={[s.wrap, { backgroundColor: c.panel }]}>
      <View style={s.row}>
        <Small>{label}</Small>
        <Small>{active} active days</Small>
      </View>

      <GestureDetector gesture={pan}>
        <View
          onLayout={onLayout}
          style={s.grid}
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel={`${cells.length} days of logged activity`}
          accessibilityValue={{ text: `${prettyDate(current?.date)}, ${current?.count ?? 0} sessions` }}
          accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
          onAccessibilityAction={e => step(e.nativeEvent.actionName === 'increment' ? 1 : -1)}
        >
          {Array.from({ length: columns }, (_, col) => (
            <View key={col} style={{ width: cellW, gap: GAP }}>
              {Array.from({ length: ROWS }, (_, row) => {
                const i = col * ROWS + row;
                const cell = cells[i];
                if (!cell) return <View key={row} style={{ height: 11 }} />;
                const isSelected = i === selected;
                return (
                  <View
                    key={row}
                    style={[
                      { height: 11, borderRadius: 2, backgroundColor: shade(cell.count) },
                      isSelected && { borderWidth: 1, borderColor: c.fg, borderRadius: 4 },
                    ]}
                  />
                );
              })}
            </View>
          ))}
        </View>
      </GestureDetector>

      <View style={s.row}>
        <Small style={{ color: c.fg, fontSize: 12 }}>{prettyDate(current?.date)}</Small>
        <Small style={{ fontSize: 12 }}>{current?.count ?? 0} sessions</Small>
      </View>

      <View style={[s.row, { marginTop: 10 }]}>
        <Small>Less ··· More</Small>
        <View style={s.steppers}>
          <Pressable accessibilityRole="button" accessibilityLabel="Earlier day" onPress={() => step(-1)} hitSlop={8} style={s.stepBtn}>
            <Ionicons name="chevron-back" size={16} color={c.muted} />
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Later day" onPress={() => step(1)} hitSlop={8} style={s.stepBtn}>
            <Ionicons name="chevron-forward" size={16} color={c.muted} />
          </Pressable>
          {onOpenDay ? <InlineButton label="View this day" onPress={onOpenDay} /> : null}
        </View>
      </View>
    </View>
  );
}

/** Blend two hex colours, for the heatmap's intermediate shades. */
function mix(a: string, b: string, t: number): string {
  const p = (h: string) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const [r1, g1, b1] = p(a);
  const [r2, g2, b2] = p(b);
  const ch = (x: number, y: number) => Math.round(y + (x - y) * t);
  return `rgb(${ch(r1, r2)},${ch(g1, g2)},${ch(b1, b2)})`;
}

const s = StyleSheet.create({
  wrap: { padding: 17, borderRadius: 19, marginVertical: 13 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  grid: { flexDirection: 'row', gap: GAP, marginVertical: 15 },
  steppers: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  stepBtn: { width: 40, height: 36, alignItems: 'center', justifyContent: 'center' },
});
