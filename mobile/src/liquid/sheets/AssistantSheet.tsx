/**
 * The assistant, reachable from every destination through the bar above the tab dock.
 *
 * It is a conversation rather than a single question: turns stay on screen, the coach keeps the
 * thread, and when it changes a training day the sheet says what moved. Context comes from the
 * current tab. Speak stays a separate destination for longer, spoken sessions.
 *
 * The treatment follows the rest of the app: the coach speaks from the orb, its turns rise into
 * place, and the orb breathes while it is composing rather than showing a spinner. Motion begins
 * with the touch and disappears entirely in Quiet mode.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { coachChat } from '../../api/client';
import { useVoiceCoach } from '../voice';
import { useTheme } from '../theme';
import { fonts, radius } from '../tokens';
import { T, m } from '../motion';
import { feel } from '../haptics';
import { Body, Small } from '../ui/Text';
import { Button } from '../ui/Button';
import { Orb } from '../ui/Sculpture';
import { useSheet } from '../ui/Sheet';
import { useToast } from '../ui/Toast';

const LEAD: Record<string, string> = {
  Train: 'Your coach, right where you need it.',
  Food: 'Meals, pantry, preferences. All in context.',
  NorthStar: 'The long view, and the next small step.',
  Speak: 'A place to think out loud.',
  Me: 'What Habits remembers is yours to change.',
  Daily: 'Make your day fit the life you want.',
};

const PROMPTS: Record<string, string[]> = {
  Train: ['I only have 30 minutes', 'What load today?', 'Move today to a run'],
  Food: ['Help with dinner', 'What should I cook first?', 'I am eating out tonight'],
  NorthStar: ['Where am I drifting?', 'What should I focus on?'],
  Me: ['What do you remember about me?'],
  Daily: ['I only have 30 minutes', 'What matters most today?'],
};

interface Turn {
  from: 'me' | 'coach';
  text: string;
  changes?: string[];
}

export function AssistantSheet({ tab, onChanged }: { tab: string; onChanged?: () => void }) {
  const { c, moves } = useTheme();
  const sheet = useSheet();
  const [draft, setDraft] = useState('');
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const input = useRef<TextInput>(null);
  const toast = useToast();

  const addTurn = useCallback((t: Turn) => setTurns(prev => [...prev, t]), []);

  // Spoken turns land in the same thread as typed ones, so the conversation reads as one.
  const voice = useVoiceCoach({
    onYou: text => addTurn({ from: 'me', text }),
    onCoach: text => addTurn({ from: 'coach', text }),
    onChanged: changes => { feel.light(); onChanged?.(); addTurn({ from: 'coach', text: '', changes }); },
    onError: message => toast.show(message),
  });
  const live = voice.state === 'live' || voice.state === 'connecting';

  const toggleVoice = useCallback(() => {
    feel.soft();
    if (live) voice.stop();
    else voice.start();
  }, [live, voice]);

  const ask = useCallback(async (text: string) => {
    const message = text.trim();
    if (!message || busy) return;
    feel.light();
    setBusy(true);
    setDraft('');
    // The coach sees the thread so far, not just the latest line.
    const history = turns.map(t => ({ from: t.from, text: t.text }));
    setTurns(prev => [...prev, { from: 'me', text: message }]);
    try {
      const r = await coachChat(message, history);
      setTurns(prev => [...prev, { from: 'coach', text: r.reply, changes: r.changes }]);
      if (r.changes?.length) { feel.light(); onChanged?.(); }
    } catch (err: any) {
      const clean = String(err?.message ?? err)
        .replace(/^API \d+: /, '')
        .replace(/^\{"detail":"|"\}$/g, '');
      setTurns(prev => [...prev, { from: 'coach', text: clean }]);
    } finally {
      setBusy(false);
    }
  }, [busy, onChanged, turns]);

  const started = turns.length > 0;

  return (
    <View>
      {!started ? <Body>{LEAD[tab] ?? LEAD.Daily}</Body> : null}

      {turns.map((t, i) => (
        <Bubble key={i} turn={t} index={i} moves={moves} />
      ))}

      {busy ? <Composing moves={moves} /> : null}

      {!started ? (
        <View style={s.prompts}>
          {(PROMPTS[tab] ?? PROMPTS.Daily).map(p => (
            <Chip key={p} label={p} onPress={() => ask(p)} />
          ))}
        </View>
      ) : null}

      {live ? <Live state={voice.state} speaking={voice.speaking} moves={moves} onStop={toggleVoice} /> : null}

      <View style={[s.bar, { backgroundColor: c.bg, borderColor: c.line }]}>
        <Mic live={live} onPress={toggleVoice} />
        <TextInput
          ref={input}
          style={[s.input, { color: c.fg }]}
          placeholder={live ? 'Listening — or type instead' : started ? 'Say more…' : 'What’s on your mind?'}
          placeholderTextColor={c.muted}
          value={draft}
          onChangeText={setDraft}
          onSubmitEditing={() => ask(draft)}
          returnKeyType="send"
          multiline
        />
        <Send ready={!!draft.trim() && !busy} onPress={() => ask(draft)} />
      </View>

      {started ? (
        <Button
          full
          kind="quiet"
          label="Close"
          onPress={() => { voice.stop(); sheet.close(); }}
          style={{ marginTop: 6 }}
        />
      ) : null}
    </View>
  );
}

/** One turn. The coach speaks from the orb on the left; you answer from the right. */
function Bubble({ turn, index, moves }: { turn: Turn; index: number; moves: boolean }) {
  const { c } = useTheme();
  const mine = turn.from === 'me';
  // Only the newest turn animates in; earlier ones are already where they belong.
  const entering = moves ? FadeInDown.duration(260).delay(index === 0 ? 0 : 40) : undefined;

  // The coach usually narrates its own changes. Repeating them underneath says nothing new,
  // so that case gets a short confirmation instead of the whole list again.
  const changes = turn.changes ?? [];
  const narrated = changes.some(ch => turn.text.includes(ch));

  return (
    <Animated.View entering={entering} style={[s.turn, mine && s.turnMine]}>
      {!mine ? (
        <View style={s.avatar}>
          <Orb size={22} />
        </View>
      ) : null}
      <View style={{ flex: 1, alignItems: mine ? 'flex-end' : 'flex-start' }}>
        {turn.text ? (
        <View
          style={[
            s.bubble,
            mine
              ? { backgroundColor: c.soft, borderBottomRightRadius: 7 }
              : { backgroundColor: c.panel2, borderBottomLeftRadius: 7 },
          ]}
        >
          <Body style={{ color: c.fg }}>{turn.text}</Body>
        </View>
        ) : null}
        {changes.length ? (
          <View style={s.changes}>
            <Ionicons name="swap-horizontal" size={13} color={c.accent} />
            <Small style={{ color: c.accent, flex: 1 }} numberOfLines={narrated ? 1 : 4}>
              {narrated
                ? `Your week moved · ${changes.length} day${changes.length === 1 ? '' : 's'}`
                : changes.join(' · ')}
            </Small>
          </View>
        ) : null}
      </View>
    </Animated.View>
  );
}

