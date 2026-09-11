/**
 * The assistant, reachable from every destination through the bar above the tab dock.
 *
 * Context comes from the current tab. The reply is the real program-aware coach, and when the
 * coach changes a training day the sheet says what moved. Speak stays a separate destination
 * for longer conversations.
 */

import React, { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, TextInput, View } from 'react-native';
import { coachChat } from '../../api/client';
import { useTheme } from '../theme';
import { fonts, radius } from '../tokens';
import { feel } from '../haptics';
import { Body, Small } from '../ui/Text';
import { Button } from '../ui/Button';
import { useSheet } from '../ui/Sheet';

const LEAD: Record<string, string> = {
  Train: 'Your coach, right where you need it.',
  Food: 'Meals, pantry, preferences. All in context.',
  NorthStar: 'The long view, and the next small step.',
  Speak: 'A place to think out loud.',
  Me: 'What Habits remembers is yours to change.',
  Daily: 'Make your day fit the life you want.',
};

const PROMPTS: Record<string, string[]> = {
  Train: ['I only have 30 minutes', 'What load today?'],
  Food: ['Help with dinner', 'What should I cook first?'],
  Daily: ['I only have 30 minutes', 'What matters most today?'],
};

export function AssistantSheet({ tab, onChanged }: { tab: string; onChanged?: () => void }) {
  const { c } = useTheme();
  const sheet = useSheet();
  const [draft, setDraft] = useState('');
  const [answer, setAnswer] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const ask = useCallback(async (text: string) => {
    const message = text.trim();
    if (!message || busy) return;
    setBusy(true);
    setDraft('');
    try {
      const r = await coachChat(message);
      setAnswer(r.reply);
      if (r.changes?.length) { feel.light(); onChanged?.(); }
    } catch (err: any) {
      setAnswer(String(err?.message ?? err).replace(/^API \d+: /, '').replace(/^\{"detail":"|"\}$/g, ''));
    } finally {
      setBusy(false);
    }
  }, [busy, onChanged]);

  return (
    <View>
      <Body>{LEAD[tab] ?? LEAD.Daily}</Body>

      {answer ? (
        <View style={[s.answer, { backgroundColor: c.bg }]}>
          <Body style={{ color: c.fg }}>{answer}</Body>
        </View>
      ) : (
        <View style={s.prompts}>
          {(PROMPTS[tab] ?? PROMPTS.Daily).map(p => (
            <Button key={p} kind="secondary" label={p} onPress={() => ask(p)} />
          ))}
        </View>
      )}

      <Small style={{ marginTop: answer ? 16 : 6 }}>Ask your assistant</Small>
      <View style={s.row}>
        <TextInput
          style={[s.input, { backgroundColor: c.bg, borderColor: c.line, color: c.fg }]}
          placeholder="What’s on your mind?"
          placeholderTextColor={c.muted}
          value={draft}
          onChangeText={setDraft}
          onSubmitEditing={() => ask(draft)}
          returnKeyType="send"
          multiline
        />
        <Button
          label={busy ? '' : 'Ask'}
          disabled={!draft.trim() || busy}
          onPress={() => ask(draft)}
          style={{ minWidth: 74 }}
        >
          {busy ? <ActivityIndicator color={c.bg} /> : null}
        </Button>
      </View>
      {answer ? <Button full kind="quiet" label="Close" onPress={sheet.close} style={{ marginTop: 6 }} /> : null}
    </View>
  );
}

const s = StyleSheet.create({
  prompts: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 19 },
  answer: { padding: 17, borderRadius: 18, marginTop: 15 },
  row: { flexDirection: 'row', gap: 8, alignItems: 'flex-end', marginTop: 8 },
  input: {
    flex: 1, minHeight: 46, maxHeight: 110, borderWidth: 1, borderRadius: radius.button,
    paddingHorizontal: 14, paddingVertical: 12, fontFamily: fonts.regular, fontSize: 16,
  },
});
