/**
 * The session logger — "Find your rhythm."
 *
 * One movement at a time: the set tracker, weight and reps steppers, rest between sets, and the
 * next movement already lined up. The plan is where you start, not a limit: log sets past it,
 * fix or delete any set, add, swap or remove movements. A finished session opens the same way
 * for edits; they save as you make them, and the next session's loads follow them.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  ExerciseLogData, ExerciseProfileData, WorkoutSession, addExerciseLog, addMovement,
  completeTrainSession, deleteExerciseLog, getExerciseProfiles, getWorkoutSession, removeMovement,
  updateExerciseLog, updateMovement,
} from '../../api/client';
import { useTheme } from '../theme';
import { fonts, radius } from '../tokens';
import { feel } from '../haptics';
import { Screen } from '../ui/Screen';
import { Body, Em, Eyebrow, Small, Subtitle, Title } from '../ui/Text';
import { Button, IconButton, Options } from '../ui/Button';
import { FlowTop, Section } from '../ui/Surfaces';
import { useSheet } from '../ui/Sheet';
import { useToast } from '../ui/Toast';

/** A movement in this session: the plan's, one you added, or one that was only ever logged. */
interface Movement {
  name: string; sets: number; reps: string; weight: number | null;
  notes?: string | null; kind?: string; block?: string; rest?: string | null;
  /** Not part of the programme: added in the app, or logged without a plan. */
  extra: boolean;
}

const REST_SECONDS = 90;

/** "S1" reads as "Session 1"; anything else keeps its own name. */
const shortName = (id: string) =>
  /^S\d$/.test(id) ? `Session ${id.slice(1)}` : id === 'RUN' ? 'Your run' : id === 'MOB' ? 'Mobility' : id;

const clean = (err: any) => String(err?.message ?? err).replace(/^API \d+: /, '').replace(/^\{"detail":"|"\}$/g, '');

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

const setLabel = (e: ExerciseLogData) => `${e.weight ? `${e.weight} lb` : 'Bodyweight'} × ${e.reps ?? '–'}`;

