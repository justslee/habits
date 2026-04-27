/**
 * Stepper — labeled −/+ value control. Used by LiftLogger for weight & reps.
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { colors, fonts, radius } from '../theme';
import { haptic } from '../utils/haptics';

interface Props {
  label: string;
  unit?: string;
  value: number;
  step?: number;
  min?: number;
  onChange: (next: number) => void;
}

export default function Stepper({ label, unit = '', value, step = 1, min = 0, onChange }: Props) {
  const dec = () => {
    const next = Math.max(min, value - step);
    if (next !== value) {
      onChange(next);
      haptic.selection();
    }
  };
  const inc = () => {
    onChange(value + step);
    haptic.selection();
  };

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.row}>
        <TouchableOpacity onPress={dec} style={styles.btn} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
          <Text style={styles.btnText}>−</Text>
        </TouchableOpacity>
        <View style={styles.valueWrap}>
          <Text style={styles.value}>
            {value}
            {unit ? <Text style={styles.unit}>{unit}</Text> : null}
          </Text>
        </View>
        <TouchableOpacity onPress={inc} style={styles.btn} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
          <Text style={styles.btnText}>+</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  label: { fontFamily: fonts.mono, fontSize: 9, color: colors.textTertiary, letterSpacing: 1.8 },
  row: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 4,
    borderRadius: radius.md,
    backgroundColor: colors.input,
    borderWidth: 1,
    borderColor: colors.line,
  },
  btn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  btnText: { fontFamily: fonts.regular, fontSize: 22, color: colors.textSecondary, lineHeight: 26 },
  valueWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  value: { fontFamily: fonts.mono, fontSize: 22, color: colors.text, letterSpacing: -0.5 },
  unit: { fontFamily: fonts.mono, fontSize: 11, color: colors.textTertiary, letterSpacing: 0 },
});
