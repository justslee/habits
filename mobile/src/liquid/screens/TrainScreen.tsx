/**
 * Train — the golf performance programme in four segments: Today, Week, Program and History.
 *
 * Today holds the next session and the week around it; holding the session opens the same
 * adjust sheet Daily uses, and any change re-plans the rest of the week. Program keeps the
 * whole journey: phases, lighter weeks, the five session templates, mobility and the log.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, Share, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import {
  AdjustResult, GolfEventData, TrainDay, TrainProgram, TrainToday, TrainWeek, TrainingItem,
  getGolfEvents, getRecentTraining, getTrainLog, getTrainProgram, getTrainToday, getTrainWeek,
  patchTrainSettings, revertTrainAdjustment, startTrainToday,
} from '../../api/client';
import { useTheme } from '../theme';
import { fonts, radius } from '../tokens';
import { T, m } from '../motion';
import { feel } from '../haptics';
import { Screen } from '../ui/Screen';
import { Body, Em, Eyebrow, Small, Subtitle, Title } from '../ui/Text';
import { Button, IconButton, InlineButton } from '../ui/Button';
import { DetailRow, Hero, HeroActions, Hint, Notice, Panel, Section, Switch, TopBar } from '../ui/Surfaces';
import { useSheet } from '../ui/Sheet';
import { useToast } from '../ui/Toast';
import { AdjustSheet } from '../sheets/AdjustSheet';
import { prettyDate } from '../ui/Chart';

type Seg = 'today' | 'week' | 'program' | 'history';
const SEGS: Seg[] = ['today', 'week', 'program', 'history'];

/** Short phase labels, so the hero's eyebrow stays one line. */
const PHASE_SHORT: Record<string, string> = {
  baseline: 'Baseline',
  build: 'Build',
  strength: 'Strength',
  consolidate: 'Consolidate',
  golf_power: 'Golf power',
  pre_event: 'Pre-event',
  in_season: 'In season',
};

const sessionName = (s: string | null) =>
  !s ? 'Rest' : /^S\d$/.test(s) ? `Session ${s.slice(1)}` : s === 'RUN' ? 'Your run' : s === 'MOB' ? 'Mobility' : s;

