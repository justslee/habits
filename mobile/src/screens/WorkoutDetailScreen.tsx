/**
 * WorkoutDetailScreen — Whoop-inspired workout summary.
 * Shows hero stats, recovery data, and exercise breakdown.
 */
import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, ActivityIndicator, RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { getWorkoutSession, getWhoopData, getWhoopSnapshot, WorkoutSession, ExerciseLogData, WhoopData } from '../api/client';
import WhoopCard from '../components/WhoopCard';
import { colors, spacing, typography, radius, cardStyle } from '../theme';

const DAY_LABELS: Record<string, string> = {
  push: 'Push Day', pull: 'Pull Day', legs: 'Legs + Core',
  cardio: 'Cardio', basketball: 'Basketball', rest: 'Rest Day',
};

// --- Helpers ---

function getExType(sets: ExerciseLogData[]): 'strength' | 'cardio' | 'bodyweight' {
  if (sets.some(s => s.duration_minutes || s.distance_miles)) return 'cardio';
  if (sets.some(s => s.weight && s.weight > 0)) return 'strength';
  return 'bodyweight';
}

function typeIcon(t: string) {
  return t === 'cardio' ? 'flash-outline' : t === 'strength' ? 'barbell-outline' : 'body-outline';
}

function rpeColor(rpe: number) {
  return rpe <= 6 ? colors.success : rpe <= 8 ? colors.warning : colors.error;
}

