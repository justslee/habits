/**
 * FoodCalendarScreen — paste the Google Calendar secret iCal address, sync, and review
 * the travel spans the planner found (confirm / ignore). Manual spans too.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { colors, fonts, radius, spacing, typography } from '../../theme';
import {
  CalendarFeedData, TravelSpanData, addTravel, deleteCalendarFeed, getCalendarFeeds, getTravel, patchTravel, putCalendarFeed, syncCalendar,
} from '../../api/client';
import { haptic } from '../../utils/haptics';
import ScreenBackground from '../../components/ScreenBackground';

export default function FoodCalendarScreen() {
  const [feeds, setFeeds] = useState<CalendarFeedData[]>([]);
  const [travel, setTravel] = useState<TravelSpanData[]>([]);
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [manual, setManual] = useState({ start: '', end: '', summary: '' });

  const load = useCallback(async () => {
    try {
      const [f, t] = await Promise.all([getCalendarFeeds(), getTravel()]);
      setFeeds(f);
      setTravel(t);
    } catch (err) {
      console.warn('calendar', err);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const save = useCallback(async () => {
    haptic.medium();
    setBusy(true);
    try {
      await putCalendarFeed(url.trim());
      setUrl('');
      await load();
      haptic.success();
    } catch (err: any) {
      Alert.alert('Could not connect', String(err?.message || err).replace(/^API \d+: /, '').replace(/^\{"detail":"|"\}$/g, ''));
    } finally {
      setBusy(false);
    }
  }, [url, load]);

  const sync = useCallback(async () => { haptic.light(); setBusy(true); try { await syncCalendar(); await load(); } finally { setBusy(false); } }, [load]);
  const remove = useCallback(() => {
    Alert.alert('Disconnect calendar?', 'Travel spans from it are removed. Manual spans stay.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Disconnect', style: 'destructive', onPress: async () => { await deleteCalendarFeed(); load(); } },
    ]);
  }, [load]);

  const setSpan = useCallback(async (t: TravelSpanData, p: { confirmed?: boolean; ignored?: boolean }) => {
    haptic.selection();
    try { const u = await patchTravel(t.id, p); setTravel(prev => prev.map(x => (x.id === u.id ? u : x))); } catch (err) { console.warn(err); }
  }, []);

  const addManual = useCallback(async () => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(manual.start) || !/^\d{4}-\d{2}-\d{2}$/.test(manual.end)) {
      Alert.alert('Dates', 'Use YYYY-MM-DD for both dates.');
      return;
    }
    haptic.medium();
    try { await addTravel({ start_date: manual.start, end_date: manual.end, summary: manual.summary || 'Away' }); setManual({ start: '', end: '', summary: '' }); load(); }
    catch (err: any) { Alert.alert('Could not add', String(err?.message || err)); }
  }, [manual, load]);

  const feed = feeds[0];

  return (
    <ScreenBackground>
      <ScrollView contentContainerStyle={s.container} keyboardShouldPersistTaps="handled">
        <Text style={typography.eyebrow}>GOOGLE CALENDAR · READ-ONLY · NO LOGIN</Text>
        <Text style={s.title}>Travel</Text>

        <View style={s.card}>
          {feed ? (
            <>
              <Text style={s.body}>{feed.label} · {feed.url_host}</Text>
              <Text style={s.help}>{feed.last_error ? `Last sync failed: ${feed.last_error}` : feed.last_synced_at ? `Synced ${feed.last_synced_at.slice(0, 16).replace('T', ' ')} · ${feed.spans} travel span${feed.spans === 1 ? '' : 's'}` : 'Not synced yet'}. Re-synced every hour.</Text>
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                <TouchableOpacity style={s.ghostBtn} onPress={sync} disabled={busy}><Text style={s.ghostBtnT}>{busy ? 'Syncing…' : 'Sync now'}</Text></TouchableOpacity>
                <TouchableOpacity style={s.ghostBtn} onPress={remove}><Text style={[s.ghostBtnT, { color: colors.error }]}>Disconnect</Text></TouchableOpacity>
              </View>
            </>
          ) : (
            <>
              <Text style={s.body}>Connect your calendar</Text>
              <Text style={s.help}>In Google Calendar on the web: Settings → your calendar → Integrate calendar → copy the "Secret address in iCal format". Paste it here. Nothing else is shared.</Text>
              <TextInput value={url} onChangeText={setUrl} placeholder="https://calendar.google.com/calendar/ical/…/basic.ics" placeholderTextColor={colors.textTertiary} autoCapitalize="none" autoCorrect={false} keyboardType="url" style={s.input} />
              <TouchableOpacity style={s.btn} onPress={save} disabled={busy || !url.trim()} activeOpacity={0.9}><Text style={s.btnText}>{busy ? 'Connecting…' : 'Connect and sync'}</Text></TouchableOpacity>
            </>
          )}
        </View>

        <Text style={[typography.eyebrow, { marginBottom: 8 }]}>UPCOMING TRAVEL</Text>
        {travel.map(t => (
          <View key={t.id} style={[s.card, t.ignored && { opacity: 0.5 }]}>
            <Text style={s.body}>{t.summary || 'Away'}</Text>
            <Text style={s.help}>{t.start_date} → {t.end_date} · {t.days} day{t.days === 1 ? '' : 's'} · {t.reason}{t.confirmed ? ' · confirmed' : ''}{t.ignored ? ' · ignored' : ''}</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
              {!t.confirmed && !t.ignored && <TouchableOpacity style={s.ghostBtn} onPress={() => setSpan(t, { confirmed: true })}><Text style={[s.ghostBtnT, { color: colors.success }]}>Confirm</Text></TouchableOpacity>}
              <TouchableOpacity style={s.ghostBtn} onPress={() => setSpan(t, { ignored: !t.ignored })}><Text style={s.ghostBtnT}>{t.ignored ? 'Un-ignore' : 'Ignore'}</Text></TouchableOpacity>
            </View>
          </View>
        ))}
        {!travel.length && <Text style={s.help}>No travel found in the next four months.</Text>}

        <View style={[s.card, { marginTop: 12 }]}>
          <Text style={typography.eyebrow}>ADD TRAVEL BY HAND</Text>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
            <TextInput value={manual.start} onChangeText={v => setManual(m => ({ ...m, start: v }))} placeholder="2026-10-03" placeholderTextColor={colors.textTertiary} style={[s.input, { flex: 1, marginTop: 0 }]} />
            <TextInput value={manual.end} onChangeText={v => setManual(m => ({ ...m, end: v }))} placeholder="2026-10-05" placeholderTextColor={colors.textTertiary} style={[s.input, { flex: 1, marginTop: 0 }]} />
          </View>
          <TextInput value={manual.summary} onChangeText={v => setManual(m => ({ ...m, summary: v }))} placeholder="Where" placeholderTextColor={colors.textTertiary} style={s.input} />
          <TouchableOpacity style={s.btn} onPress={addManual} activeOpacity={0.9}><Text style={s.btnText}>Add</Text></TouchableOpacity>
        </View>
        <View style={{ height: 120 }} />
      </ScrollView>
    </ScreenBackground>
  );
}

const s = StyleSheet.create({
  container: { paddingHorizontal: spacing.md, paddingTop: spacing.md, paddingBottom: 140 },
  title: { ...typography.serifLarge, marginTop: 4, marginBottom: 12 },
  body: { fontFamily: fonts.medium, fontSize: 15, color: colors.text },
  help: { fontFamily: fonts.regular, fontSize: 12.5, color: colors.textSecondary, lineHeight: 17, marginTop: 4 },
  card: { backgroundColor: colors.card, borderRadius: 18, borderWidth: 1, borderColor: colors.line, padding: 14, marginBottom: 10 },
  input: { backgroundColor: colors.input, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 10, color: colors.text, fontFamily: fonts.mono, fontSize: 12, marginTop: 10 },
  btn: { backgroundColor: colors.accent, borderRadius: radius.md, paddingVertical: 13, alignItems: 'center', marginTop: 10 },
  btnText: { fontFamily: fonts.semibold, fontSize: 14, color: colors.bg },
  ghostBtn: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: colors.accentMuted },
  ghostBtnT: { fontFamily: fonts.semibold, fontSize: 12, color: colors.accentLight },
});