export default function SessionScreen({ route, navigation }: any) {
  const { c } = useTheme();
  const sheet = useSheet();
  const toast = useToast();
  const sessionId: number = route.params?.sessionId;

  const [session, setSession] = useState<WorkoutSession | null>(null);
  const [profiles, setProfiles] = useState<ExerciseProfileData[]>([]);
  const [index, setIndex] = useState(0);
  const [weight, setWeight] = useState(45);
  const [reps, setReps] = useState(8);
  const [rest, setRest] = useState(0);
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    getWorkoutSession(sessionId).then(setSession).catch(() => toast.show('Could not open that session.'));
    // Profiles carry what you lifted last time and whether the load is ready to go up.
    getExerciseProfiles().then(setProfiles).catch(() => {});
  }, [sessionId, toast]);

  useEffect(() => () => { if (timer.current) clearInterval(timer.current); }, []);

  /** The stored plan is the whole prescription: blocks flattened for logging, plus run and mobility. */
  const prescription = useMemo<any>(() => {
    if (!session?.ai_plan) return null;
    try { return JSON.parse(session.ai_plan); } catch { return null; }
  }, [session]);

  /** The plan's movements, then anything logged that the plan never had (older sessions, extras). */
  const movements = useMemo<Movement[]>(() => {
    const list: Movement[] = (prescription?.exercises ?? []).map((e: any) => ({
      ...e, sets: e.sets ?? 0, reps: String(e.reps ?? ''), weight: e.weight ?? null,
      extra: Boolean(e.added) || e.kind === 'extra',
    }));
    const logs = [...(session?.exercises ?? [])].sort((a, b) => (a.exercise_order ?? 0) - (b.exercise_order ?? 0));
    for (const e of logs) {
      if (list.some(m => same(m.name, e.exercise_name))) continue;
      const count = logs.filter(x => same(x.exercise_name, e.exercise_name) && !x.is_warmup).length;
      list.push({ name: e.exercise_name, sets: count, reps: '', weight: null, extra: true });
    }
    return list;
  }, [prescription, session]);

  // Removing a movement can leave the pointer past the end.
  useEffect(() => {
    if (index > 0 && index >= movements.length) setIndex(Math.max(0, movements.length - 1));
  }, [index, movements.length]);

  const current: Movement | undefined = movements[Math.min(index, Math.max(0, movements.length - 1))];
  const setsThisMovement = useMemo(
    () => (session?.exercises ?? [])
      .filter(e => current && same(e.exercise_name, current.name) && !e.is_warmup)
      .sort((a, b) => a.set_number - b.set_number),
    [session, current],
  );
  const loggedSets = setsThisMovement.length;
  const target = current?.sets ?? 0;
  const finished = session?.status === 'completed';
  const profile = useMemo(
    () => profiles.find(p => same(p.exercise_name, current?.name ?? '')) ?? null,
    [profiles, current],
  );

  // A movement's suggested load and reps seed the steppers when you reach it, and only then: a
  // weight you changed mid-movement stays for the next set. Unloaded work — jumps, carries,
  // core — starts at zero rather than at a barbell weight.
  const seedKey = current ? `${current.name}|${profile?.current_working_weight ?? ''}` : '';
  useEffect(() => {
    if (!current) return;
    const last = setsThisMovement[setsThisMovement.length - 1];
    const unloaded = !current.weight && ['power', 'core', 'carry'].includes(current.kind ?? '');
    setWeight(last?.weight ?? (current.weight ? Math.round(current.weight) : unloaded ? 0 : profile?.current_working_weight ?? 45));
    const first = parseInt(String(current.reps).replace(/[^0-9].*$/, ''), 10);
    setReps(last?.reps ?? (Number.isNaN(first) ? 8 : first));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seedKey]);

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
      setSession(await getWorkoutSession(sessionId));
      // Rest before the next set, including sets past the plan; not after the one that completes it.
      if (!finished && setNumber !== target) startRest();
      toast.show(`Set ${setNumber} logged · ${weight ? `${weight} lb` : 'bodyweight'} × ${reps}${setNumber > target && target ? ' · extra' : ''}`);
    } catch {
      toast.show('That set didn’t save.');
    } finally {
      setBusy(false);
    }
  }, [current, busy, rest, loggedSets, sessionId, weight, reps, finished, target, startRest, toast]);

  const editSet = useCallback((set: ExerciseLogData) => {
    if (set.id == null) return;
    sheet.open(`${current?.name ?? 'Set'}\nset ${set.set_number}`, () => (
      <SetSheet sessionId={sessionId} set={set} onSaved={setSession} />
    ));
  }, [sheet, sessionId, current]);

  const editMovement = useCallback((m?: Movement) => {
    sheet.open(m ? 'Change\nthis movement.' : 'Add a\nmovement.', () => (
      <MovementSheet
        sessionId={sessionId}
        movement={m}
        onSaved={(fresh, name) => {
          setSession(fresh);
          // Land on the movement you just added.
          if (!m && name) {
            const plan = (() => { try { return JSON.parse(fresh.ai_plan ?? '{}').exercises ?? []; } catch { return []; } })();
            const at = plan.findIndex((e: any) => same(e.name, name));
            if (at >= 0) { clearRest(); setIndex(at); }
          }
        }}
      />
    ));
  }, [sheet, sessionId, clearRest]);

  const finish = useCallback(() => {
    if (finished) { navigation.goBack(); return; }
    sheet.open('How did that go?', () => <FinishSheet sessionId={sessionId} onDone={() => navigation.goBack()} />);
  }, [finished, sheet, sessionId, navigation]);

  const nextMovement = useCallback(() => {
    clearRest();
    if (index < movements.length - 1) {
      feel.selection();
      setIndex(i => i + 1);
      return;
    }
    finish();
  }, [index, movements.length, clearRest, finish]);

  if (!session) {
    return (
      <Screen contextKey="session">
        <Body>Opening your session…</Body>
      </Screen>
    );
  }

  const movementComplete = current ? loggedSets >= target : false;
  const last = index >= movements.length - 1;

  // Some sessions are a run and mobility with nothing to log set by set — until you add something.
  if (!movements.length) {
    return (
      <Screen contextKey="session-easy">
        <FlowTop step={prescription?.title ?? shortName(session.day_type)} onBack={() => navigation.goBack()} />
        <Title>Keep it{'\n'}<Em>easy.</Em></Title>
        <Body style={{ marginTop: 12 }}>{prescription?.budget ?? 'Easy aerobic work and mobility.'}</Body>

        {prescription?.run ? (
          <View style={[s.card, { backgroundColor: c.panel }]}>
            <Eyebrow>Run · {prescription.run.minutes} min</Eyebrow>
            <Subtitle style={{ marginTop: 6 }}>{prescription.run.structure}</Subtitle>
          </View>
        ) : null}

        {prescription?.mobility?.length ? (
          <>
            <Section title="Mobility" trailing={<Small>~8 min</Small>} />
            {prescription.mobility.map((mv: [string, string]) => (
              <View key={mv[0]} style={[s.planRow, { borderBottomColor: c.line }]}>
                <Body style={{ flex: 1, color: c.fg }}>{mv[0]}</Body>
                <Small>{mv[1]}</Small>
              </View>
            ))}
          </>
        ) : null}

        {prescription?.rules?.length ? <Small style={{ marginTop: 16 }}>{prescription.rules[0]}</Small> : null}
        <Button full kind="secondary" label="Add a movement" icon="add" style={{ marginTop: 22 }} onPress={() => editMovement()} />
        <Button full label={finished ? 'Done' : 'Finish session'} haptic="light" style={{ marginTop: 10 }} onPress={finish} />
      </Screen>
    );
  }

  const eyebrow = !current ? 'Done'
    : loggedSets < target ? `Set ${loggedSets + 1} of ${target}`
    : loggedSets > target && target ? `${loggedSets} sets · ${loggedSets - target} past the plan`
    : 'Movement complete';

  return (
    <Screen contextKey={`session-${index}`}>
      <FlowTop
        step={`${shortName(prescription?.session ?? session.day_type)} · ${index + 1} of ${movements.length}`}
        onBack={() => navigation.goBack()}
      />
      {finished ? (
        <>
          <Title>Your session,{'\n'}<Em>as it happened.</Em></Title>
          <Small style={{ marginTop: 10 }}>Changes save as you make them, and your next loads follow them.</Small>
        </>
      ) : (
        <Title>Find your{'\n'}<Em>rhythm.</Em></Title>
      )}

      <View style={[s.card, { backgroundColor: c.panel }]}>
        <Eyebrow>{eyebrow}</Eyebrow>
        <View style={s.nameRow}>
          <Subtitle style={{ flex: 1, marginTop: 6 }}>{current?.name ?? 'Done'}</Subtitle>
          {current ? (
            <IconButton icon="create-outline" size={36} background="transparent" color={c.muted} accessibilityLabel={`Change ${current.name}`} onPress={() => editMovement(current)} />
          ) : null}
        </View>
        {current?.notes ? <Body style={{ marginTop: 9 }}>{current.notes}</Body> : null}
        <Body style={{ marginTop: 9 }}>
          {current?.reps
            ? `Target ${target} × ${current.reps}${current.weight ? ` · ${current.weight} lb suggested` : ''}`
            : 'Your own addition to this session'}
        </Body>
        {profile?.current_working_weight ? (
          <Small style={{ marginTop: 6 }}>
            Last time {profile.current_working_weight} lb
            {profile.current_rep_target ? ` × ${profile.current_rep_target}` : ''}
            {profile.progression_status === 'progressing' ? ' · earned an increase' : ''}
            {profile.stall_count ? ` · held ${profile.stall_count}×` : ''}
          </Small>
        ) : null}

        <View style={s.track}>
          {Array.from({ length: Math.max(target, loggedSets, 1) }, (_, i) => (
            <View
              key={i}
              style={{
                flex: 1, height: 4, borderRadius: 2,
                backgroundColor: i < loggedSets ? c.accent : c.panel2,
                opacity: i >= target && i < loggedSets ? 0.55 : 1,
              }}
            />
          ))}
        </View>

        {setsThisMovement.length ? (
          <View style={{ marginBottom: 4 }}>
            {setsThisMovement.map(e => (
              <Pressable
                key={e.id ?? `${e.set_number}`}
                accessibilityRole="button"
                accessibilityLabel={`Set ${e.set_number}, ${setLabel(e)}. Edit`}
                onPress={() => { feel.selection(); editSet(e); }}
                style={[s.setRow, { borderTopColor: c.line }]}
              >
                <Small style={{ width: 52 }}>Set {e.set_number}</Small>
                <Body style={{ flex: 1, color: c.fg }}>{setLabel(e)}</Body>
                {e.set_number > target && target ? <Small style={{ color: c.accent }}>extra</Small> : null}
                <Ionicons name="create-outline" size={16} color={c.muted} />
              </Pressable>
            ))}
          </View>
        ) : null}

        <View style={s.fields}>
          <Stepper
            label={weight === 0 ? 'Bodyweight' : 'Weight · lb'}
            value={weight}
            onChange={v => setWeight(Math.max(0, Math.round(v * 2) / 2))}
            step={5}
            decimals
          />
          <Stepper label="Reps" value={reps} onChange={v => setReps(Math.max(0, Math.round(v)))} step={1} />
        </View>

        {rest > 0 ? (
          <View style={[s.rest, { backgroundColor: c.soft }]}>
            <Small style={{ color: c.accent, fontSize: 13 }}>
              Rest <Small style={{ color: c.accent, fontFamily: fonts.medium, fontSize: 13 }}>{rest}s</Small>
            </Small>
            <Button kind="quiet" label="Skip rest" onPress={clearRest} />
          </View>
        ) : null}

        {movementComplete ? (
          <>
            <Button
              full
              label={last ? (finished ? 'Done' : 'Finish session') : 'Next movement'}
              iconAfter={last ? undefined : 'arrow-forward'}
              haptic="light"
              style={{ marginTop: 16 }}
              onPress={nextMovement}
            />
            <Button
              full
              kind="secondary"
              label={`Log set ${loggedSets + 1}`}
              icon="add"
              haptic="light"
              disabled={busy || rest > 0}
              style={{ marginTop: 10 }}
              onPress={logSet}
            />
          </>
        ) : (
          <Button
            full
            label={`Log set ${loggedSets + 1}`}
            icon="checkmark"
            haptic="light"
            disabled={busy || rest > 0}
            style={{ marginTop: 16 }}
            onPress={logSet}
          />
        )}
      </View>

      <Section title={finished ? 'Everything you did' : 'Stay in the flow'} />
      <Body>{finished ? 'Tap a movement to see its sets, or change it.' : 'Log here. Rest here. Your next set is already ready.'}</Body>
      <View style={{ marginTop: 12 }}>
        {movements.map((m, i) => {
          const done = (session.exercises ?? []).filter(e => same(e.exercise_name, m.name) && !e.is_warmup).length;
          return (
            <Pressable
              key={`${m.name}-${i}`}
              accessibilityRole="button"
              accessibilityState={{ selected: i === index }}
              onPress={() => { feel.selection(); clearRest(); setIndex(i); }}
              style={[s.planRow, { borderBottomColor: c.line }]}
            >
              <Small style={{ width: 22, color: i === index ? c.accent : c.muted }}>{String(i + 1).padStart(2, '0')}</Small>
              <View style={{ flex: 1 }}>
                <Small style={{ color: i === index ? c.fg : c.muted, fontSize: 13 }}>{m.name}</Small>
              </View>
              <Small>
                {m.sets ? `${done}/${m.sets}` : `${done}`}
                {m.reps ? ` · ${m.sets} × ${m.reps}` : done === 1 ? ' set' : ' sets'}
              </Small>
              <IconButton icon="ellipsis-horizontal" size={32} background="transparent" color={c.muted} accessibilityLabel={`Change ${m.name}`} onPress={() => editMovement(m)} />
            </Pressable>
          );
        })}
      </View>
      <Button full kind="secondary" label="Add a movement" icon="add" style={{ marginTop: 16 }} onPress={() => editMovement()} />

      <Button full kind="quiet" label={finished ? 'Done' : 'Finish session'} style={{ marginTop: 8 }} onPress={finish} />
    </Screen>
  );
}

