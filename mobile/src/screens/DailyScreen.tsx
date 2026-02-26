/**
 * Daily Screen — "Today" + "Check-In" sub-tabs
 *
 * Today: motivational quote, workout preview, smart todos, daily habits
 * Check-In: existing deep learning session logger
 *
 * Inspired by Things 3 (clean todos), Streaks (habit rings),
 * and Todoist (quick add). Dark, minimal, haptic-rich.
 */

import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput, StyleSheet,
  Platform, RefreshControl, KeyboardAvoidingView, Alert, Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ExpoHaptics from 'expo-haptics';

// Safe haptics wrapper — no-ops on web
const haptic = {
  light: () => { if (Platform.OS !== 'web') ExpoHaptics.impactAsync(ExpoHaptics.ImpactFeedbackStyle.Light).catch(() => {}); },
  medium: () => { if (Platform.OS !== 'web') ExpoHaptics.impactAsync(ExpoHaptics.ImpactFeedbackStyle.Medium).catch(() => {}); },
  success: () => { if (Platform.OS !== 'web') ExpoHaptics.notificationAsync(ExpoHaptics.NotificationFeedbackType.Success).catch(() => {}); },
  warning: () => { if (Platform.OS !== 'web') ExpoHaptics.notificationAsync(ExpoHaptics.NotificationFeedbackType.Warning).catch(() => {}); },
  selection: () => { if (Platform.OS !== 'web') ExpoHaptics.selectionAsync().catch(() => {}); },
};
import { colors, spacing, typography, radius } from '../theme';
import CheckInContent from './CheckInScreen';

const API = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8000';

// Types
interface Todo {
  id: number;
  text: string;
  todo_date: string;
  pillar_id: number | null;
  pillar_name: string | null;
  pillar_confidence: number | null;
  completed: boolean;
  estimated_minutes: number | null;
  sort_order: number;
}

interface Habit {
  id: number;
  name: string;
  icon: string | null;
  color: string | null;
  is_active: boolean;
  current_streak: number;
  longest_streak: number;
  total_completions: number;
  completed_today: boolean;
  sort_order: number;
}

interface DailySummary {
  quote: string;
  quote_author: string;
  todos: Todo[];
  habits: Habit[];
  workout_preview: string | null;
  workout_day_type: string | null;
  whoop_recovery: number | null;
}

const PILLAR_COLORS: Record<string, string> = {
  'Quantitative Finance': '#3B82F6',
  'Macro & Qualitative Investing': '#10B981',
  'Machine Learning (Math)': '#F59E0B',
  'AI Engineering & Deployment': '#8B5CF6',
  'Public Speaking & Communication': '#EC4899',
};

const DAY_TYPE_COLORS: Record<string, string> = {
  push: '#EF4444', pull: '#3B82F6', legs: '#10B981',
  rest: '#6B7280', cardio: '#F59E0B',
};

type SubTab = 'today' | 'checkin';

