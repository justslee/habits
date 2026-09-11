/**
 * DayRows — one row per day of a program week: session colour, label, status, travel, your changes.
 * Shared by the Week segment and the six-week outlook. Tap a future day to change it.
 */

import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors, fonts } from '../theme';
import { TrainDay } from '../api/client';

export const SESSION_COLOR: Record<string, string> = { S1: '#8B5CF6', S2: '#F97316', S3: '#22D3EE', S4: '#EC4899', S5: '#76C99C', MOB: '#6F708A', RUN: '#3B82F6' };
export const short = (iso: string) => new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

export default function DayRows({ days, today, onPressDay, compact }: { days: TrainDay[]; today: string; onPressDay?: (d: TrainDay) => void; compact?: boolean }) {
  return (
    <View>
      {days.map(d => {
        const past = d.date < today;
        const isToday = d.date === today;
        const color = d.session ? (SESSION_COLOR[d.session] || colors.warning) : colors.line;
        const tag = d.session === 'RUN' ? 'RUN' : d.session === 'MOB' ? '✈' : d.session?.startsWith('T-') ? d.session.slice(2, 5).toUpperCase() : d.session || '—';
        const row = (
          <View style={[s.row, isToday && s.rowToday, past && !isToday && { opacity: 0.55 }, compact && { paddingVertical: 6 }]}>
            <View style={s.left}>
              <Text style={[s.wd, isToday && { color: colors.accent }]}>{d.weekday.toUpperCase()}</Text>
              <Text style={s.date}>{short(d.date).split(' ')[1]}</Text>
            </View>
            <View style={[s.bar, { backgroundColor: color }]} />
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={[s.tag, { color: d.session ? color : colors.textTertiary }]}>{tag}</Text>
                <Text style={s.label} numberOfLines={1}>{d.label}</Text>
              </View>
              {(d.note || d.adjusted) && !compact ? (
                <Text style={s.note} numberOfLines={2}>{d.adjusted ? `↻ your change${d.note ? ` · ${d.note}` : ''}` : d.note}</Text>
              ) : null}
            </View>
            <Text style={[s.status, d.status === 'completed' && { color: colors.success }]}>
              {d.status === 'completed' ? '✓' : d.status === 'in_progress' || d.status === 'planned' ? '●' : d.adjusted ? '↻' : ''}
            </Text>
          </View>
        );
        return onPressDay && !past ? (
          <TouchableOpacity key={d.date} onPress={() => onPressDay(d)} activeOpacity={0.8}>{row}</TouchableOpacity>
        ) : <View key={d.date}>{row}</View>;
      })}
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: colors.line },
  rowToday: { backgroundColor: 'rgba(255,255,255,0.03)', marginHorizontal: -6, paddingHorizontal: 6, borderRadius: 8 },
  left: { width: 34, alignItems: 'center' },
  wd: { fontFamily: fonts.mono, fontSize: 9.5, letterSpacing: 1, color: colors.textTertiary },
  date: { fontFamily: fonts.mono, fontSize: 11, color: colors.textSecondary, marginTop: 1 },
  bar: { width: 3, height: 28, borderRadius: 2 },
  tag: { fontFamily: fonts.mono, fontSize: 10.5, letterSpacing: 0.8 },
  label: { fontFamily: fonts.medium, fontSize: 13.5, color: colors.text, flex: 1 },
  note: { fontFamily: fonts.regular, fontSize: 11.5, color: colors.textTertiary, marginTop: 2, lineHeight: 15 },
  status: { fontFamily: fonts.mono, fontSize: 13, color: colors.textTertiary, width: 18, textAlign: 'center' },
});
