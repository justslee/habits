import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text, ScrollView, StyleSheet, Animated, ActivityIndicator, LayoutAnimation, Platform, UIManager,
  RefreshControl, TouchableOpacity, TextInput,
} from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import {
  getDashboardStats, getHeatmap, getDepthProgression, getExerciseProfiles,
  getVision, saveVision, getRecentEntries, deleteEntry, restoreEntry,
  DashboardStats, HeatmapDay, DepthProgressionPoint, ExerciseProfileData,
  VisionData, EntryResponse,
  API_URL, apiHeaders,
} from '../api/client';
import { haptic } from '../utils/haptics';
import RadarChart from '../components/RadarChart';
import DepthChart from '../components/DepthChart';
import CompoundingChart from '../components/CompoundingChart';
import { ProgressSkeleton } from '../components/Skeleton';
import SwipeableRow from '../components/SwipeableRow';
import UndoToast from '../components/UndoToast';
import { colors, spacing, typography, radius, cardStyle, PILLAR_COLORS } from '../theme';

/** Animated counter that counts up from 0 to a target number. */
function CountUp({ value, duration = 800, style }: { value: number | null; duration?: number; style?: any }) {
  const animValue = useRef(new Animated.Value(0)).current;
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    if (value == null) return;
    animValue.setValue(0);
    Animated.timing(animValue, {
      toValue: value,
      duration,
      useNativeDriver: false,
    }).start();

    const listener = animValue.addListener(({ value: v }) => {
      setDisplayValue(Math.round(v));
    });
    return () => animValue.removeListener(listener);
  }, [value]);

  if (value == null) return <Text style={style}>—</Text>;
  return <Text style={style}>{displayValue}</Text>;
}

