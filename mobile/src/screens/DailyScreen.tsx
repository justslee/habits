/**
 * Daily Screen — "Today" + "Check-In" sub-tabs
 *
 * Today: motivational quote, workout preview, smart todos, daily habits
 * Check-In: existing deep learning session logger
 */

import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput, StyleSheet,
  Platform, RefreshControl, KeyboardAvoidingView, Animated, Modal,
} from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { haptic } from '../utils/haptics';
import { colors, spacing, typography, radius, PILLAR_COLORS_BY_NAME } from '../theme';
import { API_URL, apiHeaders } from '../api/client';
import CheckInContent from './CheckInScreen';
import SwipeableRow from '../components/SwipeableRow';
import SwipeableTabs from '../components/SwipeableTabs';
import type { TabDef } from '../components/SwipeableTabs';
import UndoToast from '../components/UndoToast';
import ScreenBackground from '../components/ScreenBackground';
import { usePressScale } from '../hooks/usePressScale';

const TIME_ESTIMATES = [15, 30, 45, 60, 90];
const HABIT_ICONS: string[] = [
  'flame-outline', 'book-outline', 'barbell-outline', 'water-outline',
  'bed-outline', 'walk-outline', 'code-slash-outline', 'musical-notes-outline',
  'leaf-outline', 'heart-outline', 'medkit-outline', 'pencil-outline',
  'bulb-outline', 'fitness-outline', 'cafe-outline', 'bicycle-outline',
];
const HABIT_COLORS = [
  '#6366F1', '#8B5CF6', '#EC4899', '#EF4444', '#F59E0B',
  '#22C55E', '#06B6D4', '#3B82F6', '#F97316', '#10B981',
];

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

const DAY_TYPE_COLORS: Record<string, string> = {
  push: '#EF4444', pull: '#3B82F6', legs: '#10B981',
  rest: '#6B7280', cardio: '#F59E0B',
};

type SubTab = 'today' | 'checkin';

