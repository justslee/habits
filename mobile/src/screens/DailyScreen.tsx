/**
 * Daily Screen — single scrollable "Today" view
 *
 * Hero date header, blockquote, progress bar, unified habit+task list,
 * wrap-up prompt that opens CheckInModal as a bottom sheet.
 */

import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput, StyleSheet,
  Platform, RefreshControl, KeyboardAvoidingView, Animated, Modal,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import DraggableFlatList, { ScaleDecorator } from 'react-native-draggable-flatlist';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { haptic } from '../utils/haptics';
import { colors, spacing, typography, radius, fonts, PILLAR_COLORS_BY_NAME } from '../theme';
import { API_URL, apiHeaders } from '../api/client';
import SwipeableRow from '../components/SwipeableRow';
import UndoToast from '../components/UndoToast';
import ScreenBackground from '../components/ScreenBackground';
import { usePressScale } from '../hooks/usePressScale';
import CheckInModal from './CheckInModal';
import BottomSheet from '../components/BottomSheet';
import CompoundingHero from '../components/CompoundingHero';
import DailyQuoteCard from '../components/DailyQuoteCard';
import DailyReviewIsland from '../components/DailyReviewIsland';
import Topbar from '../components/Topbar';

const TIME_ESTIMATES = [15, 30, 60, 90, 120, 180, 240];

const formatTimePill = (min: number): string => {
  if (min < 60) return `${min}m`;
  const h = min / 60;
  return `${h}h`;
};
const HABIT_ICONS: string[] = [
  'flame-outline', 'book-outline', 'barbell-outline', 'water-outline',
  'bed-outline', 'walk-outline', 'code-slash-outline', 'musical-notes-outline',
  'leaf-outline', 'heart-outline', 'medkit-outline', 'pencil-outline',
  'bulb-outline', 'fitness-outline', 'cafe-outline', 'bicycle-outline',
];
const HABIT_COLORS = [
  '#9B8AE8', '#8B5CF6', '#EC4899', '#EF4444', '#F59E0B',
  '#22C55E', '#06B6D4', '#3B82F6', '#F97316', '#10B981',
];

// ── Types ──────────────────────────────────────────────────────────────────────

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
}

// ── Main Screen ────────────────────────────────────────────────────────────────

