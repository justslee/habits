/**
 * TrainHomeScreen — Segmented Training Hub (Lift | Run | Plan)
 *
 * Unified training experience merging workouts and runs into one tab.
 * Each segment shows focused content with today's activity hero card,
 * recent sessions, and navigation to deeper screens.
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  RefreshControl, ActivityIndicator,
} from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, typography, radius, cardStyle } from '../theme';
import { haptic } from '../utils/haptics';
import {
  getRecentTraining, getWeekSummary, getTodayWorkout, getTodayRun,
  getActivePlan, deleteWorkout, restoreWorkout, deleteRun, restoreRun,
  TrainingItem, WeekSummary, WorkoutSession, TodayRunData, TrainingPlanData,
} from '../api/client';
import SwipeableRow from '../components/SwipeableRow';
import UndoToast from '../components/UndoToast';

type Segment = 'lift' | 'run' | 'plan';

const SEGMENTS: { key: Segment; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'lift', label: 'Lift', icon: 'barbell-outline' },
  { key: 'run', label: 'Run', icon: 'footsteps-outline' },
  { key: 'plan', label: 'Plan', icon: 'calendar-outline' },
];

const DAY_TYPE_COLORS: Record<string, string> = {
  push: '#3B82F6', pull: '#8B5CF6', legs: '#10B981',
  cardio: '#F59E0B', basketball: '#EC4899', rest: '#6B7280',
};

const RUN_TYPE_COLORS: Record<string, string> = {
  easy: '#3B82F6', tempo: '#F59E0B', intervals: '#EF4444',
  long: '#10B981', recovery: '#6B7280', fartlek: '#EC4899', progression: '#8B5CF6',
};

const DAY_LABELS: Record<string, string> = {
  push: 'Push Day', pull: 'Pull Day', legs: 'Legs + Core',
  cardio: 'Cardio', basketball: 'Basketball', rest: 'Rest Day',
};

const DAYS_OF_WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function TrainHomeScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const [segment, setSegment] = useState<Segment>('lift');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Data
  const [recentTraining, setRecentTraining] = useState<TrainingItem[]>([]);
  const [weekSummary, setWeekSummary] = useState<WeekSummary | null>(null);
  const [todayWorkout, setTodayWorkout] = useState<WorkoutSession | null>(null);
  const [todayRun, setTodayRun] = useState<TodayRunData | null>(null);
  const [activePlan, setActivePlan] = useState<TrainingPlanData | null>(null);

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

  const renderLiftSegment = () => (
    <>
      {/* Today's Workout Hero Card */}
      {todayWorkout && (
        <TouchableOpacity
          style={styles.heroCard}
          onPress={() => navigation?.navigate?.('TodayWorkout')}
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
            {todayWorkout.whoop_recovery_score != null && (
              <Text style={styles.heroMetaText}>
                Recovery {todayWorkout.whoop_recovery_score.toFixed(0)}%
              </Text>
            )}
            <Text style={styles.heroMetaText}>
              {todayWorkout.status === 'completed' ? '✅ Done' : todayWorkout.status === 'in_progress' ? '🔵 In Progress' : ''}
            </Text>
          </View>
          <View style={styles.heroCta}>
            <Text style={styles.heroCtaText}>
              {todayWorkout.status === 'completed' ? 'View Workout' : 'Start Workout'}
            </Text>
            <Ionicons name="arrow-forward" size={16} color={colors.accent} />
          </View>
        </TouchableOpacity>
      )}

      {/* Recent Lifts */}
      {liftItems.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>RECENT LIFT SESSIONS</Text>
          <Text style={styles.swipeHint}>← swipe to delete</Text>
          {liftItems.slice(0, 7).map(item => {
            const typeColor = DAY_TYPE_COLORS[item.day_type || 'push'] || colors.accent;
            const dateStr = new Date(item.date + 'T12:00:00').toLocaleDateString('en-US', {
              weekday: 'short', month: 'short', day: 'numeric',
            });
            return (
              <SwipeableRow key={`w-${item.id}`} onDelete={() => handleDelete(item)}>
                <View style={styles.sessionCard}>
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
                  </View>
                </View>
              </SwipeableRow>
            );
          })}
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
          <Text style={styles.emptyText}>No lift sessions yet</Text>
          <Text style={styles.emptySubtext}>Start today's workout above</Text>
        </View>
      )}
    </>
  );

  const renderRunSegment = () => (
    <>
      {/* Today's Run Hero Card */}
      {todayRun?.has_planned_run && todayRun.planned_run && (
        <TouchableOpacity
          style={styles.heroCard}
          onPress={() => navigation?.navigate?.('RunGPS')}
          activeOpacity={0.8}
        >
          <View style={styles.heroHeader}>
            <View style={[styles.heroIndicator, { backgroundColor: '#10B981' }]} />
            <Text style={styles.heroLabel}>TODAY</Text>
          </View>
          <Text style={styles.heroTitle}>
            {(todayRun.planned_run.run_type || 'Run').charAt(0).toUpperCase() + (todayRun.planned_run.run_type || 'Run').slice(1)} Run
          </Text>
          <View style={styles.heroMeta}>
            {todayRun.planned_run.target_distance_miles != null && (
              <Text style={styles.heroMetaText}>
                {todayRun.planned_run.target_distance_miles.toFixed(1)} mi target
              </Text>
            )}
            {todayRun.plan_name && (
              <Text style={styles.heroMetaText}>{todayRun.plan_name}</Text>
            )}
          </View>
          <View style={styles.heroCta}>
            <Text style={styles.heroCtaText}>Start Run</Text>
            <Ionicons name="arrow-forward" size={16} color={colors.accent} />
          </View>
        </TouchableOpacity>
      )}

      {!todayRun?.has_planned_run && (
        <TouchableOpacity
          style={styles.heroCard}
          onPress={() => navigation?.navigate?.('RunGPS')}
          activeOpacity={0.8}
        >
          <View style={styles.heroHeader}>
            <View style={[styles.heroIndicator, { backgroundColor: '#10B981' }]} />
            <Text style={styles.heroLabel}>FREE RUN</Text>
          </View>
          <Text style={styles.heroTitle}>Go for a Run</Text>
          <Text style={styles.heroMetaText}>No planned run today — run at your own pace</Text>
          <View style={styles.heroCta}>
            <Text style={styles.heroCtaText}>Start Run</Text>
            <Ionicons name="arrow-forward" size={16} color={colors.accent} />
          </View>
        </TouchableOpacity>
      )}

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
          <Text style={styles.swipeHint}>← swipe to delete</Text>
          {runItems.slice(0, 7).map(item => {
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

      {/* Navigation buttons */}
      <View style={styles.navButtons}>
        <TouchableOpacity
          style={styles.navBtn}
          onPress={() => navigation?.navigate?.('RunHistory')}
        >
          <Ionicons name="time-outline" size={18} color={colors.accent} />
          <Text style={styles.navBtnText}>Run History</Text>
          <Ionicons name="arrow-forward" size={14} color={colors.textTertiary} />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.navBtn}
          onPress={() => navigation?.navigate?.('RouteSuggestions')}
        >
          <Ionicons name="compass-outline" size={18} color={colors.accent} />
          <Text style={styles.navBtnText}>Discover Routes</Text>
          <Ionicons name="arrow-forward" size={14} color={colors.textTertiary} />
        </TouchableOpacity>
      </View>

      {runItems.length === 0 && !loading && (
        <View style={styles.emptyState}>
          <Ionicons name="footsteps-outline" size={48} color={colors.textTertiary} />
          <Text style={styles.emptyText}>No runs yet</Text>
          <Text style={styles.emptySubtext}>Start your first run above</Text>
        </View>
      )}
    </>
  );

  const renderPlanSegment = () => {
    const today = new Date();
    const todayDay = (today.getDay() + 6) % 7; // 0=Mon

    return (
      <>
        {/* Active Plan Info */}
        {activePlan ? (
          <View style={styles.planHeader}>
            <Text style={styles.planTitle}>
              WEEK {activePlan.current_week} OF {activePlan.total_weeks}
            </Text>
            <Text style={styles.planSubtitle}>
              {activePlan.goal_type.replace(/_/g, ' ').toUpperCase()} PLAN
            </Text>
          </View>
        ) : (
          <View style={styles.planHeader}>
            <Text style={styles.planTitle}>NO ACTIVE PLAN</Text>
            <Text style={styles.planSubtitle}>
              Create a training plan from the Run segment
            </Text>
          </View>
        )}

        {/* Week View */}
        {activePlan && activePlan.planned_runs && (
          <View style={styles.weekGrid}>
            {DAYS_OF_WEEK.map((dayName, dayIdx) => {
              const planned = activePlan.planned_runs.find(
                r => r.week_number === activePlan.current_week && r.day_of_week === dayIdx
              );
              const isToday = dayIdx === todayDay;
              const isCompleted = planned?.status === 'completed';
              const isMissed = planned?.status === 'missed';

              return (
                <View
                  key={dayIdx}
                  style={[
                    styles.weekDay,
                    isToday && styles.weekDayToday,
                  ]}
                >
                  <Text style={[styles.weekDayName, isToday && styles.weekDayNameToday]}>
                    {dayName}
                  </Text>
                  {planned ? (
                    <>
                      <Text style={[styles.weekDayType, isToday && { color: colors.accent }]}>
                        {(planned.run_type || '').charAt(0).toUpperCase() + (planned.run_type || '').slice(1)}
                      </Text>
                      {planned.target_distance_miles != null && (
                        <Text style={styles.weekDayMiles}>
                          {planned.target_distance_miles.toFixed(0)}mi
                        </Text>
                      )}
                    </>
                  ) : (
                    <Text style={styles.weekDayType}>Rest</Text>
                  )}
                  <Text style={styles.weekDayStatus}>
                    {isCompleted ? '✅' : isMissed ? '❌' : isToday ? '🔵' : dayIdx < todayDay ? '⬜' : '⬜'}
                  </Text>
                </View>
              );
            })}
          </View>
        )}

        {/* Week Summary Stats */}
        {weekSummary && (
          <View style={styles.weekSummaryCard}>
            <Text style={styles.sectionTitle}>THIS WEEK</Text>
            <View style={styles.weekSummaryRow}>
              <View style={styles.weekSummaryStat}>
                <Text style={styles.weekSummaryValue}>{weekSummary.workouts}</Text>
                <Text style={styles.weekSummaryLabel}>LIFTS</Text>
              </View>
              <View style={styles.weekSummaryStat}>
                <Text style={styles.weekSummaryValue}>{weekSummary.runs}</Text>
                <Text style={styles.weekSummaryLabel}>RUNS</Text>
              </View>
              <View style={styles.weekSummaryStat}>
                <Text style={styles.weekSummaryValue}>{weekSummary.total_hours}h</Text>
                <Text style={styles.weekSummaryLabel}>TOTAL</Text>
              </View>
              {weekSummary.avg_rpe > 0 && (
                <View style={styles.weekSummaryStat}>
                  <Text style={styles.weekSummaryValue}>{weekSummary.avg_rpe}</Text>
                  <Text style={styles.weekSummaryLabel}>AVG RPE</Text>
                </View>
              )}
            </View>
          </View>
        )}

        {/* Navigation */}
        <View style={styles.navButtons}>
          <TouchableOpacity
            style={styles.navBtn}
            onPress={() => navigation?.navigate?.('TrainingCalendar')}
          >
            <Ionicons name="calendar-outline" size={18} color={colors.accent} />
            <Text style={styles.navBtnText}>Full Calendar</Text>
            <Ionicons name="arrow-forward" size={14} color={colors.textTertiary} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.navBtn}
            onPress={() => navigation?.navigate?.('RouteLibrary')}
          >
            <Ionicons name="map-outline" size={18} color={colors.accent} />
            <Text style={styles.navBtnText}>Route Library</Text>
            <Ionicons name="arrow-forward" size={14} color={colors.textTertiary} />
          </TouchableOpacity>
        </View>
      </>
    );
  };

  if (loading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top + 40, alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: 40 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />
        }
      >
        {/* Header */}
        <Text style={styles.screenTitle}>Train</Text>

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
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },

  screenTitle: {
    ...typography.title1, color: colors.text,
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
    ...typography.micro, color: colors.textTertiary,
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
  weekDay: {
    flex: 1, alignItems: 'center', paddingVertical: spacing.sm,
    borderRadius: radius.sm,
  },
  weekDayToday: { backgroundColor: colors.accentMuted },
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