export default function TrainScreen({ navigation }: any) {
  const { c } = useTheme();
  const sheet = useSheet();
  const toast = useToast();
  const [seg, setSeg] = useState<Seg>('today');
  const [program, setProgram] = useState<TrainProgram | null>(null);
  const [today, setToday] = useState<TrainToday | null>(null);
  const [week, setWeek] = useState<TrainWeek | null>(null);
  const [events, setEvents] = useState<GolfEventData[]>([]);
  const [history, setHistory] = useState<TrainingItem[]>([]);
  const [openPhase, setOpenPhase] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [starting, setStarting] = useState(false);

  const load = useCallback(async () => {
    const [p, t, w, e, h] = await Promise.allSettled([
      getTrainProgram(), getTrainToday(), getTrainWeek(), getGolfEvents(), getRecentTraining(30),
    ]);
    if (p.status === 'fulfilled') setProgram(p.value);
    if (t.status === 'fulfilled') setToday(t.value);
    if (w.status === 'fulfilled') setWeek(w.value);
    if (e.status === 'fulfilled') setEvents(e.value);
    if (h.status === 'fulfilled') setHistory(h.value);
  }, []);

  useEffect(() => { load(); }, [load]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const refresh = useCallback(async () => { setRefreshing(true); await load(); setRefreshing(false); }, [load]);

  const applied = useCallback((r: AdjustResult) => {
    setWeek(r.week);
    setToday(r.today);
    toast.show(r.changes[0] ?? 'Your week is updated.');
  }, [toast]);

  const adjust = useCallback((date?: string, day?: TrainDay | null) => {
    sheet.open('Make it fit.', () => <AdjustSheet date={date} onDone={r => r && applied(r)} />);
  }, [sheet, applied]);

  const start = useCallback(async () => {
    setStarting(true);
    try {
      const r = await startTrainToday();
      navigation.navigate('Session', { sessionId: r.session_id });
    } catch (err: any) {
      toast.show(String(err?.message ?? err).replace(/^API \d+: /, '').replace(/^\{"detail":"|"\}$/g, ''));
    } finally { setStarting(false); }
  }, [navigation, toast]);

  const p = today?.prescription ?? null;

  return (
    <Screen contextKey={`train-${seg}`} onRefresh={refresh} refreshing={refreshing}>
      <TopBar label="Train · Golf performance" onProfile={() => navigation.navigate('Me')} />
      <SegNav value={seg} onChange={v => { feel.selection(); setSeg(v); }} />

      {seg === 'today' ? (
        <TodayView
          today={today} week={week} program={program} starting={starting}
          onStart={start} onAdjust={adjust} onUndo={async () => {
            const id = today?.day?.adjustment_id;
            if (!id) return;
            const r = await revertTrainAdjustment(id);
            feel.light();
            applied(r);
          }}
          onLogRun={() => navigation.navigate('Daily')}
          onProgram={() => setSeg('program')}
          onHistory={() => setSeg('history')}
        />
      ) : seg === 'week' ? (
        <WeekView week={week} onAdjust={adjust} />
      ) : seg === 'program' ? (
        <ProgramView
          program={program} events={events} openPhase={openPhase} setOpenPhase={setOpenPhase}
          onFive={async (v: boolean) => { await patchTrainSettings({ five_sessions: v }); load(); }}
        />
      ) : (
        <HistoryView history={history} />
      )}
    </Screen>
  );
}

/** The four-way segment strip, with a well that slides between positions. */
function SegNav({ value, onChange }: { value: Seg; onChange: (v: Seg) => void }) {
  const { c, moves } = useTheme();
  const [width, setWidth] = useState(0);
  const pos = useSharedValue(SEGS.indexOf(value));
  useEffect(() => { pos.value = withTiming(SEGS.indexOf(value), m(moves, T.selection)); }, [value, moves, pos]);
  const cell = width > 0 ? (width - 8) / 4 : 0;
  const well = useAnimatedStyle(() => ({ transform: [{ translateX: pos.value * cell }] }));
  return (
    <View
      style={[s.nav, { backgroundColor: c.panel }]}
      onLayout={e => setWidth(e.nativeEvent.layout.width)}
      accessibilityRole="tablist"
    >
      <Animated.View pointerEvents="none" style={[s.well, { width: cell, backgroundColor: c.soft }, well]} />
      {SEGS.map(v => (
        <Pressable
          key={v}
          accessibilityRole="tab"
          accessibilityState={{ selected: value === v }}
          onPress={() => onChange(v)}
          style={s.navBtn}
        >
          <Animated.Text style={[s.navLabel, { color: value === v ? c.fg : c.muted }]}>
            {v[0].toUpperCase() + v.slice(1)}
          </Animated.Text>
        </Pressable>
      ))}
    </View>
  );
}

// --- Today ------------------------------------------------------------------

function TodayView({
  today, week, program, starting, onStart, onAdjust, onUndo, onLogRun, onProgram, onHistory,
}: any) {
  const { c } = useTheme();
  const p = today?.prescription ?? null;
  const done = today?.status === 'completed';
  const isRun = p?.session === 'RUN';

  return (
    <>
      {week ? (
        <View style={s.weekStrip}>
          {week.days.map((d: TrainDay) => {
            const isToday = d.date === today?.date;
            return (
              <View key={d.date} style={[s.day, { backgroundColor: isToday ? c.fg : 'transparent' }]}>
                <Small style={{ color: isToday ? c.bg : c.muted }}>{d.weekday[0]}</Small>
                <Animated.Text style={[s.dayNum, { color: isToday ? c.bg : c.fg }]}>
                  {Number(d.date.slice(8, 10))}
                </Animated.Text>
                <View style={{
                  width: 3, height: 3, borderRadius: 2,
                  backgroundColor: d.session ? (isToday ? c.bg : c.muted) : 'transparent',
                  opacity: 0.6,
                }} />
              </View>
            );
          })}
        </View>
      ) : null}

      <Hero onHold={p ? () => onAdjust(today?.date, today?.day) : undefined}>
        <Eyebrow numberOfLines={1}>
          {p
            ? `Today · ${PHASE_SHORT[p.phase] ?? p.phase_name}${week?.week_kind && week.week_kind !== 'normal' ? ` · ${week.week_kind}` : ''}`
            : 'Today · rest'}
        </Eyebrow>
        <Subtitle style={{ maxWidth: 220, marginTop: 13 }}>
          {p ? <>{sessionName(p.session)}.{'\n'}<Em>Long-term gains.</Em></> : <>Rest.{'\n'}<Em>That counts too.</Em></>}
        </Subtitle>
        <Body style={{ marginTop: 7, maxWidth: 205 }} numberOfLines={2}>
          {p
            ? `${p.target_minutes[0]}–${p.target_minutes[1]} min · ${p.blocks?.length ? `${p.blocks.length} blocks` : 'easy'}`
            : today?.day?.label ?? 'Golf, mobility, or a walk.'}
        </Body>
        <HeroActions>
          {isRun ? (
            <Button label="Log the run" haptic="light" onPress={onLogRun} />
          ) : p && p.session !== 'MOB' ? (
            <Button
              label={done ? 'View session' : starting ? 'Starting…' : 'Start session'}
              iconAfter="arrow-forward" iconAfterRotate={-45}
              haptic="light" disabled={starting} onPress={onStart}
            />
          ) : (
            <Button label="Mobility routine" kind="secondary" onPress={() => onAdjust(today?.date, today?.day)} />
          )}
          <IconButton
            icon="options-outline"
            accessibilityLabel="Adjust session"
            background={c.panel2}
            haptic="soft"
            onPress={() => onAdjust(today?.date, today?.day)}
          />
        </HeroActions>
      </Hero>
      {today?.day?.adjustment_id ? (
        <View style={{ alignItems: 'center' }}>
          <InlineButton label="Undo my change" color={c.accent} onPress={onUndo} />
        </View>
      ) : null}
      {p?.day_note ? <Small style={{ marginTop: 10, color: c.warm }}>{p.day_note}</Small> : null}

      {p?.blocks?.length ? (
        <>
          <Section title="Today’s work" trailing={<Small>{p.budget}</Small>} />
          {p.blocks.map((b: any) => (
            <View key={b.name}>
              <Eyebrow style={{ marginTop: 12, marginBottom: 4 }}>{b.name} · {b.minutes} min</Eyebrow>
              {b.exercises.map((e: any, i: number) => (
                <DetailRow
                  key={`${b.name}-${i}`}
                  label={e.name}
                  sub={e.notes ?? undefined}
                  value={`${e.sets} × ${e.reps}${e.per_side ? '/side' : ''}${e.load ? ` · ${e.load} lb` : ''}`}
                  last={i === b.exercises.length - 1}
                />
              ))}
            </View>
          ))}
        </>
      ) : null}
      {p?.run ? (
        <>
          <Section title="Running" trailing={<Small>{p.run.minutes} min</Small>} />
          <Body>{p.run.structure}</Body>
        </>
      ) : null}

      <Hint>Hold the session to make it fit your day</Hint>

      <Section title="The bigger picture" />
      <GoalLine title="From foundation to fairway" sub={program ? `${program.phase.name} · through ${prettyDate(program.phase.end)}` : 'Your programme'} onPress={onProgram} first />
      <GoalLine title="Small wins, adding up" sub="Training history and progress" onPress={onHistory} />
    </>
  );
}

function GoalLine({ title, sub, onPress, first }: { title: string; sub: string; onPress: () => void; first?: boolean }) {
  const { c } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${sub}`}
      onPress={() => { feel.selection(); onPress(); }}
      style={[s.goal, { borderTopColor: first ? 'transparent' : c.line }]}
    >
      <View style={{ flex: 1 }}>
        <Animated.Text style={[s.goalTitle, { color: c.fg }]}>{title}</Animated.Text>
        <Small style={{ marginTop: 4 }}>{sub}</Small>
      </View>
      <Ionicons name="arrow-forward" size={16} color={c.muted} style={{ transform: [{ rotate: '-45deg' }] }} />
    </Pressable>
  );
}

// --- Week -------------------------------------------------------------------

function WeekView({ week, onAdjust }: { week: TrainWeek | null; onAdjust: (d: string, day: TrainDay) => void }) {
  const { c } = useTheme();
  const todayIso = new Date().toISOString().slice(0, 10);
  if (!week) return <Body>Loading the week…</Body>;

  return (
    <>
      <Title>A week{'\n'}<Em>that fits.</Em></Title>
      <Body style={{ marginTop: 12 }}>
        Week of {prettyDate(week.week_start)} · {week.week_kind} week · rotation {week.rotation}
      </Body>

      <View style={{ marginTop: 20 }}>
        {week.days.map(d => {
          const past = d.date < todayIso;
          return (
            <Pressable
              key={d.date}
              accessibilityRole="button"
              accessibilityLabel={`${d.weekday}. ${d.label}${d.note ? `. ${d.note}` : ''}`}
              disabled={past}
              onPress={() => onAdjust(d.date, d)}
              style={[s.weekRow, { borderBottomColor: c.line }, past && { opacity: 0.55 }]}
            >
              <View style={{ width: 35 }}>
                <Small>{d.weekday}</Small>
                <Small style={{ color: c.fg }}>{Number(d.date.slice(8, 10))}</Small>
              </View>
              <View style={{ flex: 1 }}>
                <Animated.Text style={[s.goalTitle, { color: c.fg }]} numberOfLines={1}>
                  {d.travel ? 'Travel · mobility' : d.label}
                </Animated.Text>
                <Small style={{ marginTop: 2 }}>
                  {sessionName(d.session)}{d.adjusted ? ' · your change' : ''}{d.note ? ` · ${d.note}` : ''}
                </Small>
              </View>
              {d.status === 'completed'
                ? <Ionicons name="checkmark" size={16} color={c.green} />
                : past ? null : <Ionicons name="chevron-forward" size={16} color={c.muted} />}
            </Pressable>
          );
        })}
      </View>
      <Small style={{ marginTop: 14 }}>
        Tap a day to change it. A displaced session moves to the nearest free day; lower-body work
        stays 48 hours apart, and nothing is stacked.
      </Small>
    </>
  );
}

// --- Program ----------------------------------------------------------------

function ProgramView({ program, events, openPhase, setOpenPhase, onFive }: any) {
  const { c } = useTheme();
  const sheet = useSheet();
  const toast = useToast();
  if (!program) return <Body>Loading the programme…</Body>;

  const sessionSheet = (id: string, sess: any) => {
    sheet.open(`${id} · ${sess.title}`, () => (
      <View>
        <Body>{sess.target_minutes[0]}–{sess.target_minutes[1]} minutes</Body>
        <Small style={{ marginTop: 12 }}>{sess.budget}</Small>
      </View>
    ));
  };

  const shareLog = async () => {
    try {
      const l = await getTrainLog();
      await Share.share({ message: l.text });
    } catch { toast.show('Could not build the log.'); }
  };

  return (
    <>
      <Eyebrow>{prettyDate(program.start)} → spring 2027</Eyebrow>
      <Title style={{ marginTop: 10 }}>Your season,{'\n'}<Em>taking shape.</Em></Title>

      <Panel style={{ marginTop: 18, marginBottom: 23, padding: 20, borderRadius: radius.panel }}>
        <Eyebrow>Now · phase {program.phases.findIndex((x: any) => x.key === program.phase.key) + 1} of {program.phases.length}</Eyebrow>
        <Subtitle style={{ marginVertical: 13, fontSize: 30 }}>{program.phase.name}.</Subtitle>
        <Body>{program.phase.strength}</Body>
        <Body style={{ marginTop: 8 }}>Running · {program.phase.running}</Body>
        <View style={s.rowBetween}>
          <Small>{prettyDate(program.phase.start)} – {prettyDate(program.phase.end)}</Small>
          <Small>{program.five_sessions ? '5' : '4'} sessions / week</Small>
        </View>
      </Panel>

      <Section title="The road to your season." />
      <View style={{ marginBottom: 25 }}>
        {program.phases.map((ph: any, i: number) => {
          const open = openPhase === ph.key;
          const current = ph.key === program.phase.key;
          return (
            <View key={ph.key} style={[s.phase, { borderLeftColor: i === program.phases.length - 1 ? 'transparent' : c.line }]}>
              <View style={[s.phaseDot, { backgroundColor: open || current ? c.accent : c.muted, borderColor: c.bg }]} />
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ expanded: open }}
                onPress={() => { feel.selection(); setOpenPhase(open ? null : ph.key); }}
                style={s.phaseSummary}
              >
                <View style={{ flex: 1 }}>
                  <Animated.Text style={[s.goalTitle, { color: c.fg }]}>{ph.name}</Animated.Text>
                  <Small style={{ marginTop: 5 }}>
                    {prettyDate(ph.start)} – {prettyDate(ph.end)}{current ? ' · Current phase' : ''}
                  </Small>
                </View>
                <Ionicons name="add" size={15} color={c.muted} style={{ transform: [{ rotate: open ? '45deg' : '0deg' }] }} />
              </Pressable>
              {open ? (
                <View style={{ paddingBottom: 14 }}>
                  <Small style={{ color: c.fg, fontFamily: fonts.medium }}>Strength</Small>
                  <Small style={{ marginBottom: 8, lineHeight: 12 * 1.6 }}>{ph.notes ?? ph.strength}</Small>
                  <Small style={{ color: c.fg, fontFamily: fonts.medium }}>Running</Small>
                  <Small style={{ lineHeight: 12 * 1.6 }}>{ph.run_note ?? ph.running}</Small>
                </View>
              ) : null}
            </View>
          );
        })}
      </View>

      <Section title="Room to recover." />
      <Body>Lighter weeks are part of the programme.</Body>
      <View style={s.dates}>
        {program.lighter_weeks.map((d: string) => {
          const next = d === program.next_lighter_week;
          return (
            <View key={d} style={[s.date, { backgroundColor: next ? c.soft : c.panel }]}>
              <Small style={{ color: next ? c.accent : c.muted }}>{prettyDate(d)}{next ? ' · next' : ''}</Small>
            </View>
          );
        })}
      </View>
      <Small style={{ marginVertical: 12, lineHeight: 11 * 1.6 }}>
        Sets down a third to a half. RPE 6–7, power halved, running easy. Resume from the previous load.
      </Small>

      <Section title="Tournaments & rounds." />
      {events.length ? events.map((e: GolfEventData) => (
        <DetailRow key={e.id} label={e.name} sub={e.kind} value={prettyDate(e.event_date)} />
      )) : (
        <DetailRow label="First event" sub="Planning date · no tournament added" value={prettyDate(program.first_event)} />
      )}

      <Section title="The five sessions." />
      {Object.entries(program.sessions).map(([id, sess]: any) => (
        <Pressable
          key={id}
          accessibilityRole="button"
          accessibilityLabel={`${id}, ${sess.title}`}
          onPress={() => { feel.selection(); sessionSheet(id, sess); }}
          style={[s.sessionRow, { borderTopColor: c.line }]}
        >
          <Animated.Text style={[s.sessionNum, { color: c.accent }]}>{id.slice(1).padStart(2, '0')}</Animated.Text>
          <View style={{ flex: 1 }}>
            <Animated.Text style={[s.goalTitle, { color: c.fg }]}>{sess.title}</Animated.Text>
            <Small style={{ marginTop: 4 }}>
              {sess.target_minutes[0]}–{sess.target_minutes[1]} min
              {id === 'S5' ? (program.five_sessions ? ' · included' : ' · optional, off') : ''}
            </Small>
          </View>
          <Ionicons name="chevron-forward" size={16} color={c.muted} />
        </Pressable>
      ))}
      <Switch
        label="Include Session 5 · easy cardio"
        value={program.five_sessions}
        onValueChange={onFive}
      />
      <Small style={{ lineHeight: 11 * 1.6 }}>
        70-minute cap. No medicine-ball throws or tosses. Progress within each phase’s rep range.
      </Small>

      <Section title="Mobility, every day." trailing={<Small>~8 min</Small>} />
      {program.mobility.map((mv: any, i: number) => (
        <DetailRow key={mv.movement} label={mv.movement} value={mv.dose} last={i === program.mobility.length - 1} />
      ))}

      <Button full kind="quiet" label="View this week’s log" style={{ marginTop: 18 }} onPress={shareLog} />
      {program.spec_ok === false ? <Notice icon="alert-circle-outline">The programme spec check is failing.</Notice> : null}
    </>
  );
}

// --- History ----------------------------------------------------------------

function HistoryView({ history }: { history: TrainingItem[] }) {
  const { c } = useTheme();
  return (
    <>
      <Title>Work done.{'\n'}<Em>Progress kept.</Em></Title>
      <Body style={{ marginTop: 12, marginBottom: 8 }}>Recent sessions and runs</Body>
      {history.length ? history.map(item => (
        <View key={`${item.type}-${item.id}`} style={[s.weekRow, { borderBottomColor: c.line }]}>
          <View style={{ width: 44 }}>
            <Small>{prettyDate(item.date)}</Small>
          </View>
          <View style={{ flex: 1 }}>
            <Animated.Text style={[s.goalTitle, { color: c.fg }]} numberOfLines={1}>
              {item.type === 'workout' ? sessionName(item.day_type ?? null) : item.label}
            </Animated.Text>
            <Small style={{ marginTop: 2 }} numberOfLines={1}>{item.detail}</Small>
          </View>
          {item.rpe != null ? <Small>RPE {item.rpe}</Small> : <Ionicons name="checkmark" size={16} color={c.green} />}
        </View>
      )) : <Body>Nothing logged yet.</Body>}
    </>
  );
}

const s = StyleSheet.create({
  nav: { flexDirection: 'row', padding: 4, borderRadius: 17, marginBottom: 24 },
  well: { position: 'absolute', top: 4, bottom: 4, left: 4, borderRadius: 13 },
  navBtn: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingVertical: 10 },
  navLabel: { fontFamily: fonts.regular, fontSize: 12 },

  weekStrip: { flexDirection: 'row', gap: 3, marginBottom: 20 },
  day: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 18, gap: 8, minHeight: 65, justifyContent: 'center' },
  dayNum: { fontFamily: fonts.medium, fontSize: 15 },

  goal: { flexDirection: 'row', alignItems: 'center', gap: 12, borderTopWidth: 1, paddingVertical: 18 },
  goalTitle: { fontFamily: fonts.medium, fontSize: 13.5, lineHeight: 13.5 * 1.45 },

  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 17, flexWrap: 'wrap' },

  weekRow: { flexDirection: 'row', alignItems: 'center', gap: 15, paddingVertical: 16, borderBottomWidth: 1 },

  phase: { paddingLeft: 26, marginLeft: 7, borderLeftWidth: 1, position: 'relative' },
  phaseDot: { position: 'absolute', left: -5, top: 20, width: 9, height: 9, borderRadius: 5, borderWidth: 5 },
  phaseSummary: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 14, minHeight: 69, paddingVertical: 12 },

  dates: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginVertical: 16 },
  date: { borderRadius: 10, paddingVertical: 9, paddingHorizontal: 11 },

  sessionRow: { flexDirection: 'row', alignItems: 'center', gap: 13, borderTopWidth: 1, paddingVertical: 16 },
  sessionNum: { fontFamily: fonts.serif, fontSize: 25, width: 27 },
});
