/**
 * SegmentedSwitch — pill-shaped multi-segment switch.
 * Mirrors the Train tab segmented switch from the design canvas (tabs.jsx).
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { colors, fonts } from '../theme';
import { haptic } from '../utils/haptics';

export interface Segment<T extends string> {
  key: T;
  label: string;
}

interface Props<T extends string> {
  segments: Segment<T>[];
  value: T;
  onChange: (next: T) => void;
}

export default function SegmentedSwitch<T extends string>({ segments, value, onChange }: Props<T>) {
  return (
    <View style={styles.wrap}>
      {segments.map(s => {
        const active = s.key === value;
        return (
          <TouchableOpacity
            key={s.key}
            style={[styles.btn, active && styles.btnActive]}
            onPress={() => {
              if (s.key !== value) {
                onChange(s.key);
                haptic.selection();
              }
            }}
            activeOpacity={0.85}
          >
            <Text style={[styles.label, active && styles.labelActive]}>{s.label.toUpperCase()}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    gap: 4,
    padding: 3,
    backgroundColor: colors.card,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.line,
  },
  btn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnActive: {
    backgroundColor: colors.accent,
  },
  label: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: colors.textSecondary,
    letterSpacing: 1.6,
  },
  labelActive: {
    color: colors.bg,
  },
});
