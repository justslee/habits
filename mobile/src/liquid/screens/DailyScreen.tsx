/**
 * Daily — the next good thing, the rituals, and one task that matters.
 *
 * Per the design notes, Daily is focused on immediate action: the compounding chart lives in
 * North Star, one tap away. The hero holds the next training action and takes a hold gesture
 * to fit the session into the day.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated from 'react-native-reanimated';
import { useFocusEffect } from '@react-navigation/native';
import {
  DailySummaryData, HabitData, TodoData, TrainToday,
  PillarStats, completeTodo, createHabit, createTodo, deleteHabit, deleteTodo, getDailySummary,
  getDashboardStats, getTrainToday, startTrainToday, toggleHabitToday, updateHabit, updateTodo,
} from '../../api/client';
import { useTheme } from '../theme';
import { useRefreshOn } from '../refresh';
import { fonts } from '../tokens';
import { feel } from '../haptics';
import { Screen } from '../ui/Screen';
import { Body, DailyTitle, Em, Eyebrow, Small, Subtitle } from '../ui/Text';
import { fonts as liquidFonts, radius } from '../tokens';
import { Button, IconButton, InlineButton, Options } from '../ui/Button';
import { Hero, HeroActions, Hint, Notice, Section, TopBar } from '../ui/Surfaces';
import { SwipeRow } from '../ui/SwipeRow';
import { useSheet } from '../ui/Sheet';
import { useToast } from '../ui/Toast';
import { AdjustSheet } from '../sheets/AdjustSheet';

function greeting(): string {
  const h = new Date().getHours();
  return h < 12 ? 'Morning' : h < 18 ? 'Afternoon' : 'Evening';
}

const today = () =>
  new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

/** A short name for the hero's one-line caption: "Session 3 · 70 minutes". */
function sessionLabel(session: string): string {
  if (/^S\d$/.test(session)) return `Session ${session.slice(1)}`;
  if (session === 'RUN') return 'Your run';
  if (session === 'MOB') return 'Mobility';
  if (session.startsWith('T-')) return 'Tournament week';
  return session;
}

