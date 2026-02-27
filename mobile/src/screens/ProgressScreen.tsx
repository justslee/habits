import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, ActivityIndicator,
  RefreshControl, TouchableOpacity,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import {
  getDashboardStats, getHeatmap, getDepthProgression, getExerciseProfiles,
  DashboardStats, HeatmapDay, DepthProgressionPoint, ExerciseProfileData,
  API_URL, apiHeaders,
} from '../api/client';
import { haptic } from '../utils/haptics';
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

interface RunStats {
  total_runs: number;
  total_miles: number;
  this_week_miles: number;
  this_month_miles: number;
  avg_pace_seconds: number | null;
  fastest_pace_seconds: number | null;
  longest_run_miles: number;
}

interface PRData {
  id: number;
  distance_label: string;
  time_seconds: number;
  time_formatted: string;
  record_date: string;
}

function fmtPace(s: number | null): string {
  if (!s || s <= 0) return '--:--';
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
}

export default function ProgressScreen() {
  const insets = useSafeAreaInsets();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [heatmap, setHeatmap] = useState<HeatmapDay[]>([]);
  const [depthData, setDepthData] = useState<DepthProgressionPoint[]>([]);
  const [profiles, setProfiles] = useState<ExerciseProfileData[]>([]);
  const [runStats, setRunStats] = useState<RunStats | null>(null);
  const [prs, setPRs] = useState<PRData[]>([]);
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

      // Fetch run data
      try {
        const [rsResp, prResp] = await Promise.all([
          fetch(`${API_URL}/api/v1/runs/stats`, { headers: apiHeaders() }),
          fetch(`${API_URL}/api/v1/runs/prs`, { headers: apiHeaders() }),
        ]);
        if (rsResp.ok) setRunStats(await rsResp.json());
        if (prResp.ok) setPRs(await prResp.json());
      } catch (err) { console.warn('Failed to fetch run data', err); }
    } catch (err) { console.warn('Failed to fetch progress data', err); } finally { setLoading(false); setRefreshing(false); }
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
    <ScrollView style={s.scroll} contentContainerStyle={[s.container, { paddingTop: insets.top + spacing.md }]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchData(); }} tintColor={colors.textTertiary} />}>

      <Text style={s.screenTitle}>Progress</Text>

      <View style={s.sectionTabs}>
        {(['mastery', 'strength', 'running'] as Section[]).map(key => (
          <TouchableOpacity key={key}
            style={[s.tab, activeSection === key && s.tabActive]}
            onPress={() => { haptic.selection(); setActiveSection(key); }}>
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
            {stats.pillar_breakdown.map((p, i) => {
              const pillarColor = PILLAR_COLORS[p.pillar_id] || colors.textTertiary;
              const totalPct = stats.hours.all_time > 0 ? (p.total_hours / stats.hours.all_time) * 100 : 0;
              return (
                <View key={p.pillar_id} style={[s.pillarCard, i < stats.pillar_breakdown.length - 1 && s.divider]}>
                  <View style={s.pillarHeader}>
                    <View style={[s.dot, { backgroundColor: pillarColor }]} />
                    <Text style={s.pillarName}>{p.pillar_name}</Text>
                    <Text style={s.pillarHours}>{p.total_hours}h</Text>
                  </View>
                  {/* Progress bar showing share of total hours */}
                  <View style={s.pillarBarTrack}>
                    <View style={[s.pillarBarFill, { width: `${totalPct}%` as any, backgroundColor: pillarColor }]} />
                  </View>
                  <View style={s.pillarFooter}>
                    <Text style={s.pillarMeta}>{p.entry_count} entries</Text>
                    {p.avg_depth_score != null && (
                      <Text style={s.pillarMeta}>depth {p.avg_depth_score}</Text>
                    )}
                  </View>
                </View>
              );
            })}
          </View>

          {stats.streaks.length > 0 && (
            <View style={s.card}>
              <Text style={s.cardLabel}>STREAKS</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -spacing.sm }}>
                <View style={{ flexDirection: 'row', gap: spacing.md, paddingHorizontal: spacing.sm }}>
                  {stats.streaks.map(sk => {
                    const pct = sk.longest_streak > 0 ? Math.min(100, (sk.current_streak / sk.longest_streak) * 100) : 0;
                    const pillarColor = PILLAR_COLORS[sk.pillar_id] || colors.warning;
                    return (
                      <View key={sk.id} style={s.streakRing}>
                        {/* Ring background */}
                        <View style={[s.ringTrack, { borderColor: 'rgba(255,255,255,0.05)' }]}>
                          {/* Ring fill - simulated with border */}
                          <View style={[s.ringTrack, {
                            borderColor: pillarColor,
                            borderTopColor: pct > 75 ? pillarColor : 'transparent',
                            borderRightColor: pct > 50 ? pillarColor : 'transparent',
                            borderBottomColor: pct > 25 ? pillarColor : 'transparent',
                            position: 'absolute',
                          }]} />
                          <Text style={s.ringNum}>{sk.current_streak}</Text>
                        </View>
                        <Text style={s.ringLabel} numberOfLines={1}>{sk.pillar_name.split(' ')[0]}</Text>
                        <Text style={s.ringBest}>best {sk.longest_streak}d</Text>
                      </View>
                    );
                  })}
                </View>
              </ScrollView>
            </View>
          )}

          <View style={s.card}>
            <Text style={s.cardLabel}>ACTIVITY — 6 MONTHS</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View>
                {/* Month labels */}
                <View style={s.heatmapMonths}>
                  {heatmapGrid.map((week, wi) => {
                    if (!week[0]) return <View key={wi} style={{ width: 14 }} />;
                    const d = new Date(week[0].date + 'T00:00:00');
                    const isFirstWeekOfMonth = d.getDate() <= 7;
                    return (
                      <View key={wi} style={{ width: 14 }}>
                        {isFirstWeekOfMonth && (
                          <Text style={s.heatMonthLabel}>
                            {d.toLocaleDateString('en-US', { month: 'short' })}
                          </Text>
                        )}
                      </View>
                    );
                  })}
                </View>
                <View style={s.heatmapGrid}>
                  {heatmapGrid.map((week, wi) => (
                    <View key={wi} style={{ gap: 2 }}>
                      {week.map((day, di) => (
                        <View key={`${wi}-${di}`} style={[s.heatCell,
                          { backgroundColor: day ? HEATMAP_COLORS[intensityLevel(day.count)] : colors.card }]} />
                      ))}
                    </View>
                  ))}
                </View>
              </View>
            </ScrollView>
            {/* Legend */}
            <View style={s.heatLegend}>
              <Text style={s.heatLegendLabel}>Less</Text>
              {HEATMAP_COLORS.map((c, i) => (
                <View key={i} style={[s.heatCell, { backgroundColor: c }]} />
              ))}
              <Text style={s.heatLegendLabel}>More</Text>
            </View>
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
        <>
          {runStats && runStats.total_runs > 0 ? (
            <>
              {/* Mileage overview */}
              <View style={s.card}>
                <Text style={s.sectionHeader}>MILEAGE</Text>
                <View style={s.runStatsGrid}>
                  <View style={s.runStatBox}>
                    <Text style={s.runStatNum}>{runStats.total_miles.toFixed(1)}</Text>
                    <Text style={s.runStatLabel}>TOTAL MI</Text>
                  </View>
                  <View style={s.runStatBox}>
                    <Text style={s.runStatNum}>{runStats.this_week_miles.toFixed(1)}</Text>
                    <Text style={s.runStatLabel}>THIS WEEK</Text>
                  </View>
                  <View style={s.runStatBox}>
                    <Text style={s.runStatNum}>{runStats.this_month_miles.toFixed(1)}</Text>
                    <Text style={s.runStatLabel}>THIS MONTH</Text>
                  </View>
                  <View style={s.runStatBox}>
                    <Text style={s.runStatNum}>{runStats.total_runs}</Text>
                    <Text style={s.runStatLabel}>RUNS</Text>
                  </View>
                </View>
              </View>

              {/* Pace + Distance */}
              <View style={s.card}>
                <Text style={s.sectionHeader}>PERFORMANCE</Text>
                <View style={s.runStatsGrid}>
                  <View style={s.runStatBox}>
                    <Text style={s.runStatNum}>{fmtPace(runStats.avg_pace_seconds)}</Text>
                    <Text style={s.runStatLabel}>AVG PACE</Text>
                  </View>
                  <View style={s.runStatBox}>
                    <Text style={[s.runStatNum, { color: colors.success }]}>{fmtPace(runStats.fastest_pace_seconds)}</Text>
                    <Text style={s.runStatLabel}>FASTEST</Text>
                  </View>
                  <View style={s.runStatBox}>
                    <Text style={s.runStatNum}>{runStats.longest_run_miles.toFixed(1)}</Text>
                    <Text style={s.runStatLabel}>LONGEST MI</Text>
                  </View>
                </View>
              </View>

              {/* PR Board */}
              {prs.length > 0 && (
                <View style={s.card}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: spacing.md }}>
                    <Ionicons name="trophy" size={16} color="#F59E0B" />
                    <Text style={s.sectionHeader}>PERSONAL RECORDS</Text>
                  </View>
                  {prs.map(pr => (
                    <View key={pr.id} style={s.prRow}>
                      <Text style={s.prLabel}>{pr.distance_label.replace('_', ' ').toUpperCase()}</Text>
                      <Text style={s.prTime}>{pr.time_formatted}</Text>
                      <Text style={s.prDate}>
                        {new Date(pr.record_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </Text>
                    </View>
                  ))}
                </View>
              )}
            </>
          ) : (
            <View style={s.empty}>
              <Ionicons name="footsteps-outline" size={48} color={colors.textTertiary} />
              <Text style={s.emptyTitle}>No runs yet</Text>
              <Text style={s.emptySubtitle}>Complete your first run to see stats here</Text>
            </View>
          )}
        </>
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
  container: { padding: spacing.lg, paddingBottom: 40 },
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
  sectionHeader: { ...typography.micro, color: colors.textTertiary, textTransform: 'uppercase', marginBottom: spacing.md },
  divider: { borderBottomWidth: 1, borderBottomColor: colors.border, paddingBottom: spacing.md, marginBottom: spacing.md },

  statsGrid: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.md },
  statCard: {
    flex: 1, backgroundColor: colors.card, borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.border, padding: spacing.md, alignItems: 'center',
  },
  statCardValue: { fontSize: 28, fontWeight: '700', color: colors.text, fontVariant: ['tabular-nums'] },
  statCardLabel: { ...typography.micro, color: colors.textTertiary, marginTop: 4 },

  pillarCard: { paddingVertical: spacing.sm },
  pillarHeader: { flexDirection: 'row', alignItems: 'center' },
  dot: { width: 8, height: 8, borderRadius: 4, marginRight: spacing.sm },
  pillarName: { ...typography.body, color: colors.text, fontWeight: '600', flex: 1 },
  pillarHours: { ...typography.bodyBold, color: colors.text, fontVariant: ['tabular-nums'] },
  pillarBarTrack: {
    height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.05)',
    marginTop: spacing.xs, marginLeft: spacing.md + 8,
  },
  pillarBarFill: { height: '100%', borderRadius: 2 },
  pillarFooter: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4, marginLeft: spacing.md + 8 },
  pillarMeta: { ...typography.caption, color: colors.textTertiary },

  streakRing: { alignItems: 'center', width: 72 },
  ringTrack: {
    width: 56, height: 56, borderRadius: 28, borderWidth: 3,
    alignItems: 'center', justifyContent: 'center',
  },
  ringNum: { fontSize: 20, fontWeight: '700', color: colors.text },
  ringLabel: { ...typography.micro, color: colors.textSecondary, marginTop: 4 },
  ringBest: { ...typography.micro, color: colors.textTertiary, fontSize: 9 },

  heatmapMonths: { flexDirection: 'row', gap: 2, marginBottom: 2, height: 16 },
  heatMonthLabel: { ...typography.micro, color: colors.textTertiary, fontSize: 9 },
  heatmapGrid: { flexDirection: 'row', gap: 2, paddingVertical: spacing.sm },
  heatCell: { width: 12, height: 12, borderRadius: 2, borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.03)' },
  heatLegend: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 3, marginTop: spacing.xs },
  heatLegendLabel: { ...typography.micro, color: colors.textTertiary, fontSize: 9 },

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

  // Running section
  runStatsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  runStatBox: {
    flex: 1, minWidth: '28%' as any, alignItems: 'center', paddingVertical: spacing.md,
    backgroundColor: colors.bg, borderRadius: radius.sm,
  },
  runStatNum: { fontSize: 22, fontWeight: '700', color: colors.text, fontVariant: ['tabular-nums'] },
  runStatLabel: { ...typography.micro, color: colors.textTertiary, marginTop: 2 },
  prRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  prLabel: { ...typography.caption, color: colors.textSecondary, flex: 1 },
  prTime: { fontSize: 16, fontWeight: '600', color: colors.accent, fontVariant: ['tabular-nums'], flex: 1, textAlign: 'center' },
  prDate: { ...typography.micro, color: colors.textTertiary, flex: 1, textAlign: 'right' },
});
