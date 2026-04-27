/**
 * LiftLogger — fast-path manual set entry for the active workout.
 *
 * Drives `POST /api/v1/workouts/:id/exercises` directly so the user can punch
 * in a set without going through the chat coach. Optimistically appends the
 * logged set to a local list and signals the parent to re-fetch.
 *
 * Visual port of the design's Lift Logger card:
 *   • Exercise pill row at top (set with `exercises` prop)
 *   • Weight + Reps steppers
 *   • RPE chip row (6–10)
 *   • Big ember CTA → flashes green on log
 *   • Logged-set chips with running volume total
 */

import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { colors, fonts, radius, spacing } from '../theme';
import { haptic } from '../utils/haptics';
import { addExerciseLog, ExerciseLogData } from '../api/client';
import Stepper from './Stepper';

interface LoggedSet {
  weight: number;
  reps: number;
  rpe: number;
  exercise: string;
}

interface Props {
  sessionId: number;
  /** Suggested exercises shown as pill chips. Inferred from today's plan. */
  exercises?: string[];
  /** Initial set count for an exercise — affects "LOG SET N" label. */
  initialSetCount?: number;
  /** Called after a successful log so the parent can refresh the session. */
  onLogged?: (set: LoggedSet) => void;
}

const DEFAULT_EXERCISES = ['Bench press', 'OHP', 'Incline DB', 'Lat raise', 'Tri pushdown'];

export default function LiftLogger({ sessionId, exercises, initialSetCount = 0, onLogged }: Props) {
  const exerciseList = exercises && exercises.length > 0 ? exercises : DEFAULT_EXERCISES;
  const [exercise, setExercise] = useState<string>(exerciseList[0]);
  const [weight, setWeight] = useState(135);
  const [reps, setReps] = useState(6);
  const [rpe, setRpe] = useState(8);
  const [sets, setSets] = useState<LoggedSet[]>([]);
  const [flash, setFlash] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const totalVolume = sets.reduce((acc, s) => acc + s.weight * s.reps, 0);
  const setNumber = initialSetCount + sets.length + 1;

  const logSet = async () => {
    if (submitting) return;
    setSubmitting(true);
    haptic.medium();
    const local: LoggedSet = { weight, reps, rpe, exercise };
    const payload: ExerciseLogData = {
      exercise_name: exercise,
      set_number: setNumber,
      weight,
      reps,
      rpe,
    };
    try {
      await addExerciseLog(sessionId, payload);
      setSets(prev => [...prev, local]);
      setFlash(true);
      setTimeout(() => setFlash(false), 400);
      haptic.success();
      onLogged?.(local);
    } catch (err) {
      console.warn('Failed to log set:', err);
      haptic.warning();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.sectionRow}>
        <Text style={styles.sectionTitle}>Log it</Text>
        <Text style={styles.sectionMore}>ONE TAP</Text>
      </View>

      <View style={styles.card}>
        {/* Exercise pills */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.exerciseRow}
        >
          {exerciseList.map(x => {
            const active = exercise === x;
            return (
              <TouchableOpacity
                key={x}
                onPress={() => { setExercise(x); haptic.light(); }}
                style={[styles.exercisePill, active && styles.exercisePillActive]}
              >
                <Text style={[styles.exercisePillText, active && styles.exercisePillTextActive]}>
                  {x}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Weight + Reps steppers */}
        <View style={styles.steppersRow}>
          <Stepper label="WEIGHT" unit="lb" value={weight} step={5} min={0} onChange={setWeight} />
          <Stepper label="REPS" value={reps} step={1} min={1} onChange={setReps} />
        </View>

        {/* RPE chips */}
        <Text style={styles.eyebrow}>RPE</Text>
        <View style={styles.rpeRow}>
          {[6, 7, 8, 9, 10].map(n => {
            const active = rpe === n;
            return (
              <TouchableOpacity
                key={n}
                onPress={() => { setRpe(n); haptic.light(); }}
                style={[styles.rpeChip, active && styles.rpeChipActive]}
              >
                <Text style={[styles.rpeChipText, active && styles.rpeChipTextActive]}>{n}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Big log button */}
        <TouchableOpacity
          onPress={logSet}
          disabled={submitting}
          activeOpacity={0.85}
          style={[
            styles.logBtn,
            flash && styles.logBtnFlash,
            submitting && { opacity: 0.6 },
          ]}
        >
          <Text style={styles.logBtnText}>
            {flash ? '✓ LOGGED' : `+ LOG SET ${setNumber} · ${weight}×${reps} @ RPE${rpe}`}
          </Text>
        </TouchableOpacity>

        {/* Logged-set chips */}
        {sets.length > 0 && (
          <View style={styles.loggedWrap}>
            <Text style={styles.eyebrow}>
              SETS · {totalVolume.toLocaleString()} LB TOTAL
            </Text>
            <View style={styles.loggedRow}>
              {sets.map((s, i) => (
                <View key={i} style={styles.loggedChip}>
                  <Text style={styles.loggedChipText}>
                    {s.weight}×{s.reps}
                    <Text style={styles.loggedChipRpe}> ·{s.rpe}</Text>
                  </Text>
                </View>
              ))}
            </View>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: spacing.md },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
  sectionTitle: { fontFamily: fonts.serifItalic, fontSize: 22, color: colors.text, letterSpacing: -0.5 },
  sectionMore: { fontFamily: fonts.mono, fontSize: 10, color: colors.textTertiary, letterSpacing: 1.6 },

  card: {
    padding: 16,
    borderRadius: radius.xl,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
  },

  exerciseRow: { gap: 6, paddingBottom: 6, marginBottom: 14 },
  exercisePill: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: 'transparent',
  },
  exercisePillActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  exercisePillText: { fontFamily: fonts.regular, fontSize: 12, color: colors.textSecondary },
  exercisePillTextActive: { color: colors.bg, fontFamily: fonts.semibold },

  steppersRow: { flexDirection: 'row', gap: 14, marginBottom: 14 },

  eyebrow: { fontFamily: fonts.mono, fontSize: 9, color: colors.textTertiary, letterSpacing: 1.8, marginBottom: 8 },

  rpeRow: { flexDirection: 'row', gap: 6, marginBottom: 16 },
  rpeChip: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: 'transparent',
    alignItems: 'center',
  },
  rpeChipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  rpeChipText: { fontFamily: fonts.mono, fontSize: 13, color: colors.textSecondary },
  rpeChipTextActive: { color: colors.bg },

  logBtn: {
    width: '100%',
    paddingVertical: 16,
    borderRadius: 14,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logBtnFlash: { backgroundColor: colors.success },
  logBtnText: { fontFamily: fonts.mono, fontSize: 13, color: colors.bg, letterSpacing: 2 },

  loggedWrap: { marginTop: 16 },
  loggedRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  loggedChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: colors.surface2,
  },
  loggedChipText: { fontFamily: fonts.mono, fontSize: 11, color: colors.textSecondary },
  loggedChipRpe: { color: colors.accent },
});
