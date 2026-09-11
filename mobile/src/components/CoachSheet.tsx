/**
 * CoachSheet — chat-with-coach modal (slide-up sheet).
 * Ported from `home-extras.jsx` `CoachSheet` in the design canvas.
 *
 * Wires to the workout-scoped `chatWithCoach(sessionId, message)` endpoint when a
 * `workoutSessionId` is provided. Otherwise falls back to canned local replies —
 * a unified coach endpoint is not yet exposed by the backend (follow-up).
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import BottomSheet from './BottomSheet';
import { chatWithCoach, coachChat } from '../api/client';
import { useNavigation } from '@react-navigation/native';
import { colors, fonts } from '../theme';

interface Message {
  from: 'coach' | 'me';
  text: string;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  /** Seed line — typically the directive that opened the sheet. */
  seed?: string;
  /** When provided, real workout chat endpoint is used. Otherwise falls back to canned. */
  workoutSessionId?: number;
}

const SUGGESTIONS = [
  'What load for the trap bar today?',
  'I only have 50 minutes',
  'Back feels tight, adjust?',
  'How does travel change this week?',
];

const FALLBACK_REPLIES: Record<string, string> = {
  adjust: 'Drop the top set and skip accessories. Easy run pace today — your body is asking to deload, not push.',
  plateau: "Three weeks at the same load isn't a plateau, it's consolidation. Push the next session by one rep, not one plate.",
  race: 'Train to the pace you want to race. Negative split second half — a controlled first half is the whole game.',
  rest: 'Recovery and HRV are the gate. If both are green you can train; if either flags, mobility only and back tomorrow.',
};

function fallbackFor(input: string): string {
  const lower = input.toLowerCase();
  const key = Object.keys(FALLBACK_REPLIES).find(k => lower.includes(k));
  return key
    ? FALLBACK_REPLIES[key]
    : 'Three thoughts: 1) what does done look like in numbers, 2) which pillar does it ladder up to, 3) can you do it three days a week without willpower? Answer those and the move is obvious.';
}

