/**
 * AdjustDaySheet — change one day and let the planner re-lay the week.
 * Quick options (run outside, rest, golf, shorten, different session, move) or tell the coach in words.
 */

import React, { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import BottomSheet from './BottomSheet';
import { colors, fonts, radius, typography } from '../theme';
import { AdjustInput, AdjustKind, AdjustResult, TrainDay, adjustTraining } from '../api/client';
import { haptic } from '../utils/haptics';

interface Props {
  visible: boolean;
  onClose: () => void;
  date: string; // YYYY-MM-DD
  day?: TrainDay | null;
  onApplied: (r: AdjustResult) => void;
}

const SESSIONS = ['S1', 'S2', 'S3', 'S4', 'S5'];
const fmt = (iso: string) => new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
const addDays = (iso: string, n: number) => { const d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };

export default function AdjustDaySheet({ visible, onClose, date, day, onApplied }: Props) {
  const [kind, setKind] = useState<AdjustKind | null>(null);
  const [miles, setMiles] = useState('6');
  const [intensity, setIntensity] = useState<'easy' | 'moderate' | 'hard'>('easy');
  const [minutes, setMinutes] = useState('45');
  const [session, setSession] = useState('S3');
  const [target, setTarget] = useState(addDays(date, 1));
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (input: AdjustInput) => {
    setBusy(true); setError(null);
    try {
      const r = await adjustTraining({ date, ...input });
      haptic.success();
      onApplied(r);
      onClose();
      setKind(null); setText('');
    } catch (err: any) {
      setError(String(err?.message || err).replace(/^API \d+: /, '').replace(/^\{"detail":"|"\}$/g, ''));
    } finally { setBusy(false); }
  };

  const Chip = ({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) => (
    <TouchableOpacity onPress={() => { haptic.selection(); onPress(); }} style={[s.chip, active && s.chipActive]}>
      <Text style={[s.chipText, active && { color: colors.bg }]}>{label}</Text>
    </TouchableOpacity>
  );

  const hasSession = !!day?.session && day.session !== 'RUN' && day.session !== 'MOB';

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <Text style={typography.eyebrow}>CHANGE A DAY</Text>
      <Text style={s.title}>{fmt(date)}</Text>
      <Text style={s.help}>Planned: {day?.label || 'nothing'}{day?.note ? ` · ${day.note}` : ''}. Pick what you're doing instead; the rest of the week re-plans around it.</Text>

      <View style={s.row}>
        <Chip label="🏃 Run outside" active={kind === 'run'} onPress={() => setKind('run')} />
        <Chip label="Rest" active={kind === 'rest'} onPress={() => setKind('rest')} />
        <Chip label="⛳ Golf" active={kind === 'golf'} onPress={() => setKind('golf')} />
        {hasSession && <Chip label="Shorter" active={kind === 'shorten'} onPress={() => setKind('shorten')} />}
        <Chip label="Different session" active={kind === 'swap'} onPress={() => setKind('swap')} />
        {hasSession && <Chip label="Move it" active={kind === 'move'} onPress={() => setKind('move')} />}
      </View>

      {kind === 'run' && (
        <View style={s.panel}>
          <View style={s.row}>{['3', '4', '5', '6', '8', '10'].map(m => <Chip key={m} label={`${m} mi`} active={miles === m} onPress={() => setMiles(m)} />)}</View>
          <View style={s.row}>{(['easy', 'moderate', 'hard'] as const).map(i => <Chip key={i} label={i} active={intensity === i} onPress={() => setIntensity(i)} />)}</View>
          <Text style={s.help}>A 3+ mile run covers this week's running: Session 5 drops, tomorrow's intervals go easy, and today's gym session moves to the nearest free day.</Text>
          <TouchableOpacity style={s.btn} disabled={busy} onPress={() => submit({ kind: 'run', miles: Number(miles), intensity })}><Text style={s.btnText}>{busy ? 'Re-planning…' : `Run ${miles} mi instead`}</Text></TouchableOpacity>
        </View>
      )}
      {kind === 'rest' && (
        <View style={s.panel}>
          <Text style={s.help}>Today's session moves to the nearest free day if there is one, otherwise it's dropped. Nothing gets stacked.</Text>
          <TouchableOpacity style={s.btn} disabled={busy} onPress={() => submit({ kind: 'rest' })}><Text style={s.btnText}>{busy ? 'Re-planning…' : 'Take the day off'}</Text></TouchableOpacity>
        </View>
      )}
      {kind === 'golf' && (
        <View style={s.panel}>
          <TouchableOpacity style={s.btn} disabled={busy} onPress={() => submit({ kind: 'golf' })}><Text style={s.btnText}>{busy ? 'Re-planning…' : 'Golf instead'}</Text></TouchableOpacity>
        </View>
      )}
      {kind === 'shorten' && (
        <View style={s.panel}>
          <View style={s.row}>{['30', '40', '45', '50', '60'].map(m => <Chip key={m} label={`${m} min`} active={minutes === m} onPress={() => setMinutes(m)} />)}</View>
          <Text style={s.help}>Accessories drop first (the plan's omit-first ones), then a set from the main lifts. Warm-up and rests stay.</Text>
          <TouchableOpacity style={s.btn} disabled={busy} onPress={() => submit({ kind: 'shorten', minutes: Number(minutes) })}><Text style={s.btnText}>{busy ? 'Re-planning…' : `Cap at ${minutes} min`}</Text></TouchableOpacity>
        </View>
      )}
      {kind === 'swap' && (
        <View style={s.panel}>
          <View style={s.row}>{SESSIONS.map(id => <Chip key={id} label={id} active={session === id} onPress={() => setSession(id)} />)}</View>
          <Text style={s.help}>S1 lower strength · S2 rotation/upper/run · S3 full-body · S4 power · S5 easy cardio. The session that was here moves.</Text>
          <TouchableOpacity style={s.btn} disabled={busy} onPress={() => submit({ kind: 'swap', session })}><Text style={s.btnText}>{busy ? 'Re-planning…' : `Do ${session} today`}</Text></TouchableOpacity>
        </View>
      )}
      {kind === 'move' && (
        <View style={s.panel}>
          <View style={s.row}>{[1, 2, 3, 4].map(n => { const t = addDays(date, n); return <Chip key={t} label={new Date(t + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short' })} active={target === t} onPress={() => setTarget(t)} />; })}</View>
          <Text style={s.help}>Same week only. Lower-body sessions keep 48 h apart.</Text>
          <TouchableOpacity style={s.btn} disabled={busy} onPress={() => submit({ kind: 'move', target_date: target })}><Text style={s.btnText}>{busy ? 'Re-planning…' : 'Move it'}</Text></TouchableOpacity>
        </View>
      )}

      <Text style={[typography.eyebrow, { marginTop: 16 }]}>OR TELL THE COACH</Text>
      <View style={s.inputRow}>
        <TextInput
          style={s.input}
          placeholder="Today I'm running 6 miles instead of the gym…"
          placeholderTextColor={colors.textTertiary}
          value={text}
          onChangeText={setText}
          multiline
        />
        <TouchableOpacity style={[s.send, !text.trim() && { opacity: 0.4 }]} disabled={!text.trim() || busy} onPress={() => submit({ text: text.trim() })}>
          {busy ? <ActivityIndicator color={colors.bg} /> : <Text style={s.btnText}>Go</Text>}
        </TouchableOpacity>
      </View>
      {error ? <Text style={s.error}>{error}</Text> : null}
    </BottomSheet>
  );
}

const s = StyleSheet.create({
  title: { ...typography.serifTitle, marginTop: 4 },
  help: { fontFamily: fonts.regular, fontSize: 12.5, color: colors.textSecondary, lineHeight: 17, marginTop: 6 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  chip: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 999, backgroundColor: colors.input, borderWidth: 1, borderColor: colors.line },
  chipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipText: { fontFamily: fonts.medium, fontSize: 13, color: colors.text },
  panel: { marginTop: 8, padding: 12, borderRadius: 14, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line },
  btn: { backgroundColor: colors.accent, borderRadius: radius.md, paddingVertical: 12, alignItems: 'center', marginTop: 12 },
  btnText: { fontFamily: fonts.semibold, fontSize: 14, color: colors.bg },
  inputRow: { flexDirection: 'row', gap: 8, marginTop: 8, alignItems: 'flex-end' },
  input: { flex: 1, minHeight: 44, maxHeight: 100, backgroundColor: colors.input, borderRadius: 12, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 12, paddingVertical: 10, color: colors.text, fontFamily: fonts.regular, fontSize: 14 },
  send: { backgroundColor: colors.accent, borderRadius: 12, paddingHorizontal: 16, height: 44, alignItems: 'center', justifyContent: 'center' },
  error: { fontFamily: fonts.regular, fontSize: 12, color: colors.error, marginTop: 8 },
});
