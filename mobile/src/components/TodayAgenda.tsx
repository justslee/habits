/**
 * TodayAgenda — a compact strip of today's calendar events for the Daily screen.
 * Renders nothing until a calendar is connected.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, fonts, typography } from '../theme';
import { CalendarToday, getCalendarToday } from '../api/client';

const KIND_COLOR: Record<string, string> = { travel: colors.warning, workout: colors.success, meeting: colors.accent, other: colors.textTertiary };

function timeLabel(iso: string | null) {
  if (!iso) return 'all day';
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }).toLowerCase().replace(':00', '');
}

export default function TodayAgenda({ refreshKey }: { refreshKey?: number }) {
  const [today, setToday] = useState<CalendarToday | null>(null);
  const load = useCallback(() => { getCalendarToday().then(setToday).catch(() => setToday(null)); }, []);
  useEffect(() => { load(); }, [load, refreshKey]);

  if (!today || !today.connected) return null;
  const events = today.events.filter(e => !e.recurring || e.kind !== 'meeting' || true).slice(0, 5);
  if (!events.length && !today.travelling) return null;

  return (
    <View style={s.card}>
      <View style={s.head}>
        <Text style={typography.eyebrow}>TODAY</Text>
        {today.travelling && <Text style={s.travel}>✈ {today.travel || 'Away'}</Text>}
      </View>
      {events.map(e => (
        <View key={e.id} style={s.row}>
          <View style={[s.dot, { backgroundColor: KIND_COLOR[e.kind] || colors.textTertiary }]} />
          <Text style={s.time}>{e.all_day ? 'all day' : timeLabel(e.start_at)}</Text>
          <Text style={s.summary} numberOfLines={1}>{e.summary || '(untitled)'}</Text>
        </View>
      ))}
      {today.events.length > 5 && <Text style={s.more}>+{today.events.length - 5} more</Text>}
    </View>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: colors.card, borderRadius: 16, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 12 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  travel: { fontFamily: fonts.mono, fontSize: 10.5, letterSpacing: 0.6, color: colors.warning },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 5 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  time: { fontFamily: fonts.mono, fontSize: 11, color: colors.textTertiary, width: 56 },
  summary: { fontFamily: fonts.medium, fontSize: 13.5, color: colors.text, flex: 1 },
  more: { fontFamily: fonts.mono, fontSize: 10, color: colors.textTertiary, marginTop: 4 },
});