/** The coach thinking: the orb breathes and three dots rise in turn. */
function Composing({ moves }: { moves: boolean }) {
  const { c } = useTheme();
  const breath = useSharedValue(0);

  useEffect(() => {
    if (!moves) return;
    breath.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 900, easing: Easing.inOut(Easing.quad) }),
        withTiming(0, { duration: 900, easing: Easing.inOut(Easing.quad) }),
      ),
      -1,
      false,
    );
    return () => { breath.value = 0; };
  }, [moves, breath]);

  const orb = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + breath.value * 0.14 }],
    opacity: 0.75 + breath.value * 0.25,
  }));

  return (
    <Animated.View entering={moves ? FadeIn.duration(180) : undefined} style={s.turn}>
      <Animated.View style={[s.avatar, orb]}>
        <Orb size={22} />
      </Animated.View>
      <View style={[s.bubble, s.thinking, { backgroundColor: c.panel2 }]}>
        {[0, 1, 2].map(i => (
          <Dot key={i} index={i} moves={moves} />
        ))}
      </View>
    </Animated.View>
  );
}

function Dot({ index, moves }: { index: number; moves: boolean }) {
  const { c } = useTheme();
  const v = useSharedValue(0);

  useEffect(() => {
    if (!moves) return;
    v.value = withRepeat(
      withSequence(
        withTiming(0, { duration: index * 160 }),
        withTiming(1, { duration: 380, easing: Easing.out(Easing.quad) }),
        withTiming(0, { duration: 380, easing: Easing.in(Easing.quad) }),
        withTiming(0, { duration: 480 - index * 160 }),
      ),
      -1,
      false,
    );
    return () => { v.value = 0; };
  }, [moves, index, v]);

  const style = useAnimatedStyle(() => ({
    opacity: 0.35 + v.value * 0.55,
    transform: [{ translateY: -v.value * 3 }],
  }));

  return <Animated.View style={[s.dot, { backgroundColor: c.muted }, style]} />;
}

/**
 * The live bar. While the coach is speaking the orb swells; while it is your turn it settles,
 * so you can tell who holds the floor without reading anything.
 */
