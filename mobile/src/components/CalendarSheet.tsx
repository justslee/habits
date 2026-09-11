/**
 * CalendarSheet — connect Google Calendar (secret iCal address) from Me → Connections.
 * App-wide: Daily shows the agenda, Food derives travel, other tabs can read events.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import BottomSheet from './BottomSheet';
import { colors, fonts, radius, spacing, typography } from '../theme';
import { CalendarFeedData, deleteCalendarFeed, getCalendarFeeds, putCalendarFeed, syncCalendar } from '../api/client';
import { haptic } from '../utils/haptics';

interface Props {
  visible: boolean;
  onClose: () => void;
  onChanged?: () => void;
}

export default function CalendarSheet({ visible, onClose, onChanged }: Props) {
  const [feed, setFeed] = useState<CalendarFeedData | null>(null);
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => { getCalendarFeeds().then(f => setFeed(f[0] ?? null)).catch(() => setFeed(null)); }, []);
  useEffect(() => { if (visible) { load(); setUrl(''); } }, [visible, load]);

  const connect = useCallback(async () => {
    haptic.medium();
    setBusy(true);
    try {
      setFeed(await putCalendarFeed(url.trim()));
      setUrl('');
      onChanged?.();
      haptic.success();
    } catch (err: any) {
      haptic.error();
      Alert.alert('Could not connect', String(err?.message || err).replace(/^API \d+: /, '').replace(/^\{"detail":"|"\}$/g, ''));
    } finally {
      setBusy(false);
    }
  }, [url, onChanged]);

  const sync = useCallback(async () => {
    haptic.light();
    setBusy(true);
    try { const f = await syncCalendar(); setFeed(f[0] ?? null); onChanged?.(); } finally { setBusy(false); }
  }, [onChanged]);

  const disconnect = useCallback(() => {
    Alert.alert('Disconnect Google Calendar?', 'Events and detected travel are removed. Travel you added by hand stays.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Disconnect', style: 'destructive', onPress: async () => { await deleteCalendarFeed(); setFeed(null); onChanged?.(); } },
    ]);
  }, [onChanged]);

  return (
    <BottomSheet visible={visible} onClose={onClose} maxHeightPct={0.8}>
      <View style={s.wrap}>
        <Text style={typography.eyebrow}>CONNECTIONS</Text>
        <Text style={s.title}>Google Calendar</Text>
        {feed ? (
          <>
            <View style={s.statusRow}>
              <View style={[s.dot, { backgroundColor: feed.last_error ? colors.error : colors.success }]} />
              <Text style={s.status}>{feed.last_error ? 'Last sync failed' : 'Connected'}</Text>
            </View>
            <Text style={s.help}>
              {feed.url_host} · {feed.events} event{feed.events === 1 ? '' : 's'} on file · {feed.travel_spans} travel span{feed.travel_spans === 1 ? '' : 's'}
              {feed.last_synced_at ? ` · synced ${feed.last_synced_at.slice(0, 16).replace('T', ' ')}` : ''}. Re-synced every hour.
            </Text>
            {feed.last_error ? <Text style={[s.help, { color: colors.error }]}>{feed.last_error}</Text> : null}
            <View style={s.row}>
              <TouchableOpacity style={s.secondary} onPress={sync} disabled={busy}><Text style={s.secondaryText}>{busy ? 'Syncing…' : 'Sync now'}</Text></TouchableOpacity>
              <TouchableOpacity style={s.secondary} onPress={disconnect}><Text style={[s.secondaryText, { color: colors.error }]}>Disconnect</Text></TouchableOpacity>
            </View>
            <Text style={s.help}>Used by Daily (today's agenda), Food (travel days shrink a cycle), and anything else that needs to know where you are. Read-only.</Text>
          </>
        ) : (
          <>
            <Text style={s.help}>Read-only, no login. In Google Calendar on the web: Settings → your calendar → Integrate calendar → copy the "Secret address in iCal format" and paste it here. Treat it like a password.</Text>
            <TextInput
              value={url}
              onChangeText={setUrl}
              placeholder="https://calendar.google.com/calendar/ical/…/basic.ics"
              placeholderTextColor={colors.textTertiary}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              style={s.input}
            />
            <TouchableOpacity style={s.primary} onPress={connect} disabled={busy || !url.trim()} activeOpacity={0.9}>
              <Text style={s.primaryText}>{busy ? 'Connecting…' : 'Connect'}</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </BottomSheet>
  );
}

const s = StyleSheet.create({
  wrap: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl, gap: spacing.sm },
  title: { ...typography.serifTitle, marginTop: 4 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  status: { fontFamily: fonts.semibold, fontSize: 14, color: colors.text },
  help: { color: colors.textSecondary, fontFamily: fonts.regular, fontSize: 13, lineHeight: 18 },
  row: { flexDirection: 'row', gap: 10, marginTop: 6 },
  input: { backgroundColor: colors.input, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12, color: colors.text, fontFamily: fonts.mono, fontSize: 12 },
  primary: { backgroundColor: colors.accent, borderRadius: radius.md, paddingVertical: 14, alignItems: 'center', marginTop: 4 },
  primaryText: { color: colors.bg, fontFamily: fonts.semibold, fontSize: 15 },
  secondary: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 999, backgroundColor: colors.accentMuted },
  secondaryText: { color: colors.accentLight, fontFamily: fonts.semibold, fontSize: 13 },
});
