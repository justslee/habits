/**
 * DRSlider — 10-segment tappable slider.
 * Ported from `daily-review-sheet.jsx` `DRSlider` in the design canvas.
 */

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { colors, fonts } from '../theme';
import { haptic } from '../utils/haptics';

interface Props {
  label: string;
  value: number;        // 1..10
  onChange: (next: number) => void;
  /** Override fill color. */
  color?: string;
}

export default function DRSlider({ label, value, onChange, color = colors.accent }: Props) {
  return (
    <View style={styles.wrap}>
      <View style={styles.headRow}>
        <Text style={styles.label}>{label.toUpperCase()}</Text>
        <Text style={[styles.val, { color }]}>
          {value}
          <Text style={{ color: colors.textTertiary }}>/10</Text>
        </Text>
      </View>
      <View style={styles.segments}>
        {Array.from({ length: 10 }).map((_, i) => {
          const n = i + 1;
          const on = value >= n;
          return (
            <TouchableOpacity
              key={n}
              onPress={() => {
                onChange(n);
                haptic.selection();
              }}
              activeOpacity={0.85}
              style={[
                styles.seg,
                {
                  backgroundColor: on ? color : colors.bg2,
                  borderTopLeftRadius: i === 0 ? 6 : 0,
                  borderBottomLeftRadius: i === 0 ? 6 : 0,
                  borderTopRightRadius: i === 9 ? 6 : 0,
                  borderBottomRightRadius: i === 9 ? 6 : 0,
                  opacity: on ? 1 : 0.65,
                },
              ]}
            />
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 18 },
  headRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  label: {
    fontFamily: fonts.mono,
    fontSize: 10,
    color: colors.textTertiary,
    letterSpacing: 1.8,
  },
  val: {
    fontFamily: fonts.mono,
    fontSize: 13,
    letterSpacing: -0.3,
  },
  segments: {
    flexDirection: 'row',
    gap: 3,
    marginTop: 8,
  },
  seg: {
    flex: 1,
    height: 36,
  },
});
