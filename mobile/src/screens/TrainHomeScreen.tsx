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
  RefreshControl, Animated,
} from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Skeleton, SkeletonRow, SkeletonStatCard } from '../components/Skeleton';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, typography, radius, fonts } from '../theme';
import { haptic } from '../utils/haptics';
import {
  getRecentTraining, getWeekSummary, getTodayWorkout, getTodayRun,
  getActivePlan, deleteWorkout, restoreWorkout, deleteRun, restoreRun,
  TrainingItem, WeekSummary, WorkoutSession, TodayRunData, TrainingPlanData,
} from '../api/client';
import SwipeableRow from '../components/SwipeableRow';
import UndoToast from '../components/UndoToast';
import {
  DAYS_OF_WEEK, WEEKLY_SCHEDULE, DAY_TYPE_COLORS, RUN_TYPE_COLORS, DAY_LABELS,
} from '../constants/trainingSchedule';
import ScreenBackground from '../components/ScreenBackground';
import { formatPace } from '../utils/format';
import { usePressScale } from '../hooks/usePressScale';
import SegmentedSwitch from '../components/SegmentedSwitch';
import CoachHero from '../components/CoachHero';
import CoachSheet from '../components/CoachSheet';
import Topbar from '../components/Topbar';
import WorkoutStartCard from '../components/WorkoutStartCard';
import SessionListCard from '../components/SessionListCard';
import ProgramToday from '../components/ProgramToday';

type Segment = 'today' | 'run' | 'lift' | 'plan';

const SEGMENTS: { key: Segment; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'today', label: 'Today', icon: 'sunny-outline' },
  { key: 'run',   label: 'Run',   icon: 'footsteps-outline' },
  { key: 'lift',  label: 'Lift',  icon: 'barbell-outline' },
  { key: 'plan',  label: 'Plan',  icon: 'calendar-outline' },
];

