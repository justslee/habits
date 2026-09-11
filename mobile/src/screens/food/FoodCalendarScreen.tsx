/**
 * Travel — what the planner knows about you being away, grouped into trips, and how it
 * affects the current cycle. The calendar itself is connected from Me → Connections.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import BottomSheet from '../../components/BottomSheet';
import { colors, fonts, radius, spacing, typography } from '../../theme';
import { CalendarFeedData, FoodCycle, TravelSpanData, addTravel, getCalendarFeeds, getCurrentCycle, getTravel, patchTravel } from '../../api/client';
import { haptic } from '../../utils/haptics';
import ScreenBackground from '../../components/ScreenBackground';

interface Trip { key: string; start: string; end: string; days: number; title: string; spans: TravelSpanData[]; unconfirmed: number; ignored: boolean }

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dayOf = (iso: string) => Number(iso.slice(8, 10));
const monOf = (iso: string) => MONTHS[Number(iso.slice(5, 7)) - 1];
const fmtRange = (a: string, b: string) => (a === b ? `${monOf(a)} ${dayOf(a)}` : monOf(a) === monOf(b) ? `${monOf(a)} ${dayOf(a)}–${dayOf(b)}` : `${monOf(a)} ${dayOf(a)} – ${monOf(b)} ${dayOf(b)}`);
const addDays = (iso: string, n: number) => { const d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };

function groupTrips(spans: TravelSpanData[]): Trip[] {
  const sorted = [...spans].sort((a, b) => a.start_date.localeCompare(b.start_date));
  const trips: Trip[] = [];
  for (const sp of sorted) {
    const last = trips[trips.length - 1];
    if (last && !sp.ignored && !last.ignored && sp.start_date <= addDays(last.end, 1)) {
      last.spans.push(sp);
      if (sp.end_date > last.end) last.end = sp.end_date;
      last.unconfirmed += sp.confirmed ? 0 : 1;
    } else {
      trips.push({ key: String(sp.id), start: sp.start_date, end: sp.end_date, days: 0, title: '', spans: [sp], unconfirmed: sp.confirmed ? 0 : 1, ignored: sp.ignored });
    }
  }
  for (const t of trips) {
    t.days = Math.round((new Date(t.end + 'T00:00:00').getTime() - new Date(t.start + 'T00:00:00').getTime()) / 86400000) + 1;
    const longest = [...t.spans].sort((a, b) => b.days - a.days)[0];
    const stay = t.spans.find(sp => /stay|hotel|airbnb/i.test(sp.summary || ''));
    const dest = (stay?.summary || longest.summary || 'Away').replace(/^(stay at|flight to)\s+/i, '');
    t.title = dest;
  }
  return trips;
}

export default function FoodCalendarScreen({ navigation }: any) {
  const [feed, setFeed] = useState<CalendarFeedData | null>(null);
  const [spans, setSpans] = useState<TravelSpanData[]>([]);
  const [cycle, setCycle] = useState<FoodCycle | null>(null);
  const [adding, setAdding] = useState(false);
  const [manual, setManual] = useState({ start: '', end: '', summary: '' });

  const load = useCallback(async () => {
    try {
      const [f, t, c] = await Promise.all([getCalendarFeeds().catch(() => []), getTravel(), getCurrentCycle().catch(() => null)]);
      setFeed(f[0] ?? null);
      setSpans(t);
      setCycle(c);
    } catch (err) {
      console.warn('travel', err);
    }
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => navigation?.addListener?.('focus', load), [navigation, load]);

  const trips = useMemo(() => groupTrips(spans), [spans]);
  const upcoming = trips.filter(t => !t.ignored);
  const ignored = trips.filter(t => t.ignored);

  const setTrip = useCallback(async (t: Trip, p: { confirmed?: boolean; ignored?: boolean }) => {
    haptic.selection();
    try {
      const updated = await Promise.all(t.spans.map(sp => patchTravel(sp.id, p)));
      setSpans(prev => prev.map(x => updated.find(u => u.id === x.id) ?? x));
    } catch (err) { console.warn(err); }
  }, []);

  const add = useCallback(async () => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(manual.start) || !/^\d{4}-\d{2}-\d{2}$/.test(manual.end)) { Alert.alert('Dates', 'Use YYYY-MM-DD for both dates.'); return; }
    haptic.medium();
    try { await addTravel({ start_date: manual.start, end_date: manual.end, summary: manual.summary || 'Away' }); setManual({ start: '', end: '', summary: '' }); setAdding(false); load(); }
    catch (err: any) { Alert.alert('Could not add', String(err?.message || err)); }
  }, [manual, load]);

  const cycleOverlap = (t: Trip) => {
    if (!cycle) return 0;
    let n = 0;
    for (let d = t.start; d <= t.end; d = addDays(d, 1)) if (d >= cycle.start_date && d <= cycle.end_date) n++;
    return n;
  };

  return (
    <ScreenBackground>
      <ScrollView contentContainerStyle={s.container} keyboardShouldPersistTaps="handled">
        <Text style={typography.eyebrow}>{feed ? `GOOGLE CALENDAR · ${feed.events} EVENTS ON FILE` : 'NO CALENDAR CONNECTED'}</Text>
        <Text style={s.title}>Travel</Text>
        <Text style={s.lede}>
          {feed
            ? 'Trips found on your calendar. Each one shrinks the cycle it touches; confirm the ones that are right, ignore the ones that aren’t.'
            : 'Connect Google Calendar under Me → Connections and trips will show up here on their own. You can also add travel by hand.'}
        </Text>
        {!feed && (
          <TouchableOpacity style={s.primary} onPress={() => navigation.getParent()?.navigate('Me')} activeOpacity={0.9}>
            <Text style={s.primaryText}>Connect in Me → Connections</Text>
          </TouchableOpacity>
        )}

        {upcoming.map(t => {
          const overlap = cycleOverlap(t);
          return (
            <View key={t.key} style={s.trip}>
              <View style={s.tripHead}>
                <View style={s.dateBlock}>
                  <Text style={s.dateMon}>{monOf(t.start).toUpperCase()}</Text>
                  <Text style={s.dateDay}>{dayOf(t.start)}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.tripTitle} numberOfLines={1}>{t.title}</Text>
                  <Text style={s.tripMeta}>{fmtRange(t.start, t.end)} · {t.days} day{t.days === 1 ? '' : 's'}{t.unconfirmed ? ' · unconfirmed' : ' · confirmed'}</Text>
                </View>
              </View>
              {t.spans.length > 1 && (
                <View style={s.pieces}>
                  {t.spans.map(sp => <Text key={sp.id} style={s.piece} numberOfLines={1}>· {fmtRange(sp.start_date, sp.end_date)} — {sp.summary || 'Away'}</Text>)}
                </View>
              )}
              {overlap > 0 && cycle && (
                <View style={s.impact}><Text style={s.impactText}>Current cycle · {overlap} of its days away · {cycle.eating_days} eating days left</Text></View>
              )}
              <View style={s.actions}>
                {t.unconfirmed > 0 && <TouchableOpacity style={s.chip} onPress={() => setTrip(t, { confirmed: true })}><Text style={[s.chipText, { color: colors.success }]}>Confirm</Text></TouchableOpacity>}
                <TouchableOpacity style={s.chip} onPress={() => setTrip(t, { ignored: true })}><Text style={s.chipText}>Not travel</Text></TouchableOpacity>
              </View>
            </View>
          );
        })}
        {feed && upcoming.length === 0 && <Text style={s.help}>Nothing in the next four months. Travel added later is picked up within the hour.</Text>}

        <TouchableOpacity style={s.ghost} onPress={() => { haptic.light(); setAdding(true); }}><Text style={s.ghostText}>+ Add travel by hand</Text></TouchableOpacity>

        {ignored.length > 0 && (
          <>
            <Text style={[typography.eyebrow, { marginTop: 18, marginBottom: 8 }]}>IGNORED</Text>
            {ignored.map(t => (
              <View key={t.key} style={[s.trip, { opacity: 0.6 }]}>
                <Text style={s.tripTitle}>{t.title}</Text>
                <Text style={s.tripMeta}>{fmtRange(t.start, t.end)} · {t.days} day{t.days === 1 ? '' : 's'}</Text>
                <View style={s.actions}><TouchableOpacity style={s.chip} onPress={() => setTrip(t, { ignored: false })}><Text style={s.chipText}>Restore</Text></TouchableOpacity></View>
              </View>
            ))}
          </>
        )}
        <View style={{ height: 120 }} />
      </ScrollView>

      <BottomSheet visible={adding} onClose={() => setAdding(false)} maxHeightPct={0.6}>
        <View style={s.sheet}>
          <Text style={typography.eyebrow}>ADD TRAVEL</Text>
          <Text style={s.sheetTitle}>Away from</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TextInput value={manual.start} onChangeText={v => setManual(m => ({ ...m, start: v }))} placeholder="2026-10-03" placeholderTextColor={colors.textTertiary} style={[s.input, { flex: 1 }]} />
            <TextInput value={manual.end} onChangeText={v => setManual(m => ({ ...m, end: v }))} placeholder="2026-10-05" placeholderTextColor={colors.textTertiary} style={[s.input, { flex: 1 }]} />
          </View>
          <TextInput value={manual.summary} onChangeText={v => setManual(m => ({ ...m, summary: v }))} placeholder="Where (optional)" placeholderTextColor={colors.textTertiary} style={s.input} />
          <TouchableOpacity style={s.primary} onPress={add} activeOpacity={0.9}><Text style={s.primaryText}>Add</Text></TouchableOpacity>
        </View>
      </BottomSheet>
    </ScreenBackground>
  );
}

const s = StyleSheet.create({
  container: { paddingHorizontal: spacing.md, paddingTop: spacing.md, paddingBottom: 140 },
  title: { ...typography.serifLarge, marginTop: 4, marginBottom: 6 },
  lede: { fontFamily: fonts.regular, fontSize: 13.5, color: colors.textSecondary, lineHeight: 19, marginBottom: 14 },
  help: { fontFamily: fonts.regular, fontSize: 12.5, color: colors.textSecondary, lineHeight: 17, marginTop: 6 },
  trip: { backgroundColor: colors.card, borderRadius: 18, borderWidth: 1, borderColor: colors.line, padding: 14, marginBottom: 10 },
  tripHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  dateBlock: { width: 46, alignItems: 'center', paddingVertical: 4, borderRadius: 10, backgroundColor: colors.input },
  dateMon: { fontFamily: fonts.mono, fontSize: 9, letterSpacing: 1.2, color: colors.textTertiary },
  dateDay: { fontFamily: fonts.monoMedium, fontSize: 20, color: colors.text, letterSpacing: -0.5 },
  tripTitle: { fontFamily: fonts.semibold, fontSize: 16, color: colors.text },
  tripMeta: { fontFamily: fonts.regular, fontSize: 12, color: colors.textTertiary, marginTop: 2 },
  pieces: { marginTop: 10, gap: 3 },
  piece: { fontFamily: fonts.regular, fontSize: 12, color: colors.textSecondary },
  impact: { marginTop: 10, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8, backgroundColor: colors.accentMuted },
  impactText: { fontFamily: fonts.mono, fontSize: 10.5, letterSpacing: 0.4, color: colors.accentLight },
  actions: { flexDirection: 'row', gap: 8, marginTop: 10 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: colors.input, borderWidth: 1, borderColor: colors.line },
  chipText: { fontFamily: fonts.semibold, fontSize: 12, color: colors.textSecondary },
  primary: { backgroundColor: colors.accent, borderRadius: radius.md, paddingVertical: 13, alignItems: 'center', marginTop: 8, marginBottom: 12 },
  primaryText: { color: colors.bg, fontFamily: fonts.semibold, fontSize: 14 },
  ghost: { alignItems: 'center', paddingVertical: 12 },
  ghostText: { fontFamily: fonts.medium, fontSize: 13, color: colors.accentLight },
  sheet: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl, gap: spacing.sm },
  sheetTitle: { ...typography.serifTitle, marginTop: 4 },
  input: { backgroundColor: colors.input, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 11, color: colors.text, fontFamily: fonts.mono, fontSize: 13 },
});
