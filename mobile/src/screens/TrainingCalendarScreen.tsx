/**
 * Training Plan Calendar — P4-042
 *
 * Week-view calendar showing planned runs with type color dots.
 * Current week highlighted, completed/missed status, tap to start.
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, Platform, RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, typography, radius } from '../theme';

const API = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8000';

const RUN_TYPE_COLORS: Record<string, string> = {
  easy: '#3B82F6', tempo: '#F59E0B', intervals: '#EF4444',
  long: '#10B981', recovery: '#6B7280', fartlek: '#EC4899', progression: '#8B5CF6',
};

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

interface PlannedRun {
  id: number;
  week_number: number;
  day_of_week: number;
  planned_date: string | null;
  run_type: string;
  target_distance_miles: number | null;
  target_pace_seconds: number | null;
  description: string | null;
  status: string;
}

interface TrainingPlan {
  id: number;
  goal_type: string;
  current_week: number;
  total_weeks: number;
  status: string;
  start_date: string;
  planned_runs: PlannedRun[];
}

function fmtPace(s: number | null): string {
  if (!s || s <= 0) return '';
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
}

export default function TrainingCalendarScreen({ navigation }: any) {
  const [plan, setPlan] = useState<TrainingPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedWeek, setSelectedWeek] = useState<number>(1);

  const fetchPlan = useCallback(async () => {
    try {
      const resp = await fetch(`${API}/api/v1/runs/plans/active`);
      if (resp.ok) {
        const data = await resp.json();
        if (data) {
          setPlan(data);
          setSelectedWeek(data.current_week);
        }
      }
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { fetchPlan(); }, [fetchPlan]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchPlan();
    setRefreshing(false);
  }, [fetchPlan]);

  if (!plan) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Ionicons name="calendar-outline" size={48} color={colors.textTertiary} />
        <Text style={styles.emptyTitle}>No Active Plan</Text>
        <Text style={styles.emptySubtext}>Create a training plan to see your calendar</Text>
      </View>
    );
  }

  // Group runs by week
  const weekRuns = plan.planned_runs.filter(r => r.week_number === selectedWeek);
  const completedThisWeek = weekRuns.filter(r => r.status === 'completed').length;
  const totalThisWeek = weekRuns.length;
  const weekMiles = weekRuns.reduce((sum, r) => sum + (r.target_distance_miles || 0), 0);

  // Build week selector
  const weeks = Array.from({ length: plan.total_weeks }, (_, i) => i + 1);

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation?.goBack?.()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <View>
          <Text style={styles.title}>{plan.goal_type.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())} Plan</Text>
          <Text style={styles.subtitle}>Week {plan.current_week} of {plan.total_weeks}</Text>
        </View>
      </View>

      {/* Week selector */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.weekScroll}>
        {weeks.map(w => {
          const isActive = w === selectedWeek;
          const isCurrent = w === plan.current_week;
          const wRuns = plan.planned_runs.filter(r => r.week_number === w);
          const wDone = wRuns.filter(r => r.status === 'completed').length;
          return (
            <TouchableOpacity
              key={w}
              style={[
                styles.weekChip,
                isActive && { backgroundColor: colors.accent + '20', borderColor: colors.accent },
                isCurrent && !isActive && { borderColor: colors.accent + '60' },
              ]}
              onPress={() => setSelectedWeek(w)}
            >
              <Text style={[styles.weekNum, isActive && { color: colors.accent }]}>W{w}</Text>
              {wRuns.length > 0 && (
                <Text style={styles.weekProgress}>{wDone}/{wRuns.length}</Text>
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Week summary */}
      <View style={styles.weekSummary}>
        <Text style={styles.weekSummaryText}>
          {completedThisWeek}/{totalThisWeek} runs  ·  {weekMiles.toFixed(1)} mi planned
        </Text>
      </View>

      {/* Day cards */}
      {DAY_NAMES.map((day, dayIdx) => {
        const run = weekRuns.find(r => r.day_of_week === dayIdx);
        const typeColor = run ? (RUN_TYPE_COLORS[run.run_type] || colors.accent) : colors.textTertiary;

        return (
          <View key={dayIdx} style={[styles.dayCard, !run && styles.dayCardEmpty]}>
            <View style={styles.dayLeft}>
              <Text style={[styles.dayName, !run && { color: colors.textTertiary }]}>{day}</Text>
              {run && (
                <View style={[styles.typeDot, { backgroundColor: typeColor }]} />
              )}
            </View>

            {run ? (
              <View style={styles.dayCenter}>
                <View style={styles.dayTopRow}>
                  <View style={[styles.typeBadge, { backgroundColor: typeColor + '15' }]}>
                    <Text style={[styles.typeBadgeText, { color: typeColor }]}>
                      {run.run_type.toUpperCase()}
                    </Text>
                  </View>
                  {run.status === 'completed' && (
                    <Ionicons name="checkmark-circle" size={18} color={colors.success} />
                  )}
                  {run.status === 'missed' && (
                    <Ionicons name="close-circle" size={18} color={colors.error} />
                  )}
                </View>
                <Text style={styles.dayDescription} numberOfLines={1}>
                  {run.description || `${run.target_distance_miles || '?'} mi`}
                </Text>
              </View>
            ) : (
              <View style={styles.dayCenter}>
                <Text style={styles.restText}>Rest</Text>
              </View>
            )}

            {run && (
              <View style={styles.dayRight}>
                {run.target_distance_miles && (
                  <Text style={styles.dayMiles}>{run.target_distance_miles}mi</Text>
                )}
                {run.target_pace_seconds && (
                  <Text style={styles.dayPace}>{fmtPace(run.target_pace_seconds)}/mi</Text>
                )}
              </View>
            )}
          </View>
        );
      })}

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  centered: { justifyContent: 'center', alignItems: 'center', gap: spacing.sm },

  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg, paddingTop: Platform.OS === 'ios' ? 60 : 40, marginBottom: spacing.md },
  backBtn: { marginRight: spacing.md },
  title: { ...typography.title2, color: colors.text },
  subtitle: { ...typography.caption, color: colors.textTertiary },

  emptyTitle: { ...typography.title3, color: colors.textSecondary },
  emptySubtext: { ...typography.caption, color: colors.textTertiary },

  weekScroll: { paddingHorizontal: spacing.lg, marginBottom: spacing.md, maxHeight: 52 },
  weekChip: {
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.sm,
    borderWidth: 1, borderColor: colors.border, marginRight: spacing.xs,
    backgroundColor: colors.card, alignItems: 'center', minWidth: 48,
  },
  weekNum: { ...typography.caption, color: colors.textSecondary, fontWeight: '600' },
  weekProgress: { ...typography.micro, color: colors.textTertiary, marginTop: 1 },

  weekSummary: { paddingHorizontal: spacing.lg, marginBottom: spacing.md },
  weekSummaryText: { ...typography.caption, color: colors.textTertiary },

  dayCard: {
    flexDirection: 'row', alignItems: 'center', marginHorizontal: spacing.lg,
    marginBottom: spacing.sm, padding: spacing.md,
    backgroundColor: colors.card, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border,
  },
  dayCardEmpty: { opacity: 0.5 },
  dayLeft: { width: 44, alignItems: 'center' },
  dayName: { ...typography.caption, color: colors.text, fontWeight: '600' },
  typeDot: { width: 6, height: 6, borderRadius: 3, marginTop: 4 },
  dayCenter: { flex: 1, marginLeft: spacing.sm },
  dayTopRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: 2 },
  typeBadge: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4 },
  typeBadgeText: { fontSize: 9, fontWeight: '700', letterSpacing: 0.5 },
  dayDescription: { ...typography.caption, color: colors.textSecondary },
  restText: { ...typography.caption, color: colors.textTertiary },
  dayRight: { alignItems: 'flex-end', marginLeft: spacing.sm },
  dayMiles: { fontSize: 14, fontWeight: '600', color: colors.text, fontVariant: ['tabular-nums'] },
  dayPace: { ...typography.micro, color: colors.textTertiary },
});
