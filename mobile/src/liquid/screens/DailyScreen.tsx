/**
 * Daily — the next good thing, the rituals, and one task that matters.
 *
 * Per the design notes, Daily is focused on immediate action: the compounding chart lives in
 * North Star, one tap away. The hero holds the next training action and takes a hold gesture
 * to fit the session into the day.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import {
  DailySummaryData, HabitData, TodoData, TrainToday,
  completeTodo, getDailySummary, getTrainToday, startTrainToday, toggleHabitToday,
} from '../../api/client';
import { useTheme } from '../theme';
import { fonts } from '../tokens';
import { feel } from '../haptics';
import { Screen } from '../ui/Screen';
import { Body, DailyTitle, Em, Eyebrow, Small, Subtitle } from '../ui/Text';
import { Button, IconButton } from '../ui/Button';
import { Hero, HeroActions, Hint, Section, TopBar } from '../ui/Surfaces';
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
  const [refreshing, setRefreshing] = useState(false);
  const [starting, setStarting] = useState(false);

  const load = useCallback(async () => {
    const [s, t] = await Promise.allSettled([getDailySummary(), getTrainToday()]);
    if (s.status === 'fulfilled') setSummary(s.value);
    if (t.status === 'fulfilled') setTrain(t.value);
  }, []);

  useEffect(() => { load(); }, [load]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const habits = summary?.habits ?? [];
  const done = habits.filter(h => h.completed_today).length;
  const focus = (summary?.todos ?? []).find(t => !t.completed) ?? summary?.todos?.[0] ?? null;
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
      <View>
        <Body>
          {habit.completed_today ? 'Done today.' : 'An easy action for today.'}
          {habit.current_streak ? `  ${habit.current_streak}-day streak, ${habit.total_completions} in total.` : ''}
        </Body>
        <View style={{ marginTop: 22, gap: 4 }}>
          <Button
            full
            label={habit.completed_today ? 'Mark incomplete' : 'Mark complete'}
            haptic="light"
            onPress={() => { sheet.close(); toggle(habit); }}
          />
          <Button full kind="quiet" label="Close" onPress={sheet.close} />
        </View>
      </View>
    ));
  }, [sheet, toggle]);

  const completeFocus = useCallback(async (t: TodoData) => {
    if (t.completed) return;
    feel.light();
    setSummary(prev => prev && { ...prev, todos: prev.todos.map(x => (x.id === t.id ? { ...x, completed: true } : x)) });
    try {
      await completeTodo(t.id);
      toast.show('One meaningful thing, done.');
    } catch {
      setSummary(prev => prev && { ...prev, todos: prev.todos.map(x => (x.id === t.id ? { ...x, completed: false } : x)) });
      toast.show('That didn’t save.');
    }
  }, [toast]);

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

  const adjust = useCallback(() => {
    sheet.open('Make today fit.', () => <AdjustSheet onDone={load} />);
  }, [sheet, load]);

  return (
    <Screen contextKey="daily" onRefresh={refresh} refreshing={refreshing}>
      <TopBar label={today()} onProfile={() => navigation.navigate('Me')} />
      <DailyTitle>
        {greeting()}, <Em>Justin.</Em>
      </DailyTitle>

      <Hero compact onHold={p ? adjust : undefined} style={{ marginTop: 19 }}>
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

      <Section title="Daily rituals" trailing={<Small>{done} of {habits.length} done</Small>} />
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

      <Section style={{ marginTop: 19, marginBottom: 0 }} />
      <Eyebrow>One thing that matters</Eyebrow>
      {focus ? (
        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: focus.completed }}
          accessibilityLabel={focus.text}
          onPress={() => completeFocus(focus)}
          style={[s.task, { borderTopColor: c.line }]}
        >
          <Ionicons
            name={focus.completed ? 'checkmark-circle' : 'ellipse-outline'}
            size={18}
            color={focus.completed ? c.accent : c.muted}
          />
          <Body style={{ flex: 1, color: focus.completed ? c.muted : c.fg }}>{focus.text}</Body>
          {focus.estimated_minutes ? <Small>{focus.estimated_minutes} min</Small> : null}
        </Pressable>
      ) : (
        <View style={[s.task, { borderTopColor: c.line }]}>
          <Body style={{ flex: 1 }}>Nothing set for today.</Body>
        </View>
      )}
    </Screen>
  );
}

const s = StyleSheet.create({
  task: { flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: 1, paddingVertical: 14, paddingHorizontal: 1, minHeight: 50 },
});
