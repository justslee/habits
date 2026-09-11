/**
 * ProgramToday — the Train tab's "today" view for the golf performance program:
 * phase + week kind, today's session (or rest/travel), the week laid out around travel and
 * tournaments, tournaments you can add, and the copyable weekly log.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors, fonts, radius, spacing, typography } from '../theme';
import {
  AdjustResult, TrainProgram, TrainToday, TrainWeek, getTrainProgram, getTrainToday, getTrainWeek, revertTrainAdjustment, startTrainToday,
} from '../api/client';
import { haptic } from '../utils/haptics';
import AdjustDaySheet from './AdjustDaySheet';

const KIND_COLOR: Record<string, string> = { normal: colors.accent, lighter: colors.info, tournament: colors.warning, travel: colors.textTertiary };
const SESSION_COLOR: Record<string, string> = { S1: '#8B5CF6', S2: '#F97316', S3: '#22D3EE', S4: '#EC4899', S5: '#76C99C', MOB: '#6F708A', RUN: '#3B82F6' };
const fmt = (iso: string) => new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

export default function ProgramToday({ navigation, onAsk }: { navigation: any; onAsk?: () => void }) {
  const [program, setProgram] = useState<TrainProgram | null>(null);
  const [today, setToday] = useState<TrainToday | null>(null);
  const [week, setWeek] = useState<TrainWeek | null>(null);
  const [starting, setStarting] = useState(false);
  const [adjustOpen, setAdjustOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const [p, t, w] = await Promise.all([getTrainProgram(), getTrainToday(), getTrainWeek()]);
      setProgram(p); setToday(t); setWeek(w);
    } catch (err) { console.warn('program', err); }
  }, []);

  const applied = useCallback((r: AdjustResult) => {
    setWeek(r.week); setToday(r.today);
    Alert.alert(r.note || 'Week re-planned', r.changes.join('\n'));
  }, []);
  const undo = useCallback(async () => {
    const id = today?.day?.adjustment_id;
    if (!id) return;
    try { const r = await revertTrainAdjustment(id); haptic.light(); setWeek(r.week); setToday(r.today); Alert.alert('Undone', r.changes.join('\n')); } catch (err) { console.warn(err); }
  }, [today]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => navigation?.addListener?.('focus', load), [navigation, load]);

  const start = useCallback(async () => {
    haptic.medium();
    setStarting(true);
    try {
      const r = await startTrainToday();
      navigation?.navigate?.(r.status === 'completed' ? 'WorkoutDetail' : 'TodayWorkout', { sessionId: r.session_id });
    } catch (err: any) {
      Alert.alert('Nothing to start', String(err?.message || err).replace(/^API \d+: /, '').replace(/^\{"detail":"|"\}$/g, ''));
    } finally { setStarting(false); }
  }, [navigation]);

  if (!program || !today || !week) return <Text style={s.help}>Loading the program…</Text>;
  const p = today.prescription;
  const kind = week.week_kind;

  return (
    <View style={{ paddingHorizontal: spacing.md }}>
      <View style={s.card}>
        <View style={s.rowBetween}>
          <Text style={typography.eyebrow}>GOLF PERFORMANCE · {program.phase.name.toUpperCase()}</Text>
          <Text style={[s.pill, { color: KIND_COLOR[kind] || colors.textSecondary }]}>{kind.toUpperCase()} WEEK · {week.rotation}</Text>
        </View>
        <Text style={s.help}>{program.phase.strength}</Text>
        <Text style={[s.help, { marginTop: 4 }]}>Running: {program.phase.running}</Text>
        <Text style={s.meta}>{fmt(program.phase.start)} – {fmt(program.phase.end)} · first event {fmt(program.first_event)}{program.next_lighter_week ? ` · next lighter week ${fmt(program.next_lighter_week)}` : ''}</Text>
      </View>

      {p ? (
        <View style={s.card}>
          <View style={s.rowBetween}>
            <Text style={[typography.eyebrow, { color: SESSION_COLOR[p.session] || colors.accent }]}>{p.session === 'MOB' ? 'TRAVEL DAY' : p.session === 'RUN' ? 'YOUR RUN · REPLACES THE GYM' : p.session.startsWith('T-') ? 'TOURNAMENT WEEK' : `SESSION ${p.session.slice(1)}${p.adjusted ? ' · YOUR CHANGE' : ''}`}</Text>
            <Text style={s.meta}>{p.target_minutes[0]}–{p.target_minutes[1]} min</Text>
          </View>
          <Text style={s.title}>{p.title}</Text>
          <Text style={s.budget}>{p.budget}</Text>
          {p.blocks.map(b => (
            <View key={b.name} style={s.block}>
              <Text style={s.blockName}>{b.name.toUpperCase()} · {b.minutes} MIN</Text>
              {b.exercises.map((e, i) => (
                <View key={i} style={s.exRow}>
                  <Text style={s.exName} numberOfLines={1}>{e.pair ? `${e.pair} · ` : ''}{e.name}</Text>
                  <Text style={s.exDose}>{e.sets} × {e.reps}{e.per_side ? '/side' : ''}{e.load ? ` · ${e.load} lb` : ''}</Text>
                </View>
              ))}
            </View>
          ))}
          {p.run && <View style={s.block}><Text style={s.blockName}>RUN · {p.run.minutes} MIN{p.run.miles ? ` · ${p.run.miles} MI` : ''}{p.run.intensity ? ` · ${p.run.intensity.toUpperCase()}` : ''}</Text><Text style={s.exName}>{p.run.structure}</Text></View>}
          {p.day_note ? <Text style={[s.rule, { color: colors.warning }]}>{p.day_note}</Text> : null}
          {p.session === 'MOB' && <View style={s.block}>{p.mobility.map(([m, d]) => <View key={m} style={s.exRow}><Text style={s.exName}>{m}</Text><Text style={s.exDose}>{d}</Text></View>)}</View>}
          <Text style={s.rule}>{p.rules[0]}</Text>
          {p.session === 'RUN' ? (
            today.day?.status === 'completed'
              ? <Text style={[s.rule, { color: colors.success }]}>Run logged ✓</Text>
              : <TouchableOpacity style={[s.btn, { backgroundColor: SESSION_COLOR.RUN }]} onPress={() => { haptic.medium(); navigation?.navigate?.('LogRun', { distance: p.run?.miles, runType: p.run?.intensity === 'hard' ? 'tempo' : 'easy' }); }} activeOpacity={0.9}><Text style={s.btnText}>Log the run</Text></TouchableOpacity>
          ) : today.status === 'completed' ? (
            <TouchableOpacity style={[s.btn, { backgroundColor: colors.accentMuted }]} onPress={() => navigation?.navigate?.('WorkoutDetail', { sessionId: today.session_id })}><Text style={[s.btnText, { color: colors.accentLight }]}>Done · view session</Text></TouchableOpacity>
          ) : p.session !== 'MOB' ? (
            <TouchableOpacity style={s.btn} onPress={start} disabled={starting} activeOpacity={0.9}><Text style={s.btnText}>{starting ? 'Starting…' : today.session_id ? 'Continue session' : 'Start session · timer on'}</Text></TouchableOpacity>
          ) : null}
          {today.status !== 'completed' && (
            <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 18, marginTop: 4 }}>
              <TouchableOpacity style={s.ghost} onPress={() => { haptic.light(); setAdjustOpen(true); }}><Text style={s.link}>Change today</Text></TouchableOpacity>
              {today.day?.adjustment_id ? <TouchableOpacity style={s.ghost} onPress={undo}><Text style={[s.link, { color: colors.error }]}>Undo my change</Text></TouchableOpacity> : null}
            </View>
          )}
        </View>
      ) : (
        <View style={s.card}>
          <Text style={typography.eyebrow}>TODAY</Text>
          <Text style={s.title}>{today.day?.label || 'Rest, golf or mobility'}</Text>
          <Text style={s.help}>8 minutes of the daily mobility routine counts. No catch-up gym work.</Text>
          <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 18, marginTop: 4 }}>
            <TouchableOpacity style={s.ghost} onPress={() => { haptic.light(); setAdjustOpen(true); }}><Text style={s.link}>Train today anyway</Text></TouchableOpacity>
            {today.day?.adjustment_id ? <TouchableOpacity style={s.ghost} onPress={undo}><Text style={[s.link, { color: colors.error }]}>Undo my change</Text></TouchableOpacity> : null}
          </View>
        </View>
      )}

      <View style={s.card}>
        <Text style={typography.eyebrow}>THIS WEEK · {week.phase.toUpperCase()}</Text>
        <View style={s.strip}>
          {week.days.map(d => {
            const isToday = d.date === today.date;
            return (
              <View key={d.date} style={[s.day, isToday && s.dayToday, d.travel && s.dayTravel]}>
                <Text style={s.dayD}>{d.weekday}</Text>
                <View style={[s.dayDot, { backgroundColor: d.session ? (SESSION_COLOR[d.session] || colors.warning) : 'transparent', borderColor: d.session ? 'transparent' : colors.line }]} />
                <Text style={[s.dayS, { color: d.status === 'completed' ? colors.success : colors.text }]} numberOfLines={1}>{d.travel ? '✈' : d.session === 'RUN' ? '🏃' : d.session ? (d.session.startsWith('T-') ? d.session.slice(2, 5) : d.session) : d.adjusted ? '↻' : '—'}</Text>
              </View>
            );
          })}
        </View>
        {week.days.filter(d => d.note).map(d => <Text key={d.date} style={s.help}>{d.weekday}: {d.note}</Text>)}
      </View>

      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 18 }}>
        {onAsk && <TouchableOpacity style={s.ghost} onPress={onAsk}><Text style={s.link}>Ask the coach</Text></TouchableOpacity>}
        <TouchableOpacity style={s.ghost} onPress={() => { haptic.medium(); navigation?.navigate?.('CoachVoice'); }}><Text style={s.link}>🎙 Talk live</Text></TouchableOpacity>
      </View>
      <AdjustDaySheet visible={adjustOpen} onClose={() => setAdjustOpen(false)} date={today.date} day={today.day} onApplied={applied} />
    </View>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: colors.card, borderRadius: 18, borderWidth: 1, borderColor: colors.line, padding: 14, marginBottom: 12 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  pill: { fontFamily: fonts.mono, fontSize: 9.5, letterSpacing: 1 },
  title: { ...typography.serifTitle, marginTop: 4 },
  budget: { fontFamily: fonts.mono, fontSize: 10.5, color: colors.textTertiary, marginTop: 2, marginBottom: 6, letterSpacing: 0.3 },
  help: { fontFamily: fonts.regular, fontSize: 12.5, color: colors.textSecondary, lineHeight: 17, marginTop: 6 },
  meta: { fontFamily: fonts.mono, fontSize: 10.5, color: colors.textTertiary, marginTop: 6 },
  block: { marginTop: 10, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.line },
  blockName: { fontFamily: fonts.mono, fontSize: 9.5, letterSpacing: 1.2, color: colors.textTertiary, marginBottom: 4 },
  exRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingVertical: 4 },
  exName: { fontFamily: fonts.medium, fontSize: 13.5, color: colors.text, flex: 1 },
  exDose: { fontFamily: fonts.mono, fontSize: 11.5, color: colors.textSecondary },
  rule: { fontFamily: fonts.regular, fontSize: 11.5, color: colors.textTertiary, marginTop: 10, lineHeight: 15 },
  btn: { backgroundColor: colors.accent, borderRadius: radius.md, paddingVertical: 13, alignItems: 'center', marginTop: 12 },
  btnText: { fontFamily: fonts.semibold, fontSize: 14, color: colors.bg },
  strip: { flexDirection: 'row', gap: 4, marginTop: 8 },
  day: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 10, backgroundColor: colors.input, borderWidth: 1, borderColor: colors.line, gap: 4 },
  dayToday: { borderColor: colors.accent },
  dayTravel: { opacity: 0.6 },
  dayD: { fontFamily: fonts.mono, fontSize: 9, color: colors.textTertiary },
  dayDot: { width: 8, height: 8, borderRadius: 4, borderWidth: 1 },
  dayS: { fontFamily: fonts.mono, fontSize: 10, color: colors.text },
  link: { fontFamily: fonts.semibold, fontSize: 13, color: colors.accentLight },
  ghost: { paddingVertical: 10 },
});