export default function DailyScreen({ navigation }: any) {
  const { c } = useTheme();
  const sheet = useSheet();
  const toast = useToast();
  const [summary, setSummary] = useState<DailySummaryData | null>(null);
  const [train, setTrain] = useState<TrainToday | null>(null);
  const [pillars, setPillars] = useState<PillarStats[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [starting, setStarting] = useState(false);

  const load = useCallback(async () => {
    const [s, t, d] = await Promise.allSettled([getDailySummary(), getTrainToday(), getDashboardStats()]);
    if (s.status === 'fulfilled') setSummary(s.value);
    if (t.status === 'fulfilled') setTrain(t.value);
    if (d.status === 'fulfilled') setPillars(d.value.pillar_breakdown);
  }, []);

  useEffect(() => { load(); }, [load]);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  // A sheet never blurs the screen, so a coach change has to say so itself.
  useRefreshOn(load);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const habits = summary?.habits ?? [];
  const done = habits.filter(h => h.completed_today).length;
  const open = (summary?.todos ?? []).filter(t => !t.completed);
  const focus = open[0] ?? summary?.todos?.[0] ?? null;
  const p = train?.prescription ?? null;

  const toggle = useCallback(async (habit: HabitData) => {
    const was = habit.completed_today;
    setSummary(prev => prev && {
      ...prev,
      habits: prev.habits.map(h => (h.id === habit.id ? { ...h, completed_today: !was } : h)),
    });
    feel[was ? 'selection' : 'light']();
    try {
      await toggleHabitToday(habit.id);
      toast.show(was ? 'Ritual marked incomplete' : 'A good thing, done.', async () => {
        setSummary(prev => prev && {
          ...prev,
          habits: prev.habits.map(h => (h.id === habit.id ? { ...h, completed_today: was } : h)),
        });
        await toggleHabitToday(habit.id).catch(() => {});
      });
    } catch {
      setSummary(prev => prev && {
        ...prev,
        habits: prev.habits.map(h => (h.id === habit.id ? { ...h, completed_today: was } : h)),
      });
      toast.show('That didn’t save. Check the connection.');
    }
  }, [toast]);

  const options = useCallback((habit: HabitData) => {
    sheet.open(habit.name, () => (
      <RitualSheet
        habit={habit}
        onToggle={() => { sheet.close(); toggle(habit); }}
        onDone={() => { sheet.close(); load(); }}
      />
    ));
  }, [sheet, toggle, load]);

  const addRitual = useCallback(() => {
    sheet.open('A new ritual.', () => (
      <RitualSheet onDone={() => { sheet.close(); load(); }} />
    ));
  }, [sheet, load]);

  // The endpoint toggles, so the same tap marks something done and undoes it.
  const toggleTodo = useCallback(async (t: TodoData) => {
    const next = !t.completed;
    feel[next ? 'light' : 'selection']();
    setSummary(prev => prev && { ...prev, todos: prev.todos.map(x => (x.id === t.id ? { ...x, completed: next } : x)) });
    try {
      await completeTodo(t.id);
      toast.show(next ? 'One meaningful thing, done.' : 'Back on today’s list.');
    } catch {
      setSummary(prev => prev && { ...prev, todos: prev.todos.map(x => (x.id === t.id ? { ...x, completed: !next } : x)) });
      toast.show('That didn’t save.');
    }
  }, [toast]);

  const openTodo = useCallback((t: TodoData) => {
    sheet.open('This intention.', () => (
      <TodoDetailSheet todo={t} pillars={pillars} onToggle={() => toggleTodo(t)} onChanged={load} />
    ));
  }, [sheet, pillars, toggleTodo, load]);

  const start = useCallback(async () => {
    setStarting(true);
    try {
      const r = await startTrainToday();
      navigation.navigate('Train', { screen: 'Session', params: { sessionId: r.session_id } });
    } catch (err: any) {
      toast.show(String(err?.message ?? err).replace(/^API \d+: /, '').replace(/^\{"detail":"|"\}$/g, ''));
    } finally {
      setStarting(false);
    }
  }, [navigation, toast]);

  const addTodo = useCallback(() => {
    sheet.open('One thing that matters.', () => (
      <AddTodoSheet onAdded={load} />
    ));
  }, [sheet, load]);

  const allTodos = useCallback(() => {
    sheet.open('Today’s list.', () => (
      <TodoListSheet todos={summary?.todos ?? []} onChanged={load} />
    ));
  }, [sheet, summary, load]);

  const adjust = useCallback(() => {
    sheet.open('Make today fit.', () => <AdjustSheet onDone={load} />);
  }, [sheet, load]);

  return (
    <Screen contextKey="daily" onRefresh={refresh} refreshing={refreshing}>
      <TopBar label={today()} onProfile={() => navigation.navigate('Me')} />
      <DailyTitle>
        {greeting()}, <Em>Justin.</Em>
      </DailyTitle>
      {summary?.quote ? (
        <View style={s.epigraph}>
          <Animated.Text style={[s.quoteText, { color: c.muted }]} numberOfLines={3}>
            “{summary.quote}”
          </Animated.Text>
          <Small style={{ marginTop: 4 }}>{summary.quote_author}</Small>
        </View>
      ) : null}

      <Hero compact onHold={p ? adjust : undefined} style={{ marginTop: 17 }}>
        <Eyebrow style={{ marginBottom: 9 }}>Your next good thing</Eyebrow>
        <Subtitle style={{ maxWidth: 220, fontSize: 27, lineHeight: 27 * 1.08 }}>
          {p ? 'A stronger body.\nA clearer mind.' : 'Rest is the work\nsome days.'}
        </Subtitle>
        <Body style={{ marginTop: 7, maxWidth: 215 }} numberOfLines={2}>
          {p
            ? `${sessionLabel(p.session)} · ${p.target_minutes[1]} minutes`
            : train?.day?.label ?? 'Golf, mobility, or a walk.'}
        </Body>
        <HeroActions compact>
          {p && p.session !== 'MOB' ? (
            <>
              <Button
                label={train?.status === 'completed' ? 'View session' : starting ? 'Starting…' : 'Start session'}
                iconAfter="arrow-forward"
                iconAfterRotate={-45}
                haptic="light"
                disabled={starting}
                onPress={train?.status === 'completed'
                  ? () => navigation.navigate('Train')
                  : start}
              />
              <IconButton
                icon="ellipsis-horizontal"
                accessibilityLabel="Adjust today’s workout"
                background={c.panel2}
                haptic="soft"
                onPress={adjust}
              />
            </>
          ) : (
            <Button label="Open Train" kind="secondary" iconAfter="arrow-forward" onPress={() => navigation.navigate('Train')} />
          )}
        </HeroActions>
      </Hero>

      <Section
        title="Daily rituals"
        trailing={
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            <Small>{done} of {habits.length} done</Small>
            <InlineButton label="Add" icon="add" onPress={addRitual} />
          </View>
        }
      />
      {habits.map(h => (
        <SwipeRow
          key={h.id}
          title={h.name}
          subtitle={
            h.completed_today
              ? 'Done today'
              : h.total_completions
                ? `${h.total_completions} times so far`
                : 'Make it effortless'
          }
          tail={h.current_streak ? `${h.current_streak} days` : h.longest_streak ? `best ${h.longest_streak}d` : undefined}
          done={h.completed_today}
          onToggle={() => toggle(h)}
          onOptions={() => options(h)}
        />
      ))}
      {habits.length === 0 ? <Body style={{ marginTop: 6 }}>No rituals yet.</Body> : <Hint>Swipe to complete · hold for options</Hint>}

      <Section
        title="Intentions"
        style={{ marginTop: 24, marginBottom: 2 }}
        trailing={<InlineButton label="+ Add" onPress={addTodo} />}
      />
      <Small style={{ marginBottom: 4 }}>The one thing that would make today count.</Small>
      {focus ? (
        <View style={[s.task, { borderTopColor: c.line }]}>
          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: focus.completed }}
            accessibilityLabel={`${focus.text}. ${focus.completed ? 'Done' : 'Not done'}. Double tap to toggle.`}
            onPress={() => toggleTodo(focus)}
            hitSlop={8}
            style={s.taskCheck}
          >
            <Ionicons
              name={focus.completed ? 'checkmark-circle' : 'ellipse-outline'}
              size={26}
              color={focus.completed ? c.accent : c.muted}
            />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Open ${focus.text}`}
            onPress={() => openTodo(focus)}
            style={{ flex: 1 }}
          >
            <Animated.Text
              style={[s.taskText, { color: focus.completed ? c.muted : c.fg, textDecorationLine: focus.completed ? 'line-through' : 'none' }]}
              numberOfLines={2}
            >
              {focus.text}
            </Animated.Text>
            <View style={s.taskMeta}>
              {focus.pillar_name ? (
                <View style={[s.pill, { backgroundColor: c.soft }]}>
                  <Small style={{ color: c.accent, fontSize: 10.5 }}>{focus.pillar_name}</Small>
                </View>
              ) : null}
              {focus.estimated_minutes ? <Small>{focus.estimated_minutes} min</Small> : null}
            </View>
          </Pressable>
          <Ionicons name="chevron-forward" size={16} color={c.muted} />
        </View>
      ) : (
        <Pressable accessibilityRole="button" onPress={addTodo} style={[s.task, { borderTopColor: c.line }]}>
          <Ionicons name="add-circle-outline" size={18} color={c.muted} />
          <Body style={{ flex: 1 }}>Nothing set for today. Add one.</Body>
        </Pressable>
      )}
      {open.length > 1 ? (
        <Pressable accessibilityRole="button" onPress={allTodos} style={[s.more, { borderTopColor: c.line }]}>
          <Small style={{ flex: 1 }}>{open.length - 1} more on today’s list</Small>
          <Ionicons name="chevron-forward" size={14} color={c.muted} />
        </Pressable>
      ) : null}

    </Screen>
  );
}

/** Adding a task: text, and the time it deserves. */
function AddTodoSheet({ onAdded }: { onAdded: () => void }) {
  const { c } = useTheme();
  const sheet = useSheet();
  const toast = useToast();
  const [text, setText] = useState('');
  const [minutes, setMinutes] = useState<number>(45);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!text.trim() || busy) return;
    setBusy(true);
    try {
      await createTodo({ text: text.trim(), estimated_minutes: minutes });
      feel.light();
      sheet.close();
      toast.show('Added to today.');
      onAdded();
    } catch (err: any) {
      toast.show(String(err?.message ?? err).replace(/^API \d+: /, '').slice(0, 120));
    } finally { setBusy(false); }
  };

  return (
    <View>
      <Body>The one thing that would make today count.</Body>
      <TextInput
        style={[s.input, { backgroundColor: c.bg, borderColor: c.line, color: c.fg }]}
        value={text}
        onChangeText={setText}
        placeholder="Ship the evaluation flow"
        placeholderTextColor={c.muted}
        autoFocus
        multiline
        onSubmitEditing={save}
      />
      <Small>How long will it take?</Small>
      <Options
        values={[10, 15, 20, 30, 45, 60, 90, 120, 180]}
        selected={minutes}
        onSelect={setMinutes}
        labels={n => (n >= 60 ? `${n / 60}h${n % 60 ? ` ${n % 60}m` : ''}` : `${n} min`)}
      />
      <Button full label={busy ? 'Adding…' : 'Add to today'} haptic="none" disabled={!text.trim() || busy} onPress={save} />
    </View>
  );
}

/** The whole list, when today holds more than one thing. */
/**
 * A ritual, up close: rename it, mark it, or remove it.
 *
 * Removing takes its record with it rather than leaving logs pointing at something that no
 * longer exists, so it asks once before it does. With no habit passed, the same sheet creates
 * one, which keeps naming a ritual and renaming it the same small form.
 */
function RitualSheet({
  habit, onToggle, onDone,
}: {
  habit?: HabitData;
  onToggle?: () => void;
  onDone: () => void;
}) {
  const { c } = useTheme();
  const toast = useToast();
  const [name, setName] = useState(habit?.name ?? '');
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const clean = name.trim();
  const renamed = !!habit && clean.length > 0 && clean !== habit.name;

  const save = useCallback(async () => {
    if (!clean || busy) return;
    setBusy(true);
    try {
      if (habit) await updateHabit(habit.id, { name: clean });
      else await createHabit({ name: clean });
      feel.light();
      onDone();
    } catch (err: any) {
      toast.show(String(err?.message ?? err).replace(/^API \d+: /, '').slice(0, 120) || 'That didn’t save.');
      setBusy(false);
    }
  }, [clean, busy, habit, onDone, toast]);

  const remove = useCallback(async () => {
    if (!habit || busy) return;
    setBusy(true);
    try {
      await deleteHabit(habit.id);
      feel.soft();
      onDone();
    } catch (err: any) {
      toast.show(String(err?.message ?? err).replace(/^API \d+: /, '').slice(0, 120) || 'That didn’t save.');
      setBusy(false);
    }
  }, [habit, busy, onDone, toast]);

  return (
    <View>
      {habit ? (
        <Body>
          {habit.completed_today ? 'Done today.' : 'An easy action for today.'}
          {habit.total_completions
            ? `  ${habit.current_streak}-day streak, ${habit.total_completions} in total.`
            : '  No record yet.'}
        </Body>
      ) : (
        <Body>Small enough to do on your worst day.</Body>
      )}

      <Small style={{ marginTop: 18, marginBottom: 6 }}>What you’ll do</Small>
      <TextInput
        style={[s.ritualName, { backgroundColor: c.bg, borderColor: c.line, color: c.fg }]}
        value={name}
        onChangeText={setName}
        placeholder="Read 3 articles"
        placeholderTextColor={c.muted}
        autoFocus={!habit}
        returnKeyType="done"
        onSubmitEditing={save}
      />

      <View style={{ marginTop: 20, gap: 4 }}>
        {habit && !renamed ? (
          <Button
            full
            label={habit.completed_today ? 'Mark incomplete' : 'Mark complete'}
            haptic="light"
            onPress={onToggle}
          />
        ) : (
          <Button
            full
            label={busy ? 'Saving…' : habit ? 'Save the new name' : 'Add this ritual'}
            haptic="light"
            disabled={!clean || busy}
            onPress={save}
          />
        )}

        {habit ? (
          confirming ? (
            <>
              <Notice icon="alert-circle-outline">
                Removing “{habit.name}” takes its record with it. This cannot be undone.
              </Notice>
              <Button full kind="secondary" label={busy ? 'Removing…' : 'Yes, remove it'} disabled={busy} onPress={remove} />
              <Button full kind="quiet" label="Keep it" onPress={() => setConfirming(false)} />
            </>
          ) : (
            <Button full kind="quiet" label="Remove this ritual" onPress={() => { feel.selection(); setConfirming(true); }} />
          )
        ) : null}
      </View>
    </View>
  );
}

function TodoListSheet({ todos, onChanged }: { todos: TodoData[]; onChanged: () => void }) {
  const { c } = useTheme();
  const toast = useToast();
  const [rows, setRows] = useState(todos);

  const complete = async (t: TodoData) => {
    if (t.completed) return;
    feel.light();
    setRows(prev => prev.map(x => (x.id === t.id ? { ...x, completed: true } : x)));
    try { await completeTodo(t.id); onChanged(); } catch { toast.show('That didn’t save.'); }
  };
  const remove = async (t: TodoData) => {
    feel.selection();
    setRows(prev => prev.filter(x => x.id !== t.id));
    try { await deleteTodo(t.id); onChanged(); } catch { toast.show('That didn’t save.'); }
  };

  return (
    <View>
      <Body>Tap to complete. Everything here is today’s.</Body>
      <View style={{ marginTop: 12 }}>
        {rows.map(t => (
          <View key={t.id} style={[s.listRow, { borderBottomColor: c.line }]}>
            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked: t.completed }}
              accessibilityLabel={t.text}
              onPress={() => complete(t)}
              style={s.listMain}
            >
              <Ionicons
                name={t.completed ? 'checkmark-circle' : 'ellipse-outline'}
                size={18}
                color={t.completed ? c.accent : c.muted}
              />
              <Body style={{ flex: 1, color: t.completed ? c.muted : c.fg }}>{t.text}</Body>
              {t.estimated_minutes ? <Small>{t.estimated_minutes} min</Small> : null}
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${t.text}`} onPress={() => remove(t)} hitSlop={8} style={s.remove}>
              <Ionicons name="close" size={15} color={c.muted} />
            </Pressable>
          </View>
        ))}
        {!rows.length ? <Body>Nothing left today.</Body> : null}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  ritualName: {
    borderWidth: 1, borderRadius: radius.button, paddingHorizontal: 14, paddingVertical: 13,
    fontFamily: liquidFonts.regular, fontSize: 16, minHeight: 48,
  },
  task: { flexDirection: 'row', alignItems: 'center', gap: 12, borderTopWidth: 1, paddingVertical: 18, paddingHorizontal: 1, minHeight: 68 },
  taskCheck: { width: 30, alignItems: 'center', justifyContent: 'center' },
  taskText: { fontFamily: liquidFonts.medium, fontSize: 16, lineHeight: 22 },
  taskMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6, flexWrap: 'wrap' },
  pill: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  focusHead: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 19, marginBottom: 2 },
  more: { flexDirection: 'row', alignItems: 'center', gap: 8, borderTopWidth: 1, paddingVertical: 12, minHeight: 44 },
  epigraph: { marginTop: 12 },
  quoteText: { fontFamily: liquidFonts.serifItalic, fontSize: 17, lineHeight: 23 },
  input: {
    borderWidth: 1, borderRadius: radius.button, paddingHorizontal: 14, paddingVertical: 12,
    fontFamily: liquidFonts.regular, fontSize: 16, marginVertical: 12, minHeight: 52, maxHeight: 120,
  },
  listRow: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1 },
  listMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 14 },
  remove: { width: 40, height: 44, alignItems: 'center', justifyContent: 'center' },
});

