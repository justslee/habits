import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, typography, radius } from '../theme';

interface Props {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle?: string;
  accentColor?: string;
}

export default function EmptyState({ icon, title, subtitle, accentColor = colors.accent }: Props) {
  return (
    <View style={s.container}>
      <View style={[s.iconCircle, { backgroundColor: accentColor + '15' }]}>
        <Ionicons name={icon} size={24} color={accentColor} />
      </View>
      <Text style={s.title}>{title}</Text>
      {subtitle && <Text style={s.subtitle}>{subtitle}</Text>}
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
  },
  iconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  title: {
    ...typography.bodyBold,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  subtitle: {
    ...typography.caption,
    color: colors.textTertiary,
    textAlign: 'center',
  },
});
