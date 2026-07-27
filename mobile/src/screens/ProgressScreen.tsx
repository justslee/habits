import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text, ScrollView, StyleSheet, Animated, LayoutAnimation, Platform, UIManager,
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
  VisionData, EntryResponse, PillarStats,
  API_URL, apiHeaders,
} from '../api/client';
import { haptic } from '../utils/haptics';
import CompoundingChart from '../components/CompoundingChart';
import { ProgressSkeleton, Skeleton } from '../components/Skeleton';
import UndoToast from '../components/UndoToast';
import { colors, spacing, typography, radius, fonts, cardStyle, PILLAR_COLORS } from '../theme';
import ScreenBackground from '../components/ScreenBackground';
import KeyboardAvoider from '../components/KeyboardAvoider';
import { usePressScale } from '../hooks/usePressScale';
import NorthStarCard from '../components/NorthStarCard';
import Topbar from '../components/Topbar';


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

// Indigo shades: 0=bg (empty), 1-4=increasingly bright indigo
const HEATMAP_COLORS = [
  '#0B0D1A',
  'rgba(155,138,232,0.25)',
  'rgba(155,138,232,0.45)',
  'rgba(155,138,232,0.70)',
  'rgba(155,138,232,0.92)',
];

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

// ---------- Small reusable components ----------

function StripItem({ value, label }: { value: string | number; label: string }) {
  return (
    <View style={ms.stripItem}>
      <Text style={ms.stripValue}>{value}</Text>
      <Text style={ms.stripLabel}>{label}</Text>
    </View>
  );
}

function PillarHealthRow({ pillar, recentEntries }: { pillar: PillarStats; recentEntries: EntryResponse[] }) {
  const pillarColor = PILLAR_COLORS[pillar.pillar_id] || colors.textTertiary;
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];
  const fourteenDaysAgo = new Date(Date.now() - 14 * 86400000).toISOString().split('T')[0];

  const entries = recentEntries.filter(e => (e.pillar_tags || []).includes(pillar.pillar_id));
  const recentE = entries.filter(e => e.entry_date >= sevenDaysAgo);
  const priorE = entries.filter(e => e.entry_date >= fourteenDaysAgo && e.entry_date < sevenDaysAgo);

  const avgDepthOf = (arr: EntryResponse[]) => {
    const scored = arr.filter(e => e.evaluation?.depth_score != null);
    if (!scored.length) return null;
    return scored.reduce((s, e) => s + e.evaluation!.depth_score, 0) / scored.length;
  };

  const recentDepth = avgDepthOf(recentE);
  const priorDepth = avgDepthOf(priorE);

  let trendChar = '—';
  let trendColor = colors.textTertiary;
  if (recentDepth != null && priorDepth != null) {
    const diff = recentDepth - priorDepth;
    if (diff > 3) { trendChar = '↑'; trendColor = colors.success; }
    else if (diff < -3) { trendChar = '↓'; trendColor = colors.error; }
    else { trendChar = '→'; trendColor = colors.textTertiary; }
  } else if (recentDepth != null) {
    trendChar = '→'; trendColor = colors.textTertiary;
  }

  const depthScore = pillar.avg_depth_score ?? 0;
  const depthBarWidth = Math.round(Math.min(1, depthScore / 100) * 80);

  return (
    <View style={ms.pillarHealthRow}>
      <View style={[ms.pillarHealthDot, { backgroundColor: pillarColor }]} />
      <Text style={ms.pillarHealthName} numberOfLines={1}>
        {pillar.pillar_name.split(' ').slice(0, 2).join(' ')}
      </Text>
      <Text style={ms.pillarHealthMeta}>{pillar.total_hours}h · {pillar.entry_count}</Text>
      <View style={ms.depthBar}>
        <View style={[ms.depthBarFill, { width: depthBarWidth, backgroundColor: pillarColor }]} />
      </View>
      <Text style={ms.depthNum}>{pillar.avg_depth_score != null ? Math.round(pillar.avg_depth_score) : '—'}</Text>
      <Text style={[ms.trendArrow, { color: trendColor }]}>{trendChar}</Text>
    </View>
  );
}

// ---------- Main screen ----------

