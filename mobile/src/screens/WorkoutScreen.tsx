import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text, TextInput, ScrollView, TouchableOpacity, StyleSheet,
  Platform, KeyboardAvoidingView, RefreshControl, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { getTodayWorkout, chatWithCoach, completeTrainSession, WorkoutSession } from '../api/client';
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
      // Don't auto-seed coach_notes — header eyebrow + day title already convey context.
      // Chat thread starts empty and only fills as user converses.
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

  return (
    <ScreenBackground>
    <KeyboardAvoidingView style={s.outer} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
      <ScrollView ref={scrollRef} style={s.scroll} contentContainerStyle={[s.container, { paddingTop: 0 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchWorkout(); }} tintColor={colors.textTertiary} />}>

        {/* Header — eyebrow + serif day title + coach note (single source of truth) */}
        <View style={{ paddingHorizontal: spacing.md, paddingTop: spacing.md }}>
          <Text style={s.dayEyebrow}>
            {(session?.day_type || '').toUpperCase()} DAY
          </Text>
          <Text style={s.screenTitle}>{DAY_LABELS[session?.day_type || ''] || session?.day_type}</Text>
          {session?.coach_notes && !sessionComplete && (
            <View style={s.coachNoteRow}>
              <View style={s.coachWaveRow}>
                <View style={[s.coachWave, { height: 5 }]} />
                <View style={[s.coachWave, { height: 9 }]} />
                <View style={[s.coachWave, { height: 7 }]} />
              </View>
              <Text style={s.coachNoteEyebrow}>↗ COACH</Text>
              <View style={{ flex: 1 }} />
            </View>
          )}
          {session?.coach_notes && !sessionComplete && (
            <Text style={s.coachNoteText}>{session.coach_notes}</Text>
          )}
        </View>

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
                <View style={{ flex: 1 }}>
                  <Text style={s.exerciseName}>{ex.name}</Text>
                  {(ex.block || ex.rest || ex.notes) ? <Text style={{ ...typography.micro, color: colors.textTertiary, marginTop: 2 }} numberOfLines={2}>{[ex.block, ex.rest ? `rest ${ex.rest}` : null, ex.superset ? `with ${ex.superset}` : null, ex.notes].filter(Boolean).join(' · ')}</Text> : null}
                </View>
                <Text style={s.exerciseDetail}>{ex.sets}×{ex.reps}{ex.weight ? ` · ${ex.weight}lb` : ''}</Text>
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

        {/* Chat — only render when there are messages, in Ink-themed bubbles */}
        {chatMessages.length > 0 && (
          <View style={s.coachThread}>
            <View style={s.coachThreadHead}>
              <View style={s.coachWaveRow}>
                <View style={[s.coachWave, { height: 5 }]} />
                <View style={[s.coachWave, { height: 9 }]} />
                <View style={[s.coachWave, { height: 7 }]} />
              </View>
              <Text style={s.coachThreadEyebrow}>↗ COACH</Text>
            </View>
            {chatMessages.map((msg, i) => (
              <View key={i} style={[
                s.bubbleNew,
                msg.role === 'user' ? s.bubbleUser : s.bubbleCoach,
              ]}>
                <Text style={msg.role === 'user' ? s.bubbleUserText : s.bubbleCoachText}>
                  {msg.text}
                </Text>
              </View>
            ))}
            {sending && (
              <View style={[s.bubbleNew, s.bubbleCoach, { flexDirection: 'row', gap: 4, paddingVertical: 14 }]}>
                <View style={s.thinkingDot} />
                <View style={s.thinkingDot} />
                <View style={s.thinkingDot} />
              </View>
            )}
          </View>
        )}

        {/* Bottom spacer so chat content clears the input bar + floating tab bar */}
        <View style={{ height: 180 }} />
      </ScrollView>

      {/* Completion banner or Input — floats above the tab bar */}
      {!sessionComplete && session && (
        <TouchableOpacity
          style={{ position: 'absolute', right: spacing.md, bottom: Math.max(insets.bottom, 8) + 170, backgroundColor: colors.accent, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 10 }}
          onPress={() => {
            haptic.medium();
            const finish = (rpe?: number) => {
              const done = async (minutes?: number) => {
                try {
                  const r = await completeTrainSession(session.id, { overall_rpe: rpe, minutes });
                  setSessionComplete(true);
                  const lines = r.progression.map(pr => `${pr.exercise}: ${pr.note}`);
                  if (lines.length) Alert.alert('Next time', lines.join('\n'));
                  fetchWorkout();
                } catch (err) { console.warn('complete', err); }
              };
              if (Alert.prompt) Alert.prompt('Minutes', 'Total session time (the cap is 70).', (m) => done(m ? Number(m) : undefined), 'plain-text', '', 'number-pad');
              else done(undefined);
            };
            if (Alert.prompt) Alert.prompt('How hard?', 'Session RPE 1–10 (strength sets should have felt like 7–8).', (v) => finish(v ? Number(v) : undefined), 'plain-text', '', 'number-pad');
            else finish(undefined);
          }}
        >
          <Text style={{ fontFamily: fonts.semibold, fontSize: 13, color: colors.bg }}>Finish session</Text>
        </TouchableOpacity>
      )}
      {sessionComplete ? (
        <View style={[s.completeBanner, { paddingBottom: Math.max(insets.bottom, 0) + 100 }]}>
          <Ionicons name="checkmark-circle" size={20} color={colors.success} />
          <Text style={s.completeText}>Workout Complete</Text>
        </View>
      ) : (
        <View style={[s.inputBar, { paddingBottom: Math.max(insets.bottom, 8) + 100 }]}>
          <TextInput
            style={s.chatInput}
            placeholder="bench 165 for 5..."
            placeholderTextColor={colors.textTertiary}
            value={chatInput}
            onChangeText={setChatInput}
            onSubmitEditing={sendMessage}
            returnKeyType="send"
            editable={!sending}
          />
          <TouchableOpacity
            style={[s.sendBtn, (!chatInput.trim() || sending) && { opacity: 0.3 }]}
            onPress={sendMessage}
            disabled={!chatInput.trim() || sending}
          >
            <Ionicons name="arrow-forward" size={18} color={colors.bg} />
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

  // Cards
  card: { ...cardStyle, marginBottom: spacing.md },
  cardLabel: { ...typography.micro, color: colors.textTertiary, textTransform: 'uppercase', marginBottom: spacing.md },


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

  // ── Day header (canvas-style eyebrow + serif title) ──
  dayEyebrow: {
    fontFamily: fonts.mono,
    fontSize: 9,
    color: colors.textTertiary,
    letterSpacing: 1.8,
    marginBottom: 4,
  },
  coachNoteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: spacing.md,
    marginBottom: 6,
  },
  coachNoteEyebrow: {
    fontFamily: fonts.mono,
    fontSize: 9,
    color: colors.accent,
    letterSpacing: 2.2,
  },
  coachNoteText: {
    fontFamily: fonts.serifItalic,
    fontSize: 16,
    color: colors.textSecondary,
    lineHeight: 22,
    marginBottom: spacing.md,
  },

  // ── Coach chat thread (Ink theme) ──
  coachThread: {
    marginHorizontal: spacing.md,
    marginTop: spacing.lg,
    marginBottom: spacing.md,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 6,
    borderRadius: radius.xl,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
  },
  coachThreadHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  coachWaveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    height: 10,
  },
  coachWave: {
    width: 2,
    backgroundColor: colors.accent,
    borderRadius: 1,
  },
  coachThreadEyebrow: {
    fontFamily: fonts.mono,
    fontSize: 9,
    color: colors.accent,
    letterSpacing: 2.2,
  },
  bubbleNew: {
    maxWidth: '88%',
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 8,
  },
  bubbleCoach: {
    alignSelf: 'flex-start',
    backgroundColor: colors.bg2,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 16,
    borderBottomLeftRadius: 4,
  },
  bubbleUser: {
    alignSelf: 'flex-end',
    backgroundColor: colors.accent,
    borderRadius: 16,
    borderBottomRightRadius: 4,
  },
  bubbleCoachText: {
    fontFamily: fonts.serifItalic,
    fontSize: 16,
    color: colors.text,
    lineHeight: 22,
  },
  bubbleUserText: {
    fontFamily: fonts.regular,
    fontSize: 14,
    color: colors.bg,
    lineHeight: 20,
  },
  thinkingDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.textTertiary,
  },

  // ── Floating input bar (clears the floating tab bar) ──
  inputBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    backgroundColor: colors.bg,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    gap: spacing.sm,
  },
  chatInput: {
    flex: 1,
    backgroundColor: colors.bg2,
    color: colors.text,
    borderRadius: 999,
    paddingHorizontal: spacing.lg,
    paddingVertical: 12,
    fontFamily: fonts.regular,
    fontSize: 14,
    borderWidth: 1,
    borderColor: colors.line,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },

  completeBanner: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    gap: spacing.sm,
    backgroundColor: colors.bg,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  completeText: {
    fontFamily: fonts.serifItalic,
    fontSize: 17,
    color: colors.success,
    flex: 1,
  },
});