export default function CoachSheet({ visible, onClose, seed, workoutSessionId }: Props) {
  const [messages, setMessages] = useState<Message[]>(() =>
    seed ? [{ from: 'coach', text: seed }] : [{ from: 'coach', text: 'What are we working on?' }],
  );
  const [draft, setDraft] = useState('');
  const [thinking, setThinking] = useState(false);
  const navigation = useNavigation<any>();
  const goLive = () => { onClose(); setTimeout(() => navigation.navigate('CoachVoice'), 250); };

  const send = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setMessages(m => [...m, { from: 'me', text: trimmed }]);
    setDraft('');
    setThinking(true);

    try {
      let reply: string;
      if (workoutSessionId != null) {
        const res = await chatWithCoach(workoutSessionId, trimmed);
        reply = (res as { reply?: string; message?: string }).reply
             ?? (res as { message?: string }).message
             ?? fallbackFor(trimmed);
      } else {
        const history = messages.filter((_, i) => i > 0).map(m => ({ from: m.from as 'me' | 'coach', text: m.text }));
        const res = await coachChat(trimmed, history);
        reply = res.reply || fallbackFor(trimmed);
      }
      setMessages(m => [...m, { from: 'coach', text: reply }]);
    } catch {
      setMessages(m => [...m, { from: 'coach', text: fallbackFor(trimmed) }]);
    } finally {
      setThinking(false);
    }
  };

  return (
    <BottomSheet visible={visible} onClose={onClose} stickToBottom>
      {/* Header */}
      <View style={styles.headerRow}>
        <View style={styles.avatar}><Text style={styles.avatarText}>C</Text></View>
        <View>
          <Text style={styles.heading}>Coach</Text>
          <View style={styles.statusRow}>
            <View style={styles.statusDot} />
            <Text style={styles.statusText}>ONLINE · KNOWS YOUR PROGRAM</Text>
          </View>
        </View>
        <TouchableOpacity onPress={goLive} style={styles.liveBtn} activeOpacity={0.85}>
          <Ionicons name="mic" size={14} color={colors.bg} />
          <Text style={styles.liveBtnText}>Talk live</Text>
        </TouchableOpacity>
      </View>

      {/* Conversation */}
      <View style={styles.conversation}>
        {messages.map((m, i) => (
          <View
            key={i}
            style={[
              styles.bubble,
              m.from === 'me' ? styles.bubbleMe : styles.bubbleCoach,
            ]}
          >
            <Text style={m.from === 'me' ? styles.bubbleMeText : styles.bubbleCoachText}>{m.text}</Text>
          </View>
        ))}
        {thinking && (
          <View style={[styles.bubble, styles.bubbleCoach, { flexDirection: 'row', gap: 6 }]}>
            <View style={styles.thinkingDot} />
            <View style={styles.thinkingDot} />
            <View style={styles.thinkingDot} />
          </View>
        )}
      </View>

      {/* Suggestions */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ marginTop: 18 }}
        contentContainerStyle={{ gap: 6, paddingBottom: 4 }}
      >
        {SUGGESTIONS.map(s => (
          <TouchableOpacity key={s} onPress={() => send(s)} style={styles.suggestion}>
            <Text style={styles.suggestionText}>{s}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Composer */}
      <View style={styles.composerRow}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder="Ask the coach…"
          placeholderTextColor={colors.textTertiary}
          style={styles.input}
          onSubmitEditing={() => send(draft)}
          returnKeyType="send"
        />
        <TouchableOpacity
          onPress={() => send(draft)}
          style={[styles.sendBtn, { opacity: draft.trim() ? 1 : 0.5 }]}
        >
          <Ionicons name="arrow-forward" size={20} color={colors.bg} />
        </TouchableOpacity>
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  liveBtn: { marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.accent, borderRadius: 999, paddingVertical: 7, paddingHorizontal: 12 },
  liveBtnText: { fontFamily: fonts.semibold, fontSize: 12, color: colors.bg },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.accent,
  },
  avatarText: { fontFamily: fonts.serifItalic, fontSize: 18, color: colors.bg },
  heading: { fontFamily: fonts.serifItalic, fontSize: 22, color: colors.text, letterSpacing: -0.5 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  statusDot: {
    width: 5, height: 5, borderRadius: 2.5,
    backgroundColor: colors.accent,
  },
  statusText: { fontFamily: fonts.mono, fontSize: 9, color: colors.accent, letterSpacing: 1.8 },

  conversation: { marginTop: 22, gap: 10 },
  bubble: {
    maxWidth: '85%',
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  bubbleMe: {
    alignSelf: 'flex-end',
    backgroundColor: colors.accent,
    borderRadius: 16,
    borderBottomRightRadius: 4,
  },
  bubbleCoach: {
    alignSelf: 'flex-start',
    backgroundColor: colors.bg2,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 16,
    borderBottomLeftRadius: 4,
  },
  bubbleMeText: { fontFamily: fonts.regular, fontSize: 14, color: colors.bg, lineHeight: 20 },
  bubbleCoachText: { fontFamily: fonts.serifItalic, fontSize: 17, color: colors.text, lineHeight: 24 },

  thinkingDot: {
    width: 6, height: 6, borderRadius: 3,
    backgroundColor: colors.textTertiary,
  },

  suggestion: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.line,
  },
  suggestionText: { fontFamily: fonts.regular, fontSize: 12, color: colors.textSecondary },

  composerRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 14,
  },
  input: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 999,
    backgroundColor: colors.bg2,
    borderWidth: 1,
    borderColor: colors.line,
    color: colors.text,
    fontFamily: fonts.regular,
    fontSize: 14,
  },
  sendBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: colors.accent,
    alignItems: 'center', justifyContent: 'center',
  },
});
