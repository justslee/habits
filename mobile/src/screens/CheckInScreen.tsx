import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TextInput, ScrollView, TouchableOpacity, StyleSheet,
  Alert, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { createEntry } from '../api/client';
import { API_URL, apiHeaders } from '../api/client';
import { colors, spacing, typography, radius } from '../theme';
import { haptic } from '../utils/haptics';

interface TodoSummary {
  completed: number;
  total: number;
  totalMinutes: number;
}

export default function CheckInScreen() {
  const [focus, setFocus] = useState(5);
  const [energy, setEnergy] = useState(5);
  const [takeaway, setTakeaway] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [todoSummary, setTodoSummary] = useState<TodoSummary>({ completed: 0, total: 0, totalMinutes: 0 });

  useEffect(() => {
    (async () => {
      try {
        const resp = await fetch(`${API_URL}/api/v1/daily/todos`, { headers: apiHeaders() });
        if (resp.ok) {
          const todos = await resp.json();
          const completed = todos.filter((t: any) => t.completed);
          setTodoSummary({
            completed: completed.length,
            total: todos.length,
            totalMinutes: completed.reduce((sum: number, t: any) => sum + (t.estimated_minutes || 0), 0),
          });
        }
      } catch (err) {
        console.warn('Failed to fetch todos for summary:', err);
      }
    })();
  }, []);

  const formatTime = (mins: number) => {
    if (mins < 60) return `${mins}m`;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  };

  const handleSubmit = async () => {
    if (!takeaway.trim()) return Alert.alert('Required', 'Add a key takeaway from today.');
    setSubmitting(true);
    try {
      // Save the reflection entry
      await createEntry({
        description: `Daily reflection — ${todoSummary.completed}/${todoSummary.total} todos completed`,
        time_invested_minutes: todoSummary.totalMinutes || 30,
        pillar_tags: [],
        difficulty_rating: focus,
        energy_level: energy,
        key_takeaway: takeaway.trim(),
      });
      // Trigger end-of-day evaluation (consolidates todos + reflection)
      try {
        await fetch(`${API_URL}/api/v1/daily/end-of-day`, {
          method: 'POST',
          headers: apiHeaders(),
        });
      } catch (err) {
        console.warn('End-of-day evaluation trigger failed:', err);
      }
      haptic.success();
      setSubmitted(true);
    } catch (err: unknown) {
      console.warn('CheckIn submit error:', err);
      Alert.alert('Failed', err instanceof Error ? err.message : 'Unknown error');
    } finally { setSubmitting(false); }
  };

  const resetForm = () => {
    setFocus(5); setEnergy(5); setTakeaway(''); setSubmitted(false);
  };

  if (submitted) {
    return (
      <View style={s.successContainer}>
        <View style={s.successRing}>
          <Ionicons name="checkmark" size={40} color={colors.success} />
        </View>
        <Text style={s.successTitle}>Logged</Text>
        <Text style={s.successSub}>Daily reflection saved</Text>
        <TouchableOpacity style={s.primaryBtn} onPress={() => { haptic.light(); resetForm(); }}>
          <Text style={s.primaryBtnText}>Done</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView style={s.scroll} contentContainerStyle={s.container} keyboardShouldPersistTaps="handled">
      {/* Today's Progress Summary */}
      <View style={s.summaryCard}>
        <View style={s.summaryRow}>
          <View style={s.summaryItem}>
            <Text style={s.summaryValue}>{todoSummary.completed}/{todoSummary.total}</Text>
            <Text style={s.summaryLabel}>Todos Done</Text>
          </View>
          <View style={s.summaryDivider} />
          <View style={s.summaryItem}>
            <Text style={s.summaryValue}>{formatTime(todoSummary.totalMinutes)}</Text>
            <Text style={s.summaryLabel}>Time Logged</Text>
          </View>
        </View>
      </View>

      {/* Focus */}
      <Text style={s.label}>FOCUS  <Text style={{ color: colors.accent }}>{focus}</Text>/10</Text>
      <View style={s.sliderTrack}>
        {[1,2,3,4,5,6,7,8,9,10].map(n => (
          <TouchableOpacity key={n} style={[s.sliderSegment,
            focus >= n && { backgroundColor: colors.accent },
            n === 1 && { borderTopLeftRadius: 6, borderBottomLeftRadius: 6 },
            n === 10 && { borderTopRightRadius: 6, borderBottomRightRadius: 6 },
          ]} onPress={() => { haptic.light(); setFocus(n); }} testID={`focus-${n}`} />
        ))}
      </View>

      {/* Energy */}
      <Text style={s.label}>ENERGY  <Text style={{ color: colors.success }}>{energy}</Text>/10</Text>
      <View style={s.sliderTrack}>
        {[1,2,3,4,5,6,7,8,9,10].map(n => (
          <TouchableOpacity key={n} style={[s.sliderSegment,
            energy >= n && { backgroundColor: colors.success },
            n === 1 && { borderTopLeftRadius: 6, borderBottomLeftRadius: 6 },
            n === 10 && { borderTopRightRadius: 6, borderBottomRightRadius: 6 },
          ]} onPress={() => { haptic.light(); setEnergy(n); }} testID={`energy-${n}`} />
        ))}
      </View>

      {/* Key Takeaway */}
      <Text style={s.label}>KEY TAKEAWAY</Text>
      <TextInput style={s.input}
        placeholder="Most important thing from today"
        placeholderTextColor={colors.textTertiary}
        value={takeaway} onChangeText={setTakeaway} testID="takeaway-input" />

      {/* Submit */}
      <TouchableOpacity style={[s.primaryBtn, submitting && { opacity: 0.5 }]}
        onPress={handleSubmit} disabled={submitting} testID="submit-btn">
        {submitting ? <ActivityIndicator color={colors.text} /> : <Text style={s.primaryBtnText}>Save Reflection</Text>}
      </TouchableOpacity>

      <View style={{ height: 24 }} />
    </ScrollView>
  );
}

const s = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: colors.bg },
  container: { padding: spacing.lg, paddingTop: spacing.md },

  summaryCard: {
    backgroundColor: colors.input,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryItem: { flex: 1, alignItems: 'center' },
  summaryValue: { ...typography.title1, color: colors.text, fontSize: 28 },
  summaryLabel: { ...typography.caption, color: colors.textTertiary, marginTop: 2 },
  summaryDivider: {
    width: 1, height: 36, backgroundColor: colors.border, marginHorizontal: spacing.md,
  },

  label: {
    ...typography.micro, color: colors.textTertiary, textTransform: 'uppercase',
    marginBottom: spacing.sm, marginTop: spacing.md,
  },

  input: {
    backgroundColor: colors.input, color: colors.text, borderRadius: radius.md,
    padding: spacing.md, fontSize: 15, borderWidth: 1, borderColor: colors.border,
  },

  sliderTrack: { flexDirection: 'row', gap: 3, marginBottom: spacing.xs },
  sliderSegment: { flex: 1, height: 28, backgroundColor: colors.input },

  primaryBtn: {
    backgroundColor: colors.accent, borderRadius: radius.lg,
    paddingVertical: 18, alignItems: 'center', marginTop: spacing.lg,
  },
  primaryBtnText: { ...typography.bodyBold, color: colors.text },

  successContainer: {
    flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', padding: spacing.xxl,
  },
  successRing: {
    width: 88, height: 88, borderRadius: 44, backgroundColor: colors.success + '15',
    borderWidth: 2, borderColor: colors.success + '40',
    alignItems: 'center', justifyContent: 'center', marginBottom: spacing.lg,
  },
  successTitle: { ...typography.title1, color: colors.text, marginBottom: spacing.sm },
  successSub: { ...typography.body, color: colors.textSecondary, marginBottom: spacing.xl },
});
