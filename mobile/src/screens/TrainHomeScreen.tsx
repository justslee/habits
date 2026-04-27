/**
 * TrainHomeScreen — Segmented Training Hub (Lift | Run | Plan)
 *
 * Unified training experience merging workouts and runs into one tab.
 * Each segment shows focused content with today's activity hero card,
 * recent sessions, and navigation to deeper screens.
 */

import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  RefreshControl, Animated, AppState,
} from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Skeleton, SkeletonRow, SkeletonStatCard } from '../components/Skeleton';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, typography, radius, fonts, cardStyle } from '../theme';
import { haptic } from '../utils/haptics';
import {
  getRecentTraining, getWeekSummary, getTodayWorkout, getTodayRun,
  getActivePlan, deleteWorkout, restoreWorkout, deleteRun, restoreRun,
  TrainingItem, WeekSummary, WorkoutSession, TodayRunData, TrainingPlanData,
} from '../api/client';
import SwipeableRow from '../components/SwipeableRow';
import UndoToast from '../components/UndoToast';
import WhoopCard from '../components/WhoopCard';
import { getWhoopData, WhoopData } from '../api/client';
import {
  DAYS_OF_WEEK, WEEKLY_SCHEDULE, DAY_TYPE_COLORS, RUN_TYPE_COLORS, DAY_LABELS,
} from '../constants/trainingSchedule';
import ScreenBackground from '../components/ScreenBackground';
import { formatPace } from '../services/gps';
import { usePressScale } from '../hooks/usePressScale';

type Segment = 'train' | 'run' | 'plan';

const SEGMENTS: { key: Segment; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'train', label: 'Train', icon: 'barbell-outline' },
  { key: 'run', label: 'Run', icon: 'footsteps-outline' },
  { key: 'plan', label: 'Plan', icon: 'calendar-outline' },
];

