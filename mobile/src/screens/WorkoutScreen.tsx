import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text, TextInput, ScrollView, TouchableOpacity, StyleSheet,
  Platform, KeyboardAvoidingView, RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { getTodayWorkout, chatWithCoach, WorkoutSession } from '../api/client';
import { colors, spacing, typography, radius, fonts, cardStyle } from '../theme';
import ScreenBackground from '../components/ScreenBackground';
import { Skeleton } from '../components/Skeleton';
import LiftLogger from '../components/LiftLogger';
import { haptic } from '../utils/haptics';

interface ChatMessage { role: 'user' | 'coach'; text: string; }

const DAY_LABELS: Record<string, string> = {
  push: 'Push Day', pull: 'Pull Day', legs: 'Legs + Core',
  cardio: 'Cardio', basketball: 'Basketball', rest: 'Rest Day',
};

export default function WorkoutScreen() {
  const insets = useSafeAreaInsets();
  const [session, setSession] = useState<WorkoutSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [sending, setSending] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [sessionComplete, setSessionComplete] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  const fetchWorkout = useCallback(async () => {
    try {
      setError(null);
      const data = await getTodayWorkout();
      setSession(data);
      if (data.status === 'completed') setSessionComplete(true);
      if (data.coach_notes && chatMessages.length === 0) {
        setChatMessages([{ role: 'coach', text: data.coach_notes }]);
      }
    } catch (err) {
      console.warn('Workout fetch error:', err);
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { fetchWorkout(); }, [fetchWorkout]);

  const sendMessage = async () => {
    if (!chatInput.trim() || !session) return;
    const msg = chatInput.trim();
    setChatInput('');
    setChatMessages(prev => [...prev, { role: 'user', text: msg }]);
    setSending(true);
    haptic.light();
    try {
      const response = await chatWithCoach(session.id, msg);
      setChatMessages(prev => [...prev, { role: 'coach', text: response.coach_response }]);
      const updated = await getTodayWorkout();
      setSession(updated);
      if (response.session_completed) {
        haptic.success();
        setSessionComplete(true);
      } else {
        haptic.success();
      }
    } catch (err) {
      console.warn('Workout chat error:', err);
      setChatMessages(prev => [...prev, { role: 'coach', text: 'Connection error. Try again.' }]);
    } finally {
      setSending(false);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    }
  };

  if (loading) {
    return (
      <View style={s.center}>
        <View style={s.skeleton}><View style={s.skeletonBar} /><View style={[s.skeletonBar, { width: '60%' }]} /></View>
      </View>
    );
  }

  if (error) {
    return (
      <View style={s.center}>
        <Ionicons name="cloud-offline-outline" size={40} color={colors.textTertiary} />
        <Text style={s.errorText}>{error}</Text>
        <TouchableOpacity style={s.retryBtn} onPress={() => { haptic.light(); fetchWorkout(); }}>
          <Text style={s.retryText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const plan = session?.ai_plan ? JSON.parse(session.ai_plan) : null;
  const hasWhoop = session?.whoop_recovery_score != null;

  // Recovery color
  const recoveryColor = (session?.whoop_recovery_score ?? 0) >= 67 ? colors.success
    : (session?.whoop_recovery_score ?? 0) >= 34 ? colors.warning : colors.error;

  return (
    <ScreenBackground>
    <KeyboardAvoidingView style={s.outer} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
      <ScrollView ref={scrollRef} style={s.scroll} contentContainerStyle={[s.container, { paddingTop: 0 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchWorkout(); }} tintColor={colors.textTertiary} />}>

        <Text style={s.screenTitle}>{DAY_LABELS[session?.day_type || ''] || session?.day_type}</Text>

        {/* Whoop Recovery Card */}
        {hasWhoop && (
          <View style={[s.card, { borderColor: recoveryColor + '30' }]}>
            <View style={s.whoopHeader}>
              <Ionicons name="heart" size={16} color={recoveryColor} />
              <Text style={[s.whoopTitle, { color: recoveryColor }]}>Recovery</Text>
            </View>
            <View style={s.whoopStats}>
              <View style={s.whoopStat}>
                <Text style={[s.whoopValue, { color: recoveryColor }]}>{Math.round(session!.whoop_recovery_score!)}%</Text>
                <Text style={s.whoopLabel}>Score</Text>
              </View>
              {session!.whoop_hrv && (
                <View style={s.whoopStat}>
                  <Text style={s.whoopValue}>{Math.round(session!.whoop_hrv!)}</Text>
                  <Text style={s.whoopLabel}>HRV</Text>
                </View>
              )}
              {session!.whoop_resting_hr && (
                <View style={s.whoopStat}>
                  <Text style={s.whoopValue}>{Math.round(session!.whoop_resting_hr!)}</Text>
                  <Text style={s.whoopLabel}>RHR</Text>
                </View>
              )}
              {session!.whoop_sleep_score && (
                <View style={s.whoopStat}>
                  <Text style={s.whoopValue}>{Math.round(session!.whoop_sleep_score!)}%</Text>
                  <Text style={s.whoopLabel}>Sleep</Text>
                </View>
              )}
            </View>
            {/* Recovery bar */}
            <View style={s.recoveryBarTrack}>
              <View style={[s.recoveryBarFill, { width: `${session!.whoop_recovery_score ?? 0}%`, backgroundColor: recoveryColor }]} />
            </View>
          </View>
        )}

        {/* Plan */}
        {plan?.exercises && plan.exercises.length > 0 && (
          <View style={s.card}>
            <Text style={s.cardLabel}>TODAY'S PLAN</Text>
            {plan.pre_jog && (
              <View style={s.exerciseRow}>
                <Text style={s.exerciseName}>{plan.pre_jog.minutes}min warmup jog</Text>
                <Text style={s.exerciseDetail}>{plan.pre_jog.pace}</Text>
              </View>
            )}
            {plan.exercises.map((ex: any, i: number) => (
              <View key={i} style={[s.exerciseRow, i === plan.exercises.length - 1 && { borderBottomWidth: 0 }]}>
                <Text style={s.exerciseName}>{ex.name}</Text>
                <Text style={s.exerciseDetail}>{ex.sets}x{ex.reps}{ex.weight ? ` · ${ex.weight}lb` : ''}</Text>
              </View>
            ))}
            {plan.estimated_duration_minutes > 0 && (
              <Text style={s.duration}>{plan.estimated_duration_minutes} min estimated</Text>
            )}
          </View>
        )}

        {/* Lift Logger — fast-path manual set entry */}
        {session && !sessionComplete && session.day_type !== 'cardio' && session.day_type !== 'rest' && session.day_type !== 'basketball' && (() => {
          const planExercises: string[] = (plan?.exercises || [])
            .map((ex: any) => ex.name)
            .filter(Boolean);
          const exerciseList = planExercises.length > 0 ? planExercises : undefined;
          const initialSetCount = session.exercises?.length ?? 0;
          return (
            <LiftLogger
              sessionId={session.id}
              exercises={exerciseList}
              initialSetCount={initialSetCount}
              onLogged={() => { fetchWorkout(); }}
            />
          );
        })()}

        {/* Workout Summary + Completed Sets — grouped by exercise */}
        {session?.exercises && session.exercises.length > 0 && (() => {
          // Group exercises by name, preserving first-seen order
          const groups: { name: string; sets: typeof session.exercises }[] = [];
          const seen = new Map<string, number>();
          for (const ex of session.exercises) {
            const idx = seen.get(ex.exercise_name);
            if (idx !== undefined) {
              groups[idx].sets.push(ex);
            } else {
              seen.set(ex.exercise_name, groups.length);
              groups.push({ name: ex.exercise_name, sets: [ex] });
            }
          }

          // Determine exercise type from data
          const getExType = (sets: typeof session.exercises) => {
            if (sets.some(s => s.duration_minutes || s.distance_miles)) return 'cardio';
            if (sets.some(s => s.weight && s.weight > 0)) return 'strength';
            return 'bodyweight';
          };
          const typeIcon = (t: string) =>
            t === 'cardio' ? 'flash-outline' : t === 'strength' ? 'barbell-outline' : 'body-outline';
          const rpeColor = (rpe: number) =>
            rpe <= 6 ? colors.success : rpe <= 8 ? colors.warning : colors.error;

          const totalSets = session.exercises.length;
          const totalExercises = groups.length;

          // Calculate total volume (weight × reps for strength sets)
          const totalVolume = session.exercises.reduce((sum, ex) => {
            if (ex.weight && ex.weight > 0 && ex.reps) return sum + ex.weight * ex.reps;
            return sum;
          }, 0);

          // Calculate total distance & duration for cardio
          const totalDistance = session.exercises.reduce((sum, ex) =>
            sum + (ex.distance_miles || 0), 0);
          const totalDuration = session.exercises.reduce((sum, ex) =>
            sum + (ex.duration_minutes || 0), 0);

          // Determine if primarily cardio
          const hasStrength = session.exercises.some(ex => ex.weight && ex.weight > 0);
          const hasCardio = session.exercises.some(ex => ex.distance_miles || ex.duration_minutes);

          const formatVolume = (v: number) =>
            v >= 1000 ? `${(v / 1000).toFixed(1).replace(/\.0$/, '')}k` : `${v}`;

          return (
            <>
              {/* Workout Summary Card */}
              <View style={s.card}>
                <Text style={s.cardLabel}>WORKOUT SUMMARY</Text>
                <View style={s.summaryGrid}>
                  <View style={s.summaryStatItem}>
                    <Text style={s.summaryStatValue}>{totalExercises}</Text>
                    <Text style={s.summaryStatLabel}>Exercises</Text>
                  </View>
                  <View style={s.summaryStatItem}>
                    <Text style={s.summaryStatValue}>{totalSets}</Text>
                    <Text style={s.summaryStatLabel}>Sets</Text>
                  </View>
                  {hasStrength && totalVolume > 0 && (
                    <View style={s.summaryStatItem}>
                      <Text style={s.summaryStatValue}>{formatVolume(totalVolume)}</Text>
                      <Text style={s.summaryStatLabel}>Volume (lb)</Text>
                    </View>
                  )}
                  {hasCardio && totalDistance > 0 && (
                    <View style={s.summaryStatItem}>
                      <Text style={s.summaryStatValue}>{totalDistance.toFixed(1)}</Text>
                      <Text style={s.summaryStatLabel}>Miles</Text>
                    </View>
                  )}
                  {hasCardio && totalDuration > 0 && !hasStrength && (
                    <View style={s.summaryStatItem}>
                      <Text style={s.summaryStatValue}>{Math.round(totalDuration)}</Text>
                      <Text style={s.summaryStatLabel}>Minutes</Text>
                    </View>
                  )}
                </View>
              </View>

              {/* Completed — Exercise Tables */}
              <View style={s.card}>
                <Text style={s.cardLabel}>COMPLETED</Text>
                {groups.map((group, gi) => {
                  const type = getExType(group.sets);
                  return (
                    <View key={gi} style={[s.exerciseGroup, gi < groups.length - 1 && s.exerciseGroupBorder]}>
                      {/* Exercise header */}
                      <View style={s.groupHeader}>
                        <Ionicons name={typeIcon(type) as any} size={14} color={colors.textTertiary} />
                        <Text style={s.groupName}>{group.name}</Text>
                      </View>

                      {/* Table header row */}
                      <View style={s.tableHeaderRow}>
                        <Text style={[s.tableHeaderCell, s.colSet]}>SET</Text>
                        {type === 'strength' && (
                          <>
                            <Text style={[s.tableHeaderCell, s.colWeight]}>WEIGHT</Text>
                            <Text style={[s.tableHeaderCell, s.colReps]}>REPS</Text>
                          </>
                        )}
                        {type === 'cardio' && (
                          <>
                            <Text style={[s.tableHeaderCell, s.colWeight]}>DISTANCE</Text>
                            <Text style={[s.tableHeaderCell, s.colReps]}>TIME</Text>
                          </>
                        )}
                        {type === 'bodyweight' && (
                          <>
                            <Text style={[s.tableHeaderCell, s.colWeight]}>REPS</Text>
                            <Text style={[s.tableHeaderCell, s.colReps]}>DURATION</Text>
                          </>
                        )}
                        <Text style={[s.tableHeaderCell, s.colCheck]}>{'  '}</Text>
                      </View>

                      {/* Data rows */}
                      {group.sets.map((set, si) => (
                        <View key={si} style={[s.tableDataRow, set.is_warmup && { opacity: 0.55 }]}>
                          <Text style={[s.colSet, s.setNumberCell]}>
                            {set.is_warmup ? 'W' : si + 1 - group.sets.slice(0, si).filter(s => s.is_warmup).length}
                          </Text>
                          {type === 'strength' && (
                            <>
                              <Text style={[s.colWeight, s.tableDataCell]}>{set.weight ? `${set.weight} lb` : '—'}</Text>
                              <Text style={[s.colReps, s.tableDataCell]}>{set.reps ?? '—'}</Text>
                            </>
                          )}
                          {type === 'cardio' && (
                            <>
                              <Text style={[s.colWeight, s.tableDataCell]}>{set.distance_miles ? `${set.distance_miles} mi` : '—'}</Text>
                              <Text style={[s.colReps, s.tableDataCell]}>{set.duration_minutes ? `${set.duration_minutes} min` : '—'}</Text>
                            </>
                          )}
                          {type === 'bodyweight' && (
                            <>
                              <Text style={[s.colWeight, s.tableDataCell]}>{set.reps ?? '—'}</Text>
                              <Text style={[s.colReps, s.tableDataCell]}>{set.duration_minutes ? `${set.duration_minutes}s` : '—'}</Text>
                            </>
                          )}
                          <View style={s.colCheck}>
                            {set.rpe != null ? (
                              <View style={[s.rpeBadge, { backgroundColor: rpeColor(set.rpe) + '20' }]}>
                                <Text style={[s.rpeText, { color: rpeColor(set.rpe) }]}>RPE {set.rpe}</Text>
                              </View>
                            ) : (
                              <Ionicons name="checkmark" size={16} color={colors.accent} />
                            )}
                          </View>
                        </View>
                      ))}
                    </View>
                  );
                })}
              </View>
            </>
          );
        })()}

        {/* Chat */}
        <View style={s.card}>
          <Text style={s.cardLabel}>COACH</Text>
          {chatMessages.map((msg, i) => (
            <View key={i} style={[s.bubble, msg.role === 'user' ? s.userBubble : s.coachBubble]}>
              <Text style={[s.bubbleText, msg.role === 'user' ? { color: '#fff' } : { color: colors.text }]}>{msg.text}</Text>
            </View>
          ))}
          {sending && <Skeleton width={40} height={14} style={{ marginTop: 8, alignSelf: 'flex-start' }} />}
        </View>
      </ScrollView>

      {/* Completion banner or Input */}
      {sessionComplete ? (
        <View style={[s.completeBanner, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
          <Ionicons name="checkmark-circle" size={20} color={colors.success} />
          <Text style={s.completeText}>Workout Complete</Text>
        </View>
      ) : (
        <View style={[s.inputBar, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
          <TextInput style={s.chatInput} placeholder="bench 165 for 5..."
            placeholderTextColor={colors.textTertiary}
            value={chatInput} onChangeText={setChatInput} onSubmitEditing={sendMessage}
            returnKeyType="send" editable={!sending} />
          <TouchableOpacity style={[s.sendBtn, (!chatInput.trim() || sending) && { opacity: 0.3 }]}
            onPress={sendMessage} disabled={!chatInput.trim() || sending}>
            <Ionicons name="arrow-up" size={18} color="#fff" />
          </TouchableOpacity>
        </View>
      )}
    </KeyboardAvoidingView>
    </ScreenBackground>
  );
}

const s = StyleSheet.create({
  outer: { flex: 1 },
  scroll: { flex: 1 },
  container: { padding: spacing.lg, paddingBottom: 20 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  screenTitle: { fontFamily: fonts.serifItalic, fontSize: 30, color: colors.text, letterSpacing: -0.6, marginBottom: spacing.lg },

  skeleton: { gap: spacing.md, width: '80%' },
  skeletonBar: { height: 16, backgroundColor: colors.input, borderRadius: radius.sm, width: '100%' },

  errorText: { ...typography.body, color: colors.textSecondary, marginTop: spacing.sm },
  retryBtn: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, backgroundColor: colors.accent, borderRadius: radius.sm },
  retryText: { ...typography.bodyBold, color: '#fff' },

  // Whoop card
  card: { ...cardStyle, marginBottom: spacing.md },
  cardLabel: { ...typography.micro, color: colors.textTertiary, textTransform: 'uppercase', marginBottom: spacing.md },

  whoopHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md },
  whoopTitle: { ...typography.caption, fontWeight: '700' },
  whoopStats: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.md },
  whoopStat: { alignItems: 'center' },
  whoopValue: { ...typography.title2, color: colors.text },
  whoopLabel: { ...typography.micro, color: colors.textTertiary, marginTop: 2 },
  recoveryBarTrack: { height: 4, backgroundColor: colors.input, borderRadius: 2 },
  recoveryBarFill: { height: 4, borderRadius: 2 },

  exerciseRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  exerciseName: { ...typography.body, color: colors.text, flex: 1 },
  exerciseDetail: { ...typography.bodyBold, color: colors.accent },
  duration: { ...typography.caption, color: colors.textTertiary, marginTop: spacing.sm },

  // Workout Summary
  summaryGrid: { flexDirection: 'row', justifyContent: 'space-around' },
  summaryStatItem: { alignItems: 'center' },
  summaryStatValue: { ...typography.title2, color: colors.text },
  summaryStatLabel: { ...typography.micro, color: colors.textTertiary, marginTop: 2, textTransform: 'uppercase' },

  // Exercise groups
  exerciseGroup: { paddingVertical: spacing.md },
  exerciseGroupBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  groupHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  groupName: { ...typography.bodyBold, color: colors.text, flex: 1 },

  // Table layout
  tableHeaderRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: spacing.xs, marginBottom: spacing.xs,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  tableHeaderCell: { ...typography.micro, color: colors.textTertiary, textTransform: 'uppercase' },
  tableDataRow: {
    flexDirection: 'row', alignItems: 'center',
    height: 40,
  },
  tableDataCell: { ...typography.body, color: colors.text },
  setNumberCell: { ...typography.caption, color: colors.textTertiary, textAlign: 'center' },

  // Column widths
  colSet: { width: 40, textAlign: 'center' } as any,
  colWeight: { flex: 1 } as any,
  colReps: { flex: 1, textAlign: 'right' } as any,
  colCheck: { width: 48, alignItems: 'center', justifyContent: 'center' } as any,

  rpeBadge: { borderRadius: radius.sm, paddingHorizontal: 6, paddingVertical: 2 },
  rpeText: { ...typography.micro, fontWeight: '700' },

  bubble: { borderRadius: 16, padding: spacing.md, marginBottom: spacing.sm, maxWidth: '85%' },
  userBubble: { backgroundColor: colors.accent, alignSelf: 'flex-end', borderBottomRightRadius: 4 },
  coachBubble: { backgroundColor: colors.cardElevated, alignSelf: 'flex-start', borderBottomLeftRadius: 4 },
  bubbleText: { ...typography.body, lineHeight: 22 },

  inputBar: {
    flexDirection: 'row', padding: spacing.md,
    backgroundColor: colors.bg, borderTopWidth: 1, borderTopColor: colors.border, gap: spacing.sm,
  },
  chatInput: {
    flex: 1, backgroundColor: colors.input, color: colors.text,
    borderRadius: radius.xl, paddingHorizontal: spacing.lg, paddingVertical: 12,
    ...typography.body, borderWidth: 1, borderColor: colors.border,
  },
  sendBtn: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: colors.accent,
    alignItems: 'center', justifyContent: 'center',
  },

  completeBanner: {
    flexDirection: 'row', alignItems: 'center', padding: spacing.md, gap: spacing.sm,
    backgroundColor: colors.bg, borderTopWidth: 1, borderTopColor: colors.border,
  },
  completeText: { ...typography.bodyBold, color: colors.success, flex: 1 },
});