/** Minus, a number you can also type into, plus. */
function Stepper({ label, value, onChange, step, decimals }: {
  label: string; value: number; onChange: (v: number) => void; step: number; decimals?: boolean;
}) {
  const { c } = useTheme();
  const [text, setText] = useState<string | null>(null);

  const commit = () => {
    if (text === null) return;
    const n = parseFloat(text.replace(',', '.'));
    setText(null);
    if (Number.isFinite(n)) onChange(n);
  };

  return (
    <View style={[s.field, { backgroundColor: c.bg }]}>
      <Small style={{ letterSpacing: 1, textTransform: 'uppercase' }}>{label}</Small>
      <View style={s.stepper}>
        <Pressable accessibilityRole="button" accessibilityLabel={`Decrease ${label}`} hitSlop={6}
          onPress={() => { feel.selection(); onChange(value - step); }} style={s.stepBtn}>
          <Ionicons name="remove" size={20} color={c.muted} />
        </Pressable>
        <TextInput
          style={[s.number, { color: c.fg }]}
          value={text ?? (decimals ? String(value) : String(Math.round(value)))}
          onChangeText={setText}
          onBlur={commit}
          onSubmitEditing={commit}
          keyboardType={decimals ? 'decimal-pad' : 'number-pad'}
          returnKeyType="done"
          selectTextOnFocus
          accessibilityLabel={label}
        />
        <Pressable accessibilityRole="button" accessibilityLabel={`Increase ${label}`} hitSlop={6}
          onPress={() => { feel.selection(); onChange(value + step); }} style={s.stepBtn}>
          <Ionicons name="add" size={20} color={c.muted} />
        </Pressable>
      </View>
    </View>
  );
}

