/**
 * Workout Screen — Phase 2
 *
 * Shows today's workout plan and provides live chat interface for logging sets.
 */

import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Platform,
  KeyboardAvoidingView,
  RefreshControl,
} from 'react-native';
import {
  getTodayWorkout,
  chatWithCoach,
  WorkoutSession,
  ChatResponseData,
} from '../api/client';

interface ChatMessage {
  role: 'user' | 'coach';
  text: string;
}

const DAY_LABELS: Record<string, string> = {
  push: '💪 Push Day',
  pull: '🏋️ Pull Day',
  legs: '🦵 Legs Day',
  cardio: '🏃 Cardio',
  basketball: '🏀 Basketball',
  rest: '🛌 Rest Day',
};

export default function WorkoutScreen() {
  const [session, setSession] = useState<WorkoutSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [sending, setSending] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  const fetchWorkout = useCallback(async () => {
    try {
      setError(null);
      const data = await getTodayWorkout();
      setSession(data);

      // Parse AI plan for initial coach message
      if (data.coach_notes && chatMessages.length === 0) {
        setChatMessages([{ role: 'coach', text: data.coach_notes }]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchWorkout();
  }, [fetchWorkout]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchWorkout();
  }, [fetchWorkout]);

  const sendMessage = async () => {
    if (!chatInput.trim() || !session) return;

    const msg = chatInput.trim();
    setChatInput('');
    setChatMessages((prev) => [...prev, { role: 'user', text: msg }]);
    setSending(true);

    try {
      const response = await chatWithCoach(session.id, msg);
      setChatMessages((prev) => [
        ...prev,
        { role: 'coach', text: response.coach_response },
      ]);
      // Refresh session to get updated exercises
      const updated = await getTodayWorkout();
      setSession(updated);
    } catch (err) {
      setChatMessages((prev) => [
        ...prev,
        { role: 'coach', text: 'Connection error. Try again.' },
      ]);
    } finally {
      setSending(false);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity style={styles.retryBtn} onPress={fetchWorkout}>
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const plan = session?.ai_plan ? JSON.parse(session.ai_plan) : null;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={90}
    >
      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#666" />
        }
      >
        {/* Header */}
        <Text style={styles.title}>
          {DAY_LABELS[session?.day_type || ''] || session?.day_type}
        </Text>

        {/* Whoop Context */}
        {session?.whoop_recovery_score && (
          <View style={styles.whoopCard}>
            <Text style={styles.whoopText}>
              Recovery {session.whoop_recovery_score}%
              {session.whoop_hrv ? ` · HRV ${session.whoop_hrv}` : ''}
              {session.whoop_sleep_score ? ` · Sleep ${session.whoop_sleep_score}%` : ''}
            </Text>
          </View>
        )}

        {/* Plan Summary */}
        {plan?.exercises && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Today's Plan</Text>
            {plan.pre_jog && (
              <Text style={styles.planItem}>
                🏃 {plan.pre_jog.minutes}min jog ({plan.pre_jog.pace})
              </Text>
            )}
            {plan.exercises.map((ex: any, i: number) => (
              <View key={i} style={styles.exerciseRow}>
                <Text style={styles.exerciseName}>{ex.name}</Text>
                <Text style={styles.exerciseDetail}>
                  {ex.sets}×{ex.reps}
                  {ex.weight ? ` @ ${ex.weight} lbs` : ''}
                </Text>
              </View>
            ))}
            {plan.estimated_duration_minutes && (
              <Text style={styles.duration}>
                ~{plan.estimated_duration_minutes} min
              </Text>
            )}
          </View>
        )}

        {/* Completed Sets */}
        {session?.exercises && session.exercises.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Completed</Text>
            {session.exercises.map((ex: any, i: number) => (
              <View key={i} style={styles.setRow}>
                <Text style={styles.setName}>{ex.exercise_name}</Text>
                <Text style={styles.setDetail}>
                  Set {ex.set_number}: {ex.weight}×{ex.reps}
                  {ex.is_warmup ? ' (warmup)' : ''}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* Chat */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Coach Chat</Text>
          {chatMessages.map((msg, i) => (
            <View
              key={i}
              style={[
                styles.chatBubble,
                msg.role === 'user' ? styles.userBubble : styles.coachBubble,
              ]}
            >
              <Text
                style={[
                  styles.chatText,
                  msg.role === 'user' ? styles.userText : styles.coachText,
                ]}
              >
                {msg.text}
              </Text>
            </View>
          ))}
          {sending && (
            <ActivityIndicator size="small" color="#666" style={{ marginTop: 8 }} />
          )}
        </View>
      </ScrollView>

      {/* Chat Input */}
      <View style={styles.inputBar}>
        <TextInput
          style={styles.chatInput}
          placeholder="bench 165 for 5..."
          placeholderTextColor="#666"
          value={chatInput}
          onChangeText={setChatInput}
          onSubmitEditing={sendMessage}
          returnKeyType="send"
          editable={!sending}
        />
        <TouchableOpacity
          style={[styles.sendBtn, (!chatInput.trim() || sending) && styles.sendBtnDisabled]}
          onPress={sendMessage}
          disabled={!chatInput.trim() || sending}
        >
          <Text style={styles.sendBtnText}>→</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  scroll: { flex: 1 },
  content: { padding: 20, paddingTop: Platform.OS === 'ios' ? 60 : 40, paddingBottom: 20 },
  center: { flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' },
  errorText: { color: '#ef4444', fontSize: 16, marginBottom: 16 },
  retryBtn: { paddingHorizontal: 20, paddingVertical: 10, backgroundColor: '#2563eb', borderRadius: 8 },
  retryText: { color: '#fff', fontWeight: '600' },
  title: { fontSize: 28, fontWeight: '700', color: '#fff', marginBottom: 16 },

  whoopCard: {
    backgroundColor: '#1a2a1a',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#2d4a2d',
  },
  whoopText: { color: '#4ade80', fontSize: 14, fontWeight: '600' },

  card: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#333',
  },
  cardTitle: { fontSize: 14, fontWeight: '600', color: '#aaa', marginBottom: 12 },

  planItem: { color: '#fff', fontSize: 14, marginBottom: 8 },
  exerciseRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
    paddingVertical: 4,
  },
  exerciseName: { color: '#fff', fontSize: 15, fontWeight: '600', flex: 1 },
  exerciseDetail: { color: '#2563eb', fontSize: 14, fontWeight: '600' },
  duration: { color: '#666', fontSize: 12, marginTop: 8 },

  setRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  setName: { color: '#aaa', fontSize: 13 },
  setDetail: { color: '#fff', fontSize: 13, fontWeight: '600' },

  chatBubble: {
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    maxWidth: '85%',
  },
  userBubble: {
    backgroundColor: '#2563eb',
    alignSelf: 'flex-end',
  },
  coachBubble: {
    backgroundColor: '#222',
    alignSelf: 'flex-start',
  },
  chatText: { fontSize: 14, lineHeight: 20 },
  userText: { color: '#fff' },
  coachText: { color: '#ddd' },

  inputBar: {
    flexDirection: 'row',
    padding: 12,
    paddingBottom: Platform.OS === 'ios' ? 28 : 12,
    backgroundColor: '#111',
    borderTopWidth: 1,
    borderTopColor: '#333',
    gap: 8,
  },
  chatInput: {
    flex: 1,
    backgroundColor: '#1a1a1a',
    color: '#fff',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
    borderWidth: 1,
    borderColor: '#333',
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#2563eb',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: { opacity: 0.4 },
  sendBtnText: { color: '#fff', fontSize: 20, fontWeight: '700' },
});
