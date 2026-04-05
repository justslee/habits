import React from 'react';
import { StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, spacing } from '../theme';

/** Subtle gradient divider between major sections. */
export default function SectionDivider() {
  return (
    <LinearGradient
      colors={['transparent', colors.accent + '25', 'transparent']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 0 }}
      style={s.divider}
    />
  );
}

const s = StyleSheet.create({
  divider: {
    height: 1,
    marginVertical: spacing.lg,
  },
});