function formatVolume(v: number) {
  return v >= 1000 ? `${(v / 1000).toFixed(1).replace(/\.0$/, '')}k` : `${v}`;
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

// Group exercises by name
function groupExercises(exercises: ExerciseLogData[]) {
  const groups: { name: string; sets: ExerciseLogData[] }[] = [];
  const seen = new Map<string, number>();
  for (const ex of exercises) {
    const idx = seen.get(ex.exercise_name);
    if (idx !== undefined) {
      groups[idx].sets.push(ex);
    } else {
      seen.set(ex.exercise_name, groups.length);
      groups.push({ name: ex.exercise_name, sets: [ex] });
    }
  }
  return groups;
}

// --- Component ---

export default function WorkoutDetailScreen({ route }: any) {
  const { sessionId } = route.params;
  const insets = useSafeAreaInsets();
  const [session, setSession] = useState<WorkoutSession | null>(null);
  const [whoopData, setWhoopData] = useState<WhoopData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchSession = useCallback(async () => {
    try {
      const data = await getWorkoutSession(sessionId);
      setSession(data);
      // Fetch Whoop data for the session's date (historical), fall back to live
      try {
        const snapshot = await getWhoopSnapshot(data.session_date);
        setWhoopData(snapshot);
      } catch {
        try {
          const live = await getWhoopData();
          setWhoopData(live);
        } catch { /* no whoop data available */ }
      }
    } catch (err) {
      console.warn('Failed to fetch workout detail:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [sessionId]);

  useEffect(() => { fetchSession(); }, [fetchSession]);

  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  if (!session) {
    return (
      <View style={s.center}>
        <Ionicons name="alert-circle-outline" size={40} color={colors.textTertiary} />
        <Text style={s.errorText}>Workout not found</Text>
      </View>
    );
  }

  const exercises = session.exercises || [];
  const groups = groupExercises(exercises);

  // Compute stats
  const totalSets = exercises.length;
  const totalExercises = groups.length;
  const totalVolume = exercises.reduce((sum, ex) => {
    if (ex.weight && ex.weight > 0 && ex.reps) return sum + ex.weight * ex.reps;
    return sum;
  }, 0);
  const totalDistance = exercises.reduce((sum, ex) => sum + (ex.distance_miles || 0), 0);
  const totalDuration = exercises.reduce((sum, ex) => sum + (ex.duration_minutes || 0), 0);
  const hasStrength = exercises.some(ex => ex.weight && ex.weight > 0);
  const hasCardio = exercises.some(ex => ex.distance_miles || ex.duration_minutes);

  const plan = session.ai_plan ? JSON.parse(session.ai_plan) : null;
  const estimatedMin = plan?.estimated_duration_minutes || null;

  // Recovery color
  const recoveryScore = session.whoop_recovery_score;
  const recoveryColor = (recoveryScore ?? 0) >= 67 ? colors.success
    : (recoveryScore ?? 0) >= 34 ? colors.warning : colors.error;

  return (
    <ScrollView
      style={s.scroll}
      contentContainerStyle={s.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchSession(); }}
          tintColor={colors.textTertiary} />
      }
    >
      {/* Hero Header */}
      <View style={s.heroSection}>
        <Text style={s.heroDay}>{DAY_LABELS[session.day_type] || session.day_type}</Text>
        <Text style={s.heroDate}>{formatDate(session.session_date)}</Text>
        <View style={[s.statusBadge, session.status === 'completed' ? s.statusCompleted : s.statusPlanned]}>
          <Text style={[s.statusText, session.status === 'completed' ? s.statusTextCompleted : s.statusTextPlanned]}>
            {session.status === 'completed' ? '✓ Completed' : session.status.charAt(0).toUpperCase() + session.status.slice(1)}
          </Text>
        </View>
      </View>

      {/* Stats Grid — Whoop-style hero numbers */}
      <View style={s.card}>
        <View style={s.statsGrid}>
          <View style={s.statItem}>
            <Text style={s.statValue}>{totalExercises}</Text>
            <Text style={s.statLabel}>Exercises</Text>
          </View>
          <View style={s.statItem}>
            <Text style={s.statValue}>{totalSets}</Text>
            <Text style={s.statLabel}>Sets</Text>
          </View>
          {hasStrength && totalVolume > 0 && (
            <View style={s.statItem}>
              <Text style={s.statValue}>{formatVolume(totalVolume)}</Text>
              <Text style={s.statLabel}>Volume (lb)</Text>
            </View>
          )}
          {hasCardio && totalDistance > 0 && (
            <View style={s.statItem}>
              <Text style={s.statValue}>{totalDistance.toFixed(1)}</Text>
              <Text style={s.statLabel}>Miles</Text>
            </View>
          )}
          {estimatedMin && (
            <View style={s.statItem}>
              <Text style={s.statValue}>{estimatedMin}</Text>
              <Text style={s.statLabel}>Est. Min</Text>
            </View>
          )}
        </View>
      </View>

      {/* Whoop Data */}
      {whoopData && whoopData.recovery_score != null && (
        <WhoopCard data={whoopData} />
      )}

      {/* Coach Notes */}
      {session.coach_notes && (
        <View style={s.card}>
          <View style={s.coachHeader}>
            <Ionicons name="chatbubble-outline" size={14} color={colors.textTertiary} />
            <Text style={s.cardLabel}>COACH NOTES</Text>
          </View>
          <Text style={s.coachText}>{session.coach_notes}</Text>
        </View>
      )}

      {/* Exercise Breakdown — Table per group */}
      {groups.length > 0 && (
        <View style={s.card}>
          <Text style={s.cardLabel}>EXERCISE BREAKDOWN</Text>
          {groups.map((group, gi) => {
            const type = getExType(group.sets);
            return (
              <View key={gi} style={[s.exGroup, gi < groups.length - 1 && s.exGroupBorder]}>
                <View style={s.exHeader}>
                  <Ionicons name={typeIcon(type) as any} size={14} color={colors.textTertiary} />
                  <Text style={s.exName}>{group.name}</Text>
                  <Text style={s.exSetCount}>
                    {group.sets.length} {group.sets.length === 1 ? 'set' : 'sets'}
                  </Text>
                </View>

                {/* Table header */}
                <View style={s.tableHeader}>
                  <Text style={[s.tableHeaderCell, s.colSet]}>SET</Text>
                  {type === 'strength' && (
                    <>
                      <Text style={[s.tableHeaderCell, s.colMain]}>WEIGHT</Text>
                      <Text style={[s.tableHeaderCell, s.colSecondary]}>REPS</Text>
                    </>
                  )}
                  {type === 'cardio' && (
                    <>
                      <Text style={[s.tableHeaderCell, s.colMain]}>DISTANCE</Text>
                      <Text style={[s.tableHeaderCell, s.colSecondary]}>TIME</Text>
                    </>
                  )}
                  {type === 'bodyweight' && (
                    <>
                      <Text style={[s.tableHeaderCell, s.colMain]}>REPS</Text>
                      <Text style={[s.tableHeaderCell, s.colSecondary]}>DURATION</Text>
                    </>
                  )}
                  <Text style={[s.tableHeaderCell, s.colCheck]}> </Text>
                </View>

                {/* Data rows */}
                {group.sets.map((set, si) => {
                  const warmupSets = group.sets.slice(0, si).filter(s => s.is_warmup).length;
                  return (
                    <View key={si} style={[s.tableRow, set.is_warmup && { opacity: 0.5 }]}>
                      <Text style={[s.colSet, s.setNum]}>
                        {set.is_warmup ? 'W' : si + 1 - warmupSets}
                      </Text>
                      {type === 'strength' && (
                        <>
                          <Text style={[s.colMain, s.cellData]}>{set.weight ? `${set.weight} lb` : '—'}</Text>
                          <Text style={[s.colSecondary, s.cellData]}>{set.reps ?? '—'}</Text>
                        </>
                      )}
                      {type === 'cardio' && (
                        <>
                          <Text style={[s.colMain, s.cellData]}>{set.distance_miles ? `${set.distance_miles} mi` : '—'}</Text>
                          <Text style={[s.colSecondary, s.cellData]}>{set.duration_minutes ? `${set.duration_minutes} min` : '—'}</Text>
                        </>
                      )}
                      {type === 'bodyweight' && (
                        <>
                          <Text style={[s.colMain, s.cellData]}>{set.reps ?? '—'}</Text>
                          <Text style={[s.colSecondary, s.cellData]}>{set.duration_minutes ? `${set.duration_minutes}s` : '—'}</Text>
                        </>
                      )}
                      <View style={s.colCheck}>
                        {set.rpe != null ? (
                          <View style={[s.rpeBadge, { backgroundColor: rpeColor(set.rpe) + '20' }]}>
                            <Text style={[s.rpeText, { color: rpeColor(set.rpe) }]}>
                              {set.rpe}
                            </Text>
                          </View>
                        ) : (
                          <Ionicons name="checkmark" size={16} color={colors.accent} />
                        )}
                      </View>
                    </View>
                  );
                })}
              </View>
            );
          })}
        </View>
      )}

      {/* No exercises state */}
      {groups.length === 0 && session.status === 'completed' && (
        <View style={[s.card, { alignItems: 'center', paddingVertical: spacing.xl }]}>
          <Ionicons name="barbell-outline" size={40} color={colors.textTertiary} />
          <Text style={s.emptyText}>No exercises logged for this session</Text>
        </View>
      )}

      {/* Plan Details (if available) */}
      {plan?.exercises && plan.exercises.length > 0 && (
        <View style={s.card}>
          <Text style={s.cardLabel}>ORIGINAL PLAN</Text>
          {plan.exercises.map((ex: any, i: number) => (
            <View key={i} style={[s.planRow, i === plan.exercises.length - 1 && { borderBottomWidth: 0 }]}>
              <Text style={s.planName}>{ex.name}</Text>
              <Text style={s.planDetail}>
                {ex.sets}×{ex.reps}{ex.weight ? ` · ${ex.weight}lb` : ''}
              </Text>
            </View>
          ))}
        </View>
      )}

      <View style={{ height: spacing.xl }} />
    </ScrollView>
  );
}

// --- Styles ---

const s = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: colors.bg },
  container: { padding: spacing.lg, paddingBottom: 40 },
  center: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  errorText: { ...typography.body, color: colors.textSecondary, marginTop: spacing.sm },

  // Hero
  heroSection: { alignItems: 'center', marginBottom: spacing.lg, gap: spacing.xs },
  heroDay: { ...typography.title1, color: colors.text },
  heroDate: { ...typography.caption, color: colors.textSecondary },
  statusBadge: { borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 4, marginTop: spacing.xs },
  statusCompleted: { backgroundColor: colors.success + '15' },
  statusPlanned: { backgroundColor: colors.accent + '15' },
  statusText: { ...typography.micro },
  statusTextCompleted: { color: colors.success },
  statusTextPlanned: { color: colors.accent },

  // Cards
  card: { ...cardStyle, marginBottom: spacing.md },
  cardLabel: { ...typography.micro, color: colors.textTertiary, textTransform: 'uppercase' as const, marginBottom: spacing.md },

  // Stats grid (Whoop-style)
  statsGrid: { flexDirection: 'row', justifyContent: 'space-around', flexWrap: 'wrap' },
  statItem: { alignItems: 'center', minWidth: 70, marginBottom: spacing.sm },
  statValue: { ...typography.title2, color: colors.text, fontVariant: ['tabular-nums'] },
  statLabel: { ...typography.micro, color: colors.textTertiary, marginTop: 2, textTransform: 'uppercase' as const },

  // Recovery
  recoveryHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md },
  recoveryTitle: { ...typography.caption, fontWeight: '700' },
  barTrack: { height: 4, backgroundColor: colors.input, borderRadius: 2, marginTop: spacing.sm },
  barFill: { height: 4, borderRadius: 2 },

  // Coach
  coachHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  coachText: { ...typography.body, color: colors.textSecondary, lineHeight: 22 },

  // Exercise groups
  exGroup: { paddingVertical: spacing.md },
  exGroupBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  exHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  exName: { ...typography.bodyBold, color: colors.text, flex: 1 },
  exSetCount: { ...typography.caption, color: colors.textTertiary },

  // Table
  tableHeader: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: spacing.xs, marginBottom: spacing.xs,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  tableHeaderCell: { ...typography.micro, color: colors.textTertiary, textTransform: 'uppercase' as const },
  tableRow: { flexDirection: 'row', alignItems: 'center', height: 40 },
  cellData: { ...typography.body, color: colors.text },
  setNum: { ...typography.caption, color: colors.textTertiary, textAlign: 'center' },

  // Column widths
  colSet: { width: 40, textAlign: 'center' } as any,
  colMain: { flex: 1 } as any,
  colSecondary: { flex: 1, textAlign: 'right' } as any,
  colCheck: { width: 44, alignItems: 'center', justifyContent: 'center' } as any,

  rpeBadge: { borderRadius: radius.sm, paddingHorizontal: 6, paddingVertical: 2 },
  rpeText: { ...typography.micro, fontWeight: '700' },

  // Plan
  planRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  planName: { ...typography.body, color: colors.text, flex: 1 },
  planDetail: { ...typography.caption, color: colors.textTertiary },

  emptyText: { ...typography.body, color: colors.textTertiary, marginTop: spacing.sm },
});
