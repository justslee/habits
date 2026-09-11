/**
 * "Make today fit." — the time choice from the prototype, wired to the real adaptive-day API.
 *
 * The choice is a draft: nothing is applied until Update, and dismissing the sheet discards it.
 * Beyond the time cap, the same sheet offers the other day changes the planner supports, which
 * re-plan the rest of the week.
 */

import React, { useCallback, useState } from 'react';
import { View } from 'react-native';
import { AdjustKind, AdjustResult, adjustTraining } from '../../api/client';
import { Body, Small } from '../ui/Text';
import { Button, Options } from '../ui/Button';
import { useSheet } from '../ui/Sheet';
import { useToast } from '../ui/Toast';
import { Panel } from '../ui/Surfaces';
import { useTheme } from '../theme';

const MINUTES = [20, 30, 45] as const;

const preview = (n: number) =>
  n >= 45 ? 'Your full session, as written.'
    : n >= 30 ? 'Main lifts plus one accessory. About 30 minutes.'
      : 'Main lifts only. About 20 minutes.';

export function AdjustSheet({ onDone, date }: { onDone?: (r?: AdjustResult) => void; date?: string }) {
  const { c } = useTheme();
  const sheet = useSheet();
  const toast = useToast();
  const [minutes, setMinutes] = useState<number>(45);
  const [busy, setBusy] = useState(false);

  const apply = useCallback(async (kind: AdjustKind, extra: Record<string, unknown> = {}) => {
    setBusy(true);
    try {
      const r = await adjustTraining({ kind, date, ...extra });
      sheet.close();
      toast.show(r.changes[0] ?? 'Your week is updated.');
      onDone?.(r);
    } catch (err: any) {
      toast.show(String(err?.message ?? err).replace(/^API \d+: /, '').replace(/^\{"detail":"|"\}$/g, ''));
    } finally {
      setBusy(false);
    }
  }, [date, onDone, sheet, toast]);

  return (
    <View>
      <Body>Keep the main lifts. Adjust the time.</Body>
      <Options values={MINUTES} selected={minutes} onSelect={setMinutes} labels={n => `${n} minutes`} />
      <Panel style={{ backgroundColor: c.bg, borderRadius: 18, padding: 17 }}>
        <Body style={{ color: c.fg }}>{preview(minutes)}</Body>
      </Panel>
      <Button
        full
        label={busy ? 'Updating…' : 'Update today'}
        haptic="light"
        disabled={busy}
        style={{ marginTop: 15 }}
        onPress={() => apply('shorten', { minutes })}
      />

      <Small style={{ marginTop: 22, marginBottom: 6 }}>Or change the day entirely. The rest of the week re-plans around you.</Small>
      <View style={{ gap: 4 }}>
        <Button full kind="secondary" label="Run outside instead" disabled={busy} onPress={() => apply('run', { miles: 6, intensity: 'easy' })} />
        <Button full kind="quiet" label="Take the day off" disabled={busy} onPress={() => apply('rest')} />
        <Button full kind="quiet" label="Playing golf today" disabled={busy} onPress={() => apply('golf')} />
      </View>
      <Small style={{ marginTop: 14 }}>
        Nothing is stacked: a displaced session moves to the nearest free day, or is dropped.
      </Small>
    </View>
  );
}
