/**
 * Run History Screen — P4-040
 *
 * Lists past runs with distance, pace, date, run type badges.
 * Tap for detail view. Filter by run type.
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
  const [runs, setRuns] = useState<RunListItem[]>([]);
  const [stats, setStats] = useState<RunStats | null>(null);
  const [filter, setFilter] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const filterParam = filter ? `&run_type=${filter}` : '';
      const [runsRes, statsRes] = await Promise.all([
        fetch(`${API}/api/v1/runs/?limit=50${filterParam}`),
        fetch(`${API}/api/v1/runs/stats`),
      ]);
      if (runsRes.ok) setRuns(await runsRes.json());
      if (statsRes.ok) setStats(await statsRes.json());
    } catch {}
    setLoading(false);
  }, [filter]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  }, [fetchData]);

  const filters = [null, 'easy', 'tempo', 'intervals', 'long', 'recovery'];

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation?.goBack?.()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Run History</Text>
      </View>

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
              onPress={() => setFilter(f)}
            >
              <Text style={[styles.filterText, active && { color: chipColor }]}>{label}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Run list */}
      {runs.length === 0 && !loading && (
        <View style={styles.emptyState}>
          <Ionicons name="footsteps-outline" size={48} color={colors.textTertiary} />
          <Text style={styles.emptyText}>No runs yet</Text>
          <Text style={styles.emptySubtext}>Start your first run from the Run tab</Text>
        </View>
      )}

      {runs.map(run => {
        const typeColor = RUN_TYPE_COLORS[run.run_type || 'easy'] || colors.accent;
        const typeIcon = RUN_TYPE_ICONS[run.run_type || 'easy'] || 'footsteps-outline';
        const dateStr = new Date(run.run_date + 'T12:00:00').toLocaleDateString('en-US', {
          weekday: 'short', month: 'short', day: 'numeric',
        });

        return (
          <View key={run.id} style={styles.runCard}>
            <View style={styles.runCardLeft}>
              <View style={[styles.runTypeIcon, { backgroundColor: typeColor + '15' }]}>
                <Ionicons name={typeIcon} size={18} color={typeColor} />
              </View>
            </View>

            <View style={styles.runCardCenter}>
              <View style={styles.runCardTop}>
                <Text style={styles.runDistance}>{run.distance_miles.toFixed(2)} mi</Text>
                <View style={[styles.runTypeBadge, { backgroundColor: typeColor + '15' }]}>
                  <Text style={[styles.runTypeBadgeText, { color: typeColor }]}>
                    {(run.run_type || 'easy').toUpperCase()}
                  </Text>
                </View>
              </View>
              <Text style={styles.runDate}>{dateStr}</Text>
            </View>

            <View style={styles.runCardRight}>
              <Text style={styles.runPace}>{run.avg_pace_formatted}</Text>
              <Text style={styles.runPaceLabel}>/mi</Text>
            </View>
          </View>
        );
      })}

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { paddingTop: Platform.OS === 'ios' ? 60 : 40 },

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

  filterScroll: { paddingHorizontal: spacing.lg, marginBottom: spacing.lg, maxHeight: 40 },
  filterChip: {
    paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: radius.pill,
    borderWidth: 1, borderColor: colors.border, marginRight: spacing.sm,
    backgroundColor: colors.card,
  },
  filterText: { ...typography.caption, color: colors.textSecondary },

  emptyState: { alignItems: 'center', paddingTop: 80, gap: spacing.sm },
  emptyText: { ...typography.title3, color: colors.textSecondary },
  emptySubtext: { ...typography.caption, color: colors.textTertiary },

  runCard: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.md, paddingHorizontal: spacing.lg,
    marginHorizontal: spacing.lg, marginBottom: spacing.sm,
    backgroundColor: colors.card, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border,
  },
  runCardLeft: { marginRight: spacing.md },
  runTypeIcon: {
    width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center',
  },
  runCardCenter: { flex: 1 },
  runCardTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: 2 },
  runDistance: { fontSize: 16, fontWeight: '600', color: colors.text, fontVariant: ['tabular-nums'] },
  runTypeBadge: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4 },
  runTypeBadgeText: { fontSize: 9, fontWeight: '700', letterSpacing: 0.5 },
  runDate: { ...typography.caption, color: colors.textTertiary },
  runCardRight: { alignItems: 'flex-end' },
  runPace: { fontSize: 16, fontWeight: '600', color: colors.accent, fontVariant: ['tabular-nums'] },
  runPaceLabel: { ...typography.micro, color: colors.textTertiary },
});
