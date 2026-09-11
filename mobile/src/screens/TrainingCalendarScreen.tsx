/**
 * TrainingCalendarScreen — six-week outlook of the golf program: each week laid out around travel,
 * tournaments, lighter weeks and your changes. Tap a future day to change it.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Alert, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, fonts, spacing, typography } from '../theme';
import ScreenBackground from '../components/ScreenBackground';
import { AdjustResult, TrainDay, TrainWeek, getTrainWeek } from '../api/client';
import AdjustDaySheet from '../components/AdjustDaySheet';
import DayRows, { short } from '../components/DayRows';
import { haptic } from '../utils/haptics';

const KIND_COLOR: Record<string, string> = { normal: colors.accent, lighter: colors.info, tournament: colors.warning };
const WEEKS = 6;
const monday = (d: Date) => { const x = new Date(d); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x.toISOString().slice(0, 10); };
const addDays = (iso: string, n: number) => { const d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };

export default function TrainingCalendarScreen() {
  const today = new Date().toISOString().slice(0, 10);
  const [weeks, setWeeks] = useState<TrainWeek[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [pick, setPick] = useState<TrainDay | null>(null);

  const load = useCallback(async () => {
    const start = monday(new Date());
    try {
      const ws = await Promise.all(Array.from({ length: WEEKS }, (_, i) => getTrainWeek(addDays(start, i * 7))));
      setWeeks(ws);
    } catch (err) { console.warn('outlook', err); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const applied = (r: AdjustResult) => {
    setWeeks(prev => prev.map(w => (w.week_start === r.week.week_start ? r.week : w)));
    Alert.alert(r.note || 'Week re-planned', r.changes.join('\n'));
  };

  return (
    <ScreenBackground>
      <ScrollView
        contentContainerStyle={{ padding: spacing.md, paddingBottom: 120 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor={colors.accent} />}
      >
        <Text style={typography.eyebrow}>NEXT {WEEKS} WEEKS · AROUND TRAVEL, TOURNAMENTS AND YOUR CHANGES</Text>
        {!weeks.length && <Text style={s.help}>Loading…</Text>}
        {weeks.map(w => (
          <View key={w.week_start} style={s.card}>
            <View style={s.rowBetween}>
              <Text style={s.weekTitle}>{short(w.week_start)} – {short(addDays(w.week_start, 6))}</Text>
              <Text style={[s.pill, { color: KIND_COLOR[w.week_kind] || colors.textSecondary }]}>{w.week_kind.toUpperCase()} · {w.phase.toUpperCase()} · {w.rotation}</Text>
            </View>
            <DayRows days={w.days} today={today} compact onPressDay={d => { haptic.medium(); setPick(d); }} />
          </View>
        ))}
        <Text style={s.help}>✈ travel day (8-min mobility) · ↻ a day you changed · ✓ done. Lighter weeks and tournament tapers apply automatically.</Text>
      </ScrollView>
      {pick && <AdjustDaySheet visible={!!pick} onClose={() => setPick(null)} date={pick.date} day={pick} onApplied={applied} />}
    </ScreenBackground>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: colors.card, borderRadius: 18, borderWidth: 1, borderColor: colors.line, padding: 14, marginTop: 12 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 4 },
  weekTitle: { fontFamily: fonts.semibold, fontSize: 14, color: colors.text },
  pill: { fontFamily: fonts.mono, fontSize: 9.5, letterSpacing: 1 },
  help: { fontFamily: fonts.regular, fontSize: 12.5, color: colors.textSecondary, lineHeight: 17, marginTop: 12 },
});