export default function ProgressScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const weeklyReviewScale = usePressScale(0.97);
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
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [activeSection, setActiveSection] = useState<Section>('mastery');
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heatmapScrollRef = useRef<ScrollView>(null);

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

      // Fetch concept mastery overview (kept for data consistency)
      try {
        await fetch(`${API_URL}/api/v1/concepts/progress/overview`, { headers: apiHeaders() });
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
      fetchData();
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
      fetchData();
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

  // --- Hero score calculation (compound growth multiplier) ---
  const heroDays = 90;
  const totalEntries = stats
    ? stats.pillar_breakdown.reduce((sum, p) => sum + (p.entry_count || 0), 0)
    : 0;
  const heroAvgDepth = stats?.avg_depth_score || 0;
  const heroDailyRate = totalEntries > 0 ? totalEntries / heroDays : 0;
  const heroCompound = heroDailyRate > 0 ? (1 + 0.01 * heroDailyRate * (heroAvgDepth / 50)) : 1;
  const heroMultiplier = Math.pow(heroCompound, heroDays);
  const heroLastWeek = Math.pow(heroCompound, heroDays - 7);
  const heroChange = heroMultiplier - heroLastWeek;

  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];
  const sessionsThisWeek = recentEntries.filter(e => e.entry_date >= sevenDaysAgo).length;

  const heatmapGrid = buildHeatmapGrid(heatmap);
  const grouped = MUSCLE_GROUPS.map(mg => ({ ...mg, exercises: profiles.filter(p => p.muscle_group === mg.key) }));

  // --- Discipline pre-calculations ---
  const todayStr = new Date().toISOString().split('T')[0];
  const discScore: number = disciplineData?.discipline_score ?? 0;
  const discGrade = discScore >= 80 ? 'A' : discScore >= 60 ? 'B' : discScore >= 40 ? 'C' : discScore >= 20 ? 'D' : 'F';
  const discGradeColor = discGrade === 'A' ? '#9B8AE8' : discGrade === 'B' ? '#22C55E' : discGrade === 'C' ? '#F59E0B' : discGrade === 'D' ? '#F97316' : '#EF4444';
  const dates30 = Array.from({ length: 30 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - 29 + i); return d.toISOString().split('T')[0];
  });
  const dailyMap30: Record<string, number[]> = disciplineData?.daily_map || {};
  const totalHabitsCount: number = disciplineData?.habits?.length || 0;
  const dots30 = dates30.map(date => {
    const ids = dailyMap30[date] || [];
    const status = ids.length === 0 ? 'empty' : ids.length >= totalHabitsCount ? 'perfect' : 'partial';
    return { date, status } as { date: string; status: 'empty' | 'partial' | 'perfect' };
  });
  const perfectDayCount30 = dots30.filter(d => d.status === 'perfect').length;
  const disc30StartDate = new Date(); disc30StartDate.setDate(disc30StartDate.getDate() - 29);
  const disc30StartLabel = disc30StartDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
    <ScreenBackground>
    <KeyboardAvoider offset={90}>
    <ScrollView style={s.scroll} contentContainerStyle={[s.container, { paddingTop: insets.top + spacing.md }]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchData(); }} tintColor={colors.textTertiary} />}>

      {/* Topbar with brand mark */}
      <Topbar title="North Star" caption={stats?.hours?.all_time != null ? `${Math.round(stats.hours.all_time)} HRS LIFETIME` : undefined} />

      {/* North Star — pinned vision */}
      <View style={{ paddingHorizontal: spacing.md }}>
        <NorthStarCard
          line={vision?.vision_text || 'Ship the thing only I can ship — and stay the kind of person who can.'}
          eyebrow="NORTH STAR · 2026"
          onPress={() => { haptic.light(); setActiveSection('vision'); }}
        />
      </View>

      {/* Tab filters */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={s.sectionTabsScroll}
        contentContainerStyle={s.sectionTabs}
      >
        {([
          { key: 'mastery' as Section, icon: 'school-outline' as const, label: 'Mastery' },
          { key: 'discipline' as Section, icon: 'flame-outline' as const, label: 'Discipline' },
          { key: 'strength' as Section, icon: 'barbell-outline' as const, label: 'Strength' },
          { key: 'running' as Section, icon: 'footsteps-outline' as const, label: 'Running' },
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

      {/* ── MASTERY ── */}
      {activeSection === 'mastery' && stats && (
        <>
          {/* 1. Hero Score */}
          <View style={ms.heroCard}>
            <Text style={ms.heroNumber}>{heroMultiplier.toFixed(2)}×</Text>
            <Text style={ms.heroLabel}>Compound Growth</Text>
            <Text style={[ms.heroSub, { color: heroChange >= 0 ? colors.success : colors.error }]}>
              {heroChange >= 0 ? '↑' : '↓'} {Math.abs(heroChange).toFixed(2)} from last week
            </Text>
          </View>

          {/* 2. Week-at-a-Glance Strip */}
          <View style={ms.strip}>
            <StripItem value={sessionsThisWeek} label="Sessions" />
            <View style={ms.stripDivider} />
            <StripItem value={`${stats.hours.this_week}h`} label="Hours" />
            <View style={ms.stripDivider} />
            <StripItem value={stats.avg_depth_score != null ? Math.round(stats.avg_depth_score) : '—'} label="Avg Depth" />
            <View style={ms.stripDivider} />
            <StripItem value={totalEntries} label="All Time" />
          </View>

          {/* 3. 1% Daily Compound Chart */}
          <View style={s.card}>
            <Text style={s.cardLabel}>1% DAILY COMPOUND</Text>
            <CompoundingChart stats={stats} height={240} />
          </View>

          {/* 4. Weekly Review CTA */}
          <Animated.View style={weeklyReviewScale.animStyle}>
            <TouchableOpacity
              style={ms.reviewCard}
              activeOpacity={0.7}
              onPress={() => { haptic.selection(); navigation.navigate('WeeklyReview'); }}
              onPressIn={weeklyReviewScale.onPressIn}
              onPressOut={weeklyReviewScale.onPressOut}
            >
              <View style={ms.reviewLeft}>
                <Text style={ms.reviewEmoji}>📋</Text>
                <View style={{ flex: 1 }}>
                  <Text style={ms.reviewTitle}>Weekly Review</Text>
                  <Text style={ms.reviewSub}>AI-generated grade, analysis, and next week's focus</Text>
                </View>
              </View>
              <Text style={ms.reviewArrow}>›</Text>
            </TouchableOpacity>
          </Animated.View>

          {/* 5. Pillar Health */}
          <View style={s.card}>
            <Text style={s.cardLabel}>PILLAR HEALTH</Text>
            {stats.pillar_breakdown.map(p => (
              <PillarHealthRow key={p.pillar_id} pillar={p} recentEntries={recentEntries} />
            ))}
          </View>

          {/* 6. Activity Heatmap (absorbs streaks) */}
          <View style={s.card}>
            <Text style={s.cardLabel}>ACTIVITY — 6 MONTHS</Text>
            <ScrollView
              ref={heatmapScrollRef}
              horizontal
              showsHorizontalScrollIndicator={false}
              onContentSizeChange={() => heatmapScrollRef.current?.scrollToEnd({ animated: false })}
            >
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
            {heatTooltip && (
              <View style={s.heatTooltip}>
                <Text style={s.heatTooltipText}>
                  {new Date(heatTooltip.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  {' — '}{heatTooltip.count} {heatTooltip.count === 1 ? 'entry' : 'entries'}
                </Text>
              </View>
            )}
            <View style={s.heatLegend}>
              <Text style={s.heatLegendLabel}>Less</Text>
              {HEATMAP_COLORS.map((c, i) => (
                <View key={i} style={[s.heatCell, { backgroundColor: c }]} />
              ))}
              <Text style={s.heatLegendLabel}>More</Text>
            </View>
          </View>

          {/* 7. Recent Sessions */}
          {recentEntries.length > 0 && (
            <View style={s.card}>
              <Text style={s.cardLabel}>RECENT SESSIONS</Text>
              {recentEntries.slice(0, 3).map(entry => {
                const pillarIds: number[] = entry.pillar_tags || [];
                const primaryPillarId = pillarIds[0];
                const pillarColor = primaryPillarId ? (PILLAR_COLORS[primaryPillarId] || colors.textTertiary) : colors.textTertiary;
                const depthScore = entry.evaluation?.depth_score;
                const durationH = entry.time_invested_minutes >= 60
                  ? `${(entry.time_invested_minutes / 60).toFixed(1)}h`
                  : `${entry.time_invested_minutes}m`;
                const dateStr = new Date(entry.entry_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                return (
                  <View key={entry.id} style={ms.sessionRow}>
                    <View style={[ms.sessionDot, { backgroundColor: pillarColor }]} />
                    <View style={{ flex: 1 }}>
                      <Text style={ms.sessionName} numberOfLines={1}>{entry.description}</Text>
                      <Text style={ms.sessionMeta}>{dateStr} · {durationH}{primaryPillarId ? ` · ${stats.pillar_breakdown.find(p => p.pillar_id === primaryPillarId)?.pillar_name.split(' ')[0] ?? ''}` : ''}</Text>
                    </View>
                    {depthScore != null && (
                      <Text style={ms.sessionDepth}>{Math.round(depthScore)}</Text>
                    )}
                  </View>
                );
              })}
              {recentEntries.length > 3 && (
                <TouchableOpacity style={ms.seeAllRow} onPress={() => haptic.selection()}>
                  <Text style={ms.seeAll}>See all sessions ›</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </>
      )}

      {/* ── STRENGTH ── */}
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

      {/* ── RUNNING ── */}
      {activeSection === 'running' && (
        <>
          {runStats && runStats.total_runs > 0 ? (
            <>
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

      {/* ── DISCIPLINE ── */}
      {activeSection === 'discipline' && (
        disciplineData && disciplineData.habits.length > 0 ? (
          <>
            {/* 1. Hero Grade */}
            <View style={dsr.heroGradeCard}>
              <Text style={[dsr.heroGradeLetter, { color: discGradeColor }]}>{discGrade}</Text>
              <Text style={dsr.heroRateText}>{discScore.toFixed(1)}% completion rate</Text>
              <Text style={dsr.heroBasisText}>Based on last 30 days</Text>
            </View>

            {/* 2. Perfect Days — Last 30 */}
            <View style={s.card}>
              <View style={dsr.rowBetween}>
                <Text style={[s.cardLabel, { marginBottom: 0 }]}>PERFECT DAYS — LAST 30</Text>
                <Text style={dsr.countLabel}>{perfectDayCount30} of 30</Text>
              </View>
              <View style={[dsr.dotsRow, { marginTop: spacing.md }]}>
                {dots30.map(({ date, status }) => {
                  const dotBg = status === 'perfect' ? '#9B8AE8' : status === 'partial' ? 'rgba(155,138,232,0.3)' : 'rgba(31,32,48,0.6)';
                  return (
                    <View
                      key={date}
                      style={[dsr.dot, { backgroundColor: dotBg }, date === todayStr && dsr.dotToday]}
                    />
                  );
                })}
              </View>
              <View style={dsr.dotLabels}>
                <Text style={dsr.dotLabelText}>{disc30StartLabel}</Text>
                <Text style={dsr.dotLabelText}>Today</Text>
              </View>
            </View>

            {/* 3. Habits (read-only) */}
            <View style={s.card}>
              <Text style={s.cardLabel}>HABITS</Text>
              {disciplineData.habits.map((h: any, i: number) => {
                const rateColor = h.completion_rate < 30 ? colors.error : h.completion_rate < 70 ? colors.warning : colors.success;
                const streakActive = h.current_streak > 0;
                const streakColor = streakActive ? '#F59E0B' : colors.textTertiary;
                return (
                  <View key={h.id} style={[dsr.habitRow, i < disciplineData.habits.length - 1 && s.divider]}>
                    <View style={[dsr.habitIcon, { backgroundColor: (h.color || colors.accent) + '30' }]}>
                      <View style={[dsr.habitIconDot, { backgroundColor: h.color || colors.accent }]} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={dsr.habitNameText}>{h.name}</Text>
                      <View style={dsr.habitStatsRow}>
                        <Text style={[dsr.habitRate, { color: rateColor }]}>{h.completion_rate}%</Text>
                        <Text style={dsr.habitRateSep}>·</Text>
                        <Text style={dsr.habitRate7d}>{h.rate_7d}% 7d</Text>
                      </View>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                        <Ionicons name="flame" size={14} color={streakColor} />
                        <Text style={[dsr.streakCount, { color: streakColor }]}>{h.current_streak}</Text>
                      </View>
                      <Text style={dsr.bestStreakText}>
                        {h.longest_streak > 0 ? `best ${h.longest_streak}d` : 'start today'}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </View>

            {/* 4. Completion Map — 30 Days */}
            <View style={s.card}>
              <Text style={s.cardLabel}>COMPLETION MAP — 30 DAYS</Text>
              {disciplineData.habits.map((h: any, hi: number) => {
                const habitColor = h.color || colors.accent;
                const isLast = hi === disciplineData.habits.length - 1;
                return (
                  <View key={h.id} style={{ marginBottom: isLast ? 0 : spacing.md }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                      <View style={[dsr.mapHabitDot, { backgroundColor: habitColor }]} />
                      <Text style={dsr.mapHabitLabel}>{h.name}</Text>
                    </View>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 2 }}>
                      {dates30.map(date => {
                        const completed = (dailyMap30[date] || []).includes(h.id);
                        const isToday = date === todayStr;
                        return (
                          <View
                            key={date}
                            style={[dsr.mapCell, { backgroundColor: completed ? habitColor : colors.input }, isToday && dsr.mapCellToday]}
                          />
                        );
                      })}
                    </View>
                    {isLast && (
                      <View style={dsr.mapMonthLabels}>
                        <Text style={dsr.mapMonthText}>{disc30StartLabel}</Text>
                        <Text style={dsr.mapMonthText}>Today</Text>
                      </View>
                    )}
                  </View>
                );
              })}
            </View>

            {/* 5. Motivational Nudge */}
            <View style={dsr.nudgeCard}>
              <Text style={dsr.nudgeQuote}>
                "Every streak starts at 1. Pick one habit and protect it today — that's all it takes to turn an F into momentum."
              </Text>
              <TouchableOpacity onPress={() => { haptic.selection(); navigation.navigate('Daily'); }}>
                <Text style={dsr.nudgeLink}>Go to Today →</Text>
              </TouchableOpacity>
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

      {/* ── VISION ── */}
      {activeSection === 'vision' && (
        <VisionEditor
          vision={vision}
          onUpdate={(updated) => setVision(updated)}
          pillarBreakdown={stats?.pillar_breakdown}
        />
      )}

      <View style={{ height: 40 }} />

      <UndoToast
        visible={undoToast.visible}
        message={undoToast.message}
        onUndo={handleUndoEntry}
        onDismiss={() => setUndoToast(prev => ({ ...prev, visible: false }))}
      />
    </ScrollView>
    </KeyboardAvoider>
    </ScreenBackground>
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
      <View style={s.card}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: spacing.md }}>
          <Ionicons name="compass-outline" size={16} color={colors.accent} />
          <Text style={s.cardLabel}>NORTH STAR VISION</Text>
          {saving && <Skeleton width={16} height={16} borderRadius={8} style={{ marginLeft: 'auto' }} />}
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

// ---- Shared styles ----

const s = StyleSheet.create({
  scroll: { flex: 1 },
  container: { padding: spacing.lg, paddingBottom: 40 },

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
  cardLabel: { fontFamily: fonts.mono, fontSize: 10, color: colors.textTertiary, letterSpacing: 1.8, marginBottom: spacing.md },
  sectionHeader: { ...typography.micro, color: colors.textTertiary, textTransform: 'uppercase', marginBottom: spacing.md },
  divider: { borderBottomWidth: 1, borderBottomColor: colors.border, paddingBottom: spacing.md, marginBottom: spacing.md },

  // Discipline stat cards (unchanged)
  statsGrid: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.md },
  statCard: {
    flex: 1, backgroundColor: colors.card, borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.border, padding: spacing.md, alignItems: 'center',
  },
  statCardValue: { fontSize: 28, fontWeight: '700', color: colors.text, fontVariant: ['tabular-nums'] },
  statCardLabel: { ...typography.micro, color: colors.textTertiary, marginTop: 4 },

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

// ---- Mastery-section styles ----

const ms = StyleSheet.create({
  // Hero Score
  heroCard: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
    marginBottom: spacing.md,
  },
  heroNumber: {
    fontFamily: fonts.monoMedium,
    fontSize: 56,
    color: colors.accent,
    letterSpacing: -2,
  },
  heroLabel: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: spacing.xs,
    letterSpacing: 1.6,
  },
  heroSub: {
    ...typography.caption,
    marginTop: spacing.xs,
    fontWeight: '600',
  },

  // Week Strip
  strip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
    paddingVertical: spacing.md,
    backgroundColor: colors.card,
  },
  stripItem: {
    flex: 1,
    alignItems: 'center',
  },
  stripValue: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    fontVariant: ['tabular-nums'],
  },
  stripLabel: {
    ...typography.micro,
    color: colors.textTertiary,
    marginTop: 3,
  },
  stripDivider: {
    width: 1,
    height: 28,
    backgroundColor: colors.border,
  },

  // Weekly Review CTA
  reviewCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(155,138,232,0.06)',
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(155,138,232,0.18)',
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  reviewLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    flex: 1,
  },
  reviewEmoji: {
    fontSize: 22,
  },
  reviewTitle: {
    ...typography.bodyBold,
    color: colors.text,
  },
  reviewSub: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  reviewArrow: {
    fontSize: 22,
    color: colors.textTertiary,
    marginLeft: spacing.sm,
  },

  // Pillar Health rows
  pillarHealthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  pillarHealthDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  pillarHealthName: {
    ...typography.caption,
    color: colors.text,
    fontWeight: '600',
    width: 80,
  },
  pillarHealthMeta: {
    ...typography.micro,
    color: colors.textTertiary,
    flex: 1,
  },
  depthBar: {
    width: 80,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.05)',
    overflow: 'hidden',
  },
  depthBarFill: {
    height: '100%',
    borderRadius: 2,
  },
  depthNum: {
    ...typography.micro,
    color: colors.textSecondary,
    fontWeight: '700',
    width: 24,
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
  },
  trendArrow: {
    fontSize: 14,
    fontWeight: '700',
    width: 16,
    textAlign: 'center',
  },

  // Recent Sessions
  sessionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  sessionDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 2,
  },
  sessionName: {
    ...typography.body,
    color: colors.text,
    fontWeight: '500',
  },
  sessionMeta: {
    ...typography.micro,
    color: colors.textTertiary,
    marginTop: 2,
  },
  sessionDepth: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textSecondary,
    fontVariant: ['tabular-nums'],
    minWidth: 30,
    textAlign: 'right',
  },
  seeAllRow: {
    paddingTop: spacing.md,
    alignItems: 'flex-end',
  },
  seeAll: {
    ...typography.caption,
    color: colors.accent,
    fontWeight: '600',
  },
});

// ---- Discipline styles ----

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

// ---- Discipline redesign styles ----

const dsr = StyleSheet.create({
  // Hero Grade
  heroGradeCard: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
    marginBottom: spacing.md,
  },
  heroGradeLetter: {
    fontSize: 64,
    fontWeight: '700',
    letterSpacing: -2,
  },
  heroRateText: {
    fontSize: 15,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  heroBasisText: {
    fontSize: 12,
    color: colors.textTertiary,
    marginTop: 4,
  },

  // Row between header + count
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  countLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: '600',
  },

  // Perfect Days dots
  dotsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 2.5,
  },
  dotToday: {
    borderWidth: 1.5,
    borderColor: colors.accent,
  },
  dotLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.xs,
  },
  dotLabelText: {
    ...typography.micro,
    color: colors.textTertiary,
  },

  // Habits rows (read-only)
  habitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  habitIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  habitIconDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  habitNameText: {
    ...typography.body,
    color: colors.text,
    fontWeight: '600',
  },
  habitStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  habitRate: {
    ...typography.caption,
    fontWeight: '700',
  },
  habitRateSep: {
    ...typography.caption,
    color: colors.textTertiary,
  },
  habitRate7d: {
    ...typography.caption,
    color: colors.textTertiary,
  },
  streakCount: {
    fontSize: 16,
    fontWeight: '700',
    fontVariant: ['tabular-nums'] as any,
  },
  bestStreakText: {
    ...typography.micro,
    color: colors.textTertiary,
    marginTop: 2,
  },

  // Completion Map
  mapHabitDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  mapHabitLabel: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  mapCell: {
    width: 12,
    height: 12,
    borderRadius: 2,
  },
  mapCellToday: {
    borderWidth: 1.5,
    borderColor: colors.accent,
  },
  mapMonthLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.xs,
  },
  mapMonthText: {
    ...typography.micro,
    color: colors.textTertiary,
  },

  // Motivational Nudge
  nudgeCard: {
    borderTopWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderLeftWidth: 3,
    borderTopColor: 'rgba(155,138,232,0.15)',
    borderRightColor: 'rgba(155,138,232,0.15)',
    borderBottomColor: 'rgba(155,138,232,0.15)',
    borderLeftColor: colors.accent,
    borderRadius: radius.md,
    backgroundColor: 'rgba(155,138,232,0.06)',
    padding: spacing.md,
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  nudgeQuote: {
    ...typography.body,
    color: colors.textSecondary,
    fontStyle: 'italic',
    lineHeight: 22,
  },
  nudgeLink: {
    ...typography.caption,
    color: colors.accentLight,
    fontWeight: '600',
  },
});

// ---- Vision styles ----

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
