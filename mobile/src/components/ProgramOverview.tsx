/**
 * ProgramOverview — the Program segment: the phase timeline Sept 2026 → spring 2027, lighter weeks,
 * tournaments (the earliest sets the pre-event taper), the five sessions, settings and the weekly log.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Share, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { colors, fonts, spacing, typography } from '../theme';
import { GolfEventData, TrainProgram, addGolfEvent, deleteGolfEvent, getGolfEvents, getTrainLog, getTrainProgram, patchTrainSettings } from '../api/client';
import { haptic } from '../utils/haptics';
import { SESSION_COLOR, short } from './DayRows';

const PHASE_COLOR: Record<string, string> = { baseline: '#6F708A', build: '#22D3EE', strength: '#8B5CF6', consolidate: '#F97316', golf_power: '#EC4899', pre_event: '#F59E0B', in_season: '#76C99C' };

export default function ProgramOverview({ navigation }: { navigation: any }) {
  const [program, setProgram] = useState<TrainProgram | null>(null);
  const [events, setEvents] = useState<GolfEventData[]>([]);
  const today = new Date().toISOString().slice(0, 10);

  const load = useCallback(async () => {
    try { const [p, e] = await Promise.all([getTrainProgram(), getGolfEvents()]); setProgram(p); setEvents(e); } catch (err) { console.warn('program', err); }
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => navigation?.addListener?.('focus', load), [navigation, load]);

  const addEvent = useCallback(() => {
    if (!Alert.prompt) { Alert.alert('Add a tournament', 'Use the web app to add events on this platform.'); return; }
    Alert.prompt('Tournament date', 'YYYY-MM-DD (first round). Tournament weeks switch to the taper automatically.', (date) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) return;
      Alert.prompt('Name', 'e.g. Club championship', async (name) => {
        try { await addGolfEvent({ event_date: date!, name: name || 'Tournament' }); haptic.success(); load(); } catch (err) { console.warn(err); }
      });
    });
  }, [load]);

  const shareLog = useCallback(async () => {
    try { const l = await getTrainLog(); await Share.share({ message: l.text }); } catch (err) { console.warn(err); }
  }, []);

  if (!program) return <Text style={s.help}>Loading the program…</Text>;

  const start = new Date(program.start + 'T00:00:00').getTime();
  const end = new Date(program.phases[program.phases.length - 1].end + 'T00:00:00').getTime();
  const pct = (iso: string) => Math.max(0, Math.min(1, (new Date(iso + 'T00:00:00').getTime() - start) / (end - start)));

  return (
    <View style={{ paddingHorizontal: spacing.md }}>
      <View style={s.card}>
        <Text style={typography.eyebrow}>SEPT 2026 → SPRING 2027 · FIRST EVENT {short(program.first_event).toUpperCase()}</Text>
        <View style={s.timeline}>
          {program.phases.map(ph => (
            <View key={ph.key} style={[s.seg, { left: `${pct(ph.start) * 100}%`, width: `${(pct(ph.end) - pct(ph.start)) * 100}%`, backgroundColor: PHASE_COLOR[ph.key] || colors.accent, opacity: ph.key === program.phase.key ? 1 : 0.45 }]} />
          ))}
          <View style={[s.now, { left: `${pct(today) * 100}%` }]} />
        </View>
        {program.phases.map(ph => (
          <View key={ph.key} style={[s.phaseRow, ph.key === program.phase.key && s.phaseRowNow]}>
            <View style={[s.dot, { backgroundColor: PHASE_COLOR[ph.key] || colors.accent }]} />
            <Text style={[s.phaseName, ph.key === program.phase.key && { color: colors.text }]}>{ph.name}</Text>
            <Text style={s.meta}>{short(ph.start)} – {short(ph.end)}</Text>
          </View>
        ))}
        <Text style={s.help}>Now: {program.phase.strength}</Text>
        <Text style={s.help}>Running: {program.phase.running}</Text>
      </View>

      <View style={s.card}>
        <Text style={typography.eyebrow}>LIGHTER WEEKS</Text>
        <Text style={s.help}>Sets down a third to a half, RPE 6–7, power halved, running easy. Then resume from the previous load.</Text>
        <View style={s.chips}>{program.lighter_weeks.map(w => <Text key={w} style={[s.chip, w === program.next_lighter_week && s.chipNext, w < today && { opacity: 0.45 }]}>{short(w)}</Text>)}</View>
      </View>

      <View style={s.card}>
        <View style={s.rowBetween}>
          <Text style={typography.eyebrow}>TOURNAMENTS &amp; ROUNDS</Text>
          <TouchableOpacity onPress={addEvent}><Text style={s.link}>+ Add</Text></TouchableOpacity>
        </View>
        {events.length ? events.map(e => (
          <View key={e.id} style={s.exRow}>
            <Text style={s.exName}>{e.name} <Text style={s.meta}>· {e.kind}</Text></Text>
            <Text style={s.exDose}>{short(e.event_date)}</Text>
            <TouchableOpacity onPress={() => Alert.alert('Remove?', e.name, [{ text: 'Cancel', style: 'cancel' }, { text: 'Remove', style: 'destructive', onPress: async () => { await deleteGolfEvent(e.id); load(); } }])}><Text style={[s.meta, { color: colors.error, marginLeft: 10 }]}>×</Text></TouchableOpacity>
          </View>
        )) : <Text style={s.help}>None yet. The earliest tournament sets when the pre-event taper starts; tournament weeks switch to the taper template.</Text>}
      </View>

      <View style={s.card}>
        <Text style={typography.eyebrow}>THE FIVE SESSIONS</Text>
        {Object.entries(program.sessions).map(([id, sess]) => (
          <View key={id} style={s.exRow}>
            <View style={[s.dot, { backgroundColor: SESSION_COLOR[id] || colors.accent }]} />
            <Text style={s.exName}>{id} · {sess.title}</Text>
            <Text style={s.exDose}>{sess.target_minutes[0]}–{sess.target_minutes[1]} min</Text>
          </View>
        ))}
        <View style={[s.rowBetween, { marginTop: 10 }]}>
          <Text style={s.exName}>Include Session 5 (easy cardio)</Text>
          <Switch value={program.five_sessions} onValueChange={async v => { try { await patchTrainSettings({ five_sessions: v }); haptic.light(); load(); } catch (err) { console.warn(err); } }} trackColor={{ true: colors.accent, false: colors.line }} />
        </View>
        <Text style={s.help}>Hard cap 70 minutes per session. No medicine-ball throws or tosses. Double progression inside each phase's rep range.</Text>
      </View>

      <View style={s.card}>
        <Text style={typography.eyebrow}>DAILY MOBILITY · ~8 MIN</Text>
        {program.mobility.map(m => <View key={m.movement} style={s.exRow}><Text style={s.exName}>{m.movement}</Text><Text style={s.exDose}>{m.dose}</Text></View>)}
      </View>

      <TouchableOpacity style={{ alignSelf: 'center', paddingVertical: 10 }} onPress={shareLog}><Text style={s.link}>Copy this week's log</Text></TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: colors.card, borderRadius: 18, borderWidth: 1, borderColor: colors.line, padding: 14, marginBottom: 12 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  timeline: { height: 10, borderRadius: 5, backgroundColor: colors.input, marginVertical: 12, overflow: 'visible' },
  seg: { position: 'absolute', top: 0, bottom: 0, borderRadius: 5 },
  now: { position: 'absolute', top: -4, width: 2, height: 18, backgroundColor: colors.text, marginLeft: -1 },
  phaseRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 5 },
  phaseRowNow: { backgroundColor: 'rgba(255,255,255,0.04)', marginHorizontal: -6, paddingHorizontal: 6, borderRadius: 8 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  phaseName: { fontFamily: fonts.medium, fontSize: 13, color: colors.textSecondary, flex: 1 },
  meta: { fontFamily: fonts.mono, fontSize: 10.5, color: colors.textTertiary },
  help: { fontFamily: fonts.regular, fontSize: 12.5, color: colors.textSecondary, lineHeight: 17, marginTop: 6 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  chip: { fontFamily: fonts.mono, fontSize: 11, color: colors.text, backgroundColor: colors.input, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: colors.line },
  chipNext: { borderColor: colors.info, color: colors.info },
  exRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingVertical: 5 },
  exName: { fontFamily: fonts.medium, fontSize: 13.5, color: colors.text, flex: 1 },
  exDose: { fontFamily: fonts.mono, fontSize: 11.5, color: colors.textSecondary },
  link: { fontFamily: fonts.semibold, fontSize: 13, color: colors.accentLight },
});