/**
 * A task opened in full: what it is, which pillar it feeds, how long it should take, and the
 * ways to change it. Completing a pillar-tagged task also logs deep work against that pillar,
 * which is why the tag is worth seeing.
 */
function TodoDetailSheet({
  todo, pillars, onToggle, onChanged,
}: {
  todo: TodoData;
  pillars: PillarStats[];
  onToggle: () => void;
  onChanged: () => void;
}) {
  const { c } = useTheme();
  const sheet = useSheet();
  const toast = useToast();
  const [text, setText] = useState(todo.text);
  const [minutes, setMinutes] = useState<number>(todo.estimated_minutes ?? 30);
  const [pillarId, setPillarId] = useState<number | null>(todo.pillar_id);
  const [busy, setBusy] = useState(false);

  const dirty = text.trim() !== todo.text || minutes !== todo.estimated_minutes || pillarId !== todo.pillar_id;

  const save = async () => {
    if (!dirty || busy) return;
    setBusy(true);
    try {
      await updateTodo(todo.id, { text: text.trim(), estimated_minutes: minutes, pillar_id: pillarId });
      feel.light();
      sheet.close();
      toast.show('Updated.');
      onChanged();
    } catch (err: any) {
      toast.show(String(err?.message ?? err).replace(/^API \d+: /, '').slice(0, 120));
    } finally { setBusy(false); }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await deleteTodo(todo.id);
      feel.selection();
      sheet.close();
      toast.show('Removed from today.');
      onChanged();
    } catch { toast.show('That didn’t save.'); } finally { setBusy(false); }
  };

  return (
    <View>
      <TextInput
        style={[s.input, { backgroundColor: c.bg, borderColor: c.line, color: c.fg }]}
        value={text}
        onChangeText={setText}
        multiline
      />

      <Small>Pillar</Small>
      <Small style={{ marginTop: 2, marginBottom: -8 }}>
        {todo.pillar_confidence != null
          ? `Tagged automatically, ${Math.round(todo.pillar_confidence * 100)}% sure. Change it if that is wrong.`
          : 'Not tagged yet.'}
      </Small>
      <Options
        values={pillars.map(p => p.pillar_id)}
        selected={pillarId ?? -1}
        onSelect={id => setPillarId(id === pillarId ? null : id)}
        labels={id => pillars.find(p => p.pillar_id === id)?.pillar_name ?? String(id)}
      />

      <Small>How long will it take?</Small>
      <Options
        values={[10, 15, 20, 30, 45, 60, 90, 120, 180]}
        selected={minutes}
        onSelect={setMinutes}
        labels={n => (n >= 60 ? `${n / 60}h${n % 60 ? ` ${n % 60}m` : ''}` : `${n} min`)}
      />

      {dirty ? (
        <Button full label={busy ? 'Saving…' : 'Save changes'} haptic="none" disabled={busy} onPress={save} />
      ) : (
        <Button
          full
          label={todo.completed ? 'Mark as not done' : 'Mark it done'}
          haptic="light"
          onPress={() => { sheet.close(); onToggle(); }}
        />
      )}
      <Button full kind="quiet" label="Remove from today" disabled={busy} onPress={remove} />
      {todo.pillar_name ? (
        <Small style={{ marginTop: 10 }}>
          Finishing this logs deep work against {todo.pillar_name}, which feeds your compounding.
        </Small>
      ) : null}
    </View>
  );
}