export default function DailyScreen() {
  const insets = useSafeAreaInsets();
  const [summary, setSummary] = useState<DailySummary | null>(null);
  const [todos, setTodos] = useState<Todo[]>([]);
  const [habits, setHabits] = useState<Habit[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  // True while the 1% chart is being scrubbed — freezes vertical scrolling so the
  // horizontal drag can't drag the page with it.
  const [chartScrubbing, setChartScrubbing] = useState(false);
  // True while a todo is being drag-reordered — freezes the page scroll so the
  // vertical drag doesn't scroll the whole screen.
  const [reordering, setReordering] = useState(false);
  const [newTodoText, setNewTodoText] = useState('');
  const [addingTodo, setAddingTodo] = useState(false);
  const [showAddHabit, setShowAddHabit] = useState(false);
  const [newHabitName, setNewHabitName] = useState('');
  const [newHabitIcon, setNewHabitIcon] = useState<string>('flame-outline');
  const [newHabitColor, setNewHabitColor] = useState<string>(colors.accent);
  const [showIconPicker, setShowIconPicker] = useState(false);
  const [selectedTimeEstimate, setSelectedTimeEstimate] = useState<number | null>(null);
  const [showCheckIn, setShowCheckIn] = useState(false);
  const [islandDismissed, setIslandDismissed] = useState(false);
  const inputRef = useRef<TextInput>(null);

  // Edit modal state
  const [editingTodo, setEditingTodo] = useState<Todo | null>(null);
  const [editText, setEditText] = useState('');
  const [editMinutes, setEditMinutes] = useState<number | null>(null);
  const [editPillarId, setEditPillarId] = useState<number | null>(null);
  // Pillar options for the edit picker — sourced from dashboard stats (which already
  // returns pillar_id + pillar_name), so no extra endpoint is needed.
  const [pillars, setPillars] = useState<{ id: number; name: string }[]>([]);

  // Undo toast state
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
      setTodos(prev => [...prev, snapshot as Todo].sort((a, b) => a.sort_order - b.sort_order));
      try {
        const resp = await fetch(`${API_URL}/api/v1/daily/todos`, {
          method: 'POST',
          headers: apiHeaders(),
          body: JSON.stringify({ text: (snapshot as Todo).text }),
        });
        if (resp.ok) {
          const data = await resp.json();
          setTodos(prev => prev.map(t => t.id === (snapshot as Todo).id ? data : t));
        }
      } catch (err) {
        console.warn('Failed to undo todo delete:', err);
      }
    } else {
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

  // Pillar options for the edit picker.
  useEffect(() => {
    (async () => {
      try {
        const resp = await fetch(`${API_URL}/api/v1/dashboard/stats`, { headers: apiHeaders() });
        if (!resp.ok) return;
        const data = await resp.json();
        const list = (data?.pillar_breakdown ?? [])
          .filter((p: any) => p?.pillar_id != null && p?.pillar_name)
          .map((p: any) => ({ id: p.pillar_id, name: p.pillar_name }));
        setPillars(list);
      } catch (err) {
        console.warn('Failed to load pillars:', err);
      }
    })();
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  }, [fetchData]);

  // ── Todo actions ─────────────────────────────────────────────────────────────

  const persistTodoOrder = useCallback(async (ordered: Todo[]) => {
    // Optimistic: the list already shows the new order; persist it. Reverts on failure.
    const prev = todos;
    setTodos(ordered);
    try {
      const resp = await fetch(`${API_URL}/api/v1/daily/todos/reorder`, {
        method: 'PUT',
        headers: apiHeaders(),
        body: JSON.stringify({ ids: ordered.map(t => t.id) }),
      });
      if (!resp.ok) throw new Error(`reorder ${resp.status}`);
    } catch (err) {
      console.warn('Failed to reorder todos:', err);
      setTodos(prev);
    }
  }, [todos]);


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
    const snapshot = todos.find(t => t.id === id);
    if (!snapshot) return;
    setTodos(prev => prev.filter(t => t.id !== id));
    haptic.light();
    setUndoToast({ visible: true, message: `"${text}" deleted`, type: 'todo', id, snapshot });
    try {
      await fetch(`${API_URL}/api/v1/daily/todos/${id}`, { method: 'DELETE', headers: apiHeaders() });
    } catch (err) {
      console.warn('Failed to delete todo:', err);
      setTodos(prev => [...prev, snapshot].sort((a, b) => a.sort_order - b.sort_order));
      setUndoToast(prev => ({ ...prev, visible: false }));
    }
  };

  // ── Habit actions ─────────────────────────────────────────────────────────────

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
          pillar_id: editPillarId,
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

  // ── Derived values ────────────────────────────────────────────────────────────

  const todosComplete = todos.filter(t => t.completed).length;
  const habitsComplete = habits.filter(h => h.completed_today).length;
  const totalItems = todos.length + habits.length;
  const totalComplete = todosComplete + habitsComplete;
  const allDone = totalItems > 0 && totalComplete === totalItems;

  const dateStr = new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  });

  const progressPct = totalItems > 0
    ? `${Math.min(100, Math.round((totalComplete / totalItems) * 100))}%`
    : '0%';

  // "Day N" of the compounding journey — derived from the longest active habit streak.
  // Falls back to total completions, then 1, so the hero never shows zero.
  const heroDay = (() => {
    if (habits.length === 0) return 1;
    const byStreak = Math.max(...habits.map(h => h.longest_streak || 0));
    if (byStreak > 0) return byStreak;
    const byTotal = Math.max(...habits.map(h => h.total_completions || 0));
    return Math.max(1, byTotal);
  })();

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ScreenBackground>
        <KeyboardAvoidingView
          style={st.container}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView
            style={st.scroll}
            contentContainerStyle={[st.scrollContent, { paddingTop: insets.top + spacing.md }]}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />
            }
            keyboardShouldPersistTaps="handled"
            // Hard-lock vertical scrolling while the 1% chart is being scrubbed
            // or a todo is being dragged, so neither drag moves the page.
            scrollEnabled={!chartScrubbing && !reordering}
          >
            {/* ── Topbar with brand mark + serif date + avatar ── */}
            <View style={{ marginHorizontal: -spacing.md }}>
              <Topbar
                title={dateStr}
                caption={summary?.workout_preview?.toUpperCase()}
              />
            </View>

            {/* ── Daily review island (shows after 9pm, before check-in) ── */}
            {!showCheckIn && new Date().getHours() >= 21 && totalComplete > 0 && (
              <DailyReviewIsland
                dismissed={islandDismissed || showCheckIn}
                onOpen={() => { setShowCheckIn(true); setIslandDismissed(true); haptic.medium(); }}
                onDismiss={() => setIslandDismissed(true)}
                meta={`day ${heroDay}`}
              />
            )}

            {/* ── Daily quote ── */}
            {summary && summary.quote && (
              <DailyQuoteCard quote={{ q: summary.quote, a: (summary.quote_author || '').toUpperCase() }} />
            )}

            {/* ── Compounding hero (interactive) ── */}
            <CompoundingHero day={heroDay} onScrubbingChange={setChartScrubbing} />

            {/* ── HABITS section — canvas: serif italic title + mono "N/M DONE · 🔥 STREAKING" ── */}
            <View style={st.sectionRow}>
              <Text style={st.sectionTitleSerif}>Habits</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={st.sectionMore}>
                  {habitsComplete}/{habits.length} DONE{habitsComplete > 0 ? ' · 🔥 STREAKING' : ''}
                </Text>
                <TouchableOpacity
                  onPress={() => { setShowAddHabit(!showAddHabit); haptic.selection(); }}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name={showAddHabit ? 'close' : 'add'} size={18} color={colors.textTertiary} />
                </TouchableOpacity>
              </View>
            </View>

            {habits.map(habit => (
              <HabitRowCard
                key={habit.id}
                habit={habit}
                onToggle={() => toggleHabit(habit.id)}
                onDelete={() => deleteHabit(habit.id, habit.name)}
              />
            ))}

            {habits.length === 0 && !showAddHabit && (
              <TouchableOpacity style={st.emptyRow} onPress={() => setShowAddHabit(true)}>
                <Ionicons name="add-circle-outline" size={18} color={colors.textTertiary} />
                <Text style={st.emptyRowText}>Add your first daily habit</Text>
              </TouchableOpacity>
            )}

            {/* Add habit inline */}
            {showAddHabit && (
              <>
                <View style={st.addRow}>
                  <TouchableOpacity onPress={() => { setShowIconPicker(!showIconPicker); haptic.selection(); }}>
                    <View style={[st.habitIconPreview, {
                      backgroundColor: newHabitColor + '20',
                      borderColor: newHabitColor + '40',
                    }]}>
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
                    <Text style={st.pickerLabel}>ICON</Text>
                    <View style={st.iconGrid}>
                      {HABIT_ICONS.map(icon => (
                        <TouchableOpacity
                          key={icon}
                          style={[
                            st.iconCell,
                            newHabitIcon === icon && {
                              backgroundColor: newHabitColor + '25',
                              borderColor: newHabitColor,
                            },
                          ]}
                          onPress={() => { setNewHabitIcon(icon); haptic.selection(); }}
                        >
                          <Ionicons
                            name={icon as any}
                            size={20}
                            color={newHabitIcon === icon ? newHabitColor : colors.textTertiary}
                          />
                        </TouchableOpacity>
                      ))}
                    </View>
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

            {/* ── ToDo section — canvas: serif italic title + mono swipe hint ── */}
            <View style={st.sectionRow}>
              <Text style={st.sectionTitleSerif}>ToDo</Text>
              <Text style={st.sectionMore}>
                {todos.length > 0 ? 'HOLD ⠿ TO REORDER · SWIPE TO DELETE' : `${todosComplete}/${todos.length}`}
              </Text>
            </View>

            <DraggableFlatList
              data={todos}
              keyExtractor={(t) => String(t.id)}
              scrollEnabled={false}
              activationDistance={12}
              containerStyle={{ overflow: 'visible' }}
              onDragBegin={() => { setReordering(true); haptic.medium(); }}
              onDragEnd={({ data }) => { setReordering(false); persistTodoOrder(data); }}
              renderItem={({ item, drag, isActive }) => (
                <ScaleDecorator activeScale={1.03}>
                  <TodoRowCard
                    todo={item}
                    drag={drag}
                    isActive={isActive}
                    onToggle={() => toggleTodo(item.id)}
                    onDelete={() => deleteTodo(item.id, item.text)}
                    onLongPress={() => {
                      setEditingTodo(item);
                      setEditText(item.text);
                      setEditMinutes(item.estimated_minutes);
                      setEditPillarId(item.pillar_id ?? null);
                      haptic.medium();
                    }}
                  />
                </ScaleDecorator>
              )}
            />

            {/* Quick add task */}
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

            {newTodoText.trim().length > 0 && (
              <View style={st.timeEstRow}>
                <Ionicons name="time-outline" size={14} color={colors.textTertiary} />
                {TIME_ESTIMATES.map(min => (
                  <TouchableOpacity
                    key={min}
                    style={[st.timePill, selectedTimeEstimate === min && st.timePillActive]}
                    onPress={() => {
                      setSelectedTimeEstimate(selectedTimeEstimate === min ? null : min);
                      haptic.selection();
                    }}
                  >
                    <Text style={[st.timePillText, selectedTimeEstimate === min && st.timePillTextActive]}>
                      {formatTimePill(min)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* ── Wrap Up Your Day prompt ── */}
            {totalComplete > 0 && (
              <TouchableOpacity
                style={st.wrapUpCard}
                onPress={() => { haptic.medium(); setShowCheckIn(true); }}
                activeOpacity={0.8}
              >
                <Text style={st.wrapUpEmoji}>🌙</Text>
                <View style={st.wrapUpContent}>
                  <Text style={st.wrapUpTitle}>WRAP UP YOUR DAY</Text>
                  <Text style={st.wrapUpSub}>
                    {totalComplete} of {totalItems} item{totalItems !== 1 ? 's' : ''} complete
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
              </TouchableOpacity>
            )}

            <View style={{ height: 48 }} />
          </ScrollView>

          {/* ── Edit todo sheet ── */}
          <BottomSheet visible={editingTodo !== null} onClose={() => setEditingTodo(null)} maxHeightPct={0.82}>
            <Text style={st.editEyebrow}>EDIT · TASK</Text>
            <Text style={st.editTitle}>Refine the task</Text>

            <TextInput
              style={st.editInput}
              value={editText}
              onChangeText={setEditText}
              placeholder="What needs doing?"
              placeholderTextColor={colors.textTertiary}
              multiline
            />

            <View style={st.editSectionHead}>
              <Ionicons name="time-outline" size={13} color={colors.textTertiary} />
              <Text style={st.editLabel}>TIME ESTIMATE</Text>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={st.chipRow}
            >
              {TIME_ESTIMATES.map(min => {
                const active = editMinutes === min;
                return (
                  <TouchableOpacity
                    key={min}
                    style={[st.chip, active && st.chipActiveAccent]}
                    onPress={() => { setEditMinutes(active ? null : min); haptic.selection(); }}
                  >
                    <Text style={[st.chipText, active && st.chipTextOnAccent]}>{formatTimePill(min)}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* Pillar picker — auto-classification is a suggestion, always overridable. */}
            <View style={st.editSectionHead}>
              <Ionicons name="layers-outline" size={13} color={colors.textTertiary} />
              <Text style={st.editLabel}>PILLAR</Text>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={st.chipRow}
            >
              {(() => {
                const active = editPillarId == null;
                return (
                  <TouchableOpacity
                    style={[st.chip, active && { backgroundColor: colors.textTertiary + '22', borderColor: colors.textSecondary }]}
                    onPress={() => { setEditPillarId(null); haptic.selection(); }}
                  >
                    <View style={[st.chipDot, { backgroundColor: colors.textSecondary }]} />
                    <Text style={[st.chipText, active && { color: colors.text }]}>Life</Text>
                  </TouchableOpacity>
                );
              })()}
              {pillars.map(p => {
                const pColor = PILLAR_COLORS_BY_NAME[p.name] || colors.accent;
                const active = editPillarId === p.id;
                return (
                  <TouchableOpacity
                    key={p.id}
                    style={[st.chip, active && { backgroundColor: pColor + '22', borderColor: pColor }]}
                    onPress={() => { setEditPillarId(p.id); haptic.selection(); }}
                  >
                    <View style={[st.chipDot, { backgroundColor: pColor }]} />
                    <Text style={[st.chipText, active && { color: pColor }]} numberOfLines={1}>{p.name}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <View style={st.editActions}>
              <TouchableOpacity style={st.editCancelBtn} onPress={() => { haptic.light(); setEditingTodo(null); }} activeOpacity={0.85}>
                <Text style={st.editCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={st.editSaveBtn} onPress={saveEditTodo} activeOpacity={0.85}>
                <Text style={st.editSaveText}>Save changes</Text>
              </TouchableOpacity>
            </View>
          </BottomSheet>

          <UndoToast
            visible={undoToast.visible}
            message={undoToast.message}
            onUndo={handleUndo}
            onDismiss={() => setUndoToast(prev => ({ ...prev, visible: false }))}
          />
        </KeyboardAvoidingView>
      </ScreenBackground>

      {/* ── Check-In bottom sheet ── */}
      <CheckInModal visible={showCheckIn} onClose={() => setShowCheckIn(false)} />
    </GestureHandlerRootView>
  );
}

// ── HabitRowCard ─── canvas card: 38px icon box · 2-line meta · 28px check · bottom bar
// Icon = first letter of habit.name in serif italic, tinted with the habit color.

const HABIT_PALETTE = [
  '#9B8AE8', // accent violet
  '#D89AD9', // accent-2 pink
  '#7DD3A4', // recovery green
  '#E0B775', // amber
  '#7AB0E8', // info blue
  '#F97316', // orange
];

function colorForHabit(h: Habit): string {
  if (h.color) return h.color;
  return HABIT_PALETTE[h.id % HABIT_PALETTE.length];
}

function HabitRowCard({ habit, onToggle, onDelete }: {
  habit: Habit; onToggle: () => void; onDelete: () => void;
}) {
  const { animStyle, onPressIn, onPressOut } = usePressScale(0.985);
  const habitColor = colorForHabit(habit);
  const glyph = (habit.name || '?').trim().charAt(0).toUpperCase();
  const cadence = habitCadenceLabel(habit);
  const target = habit.total_completions > 0 ? `${habit.total_completions}× total` : 'Daily rep';

  return (
    <SwipeableRow onDelete={onDelete}>
      <Animated.View style={animStyle}>
        <TouchableOpacity
          activeOpacity={0.85}
          style={[
            st.habitCard,
            habit.completed_today && st.habitCardDone,
          ]}
          onPress={onToggle}
          onPressIn={onPressIn}
          onPressOut={onPressOut}
        >
          {/* 38px icon box — tinted with habit color, holds first-letter glyph */}
          <View style={[
            st.habitIconBox,
            { backgroundColor: habitColor + '26', borderColor: habitColor + '4D' },
          ]}>
            <Text style={[st.habitGlyphSerif, { color: habitColor }]}>{glyph}</Text>
          </View>

          {/* Meta: serif name + mono sub-line (streak · target · cadence) */}
          <View style={st.habitMetaCol}>
            <Text
              numberOfLines={1}
              style={[st.habitNameNew, habit.completed_today && st.itemDoneText]}
            >
              {habit.name}
            </Text>
            <View style={st.habitSubRow}>
              {habit.current_streak > 0 && (
                <>
                  <Text style={[st.habitSubStreak, { color: colors.accent }]}>
                    🔥 {habit.current_streak}d
                  </Text>
                  <Text style={st.habitSubSep}>·</Text>
                </>
              )}
              <Text style={st.habitSubText}>{target}</Text>
              <Text style={st.habitSubSep}>·</Text>
              <Text style={st.habitSubText}>{cadence}</Text>
            </View>
          </View>

          {/* 28px circular check button */}
          <View style={[
            st.habitCheckBtn,
            habit.completed_today && { backgroundColor: habitColor, borderColor: habitColor },
          ]}>
            {habit.completed_today && (
              <Ionicons name="checkmark" size={14} color={colors.bg} />
            )}
          </View>

          {/* Bottom progress bar */}
          {habit.completed_today && (
            <View style={[st.habitProgressBar, { backgroundColor: habitColor }]} />
          )}
        </TouchableOpacity>
      </Animated.View>
    </SwipeableRow>
  );
}

function habitCadenceLabel(h: Habit): string {
  if (h.longest_streak >= 7) return 'Daily';
  return 'Daily';
}

// ── TodoRowCard ─── canvas card: dot · serif name · mono meta · 28px check

function TodoRowCard({ todo, onToggle, onDelete, onLongPress, drag, isActive }: {
  todo: Todo; onToggle: () => void; onDelete: () => void; onLongPress: () => void;
  drag?: () => void; isActive?: boolean;
}) {
  const { animStyle, onPressIn, onPressOut } = usePressScale(0.985);
  const pillarColor = todo.pillar_name
    ? (PILLAR_COLORS_BY_NAME[todo.pillar_name] || colors.accent)
    : colors.textTertiary;

  return (
    <SwipeableRow onDelete={onDelete}>
      <Animated.View style={animStyle}>
        <TouchableOpacity
          activeOpacity={0.85}
          style={[st.habitCard, todo.completed && st.habitCardDone, isActive && st.habitCardDragging]}
          onPress={onToggle}
          onPressIn={onPressIn}
          onPressOut={onPressOut}
          onLongPress={onLongPress}
        >
          {/* Drag handle — press & hold to reorder (keeps tap=complete, long-press=edit) */}
          {drag && (
            <TouchableOpacity
              onLongPress={drag}
              delayLongPress={140}
              hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
              style={st.dragHandle}
            >
              <Ionicons name="reorder-three-outline" size={20} color={colors.textTertiary} />
            </TouchableOpacity>
          )}

          {/* 38px dot/icon box */}
          <View style={[
            st.habitIconBox,
            { backgroundColor: pillarColor + '20', borderColor: pillarColor + '40' },
          ]}>
            <Text style={[st.todoGlyph, { color: pillarColor }]}>·</Text>
          </View>

          {/* Meta — task text + meta line */}
          <View style={st.habitMetaCol}>
            <Text
              numberOfLines={2}
              style={[st.habitNameNew, todo.completed && st.itemDoneText]}
            >
              {todo.text}
            </Text>
            <View style={st.habitSubRow}>
              {/* Untagged todos are "Life" — errands and general tasks that don't
                  ladder up to a learning pillar. */}
              <Text style={[st.habitSubText, { color: pillarColor }]}>
                {todo.pillar_name || 'Life'}
              </Text>
              <Text style={st.habitSubSep}>·</Text>
              {todo.estimated_minutes != null && todo.estimated_minutes > 0 && (
                <>
                  <Text style={st.habitSubText}>{todo.estimated_minutes}m</Text>
                  <Text style={st.habitSubSep}>·</Text>
                </>
              )}
              <Text style={st.habitSubText}>Today</Text>
            </View>
          </View>

          {/* 28px circular check */}
          <View style={[
            st.habitCheckBtn,
            todo.completed && { backgroundColor: colors.accent, borderColor: colors.accent },
          ]}>
            {todo.completed && (
              <Ionicons name="checkmark" size={14} color={colors.bg} />
            )}
          </View>

          {todo.completed && (
            <View style={[st.habitProgressBar, { backgroundColor: colors.accent }]} />
          )}
        </TouchableOpacity>
      </Animated.View>
    </SwipeableRow>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const st = StyleSheet.create({
  container: { flex: 1 },
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: spacing.md,
    paddingBottom: 140,
  },

  // ── Header ──
  header: { marginBottom: spacing.md },
  heroDate: {
    fontFamily: fonts.serifItalic,
    fontSize: 26,
    color: colors.text,
    letterSpacing: -0.5,
    marginBottom: 4,
  },
  contextLine: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  contextText: { ...typography.caption, color: colors.textTertiary },
  contextSep: { ...typography.caption, color: colors.textTertiary },
  recoveryDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    marginRight: 4,
  },

  // ── Quote blockquote ──
  quoteBlock: {
    flexDirection: 'row',
    backgroundColor: 'rgba(155,138,232,0.04)',
    borderRadius: radius.sm,
    marginBottom: spacing.lg,
    overflow: 'hidden',
  },
  quoteBorder: {
    width: 2,
    backgroundColor: colors.accent,
    borderRadius: 1,
  },
  quoteText: {
    ...typography.body,
    color: colors.textSecondary,
    fontStyle: 'italic',
    lineHeight: 22,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: 6,
  },
  quoteAuthor: {
    ...typography.caption,
    color: colors.textTertiary,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
  },

  // ── Progress bar ──
  progressContainer: { marginBottom: spacing.lg },
  progressLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  progressLeft: { ...typography.caption, color: colors.textTertiary },
  progressRight: { ...typography.caption, color: colors.accent, fontWeight: '700' },
  progressTrack: {
    height: 3,
    backgroundColor: colors.border,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: 3,
    borderRadius: 2,
  },

  // ── Canvas section header: serif italic title + mono "more" line
  sectionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 22,
    marginBottom: 10,
    paddingHorizontal: 0,
  },
  sectionTitleSerif: {
    fontFamily: fonts.serifItalic,
    fontSize: 22,
    color: colors.text,
    letterSpacing: -0.5,
  },
  sectionMore: {
    fontFamily: fonts.mono,
    fontSize: 10,
    color: colors.textTertiary,
    letterSpacing: 1.6,
  },

  // ── Section dividers (legacy) ──
  sectionDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  sectionLabel: {
    fontFamily: fonts.mono,
    fontSize: 10,
    color: colors.textTertiary,
    letterSpacing: 1.8,
  },
  sectionLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.border,
  },
  sectionCount: { fontFamily: fonts.mono, fontSize: 10, color: colors.textTertiary, letterSpacing: 0.8 },
  sectionAddBtn: { padding: 2 },

  // ── Completed item dimming ──
  completedRow: { opacity: 0.35 },
  itemDoneText: { textDecorationLine: 'line-through', color: colors.textTertiary },

  // ── Habit rows ──
  // ── Canvas habit/todo card ──
  habitCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: radius.xl,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    marginBottom: 10,
    position: 'relative',
    overflow: 'hidden',
  },
  habitCardDragging: {
    borderColor: colors.accent,
    backgroundColor: colors.cardElevated,
  },
  dragHandle: {
    paddingRight: 2,
    marginLeft: -4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  habitCardDone: {
    backgroundColor: colors.surface2,
  },
  habitIconBox: {
    width: 38,
    height: 38,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  todoGlyph: {
    fontFamily: fonts.serifItalic,
    fontSize: 22,
    lineHeight: 22,
  },
  habitGlyphSerif: {
    fontFamily: fonts.serifItalic,
    fontSize: 18,
    lineHeight: 20,
    letterSpacing: -0.3,
  },
  habitMetaCol: {
    flex: 1,
    gap: 4,
    minWidth: 0,
  },
  habitNameNew: {
    fontSize: 15,
    color: colors.text,
    fontFamily: fonts.regular,
    letterSpacing: -0.1,
  },
  habitSubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  habitSubText: {
    fontFamily: fonts.mono,
    fontSize: 10,
    color: colors.textTertiary,
    letterSpacing: 0.6,
  },
  habitSubStreak: {
    fontFamily: fonts.mono,
    fontSize: 10,
    letterSpacing: 0,
  },
  habitSubSep: {
    fontFamily: fonts.mono,
    fontSize: 10,
    color: colors.textTertiary,
    opacity: 0.4,
  },
  habitCheckBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  habitProgressBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 2,
  },

  // ── Legacy habit row (kept for backward refs in styles only) ──
  habitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: spacing.xs,
    marginBottom: 2,
  },
  habitCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
    flexShrink: 0,
  },
  habitName: {
    flex: 1,
    fontSize: 15,
    color: colors.text,
    fontFamily: 'Inter_400Regular',
  },
  streakBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    marginLeft: spacing.sm,
  },
  streakFire: { fontSize: 12 },
  streakText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#F59E0B',
  },

  // ── Todo rows ──
  todoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: spacing.xs,
    marginBottom: 2,
  },
  todoCheck: {
    width: 20,
    height: 20,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
    flexShrink: 0,
    backgroundColor: 'transparent',
  },
  todoText: {
    flex: 1,
    fontSize: 15,
    color: colors.text,
    lineHeight: 22,
    fontFamily: 'Inter_400Regular',
  },
  todoMeta: {
    alignItems: 'flex-end',
    gap: 4,
    marginLeft: spacing.sm,
    flexShrink: 0,
    maxWidth: 90,
  },
  pillarTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
  },
  pillarDot: { width: 5, height: 5, borderRadius: 2.5, flexShrink: 0 },
  pillarTagText: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.2,
    flexShrink: 1,
  },
  estBadge: {
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: colors.card,
  },
  estText: { fontSize: 10, fontWeight: '500', color: colors.textTertiary },

  // ── Add row ──
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
  },
  addInput: {
    flex: 1,
    paddingVertical: 14,
    fontSize: 15,
    color: colors.text,
    outlineStyle: 'none',
    outlineWidth: 0,
  } as any,
  addBtn: { marginLeft: spacing.sm },

  // ── Time estimate pills ──
  timeEstScroll: {
    marginBottom: spacing.md,
    marginTop: -spacing.xs,
  },
  timeEstRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.xs,
    paddingRight: spacing.lg,
  },
  timePill: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  timePillActive: {
    backgroundColor: colors.accentMuted,
    borderColor: colors.accent,
  },
  timePillText: { ...typography.micro, color: colors.textTertiary },
  timePillTextActive: { color: colors.accent },

  // ── Habit icon/color picker ──
  habitIconPreview: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    marginRight: spacing.sm,
  },
  pickerCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  pickerLabel: { ...typography.micro, color: colors.textTertiary, marginBottom: spacing.sm },
  iconGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  iconCell: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.input,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  colorRow: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  colorDot: { width: 28, height: 28, borderRadius: 14, borderWidth: 2, borderColor: 'transparent' },
  colorDotActive: { borderColor: '#fff', borderWidth: 3 },

  // ── Empty state ──
  emptyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    opacity: 0.5,
  },
  emptyRowText: { ...typography.caption, color: colors.textTertiary },

  // ── Wrap Up prompt ──
  wrapUpCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderFocus,
    padding: spacing.md,
    marginTop: spacing.lg,
    gap: spacing.md,
  },
  wrapUpEmoji: { fontSize: 24 },
  wrapUpContent: { flex: 1 },
  wrapUpTitle: {
    ...typography.micro,
    color: colors.accent,
    letterSpacing: 1,
    marginBottom: 2,
  },
  wrapUpSub: { ...typography.caption, color: colors.textSecondary },

  // ── Edit todo modal ──
  // ── Edit-task sheet ──────────────────────────────────────────────────────
  editEyebrow: {
    fontFamily: fonts.mono,
    fontSize: 10,
    color: colors.textTertiary,
    letterSpacing: 2.2,
  },
  editTitle: {
    fontFamily: fonts.serifItalic,
    fontSize: 26,
    color: colors.text,
    letterSpacing: -0.6,
    marginTop: 4,
    marginBottom: spacing.lg,
  },
  editInput: {
    backgroundColor: colors.input,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
    fontFamily: fonts.regular,
    fontSize: 16,
    lineHeight: 22,
    color: colors.text,
    minHeight: 64,
    maxHeight: 140,
    textAlignVertical: 'top',
  },
  editSectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  editLabel: {
    fontFamily: fonts.mono,
    fontSize: 10,
    color: colors.textTertiary,
    letterSpacing: 1.8,
  },
  chipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingRight: spacing.lg,
    paddingVertical: 2,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.bg2,
  },
  chipActiveAccent: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  chipText: {
    fontFamily: fonts.mono,
    fontSize: 12,
    letterSpacing: 0.6,
    color: colors.textSecondary,
  },
  chipTextOnAccent: {
    color: colors.bg,
    fontWeight: '700',
  },
  chipDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  editActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.xl,
  },
  editCancelBtn: {
    flex: 1,
    paddingVertical: 15,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.bg2,
    alignItems: 'center',
  },
  editCancelText: {
    fontFamily: fonts.mono,
    fontSize: 12,
    letterSpacing: 1.4,
    color: colors.textSecondary,
  },
  editSaveBtn: {
    flex: 1.6,
    paddingVertical: 15,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
    alignItems: 'center',
  },
  editSaveText: {
    fontFamily: fonts.mono,
    fontSize: 12,
    letterSpacing: 1.4,
    fontWeight: '700',
    color: colors.bg,
  },
});
