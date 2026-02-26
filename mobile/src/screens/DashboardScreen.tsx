/**
 * Dashboard Screen — TASK-009 + TASK-010
 *
 * Shows progress stats, pillar breakdown, streaks, and heatmap.
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Platform,
  RefreshControl,
} from 'react-native';
import {
  getDashboardStats,
  getHeatmap,
  getDepthProgression,
  DashboardStats,
  HeatmapDay,
  DepthProgressionPoint,
} from '../api/client';
import RadarChart from '../components/RadarChart';
import DepthChart from '../components/DepthChart';

const TREND_ICONS: Record<string, string> = {
  improving: '📈',
  plateauing: '➡️',
  declining: '📉',
};

const PILLAR_COLORS: Record<number, string> = {
  1: '#3b82f6', // Quant Finance — blue
  2: '#f59e0b', // Macro Investing — amber
  3: '#8b5cf6', // ML Math — purple
  4: '#10b981', // AI Engineering — emerald
  5: '#ef4444', // Public Speaking — red
};

const HEATMAP_COLORS = ['#161b22', '#0e4429', '#006d32', '#26a641', '#39d353'];

function intensityLevel(count: number): number {
  if (count === 0) return 0;
  if (count === 1) return 1;
  if (count === 2) return 2;
  if (count <= 4) return 3;
  return 4;
}

export default function DashboardScreen() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [heatmap, setHeatmap] = useState<HeatmapDay[]>([]);
  const [depthData, setDepthData] = useState<DepthProgressionPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setError(null);
      const [s, h, d] = await Promise.all([
        getDashboardStats(),
        getHeatmap(182),
        getDepthProgression(90),
      ]);
      setStats(s);
      setHeatmap(h);
      setDepthData(d);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  if (error || !stats) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>{error || 'No data'}</Text>
      </View>
    );
  }

  // Build heatmap grid (26 weeks × 7 days)
  const heatmapGrid = buildHeatmapGrid(heatmap);

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#666" />
      }
    >
      <Text style={styles.title}>Dashboard</Text>

      {/* Hours Summary */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Hours Logged</Text>
        <View style={styles.hoursRow}>
          <HoursStat label="All Time" value={stats.hours.all_time} />
          <HoursStat label="This Week" value={stats.hours.this_week} />
          <HoursStat label="This Month" value={stats.hours.this_month} />
        </View>
      </View>

      {/* Trend + Avg Depth */}
      <View style={styles.row}>
        <View style={[styles.card, styles.halfCard]}>
          <Text style={styles.cardTitle}>Trend</Text>
          <Text style={styles.trendValue}>
            {TREND_ICONS[stats.trend] || '—'} {stats.trend}
          </Text>
        </View>
        <View style={[styles.card, styles.halfCard]}>
          <Text style={styles.cardTitle}>Avg Depth</Text>
          <Text style={styles.bigNumber}>
            {stats.avg_depth_score !== null ? stats.avg_depth_score : '—'}
          </Text>
        </View>
      </View>

      {/* Radar Chart */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Pillar Balance</Text>
        <View style={{ alignItems: 'center' }}>
          <RadarChart
            data={stats.pillar_breakdown.map((p) => ({
              pillar_id: p.pillar_id,
              pillar_name: p.pillar_name,
              // Normalize: combine hours + depth for composite score
              score: Math.min(
                100,
                (p.total_hours * 2 + (p.avg_depth_score || 0)) / 3 * 1.5
              ),
            }))}
          />
        </View>
      </View>

      {/* Depth Progression */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Depth Progression (90 days)</Text>
        <DepthChart data={depthData} />
      </View>

      {/* Pillar Breakdown */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Pillars</Text>
        {stats.pillar_breakdown.map((p) => (
          <View key={p.pillar_id} style={styles.pillarRow}>
            <View
              style={[
                styles.pillarDot,
                { backgroundColor: PILLAR_COLORS[p.pillar_id] || '#666' },
              ]}
            />
            <View style={styles.pillarInfo}>
              <Text style={styles.pillarName}>{p.pillar_name}</Text>
              <Text style={styles.pillarMeta}>
                {p.total_hours}h · {p.entry_count} entries
                {p.avg_depth_score !== null ? ` · depth ${p.avg_depth_score}` : ''}
              </Text>
            </View>
          </View>
        ))}
      </View>

      {/* Streaks */}
      {stats.streaks.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Streaks</Text>
          {stats.streaks.map((s) => (
            <View key={s.id} style={styles.streakRow}>
              <Text style={styles.streakName}>{s.pillar_name}</Text>
              <View style={styles.streakNumbers}>
                <Text style={styles.streakCurrent}>🔥 {s.current_streak}d</Text>
                <Text style={styles.streakBest}>Best: {s.longest_streak}d</Text>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* Heatmap */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Activity (6 months)</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={styles.heatmapContainer}>
            {heatmapGrid.map((week, wi) => (
              <View key={wi} style={styles.heatmapWeek}>
                {week.map((day, di) => (
                  <View
                    key={`${wi}-${di}`}
                    style={[
                      styles.heatmapCell,
                      { backgroundColor: day ? HEATMAP_COLORS[intensityLevel(day.count)] : 'transparent' },
                    ]}
                  />
                ))}
              </View>
            ))}
          </View>
        </ScrollView>
        <View style={styles.heatmapLegend}>
          <Text style={styles.legendLabel}>Less</Text>
          {HEATMAP_COLORS.map((c, i) => (
            <View key={i} style={[styles.heatmapCell, { backgroundColor: c }]} />
          ))}
          <Text style={styles.legendLabel}>More</Text>
        </View>
      </View>
    </ScrollView>
  );
}

function HoursStat({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.hoursStat}>
      <Text style={styles.hoursValue}>{value}</Text>
      <Text style={styles.hoursLabel}>{label}</Text>
    </View>
  );
}

/**
 * Build a grid of weeks × 7 days from heatmap data for rendering.
 * Returns array of weeks, each containing 7 day slots (null for padding).
 */
function buildHeatmapGrid(data: HeatmapDay[]): (HeatmapDay | null)[][] {
  if (data.length === 0) return [];

  const lookup = new Map<string, HeatmapDay>();
  for (const d of data) lookup.set(d.date, d);

  // Start from the earliest date, aligned to Sunday
  const start = new Date(data[0].date + 'T00:00:00');
  const end = new Date(data[data.length - 1].date + 'T00:00:00');

  // Align start to Sunday
  const startDay = start.getDay();
  start.setDate(start.getDate() - startDay);

  const weeks: (HeatmapDay | null)[][] = [];
  let current = new Date(start);

  while (current <= end) {
    const week: (HeatmapDay | null)[] = [];
    for (let d = 0; d < 7; d++) {
      const key = current.toISOString().split('T')[0];
      week.push(lookup.get(key) || { date: key, count: 0, pillars: [] });
      current.setDate(current.getDate() + 1);
    }
    weeks.push(week);
  }

  return weeks;
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: '#000' },
  container: { padding: 20, paddingTop: Platform.OS === 'ios' ? 60 : 40, paddingBottom: 40 },
  center: { flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' },
  errorText: { color: '#ef4444', fontSize: 16 },
  title: { fontSize: 28, fontWeight: '700', color: '#fff', marginBottom: 24 },

  card: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#333',
  },
  cardTitle: { fontSize: 14, fontWeight: '600', color: '#aaa', marginBottom: 12 },
  row: { flexDirection: 'row', gap: 12 },
  halfCard: { flex: 1 },

  hoursRow: { flexDirection: 'row', justifyContent: 'space-around' },
  hoursStat: { alignItems: 'center' },
  hoursValue: { fontSize: 24, fontWeight: '700', color: '#fff' },
  hoursLabel: { fontSize: 12, color: '#666', marginTop: 4 },

  trendValue: { fontSize: 18, fontWeight: '600', color: '#fff', textTransform: 'capitalize' },
  bigNumber: { fontSize: 32, fontWeight: '700', color: '#2563eb' },

  pillarRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  pillarDot: { width: 10, height: 10, borderRadius: 5, marginRight: 12 },
  pillarInfo: { flex: 1 },
  pillarName: { fontSize: 15, fontWeight: '600', color: '#fff' },
  pillarMeta: { fontSize: 12, color: '#666', marginTop: 2 },

  streakRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  streakName: { fontSize: 14, color: '#fff', flex: 1 },
  streakNumbers: { flexDirection: 'row', gap: 12 },
  streakCurrent: { fontSize: 14, fontWeight: '600', color: '#f59e0b' },
  streakBest: { fontSize: 12, color: '#666' },

  heatmapContainer: { flexDirection: 'row', gap: 2, paddingVertical: 8 },
  heatmapWeek: { gap: 2 },
  heatmapCell: { width: 12, height: 12, borderRadius: 2 },
  heatmapLegend: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8 },
  legendLabel: { fontSize: 10, color: '#666' },
});
