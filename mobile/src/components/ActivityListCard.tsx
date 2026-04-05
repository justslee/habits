/**
 * ActivityListCard — Canonical list card for all activity types.
 *
 * One card to rule them all: workouts, runs, routes, sessions.
 * Left accent strip (colored by type) + primary line + secondary line + right metric.
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, typography, radius } from '../theme';

interface ActivityListCardProps {
  /** Accent color for the left strip (identifies the type at a glance) */
  accentColor: string;
  /** Primary text (exercise name, run type, route name) */
  title: string;
  /** Secondary text (date, distance, meta info) */
  subtitle?: string;
  /** Right-side primary value (weight, pace, time) */
  metric?: string;
  /** Right-side label below metric */
  metricLabel?: string;
  /** Color for the metric value */
  metricColor?: string;
  /** Optional icon name (Ionicons) shown before title */
  icon?: keyof typeof Ionicons.glyphMap;
  /** onPress handler */
  onPress?: () => void;
  /** Show chevron on right */
  showChevron?: boolean;
  /** Children rendered below the main row (tags, extra info) */
  children?: React.ReactNode;
}

export default function ActivityListCard({
  accentColor,
  title,
  subtitle,
  metric,
  metricLabel,
  metricColor = colors.text,
  icon,
  onPress,
  showChevron = false,
  children,
}: ActivityListCardProps) {
  const content = (
    <View style={styles.card}>
      {/* Accent strip */}
      <View style={[styles.strip, { backgroundColor: accentColor }]} />

      <View style={styles.body}>
        <View style={styles.mainRow}>
          {/* Left: icon + text */}
          <View style={styles.left}>
            {icon && (
              <Ionicons name={icon} size={16} color={accentColor} style={styles.icon} />
            )}
            <View style={styles.textBlock}>
              <Text style={styles.title} numberOfLines={1}>{title}</Text>
              {subtitle && <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text>}
            </View>
          </View>

          {/* Right: metric + chevron */}
          <View style={styles.right}>
            {metric && (
              <View style={styles.metricBlock}>
                <Text style={[styles.metric, { color: metricColor }]}>{metric}</Text>
                {metricLabel && <Text style={styles.metricLabel}>{metricLabel}</Text>}
              </View>
            )}
            {showChevron && (
              <Ionicons name="chevron-forward" size={14} color={colors.textTertiary} />
            )}
          </View>
        </View>

        {/* Optional extra content */}
        {children && <View style={styles.extra}>{children}</View>}
      </View>
    </View>
  );

  if (onPress) {
    return (
      <TouchableOpacity activeOpacity={0.7} onPress={onPress}>
        {content}
      </TouchableOpacity>
    );
  }

  return content;
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    borderRadius: radius.md,
    marginBottom: spacing.sm,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
    ...Platform.select({
      ios: {
        shadowColor: '#6366F1',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 8,
      },
      android: {
        elevation: 3,
      },
    }),
  },
  strip: {
    width: 3,
  },
  body: {
    flex: 1,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
  },
  mainRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  left: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  icon: {
    marginRight: spacing.sm,
  },
  textBlock: {
    flex: 1,
  },
  title: {
    ...typography.bodyBold,
    color: colors.text,
  },
  subtitle: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  right: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginLeft: spacing.sm,
  },
  metricBlock: {
    alignItems: 'flex-end',
  },
  metric: {
    fontSize: 16,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  metricLabel: {
    ...typography.micro,
    color: colors.textTertiary,
    marginTop: 1,
  },
  extra: {
    marginTop: spacing.sm,
  },
});