const MUSCLE_GROUPS = [
  { key: 'push', label: 'Push', icon: 'fitness-outline' as const },
  { key: 'pull', label: 'Pull', icon: 'arrow-up-outline' as const },
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

type Section = 'mastery' | 'strength' | 'running' | 'discipline' | 'vision';

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

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export default function ProgressScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [heatmap, setHeatmap] = useState<HeatmapDay[]>([]);
  const [depthData, setDepthData] = useState<DepthProgressionPoint[]>([]);
  const [profiles, setProfiles] = useState<ExerciseProfileData[]>([]);
  const [runStats, setRunStats] = useState<RunStats | null>(null);
  const [prs, setPRs] = useState<PRData[]>([]);
  const [vision, setVision] = useState<VisionData | null>(null);
  const [disciplineData, setDisciplineData] = useState<any>(null);
  const [disciplineRange, setDisciplineRange] = useState<number>(30);
  const [recentEntries, setRecentEntries] = useState<EntryResponse[]>([]);
  const [undoToast, setUndoToast] = useState<{
    visible: boolean; message: string; entryId: number; snapshot: EntryResponse | null;
  }>({ visible: false, message: '', entryId: 0, snapshot: null });
  const [heatTooltip, setHeatTooltip] = useState<{ date: string; count: number } | null>(null);
  const [conceptProgress, setConceptProgress] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [activeSection, setActiveSection] = useState<Section>('mastery');
  const [compoundExpanded, setCompoundExpanded] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

      // Fetch vision
      try {
        const v = await getVision();
        setVision(v);
      } catch (err) { console.warn('Failed to fetch vision', err); }

      // Fetch concept mastery overview
      try {
        const cpResp = await fetch(`${API_URL}/api/v1/concepts/progress/overview`, { headers: apiHeaders() });
        if (cpResp.ok) setConceptProgress(await cpResp.json());
      } catch (err) { console.warn('Failed to fetch concept progress', err); }

      // Fetch discipline analytics
      try {
        const dResp = await fetch(`${API_URL}/api/v1/daily/habits/analytics?start_date=${
          new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0]
        }`, { headers: apiHeaders() });
        if (dResp.ok) setDisciplineData(await dResp.json());
      } catch (err) { console.warn('Failed to fetch discipline', err); }

      // Fetch recent entries for delete capability
      try {
        const entries = await getRecentEntries(14);
        // Filter out rest-day reflections (no pillars = not a learning session)
        setRecentEntries(entries.filter(e => (e.pillar_tags || []).length > 0));
      } catch (err) { console.warn('Failed to fetch recent entries', err); }
    } catch (err) { console.warn('Failed to fetch progress data', err); } finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // --- Entry deletion with undo ---
  const handleDeleteEntry = async (entry: EntryResponse) => {
    setRecentEntries(prev => prev.filter(e => e.id !== entry.id));
    haptic.light();
    const desc = entry.description.length > 40
      ? entry.description.slice(0, 40) + '...'
      : entry.description;
    setUndoToast({ visible: true, message: `"${desc}" deleted`, entryId: entry.id, snapshot: entry });
    try {
      await deleteEntry(entry.id);
      fetchData(); // refresh stats, heatmap, streaks, pillars
    } catch (err) {
      console.warn('Failed to delete entry:', err);
      setRecentEntries(prev => [...prev, entry].sort((a, b) => b.id - a.id));
      setUndoToast(prev => ({ ...prev, visible: false }));
    }
  };

  const handleUndoEntry = async () => {
    const { entryId, snapshot } = undoToast;
    setUndoToast(prev => ({ ...prev, visible: false }));
    if (!snapshot) return;
    try {
      await restoreEntry(entryId);
      setRecentEntries(prev => [...prev, snapshot].sort((a, b) => b.id - a.id));
      fetchData(); // refresh stats, heatmap, streaks, pillars
    } catch (err) {
      console.warn('Failed to restore entry:', err);
    }
  };

  const toggleGroup = (key: string) => {
    setExpandedGroups(prev => { const next = new Set(prev); next.has(key) ? next.delete(key) : next.add(key); return next; });
  };

  if (loading) return (
    <View style={[s.scroll, { paddingTop: insets.top + spacing.md }]}>
      <ProgressSkeleton />
    </View>
  );

  const trend = stats ? (TREND_CONFIG[stats.trend] || { icon: 'ellipse' as const, color: colors.textTertiary }) : null;
  const heatmapGrid = buildHeatmapGrid(heatmap);
  const grouped = MUSCLE_GROUPS.map(mg => ({ ...mg, exercises: profiles.filter(p => p.muscle_group === mg.key) }));

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
    <ScrollView style={s.scroll} contentContainerStyle={[s.container, { paddingTop: insets.top + spacing.md }]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchData(); }} tintColor={colors.textTertiary} />}>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={s.sectionTabsScroll}
        contentContainerStyle={s.sectionTabs}
      >
        {([
          { key: 'mastery' as Section, icon: 'school-outline' as const, label: 'Mastery' },
          { key: 'strength' as Section, icon: 'barbell-outline' as const, label: 'Strength' },
          { key: 'running' as Section, icon: 'footsteps-outline' as const, label: 'Running' },
          { key: 'discipline' as Section, icon: 'flame-outline' as const, label: 'Discipline' },
          { key: 'vision' as Section, icon: 'telescope-outline' as const, label: 'Vision' },
        ]).map(({ key, icon, label }) => (
          <TouchableOpacity key={key}
            style={[s.tab, activeSection === key && s.tabActive]}
            onPress={() => { haptic.selection(); setActiveSection(key); }}>
            <Ionicons name={icon} size={16} color={activeSection === key ? colors.accent : colors.textTertiary} />
            <Text style={[s.tabText, activeSection === key && s.tabTextActive]}>
              {label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* MASTERY */}
      {activeSection === 'mastery' && stats && (
        <>
          <View style={s.statsGrid}>
            <View style={s.statCard}>
              <CountUp value={stats.hours.all_time} style={s.statCardValue} />
              <Text style={s.statCardLabel}>ALL TIME</Text>
            </View>
            <View style={s.statCard}>
              <CountUp value={stats.hours.this_week} style={s.statCardValue} />
              <Text style={s.statCardLabel}>THIS WEEK</Text>
            </View>
            <View style={s.statCard}>
              <CountUp value={stats.avg_depth_score} style={[s.statCardValue, { color: trend?.color }]} />
              <Text style={s.statCardLabel}>AVG DEPTH</Text>
            </View>
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
                <TouchableOpacity
                  key={p.pillar_id}
                  style={[s.pillarCard, i < stats.pillar_breakdown.length - 1 && s.divider]}
                  activeOpacity={0.7}
                  onPress={() => {
                    haptic.selection();
                    navigation.navigate('PillarDetail', { pillarId: p.pillar_id, pillarName: p.pillar_name });
                  }}
                >
                  <View style={s.pillarHeader}>
                    <View style={[s.dot, { backgroundColor: pillarColor }]} />
                    <Text style={s.pillarName}>{p.pillar_name}</Text>
                    <Ionicons name="chevron-forward" size={14} color={colors.textTertiary} style={{ marginLeft: 4 }} />
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
                </TouchableOpacity>
              );
            })}
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
                      {week.map((day, di) => {
                        const isToday = day?.date === new Date().toISOString().split('T')[0];
                        return (
                          <TouchableOpacity
                            key={`${wi}-${di}`}
                            activeOpacity={0.7}
                            onLongPress={() => {
                              if (day) {
                                haptic.selection();
                                setHeatTooltip({ date: day.date, count: day.count });
                                setTimeout(() => setHeatTooltip(null), 2000);
                              }
                            }}
                            delayLongPress={200}
                            style={[
                              s.heatCell,
                              { backgroundColor: day ? HEATMAP_COLORS[intensityLevel(day.count)] : colors.card },
                              isToday && s.heatCellToday,
                            ]}
                          />
                        );
                      })}
                    </View>
                  ))}
                </View>
              </View>
            </ScrollView>
            {/* Tooltip */}
            {heatTooltip && (
              <View style={s.heatTooltip}>
                <Text style={s.heatTooltipText}>
                  {new Date(heatTooltip.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  {' — '}{heatTooltip.count} {heatTooltip.count === 1 ? 'entry' : 'entries'}
                </Text>
              </View>
            )}
            {/* Legend */}
            <View style={s.heatLegend}>
              <Text style={s.heatLegendLabel}>Less</Text>
              {HEATMAP_COLORS.map((c, i) => (
                <View key={i} style={[s.heatCell, { backgroundColor: c }]} />
              ))}
              <Text style={s.heatLegendLabel}>More</Text>
            </View>
          </View>

          {/* Weekly Review card */}
          <TouchableOpacity
            style={s.card}
            activeOpacity={0.7}
            onPress={() => { haptic.selection(); navigation.navigate('WeeklyReview'); }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                <Ionicons name="document-text-outline" size={18} color={colors.accent} />
                <Text style={s.cardLabel}>WEEKLY REVIEW</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
            </View>
            <Text style={{ ...typography.caption, color: colors.textSecondary, marginTop: spacing.sm }}>
              AI-generated board meeting — grade, analysis, and next week's focus
            </Text>
          </TouchableOpacity>

          {/* Concept Mastery Map */}
          {conceptProgress.length > 0 && conceptProgress.some((cp: any) => cp.total_concepts > 0) && (
            <View style={s.card}>
              <Text style={s.cardLabel}>MASTERY MAP</Text>
              {conceptProgress.filter((cp: any) => cp.total_concepts > 0).map((cp: any) => {
                const pillarColor = PILLAR_COLORS[cp.pillar_id] || colors.textTertiary;
                const masteredPct = cp.total_concepts > 0 ? (cp.mastered / cp.total_concepts) * 100 : 0;
                const inProgressPct = cp.total_concepts > 0 ? (cp.in_progress / cp.total_concepts) * 100 : 0;
                return (
                  <TouchableOpacity
                    key={cp.pillar_id}
                    style={[s.pillarCard, { paddingVertical: spacing.sm }]}
                    activeOpacity={0.7}
                    onPress={() => {
                      haptic.selection();
                      navigation.navigate('PillarDetail', { pillarId: cp.pillar_id, pillarName: cp.pillar_name });
                    }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                        <View style={[s.dot, { backgroundColor: pillarColor }]} />
                        <Text style={s.pillarName}>{cp.pillar_name}</Text>
                      </View>
                      <Text style={{ ...typography.micro, color: colors.textTertiary }}>
                        {cp.mastered}/{cp.total_concepts}
                        {cp.recently_touched > 0 ? ` · ${cp.recently_touched} active` : ''}
                      </Text>
                    </View>
                    {/* Stacked progress bar: mastered + in_progress */}
                    <View style={[s.pillarBarTrack, { height: 6 }]}>
                      <View style={[s.pillarBarFill, {
                        width: `${masteredPct + inProgressPct}%` as any,
                        backgroundColor: pillarColor + '40',
                        position: 'absolute', left: 0, top: 0, bottom: 0,
                        borderRadius: 3,
                      }]} />
                      <View style={[s.pillarBarFill, {
                        width: `${masteredPct}%` as any,
                        backgroundColor: pillarColor,
                      }]} />
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          {/* Recent Sessions — swipe to delete */}
          {recentEntries.length > 0 && (
            <View style={s.recentSection}>
              <Text style={s.sectionLabel}>Recent Sessions</Text>
              <Text style={[s.sectionHint, { marginBottom: spacing.sm }]}>Swipe left to delete</Text>
              {recentEntries.slice(0, 10).map(entry => {
                const pillarIds: number[] = entry.pillar_tags || [];
                const scorePct = entry.evaluation
                  ? Math.round((entry.evaluation.depth_score + entry.evaluation.relevance_score) / 2)
                  : null;
                const onePercent = entry.evaluation?.one_percent_better;
                return (
                  <SwipeableRow key={entry.id} onDelete={() => handleDeleteEntry(entry)}>
                    <View style={s.entryRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={s.entryDesc} numberOfLines={1}>{entry.description}</Text>
                        <View style={s.entryMeta}>
                          <Text style={s.entryDate}>{entry.entry_date}</Text>
                          <Text style={s.entryTime}>{entry.time_invested_minutes}m</Text>
                          {pillarIds.map(pid => (
                            <View key={pid} style={[s.entryPillarDot, { backgroundColor: PILLAR_COLORS[pid] || colors.textTertiary }]} />
                          ))}
                        </View>
                      </View>
                      {scorePct != null && (
                        <View style={s.entryScore}>
                          <Text style={[s.entryScoreText, { color: onePercent ? colors.success : colors.textTertiary }]}>
                            {scorePct}
                          </Text>
                          {onePercent && <Ionicons name="arrow-up" size={10} color={colors.success} />}
                        </View>
                      )}
                    </View>
                  </SwipeableRow>
                );
              })}
            </View>
          )}
        </>
      )}

      {/* STRENGTH */}
      {activeSection === 'strength' && (
        grouped.map(mg => (
          <View key={mg.key} style={s.card}>
            <TouchableOpacity style={s.groupHeader} onPress={() => toggleGroup(mg.key)}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                <Ionicons name={mg.icon} size={18} color={colors.textSecondary} />
                <Text style={s.groupTitle}>{mg.label}</Text>
                <View style={s.countBadge}><Text style={s.countText}>{mg.exercises.length}</Text></View>
              </View>
              <Ionicons name={expandedGroups.has(mg.key) ? 'chevron-up' : 'chevron-down'} size={16} color={colors.textTertiary} />
            </TouchableOpacity>

            {mg.exercises.length === 0 ? (
              <View style={{ paddingTop: spacing.md, paddingBottom: spacing.xs }}>
                <Text style={{ ...typography.caption, color: colors.textTertiary }}>No exercises tracked yet</Text>
                <Text style={{ ...typography.micro, color: colors.textTertiary, marginTop: 2 }}>
                  Log a {mg.label.toLowerCase()} workout to see progress
                </Text>
              </View>
            ) : expandedGroups.has(mg.key) ? mg.exercises.map((ex, i) => (
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

      {/* DISCIPLINE */}
      {activeSection === 'discipline' && (
        disciplineData && disciplineData.habits.length > 0 ? (
          <>
            {/* Discipline Score */}
            <View style={s.statsGrid}>
              <View style={s.statCard}>
                <Text style={[s.statCardValue, { color: disciplineData.discipline_score >= 80 ? colors.success : disciplineData.discipline_score >= 60 ? colors.warning : colors.error }]}>
                  {disciplineData.discipline_score}%
                </Text>
                <Text style={s.statCardLabel}>DISCIPLINE</Text>
              </View>
              <View style={s.statCard}>
                <Text style={[s.statCardValue, { color: colors.accent }]}>{disciplineData.weekly_grade}</Text>
                <Text style={s.statCardLabel}>GRADE</Text>
              </View>
              <View style={s.statCard}>
                <Text style={[s.statCardValue, { color: '#F59E0B' }]}>{disciplineData.perfect_day_count}</Text>
                <Text style={s.statCardLabel}>PERFECT DAYS</Text>
              </View>
            </View>

            {/* Per-habit stats */}
            <View style={s.card}>
              <Text style={s.cardLabel}>HABIT STREAKS</Text>
              {disciplineData.habits.map((h: any) => (
                <View key={h.id} style={[ds.habitStatRow, { borderBottomWidth: 1, borderBottomColor: colors.border }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={ds.habitName}>{h.name}</Text>
                    <View style={{ flexDirection: 'row', gap: spacing.md, marginTop: 4 }}>
                      <Text style={ds.habitMeta}>{h.completion_rate}% rate</Text>
                      <Text style={ds.habitMeta}>{h.rate_7d}% (7d)</Text>
                    </View>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Ionicons name="flame" size={14} color="#F59E0B" />
                      <Text style={ds.streakNum}>{h.current_streak}d</Text>
                    </View>
                    <Text style={ds.bestStreak}>best {h.longest_streak}d</Text>
                  </View>
                </View>
              ))}
            </View>

            {/* Completion heatmap per habit */}
            <View style={s.card}>
              <Text style={s.cardLabel}>COMPLETION MAP — 30 DAYS</Text>
              {disciplineData.habits.map((h: any) => {
                const habitColor = h.color || colors.accent;
                return (
                  <View key={h.id} style={{ marginBottom: spacing.md }}>
                    <Text style={ds.miniHabitLabel}>{h.name}</Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 2 }}>
                      {Object.entries(disciplineData.daily_map || {}).map(([dateStr, ids]: [string, any]) => {
                        const completed = (ids as number[]).includes(h.id);
                        return (
                          <View
                            key={dateStr}
                            style={[ds.miniCell, { backgroundColor: completed ? habitColor : colors.input }]}
                          />
                        );
                      })}
                    </View>
                  </View>
                );
              })}
            </View>
          </>
        ) : (
          <View style={s.empty}>
            <Ionicons name="flame-outline" size={48} color={colors.textTertiary} />
            <Text style={s.emptyTitle}>No habits yet</Text>
            <Text style={s.emptySubtitle}>Create habits in the Daily tab to track discipline</Text>
          </View>
        )
      )}

      {/* VISION */}
      {activeSection === 'vision' && (
        <VisionEditor
          vision={vision}
          onUpdate={(updated) => setVision(updated)}
          pillarBreakdown={stats?.pillar_breakdown}
        />
      )}

      <View style={{ height: 40 }} />

      {/* Undo toast for entry deletion */}
      <UndoToast
        visible={undoToast.visible}
        message={undoToast.message}
        onUndo={handleUndoEntry}
        onDismiss={() => setUndoToast(prev => ({ ...prev, visible: false }))}
      />
    </ScrollView>
    </GestureHandlerRootView>
  );
}

// ---- Vision Editor Component ----

function VisionEditor({
  vision,
  onUpdate,
  pillarBreakdown,
}: {
  vision: VisionData | null;
  onUpdate: (v: VisionData) => void;
  pillarBreakdown?: { pillar_id: number; pillar_name: string }[];
}) {
  const [visionText, setVisionText] = useState(vision?.vision_text || '');
  const [pillarTargets, setPillarTargets] = useState<Record<string, string>>(vision?.pillar_targets || {});
  const [antiGoals, setAntiGoals] = useState<string[]>(vision?.anti_goals || []);
  const [newAntiGoal, setNewAntiGoal] = useState('');
  const [saving, setSaving] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync when vision prop changes
  useEffect(() => {
    setVisionText(vision?.vision_text || '');
    setPillarTargets(vision?.pillar_targets || {});
    setAntiGoals(vision?.anti_goals || []);
  }, [vision]);

  const debouncedSave = useCallback((data: Partial<VisionData>) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      setSaving(true);
      try {
        const result = await saveVision(data);
        onUpdate(result);
      } catch (err) {
        console.warn('Failed to save vision:', err);
      }
      setSaving(false);
    }, 1000);
  }, [onUpdate]);

  const updateVisionText = (text: string) => {
    setVisionText(text);
    debouncedSave({ vision_text: text });
  };

  const updatePillarTarget = (pillarId: string, text: string) => {
    const updated = { ...pillarTargets, [pillarId]: text };
    setPillarTargets(updated);
    debouncedSave({ pillar_targets: updated });
  };

  const addAntiGoal = () => {
    const text = newAntiGoal.trim();
    if (!text) return;
    const updated = [...antiGoals, text];
    setAntiGoals(updated);
    setNewAntiGoal('');
    debouncedSave({ anti_goals: updated });
    haptic.light();
  };

  const removeAntiGoal = (index: number) => {
    const updated = antiGoals.filter((_, i) => i !== index);
    setAntiGoals(updated);
    debouncedSave({ anti_goals: updated });
    haptic.light();
  };

  return (
    <>
      {/* North Star */}
      <View style={s.card}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: spacing.md }}>
          <Ionicons name="compass-outline" size={16} color={colors.accent} />
          <Text style={s.cardLabel}>NORTH STAR VISION</Text>
          {saving && <ActivityIndicator size="small" color={colors.accent} style={{ marginLeft: 'auto' }} />}
        </View>
        <TextInput
          style={vs.visionInput}
          value={visionText}
          onChangeText={updateVisionText}
          placeholder="What is your ultimate vision? What does mastery look like for you?"
          placeholderTextColor={colors.textTertiary}
          multiline
          textAlignVertical="top"
        />
      </View>

      {/* Pillar Targets */}
      <View style={s.card}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: spacing.md }}>
          <Ionicons name="flag-outline" size={16} color={colors.accent} />
          <Text style={s.cardLabel}>PILLAR TARGETS</Text>
        </View>
        {(pillarBreakdown || []).map(p => {
          const pillarColor = PILLAR_COLORS[p.pillar_id] || colors.accent;
          return (
            <View key={p.pillar_id} style={vs.pillarTargetRow}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <View style={[vs.pillarDot, { backgroundColor: pillarColor }]} />
                <Text style={vs.pillarLabel}>{p.pillar_name}</Text>
              </View>
              <TextInput
                style={vs.pillarInput}
                value={pillarTargets[String(p.pillar_id)] || ''}
                onChangeText={(text) => updatePillarTarget(String(p.pillar_id), text)}
                placeholder={`What do you want to achieve in ${p.pillar_name.split(' ')[0]}?`}
                placeholderTextColor={colors.textTertiary}
                multiline
                textAlignVertical="top"
              />
            </View>
          );
        })}
        {(!pillarBreakdown || pillarBreakdown.length === 0) && (
          <Text style={{ ...typography.caption, color: colors.textTertiary }}>
            Log some entries with pillar tags to see targets here
          </Text>
        )}
      </View>

      {/* Anti-Goals */}
      <View style={s.card}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: spacing.md }}>
          <Ionicons name="close-circle-outline" size={16} color={colors.error} />
          <Text style={s.cardLabel}>ANTI-GOALS</Text>
        </View>
        <Text style={vs.antiGoalDesc}>Things you explicitly do NOT want to become or do.</Text>
        {antiGoals.map((ag, i) => (
          <View key={i} style={vs.antiGoalRow}>
            <View style={vs.antiGoalBullet} />
            <Text style={vs.antiGoalText}>{ag}</Text>
            <TouchableOpacity onPress={() => removeAntiGoal(i)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close" size={16} color={colors.textTertiary} />
            </TouchableOpacity>
          </View>
        ))}
        <View style={vs.addAntiRow}>
          <TextInput
            style={vs.addAntiInput}
            value={newAntiGoal}
            onChangeText={setNewAntiGoal}
            placeholder="Add an anti-goal..."
            placeholderTextColor={colors.textTertiary}
            onSubmitEditing={addAntiGoal}
            returnKeyType="done"
          />
          {newAntiGoal.trim().length > 0 && (
            <TouchableOpacity onPress={addAntiGoal}>
              <Ionicons name="add-circle" size={24} color={colors.accent} />
            </TouchableOpacity>
          )}
        </View>
      </View>
    </>
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

  sectionTabsScroll: { flexGrow: 0, marginBottom: spacing.lg },
  sectionTabs: { flexDirection: 'row', gap: spacing.xs, paddingRight: spacing.lg },
  tab: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
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
  heatCellToday: { borderWidth: 1.5, borderColor: colors.accent },
  heatTooltip: {
    alignSelf: 'center', backgroundColor: colors.cardElevated,
    paddingHorizontal: spacing.md, paddingVertical: spacing.xs,
    borderRadius: radius.sm, marginTop: spacing.xs,
    borderWidth: 1, borderColor: colors.border,
  },
  heatTooltipText: { ...typography.caption, color: colors.text },
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

  // Recent sessions
  recentSection: { marginTop: spacing.xl },
  sectionLabel: { ...typography.bodyBold, color: colors.text, marginBottom: 2 },
  sectionHint: { ...typography.micro, color: colors.textTertiary },
  entryRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: spacing.md, paddingHorizontal: spacing.md,
    backgroundColor: colors.card, borderRadius: radius.md,
    marginBottom: spacing.xs,
    borderWidth: 1, borderColor: colors.border,
  },
  entryDesc: { ...typography.body, color: colors.text },
  entryMeta: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: 3 },
  entryDate: { ...typography.micro, color: colors.textTertiary },
  entryTime: { ...typography.micro, color: colors.textSecondary, fontWeight: '600' },
  entryPillarDot: { width: 8, height: 8, borderRadius: 4 },
  entryScore: { alignItems: 'center', marginLeft: spacing.sm },
  entryScoreText: { fontSize: 18, fontWeight: '700', fontVariant: ['tabular-nums'] as any },
});

// Discipline-specific styles
const ds = StyleSheet.create({
  habitStatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
  },
  habitName: {
    ...typography.body,
    color: colors.text,
    fontWeight: '600',
  },
  habitMeta: {
    ...typography.caption,
    color: colors.textTertiary,
  },
  streakNum: {
    fontSize: 18,
    fontWeight: '700',
    color: '#F59E0B',
    fontVariant: ['tabular-nums'] as any,
  },
  bestStreak: {
    ...typography.micro,
    color: colors.textTertiary,
    marginTop: 2,
  },
  miniHabitLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    marginBottom: 4,
  },
  miniCell: {
    width: 8,
    height: 8,
    borderRadius: 2,
  },
});

// Vision-specific styles
const vs = StyleSheet.create({
  visionInput: {
    ...typography.body,
    color: colors.text,
    backgroundColor: colors.input,
    borderRadius: radius.md,
    padding: spacing.md,
    minHeight: 120,
    textAlignVertical: 'top',
  },
  pillarTargetRow: {
    marginBottom: spacing.md,
  },
  pillarDot: {
    width: 8, height: 8, borderRadius: 4,
  },
  pillarLabel: {
    ...typography.bodyBold,
    color: colors.text,
  },
  pillarInput: {
    ...typography.body,
    color: colors.text,
    backgroundColor: colors.input,
    borderRadius: radius.sm,
    padding: spacing.md,
    minHeight: 60,
    textAlignVertical: 'top',
  },
  antiGoalDesc: {
    ...typography.caption,
    color: colors.textTertiary,
    marginBottom: spacing.md,
  },
  antiGoalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  antiGoalBullet: {
    width: 6, height: 6, borderRadius: 3,
    backgroundColor: colors.error,
  },
  antiGoalText: {
    ...typography.body,
    color: colors.text,
    flex: 1,
  },
  addAntiRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.input,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    marginTop: spacing.sm,
  },
  addAntiInput: {
    flex: 1,
    paddingVertical: 12,
    ...typography.body,
    color: colors.text,
  },
});