export default function DailyScreen() {
  const [activeTab, setActiveTab] = useState<SubTab>('today');
  const [summary, setSummary] = useState<DailySummary | null>(null);
  const [todos, setTodos] = useState<Todo[]>([]);
  const [habits, setHabits] = useState<Habit[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [newTodoText, setNewTodoText] = useState('');
  const [addingTodo, setAddingTodo] = useState(false);
  const [showAddHabit, setShowAddHabit] = useState(false);
  const [newHabitName, setNewHabitName] = useState('');
  const inputRef = useRef<TextInput>(null);

  const fetchData = useCallback(async () => {
    try {
      const resp = await fetch(`${API}/api/v1/daily/summary`);
      if (resp.ok) {
        const data: DailySummary = await resp.json();
        setSummary(data);
        setTodos(data.todos);
        setHabits(data.habits);
      }
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  }, [fetchData]);

  // ---- Todo Actions ----
  const addTodo = async () => {
    const text = newTodoText.trim();
    if (!text) return;
    setAddingTodo(true);
    try {
      const resp = await fetch(`${API}/api/v1/daily/todos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      if (resp.ok) {
        const todo = await resp.json();
        setTodos(prev => [...prev, todo]);
        setNewTodoText('');
        haptic.light();
      }
    } catch {}
    setAddingTodo(false);
  };

  const toggleTodo = async (id: number) => {
    try {
      const resp = await fetch(`${API}/api/v1/daily/todos/${id}/complete`, { method: 'POST' });
      if (resp.ok) {
        const updated = await resp.json();
        setTodos(prev => prev.map(t => t.id === id ? updated : t));
        updated.completed ? haptic.success() : haptic.warning();
      }
    } catch {}
  };

  const deleteTodo = (id: number, text: string) => {
    Alert.alert('Delete', `Remove "${text}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          try {
            await fetch(`${API}/api/v1/daily/todos/${id}`, { method: 'DELETE' });
            setTodos(prev => prev.filter(t => t.id !== id));
          } catch {}
        },
      },
    ]);
  };

  // ---- Habit Actions ----
  const toggleHabit = async (id: number) => {
    try {
      const resp = await fetch(`${API}/api/v1/daily/habits/${id}/toggle`, { method: 'POST' });
      if (resp.ok) {
        const updated = await resp.json();
        setHabits(prev => prev.map(h => h.id === id ? updated : h));
        updated.completed_today ? haptic.medium() : haptic.light();
      }
    } catch {}
  };

  const addHabit = async () => {
    const name = newHabitName.trim();
    if (!name) return;
    try {
      const resp = await fetch(`${API}/api/v1/daily/habits`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if (resp.ok) {
        const habit = await resp.json();
        setHabits(prev => [...prev, habit]);
        setNewHabitName('');
        setShowAddHabit(false);
        haptic.light();
      }
    } catch {}
  };

  const deleteHabit = (id: number, name: string) => {
    Alert.alert('Remove Habit', `Delete "${name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          try {
            await fetch(`${API}/api/v1/daily/habits/${id}`, { method: 'DELETE' });
            setHabits(prev => prev.filter(h => h.id !== id));
          } catch {}
        },
      },
    ]);
  };

  // Count progress
  const todosComplete = todos.filter(t => t.completed).length;
  const habitsComplete = habits.filter(h => h.completed_today).length;
  const totalItems = todos.length + habits.length;
  const totalComplete = todosComplete + habitsComplete;

  // ===== TODAY TAB =====
  const renderToday = () => (
    <ScrollView
      style={s.scroll}
      contentContainerStyle={s.scrollContent}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
    >
      {/* Header with date + progress */}
      <View style={s.header}>
        <View>
          <Text style={s.dateLabel}>
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </Text>
          <Text style={s.title}>Today</Text>
        </View>
        {totalItems > 0 && (
          <View style={s.progressPill}>
            <Text style={s.progressText}>{totalComplete}/{totalItems}</Text>
          </View>
        )}
      </View>

      {/* Quote card */}
      {summary && (
        <View style={s.quoteCard}>
          <Ionicons name="flame-outline" size={16} color={colors.accent} style={{ marginBottom: 6 }} />
          <Text style={s.quoteText}>"{summary.quote}"</Text>
          <Text style={s.quoteAuthor}>— {summary.quote_author}</Text>
        </View>
      )}

      {/* Workout + Recovery row */}
      {summary && (summary.workout_preview || summary.whoop_recovery != null) && (
        <View style={s.contextRow}>
          {summary.workout_preview && (
            <View style={[s.contextChip, {
              borderColor: (DAY_TYPE_COLORS[summary.workout_day_type || ''] || colors.accent) + '40',
            }]}>
              <Ionicons name="barbell-outline" size={14}
                color={DAY_TYPE_COLORS[summary.workout_day_type || ''] || colors.accent} />
              <Text style={s.contextText}>{summary.workout_preview}</Text>
            </View>
          )}
          {summary.whoop_recovery != null && (
            <View style={[s.contextChip, {
              borderColor: summary.whoop_recovery >= 67 ? '#10B98140'
                : summary.whoop_recovery >= 34 ? '#F59E0B40' : '#EF444440',
            }]}>
              <Ionicons name="heart-outline" size={14}
                color={summary.whoop_recovery >= 67 ? '#10B981'
                  : summary.whoop_recovery >= 34 ? '#F59E0B' : '#EF4444'} />
              <Text style={s.contextText}>{Math.round(summary.whoop_recovery)}% recovery</Text>
            </View>
          )}
        </View>
      )}

      {/* TODOS section */}
      <View style={s.sectionHeader}>
        <Ionicons name="checkbox-outline" size={16} color={colors.textSecondary} />
        <Text style={s.sectionTitle}>TASKS</Text>
        <Text style={s.sectionCount}>{todosComplete}/{todos.length}</Text>
      </View>

      {todos.map(todo => {
        const pillarColor = todo.pillar_name ? (PILLAR_COLORS[todo.pillar_name] || colors.accent) : null;
        return (
          <TouchableOpacity
            key={todo.id}
            style={s.todoRow}
            onPress={() => toggleTodo(todo.id)}
            onLongPress={() => deleteTodo(todo.id, todo.text)}
          >
            <View style={[
              s.todoCheck,
              todo.completed && { backgroundColor: colors.success, borderColor: colors.success },
            ]}>
              {todo.completed && <Ionicons name="checkmark" size={14} color="#fff" />}
            </View>
            <View style={s.todoContent}>
              <Text style={[s.todoText, todo.completed && s.todoTextDone]} numberOfLines={2}>
                {todo.text}
              </Text>
              {pillarColor && (
                <View style={[s.pillarTag, { backgroundColor: pillarColor + '15', borderColor: pillarColor + '30' }]}>
                  <View style={[s.pillarDot, { backgroundColor: pillarColor }]} />
                  <Text style={[s.pillarTagText, { color: pillarColor }]}>
                    {todo.pillar_name}
                  </Text>
                </View>
              )}
            </View>
          </TouchableOpacity>
        );
      })}

      {/* Quick add todo */}
      <View style={s.addRow}>
        <TextInput
          ref={inputRef}
          style={s.addInput}
          placeholder="Add a task..."
          placeholderTextColor={colors.textTertiary}
          value={newTodoText}
          onChangeText={setNewTodoText}
          onSubmitEditing={addTodo}
          returnKeyType="done"
        />
        {newTodoText.trim().length > 0 && (
          <TouchableOpacity style={s.addBtn} onPress={addTodo} disabled={addingTodo}>
            <Ionicons name="arrow-up-circle" size={28} color={colors.accent} />
          </TouchableOpacity>
        )}
      </View>

      {/* HABITS section */}
      <View style={[s.sectionHeader, { marginTop: spacing.xl }]}>
        <Ionicons name="flame-outline" size={16} color={colors.textSecondary} />
        <Text style={s.sectionTitle}>HABITS</Text>
        <Text style={s.sectionCount}>{habitsComplete}/{habits.length}</Text>
        <TouchableOpacity onPress={() => setShowAddHabit(!showAddHabit)} style={{ marginLeft: 'auto' }}>
          <Ionicons name={showAddHabit ? 'close' : 'add'} size={20} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>

      {showAddHabit && (
        <View style={s.addRow}>
          <TextInput
            style={s.addInput}
            placeholder="New habit name..."
            placeholderTextColor={colors.textTertiary}
            value={newHabitName}
            onChangeText={setNewHabitName}
            onSubmitEditing={addHabit}
            returnKeyType="done"
            autoFocus
          />
          {newHabitName.trim().length > 0 && (
            <TouchableOpacity style={s.addBtn} onPress={addHabit}>
              <Ionicons name="arrow-up-circle" size={28} color={colors.accent} />
            </TouchableOpacity>
          )}
        </View>
      )}

      {habits.map(habit => {
        const habitColor = habit.color || colors.accent;
        return (
          <TouchableOpacity
            key={habit.id}
            style={s.habitRow}
            onPress={() => toggleHabit(habit.id)}
            onLongPress={() => deleteHabit(habit.id, habit.name)}
          >
            <View style={[
              s.habitCircle,
              { borderColor: habitColor },
              habit.completed_today && { backgroundColor: habitColor, borderColor: habitColor },
            ]}>
              {habit.completed_today && <Ionicons name="checkmark" size={16} color="#fff" />}
            </View>
            <View style={s.habitInfo}>
              <Text style={[s.habitName, habit.completed_today && { color: colors.textTertiary }]}>
                {habit.name}
              </Text>
              {habit.current_streak > 0 && (
                <View style={s.streakBadge}>
                  <Ionicons name="flame" size={10} color="#F59E0B" />
                  <Text style={s.streakText}>{habit.current_streak}d</Text>
                </View>
              )}
            </View>
          </TouchableOpacity>
        );
      })}

      {habits.length === 0 && !showAddHabit && (
        <TouchableOpacity style={s.emptyHabits} onPress={() => setShowAddHabit(true)}>
          <Ionicons name="add-circle-outline" size={24} color={colors.textTertiary} />
          <Text style={s.emptyHabitsText}>Add your first daily habit</Text>
        </TouchableOpacity>
      )}

      <View style={{ height: 40 }} />
    </ScrollView>
  );

  return (
    <KeyboardAvoidingView
      style={s.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Sub-tab bar */}
      <View style={s.tabBar}>
        {(['today', 'checkin'] as SubTab[]).map(tab => (
          <TouchableOpacity
            key={tab}
            style={[s.tab, activeTab === tab && s.tabActive]}
            onPress={() => { setActiveTab(tab); haptic.selection(); }}
          >
            <Text style={[s.tabText, activeTab === tab && s.tabTextActive]}>
              {tab === 'today' ? 'Today' : 'Check-In'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {activeTab === 'today' ? renderToday() : <CheckInContent />}
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  scroll: { flex: 1 },
  scrollContent: { padding: spacing.lg, paddingTop: spacing.md },

  // Tab bar
  tabBar: {
    flexDirection: 'row', paddingHorizontal: spacing.lg,
    paddingTop: Platform.OS === 'ios' ? 60 : 40, paddingBottom: spacing.sm,
    backgroundColor: colors.bg, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  tab: { flex: 1, alignItems: 'center', paddingVertical: spacing.sm },
  tabActive: { borderBottomWidth: 2, borderBottomColor: colors.accent },
  tabText: { ...typography.bodyBold, color: colors.textTertiary },
  tabTextActive: { color: colors.accent },

  // Header
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: spacing.lg },
  dateLabel: { ...typography.caption, color: colors.textTertiary, marginBottom: 2 },
  title: { ...typography.title1, color: colors.text },
  progressPill: {
    backgroundColor: colors.card, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: spacing.md, paddingVertical: spacing.xs,
  },
  progressText: { ...typography.caption, color: colors.accent, fontWeight: '600', fontVariant: ['tabular-nums'] },

  // Quote
  quoteCard: {
    backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border,
    padding: spacing.lg, marginBottom: spacing.lg,
  },
  quoteText: { ...typography.body, color: colors.textSecondary, fontStyle: 'italic', lineHeight: 22, marginBottom: 8 },
  quoteAuthor: { ...typography.caption, color: colors.textTertiary },

  // Context row
  contextRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg, flexWrap: 'wrap' },
  contextChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: colors.card, borderRadius: radius.pill, borderWidth: 1,
    paddingHorizontal: spacing.md, paddingVertical: spacing.xs,
  },
  contextText: { ...typography.caption, color: colors.textSecondary },

  // Section
  sectionHeader: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    marginBottom: spacing.md,
  },
  sectionTitle: { ...typography.micro, color: colors.textTertiary, letterSpacing: 1 },
  sectionCount: { ...typography.micro, color: colors.textTertiary },

  // Todos
  todoRow: {
    flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 10,
    paddingHorizontal: spacing.sm, marginBottom: 2,
  },
  todoCheck: {
    width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center', marginRight: spacing.md, marginTop: 1,
  },
  todoContent: { flex: 1 },
  todoText: { fontSize: 15, color: colors.text, lineHeight: 22 },
  todoTextDone: { color: colors.textTertiary, textDecorationLine: 'line-through' },
  pillarTag: {
    flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start',
    paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4, borderWidth: 1, marginTop: 4,
  },
  pillarDot: { width: 5, height: 5, borderRadius: 2.5 },
  pillarTagText: { fontSize: 10, fontWeight: '600', letterSpacing: 0.3 },

  // Add row
  addRow: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card,
    borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: spacing.md, marginBottom: spacing.sm,
  },
  addInput: {
    flex: 1, paddingVertical: 14, fontSize: 15, color: colors.text,
    // @ts-ignore — web-only property to remove blue focus ring
    outlineStyle: 'none',
    outlineWidth: 0,
  } as any,
  addBtn: { marginLeft: spacing.sm },

  // Habits
  habitRow: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 10,
    paddingHorizontal: spacing.sm, marginBottom: 2,
  },
  habitCircle: {
    width: 26, height: 26, borderRadius: 13, borderWidth: 2,
    alignItems: 'center', justifyContent: 'center', marginRight: spacing.md,
  },
  habitInfo: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  habitName: { fontSize: 15, color: colors.text },
  streakBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 2,
    backgroundColor: 'rgba(245,158,11,0.1)', paddingHorizontal: 6, paddingVertical: 1, borderRadius: 8,
  },
  streakText: { fontSize: 10, color: '#F59E0B', fontWeight: '600' },

  emptyHabits: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
    paddingVertical: spacing.lg, opacity: 0.5,
  },
  emptyHabitsText: { ...typography.caption, color: colors.textTertiary },
});
