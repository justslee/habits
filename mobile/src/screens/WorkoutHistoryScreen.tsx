/**
 * WorkoutHistoryScreen — Full workout session history with swipe-to-delete.
 *
 * Mirrors RunHistoryScreen: filter chips, session cards, SwipeableRow + UndoToast.
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, RefreshControl,
} from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, typography, radius } from '../theme';
import { haptic } from '../utils/haptics';
import { API_URL, apiHeaders, deleteWorkout, restoreWorkout, WorkoutSession } from '../api/client';
import SwipeableRow from '../components/SwipeableRow';
import UndoToast from '../components/UndoToast';

const DAY_TYPE_COLORS: Record<string, string> = {
  push: '#3B82F6', pull: '#8B5CF6', legs: '#10B981',
  cardio: '#F59E0B', basketball: '#EC4899', rest: '#6B7280',
};

const DAY_TYPE_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  push: 'arrow-up-outline',
  pull: 'arrow-down-outline',
  legs: 'body-outline',
  cardio: 'heart-outline',
  basketball: 'basketball-outline',
  rest: 'bed-outline',
};

interface WorkoutListItem {
  id: number;
  session_date: string;
  day_type: string;
  status: string;
  overall_rpe: number | null;
  whoop_recovery_score: number | null;
  exercises: Array<{
    exercise_name: string;
    set_number: number;
    weight?: number;
    reps?: number;
    is_warmup?: boolean;
  }>;
}

export default function WorkoutHistoryScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const [workouts, setWorkouts] = useState<WorkoutListItem[]>([]);
  const [filter, setFilter] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [undoToast, setUndoToast] = useState<{
    visible: boolean; message: string; sessionId: number; snapshot: WorkoutListItem | null;
  }>({ visible: false, message: '', sessionId: 0, snapshot: null });

  const fetchData = useCallback(async () => {
    try {
      const filterParam = filter ? `&day_type=${filter}` : '';
      const res = await fetch(
        `${API_URL}/api/v1/workouts/?limit=50${filterParam}`,
        { headers: apiHeaders() },
      );
      if (res.ok) setWorkouts(await res.json());
    } catch (err) {
      console.warn('WorkoutHistory fetch error:', err);
    }
    setLoading(false);
  }, [filter]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  }, [fetchData]);

  const handleDelete = async (w: WorkoutListItem) => {
    setWorkouts(prev => prev.filter(x => x.id !== w.id));
    haptic.light();
    const label = `${w.day_type.replace('_', ' ')} session deleted`;
    setUndoToast({ visible: true, message: label, sessionId: w.id, snapshot: w });
    try {
      await deleteWorkout(w.id);
      fetchData();
    } catch (err) {
      console.warn('Delete failed:', err);
      setWorkouts(prev => [...prev, w].sort((a, b) => b.id - a.id));
      setUndoToast(prev => ({ ...prev, visible: false }));
    }
  };

  const handleUndo = async () => {
    const { sessionId, snapshot } = undoToast;
    setUndoToast(prev => ({ ...prev, visible: false }));
    if (!snapshot) return;
    try {
      await restoreWorkout(sessionId);
      setWorkouts(prev => [...prev, snapshot].sort((a, b) => b.id - a.id));
      fetchData();
    } catch (err) {
      console.warn('Restore failed:', err);
    }
  };

  const filters = [null, 'push', 'pull', 'legs', 'cardio'];

  const getExerciseStats = (w: WorkoutListItem) => {
    const working = w.exercises.filter(e => !e.is_warmup);
    const totalSets = working.length;
    const totalVolume = working.reduce((sum, e) => sum + (e.weight || 0) * (e.reps || 0), 0);
    const exerciseCount = new Set(working.map(e => e.exercise_name)).size;
    return { totalSets, totalVolume, exerciseCount };
  };

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={{ paddingTop: 12 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />
        }
      >
        {/* Filter chips */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll}>
          {filters.map(f => {
            const active = filter === f;
            const label = f ? f.charAt(0).toUpperCase() + f.slice(1) : 'All';
            const chipColor = f ? DAY_TYPE_COLORS[f] || colors.accent : colors.accent;
            return (
              <TouchableOpacity
                key={f || 'all'}
                style={[styles.filterChip, active && { backgroundColor: chipColor + '20', borderColor: chipColor }]}
                onPress={() => { haptic.selection(); setFilter(f); }}
              >
                <Text style={[styles.filterText, active && { color: chipColor }]}>{label}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {workouts.length > 0 && (
          <Text style={styles.swipeHint}>Swipe left to delete</Text>
        )}

        {/* Workout list */}
        {workouts.length === 0 && !loading && (
          <View style={styles.emptyState}>
            <Ionicons name="barbell-outline" size={48} color={colors.textTertiary} />
            <Text style={styles.emptyText}>No workouts yet</Text>
            <Text style={styles.emptySubtext}>Start a workout from the Train tab</Text>
          </View>
        )}

        {workouts.map(w => {
          const typeColor = DAY_TYPE_COLORS[w.day_type] || colors.accent;
          const typeIcon = DAY_TYPE_ICONS[w.day_type] || 'barbell-outline';
          const dateStr = new Date(w.session_date + 'T12:00:00').toLocaleDateString('en-US', {
            weekday: 'short', month: 'short', day: 'numeric',
          });
          const { totalSets, totalVolume, exerciseCount } = getExerciseStats(w);

          return (
            <SwipeableRow key={w.id} onDelete={() => handleDelete(w)}>
              <TouchableOpacity
                style={styles.workoutCard}
                activeOpacity={0.7}
                onPress={() => navigation?.navigate?.('WorkoutDetail', { sessionId: w.id })}
              >
                <View style={styles.cardLeft}>
                  <View style={[styles.typeIcon, { backgroundColor: typeColor + '15' }]}>
                    <Ionicons name={typeIcon} size={18} color={typeColor} />
                  </View>
                </View>

                <View style={styles.cardCenter}>
                  <View style={styles.cardTop}>
                    <Text style={styles.cardLabel}>
                      {w.day_type.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())}
                    </Text>
                    <View style={[styles.dayBadge, { backgroundColor: typeColor + '15' }]}>
                      <Text style={[styles.dayBadgeText, { color: typeColor }]}>
                        {w.day_type.toUpperCase()}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.cardDate}>{dateStr}</Text>
                  <Text style={styles.cardDetail}>
                    {exerciseCount} exercises • {totalSets} sets
                    {totalVolume > 0 ? ` • ${totalVolume.toLocaleString()} lb` : ''}
                  </Text>
                </View>

                <View style={styles.cardRight}>
                  {w.overall_rpe != null && (
                    <>
                      <Text style={styles.rpeValue}>RPE {w.overall_rpe}</Text>
                    </>
                  )}
                  <Text style={[styles.statusText, w.status === 'completed' && { color: colors.success }]}>
                    {w.status === 'completed' ? '✓' : w.status}
                  </Text>
                  <Ionicons name="chevron-forward" size={14} color={colors.textTertiary} style={{ marginTop: 4 }} />
                </View>
              </TouchableOpacity>
            </SwipeableRow>
          );
        })}

        <View style={{ height: 40 }} />
      </ScrollView>

      <UndoToast
        visible={undoToast.visible}
        message={undoToast.message}
        onUndo={handleUndo}
        onDismiss={() => setUndoToast(prev => ({ ...prev, visible: false }))}
      />
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },

  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.lg, marginBottom: spacing.lg,
  },
  backBtn: { marginRight: spacing.md },
  title: { ...typography.title1, color: colors.text },

  filterScroll: { paddingHorizontal: spacing.lg, marginBottom: spacing.xs, maxHeight: 40 },
  filterChip: {
    paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: radius.pill,
    borderWidth: 1, borderColor: colors.border, marginRight: spacing.sm,
    backgroundColor: colors.card,
  },
  filterText: { ...typography.caption, color: colors.textSecondary },

  swipeHint: {
    ...typography.micro, color: colors.textTertiary,
    paddingHorizontal: spacing.lg, marginBottom: spacing.sm,
  },

  emptyState: { alignItems: 'center', paddingTop: 80, gap: spacing.sm },
  emptyText: { ...typography.title3, color: colors.textSecondary },
  emptySubtext: { ...typography.caption, color: colors.textTertiary },

  workoutCard: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: spacing.md, paddingHorizontal: spacing.lg,
    marginHorizontal: spacing.lg, marginBottom: spacing.sm,
    backgroundColor: colors.card, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border,
  },
  cardLeft: { marginRight: spacing.md },
  typeIcon: {
    width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center',
  },
  cardCenter: { flex: 1 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: 2 },
  cardLabel: { fontSize: 16, fontWeight: '600', color: colors.text },
  dayBadge: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4 },
  dayBadgeText: { fontSize: 9, fontWeight: '700', letterSpacing: 0.5 },
  cardDate: { ...typography.caption, color: colors.textTertiary },
  cardDetail: { ...typography.micro, color: colors.textSecondary, marginTop: 2 },
  cardRight: { alignItems: 'flex-end' },
  rpeValue: { fontSize: 14, fontWeight: '600', color: colors.accent, fontVariant: ['tabular-nums'] },
  statusText: { ...typography.micro, color: colors.textTertiary, marginTop: 2 },
});
