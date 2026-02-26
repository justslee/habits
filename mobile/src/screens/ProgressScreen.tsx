import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, ActivityIndicator, Platform,
  RefreshControl, TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  getDashboardStats, getHeatmap, getDepthProgression, getExerciseProfiles,
  DashboardStats, HeatmapDay, DepthProgressionPoint, ExerciseProfileData,
} from '../api/client';
import RadarChart from '../components/RadarChart';
import DepthChart from '../components/DepthChart';
import CompoundingChart from '../components/CompoundingChart';
import { colors, spacing, typography, radius, cardStyle, PILLAR_COLORS } from '../theme';

const MUSCLE_GROUPS = [
  { key: 'chest', label: 'Chest', icon: 'fitness-outline' as const },
  { key: 'shoulders', label: 'Shoulders', icon: 'body-outline' as const },
  { key: 'back', label: 'Back', icon: 'arrow-up-outline' as const },
  { key: 'arms', label: 'Arms', icon: 'barbell-outline' as const },
  { key: 'legs', label: 'Legs', icon: 'walk-outline' as const },
  { key: 'core', label: 'Core', icon: 'ellipse-outline' as const },
];

const STATUS_COLORS: Record<string, string> = {
  progressing: colors.success, maintaining: colors.warning,
  stalled: colors.error, deloading: '#8B5CF6', regressing: colors.error,
};

const TREND_CONFIG: Record<string, { icon: keyof typeof Ionicons.glyphMap; color: string }> = {
  improving: { icon: 'arrow-up', color: colors.success },
  plateauing: { icon: 'arrow-forward', color: colors.warning },
  declining: { icon: 'arrow-down', color: colors.error },
};

const HEATMAP_COLORS = ['#12121E', '#0e4429', '#006d32', '#26a641', '#39d353'];

function intensityLevel(count: number): number {
  if (count === 0) return 0; if (count === 1) return 1;
  if (count === 2) return 2; if (count <= 4) return 3; return 4;
}

type Section = 'mastery' | 'strength' | 'running';

