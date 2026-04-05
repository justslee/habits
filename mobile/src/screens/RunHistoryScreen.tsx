/**
 * Run History Screen — P4-040 + P5-5 swipe-to-delete
 *
 * Lists past runs with distance, pace, date, run type badges.
 * Swipe left to delete with undo toast.
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
import { API_URL, apiHeaders, deleteRun, restoreRun } from '../api/client';
import SwipeableRow from '../components/SwipeableRow';
import UndoToast from '../components/UndoToast';
import ScreenBackground from '../components/ScreenBackground';
import ActivityListCard from '../components/ActivityListCard';
import EmptyState from '../components/EmptyState';

const RUN_TYPE_COLORS: Record<string, string> = {
  easy: '#3B82F6', tempo: '#F59E0B', intervals: '#EF4444',
  long: '#10B981', recovery: '#6B7280', fartlek: '#EC4899', progression: '#8B5CF6',
};

const RUN_TYPE_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  easy: 'walk-outline',
  tempo: 'speedometer-outline',
  intervals: 'timer-outline',
  long: 'trail-sign-outline',
  recovery: 'heart-outline',
  fartlek: 'shuffle-outline',
  progression: 'trending-up-outline',
};

interface RunListItem {
  id: number;
  run_date: string;
  distance_miles: number;
  duration_seconds: number;
  avg_pace_seconds: number | null;
  avg_pace_formatted: string;
  duration_formatted: string;
  run_type: string | null;
  rpe: number | null;
  elevation_gain_ft: number | null;
  status: string;
}

interface RunStats {
  total_runs: number;
  total_miles: number;
  this_week_miles: number;
  this_month_miles: number;
  fastest_pace_seconds: number | null;
  longest_run_miles: number;
}

function formatPace(seconds: number | null): string {
  if (!seconds || seconds <= 0 || seconds > 3600) return '--:--';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function RunHistoryScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const [runs, setRuns] = useState<RunListItem[]>([]);
  const [stats, setStats] = useState<RunStats | null>(null);
  const [filter, setFilter] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [undoToast, setUndoToast] = useState<{
    visible: boolean; message: string; runId: number; snapshot: RunListItem | null;
  }>({ visible: false, message: '', runId: 0, snapshot: null });

  const fetchData = useCallback(async () => {
    try {
      const filterParam = filter ? `&run_type=${filter}` : '';
      const [runsRes, statsRes] = await Promise.all([
        fetch(`${API_URL}/api/v1/runs/?limit=50${filterParam}`, { headers: apiHeaders() }),
        fetch(`${API_URL}/api/v1/runs/stats`, { headers: apiHeaders() }),
      ]);
      if (runsRes.ok) setRuns(await runsRes.json());
      if (statsRes.ok) setStats(await statsRes.json());
    } catch (err) {
      console.warn('RunHistory fetch error:', err);
    }
    setLoading(false);
  }, [filter]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  }, [fetchData]);

  const handleDeleteRun = async (run: RunListItem) => {
    setRuns(prev => prev.filter(r => r.id !== run.id));
    haptic.light();
    const label = `${run.distance_miles.toFixed(1)} mi ${run.run_type || 'run'} deleted`;
    setUndoToast({ visible: true, message: label, runId: run.id, snapshot: run });
    try {
      await deleteRun(run.id);
      fetchData(); // refresh stats
    } catch (err) {
      console.warn('Failed to delete run:', err);
      setRuns(prev => [...prev, run].sort((a, b) => b.id - a.id));
      setUndoToast(prev => ({ ...prev, visible: false }));
    }
  };

  const handleUndoRun = async () => {
    const { runId, snapshot } = undoToast;
    setUndoToast(prev => ({ ...prev, visible: false }));
    if (!snapshot) return;
    try {
      await restoreRun(runId);
      setRuns(prev => [...prev, snapshot].sort((a, b) => b.id - a.id));
      fetchData(); // refresh stats
    } catch (err) {
      console.warn('Failed to restore run:', err);
    }
  };

  const filters = [null, 'easy', 'tempo', 'intervals', 'long', 'recovery'];

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
    <ScreenBackground>
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingTop: 12 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
    >
      {/* Stats summary */}
      {stats && stats.total_runs > 0 && (
        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{stats.total_runs}</Text>
            <Text style={styles.statLabel}>RUNS</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{stats.total_miles.toFixed(1)}</Text>
            <Text style={styles.statLabel}>MILES</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{stats.this_week_miles.toFixed(1)}</Text>
            <Text style={styles.statLabel}>THIS WEEK</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{formatPace(stats.fastest_pace_seconds)}</Text>
            <Text style={styles.statLabel}>FASTEST</Text>
          </View>
        </View>
      )}

      {/* Filter chips */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll}>
        {filters.map(f => {
          const active = filter === f;
          const label = f ? f.charAt(0).toUpperCase() + f.slice(1) : 'All';
          const chipColor = f ? RUN_TYPE_COLORS[f] || colors.accent : colors.accent;
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

      {runs.length > 0 && (
        <Text style={styles.swipeHint}>Swipe left to delete</Text>
      )}

      {/* Run list */}
      {runs.length === 0 && !loading && (
        <EmptyState
          icon="footsteps-outline"
          title="No runs yet"
          subtitle="Start your first run from the Train tab"
        />
      )}

      {runs.map(run => {
        const typeColor = RUN_TYPE_COLORS[run.run_type || 'easy'] || colors.accent;
        const dateStr = new Date(run.run_date + 'T12:00:00').toLocaleDateString('en-US', {
          weekday: 'short', month: 'short', day: 'numeric',
        });

        return (
          <SwipeableRow key={run.id} onDelete={() => handleDeleteRun(run)}>
            <View style={{ marginHorizontal: spacing.lg }}>
              <ActivityListCard
                accentColor={typeColor}
                title={`${run.distance_miles.toFixed(2)} mi`}
                subtitle={`${dateStr} \u2022 ${(run.run_type || 'easy').charAt(0).toUpperCase() + (run.run_type || 'easy').slice(1)}`}
                metric={run.avg_pace_formatted}
                metricLabel="/mi"
                metricColor={colors.accent}
                icon="footsteps-outline"
              />
            </View>
          </SwipeableRow>
        );
      })}

      <View style={{ height: 40 }} />
    </ScrollView>

    <UndoToast
      visible={undoToast.visible}
      message={undoToast.message}
      onUndo={handleUndoRun}
      onDismiss={() => setUndoToast(prev => ({ ...prev, visible: false }))}
    />
    </ScreenBackground>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg, marginBottom: spacing.lg },
  backBtn: { marginRight: spacing.md },
  title: { ...typography.title1, color: colors.text },

  statsRow: {
    flexDirection: 'row', justifyContent: 'space-around', paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg, marginHorizontal: spacing.lg,
    backgroundColor: colors.card, borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.border, marginBottom: spacing.lg,
  },
  statItem: { alignItems: 'center' },
  statValue: { fontSize: 18, fontWeight: '700', color: colors.text, fontVariant: ['tabular-nums'] },
  statLabel: { ...typography.micro, color: colors.textTertiary, marginTop: 2 },

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

});