export default function TrainHomeScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const [segment, setSegment] = useState<Segment>('train');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Data
  const [recentTraining, setRecentTraining] = useState<TrainingItem[]>([]);
  const [weekSummary, setWeekSummary] = useState<WeekSummary | null>(null);
  const [todayWorkout, setTodayWorkout] = useState<WorkoutSession | null>(null);
  const [todayRun, setTodayRun] = useState<TodayRunData | null>(null);
  const [activePlan, setActivePlan] = useState<TrainingPlanData | null>(null);
  const [whoopData, setWhoopData] = useState<WhoopData | null>(null);

  const [audioCoachEnabled, setAudioCoachEnabled] = useState(true);
  const heroScale = usePressScale(0.97);
  const appState = useRef(AppState.currentState);

  // Undo toast
  const [undoToast, setUndoToast] = useState<{
    visible: boolean; message: string; itemId: number;
    itemType: 'workout' | 'run'; snapshot: TrainingItem | null;
  }>({ visible: false, message: '', itemId: 0, itemType: 'workout', snapshot: null });

  const fetchData = useCallback(async () => {
    try {
      const [training, summary, workout, run, plan, whoop] = await Promise.allSettled([
        getRecentTraining(14),
        getWeekSummary(),
        getTodayWorkout(),
        getTodayRun(),
        getActivePlan(),
        getWhoopData(),
      ]);
      if (training.status === 'fulfilled') setRecentTraining(training.value);
      if (summary.status === 'fulfilled') setWeekSummary(summary.value);
      if (workout.status === 'fulfilled') setTodayWorkout(workout.value);
      if (run.status === 'fulfilled') setTodayRun(run.value);
      if (plan.status === 'fulfilled') setActivePlan(plan.value);
      if (whoop.status === 'fulfilled') setWhoopData(whoop.value);
    } catch (err) {
      console.warn('TrainHome fetch error:', err);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Re-fetch when screen comes into focus
  useEffect(() => {
    const unsub = navigation?.addListener?.('focus', fetchData);
    return unsub;
  }, [navigation, fetchData]);

  // Re-fetch WHOOP data when app returns to foreground (recovery score updates throughout the day)
  useEffect(() => {
    const sub = AppState.addEventListener('change', nextState => {
      if (appState.current.match(/inactive|background/) && nextState === 'active') {
        getWhoopData().then(setWhoopData).catch(() => {});
      }
      appState.current = nextState;
    });
    return () => sub.remove();
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  }, [fetchData]);

  const handleDelete = async (item: TrainingItem) => {
    setRecentTraining(prev => prev.filter(t => !(t.id === item.id && t.type === item.type)));
    haptic.light();
    const label = item.type === 'workout'
      ? `${item.label} deleted`
      : `${item.detail} deleted`;
    setUndoToast({ visible: true, message: label, itemId: item.id, itemType: item.type, snapshot: item });
    try {
      if (item.type === 'workout') await deleteWorkout(item.id);
      else await deleteRun(item.id);
      fetchData();
    } catch (err) {
      console.warn('Delete failed:', err);
      setRecentTraining(prev => [...prev, item].sort((a, b) => b.date.localeCompare(a.date)));
      setUndoToast(prev => ({ ...prev, visible: false }));
    }
  };

  const handleUndo = async () => {
    const { itemId, itemType, snapshot } = undoToast;
    setUndoToast(prev => ({ ...prev, visible: false }));
    if (!snapshot) return;
    try {
      if (itemType === 'workout') await restoreWorkout(itemId);
      else await restoreRun(itemId);
      setRecentTraining(prev => [...prev, snapshot].sort((a, b) => b.date.localeCompare(a.date)));
      fetchData();
    } catch (err) {
      console.warn('Restore failed:', err);
    }
  };

  const liftItems = recentTraining.filter(t => t.type === 'workout');
  const runItems = recentTraining.filter(t => t.type === 'run');

  // --- Segment content ---

  const renderLiftSegment = () => (
    <>
      {/* Today's Workout Hero Card */}
      {todayWorkout && (
        <Animated.View style={heroScale.animStyle}>
          <TouchableOpacity
            style={styles.heroCard}
            onPress={() => {
              haptic.light();
              todayWorkout.status === 'completed'
                ? navigation?.navigate?.('WorkoutDetail', { sessionId: todayWorkout.id })
                : navigation?.navigate?.('TodayWorkout');
            }}
            onPressIn={heroScale.onPressIn}
            onPressOut={heroScale.onPressOut}
            activeOpacity={0.8}
          >
            <View style={styles.heroHeader}>
              <View style={[styles.heroIndicator, { backgroundColor: colors.success }]} />
              <Text style={styles.heroLabel}>TODAY</Text>
            </View>
            <Text style={styles.heroTitle}>
              {DAY_LABELS[todayWorkout.day_type] || todayWorkout.day_type}
            </Text>
            <View style={styles.heroMeta}>
              {(whoopData?.recovery_score ?? todayWorkout.whoop_recovery_score) != null && (
                <Text style={styles.heroMetaText}>
                  Recovery {(whoopData?.recovery_score ?? todayWorkout.whoop_recovery_score)!.toFixed(0)}%
                </Text>
              )}
              <Text style={styles.heroMetaText}>
                {todayWorkout.status === 'completed' ? '\u2705 Done' : todayWorkout.status === 'in_progress' ? '\uD83D\uDD35 In Progress' : ''}
              </Text>
            </View>
            <View style={styles.heroCta}>
              <Text style={styles.heroCtaText}>
                {todayWorkout.status === 'completed' ? 'View Workout' : 'Start Workout'}
              </Text>
              <Ionicons name="arrow-forward" size={16} color={colors.accent} />
            </View>
          </TouchableOpacity>
        </Animated.View>
      )}

            {/* Whoop Card — compact in train view */}
      {whoopData && whoopData.recovery_score != null && (
        <View style={{ marginHorizontal: spacing.lg }}>
          <WhoopCard data={whoopData} compact />
        </View>
      )}

      {/* Recent Lifts */}
      {liftItems.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>RECENT SESSIONS</Text>
          <Text style={styles.swipeHint}>← swipe to delete</Text>
          {liftItems.slice(0, 7).map(item => (
            <LiftSessionCard key={`w-${item.id}`} item={item}
              onDelete={() => handleDelete(item)}
              onPress={() => navigation?.navigate?.('WorkoutDetail', { sessionId: item.id })} />
          ))}
          <TouchableOpacity
            style={styles.seeAllBtn}
            onPress={() => navigation?.navigate?.('WorkoutHistory')}
          >
            <Text style={styles.seeAllText}>See All History</Text>
            <Ionicons name="arrow-forward" size={16} color={colors.accent} />
          </TouchableOpacity>
        </>
      )}

      {liftItems.length === 0 && !loading && (
        <View style={styles.emptyState}>
          <Ionicons name="barbell-outline" size={48} color={colors.textTertiary} />
          <Text style={styles.emptyText}>No training sessions yet</Text>
          <Text style={styles.emptySubtext}>Start today's workout above</Text>
        </View>
      )}
    </>
  );

  const renderRunSegment = () => {
    const planned = todayRun?.planned_run;
    const runTypeColor = RUN_TYPE_COLORS[planned?.run_type || 'easy'] || colors.accent;
    const segments: any[] = (() => {
      if (!planned?.structure) return [];
      try { return JSON.parse(planned.structure); } catch { return []; }
    })();

    return (
      <>
        {/* Planned run card or empty state */}
        {planned ? (
          <View style={[styles.runCard, { borderColor: runTypeColor + '40', marginHorizontal: spacing.lg }]}>  
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.md }}>
              <View style={[styles.typeBadge, { backgroundColor: runTypeColor + '20', paddingHorizontal: spacing.md, paddingVertical: spacing.xs }]}>
                <Text style={[styles.typeBadgeText, { color: runTypeColor }]}>{planned.run_type.toUpperCase()}</Text>
              </View>
              {todayRun?.plan_name && (
                <Text style={{ ...typography.caption, color: colors.textTertiary }}>
                  {todayRun.plan_name} · Week {todayRun.week_number}/{todayRun.total_weeks}
                </Text>
              )}
            </View>

            {planned.description && (
              <Text style={{ ...typography.body, color: colors.textSecondary, marginBottom: spacing.lg, lineHeight: 22 }}>
                {planned.description}
              </Text>
            )}

            <View style={{ flexDirection: 'row', justifyContent: 'space-around' }}>
              {planned.target_distance_miles && (
                <View style={{ alignItems: 'center' }}>
                  <Text style={{ fontSize: 28, fontWeight: '700', color: colors.text, fontVariant: ['tabular-nums'] as any }}>{planned.target_distance_miles}</Text>
                  <Text style={{ ...typography.micro, color: colors.textTertiary, marginTop: 4 }}>MILES</Text>
                </View>
              )}
              {planned.target_pace_seconds && (
                <View style={{ alignItems: 'center' }}>
                  <Text style={{ fontSize: 28, fontWeight: '700', color: colors.text, fontVariant: ['tabular-nums'] as any }}>{formatPace(planned.target_pace_seconds)}</Text>
                  <Text style={{ ...typography.micro, color: colors.textTertiary, marginTop: 4 }}>PACE</Text>
                </View>
              )}
              {planned.target_duration_minutes && (
                <View style={{ alignItems: 'center' }}>
                  <Text style={{ fontSize: 28, fontWeight: '700', color: colors.text, fontVariant: ['tabular-nums'] as any }}>{planned.target_duration_minutes}</Text>
                  <Text style={{ ...typography.micro, color: colors.textTertiary, marginTop: 4 }}>MIN</Text>
                </View>
              )}
            </View>

            {segments.length > 0 && (
              <View style={{ marginTop: spacing.lg, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.md }}>
                <Text style={{ ...typography.micro, color: colors.textTertiary, marginBottom: spacing.sm }}>STRUCTURE</Text>
                {segments.map((seg: any, i: number) => (
                  <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm }}>
                    <View style={{
                      width: 8, height: 8, borderRadius: 4,
                      backgroundColor: seg.type === 'warmup' || seg.type === 'cooldown' ? colors.textTertiary
                        : seg.type === 'work' ? runTypeColor : colors.info,
                    }} />
                    <Text style={{ ...typography.caption, color: colors.textSecondary }}>
                      {seg.type === 'warmup' ? 'Warm up' : seg.type === 'cooldown' ? 'Cool down' : seg.type === 'work' ? 'Work' : seg.type}
                      {seg.minutes ? ` · ${seg.minutes}min` : ''}
                      {seg.pace ? ` · ${seg.pace}` : ''}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        ) : (
          <View style={[styles.runCard, { marginHorizontal: spacing.lg }]}>
            <Text style={{ ...typography.title3, color: colors.text, marginBottom: spacing.xs }}>No planned run today</Text>
            <Text style={{ ...typography.body, color: colors.textTertiary }}>Start a free run or create a training plan</Text>
          </View>
        )}

        {/* Audio Coach Toggle */}
        <TouchableOpacity
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, paddingVertical: spacing.md, marginHorizontal: spacing.lg }}
          onPress={() => setAudioCoachEnabled(!audioCoachEnabled)}
        >
          <Ionicons
            name={audioCoachEnabled ? 'volume-high' : 'volume-mute'}
            size={20}
            color={audioCoachEnabled ? colors.accent : colors.textTertiary}
          />
          <Text style={{ ...typography.caption, color: audioCoachEnabled ? colors.accent : colors.textTertiary }}>
            Audio Coach {audioCoachEnabled ? 'On' : 'Off'}
          </Text>
        </TouchableOpacity>

        {/* Start / Free Run button */}
        <TouchableOpacity
          style={[styles.runStartBtn, { backgroundColor: planned ? runTypeColor : colors.accent }]}
          onPress={() => navigation?.navigate?.('RunGPS', { audioCoachEnabled })}
          activeOpacity={0.85}
        >
          <Ionicons name="play" size={22} color="#fff" />
          <Text style={styles.runStartText}>{planned ? 'Start Run' : 'Free Run'}</Text>
        </TouchableOpacity>

        {/* Quick actions row */}
        <View style={styles.runQuickRow}>
          <TouchableOpacity style={styles.runQuickBtn} onPress={() => navigation?.navigate?.('RouteSuggestions')}>
            <Ionicons name="compass-outline" size={20} color={colors.accent} />
            <Text style={styles.runQuickLabel}>Discover</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.runQuickBtn} onPress={() => navigation?.navigate?.('RouteLibrary')}>
            <Ionicons name="map-outline" size={20} color={colors.accent} />
            <Text style={styles.runQuickLabel}>Routes</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.runQuickBtn} onPress={() => navigation?.navigate?.('RunHistory')}>
            <Ionicons name="time-outline" size={20} color={colors.accent} />
            <Text style={styles.runQuickLabel}>History</Text>
          </TouchableOpacity>
        </View>

        {/* This Week Stats */}
        {weekSummary && (weekSummary.runs > 0 || weekSummary.run_miles > 0) && (
          <View style={styles.weekStatsRow}>
            <View style={styles.weekStat}>
              <Text style={styles.weekStatValue}>{weekSummary.run_miles}</Text>
              <Text style={styles.weekStatLabel}>MI THIS WEEK</Text>
            </View>
            <View style={styles.weekStat}>
              <Text style={styles.weekStatValue}>{weekSummary.runs}</Text>
              <Text style={styles.weekStatLabel}>RUNS</Text>
            </View>
          </View>
        )}

        {/* Recent Runs */}
        {runItems.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>RECENT RUNS</Text>
            {runItems.slice(0, 5).map(item => {
              const typeColor = RUN_TYPE_COLORS[item.run_type || 'easy'] || colors.accent;
              const dateStr = new Date(item.date + 'T12:00:00').toLocaleDateString('en-US', {
                weekday: 'short', month: 'short', day: 'numeric',
              });
              return (
                <SwipeableRow key={`r-${item.id}`} onDelete={() => handleDelete(item)}>
                  <View style={styles.sessionCard}>
                    <View style={styles.sessionLeft}>
                      <View style={[styles.sessionIcon, { backgroundColor: typeColor + '15' }]}>
                        <Ionicons name="footsteps-outline" size={18} color={typeColor} />
                      </View>
                    </View>
                    <View style={styles.sessionCenter}>
                      <View style={styles.sessionTop}>
                        <Text style={styles.sessionLabel}>
                          {item.distance_miles?.toFixed(1)} mi
                        </Text>
                        <View style={[styles.typeBadge, { backgroundColor: typeColor + '15' }]}>
                          <Text style={[styles.typeBadgeText, { color: typeColor }]}>
                            {(item.run_type || 'EASY').toUpperCase()}
                          </Text>
                        </View>
                        {item.is_pr && (
                          <Text style={styles.prBadge}>🏆 PR!</Text>
                        )}
                      </View>
                      <Text style={styles.sessionDate}>{dateStr}</Text>
                    </View>
                    <View style={styles.sessionRight}>
                      <Text style={[styles.sessionDetail, { color: colors.accent }]}>
                        {item.pace_formatted}
                      </Text>
                      <Text style={styles.sessionRpe}>/mi</Text>
                    </View>
                  </View>
                </SwipeableRow>
              );
            })}
          </>
        )}

        {runItems.length === 0 && !loading && (
          <View style={[styles.emptyState, { paddingTop: spacing.xl }]}>
            <Ionicons name="footsteps-outline" size={40} color={colors.textTertiary} />
            <Text style={styles.emptyText}>No runs yet</Text>
            <Text style={styles.emptySubtext}>Hit the button above and get moving</Text>
          </View>
        )}
      </>
    );
  };

  const renderPlanSegment = () => {
    const today = new Date();
    const todayDay = (today.getDay() + 6) % 7; // 0=Mon

    // Find completed workouts/runs this week from recentTraining
    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() - todayDay);
    weekStart.setHours(0, 0, 0, 0);

    const thisWeekItems = recentTraining.filter(t => {
      const d = new Date(t.date + 'T12:00:00');
      return d >= weekStart;
    });

    // Map completed items by day of week (0=Mon)
    const completedByDay: Record<number, TrainingItem[]> = {};
    thisWeekItems.forEach(item => {
      const d = new Date(item.date + 'T12:00:00');
      const dow = (d.getDay() + 6) % 7;
      if (!completedByDay[dow]) completedByDay[dow] = [];
      completedByDay[dow].push(item);
    });

    // Planned runs for the current week
    const getPlannedRun = (dayIdx: number) => {
      if (!activePlan?.planned_runs) return null;
      return activePlan.planned_runs.find(
        r => r.week_number === activePlan.current_week && r.day_of_week === dayIdx
      ) || null;
    };

    // Week selector for run plan
    const weeks = activePlan
      ? Array.from({ length: activePlan.total_weeks }, (_, i) => i + 1)
      : [];
    const selectedWeek = activePlan?.current_week || 1;
    const weekRuns = activePlan?.planned_runs?.filter((r: any) => r.week_number === selectedWeek) || [];
    const completedRuns = weekRuns.filter((r: any) => r.status === 'completed').length;
    const weekMiles = weekRuns.reduce((sum: number, r: any) => sum + (r.target_distance_miles || 0), 0);

    const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    // Compute actual dates for this week
    const weekStartDate = new Date(today);
    weekStartDate.setDate(today.getDate() - todayDay);
    const dayDates = DAY_NAMES.map((_, i) => {
      const d = new Date(weekStartDate);
      d.setDate(weekStartDate.getDate() + i);
      return d.getDate();
    });
    const GYM_LABELS: Record<string, string> = {
      push: 'PUSH DAY', pull: 'PULL DAY', legs: 'LEGS + CORE',
      cardio: 'CARDIO', basketball: 'BASKETBALL', rest: 'REST DAY',
    };
    const RUN_TYPE_COLORS_LOCAL: Record<string, string> = {
      easy: '#3B82F6', tempo: '#F59E0B', intervals: '#EF4444',
      long: '#10B981', recovery: '#6B7280', fartlek: '#EC4899', progression: '#8B5CF6',
    };

    return (
      <View style={{ paddingHorizontal: spacing.lg, flex: 1 }}>
        {/* Plan title + week info */}
        {activePlan && (
          <View style={{ marginBottom: spacing.sm, flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
            <Text style={{ ...typography.title3, color: colors.text }}>
              {activePlan.goal_type.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())} Plan
            </Text>
            <Text style={{ ...typography.caption, color: colors.textTertiary }}>
              Week {activePlan.current_week}/{activePlan.total_weeks}
            </Text>
          </View>
        )}

        {!activePlan && (
          <View style={{ marginBottom: spacing.sm }}>
            <Text style={{ ...typography.title3, color: colors.text }}>Weekly Schedule</Text>
          </View>
        )}

        {/* Week selector (if run plan exists) */}
        {activePlan && weeks.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false}
            style={{ marginBottom: spacing.xs, maxHeight: 44 }}>
            {weeks.map(w => {
              const isActive = w === selectedWeek;
              const wRuns = activePlan.planned_runs?.filter((r: any) => r.week_number === w) || [];
              const wDone = wRuns.filter((r: any) => r.status === 'completed').length;
              return (
                <TouchableOpacity key={w} style={[
                  styles.weekChip,
                  isActive && { backgroundColor: colors.accent + '20', borderColor: colors.accent },
                ]} onPress={() => haptic.selection()}>
                  <Text style={[styles.weekChipNum, isActive && { color: colors.accent }]}>W{w}</Text>
                  {wRuns.length > 0 && (
                    <Text style={styles.weekChipProgress}>{wDone}/{wRuns.length}</Text>
                  )}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}

        {/* Week summary line */}
        {activePlan && weekRuns.length > 0 && (
          <Text style={{ ...typography.micro, color: colors.textTertiary, marginBottom: spacing.xs }}>
            {completedRuns}/{weekRuns.length} runs  ·  {weekMiles.toFixed(1)} mi planned
          </Text>
        )}

        {/* Day cards — calendar style */}
        <View style={{ flex: 1 }}>
        {DAY_NAMES.map((day, dayIdx) => {
          const schedule = WEEKLY_SCHEDULE[dayIdx];
          const gymType = schedule.type;
          const gymColor = DAY_TYPE_COLORS[gymType] || colors.textTertiary;
          const gymLabel = GYM_LABELS[gymType] || gymType.toUpperCase();
          const isToday = dayIdx === todayDay;
          const isRest = gymType === 'rest';
          const completed = completedByDay[dayIdx] || [];
          const hasCompletion = completed.length > 0;
          const run = getPlannedRun(dayIdx);
          const runColor = run ? (RUN_TYPE_COLORS_LOCAL[run.run_type] || colors.accent) : undefined;

          return (
            <View key={dayIdx} style={[
              styles.calDayCard,
              isRest && !run && { opacity: 0.45 },
              isToday && { borderColor: colors.accent + '50' },
            ]}>
              <View style={styles.calDayLeft}>
                <Text style={[styles.calDayName, isToday && { color: colors.accent }]}>{day}</Text>
                <Text style={[styles.calDayDate, isToday && { color: colors.accent }]}>{dayDates[dayIdx]}</Text>
              </View>

              <View style={styles.calDayCenter}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <View style={[styles.calTypeBadge, { backgroundColor: gymColor + '15' }]}>
                    <Text style={[styles.calTypeBadgeText, { color: gymColor }]}>{gymLabel}</Text>
                  </View>
                  {run && (
                    <View style={[styles.calTypeBadge, { backgroundColor: (runColor || colors.accent) + '15' }]}>
                      <Text style={[styles.calTypeBadgeText, { color: runColor || colors.accent }]}>
                        {run.run_type.toUpperCase()} {run.target_distance_miles ? `${run.target_distance_miles}mi` : ''}
                      </Text>
                    </View>
                  )}
                </View>
              </View>

              {hasCompletion && (
                <Ionicons name="checkmark-circle" size={18} color={colors.success} />
              )}
            </View>
          );
        })}
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top + 40, padding: spacing.lg }]}>
        <View style={{ flexDirection: 'row', gap: 12, marginBottom: spacing.lg }}>
          <SkeletonStatCard />
          <SkeletonStatCard />
          <SkeletonStatCard />
        </View>
        <Skeleton width="100%" height={120} borderRadius={radius.lg} style={{ marginBottom: spacing.md }} />
        <SkeletonRow />
        <SkeletonRow />
        <SkeletonRow />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ScreenBackground>
      <ScrollView
        style={styles.container}
        contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: 40, flexGrow: 1 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />
        }
      >
        {/* Segmented Control */}
        <View style={styles.segmentRow}>
          {SEGMENTS.map(s => {
            const active = segment === s.key;
            return (
              <TouchableOpacity
                key={s.key}
                style={[styles.segmentBtn, active && styles.segmentBtnActive]}
                onPress={() => { haptic.selection(); setSegment(s.key); }}
                activeOpacity={0.7}
              >
                <Ionicons
                  name={s.icon}
                  size={16}
                  color={active ? colors.accent : colors.textTertiary}
                />
                <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
                  {s.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Segment Content */}
        {segment === 'train' && renderLiftSegment()}
        {segment === 'run' && renderRunSegment()}
        {segment === 'plan' && renderPlanSegment()}
      </ScrollView>

      <UndoToast
        visible={undoToast.visible}
        message={undoToast.message}
        onUndo={handleUndo}
        onDismiss={() => setUndoToast(prev => ({ ...prev, visible: false }))}
      />
      </ScreenBackground>
    </GestureHandlerRootView>
  );
}

function LiftSessionCard({ item, onDelete, onPress }: {
  item: TrainingItem; onDelete: () => void; onPress: () => void;
}) {
  const { animStyle, onPressIn, onPressOut } = usePressScale(0.97);
  const typeColor = DAY_TYPE_COLORS[item.day_type || 'push'] || colors.accent;
  const dateStr = new Date(item.date + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
  });
  return (
    <SwipeableRow onDelete={onDelete}>
      <Animated.View style={animStyle}>
        <TouchableOpacity
          style={styles.sessionCard}
          activeOpacity={0.7}
          onPress={() => { haptic.light(); onPress(); }}
          onPressIn={onPressIn}
          onPressOut={onPressOut}
        >
          <View style={styles.sessionLeft}>
            <View style={[styles.sessionIcon, { backgroundColor: typeColor + '15' }]}>
              <Ionicons name="barbell-outline" size={18} color={typeColor} />
            </View>
          </View>
          <View style={styles.sessionCenter}>
            <View style={styles.sessionTop}>
              <Text style={styles.sessionLabel}>{item.label}</Text>
              <View style={[styles.typeBadge, { backgroundColor: typeColor + '15' }]}>
                <Text style={[styles.typeBadgeText, { color: typeColor }]}>
                  {(item.day_type || '').toUpperCase()}
                </Text>
              </View>
            </View>
            <Text style={styles.sessionDate}>{dateStr}</Text>
          </View>
          <View style={styles.sessionRight}>
            <Text style={styles.sessionDetail}>{item.detail}</Text>
            {item.rpe != null && (
              <Text style={styles.sessionRpe}>RPE {item.rpe}</Text>
            )}
            <Ionicons name="chevron-forward" size={14} color={colors.textTertiary} />
          </View>
        </TouchableOpacity>
      </Animated.View>
    </SwipeableRow>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  screenTitle: {
    fontFamily: fonts.serifItalic, fontSize: 30, color: colors.text,
    letterSpacing: -0.6,
    paddingHorizontal: spacing.lg, marginBottom: spacing.md,
  },

  // Segmented control
  segmentRow: {
    flexDirection: 'row', marginHorizontal: spacing.lg,
    backgroundColor: colors.card, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border,
    padding: 3, marginBottom: spacing.lg,
  },
  segmentBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: spacing.sm + 2, borderRadius: radius.sm, gap: 6,
  },
  segmentBtnActive: {
    backgroundColor: colors.accentMuted,
  },
  segmentText: { ...typography.caption, color: colors.textTertiary },
  segmentTextActive: { color: colors.accent, fontWeight: '700' },

  // Hero card
  heroCard: {
    marginHorizontal: spacing.lg, marginBottom: spacing.lg,
    backgroundColor: colors.card, borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.border, padding: spacing.lg,
  },
  heroHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm },
  heroIndicator: { width: 8, height: 8, borderRadius: 4, marginRight: spacing.sm },
  heroLabel: { ...typography.micro, color: colors.textTertiary },
  heroTitle: { ...typography.title2, color: colors.text, marginBottom: spacing.xs },
  heroMeta: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.md },
  heroMetaText: { ...typography.caption, color: colors.textSecondary },
  heroCta: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  heroCtaText: { ...typography.bodyBold, color: colors.accent },

  // Section
  sectionTitle: {
    fontFamily: fonts.mono, fontSize: 10, color: colors.textTertiary, letterSpacing: 1.8,
    paddingHorizontal: spacing.lg, marginBottom: spacing.xs, marginTop: spacing.sm,
  },
  swipeHint: {
    ...typography.micro, color: colors.textTertiary,
    paddingHorizontal: spacing.lg, marginBottom: spacing.sm,
    fontSize: 10, opacity: 0.6,
  },

  // Session cards
  sessionCard: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: spacing.md, paddingHorizontal: spacing.lg,
    marginHorizontal: spacing.lg, marginBottom: spacing.sm,
    backgroundColor: colors.card, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border,
  },
  sessionLeft: { marginRight: spacing.md },
  sessionIcon: {
    width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center',
  },
  sessionCenter: { flex: 1 },
  sessionTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: 2 },
  sessionLabel: { fontSize: 16, fontWeight: '600', color: colors.text },
  typeBadge: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4 },
  typeBadgeText: { fontSize: 9, fontWeight: '700', letterSpacing: 0.5 },
  prBadge: { fontSize: 11 },
  sessionDate: { ...typography.caption, color: colors.textTertiary },
  sessionRight: { alignItems: 'flex-end' },
  sessionDetail: { ...typography.caption, color: colors.textSecondary, textAlign: 'right' },
  sessionRpe: { ...typography.micro, color: colors.textTertiary },

  // See all button
  seeAllBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    marginHorizontal: spacing.lg, marginTop: spacing.sm, marginBottom: spacing.md,
    paddingVertical: spacing.md, gap: spacing.sm,
  },
  seeAllText: { ...typography.bodyBold, color: colors.accent },

  // Nav buttons
  navButtons: { marginTop: spacing.md, gap: spacing.sm },
  navBtn: {
    flexDirection: 'row', alignItems: 'center',
    marginHorizontal: spacing.lg, paddingVertical: spacing.md, paddingHorizontal: spacing.lg,
    backgroundColor: colors.card, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border, gap: spacing.md,
  },
  navBtnText: { ...typography.body, color: colors.text, flex: 1 },

  // Calendar-style plan
  weekChip: {
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.sm,
    borderWidth: 1, borderColor: colors.border, marginRight: 4,
    backgroundColor: colors.card, alignItems: 'center', minWidth: 40,
  },
  weekChipNum: { fontSize: 11, color: colors.textSecondary, fontWeight: '600' },
  weekChipProgress: { fontSize: 9, color: colors.textTertiary, marginTop: 1 },

  calDayCard: {
    flex: 1, flexDirection: 'row', alignItems: 'center', marginBottom: 6,
    paddingVertical: 10, paddingHorizontal: spacing.sm,
    backgroundColor: colors.card, borderRadius: radius.sm,
    borderWidth: 1, borderColor: colors.border,
  },
  calDayLeft: { width: 36, alignItems: 'center' },
  calDayName: { fontSize: 12, fontWeight: '600', color: colors.text },
  calDayDate: { fontSize: 10, color: colors.textTertiary, marginTop: 1 },
  calDayCenter: { flex: 1, marginLeft: spacing.sm },
  calTypeBadge: { paddingHorizontal: 5, paddingVertical: 1, borderRadius: 3 },
  calTypeBadgeText: { fontSize: 8, fontWeight: '700', letterSpacing: 0.5 },

  // Run segment
  runCard: {
    backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1,
    borderColor: colors.border, padding: spacing.lg, marginBottom: spacing.md,
  },
  runStartBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: spacing.sm, paddingVertical: 18, borderRadius: radius.md,
    backgroundColor: colors.accent, marginBottom: spacing.sm,
    marginHorizontal: spacing.lg,
  },
  runStartText: { ...typography.title3, color: '#fff' },
  runPlanContext: {
    ...typography.caption, color: colors.textTertiary, textAlign: 'center',
    marginBottom: spacing.md,
  },
  runQuickRow: {
    flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg,
    marginHorizontal: spacing.lg,
  },
  runQuickBtn: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingVertical: spacing.md, backgroundColor: colors.card,
    borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
    gap: 4,
  },
  runQuickLabel: { ...typography.micro, color: colors.textSecondary, fontWeight: '600' },

  // Week stats
  weekStatsRow: {
    flexDirection: 'row', marginHorizontal: spacing.lg,
    marginBottom: spacing.lg, gap: spacing.md,
  },
  weekStat: {
    flex: 1, backgroundColor: colors.card, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border,
    padding: spacing.md, alignItems: 'center',
  },
  weekStatValue: { fontSize: 22, fontWeight: '700', color: colors.text, fontVariant: ['tabular-nums'] },
  weekStatLabel: { ...typography.micro, color: colors.textTertiary, marginTop: 2 },

  // Plan segment
  planHeader: {
    marginHorizontal: spacing.lg, marginBottom: spacing.lg,
  },
  planTitle: { ...typography.title3, color: colors.text },
  planSubtitle: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },

  weekGrid: {
    flexDirection: 'row', marginHorizontal: spacing.lg,
    backgroundColor: colors.card, borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.border,
    padding: spacing.sm, marginBottom: spacing.lg,
  },
  weekGridFull: {
    flexDirection: 'row', marginHorizontal: spacing.lg,
    backgroundColor: colors.card, borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.border,
    padding: spacing.sm, marginBottom: spacing.lg,
  },
  weekDay: {
    flex: 1, alignItems: 'center', paddingVertical: spacing.sm,
    borderRadius: radius.sm,
  },
  weekDayFull: {
    flex: 1, alignItems: 'center', paddingVertical: spacing.sm,
    borderRadius: radius.sm, gap: 3,
  },
  weekDayToday: { backgroundColor: colors.accentMuted },
  weekDayTodayFull: { backgroundColor: colors.accentMuted },
  weekDayIcon: {
    width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
  },
  weekDayName: { ...typography.micro, color: colors.textTertiary, marginBottom: 4 },
  weekDayNameToday: { color: colors.accent },
  weekDayType: { ...typography.micro, color: colors.textSecondary, fontSize: 9 },
  weekDayMiles: { ...typography.micro, color: colors.text, fontSize: 10, marginTop: 2 },
  weekDayStatus: { fontSize: 12, marginTop: 4 },

  weekSummaryCard: {
    marginHorizontal: spacing.lg,
    backgroundColor: colors.card, borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.border,
    padding: spacing.lg, marginBottom: spacing.lg,
  },
  weekSummaryRow: { flexDirection: 'row', justifyContent: 'space-around', marginTop: spacing.md },
  weekSummaryStat: { alignItems: 'center' },
  weekSummaryValue: { fontSize: 18, fontWeight: '700', color: colors.text, fontVariant: ['tabular-nums'] },
  weekSummaryLabel: { ...typography.micro, color: colors.textTertiary, marginTop: 2 },

  // Empty state
  emptyState: { alignItems: 'center', paddingTop: 60, gap: spacing.sm },
  emptyText: { ...typography.title3, color: colors.textSecondary },
  emptySubtext: { ...typography.caption, color: colors.textTertiary },
});
