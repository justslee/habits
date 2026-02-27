import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text, TextInput, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, Platform, KeyboardAvoidingView, RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { getTodayWorkout, chatWithCoach, WorkoutSession } from '../api/client';
import { colors, spacing, typography, radius, cardStyle } from '../theme';
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
    <KeyboardAvoidingView style={s.outer} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
      <ScrollView ref={scrollRef} style={s.scroll} contentContainerStyle={[s.container, { paddingTop: insets.top + 16 }]}
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
              <View style={[s.recoveryBarFill, { width: `${session!.whoop_recovery_score}%`, backgroundColor: recoveryColor }]} />
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

        {/* Completed Sets */}
        {session?.exercises && session.exercises.length > 0 && (
          <View style={s.card}>
            <Text style={s.cardLabel}>COMPLETED</Text>
            {session.exercises.map((ex: any, i: number) => (
              <View key={i} style={s.setRow}>
                <Text style={s.setName}>{ex.exercise_name}</Text>
                <Text style={s.setDetail}>Set {ex.set_number}: {ex.weight}x{ex.reps}{ex.is_warmup ? '  warmup' : ''}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Chat */}
        <View style={s.card}>
          <Text style={s.cardLabel}>COACH</Text>
          {chatMessages.map((msg, i) => (
            <View key={i} style={[s.bubble, msg.role === 'user' ? s.userBubble : s.coachBubble]}>
              <Text style={[s.bubbleText, msg.role === 'user' ? { color: '#fff' } : { color: colors.text }]}>{msg.text}</Text>
            </View>
          ))}
          {sending && <ActivityIndicator size="small" color={colors.textTertiary} style={{ marginTop: 8 }} />}
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
  );
}

const s = StyleSheet.create({
  outer: { flex: 1, backgroundColor: colors.bg },
  scroll: { flex: 1 },
  container: { padding: spacing.lg, paddingBottom: 20 },
  center: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  screenTitle: { ...typography.title1, color: colors.text, marginBottom: spacing.lg },

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

  setRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.sm },
  setName: { ...typography.caption, color: colors.textSecondary },
  setDetail: { ...typography.caption, color: colors.text, fontWeight: '600' },

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