export default function DailyScreen() {
  const insets = useSafeAreaInsets();
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
  const [newHabitIcon, setNewHabitIcon] = useState<string>('flame-outline');
  const [newHabitColor, setNewHabitColor] = useState<string>(colors.accent);
  const [showIconPicker, setShowIconPicker] = useState(false);
  const [selectedTimeEstimate, setSelectedTimeEstimate] = useState<number | null>(null);
  const inputRef = useRef<TextInput>(null);

  // Edit modal state
  const [editingTodo, setEditingTodo] = useState<Todo | null>(null);
  const [editText, setEditText] = useState('');
  const [editMinutes, setEditMinutes] = useState<number | null>(null);

  // Undo toast state for swipe-to-delete
  const [undoToast, setUndoToast] = useState<{
    visible: boolean;
    message: string;
    type: 'todo' | 'habit';
    id: number;
    snapshot: Todo | Habit;
  }>({ visible: false, message: '', type: 'todo', id: 0, snapshot: {} as Todo });

  const handleUndo = useCallback(async () => {
    const { type, id, snapshot } = undoToast;
    setUndoToast(prev => ({ ...prev, visible: false }));
    if (type === 'todo') {
      // Re-add the todo locally
      setTodos(prev => [...prev, snapshot as Todo].sort((a, b) => a.sort_order - b.sort_order));
      // Re-create on server (POST the same text, server re-creates)
      try {
        const resp = await fetch(`${API_URL}/api/v1/daily/todos`, {
          method: 'POST',
          headers: apiHeaders(),
          body: JSON.stringify({ text: (snapshot as Todo).text }),
        });
        if (resp.ok) {
          // Refresh to get correct server IDs
          const data = await resp.json();
          setTodos(prev => prev.map(t => t.id === (snapshot as Todo).id ? data : t));
        }
      } catch (err) {
        console.warn('Failed to undo todo delete:', err);
      }
    } else {
      // Re-add the habit locally
      setHabits(prev => [...prev, snapshot as Habit].sort((a, b) => a.sort_order - b.sort_order));
      try {
        const resp = await fetch(`${API_URL}/api/v1/daily/habits`, {
          method: 'POST',
          headers: apiHeaders(),
          body: JSON.stringify({ name: (snapshot as Habit).name }),
        });
        if (resp.ok) {
          const data = await resp.json();
          setHabits(prev => prev.map(h => h.id === (snapshot as Habit).id ? data : h));
        }
      } catch (err) {
        console.warn('Failed to undo habit delete:', err);
      }
    }
    haptic.success();
  }, [undoToast]);

  const fetchData = useCallback(async () => {
    try {
      const resp = await fetch(`${API_URL}/api/v1/daily/summary`, { headers: apiHeaders() });
      if (resp.ok) {
        const data: DailySummary = await resp.json();
        setSummary(data);
        setTodos(data.todos);
        setHabits(data.habits);
      }
    } catch (err) {
      console.warn('Failed to load daily summary:', err);
    }
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
      const resp = await fetch(`${API_URL}/api/v1/daily/todos`, {
        method: 'POST',
        headers: apiHeaders(),
        body: JSON.stringify({ text, estimated_minutes: selectedTimeEstimate }),
      });
      if (resp.ok) {
        const todo = await resp.json();
        setTodos(prev => [...prev, todo]);
        setNewTodoText('');
        setSelectedTimeEstimate(null);
        haptic.light();
      }
    } catch (err) {
      console.warn('Failed to add todo:', err);
    }
    setAddingTodo(false);
  };

  const toggleTodo = async (id: number) => {
    try {
      const resp = await fetch(`${API_URL}/api/v1/daily/todos/${id}/complete`, {
        method: 'POST',
        headers: apiHeaders(),
      });
      if (resp.ok) {
        const updated = await resp.json();
        setTodos(prev => prev.map(t => t.id === id ? updated : t));
        updated.completed ? haptic.success() : haptic.warning();
      }
    } catch (err) {
      console.warn('Failed to toggle todo:', err);
    }
  };

  const deleteTodo = async (id: number, text: string) => {
    // Optimistic remove + show undo toast
    const snapshot = todos.find(t => t.id === id);
    if (!snapshot) return;
    setTodos(prev => prev.filter(t => t.id !== id));
    haptic.light();
    setUndoToast({ visible: true, message: `"${text}" deleted`, type: 'todo', id, snapshot });
    try {
      await fetch(`${API_URL}/api/v1/daily/todos/${id}`, { method: 'DELETE', headers: apiHeaders() });
    } catch (err) {
      // Restore on failure
      console.warn('Failed to delete todo:', err);
      setTodos(prev => [...prev, snapshot].sort((a, b) => a.sort_order - b.sort_order));
      setUndoToast(prev => ({ ...prev, visible: false }));
    }
  };

  // ---- Habit Actions ----
  const toggleHabit = async (id: number) => {
    try {
      const resp = await fetch(`${API_URL}/api/v1/daily/habits/${id}/toggle`, {
        method: 'POST',
        headers: apiHeaders(),
      });
      if (resp.ok) {
        const updated = await resp.json();
        setHabits(prev => prev.map(h => h.id === id ? updated : h));
        updated.completed_today ? haptic.medium() : haptic.light();
      }
    } catch (err) {
      console.warn('Failed to toggle habit:', err);
    }
  };

  const addHabit = async () => {
    const name = newHabitName.trim();
    if (!name) return;
    try {
      const resp = await fetch(`${API_URL}/api/v1/daily/habits`, {
        method: 'POST',
        headers: apiHeaders(),
        body: JSON.stringify({ name, icon: newHabitIcon, color: newHabitColor }),
      });
      if (resp.ok) {
        const habit = await resp.json();
        setHabits(prev => [...prev, habit]);
        setNewHabitName('');
        setNewHabitIcon('flame-outline');
        setNewHabitColor(colors.accent);
        setShowAddHabit(false);
        setShowIconPicker(false);
        haptic.light();
      }
    } catch (err) {
      console.warn('Failed to add habit:', err);
    }
  };

  const deleteHabit = async (id: number, name: string) => {
    // Optimistic remove + show undo toast
    const snapshot = habits.find(h => h.id === id);
    if (!snapshot) return;
    setHabits(prev => prev.filter(h => h.id !== id));
    haptic.light();
    setUndoToast({ visible: true, message: `"${name}" deleted`, type: 'habit', id, snapshot });
    try {
      await fetch(`${API_URL}/api/v1/daily/habits/${id}`, { method: 'DELETE', headers: apiHeaders() });
    } catch (err) {
      console.warn('Failed to delete habit:', err);
      setHabits(prev => [...prev, snapshot].sort((a, b) => a.sort_order - b.sort_order));
      setUndoToast(prev => ({ ...prev, visible: false }));
    }
  };

  // ---- Edit Todo ----
  const saveEditTodo = async () => {
    if (!editingTodo) return;
    const text = editText.trim();
    if (!text) return;
    try {
      const resp = await fetch(`${API_URL}/api/v1/daily/todos/${editingTodo.id}`, {
        method: 'PUT',
        headers: apiHeaders(),
        body: JSON.stringify({
          text,
          estimated_minutes: editMinutes,
          pillar_id: editingTodo.pillar_id,
          sort_order: editingTodo.sort_order,
        }),
      });
      if (resp.ok) {
        const updated = await resp.json();
        setTodos(prev => prev.map(t => t.id === editingTodo.id ? updated : t));
        haptic.success();
      }
    } catch (err) {
      console.warn('Failed to update todo:', err);
    }
    setEditingTodo(null);
  };

  // Tab definitions for SwipeableTabs
  const SUB_TABS: TabDef[] = [
    { key: 'today', label: 'Today' },
    { key: 'checkin', label: 'Check-In' },
  ];

  // Count progress
  const todosComplete = todos.filter(t => t.completed).length;
  const habitsComplete = habits.filter(h => h.completed_today).length;
  const totalItems = todos.length + habits.length;
  const totalComplete = todosComplete + habitsComplete;

  // ===== TODAY TAB =====
  const renderToday = () => (
    <ScrollView
      style={st.scroll}
      contentContainerStyle={st.scrollContent}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
    >
      {/* Header with date + progress */}
      <View style={st.header}>
        <View>
          <Text style={st.dateLabel}>
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </Text>
        </View>
        {totalItems > 0 && (
          <View style={st.progressPill}>
            <Text style={st.progressText}>{totalComplete}/{totalItems}</Text>
          </View>
        )}
      </View>

      {/* Quote card */}
      {summary && (
        <View style={st.quoteCard}>
          <Text style={st.quoteText}>"{summary.quote}"</Text>
          <Text style={st.quoteAuthor}>— {summary.quote_author}</Text>
        </View>
      )}

      {/* Workout + Recovery row */}
      {summary && (summary.workout_preview || summary.whoop_recovery != null) && (
        <View style={st.contextRow}>
          {summary.workout_preview && (
            <View style={[st.contextChip, {
              borderColor: (DAY_TYPE_COLORS[summary.workout_day_type || ''] || colors.accent) + '40',
            }]}>
              <Ionicons name="barbell-outline" size={14}
                color={DAY_TYPE_COLORS[summary.workout_day_type || ''] || colors.accent} />
              <Text style={st.contextText}>{summary.workout_preview}</Text>
            </View>
          )}
          {summary.whoop_recovery != null && (
            <View style={[st.contextChip, {
              borderColor: summary.whoop_recovery >= 67 ? '#10B98140'
                : summary.whoop_recovery >= 34 ? '#F59E0B40' : '#EF444440',
            }]}>
              <Ionicons name="heart-outline" size={14}
                color={summary.whoop_recovery >= 67 ? '#10B981'
                  : summary.whoop_recovery >= 34 ? '#F59E0B' : '#EF4444'} />
              <Text style={st.contextText}>{Math.round(summary.whoop_recovery)}% recovery</Text>
            </View>
          )}
        </View>
      )}

      {/* TODOS section */}
      <View style={st.sectionHeader}>
        <Ionicons name="checkbox-outline" size={16} color={colors.textSecondary} />
        <Text style={st.sectionTitle}>TASKS</Text>
        <Text style={st.sectionCount}>{todosComplete}/{todos.length}</Text>
      </View>

      {todos.map(todo => (
        <TodoRowCard
          key={todo.id}
          todo={todo}
          onToggle={() => toggleTodo(todo.id)}
          onDelete={() => deleteTodo(todo.id, todo.text)}
          onLongPress={() => {
            setEditingTodo(todo);
            setEditText(todo.text);
            setEditMinutes(todo.estimated_minutes);
            haptic.medium();
          }}
        />
      ))}

      {/* Quick add todo */}
      <View style={st.addRow}>
        <TextInput
          ref={inputRef}
          style={st.addInput}
          placeholder="Add a task..."
          placeholderTextColor={colors.textTertiary}
          value={newTodoText}
          onChangeText={setNewTodoText}
          onSubmitEditing={addTodo}
          returnKeyType="done"
        />
        {newTodoText.trim().length > 0 && (
          <TouchableOpacity style={st.addBtn} onPress={addTodo} disabled={addingTodo}>
            <Ionicons name="arrow-up-circle" size={28} color={colors.accent} />
          </TouchableOpacity>
        )}
      </View>

      {/* Time estimate pills */}
      {newTodoText.trim().length > 0 && (
        <View style={st.timeEstRow}>
          <Ionicons name="time-outline" size={14} color={colors.textTertiary} />
          {TIME_ESTIMATES.map(min => (
            <TouchableOpacity
              key={min}
              style={[st.timePill, selectedTimeEstimate === min && st.timePillActive]}
              onPress={() => { setSelectedTimeEstimate(selectedTimeEstimate === min ? null : min); haptic.selection(); }}
            >
              <Text style={[st.timePillText, selectedTimeEstimate === min && st.timePillTextActive]}>
                {min}m
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* HABITS section */}
      <View style={[st.sectionHeader, { marginTop: spacing.lg }]}>
        <Ionicons name="flame-outline" size={16} color={colors.textSecondary} />
        <Text style={st.sectionTitle}>HABITS</Text>
        <Text style={st.sectionCount}>{habitsComplete}/{habits.length}</Text>
        <TouchableOpacity onPress={() => { setShowAddHabit(!showAddHabit); haptic.selection(); }} style={{ marginLeft: 'auto' }}>
          <Ionicons name={showAddHabit ? 'close' : 'add'} size={20} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>

      {showAddHabit && (
        <>
          <View style={st.addRow}>
            <TouchableOpacity onPress={() => { setShowIconPicker(!showIconPicker); haptic.selection(); }}>
              <View style={[st.habitIconPreview, { backgroundColor: newHabitColor + '20', borderColor: newHabitColor + '40' }]}>
                <Ionicons name={newHabitIcon as any} size={16} color={newHabitColor} />
              </View>
            </TouchableOpacity>
            <TextInput
              style={st.addInput}
              placeholder="New habit name..."
              placeholderTextColor={colors.textTertiary}
              value={newHabitName}
              onChangeText={setNewHabitName}
              onSubmitEditing={addHabit}
              returnKeyType="done"
              autoFocus
            />
            {newHabitName.trim().length > 0 && (
              <TouchableOpacity style={st.addBtn} onPress={addHabit}>
                <Ionicons name="arrow-up-circle" size={28} color={colors.accent} />
              </TouchableOpacity>
            )}
          </View>
          {showIconPicker && (
            <View style={st.pickerCard}>
              {/* Icon grid */}
              <Text style={st.pickerLabel}>ICON</Text>
              <View style={st.iconGrid}>
                {HABIT_ICONS.map(icon => (
                  <TouchableOpacity
                    key={icon}
                    style={[st.iconCell, newHabitIcon === icon && { backgroundColor: newHabitColor + '25', borderColor: newHabitColor }]}
                    onPress={() => { setNewHabitIcon(icon); haptic.selection(); }}
                  >
                    <Ionicons name={icon as any} size={20} color={newHabitIcon === icon ? newHabitColor : colors.textTertiary} />
                  </TouchableOpacity>
                ))}
              </View>
              {/* Color row */}
              <Text style={[st.pickerLabel, { marginTop: spacing.md }]}>COLOR</Text>
              <View style={st.colorRow}>
                {HABIT_COLORS.map(c => (
                  <TouchableOpacity
                    key={c}
                    style={[st.colorDot, { backgroundColor: c }, newHabitColor === c && st.colorDotActive]}
                    onPress={() => { setNewHabitColor(c); haptic.selection(); }}
                  />
                ))}
              </View>
            </View>
          )}
        </>
      )}

      {habits.map(habit => (
        <HabitRowCard
          key={habit.id}
          habit={habit}
          onToggle={() => toggleHabit(habit.id)}
          onDelete={() => deleteHabit(habit.id, habit.name)}
        />
      ))}

      {habits.length === 0 && !showAddHabit && (
        <TouchableOpacity style={st.emptyHabits} onPress={() => setShowAddHabit(true)}>
          <Ionicons name="add-circle-outline" size={24} color={colors.textTertiary} />
          <Text style={st.emptyHabitsText}>Add your first daily habit</Text>
        </TouchableOpacity>
      )}

      <View style={{ height: 40 }} />
    </ScrollView>
  );

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ScreenBackground>
      <KeyboardAvoidingView
        style={st.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Sub-tab bar + swipeable content */}
        <View style={{ paddingTop: insets.top + spacing.xs, flex: 1 }}>
          <SwipeableTabs
            tabs={SUB_TABS}
            activeTab={activeTab}
            onTabChange={(key) => setActiveTab(key as SubTab)}
          >
            {(tab) => tab === 'today' ? renderToday() : <CheckInContent />}
          </SwipeableTabs>
        </View>

        {/* Edit todo modal */}
        <Modal
          visible={editingTodo !== null}
          transparent
          animationType="fade"
          onRequestClose={() => setEditingTodo(null)}
        >
          <KeyboardAvoidingView
            style={st.modalOverlay}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            <TouchableOpacity
              style={st.modalOverlay}
              activeOpacity={1}
              onPress={() => setEditingTodo(null)}
            >
              <TouchableOpacity activeOpacity={1} style={st.modalCard}>
                <Text style={st.modalTitle}>Edit Task</Text>

                {/* Text input */}
                <TextInput
                  style={st.modalInput}
                  value={editText}
                  onChangeText={setEditText}
                  placeholder="Task text..."
                  placeholderTextColor={colors.textTertiary}
                  autoFocus
                  multiline
                />

                {/* Time estimate picker */}
                <Text style={st.modalLabel}>TIME ESTIMATE</Text>
                <View style={st.timeEstRow}>
                  <Ionicons name="time-outline" size={14} color={colors.textTertiary} />
                  {TIME_ESTIMATES.map(min => (
                    <TouchableOpacity
                      key={min}
                      style={[st.timePill, editMinutes === min && st.timePillActive]}
                      onPress={() => { setEditMinutes(editMinutes === min ? null : min); haptic.selection(); }}
                    >
                      <Text style={[st.timePillText, editMinutes === min && st.timePillTextActive]}>
                        {min}m
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* Pillar badge (read-only) */}
                {editingTodo?.pillar_name && (() => {
                  const pColor = PILLAR_COLORS_BY_NAME[editingTodo.pillar_name!] || colors.accent;
                  return (
                    <View style={[st.pillarTag, { backgroundColor: pColor + '15', borderColor: pColor + '30', marginTop: spacing.sm, marginBottom: spacing.sm }]}>
                      <View style={[st.pillarDot, { backgroundColor: pColor }]} />
                      <Text style={[st.pillarTagText, { color: pColor }]}>
                        {editingTodo.pillar_name}
                      </Text>
                    </View>
                  );
                })()}

                {/* Action buttons */}
                <View style={st.modalActions}>
                  <TouchableOpacity style={st.modalCancelBtn} onPress={() => setEditingTodo(null)}>
                    <Text style={st.modalCancelText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={st.modalSaveBtn} onPress={saveEditTodo}>
                    <Text style={st.modalSaveText}>Save</Text>
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            </TouchableOpacity>
          </KeyboardAvoidingView>
        </Modal>

        {/* Undo toast for swipe-to-delete */}
        <UndoToast
          visible={undoToast.visible}
          message={undoToast.message}
          onUndo={handleUndo}
          onDismiss={() => setUndoToast(prev => ({ ...prev, visible: false }))}
        />
      </KeyboardAvoidingView>
      </ScreenBackground>
    </GestureHandlerRootView>
  );
}

/** Extracted so usePressScale hook can be called per-item. */
function TodoRowCard({ todo, onToggle, onDelete, onLongPress }: {
  todo: Todo; onToggle: () => void; onDelete: () => void;
  onLongPress: () => void;
}) {
  const { animStyle, onPressIn, onPressOut } = usePressScale(0.97);
  const pillarColor = todo.pillar_name ? (PILLAR_COLORS_BY_NAME[todo.pillar_name] || colors.accent) : null;
  return (
    <SwipeableRow onDelete={onDelete}>
      <Animated.View style={animStyle}>
        <TouchableOpacity
          style={st.todoRow}
          onPress={onToggle}
          onPressIn={onPressIn}
          onPressOut={onPressOut}
          onLongPress={onLongPress}
        >
          <View style={[
            st.todoCheck,
            todo.completed && { backgroundColor: colors.success, borderColor: colors.success },
          ]}>
            {todo.completed && <Ionicons name="checkmark" size={14} color="#fff" />}
          </View>
          <View style={st.todoContent}>
            <Text style={[st.todoText, todo.completed && st.todoTextDone]} numberOfLines={2}>
              {todo.text}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs, flexWrap: 'wrap' }}>
              {pillarColor && (
                <View style={[st.pillarTag, { backgroundColor: pillarColor + '15', borderColor: pillarColor + '30' }]}>
                  <View style={[st.pillarDot, { backgroundColor: pillarColor }]} />
                  <Text style={[st.pillarTagText, { color: pillarColor }]}>
                    {todo.pillar_name}
                  </Text>
                </View>
              )}
              {todo.estimated_minutes != null && todo.estimated_minutes > 0 && (
                <View style={st.estBadge}>
                  <Ionicons name="time-outline" size={10} color={colors.textTertiary} />
                  <Text style={st.estText}>{todo.estimated_minutes}m</Text>
                </View>
              )}
            </View>
          </View>
        </TouchableOpacity>
      </Animated.View>
    </SwipeableRow>
  );
}

/** Extracted so usePressScale hook can be called per-item. */
function HabitRowCard({ habit, onToggle, onDelete }: {
  habit: Habit; onToggle: () => void; onDelete: () => void;
}) {
  const { animStyle, onPressIn, onPressOut } = usePressScale(0.97);
  const habitColor = habit.color || colors.accent;
  const habitIcon = habit.icon || 'flame-outline';
  return (
    <SwipeableRow onDelete={onDelete}>
      <Animated.View style={animStyle}>
        <TouchableOpacity
          style={st.habitRow}
          onPress={onToggle}
          onPressIn={onPressIn}
          onPressOut={onPressOut}
        >
          <View style={[
            st.habitCircle,
            { borderColor: habitColor },
            habit.completed_today && { backgroundColor: habitColor, borderColor: habitColor },
          ]}>
            {habit.completed_today
              ? <Ionicons name="checkmark" size={16} color="#fff" />
              : <Ionicons name={habitIcon as any} size={14} color={habitColor} />
            }
          </View>
          <View style={st.habitInfo}>
            <Text style={[st.habitName, habit.completed_today && { color: colors.textTertiary }]}>
              {habit.name}
            </Text>
            {habit.current_streak > 0 && (
              <View style={st.streakBadge}>
                <Ionicons name="flame" size={10} color="#F59E0B" />
                <Text style={st.streakText}>{habit.current_streak}d</Text>
              </View>
            )}
          </View>
        </TouchableOpacity>
      </Animated.View>
    </SwipeableRow>
  );
}

const st = StyleSheet.create({
  container: { flex: 1 },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.xl },

  // Header
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: spacing.md },
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
    padding: spacing.lg, marginBottom: spacing.md,
  },
  quoteText: { ...typography.body, color: colors.textSecondary, fontStyle: 'italic', lineHeight: 22, marginBottom: 8 },
  quoteAuthor: { ...typography.caption, color: colors.textTertiary },

  // Context row
  contextRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md, flexWrap: 'wrap' },
  contextChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: colors.card, borderRadius: radius.pill, borderWidth: 1,
    paddingHorizontal: spacing.md, paddingVertical: spacing.xs,
  },
  contextText: { ...typography.caption, color: colors.textSecondary },

  // Section
  sectionHeader: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    marginBottom: spacing.sm,
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
    paddingHorizontal: spacing.md, marginTop: spacing.sm, marginBottom: spacing.sm,
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

  // Time estimate pills
  timeEstRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    marginBottom: spacing.md, marginTop: -spacing.xs, paddingHorizontal: spacing.xs,
  },
  timePill: {
    paddingHorizontal: spacing.md, paddingVertical: spacing.xs,
    borderRadius: radius.pill, backgroundColor: colors.card,
    borderWidth: 1, borderColor: colors.border,
  },
  timePillActive: {
    backgroundColor: colors.accentMuted, borderColor: colors.accent,
  },
  timePillText: { ...typography.micro, color: colors.textTertiary },
  timePillTextActive: { color: colors.accent },

  // Estimated time badge on todos
  estBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 2,
    paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4,
    backgroundColor: colors.card, marginTop: 4,
  },
  estText: { fontSize: 10, fontWeight: '500', color: colors.textTertiary },

  // Habit icon/color picker
  habitIconPreview: {
    width: 32, height: 32, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, marginRight: spacing.sm,
  },
  pickerCard: {
    backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border,
    padding: spacing.md, marginBottom: spacing.md,
  },
  pickerLabel: { ...typography.micro, color: colors.textTertiary, marginBottom: spacing.sm },
  iconGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm,
  },
  iconCell: {
    width: 40, height: 40, borderRadius: radius.sm,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.input, borderWidth: 1, borderColor: 'transparent',
  },
  colorRow: {
    flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap',
  },
  colorDot: {
    width: 28, height: 28, borderRadius: 14,
    borderWidth: 2, borderColor: 'transparent',
  },
  colorDotActive: {
    borderColor: '#fff', borderWidth: 3,
  },

  // Edit todo modal
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center', alignItems: 'center',
  },
  modalCard: {
    backgroundColor: colors.cardElevated, borderRadius: radius.xl,
    padding: spacing.xl, width: '88%', maxWidth: 400,
  },
  modalTitle: {
    ...typography.bodyBold, color: colors.text, fontSize: 18,
    marginBottom: spacing.md,
  },
  modalInput: {
    backgroundColor: colors.input, borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.border,
    padding: spacing.md, fontSize: 15, color: colors.text,
    minHeight: 48, maxHeight: 120, marginBottom: spacing.md,
    textAlignVertical: 'top',
  },
  modalLabel: {
    ...typography.micro, color: colors.textTertiary,
    marginBottom: spacing.sm, letterSpacing: 1,
  },
  modalActions: {
    flexDirection: 'row', justifyContent: 'flex-end',
    gap: spacing.sm, marginTop: spacing.lg,
  },
  modalCancelBtn: {
    paddingHorizontal: spacing.lg, paddingVertical: spacing.sm,
    borderRadius: radius.lg, backgroundColor: colors.card,
    borderWidth: 1, borderColor: colors.border,
  },
  modalCancelText: { ...typography.bodyBold, color: colors.textSecondary, fontSize: 14 },
  modalSaveBtn: {
    paddingHorizontal: spacing.lg, paddingVertical: spacing.sm,
    borderRadius: radius.lg, backgroundColor: colors.accent,
  },
  modalSaveText: { ...typography.bodyBold, color: '#fff', fontSize: 14 },
});