function Live({
  state, speaking, moves, onStop,
}: {
  state: string;
  speaking: boolean;
  moves: boolean;
  onStop: () => void;
}) {
  const { c } = useTheme();
  const pulse = useSharedValue(0);

  useEffect(() => {
    if (!moves) return;
    pulse.value = withRepeat(
      withSequence(
        withTiming(1, { duration: speaking ? 420 : 1100, easing: Easing.inOut(Easing.quad) }),
        withTiming(0, { duration: speaking ? 420 : 1100, easing: Easing.inOut(Easing.quad) }),
      ),
      -1,
      false,
    );
    return () => { pulse.value = 0; };
  }, [moves, speaking, pulse]);

  const orb = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + pulse.value * (speaking ? 0.3 : 0.12) }],
  }));

  return (
    <Animated.View
      entering={moves ? FadeIn.duration(200) : undefined}
      style={[s.live, { backgroundColor: c.soft }]}
    >
      <Animated.View style={orb}>
        <Orb size={20} />
      </Animated.View>
      <Small style={{ flex: 1, color: c.fg }}>
        {state === 'connecting' ? 'Connecting…' : speaking ? 'Your coach is talking' : 'Listening'}
      </Small>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Stop talking"
        onPress={onStop}
        style={[s.hangUp, { backgroundColor: c.panel }]}
      >
        <Small style={{ color: c.fg }}>Stop</Small>
      </Pressable>
    </Animated.View>
  );
}

/** The microphone. Filled while a call is up, quiet otherwise. */
function Mic({ live, onPress }: { live: boolean; onPress: () => void }) {
  const { c, moves } = useTheme();
  const press = useSharedValue(0);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: 1 - press.value * 0.08 }] }));

  return (
    <Animated.View style={style}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={live ? 'Stop talking' : 'Talk to your coach'}
        accessibilityState={{ selected: live }}
        onPressIn={() => { press.value = withTiming(1, m(moves, T.press)); }}
        onPressOut={() => { press.value = withTiming(0, m(moves, T.press)); }}
        onPress={onPress}
        style={[s.mic, live && { backgroundColor: c.accent }]}
      >
        <Ionicons name={live ? 'stop' : 'mic-outline'} size={19} color={live ? c.bg : c.muted} />
      </Pressable>
    </Animated.View>
  );
}

/** A suggestion. Soft, and it gives a little under the finger. */
function Chip({ label, onPress }: { label: string; onPress: () => void }) {
  const { c, moves } = useTheme();
  const press = useSharedValue(0);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: 1 - press.value * 0.04 }] }));

  return (
    <Animated.View style={style}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        onPressIn={() => { press.value = withTiming(1, m(moves, T.press)); }}
        onPressOut={() => { press.value = withTiming(0, m(moves, T.press)); }}
        onPress={() => { feel.selection(); onPress(); }}
        style={[s.chip, { backgroundColor: c.panel2, borderColor: c.line }]}
      >
        <Small style={{ color: c.fg }}>{label}</Small>
      </Pressable>
    </Animated.View>
  );
}

/** The send control: a bead that fills once there is something to send. */
function Send({ ready, onPress }: { ready: boolean; onPress: () => void }) {
  const { c, moves } = useTheme();
  const press = useSharedValue(0);
  const live = useSharedValue(ready ? 1 : 0);

  useEffect(() => {
    live.value = withTiming(ready ? 1 : 0, m(moves, T.context));
  }, [ready, moves, live]);

  const style = useAnimatedStyle(() => ({
    transform: [{ scale: (1 - press.value * 0.08) * (0.92 + live.value * 0.08) }],
    opacity: 0.45 + live.value * 0.55,
  }));

  return (
    <Animated.View style={style}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Ask"
        accessibilityState={{ disabled: !ready }}
        disabled={!ready}
        onPressIn={() => { press.value = withTiming(1, m(moves, T.press)); }}
        onPressOut={() => { press.value = withTiming(0, m(moves, T.press)); }}
        onPress={onPress}
        style={[s.send, { backgroundColor: c.fg }]}
      >
        <Ionicons name="arrow-up" size={19} color={c.bg} />
      </Pressable>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  turn: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, marginTop: 14 },
  turnMine: { paddingLeft: 42 },
  avatar: { width: 22, height: 22, marginTop: 9 },
  bubble: { paddingHorizontal: 15, paddingVertical: 12, borderRadius: 19, maxWidth: '100%' },
  thinking: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 15 },
  dot: { width: 5, height: 5, borderRadius: 3 },
  changes: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 7, paddingHorizontal: 4 },

  prompts: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 18 },
  chip: { borderWidth: 1, borderRadius: radius.chip, paddingHorizontal: 13, paddingVertical: 9, minHeight: 38, justifyContent: 'center' },

  live: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 21,
    paddingLeft: 14,
    paddingRight: 6,
    paddingVertical: 6,
    minHeight: 46,
    marginTop: 16,
  },
  hangUp: { borderRadius: 15, paddingHorizontal: 14, minHeight: 32, alignItems: 'center', justifyContent: 'center' },
  mic: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', marginBottom: 0 },

  bar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    borderWidth: 1,
    borderRadius: 25,
    paddingLeft: 6,
    paddingRight: 6,
    paddingVertical: 6,
    marginTop: 14,
  },
  input: {
    flex: 1,
    // Matches the mic and the send bead, so a single line sits level with both.
    minHeight: 38,
    maxHeight: 108,
    paddingVertical: 9,
    paddingHorizontal: 4,
    fontFamily: fonts.regular,
    fontSize: 16,
  },
  send: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
});