/** Fix a logged set's numbers, or take it out. */
function SetSheet({ sessionId, set, onSaved }: {
  sessionId: number; set: ExerciseLogData; onSaved: (s: WorkoutSession) => void;
}) {
  const sheet = useSheet();
  const toast = useToast();
  const [weight, setWeight] = useState(set.weight ?? 0);
  const [reps, setReps] = useState(set.reps ?? 0);
  const [busy, setBusy] = useState(false);

  const run = async (work: () => Promise<WorkoutSession>, done: string) => {
    setBusy(true);
    try {
      onSaved(await work());
      feel.success();
      sheet.close();
      toast.show(done);
    } catch (err: any) {
      toast.show(clean(err));
    } finally { setBusy(false); }
  };

  return (
    <View>
      <View style={s.fields}>
        <Stepper label={weight === 0 ? 'Bodyweight' : 'Weight · lb'} value={weight} decimals step={5}
          onChange={v => setWeight(Math.max(0, Math.round(v * 2) / 2))} />
        <Stepper label="Reps" value={reps} step={1} onChange={v => setReps(Math.max(0, Math.round(v)))} />
      </View>
      <Button full label={busy ? 'Saving…' : 'Save set'} haptic="none" disabled={busy}
        onPress={() => run(() => updateExerciseLog(sessionId, set.id!, { weight, reps }), 'Set updated.')} />
      <Button full kind="quiet" label="Delete this set" disabled={busy}
        onPress={() => run(() => deleteExerciseLog(sessionId, set.id!), `Set ${set.set_number} removed.`)} />
    </View>
  );
}