export default function TrainHomeScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const [segment, setSegment] = useState<Segment>('today');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Data
  const [recentTraining, setRecentTraining] = useState<TrainingItem[]>([]);
  const [weekSummary, setWeekSummary] = useState<WeekSummary | null>(null);
  const [todayWorkout, setTodayWorkout] = useState<WorkoutSession | null>(null);
  const [todayRun, setTodayRun] = useState<TodayRunData | null>(null);
  const [activePlan, setActivePlan] = useState<TrainingPlanData | null>(null);

  const [coachOpen, setCoachOpen] = useState(false);
  const heroScale = usePressScale(0.97);

  // Undo toast
  const [undoToast, setUndoToast] = useState<{
    visible: boolean; message: string; itemId: number;
    itemType: 'workout' | 'run'; snapshot: TrainingItem | null;
  }>({ visible: false, message: '', itemId: 0, itemType: 'workout', snapshot: null });

  const fetchData = useCallback(async () => {
    try {
      const [training, summary, workout, run, plan] = await Promise.allSettled([
        getRecentTraining(14),
        getWeekSummary(),
        getTodayWorkout(),
        getTodayRun(),
        getActivePlan(),
      ]);
      if (training.status === 'fulfilled') setRecentTraining(training.value);
      if (summary.status === 'fulfilled') setWeekSummary(summary.value);
      if (workout.status === 'fulfilled') setTodayWorkout(workout.value);
      if (run.status === 'fulfilled') setTodayRun(run.value);
      if (plan.status === 'fulfilled') setActivePlan(plan.value);
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

  const renderLiftSegment = () => {
    const todayVolume = (todayWorkout?.exercises ?? []).reduce(
      (acc, ex) => acc + ((ex.weight ?? 0) * (ex.reps ?? 0)),
      0,
    );
    const lastLift = liftItems[0];
    const lastVolume = (() => {
      const detail = (lastLift as any)?.detail as string | undefined;
      if (!detail) return null;
      const m = detail.match(/([\d,]+)\s*lb/);
      return m ? Number(m[1].replace(/,/g, '')) : null;
    })();

    return (
    <>
      {/* CoachHero with embedded last/target volume — canvas Lift view */}
      <View style={{ paddingHorizontal: spacing.md }}>
        <CoachHero
          pill={`${(todayWorkout?.day_type ?? 'PUSH').toUpperCase()} · TODAY`}
          ts={`COACH · ${new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}`}
          line={
            todayWorkout
              ? <>{DAY_LABELS[todayWorkout.day_type] || todayWorkout.day_type} day. Top set is the lift that matters — <Text style={{ color: colors.accent }}>everything else is volume</Text>. Don't grind the accessories.</>
              : <>No lift today. Mobility, walk, sleep — those are the work.</>
          }
          meta={todayWorkout ? `${(todayWorkout.exercises?.length ?? 0)} LIFTS · ~45 MIN` : undefined}
          onPressAsk={() => { haptic.medium(); setCoachOpen(true); }}
        >
          {lastVolume != null && (
            <View style={styles.liftVolumeGrid}>
              <View style={{ flex: 1 }}>
                <Text style={styles.liftVolumeLabel}>LAST · VOLUME</Text>
                <Text style={styles.liftVolumeNum}>
                  {lastVolume.toLocaleString()}
                  <Text style={styles.liftVolumeUnit}> lb</Text>
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.liftVolumeLabel}>TARGET TODAY</Text>
                <Text style={[styles.liftVolumeNum, { color: colors.accent }]}>
                  {Math.round(lastVolume * 1.03).toLocaleString()}
                  <Text style={[styles.liftVolumeUnit, { color: colors.accent, opacity: 0.7 }]}> lb</Text>
                </Text>
              </View>
            </View>
          )}
        </CoachHero>
      </View>

      {/* Open today's workout */}
      {todayWorkout && (
        <View style={{ paddingHorizontal: spacing.md, marginBottom: spacing.md }}>
          <TouchableOpacity
            style={styles.openWorkoutBtn}
            activeOpacity={0.85}
            onPress={() => {
              haptic.light();
              todayWorkout.status === 'completed'
                ? navigation?.navigate?.('WorkoutDetail', { sessionId: todayWorkout.id })
                : navigation?.navigate?.('TodayWorkout');
            }}
          >
            <Text style={styles.openWorkoutBtnText}>
              {todayWorkout.status === 'completed' ? '▶ VIEW WORKOUT' : '▶ OPEN TODAY · LOG IT'}
            </Text>
            <Text style={[styles.openWorkoutBtnText, { opacity: 0.6 }]}>→</Text>
          </TouchableOpacity>
          {todayVolume > 0 && (
            <Text style={styles.openWorkoutMeta}>
              {todayVolume.toLocaleString()} LB LOGGED TODAY · {todayWorkout.exercises?.length ?? 0} SETS
            </Text>
          )}
        </View>
      )}

      {/* Recent lifts as canvas-style session table */}
      {liftItems.length > 0 ? (
        <SessionListCard
          sessions={liftItems.slice(0, 6).map(item => {
            const dateStr = new Date(item.date + 'T12:00:00');
            const dayShort = dateStr.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase();
            const monthDay = dateStr.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            const detail = (item as any).detail as string | undefined;
            const m = detail?.match(/([\d,]+)\s*lb/);
            const vol = m ? m[1] : '—';
            const lifts = detail?.match(/(\d+)\s*lifts?/)?.[1] ?? '—';
            return {
              id: item.id,
              day: dayShort,
              when: monthDay,
              title: (DAY_LABELS as any)[item.day_type ?? ''] || item.day_type || 'Workout',
              metrics: [`${vol} lb`, `${lifts} lifts`, item.rpe != null ? `RPE ${item.rpe}` : '—'] as [string, string, string],
              active: false,
            };
          })}
          labels={['VOLUME', 'LIFTS', 'TOP']}
          onPress={s => navigation?.navigate?.('WorkoutDetail', { sessionId: Number(s.id) })}
        />
      ) : !loading ? (
        <View style={styles.emptyState}>
          <Ionicons name="barbell-outline" size={48} color={colors.textTertiary} />
          <Text style={styles.emptyText}>No lifts yet</Text>
          <Text style={styles.emptySubtext}>Open today's workout to log your first set</Text>
        </View>
      ) : null}

      <TouchableOpacity
        style={styles.seeAllBtn}
        onPress={() => navigation?.navigate?.('WorkoutHistory')}
      >
        <Text style={styles.seeAllText}>SEE ALL HISTORY</Text>
        <Ionicons name="arrow-forward" size={16} color={colors.accent} />
      </TouchableOpacity>
    </>
    );
  };

  const renderRunSegment = () => {
    const planned = todayRun?.planned_run;
    const runTypeColor = RUN_TYPE_COLORS[planned?.run_type || 'easy'] || colors.accent;
    const runTitle = planned ? (
      planned.run_type === 'easy' ? 'Easy run · Z2'
      : planned.run_type === 'tempo' ? 'Tempo'
      : planned.run_type === 'long' ? 'Long run'
      : planned.run_type === 'intervals' ? 'Intervals'
      : planned.run_type === 'recovery' ? 'Recovery'
      : 'Run'
    ) : 'Free run';
    const distMi = planned?.target_distance_miles ?? null;
    const paceFmt = planned?.target_pace_seconds != null ? formatPace(planned.target_pace_seconds) : null;
    const hr = (planned as any)?.target_hr_max ?? 142;

    return (
    <>
      {/* CoachHero with today's plan + Log-a-run entry */}
      <View style={{ paddingHorizontal: spacing.md }}>
        <CoachHero
          pill={planned ? `${(planned.run_type || 'EASY').toUpperCase()} · Z2` : 'FREE RUN'}
          ts={`COACH · ${new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}`}
          line={
            planned
              ? <>Today is your aerobic deposit — <Text style={{ color: colors.accent }}>{distMi ?? '—'}{distMi != null ? ' mi' : ''}{paceFmt ? ` at ${paceFmt}/mi` : ''}{hr ? `, HR ≤ ${hr}` : ''}</Text>. Breathe through the nose. Negative split if it feels easy. The point is showing up, not the pace.</>
              : <>No planned run today. Free run if the body wants it; rest if it doesn't.</>
          }
          meta={planned ? `${distMi ?? '—'} MI · TARGET RPE 5` : 'RUN WHEN READY'}
          onPressAsk={() => { haptic.medium(); setCoachOpen(true); }}
        >
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => { haptic.medium(); navigation?.navigate?.('LogRun'); }}
            style={[styles.runStartFlex, { backgroundColor: runTypeColor, marginTop: 14 }]}
          >
            <Text style={styles.runStartFlexText}>＋ LOG A RUN</Text>
          </TouchableOpacity>
        </CoachHero>
      </View>

      {/* Last run · splits — only if we have any runs */}
      {runItems.length > 0 && (
        <SessionListCard
          sessions={runItems.slice(0, 6).map(item => {
            const dateStr = new Date(item.date + 'T12:00:00');
            const dayShort = dateStr.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase();
            const monthDay = dateStr.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            const dist = item.distance_miles != null ? `${item.distance_miles.toFixed(1)} mi` : '—';
            // The training feed sends a preformatted pace string (workouts.py
            // `pace_formatted`); there is no avg_pace_seconds on TrainingItem, so
            // reading that always yielded '—'.
            const pace = item.pace_formatted || '—';
            return {
              id: `r-${item.id}`,
              day: dayShort,
              when: monthDay,
              title: (item.run_type || 'Run').replace(/^\w/, c => c.toUpperCase()),
              metrics: [dist, pace, item.is_pr ? 'PR' : '—'] as [string, string, string],
              active: false,
              pr: !!item.is_pr,
            };
          })}
          labels={['DISTANCE', 'PACE', 'NOTE']}
          onPress={() => navigation?.navigate?.('RunHistory')}
        />
      )}

      {runItems.length === 0 && !loading && (
        <View style={styles.emptyState}>
          <Ionicons name="footsteps-outline" size={48} color={colors.textTertiary} />
          <Text style={styles.emptyText}>No runs yet</Text>
          <Text style={styles.emptySubtext}>Tap START above to log your first one</Text>
        </View>
      )}

      <TouchableOpacity
        style={styles.seeAllBtn}
        onPress={() => navigation?.navigate?.('RunHistory')}
      >
        <Text style={styles.seeAllText}>SEE ALL RUNS</Text>
        <Ionicons name="arrow-forward" size={16} color={colors.accent} />
      </TouchableOpacity>
    </>
    );
  };

  const renderPlanSegment = () => {
    const today = new Date();
    const todayDay = (today.getDay() + 6) % 7; // 0=Mon

    const totalWeeks = activePlan?.total_weeks ?? 16;
    const currentWeek = activePlan?.current_week ?? 1;

    // Phase boundaries — same proportions as canvas (BASE 0-37.5%, BUILD 37.5-75%, PEAK 75-93.75%, TAPER 93.75-100%)
    const phaseFor = (week: number) => {
      const pct = (week - 1) / totalWeeks;
      if (pct < 0.375) return 'BASE';
      if (pct < 0.75)  return 'BUILD';
      if (pct < 0.9375) return 'PEAK';
      return 'TAPER';
    };
    const currentPhase = phaseFor(currentWeek);
    const nextPhaseStartWeek = (() => {
      const want =
        currentPhase === 'BASE'  ? 'BUILD' :
        currentPhase === 'BUILD' ? 'PEAK'  :
        currentPhase === 'PEAK'  ? 'TAPER' : null;
      if (!want) return null;
      for (let w = currentWeek + 1; w <= totalWeeks; w++) {
        if (phaseFor(w) === want) return w;
      }
      return null;
    })();
    const phaseTransition = nextPhaseStartWeek
      ? `${currentPhase} → ${phaseFor(nextPhaseStartWeek)}`
      : currentPhase;

    const goalLabel = (activePlan?.goal_type || 'TRAINING')
      .replace(/_/g, ' ')
      .toUpperCase();

    // Collect this-week workouts
    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() - todayDay);
    weekStart.setHours(0, 0, 0, 0);
    const completedByDay: Record<number, TrainingItem[]> = {};
    recentTraining.forEach(item => {
      const d = new Date(item.date + 'T12:00:00');
      const dow = (d.getDay() + 6) % 7;
      if (d >= weekStart) {
        if (!completedByDay[dow]) completedByDay[dow] = [];
        completedByDay[dow].push(item);
      }
    });

    const getPlannedRun = (dayIdx: number) => {
      if (!activePlan?.planned_runs) return null;
      // Backend day_of_week is 0=Sun .. 6=Sat; canvas/UI day index 0=Mon .. 6=Sun.
      // Convert: backendDow = (uiDow + 1) % 7
      const backendDow = (dayIdx + 1) % 7;
      return activePlan.planned_runs.find(
        r => r.week_number === currentWeek && r.day_of_week === backendDow,
      ) || null;
    };

    const GYM_LABELS_PLAN: Record<string, { workout: string; target: string }> = {
      push:       { workout: 'Lift · PUSH', target: '60 min' },
      pull:       { workout: 'Lift · PULL', target: '60 min' },
      legs:       { workout: 'Lift · LEGS', target: '60 min' },
      cardio:     { workout: 'Cardio',      target: '45 min' },
      basketball: { workout: 'Basketball',  target: '60 min' },
      rest:       { workout: 'Rest',        target: 'Mobility' },
    };

    const dayRows = [0, 1, 2, 3, 4, 5, 6].map(dayIdx => {
      const dayName = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'][dayIdx];
      const isToday = dayIdx === todayDay;
      const completed = completedByDay[dayIdx] || [];
      const done = completed.length > 0;
      const run = getPlannedRun(dayIdx);
      const gym = WEEKLY_SCHEDULE[dayIdx];
      const gymInfo = GYM_LABELS_PLAN[gym?.type ?? 'rest'];

      // Compose workout text and target
      let workout = gymInfo.workout;
      let target = gymInfo.target;
      if (run) {
        const runLabel = run.target_distance_miles
          ? `${run.run_type === 'easy' ? 'Easy' : run.run_type === 'tempo' ? 'Tempo' : run.run_type === 'long' ? 'Long' : run.run_type === 'recovery' ? 'Recovery' : 'Run'} ${run.target_distance_miles}mi`
          : `${run.run_type} run`;
        if (gym?.type === 'rest') {
          workout = runLabel;
          target = run.target_pace_seconds ? formatPace(run.target_pace_seconds) + '/mi' : (run.target_duration_minutes ? `${run.target_duration_minutes} min` : 'Z2');
        } else {
          workout = `${runLabel} + ${gym.type.toUpperCase()}`;
          target = isToday ? 'today' : (run.target_pace_seconds ? formatPace(run.target_pace_seconds) + '/mi' : target);
        }
      }
      if (isToday && !done) target = 'today';

      return { dayName, workout, target, done, isToday };
    });

    return (
      <>
        {/* CoachHero with embedded 16-week phase ribbon */}
        <View style={{ paddingHorizontal: spacing.md }}>
          <CoachHero
            pill={`${goalLabel} · WK ${currentWeek}`}
            ts={`COACH · ${new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}`}
            line={
              activePlan
                ? <>You're <Text style={{ color: colors.accent }}>{currentWeek} weeks into a {totalWeeks}-week block</Text>. {currentPhase} phase {nextPhaseStartWeek ? `transitions to ${phaseFor(nextPhaseStartWeek)} in week ${nextPhaseStartWeek}` : 'is the closing stretch — taper is the work now'}.</>
                : <>No active plan yet. Build one when the goal is real.</>
            }
            meta={`WK ${currentWeek} / ${totalWeeks} · ${phaseTransition}`}
            onPressAsk={() => { haptic.medium(); setCoachOpen(true); }}
          >
            {/* 16-cell phase ribbon */}
            <View style={styles.planRibbon}>
              {Array.from({ length: totalWeeks }).map((_, i) => {
                const w = i + 1;
                const isDone = w < currentWeek;
                const isCurrent = w === currentWeek;
                return (
                  <View
                    key={i}
                    style={[
                      styles.planRibbonCell,
                      isDone     && { backgroundColor: colors.accent },
                      isCurrent  && { backgroundColor: 'rgba(224,183,117,0.4)' },
                      !isDone && !isCurrent && { backgroundColor: colors.line },
                    ]}
                  />
                );
              })}
            </View>
            <View style={styles.planRibbonLabels}>
              <Text style={styles.planRibbonLabel}>BASE</Text>
              <Text style={styles.planRibbonLabel}>BUILD</Text>
              <Text style={styles.planRibbonLabel}>PEAK</Text>
              <Text style={styles.planRibbonLabel}>TAPER</Text>
            </View>
          </CoachHero>
        </View>

        {/* "This week" section */}
        <View style={styles.planSection}>
          <Text style={styles.planSectionTitle}>This week</Text>
          <Text style={styles.planSectionMore}>WK {currentWeek} / {totalWeeks}</Text>
        </View>

        {/* 7-day rows in a single card */}
        <View style={styles.planDaysCard}>
          {dayRows.map((d, i) => (
            <View
              key={d.dayName}
              style={[
                styles.planDayRow,
                i > 0 && { borderTopWidth: 1, borderTopColor: colors.line },
                d.isToday && { backgroundColor: 'rgba(224,183,117,0.06)' },
              ]}
            >
              <Text style={[
                styles.planDayName,
                { color: d.isToday ? colors.accent : colors.textTertiary },
              ]}>
                {d.dayName}
              </Text>
              <Text numberOfLines={1} style={styles.planDayWorkout}>{d.workout}</Text>
              <Text style={styles.planDayTarget}>{d.target}</Text>
              <View style={[
                styles.planDayDone,
                d.done && { backgroundColor: colors.accent, borderColor: colors.accent },
              ]}>
                {d.done && <View style={styles.planDayDoneDot} />}
              </View>
            </View>
          ))}
        </View>
      </>
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
        contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: 140, flexGrow: 1 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />
        }
      >
        {/* Topbar with brand mark */}
        <Topbar
          title="Train"
          caption="GOLF PERFORMANCE · SEP 2026 → SPRING 2027"
        />

        {/* Segmented switch */}
        <View style={{ paddingHorizontal: spacing.md, marginBottom: spacing.md }}>
          <SegmentedSwitch
            segments={SEGMENTS.map(s => ({ key: s.key, label: s.label }))}
            value={segment}
            onChange={setSegment}
          />
        </View>

        {/* Segment Content — each segment provides its own CoachHero */}
        {segment === 'today' && (
          <ProgramToday navigation={navigation} onAsk={() => { haptic.medium(); setCoachOpen(true); }} />
        )}
        {segment === 'lift' && renderLiftSegment()}
        {segment === 'run' && renderRunSegment()}
        {segment === 'plan' && renderPlanSegment()}
      </ScrollView>

      <UndoToast
        visible={undoToast.visible}
        message={undoToast.message}
        onUndo={handleUndo}
        onDismiss={() => setUndoToast(prev => ({ ...prev, visible: false }))}
      />

      <CoachSheet
        visible={coachOpen}
        onClose={() => setCoachOpen(false)}
        seed={
          (segment === 'lift' || segment === 'today') && todayWorkout
            ? `${DAY_LABELS[todayWorkout.day_type] || todayWorkout.day_type} day — what's the question?`
            : segment === 'run' && todayRun?.planned_run
              ? `${todayRun.planned_run.run_type} run today. What do you need?`
              : "On the work — what's on your mind?"
        }
        workoutSessionId={(segment === 'lift' || segment === 'today') ? todayWorkout?.id : undefined}
      />
      </ScreenBackground>
    </GestureHandlerRootView>
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
  seeAllText: { fontFamily: fonts.mono, fontSize: 11, color: colors.accent, letterSpacing: 1.8 },

  // ── Lift view (canvas)
  liftVolumeGrid: {
    flexDirection: 'row',
    gap: 14,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  liftVolumeLabel: {
    fontFamily: fonts.mono,
    fontSize: 9,
    color: colors.textTertiary,
    letterSpacing: 1.8,
    marginBottom: 6,
  },
  liftVolumeNum: {
    fontFamily: fonts.mono,
    fontSize: 28,
    color: colors.text,
    letterSpacing: -0.6,
  },
  liftVolumeUnit: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: colors.textTertiary,
  },
  openWorkoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 14,
    backgroundColor: colors.accent,
    borderRadius: radius.lg,
  },
  openWorkoutBtnText: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: colors.bg,
    letterSpacing: 2.2,
  },
  openWorkoutMeta: {
    fontFamily: fonts.mono,
    fontSize: 9,
    color: colors.textTertiary,
    letterSpacing: 1.4,
    textAlign: 'center',
    marginTop: 8,
  },

  // ── Run view (canvas)
  runStartFlex: {
    flex: 1,
    paddingVertical: 15,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  runStartFlexText: {
    fontFamily: fonts.mono,
    fontSize: 12,
    color: colors.bg,
    letterSpacing: 2,
  },

  // ── Plan view (canvas)
  planRibbon: {
    flexDirection: 'row',
    gap: 3,
    marginTop: 4,
  },
  planRibbonCell: {
    flex: 1,
    height: 26,
    borderRadius: 2,
  },
  planRibbonLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  planRibbonLabel: {
    fontFamily: fonts.mono,
    fontSize: 9,
    color: colors.textTertiary,
    letterSpacing: 1.4,
  },
  planSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginHorizontal: spacing.md,
    marginTop: 22,
    marginBottom: 10,
  },
  planSectionTitle: {
    fontFamily: fonts.serifItalic,
    fontSize: 22,
    color: colors.text,
    letterSpacing: -0.5,
  },
  planSectionMore: {
    fontFamily: fonts.mono,
    fontSize: 10,
    color: colors.textTertiary,
    letterSpacing: 1.6,
  },
  planDaysCard: {
    marginHorizontal: spacing.md,
    borderRadius: radius.xl,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    overflow: 'hidden',
  },
  planDayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  planDayName: {
    fontFamily: fonts.mono,
    fontSize: 11,
    letterSpacing: 1.4,
    width: 38,
  },
  planDayWorkout: {
    flex: 1,
    fontFamily: fonts.regular,
    fontSize: 14,
    color: colors.text,
  },
  planDayTarget: {
    fontFamily: fonts.mono,
    fontSize: 10,
    color: colors.textTertiary,
    letterSpacing: 1,
    width: 80,
    textAlign: 'right',
  },
  planDayDone: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  planDayDoneDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.bg,
  },

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
