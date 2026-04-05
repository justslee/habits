import React from 'react';
import { StyleSheet, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors } from '../theme';

interface Props {
  children: React.ReactNode;
  style?: ViewStyle;
}

/**
 * Gradient background for all screens.
 * Indigo-tinted top → smooth fade → dark base.
 */
export default function ScreenBackground({ children, style }: Props) {
  return (
    <LinearGradient
      colors={['#1C1A3A', '#151430', '#101025', colors.bg]}
      locations={[0, 0.3, 0.6, 1]}
      style={[styles.root, style]}
    >
      {children}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
