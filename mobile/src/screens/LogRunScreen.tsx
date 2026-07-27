/**
 * Log a Run — manual run entry.
 *
 * Replaces the old live GPS recorder: the user types in a finished run
 * (distance, duration, type, RPE, notes) and it's saved via POST /runs/.
 */

import React, { useState } from 'react';
import {
  View, Text, TextInput, ScrollView, TouchableOpacity, StyleSheet, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing, radius, fonts, typography } from '../theme';
import { haptic } from '../utils/haptics';
import { createRun } from '../api/client';
import ScreenBackground from '../components/ScreenBackground';
import KeyboardAvoider from '../components/KeyboardAvoider';

const RUN_TYPES = ['easy', 'tempo', 'intervals', 'long', 'recovery', 'fartlek', 'progression'];
const RUN_TYPE_COLORS: Record<string, string> = {
  easy: '#3B82F6', tempo: '#F59E0B', intervals: '#EF4444',
  long: '#10B981', recovery: '#6B7280', fartlek: '#EC4899', progression: '#8B5CF6',
};

function todayISO(): string {
  return new Date().toISOString().split('T')[0];
}

function toInt(s: string): number {
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : 0;
}

export default function LogRunScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const [runDate, setRunDate] = useState(todayISO());
  const [distance, setDistance] = useState('');
  const [hours, setHours] = useState('');
  const [minutes, setMinutes] = useState('');
  const [seconds, setSeconds] = useState('');
  const [runType, setRunType] = useState<string>('easy');
  const [rpe, setRpe] = useState<number | null>(null);
  const [elevation, setElevation] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const durationSeconds = toInt(hours) * 3600 + toInt(minutes) * 60 + toInt(seconds);
  const distanceMiles = parseFloat(distance) || 0;
  const canSave = distanceMiles > 0 && durationSeconds > 0 && !saving;

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    haptic.medium();
    try {
      await createRun({
        run_date: runDate,
        distance_miles: distanceMiles,
        duration_seconds: durationSeconds,
        elevation_gain_ft: elevation ? parseFloat(elevation) : null,
        run_type: runType,
        rpe,
        notes: notes.trim() || null,
      });
      haptic.success?.();
      navigation?.navigate?.('RunHistory');
    } catch (err) {
      console.warn('createRun failed:', err);
      Alert.alert('Could not save run', 'Please check your connection and try again.');
      setSaving(false);
    }
  };

  return (
    <ScreenBackground>
      <KeyboardAvoider offset={90}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={{ paddingTop: 12, paddingBottom: insets.bottom + 120 }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.titleBlock}>
          <Text style={styles.eyebrow}>TRAIN · LOG RUN</Text>
          <Text style={styles.titleSerif}>Log a run</Text>
        </View>

        {/* Distance */}
        <Text style={styles.label}>DISTANCE (MI)</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. 5.2"
          placeholderTextColor={colors.textTertiary}
          keyboardType="decimal-pad"
          value={distance}
          onChangeText={setDistance}
        />

        {/* Duration */}
        <Text style={styles.label}>DURATION</Text>
        <View style={styles.durationRow}>
          <View style={styles.durationField}>
            <TextInput
              style={styles.durationInput}
              placeholder="0"
              placeholderTextColor={colors.textTertiary}
              keyboardType="number-pad"
              value={hours}
              onChangeText={setHours}
              maxLength={2}
            />
            <Text style={styles.durationUnit}>hr</Text>
          </View>
          <View style={styles.durationField}>
            <TextInput
              style={styles.durationInput}
              placeholder="0"
              placeholderTextColor={colors.textTertiary}
              keyboardType="number-pad"
              value={minutes}
              onChangeText={setMinutes}
              maxLength={2}
            />
            <Text style={styles.durationUnit}>min</Text>
          </View>
          <View style={styles.durationField}>
            <TextInput
              style={styles.durationInput}
              placeholder="0"
              placeholderTextColor={colors.textTertiary}
              keyboardType="number-pad"
              value={seconds}
              onChangeText={setSeconds}
              maxLength={2}
            />
            <Text style={styles.durationUnit}>sec</Text>
          </View>
        </View>

        {/* Run type */}
        <Text style={styles.label}>TYPE</Text>
        <View style={styles.chipWrap}>
          {RUN_TYPES.map(t => {
            const active = runType === t;
            const c = RUN_TYPE_COLORS[t] || colors.accent;
            return (
              <TouchableOpacity
                key={t}
                style={[styles.chip, active && { backgroundColor: c + '20', borderColor: c }]}
                onPress={() => { haptic.selection(); setRunType(t); }}
              >
                <Text style={[styles.chipText, active && { color: c }]}>
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* RPE */}
        <Text style={styles.label}>
          EFFORT (RPE){rpe != null ? <Text style={{ color: colors.accent }}>{'  '}{rpe}/10</Text> : null}
        </Text>
        <View style={styles.rpeRow}>
          {[1,2,3,4,5,6,7,8,9,10].map(n => (
            <TouchableOpacity
              key={n}
              style={[styles.rpeCell, rpe != null && rpe >= n && { backgroundColor: colors.accent }]}
              onPress={() => { haptic.selection(); setRpe(n); }}
            />
          ))}
        </View>

        {/* Elevation (optional) */}
        <Text style={styles.label}>ELEVATION GAIN (FT) · optional</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. 240"
          placeholderTextColor={colors.textTertiary}
          keyboardType="number-pad"
          value={elevation}
          onChangeText={setElevation}
        />

        {/* Date */}
        <Text style={styles.label}>DATE</Text>
        <TextInput
          style={styles.input}
          placeholder="YYYY-MM-DD"
          placeholderTextColor={colors.textTertiary}
          value={runDate}
          onChangeText={setRunDate}
          autoCapitalize="none"
        />

        {/* Notes */}
        <Text style={styles.label}>NOTES · optional</Text>
        <TextInput
          style={styles.notesInput}
          placeholder="How did it feel?"
          placeholderTextColor={colors.textTertiary}
          value={notes}
          onChangeText={setNotes}
          multiline
          numberOfLines={3}
          textAlignVertical="top"
        />

        <TouchableOpacity
          style={[styles.saveBtn, !canSave && styles.saveBtnDisabled]}
          onPress={handleSave}
          disabled={!canSave}
          activeOpacity={0.85}
        >
          <Text style={styles.saveBtnText}>{saving ? 'SAVING…' : 'SAVE RUN'}</Text>
        </TouchableOpacity>
      </ScrollView>
      </KeyboardAvoider>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: spacing.lg },
  titleBlock: { marginBottom: spacing.lg },
  eyebrow: { fontFamily: fonts.mono, fontSize: 9, color: colors.textTertiary, letterSpacing: 2.2 },
  titleSerif: { fontFamily: fonts.serifItalic, fontSize: 28, color: colors.text, letterSpacing: -0.6, marginTop: 4 },

  label: { fontFamily: fonts.mono, fontSize: 10, color: colors.textSecondary, letterSpacing: 1.6, marginTop: spacing.lg, marginBottom: spacing.sm },

  input: {
    backgroundColor: colors.input, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
    color: colors.text, fontSize: 16, paddingHorizontal: spacing.md, paddingVertical: 12,
  },
  notesInput: {
    backgroundColor: colors.input, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
    color: colors.text, fontSize: 15, paddingHorizontal: spacing.md, paddingVertical: 12, minHeight: 84,
  },

  durationRow: { flexDirection: 'row', gap: spacing.sm },
  durationField: {
    flex: 1, backgroundColor: colors.input, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 8,
  },
  durationInput: { color: colors.text, fontSize: 22, fontVariant: ['tabular-nums'], minWidth: 34, textAlign: 'center' },
  durationUnit: { color: colors.textTertiary, fontSize: 12, marginLeft: 4 },

  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: radius.pill,
    borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card,
  },
  chipText: { ...typography.caption, color: colors.textSecondary },

  rpeRow: { flexDirection: 'row', gap: 4 },
  rpeCell: {
    flex: 1, height: 32, borderRadius: 6, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card,
  },

  saveBtn: {
    marginTop: spacing.xl, backgroundColor: colors.accent, borderRadius: radius.lg,
    paddingVertical: 16, alignItems: 'center',
  },
  saveBtnDisabled: { opacity: 0.4 },
  saveBtnText: { color: '#0F0F18', fontFamily: fonts.mono, fontSize: 13, letterSpacing: 1.4, fontWeight: '700' },
});
