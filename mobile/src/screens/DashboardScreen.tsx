import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, ActivityIndicator, Platform, RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  getDashboardStats, getHeatmap, getDepthProgression,
  DashboardStats, HeatmapDay, DepthProgressionPoint,
} from '../api/client';
import RadarChart from '../components/RadarChart';
import DepthChart from '../components/DepthChart';
import CompoundingChart from '../components/CompoundingChart';
import { colors, spacing, typography, radius } from '../theme';

const TREND_CONFIG: Record<string, { icon: keyof typeof Ionicons.glyphMap; color: string }> = {
  improving: { icon: 'arrow-up', color: colors.success },
  plateauing: { icon: 'arrow-forward', color: colors.warning },
  declining: { icon: 'arrow-down', color: colors.error },
};

const PILLAR_COLORS: Record<number, string> = {
  1: '#3b82f6', 2: '#f59e0b', 3: '#8b5cf6', 4: '#10b981', 5: '#ef4444',
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
      const [s, h, d] = await Promise.all([getDashboardStats(), getHeatmap(182), getDepthProgression(90)]);
      setStats(s); setHeatmap(h); setDepthData(d);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) return <View style={s.center}><ActivityIndicator size="large" color={colors.accent} /></View>;
  if (error || !stats) return <View style={s.center}><Text style={s.errorText}>{error || 'No data'}</Text></View>;

  const heatmapGrid = buildHeatmapGrid(heatmap);
  const trend = TREND_CONFIG[stats.trend] || { icon: 'ellipse' as const, color: colors.textTertiary };

  return (
    <ScrollView style={s.scroll} contentContainerStyle={s.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchData(); }} tintColor={colors.textTertiary} />}>

      <Text style={s.screenTitle}>Dashboard</Text>

      {/* Hours */}
      <View style={s.card}>
        <Text style={s.cardLabel}>HOURS LOGGED</Text>
        <View style={s.hoursRow}>
          <HoursStat label="All Time" value={stats.hours.all_time} />
          <HoursStat label="This Week" value={stats.hours.this_week} />
          <HoursStat label="This Month" value={stats.hours.this_month} />
        </View>
      </View>

      {/* Trend + Depth */}
      <View style={s.row}>
        <View style={[s.card, s.halfCard]}>
          <Text style={s.cardLabel}>TREND</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Ionicons name={trend.icon} size={20} color={trend.color} />
            <Text style={[s.trendValue, { color: trend.color }]}>{stats.trend}</Text>
          </View>
        </View>
        <View style={[s.card, s.halfCard]}>
          <Text style={s.cardLabel}>AVG DEPTH</Text>
          <Text style={s.bigNumber}>{stats.avg_depth_score !== null ? stats.avg_depth_score : '—'}</Text>
        </View>
      </View>

      {/* Radar */}
      <View style={s.card}>
        <Text style={s.cardLabel}>PILLAR BALANCE</Text>
        <View style={{ alignItems: 'center' }}>
          <RadarChart data={stats.pillar_breakdown.map((p) => ({
            pillar_id: p.pillar_id, pillar_name: p.pillar_name,
            score: Math.min(100, (p.total_hours * 2 + (p.avg_depth_score || 0)) / 3 * 1.5),
          }))} />
        </View>
      </View>

      {/* Depth Progression */}
      <View style={s.card}>
        <Text style={s.cardLabel}>DEPTH PROGRESSION — 90 DAYS</Text>
        <DepthChart data={depthData} />
      </View>

      {/* Compounding */}
      <View style={s.card}>
        <Text style={s.cardLabel}>1% DAILY COMPOUND</Text>
        <CompoundingChart stats={stats} />
      </View>

      {/* Pillars */}
      <View style={s.card}>
        <Text style={s.cardLabel}>PILLARS</Text>
        {stats.pillar_breakdown.map((p, i) => (
          <View key={p.pillar_id} style={[s.pillarRow, i < stats.pillar_breakdown.length - 1 && s.divider]}>
            <View style={[s.pillarDot, { backgroundColor: PILLAR_COLORS[p.pillar_id] || colors.textTertiary }]} />
            <View style={s.pillarInfo}>
              <Text style={s.pillarName}>{p.pillar_name}</Text>
              <Text style={s.pillarMeta}>
                {p.total_hours}h  ·  {p.entry_count} entries
                {p.avg_depth_score !== null ? `  ·  depth ${p.avg_depth_score}` : ''}
              </Text>
            </View>
          </View>
        ))}
      </View>

      {/* Streaks */}
      {stats.streaks.length > 0 && (
        <View style={s.card}>
          <Text style={s.cardLabel}>STREAKS</Text>
          {stats.streaks.map((streak, i) => (
            <View key={streak.id} style={[s.streakRow, i < stats.streaks.length - 1 && s.divider]}>
              <Text style={s.streakName}>{streak.pillar_name}</Text>
              <View style={s.streakNumbers}>
                <Text style={s.streakCurrent}>{streak.current_streak}d</Text>
                <Text style={s.streakBest}>best {streak.longest_streak}d</Text>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* Heatmap */}
      <View style={s.card}>
        <Text style={s.cardLabel}>ACTIVITY — 6 MONTHS</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={s.heatmapContainer}>
            {heatmapGrid.map((week, wi) => (
              <View key={wi} style={s.heatmapWeek}>
                {week.map((day, di) => (
                  <View key={`${wi}-${di}`} style={[s.heatmapCell,
                    { backgroundColor: day ? HEATMAP_COLORS[intensityLevel(day.count)] : 'transparent' }]} />
                ))}
              </View>
            ))}
          </View>
        </ScrollView>
        <View style={s.heatmapLegend}>
          <Text style={s.legendLabel}>Less</Text>
          {HEATMAP_COLORS.map((c, i) => <View key={i} style={[s.heatmapCell, { backgroundColor: c }]} />)}
          <Text style={s.legendLabel}>More</Text>
        </View>
      </View>
    </ScrollView>
  );
}

function HoursStat({ label, value }: { label: string; value: number }) {
  return (
    <View style={s.hoursStat}>
      <Text style={s.hoursValue}>{value}</Text>
      <Text style={s.hoursLabel}>{label}</Text>
    </View>
  );
}

function buildHeatmapGrid(data: HeatmapDay[]): (HeatmapDay | null)[][] {
  if (data.length === 0) return [];
  const lookup = new Map<string, HeatmapDay>();
  for (const d of data) lookup.set(d.date, d);
  const start = new Date(data[0].date + 'T00:00:00');
  const end = new Date(data[data.length - 1].date + 'T00:00:00');
  start.setDate(start.getDate() - start.getDay());
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

const s = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: colors.bg },
  container: { padding: spacing.lg, paddingTop: Platform.OS === 'ios' ? 64 : 44, paddingBottom: 40 },
  center: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  errorText: { color: colors.error, ...typography.body },
  screenTitle: { ...typography.largeTitle, color: colors.text, marginBottom: spacing.lg },

  card: {
    backgroundColor: colors.card, borderRadius: radius.md,
    padding: spacing.md, marginBottom: spacing.md,
    borderWidth: 1, borderColor: colors.cardBorder,
  },
  cardLabel: { ...typography.caption, color: colors.textSecondary, fontWeight: '600', letterSpacing: 0.5, marginBottom: spacing.md },
  row: { flexDirection: 'row', gap: spacing.md },
  halfCard: { flex: 1 },
  divider: { borderBottomWidth: 1, borderBottomColor: colors.cardBorder, paddingBottom: spacing.md, marginBottom: spacing.md },

  hoursRow: { flexDirection: 'row', justifyContent: 'space-around' },
  hoursStat: { alignItems: 'center' },
  hoursValue: { fontSize: 28, fontWeight: '700', color: colors.text },
  hoursLabel: { ...typography.caption, color: colors.textTertiary, marginTop: 2 },

  trendValue: { ...typography.headline, textTransform: 'capitalize' },
  bigNumber: { fontSize: 36, fontWeight: '700', color: colors.accent },

  pillarRow: { flexDirection: 'row', alignItems: 'center' },
  pillarDot: { width: 8, height: 8, borderRadius: 4, marginRight: spacing.md },
  pillarInfo: { flex: 1 },
  pillarName: { ...typography.subhead, color: colors.text, fontWeight: '600' },
  pillarMeta: { ...typography.caption, color: colors.textTertiary, marginTop: 2 },

  streakRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  streakName: { ...typography.subhead, color: colors.text },
  streakNumbers: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  streakCurrent: { ...typography.headline, color: colors.warning },
  streakBest: { ...typography.caption, color: colors.textTertiary },

  heatmapContainer: { flexDirection: 'row', gap: 2, paddingVertical: spacing.sm },
  heatmapWeek: { gap: 2 },
  heatmapCell: { width: 12, height: 12, borderRadius: 2 },
  heatmapLegend: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: spacing.sm },
  legendLabel: { ...typography.caption2, color: colors.textTertiary },
});