export default function ProgressScreen() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [heatmap, setHeatmap] = useState<HeatmapDay[]>([]);
  const [depthData, setDepthData] = useState<DepthProgressionPoint[]>([]);
  const [profiles, setProfiles] = useState<ExerciseProfileData[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [activeSection, setActiveSection] = useState<Section>('mastery');

  const fetchData = useCallback(async () => {
    try {
      const [s, h, d, p] = await Promise.all([
        getDashboardStats(), getHeatmap(182), getDepthProgression(90), getExerciseProfiles(),
      ]);
      setStats(s); setHeatmap(h); setDepthData(d); setProfiles(p);
    } catch {} finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const toggleGroup = (key: string) => {
    setExpandedGroups(prev => { const next = new Set(prev); next.has(key) ? next.delete(key) : next.add(key); return next; });
  };

  if (loading) return <View style={s.center}><ActivityIndicator size="large" color={colors.accent} /></View>;

  const trend = stats ? (TREND_CONFIG[stats.trend] || { icon: 'ellipse' as const, color: colors.textTertiary }) : null;
  const heatmapGrid = buildHeatmapGrid(heatmap);
  const grouped = MUSCLE_GROUPS.map(mg => ({ ...mg, exercises: profiles.filter(p => p.muscle_group === mg.key) })).filter(mg => mg.exercises.length > 0);

  return (
    <ScrollView style={s.scroll} contentContainerStyle={s.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchData(); }} tintColor={colors.textTertiary} />}>

      <Text style={s.screenTitle}>Progress</Text>

      <View style={s.sectionTabs}>
        {(['mastery', 'strength', 'running'] as Section[]).map(key => (
          <TouchableOpacity key={key}
            style={[s.tab, activeSection === key && s.tabActive]}
            onPress={() => setActiveSection(key)}>
            <Text style={[s.tabText, activeSection === key && s.tabTextActive]}>
              {key.charAt(0).toUpperCase() + key.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* MASTERY */}
      {activeSection === 'mastery' && stats && (
        <>
          <View style={s.statsGrid}>
            <View style={s.statCard}>
              <Text style={s.statCardValue}>{stats.hours.all_time}</Text>
              <Text style={s.statCardLabel}>ALL TIME</Text>
            </View>
            <View style={s.statCard}>
              <Text style={s.statCardValue}>{stats.hours.this_week}</Text>
              <Text style={s.statCardLabel}>THIS WEEK</Text>
            </View>
            <View style={s.statCard}>
              <Text style={[s.statCardValue, { color: trend?.color }]}>{stats.avg_depth_score ?? '—'}</Text>
              <Text style={s.statCardLabel}>AVG DEPTH</Text>
            </View>
          </View>

          <View style={s.card}>
            <Text style={s.cardLabel}>PILLAR BALANCE</Text>
            <View style={{ alignItems: 'center' }}>
              <RadarChart data={stats.pillar_breakdown.map(p => ({
                pillar_id: p.pillar_id, pillar_name: p.pillar_name,
                score: Math.min(100, (p.total_hours * 2 + (p.avg_depth_score || 0)) / 3 * 1.5),
              }))} />
            </View>
          </View>

          <View style={s.card}>
            <Text style={s.cardLabel}>DEPTH — 90 DAYS</Text>
            <DepthChart data={depthData} />
          </View>

          <View style={s.card}>
            <Text style={s.cardLabel}>1% DAILY COMPOUND</Text>
            <CompoundingChart stats={stats} />
          </View>

          <View style={s.card}>
            <Text style={s.cardLabel}>PILLARS</Text>
            {stats.pillar_breakdown.map((p, i) => (
              <View key={p.pillar_id} style={[s.pillarRow, i < stats.pillar_breakdown.length - 1 && s.divider]}>
                <View style={[s.dot, { backgroundColor: PILLAR_COLORS[p.pillar_id] || colors.textTertiary }]} />
                <View style={{ flex: 1 }}>
                  <Text style={s.pillarName}>{p.pillar_name}</Text>
                  <Text style={s.pillarMeta}>{p.total_hours}h · {p.entry_count} entries{p.avg_depth_score != null ? ` · ${p.avg_depth_score}` : ''}</Text>
                </View>
              </View>
            ))}
          </View>

          {stats.streaks.length > 0 && (
            <View style={s.card}>
              <Text style={s.cardLabel}>STREAKS</Text>
              {stats.streaks.map((sk, i) => (
                <View key={sk.id} style={[s.streakRow, i < stats.streaks.length - 1 && s.divider]}>
                  <Text style={s.streakName}>{sk.pillar_name}</Text>
                  <View style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'center' }}>
                    <Text style={{ ...typography.title3, color: colors.warning }}>{sk.current_streak}d</Text>
                    <Text style={{ ...typography.micro, color: colors.textTertiary }}>best {sk.longest_streak}d</Text>
                  </View>
                </View>
              ))}
            </View>
          )}

          <View style={s.card}>
            <Text style={s.cardLabel}>ACTIVITY — 6 MONTHS</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={s.heatmapGrid}>
                {heatmapGrid.map((week, wi) => (
                  <View key={wi} style={{ gap: 2 }}>
                    {week.map((day, di) => (
                      <View key={`${wi}-${di}`} style={[s.heatCell,
                        { backgroundColor: day ? HEATMAP_COLORS[intensityLevel(day.count)] : 'transparent' }]} />
                    ))}
                  </View>
                ))}
              </View>
            </ScrollView>
          </View>
        </>
      )}

      {/* STRENGTH */}
      {activeSection === 'strength' && (
        grouped.length === 0 ? (
          <View style={s.empty}>
            <Ionicons name="barbell-outline" size={48} color={colors.textTertiary} />
            <Text style={s.emptyTitle}>No data yet</Text>
          </View>
        ) : grouped.map(mg => (
          <View key={mg.key} style={s.card}>
            <TouchableOpacity style={s.groupHeader} onPress={() => toggleGroup(mg.key)}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                <Ionicons name={mg.icon} size={18} color={colors.textSecondary} />
                <Text style={s.groupTitle}>{mg.label}</Text>
                <View style={s.countBadge}><Text style={s.countText}>{mg.exercises.length}</Text></View>
              </View>
              <Ionicons name={expandedGroups.has(mg.key) ? 'chevron-up' : 'chevron-down'} size={16} color={colors.textTertiary} />
            </TouchableOpacity>

            {expandedGroups.has(mg.key) ? mg.exercises.map((ex, i) => (
              <View key={ex.id} style={[s.exItem, i < mg.exercises.length - 1 && s.divider]}>
                <View style={{ flex: 1 }}>
                  <Text style={s.exName}>{ex.exercise_name}</Text>
                  <Text style={s.exMeta}>
                    {ex.current_working_weight ? `${ex.current_working_weight} lb` : 'Discovering'}
                    {ex.estimated_1rm ? ` · e1RM ${ex.estimated_1rm}` : ''}
                    {` · ${ex.current_set_target || 4}x${ex.current_rep_target || 5}`}
                  </Text>
                </View>
                <View style={[s.statusPill, { backgroundColor: (STATUS_COLORS[ex.progression_status] || colors.textTertiary) + '18' }]}>
                  <Text style={[s.statusText, { color: STATUS_COLORS[ex.progression_status] || colors.textTertiary }]}>
                    {ex.progression_status}
                  </Text>
                </View>
              </View>
            )) : (
              <View style={{ paddingTop: spacing.sm }}>
                {mg.exercises.slice(0, 2).map(ex => (
                  <Text key={ex.id} style={s.collapsedLine}>
                    {ex.exercise_name}{ex.current_working_weight ? ` · ${ex.current_working_weight}lb` : ''}
                  </Text>
                ))}
                {mg.exercises.length > 2 && <Text style={{ ...typography.caption, color: colors.accent }}>+{mg.exercises.length - 2} more</Text>}
              </View>
            )}
          </View>
        ))
      )}

      {/* RUNNING */}
      {activeSection === 'running' && (
        <View style={s.empty}>
          <Ionicons name="footsteps-outline" size={48} color={colors.textTertiary} />
          <Text style={s.emptyTitle}>Running Analytics</Text>
          <Text style={s.emptySubtitle}>Coming soon</Text>
        </View>
      )}

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

function buildHeatmapGrid(data: HeatmapDay[]): (HeatmapDay | null)[][] {
  if (!data.length) return [];
  const lookup = new Map(data.map(d => [d.date, d]));
  const start = new Date(data[0].date + 'T00:00:00');
  const end = new Date(data[data.length - 1].date + 'T00:00:00');
  start.setDate(start.getDate() - start.getDay());
  const weeks: (HeatmapDay | null)[][] = [];
  let cur = new Date(start);
  while (cur <= end) {
    const week: (HeatmapDay | null)[] = [];
    for (let d = 0; d < 7; d++) {
      const key = cur.toISOString().split('T')[0];
      week.push(lookup.get(key) || { date: key, count: 0, pillars: [] });
      cur.setDate(cur.getDate() + 1);
    }
    weeks.push(week);
  }
  return weeks;
}

const s = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: colors.bg },
  container: { padding: spacing.lg, paddingTop: Platform.OS === 'ios' ? 68 : 48, paddingBottom: 40 },
  center: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  screenTitle: { ...typography.title1, color: colors.text, marginBottom: spacing.md },

  sectionTabs: { flexDirection: 'row', gap: spacing.xs, marginBottom: spacing.lg },
  tab: {
    paddingHorizontal: spacing.lg, paddingVertical: spacing.sm,
    borderRadius: radius.pill, backgroundColor: colors.card,
    borderWidth: 1, borderColor: colors.border,
  },
  tabActive: { backgroundColor: colors.accentMuted, borderColor: colors.accent },
  tabText: { ...typography.caption, color: colors.textTertiary, fontWeight: '600' },
  tabTextActive: { color: colors.accent },

  card: { ...cardStyle, marginBottom: spacing.md },
  cardLabel: { ...typography.micro, color: colors.textTertiary, textTransform: 'uppercase', marginBottom: spacing.md },
  divider: { borderBottomWidth: 1, borderBottomColor: colors.border, paddingBottom: spacing.md, marginBottom: spacing.md },

  statsGrid: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.md },
  statCard: {
    flex: 1, backgroundColor: colors.card, borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.border, padding: spacing.md, alignItems: 'center',
  },
  statCardValue: { fontSize: 28, fontWeight: '700', color: colors.text, fontVariant: ['tabular-nums'] },
  statCardLabel: { ...typography.micro, color: colors.textTertiary, marginTop: 4 },

  pillarRow: { flexDirection: 'row', alignItems: 'center' },
  dot: { width: 8, height: 8, borderRadius: 4, marginRight: spacing.md },
  pillarName: { ...typography.body, color: colors.text, fontWeight: '600' },
  pillarMeta: { ...typography.caption, color: colors.textTertiary, marginTop: 2 },

  streakRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  streakName: { ...typography.body, color: colors.text },

  heatmapGrid: { flexDirection: 'row', gap: 2, paddingVertical: spacing.sm },
  heatCell: { width: 12, height: 12, borderRadius: 2 },

  groupHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  groupTitle: { ...typography.title3, color: colors.text },
  countBadge: { backgroundColor: colors.input, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  countText: { ...typography.micro, color: colors.textTertiary },

  exItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: spacing.md },
  exName: { ...typography.body, color: colors.text, fontWeight: '500' },
  exMeta: { ...typography.caption, color: colors.textTertiary, marginTop: 2 },
  statusPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill },
  statusText: { ...typography.micro, fontWeight: '700', textTransform: 'uppercase' },
  collapsedLine: { ...typography.caption, color: colors.textTertiary, marginBottom: 2 },

  empty: { alignItems: 'center', paddingVertical: spacing.xxl, gap: spacing.sm },
  emptyTitle: { ...typography.title3, color: colors.text },
  emptySubtitle: { ...typography.body, color: colors.textTertiary },
});
