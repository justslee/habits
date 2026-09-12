/**
 * Logging a run.
 *
 * The button used to navigate to Daily and leave you there, so a finished run had nowhere to go.
 * This takes the run instead, prefilled from what was planned: distance and time are usually a
 * small correction to the prescription rather than numbers typed from nothing.
 *
 * Distance and duration both carry a stepper and a field. The stepper is for the common nudge,
 * the field for a watch reading you want to enter exactly.
 */

import React, { useCallback, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { createRun } from '../../api/client';
import { useTheme } from '../theme';
import { fonts, radius } from '../tokens';
import { feel } from '../haptics';
import { Body, Small } from '../ui/Text';
import { Button } from '../ui/Button';
import { Options } from '../ui/Button';
import { Section } from '../ui/Surfaces';
import { useSheet } from '../ui/Sheet';
import { useToast } from '../ui/Toast';

/** What the plan asked for, so the fields start near the truth. */
export interface RunPlan {
  miles?: number | null;
  minutes?: number | null;
  intensity?: string | null;
  structure?: string | null;
}

const EFFORTS = [3, 4, 5, 6, 7, 8, 9] as const;
const EFFORT_WORD: Record<number, string> = {
  3: 'very easy', 4: 'easy', 5: 'steady', 6: 'moderate', 7: 'firm', 8: 'hard', 9: 'very hard',
};

/** One decimal, and never a stray "3.0999999". */
const round1 = (n: number) => Math.round(n * 10) / 10;

export function RunSheet({ plan, onDone }: { plan?: RunPlan | null; onDone: () => void }) {
  const { c } = useTheme();
  const sheet = useSheet();
  const toast = useToast();
  const [miles, setMiles] = useState(plan?.miles ? round1(plan.miles) : 3);
  const [minutes, setMinutes] = useState(plan?.minutes ? Math.round(plan.minutes) : 30);
  const [rpe, setRpe] = useState(plan?.intensity === 'hard' ? 8 : plan?.intensity === 'moderate' ? 6 : 4);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);

  const pace = miles > 0 ? minutes / miles : 0;
  const paceLabel = pace > 0
    ? `${Math.floor(pace)}:${String(Math.round((pace % 1) * 60)).padStart(2, '0')} per mile`
    : null;

  const save = useCallback(async () => {
    if (busy || miles <= 0 || minutes <= 0) return;
    setBusy(true);
    try {
      await createRun({
        distance_miles: miles,
        duration_seconds: Math.round(minutes * 60),
        rpe,
        run_type: plan?.intensity ? `${plan.intensity} run` : 'easy run',
        notes: notes.trim() || null,
      });
      feel.success();
      sheet.close();
      toast.show(`${round1(miles)} miles logged. That counts.`);
      onDone();
    } catch (err: any) {
      const raw = String(err?.message ?? err).replace(/^API \d+:\s*/, '').replace(/^\{"detail":"|"\}$/g, '').trim();
      toast.show(raw.slice(0, 140) || 'That didn’t save.');
      setBusy(false);
    }
  }, [busy, miles, minutes, rpe, notes, plan, sheet, toast, onDone]);

  return (
    <View>
      <Body>
        {plan?.structure
          ? plan.structure
          : 'What you actually did. Distance and time are enough; the rest is optional.'}
      </Body>

      <View style={s.pair}>
        <Field
          label="Miles"
          value={round1(miles)}
          onChange={v => setMiles(Math.max(0, round1(v)))}
          step={0.5}
          decimals
        />
        <Field
          label="Minutes"
          value={minutes}
          onChange={v => setMinutes(Math.max(0, Math.round(v)))}
          step={5}
        />
      </View>
      {paceLabel ? <Small style={{ marginTop: 10 }}>{paceLabel}</Small> : null}

      <Section title="How it felt" trailing={<Small>{EFFORT_WORD[rpe]}</Small>} />
      <Options values={EFFORTS} selected={rpe} onSelect={setRpe} labels={v => String(v)} />

      <Small style={{ marginTop: 20, marginBottom: 6 }}>Anything worth remembering</Small>
      <TextInput
        style={[s.notes, { backgroundColor: c.bg, borderColor: c.line, color: c.fg }]}
        value={notes}
        onChangeText={setNotes}
        placeholder="Legs heavy the first mile, then fine."
        placeholderTextColor={c.muted}
        multiline
      />

      <Button
        full
        label={busy ? 'Saving…' : 'Log this run'}
        haptic="light"
        disabled={busy || miles <= 0 || minutes <= 0}
        style={{ marginTop: 22 }}
        onPress={save}
      />
      <Button full kind="quiet" label="Not now" onPress={sheet.close} />
    </View>
  );
}

/** A number you can nudge or type. */
function Field({
  label, value, onChange, step, decimals,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step: number;
  decimals?: boolean;
}) {
  const { c } = useTheme();
  const [text, setText] = useState<string | null>(null);

  const commit = () => {
    if (text === null) return;
    const n = parseFloat(text.replace(',', '.'));
    setText(null);
    if (Number.isFinite(n)) onChange(n);
  };

  return (
    <View style={[s.field, { backgroundColor: c.bg }]}>
      <Small style={{ letterSpacing: 1, textTransform: 'uppercase' }}>{label}</Small>
      <View style={s.row}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Less ${label}`}
          hitSlop={8}
          onPress={() => { feel.selection(); onChange(value - step); }}
          style={s.step}
        >
          <Ionicons name="remove" size={19} color={c.muted} />
        </Pressable>
        <TextInput
          style={[s.number, { color: c.fg }]}
          value={text ?? (decimals ? String(value) : String(Math.round(value)))}
          onChangeText={setText}
          onBlur={commit}
          onSubmitEditing={commit}
          keyboardType={decimals ? 'decimal-pad' : 'number-pad'}
          returnKeyType="done"
          selectTextOnFocus
          accessibilityLabel={label}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`More ${label}`}
          hitSlop={8}
          onPress={() => { feel.selection(); onChange(value + step); }}
          style={s.step}
        >
          <Ionicons name="add" size={19} color={c.muted} />
        </Pressable>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  pair: { flexDirection: 'row', gap: 10, marginTop: 18 },
  field: { flex: 1, minWidth: 0, borderRadius: radius.card, paddingVertical: 13, paddingHorizontal: 10, gap: 6 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  step: { width: 30, height: 34, alignItems: 'center', justifyContent: 'center' },
  number: {
    // minWidth 0 lets the field shrink inside the row; without it the input claims its
    // intrinsic width and pushes the plus button off the edge of the card.
    flex: 1, minWidth: 0, textAlign: 'center', fontFamily: fonts.serif, fontSize: 26,
    lineHeight: 32, paddingVertical: 0, paddingHorizontal: 0,
  },
  notes: {
    borderWidth: 1, borderRadius: radius.button, paddingHorizontal: 14, paddingVertical: 12,
    fontFamily: fonts.regular, fontSize: 16, minHeight: 76, maxHeight: 130,
  },
});