/** Add a movement, or rename (swap), retarget or remove one. */
function MovementSheet({ sessionId, movement, onSaved }: {
  sessionId: number; movement?: Movement; onSaved: (s: WorkoutSession, name?: string) => void;
}) {
  const { c } = useTheme();
  const sheet = useSheet();
  const toast = useToast();
  const [name, setName] = useState(movement?.name ?? '');
  const [sets, setSets] = useState(movement?.sets || 3);
  const [reps, setReps] = useState(movement?.reps || '8');
  const [busy, setBusy] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const save = async () => {
    const trimmed = name.trim();
    if (!trimmed) { toast.show('Give it a name.'); return; }
    setBusy(true);
    try {
      const fresh = movement
        ? await updateMovement(sessionId, movement.name, {
          ...(trimmed !== movement.name ? { new_name: trimmed } : {}),
          sets, reps: reps.trim() || '8',
        })
        : await addMovement(sessionId, { name: trimmed, sets, reps: reps.trim() || '8' });
      onSaved(fresh, trimmed);
      feel.success();
      sheet.close();
      toast.show(movement ? 'Movement updated.' : `${trimmed} added.`);
    } catch (err: any) {
      toast.show(clean(err));
    } finally { setBusy(false); }
  };

  const remove = async () => {
    if (!movement) return;
    if (!confirmRemove) { setConfirmRemove(true); feel.warning(); return; }
    setBusy(true);
    try {
      onSaved(await removeMovement(sessionId, movement.name));
      sheet.close();
      toast.show(`${movement.name} removed.`);
    } catch (err: any) {
      toast.show(clean(err));
    } finally { setBusy(false); }
  };

  return (
    <View>
      <Small style={{ letterSpacing: 1, textTransform: 'uppercase' }}>Movement</Small>
      <TextInput
        style={[s.input, { backgroundColor: c.bg, borderColor: c.line, color: c.fg }]}
        value={name}
        onChangeText={setName}
        placeholder="Dumbbell bench press"
        placeholderTextColor={c.muted}
        autoCapitalize="sentences"
        returnKeyType="done"
      />
      <Small style={{ letterSpacing: 1, textTransform: 'uppercase', marginTop: 4 }}>Target sets</Small>
      <Options values={[1, 2, 3, 4, 5, 6]} selected={sets} onSelect={setSets} />
      <Small style={{ letterSpacing: 1, textTransform: 'uppercase' }}>Target reps</Small>
      <TextInput
        style={[s.input, { backgroundColor: c.bg, borderColor: c.line, color: c.fg }]}
        value={reps}
        onChangeText={setReps}
        placeholder="8 or 8-10"
        placeholderTextColor={c.muted}
        returnKeyType="done"
      />
      <Button full label={busy ? 'Saving…' : movement ? 'Save changes' : 'Add to this session'} haptic="none" disabled={busy} onPress={save} />
      {movement ? (
        <Button
          full
          kind="quiet"
          label={confirmRemove ? 'Tap again to remove it and its sets' : 'Remove from this session'}
          disabled={busy}
          onPress={remove}
        />
      ) : null}
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
      toast.show(clean(err));
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
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  track: { flexDirection: 'row', gap: 7, marginTop: 23, marginBottom: 16 },
  setRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11, borderTopWidth: 1 },
  fields: { flexDirection: 'row', gap: 14, marginVertical: 22 },
  field: { flex: 1, minWidth: 0, paddingVertical: 13, paddingHorizontal: 6, borderRadius: 17, alignItems: 'center' },
  stepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8, gap: 2, alignSelf: 'stretch' },
  stepBtn: { minWidth: 36, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  number: {
    // minWidth 0 lets the field shrink inside the row; without it the input claims its
    // intrinsic width and pushes the plus button off the edge of the card.
    flex: 1, minWidth: 0, textAlign: 'center', fontFamily: fonts.serif, fontSize: 31,
    lineHeight: 36, paddingVertical: 0, paddingHorizontal: 0,
  },
  rest: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: 18, paddingVertical: 4, paddingHorizontal: 15, marginVertical: 16 },
  planRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6, minHeight: 50, borderBottomWidth: 1 },
  input: {
    borderWidth: 1, borderRadius: radius.button, paddingHorizontal: 14, paddingVertical: 12,
    fontFamily: fonts.regular, fontSize: 16, marginTop: 8, marginBottom: 14,
  },
});
