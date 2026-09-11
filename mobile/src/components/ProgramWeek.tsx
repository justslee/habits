/**
 * ProgramWeek — the Week segment: this week (or any week) laid out around travel, tournaments and
 * your changes. Tap a day to change it; undo any change from the list underneath.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors, fonts, spacing, typography } from '../theme';
import { AdjustResult, TrainDay, TrainWeek, getTrainWeek, revertTrainAdjustment } from '../api/client';
import { haptic } from '../utils/haptics';
import AdjustDaySheet from './AdjustDaySheet';
import DayRows, { short } from './DayRows';

const KIND_COLOR: Record<string, string> = { normal: colors.accent, lighter: colors.info, tournament: colors.warning };
const addDays = (iso: string, n: number) => { const d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };

export default function ProgramWeek({ navigation }: { navigation: any }) {
  const today = new Date().toISOString().slice(0, 10);
  const [start, setStart] = useState<string | undefined>(undefined);
  const [week, setWeek] = useState<TrainWeek | null>(null);
  const [pick, setPick] = useState<TrainDay | null>(null);

  const load = useCallback(async () => {
    try { setWeek(await getTrainWeek(start)); } catch (err) { console.warn('week', err); }
  }, [start]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => navigation?.addListener?.('focus', load), [navigation, load]);

  const applied = (r: AdjustResult) => {
    setWeek(r.week);
    Alert.alert(r.note || 'Week re-planned', r.changes.join('\n'));
  };
  const undo = async (id: number) => {
    try { const r = await revertTrainAdjustment(id); haptic.light(); setWeek(r.week); Alert.alert('Undone', r.changes.join('\n')); } catch (err) { console.warn(err); }
  };

  if (!week) return <Text style={s.help}>Loading the week…</Text>;
  const isThisWeek = week.days.some(d => d.date === today);

  return (
    <View style={{ paddingHorizontal: spacing.md }}>
      <View style={s.card}>
        <View style={s.rowBetween}>
          <TouchableOpacity onPress={() => { haptic.selection(); setStart(addDays(week.week_start, -7)); }} style={s.nav}><Text style={s.navText}>‹</Text></TouchableOpacity>
          <View style={{ alignItems: 'center' }}>
            <Text style={typography.eyebrow}>{isThisWeek ? 'THIS WEEK' : `WEEK OF ${short(week.week_start).toUpperCase()}`}</Text>
            <Text style={[s.pill, { color: KIND_COLOR[week.week_kind] || colors.textSecondary }]}>{week.week_kind.toUpperCase()} · {week.phase.toUpperCase()} · ROTATION {week.rotation}</Text>
          </View>
          <TouchableOpacity onPress={() => { haptic.selection(); setStart(addDays(week.week_start, 7)); }} style={s.nav}><Text style={s.navText}>›</Text></TouchableOpacity>
        </View>
        <DayRows days={week.days} today={today} onPressDay={d => { haptic.medium(); setPick(d); }} />
        <Text style={s.help}>Tap a day to change it — run outside, rest, golf, a different session, move it, or cap the time. The rest of the week re-plans around you: nothing stacks, lower-body sessions stay 48 h apart.</Text>
        {!isThisWeek && <TouchableOpacity onPress={() => setStart(undefined)} style={{ alignSelf: 'center', paddingVertical: 8 }}><Text style={s.link}>Back to this week</Text></TouchableOpacity>}
      </View>

      {week.adjustments.length > 0 && (
        <View style={s.card}>
          <Text style={typography.eyebrow}>YOUR CHANGES</Text>
          {week.adjustments.map(a => (
            <View key={a.id} style={s.adjRow}>
              <View style={{ flex: 1 }}>
                <Text style={s.adjTitle}>{short(a.date)} · {a.kind}{a.params.miles ? ` ${a.params.miles} mi` : ''}{a.params.minutes ? ` ${a.params.minutes} min` : ''}{a.params.session ? ` ${a.params.session}` : ''}</Text>
                {a.reason ? <Text style={s.help}>“{a.reason}”</Text> : null}
                {a.summary ? <Text style={s.help}>{a.summary}</Text> : null}
              </View>
              <TouchableOpacity onPress={() => undo(a.id)}><Text style={[s.link, { color: colors.error }]}>Undo</Text></TouchableOpacity>
            </View>
          ))}
        </View>
      )}

      <TouchableOpacity style={{ alignSelf: 'center', paddingVertical: 10 }} onPress={() => navigation?.navigate?.('TrainingCalendar')}>
        <Text style={s.link}>Six-week outlook →</Text>
      </TouchableOpacity>

      {pick && <AdjustDaySheet visible={!!pick} onClose={() => setPick(null)} date={pick.date} day={pick} onApplied={applied} />}
    </View>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: colors.card, borderRadius: 18, borderWidth: 1, borderColor: colors.line, padding: 14, marginBottom: 12 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  nav: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 18, backgroundColor: colors.input, borderWidth: 1, borderColor: colors.line },
  navText: { fontFamily: fonts.semibold, fontSize: 20, color: colors.text, marginTop: -2 },
  pill: { fontFamily: fonts.mono, fontSize: 9.5, letterSpacing: 1, marginTop: 3 },
  help: { fontFamily: fonts.regular, fontSize: 12.5, color: colors.textSecondary, lineHeight: 17, marginTop: 8 },
  link: { fontFamily: fonts.semibold, fontSize: 13, color: colors.accentLight },
  adjRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.line, marginTop: 8 },
  adjTitle: { fontFamily: fonts.medium, fontSize: 13.5, color: colors.text },
});
