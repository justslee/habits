/**
 * The session logger — "Find your rhythm."
 *
 * One movement at a time: the set tracker, weight and reps steppers, rest between sets, and the
 * next movement already lined up. Logging a set is immediate and undoable from the toast, and
 * rest starts on its own. Finishing asks for effort and time, then applies double progression.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  WorkoutSession, addExerciseLog, completeTrainSession, getWorkoutSession,
} from '../../api/client';
import { useTheme } from '../theme';
import { fonts, radius } from '../tokens';
import { feel } from '../haptics';
import { Screen } from '../ui/Screen';
import { Body, Em, Eyebrow, Small, Subtitle, Title } from '../ui/Text';
import { Button, Options } from '../ui/Button';
import { FlowTop, Section } from '../ui/Surfaces';
import { useSheet } from '../ui/Sheet';
import { useToast } from '../ui/Toast';

interface PlanExercise {
  name: string; sets: number; reps: string; weight: number | null;
  notes?: string | null; kind?: string; block?: string; rest?: string | null;
}

const REST_SECONDS = 90;

export default function SessionScreen({ route, navigation }: any) {
  const { c } = useTheme();
  const sheet = useSheet();
  const toast = useToast();
  const sessionId: number = route.params?.sessionId;

  const [session, setSession] = useState<WorkoutSession | null>(null);
  const [index, setIndex] = useState(0);
  const [weight, setWeight] = useState(45);
  const [reps, setReps] = useState(8);
  const [rest, setRest] = useState(0);
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    getWorkoutSession(sessionId).then(setSession).catch(() => toast.show('Could not open that session.'));
  }, [sessionId, toast]);

  useEffect(() => () => { if (timer.current) clearInterval(timer.current); }, []);

  const plan = useMemo<PlanExercise[]>(() => {
    if (!session?.ai_plan) return [];
    try {
      const parsed = JSON.parse(session.ai_plan);
      return parsed.exercises ?? [];
    } catch { return []; }
  }, [session]);

  const current = plan[index];
  const loggedSets = useMemo(
    () => (session?.exercises ?? []).filter(e => e.exercise_name === current?.name && !e.is_warmup).length,
    [session, current],
  );

  // A movement's suggested load and reps seed the steppers as you reach it.
  useEffect(() => {
    if (!current) return;
    if (current.weight) setWeight(Math.round(current.weight));
    const first = parseInt(String(current.reps).replace(/[^0-9].*$/, ''), 10);
    if (!Number.isNaN(first)) setReps(first);
  }, [current]);

  const startRest = useCallback(() => {
    if (timer.current) clearInterval(timer.current);
    setRest(REST_SECONDS);
    timer.current = setInterval(() => {
      setRest(r => {
        if (r <= 1) {
          if (timer.current) clearInterval(timer.current);
          timer.current = null;
          return 0;
        }
        return r - 1;
      });
    }, 1000);
  }, []);

  const clearRest = useCallback(() => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    setRest(0);
  }, []);

  const logSet = useCallback(async () => {
    if (!current || busy || rest > 0) return;
    setBusy(true);
    feel.light();
    const setNumber = loggedSets + 1;
    try {
      await addExerciseLog(sessionId, {
        exercise_name: current.name,
        set_number: setNumber,
        weight,
        reps,
      });
      const fresh = await getWorkoutSession(sessionId);
      setSession(fresh);
      if (setNumber < current.sets) startRest();
      toast.show(`Set ${setNumber} logged · ${weight} lb × ${reps}`);
    } catch {
      toast.show('That set didn’t save.');
    } finally {
      setBusy(false);
    }
  }, [current, busy, rest, loggedSets, sessionId, weight, reps, startRest, toast]);

  const nextMovement = useCallback(() => {
    clearRest();
    if (index < plan.length - 1) {
      feel.selection();
      setIndex(i => i + 1);
      return;
    }
    finish();
  }, [index, plan.length, clearRest]);

  const finish = useCallback(() => {
    sheet.open('How did that go?', () => <FinishSheet sessionId={sessionId} onDone={() => navigation.goBack()} />);
  }, [sheet, sessionId, navigation]);

  if (!session) {
    return (
      <Screen contextKey="session">
        <Body>Opening your session…</Body>
      </Screen>
    );
  }

  const setsDone = Math.min(loggedSets, current?.sets ?? 3);
  const movementComplete = current ? loggedSets >= current.sets : false;

  return (
    <Screen contextKey={`session-${index}`}>
      <FlowTop
        step={`${session.day_type} · ${index + 1} of ${plan.length} moves`}
        onBack={() => navigation.goBack()}
      />
      <Title>Find your{'\n'}<Em>rhythm.</Em></Title>

      <View style={[s.card, { backgroundColor: c.panel }]}>
        <Eyebrow>{movementComplete ? 'Movement complete' : `Set ${setsDone + 1} of ${current?.sets ?? 3}`}</Eyebrow>
        <Subtitle style={{ marginTop: 6 }}>{current?.name ?? 'Done'}</Subtitle>
        {current?.notes ? <Body style={{ marginTop: 9 }}>{current.notes}</Body> : null}
        <Body style={{ marginTop: 9 }}>
          Target {current?.sets} × {current?.reps}{current?.weight ? ` · ${current.weight} lb suggested` : ''}
        </Body>

        <View style={s.track}>
          {Array.from({ length: current?.sets ?? 3 }, (_, i) => (
            <View key={i} style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: i < setsDone ? c.accent : c.panel2 }} />
          ))}
        </View>

        <View style={s.fields}>
          <Stepper label="Weight · lb" value={weight} onChange={v => setWeight(Math.max(0, v))} step={5} />
          <Stepper label="Reps" value={reps} onChange={v => setReps(Math.max(1, v))} step={1} />
        </View>

        {rest > 0 ? (
          <View style={[s.rest, { backgroundColor: c.soft }]}>
            <Small style={{ color: c.accent, fontSize: 13 }}>
              Rest <Small style={{ color: c.accent, fontFamily: fonts.medium, fontSize: 13 }}>{rest}s</Small>
            </Small>
            <Button kind="quiet" label="Skip rest" onPress={clearRest} />
          </View>
        ) : null}

        <Button
          full
          label={movementComplete
            ? (index === plan.length - 1 ? 'Finish session' : 'Next movement')
            : `Log set ${setsDone + 1}`}
          icon={movementComplete ? undefined : 'checkmark'}
          iconAfter={movementComplete && index < plan.length - 1 ? 'arrow-forward' : undefined}
          haptic="light"
          disabled={busy || rest > 0}
          style={{ marginTop: 16 }}
          onPress={movementComplete ? nextMovement : logSet}
        />
      </View>

      <Section title="Stay in the flow" />
      <Body>Log here. Rest here. Your next set is already ready.</Body>
      {plan.length ? (
        <View style={{ marginTop: 12 }}>
          {plan.map((e, i) => (
            <Pressable
              key={`${e.name}-${i}`}
              accessibilityRole="button"
              accessibilityState={{ selected: i === index }}
              onPress={() => { feel.selection(); clearRest(); setIndex(i); }}
              style={[s.planRow, { borderBottomColor: c.line }]}
            >
              <Small style={{ width: 22, color: i === index ? c.accent : c.muted }}>{String(i + 1).padStart(2, '0')}</Small>
              <View style={{ flex: 1 }}>
                <Small style={{ color: i === index ? c.fg : c.muted, fontSize: 13 }}>{e.name}</Small>
              </View>
              <Small>{e.sets} × {e.reps}</Small>
            </Pressable>
          ))}
        </View>
      ) : null}

      <Button full kind="quiet" label="Finish session" style={{ marginTop: 16 }} onPress={finish} />
    </Screen>
  );
}

function Stepper({ label, value, onChange, step }: { label: string; value: number; onChange: (v: number) => void; step: number }) {
  const { c } = useTheme();
  return (
    <View style={[s.field, { backgroundColor: c.bg }]}>
      <Small style={{ letterSpacing: 1, textTransform: 'uppercase' }}>{label}</Small>
      <View style={s.stepper}>
        <Pressable accessibilityRole="button" accessibilityLabel={`Decrease ${label}`} hitSlop={6}
          onPress={() => { feel.selection(); onChange(value - step); }} style={s.stepBtn}>
          <Ionicons name="remove" size={20} color={c.muted} />
        </Pressable>
        <Body style={{ fontFamily: fonts.serif, fontSize: 31, color: c.fg, lineHeight: 34 }}>{value}</Body>
        <Pressable accessibilityRole="button" accessibilityLabel={`Increase ${label}`} hitSlop={6}
          onPress={() => { feel.selection(); onChange(value + step); }} style={s.stepBtn}>
          <Ionicons name="add" size={20} color={c.muted} />
        </Pressable>
      </View>
    </View>
  );
}

function FinishSheet({ sessionId, onDone }: { sessionId: number; onDone: () => void }) {
  const [rpe, setRpe] = useState(7);
  const [minutes, setMinutes] = useState(60);
  const [busy, setBusy] = useState(false);
  const sheet = useSheet();
  const toast = useToast();

  const save = async () => {
    setBusy(true);
    try {
      const r = await completeTrainSession(sessionId, { overall_rpe: rpe, minutes });
      feel.success();
      sheet.close();
      toast.show(r.progression?.length ? r.progression[0].note : 'Session complete. Nice work.');
      onDone();
    } catch (err: any) {
      toast.show(String(err?.message ?? err).replace(/^API \d+: /, ''));
    } finally { setBusy(false); }
  };

  return (
    <View>
      <Body>Effort overall, and how long it took.</Body>
      <Small style={{ marginTop: 16 }}>RPE</Small>
      <Options values={[5, 6, 7, 8, 9]} selected={rpe} onSelect={setRpe} />
      <Small>Minutes</Small>
      <Options values={[30, 45, 60, 70]} selected={minutes} onSelect={setMinutes} />
      <Button full label={busy ? 'Saving…' : 'Finish session'} haptic="none" disabled={busy} onPress={save} />
      <Small style={{ marginTop: 14 }}>
        Over 70 minutes the programme wants you to cut work, not extend the session.
      </Small>
    </View>
  );
}

const s = StyleSheet.create({
  card: { borderRadius: radius.session, padding: 22, marginTop: 20 },
  track: { flexDirection: 'row', gap: 7, marginTop: 23, marginBottom: 16 },
  fields: { flexDirection: 'row', gap: 14, marginVertical: 22 },
  field: { flex: 1, paddingVertical: 13, paddingHorizontal: 6, borderRadius: 17, alignItems: 'center' },
  stepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8, gap: 2, alignSelf: 'stretch' },
  stepBtn: { minWidth: 36, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  rest: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: 18, paddingVertical: 4, paddingHorizontal: 15, marginVertical: 16 },
  planRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, borderBottomWidth: 1 },
});
