/**
 * Speak — explain a concept to a chosen audience, then read how it landed.
 *
 * The premise is the evaluation: pick who you are talking to and how long you have, explain the
 * idea out loud, and get scored on clarity, accuracy, structure, conciseness and confidence,
 * with the filler words counted and specific lines quoted back. A past session opens its own
 * evaluation. The live coach stays available for a looser conversation.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import Animated, {
  Easing, cancelAnimation, useAnimatedStyle, useSharedValue, withRepeat, withTiming,
} from 'react-native-reanimated';
import { useFocusEffect } from '@react-navigation/native';
import { Audio } from 'expo-av';
import { Ionicons } from '@expo/vector-icons';
import {
  SpeakingEvaluation, SpeakingSessionFull, SpeakingStatsData, TopicSuggestion,
  getSpeakingHistory, getSpeakingSession, getSpeakingStats, getTopicSuggestions, submitSpeakingSession,
} from '../../api/client';
import { useTheme } from '../theme';
import { fonts, radius } from '../tokens';
import { feel } from '../haptics';
import { T, m } from '../motion';
import { Screen } from '../ui/Screen';
import { Body, Em, Eyebrow, Small, Subtitle, Title } from '../ui/Text';
import { Button, InlineButton, Options } from '../ui/Button';
import { DetailRow, FlowTop, Notice, Panel, Section, TopBar } from '../ui/Surfaces';
import { VoiceOrb } from '../ui/Sculpture';
import { useSheet } from '../ui/Sheet';
import { useToast } from '../ui/Toast';
import { prettyDate } from '../ui/Chart';

type Stage = 'setup' | 'recording' | 'processing' | 'results';

const AUDIENCES = [
  { id: 'general', label: 'General', sub: 'Zero context · be human' },
  { id: 'lp_meeting', label: 'LP / Investor', sub: 'Skeptical · 90s of patience' },
  { id: 'junior_analyst', label: 'Junior analyst', sub: 'Internal · jargon is fine' },
  { id: 'podcast', label: 'Podcast', sub: 'No technical chops' },
  { id: 'technical_peer', label: 'Technical peer', sub: 'Deep · precise terms' },
];
const AUDIENCE_LABEL: Record<string, string> = Object.fromEntries(AUDIENCES.map(a => [a.id, a.label]));
const TARGETS = [30, 60, 120, 180, 300];
const targetLabel = (s: number) => (s < 60 ? `${s}s` : `${s / 60}m`);
const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

const DIMENSIONS: { key: keyof SpeakingEvaluation; label: string }[] = [
  { key: 'clarity_score', label: 'Clarity' },
  { key: 'accuracy_score', label: 'Accuracy' },
  { key: 'structure_score', label: 'Structure' },
  { key: 'conciseness_score', label: 'Conciseness' },
  { key: 'confidence_score', label: 'Confidence' },
];

export default function SpeakScreen({ navigation }: any) {
  const { c, moves } = useTheme();
  const sheet = useSheet();
  const toast = useToast();

  const [stage, setStage] = useState<Stage>('setup');
  const [topic, setTopic] = useState('');
  const [audience, setAudience] = useState('general');
  const [target, setTarget] = useState(180);
  const [elapsed, setElapsed] = useState(0);
  const [result, setResult] = useState<SpeakingSessionFull | null>(null);
  const [sessions, setSessions] = useState<SpeakingSessionFull[]>([]);
  const [stats, setStats] = useState<SpeakingStatsData | null>(null);
  const [suggestions, setSuggestions] = useState<TopicSuggestion[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const recording = useRef<Audio.Recording | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const pulse = useSharedValue(0);
  const morph = useSharedValue(0);

  const load = useCallback(async () => {
    const [h, st, sg] = await Promise.allSettled([
      getSpeakingHistory(12), getSpeakingStats(), getTopicSuggestions(),
    ]);
    if (h.status === 'fulfilled') setSessions(h.value);
    if (st.status === 'fulfilled') setStats(st.value);
    if (sg.status === 'fulfilled') setSuggestions(sg.value);
  }, []);

  useEffect(() => { load(); }, [load]);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  useEffect(() => () => { if (timer.current) clearInterval(timer.current); }, []);

  // The orb breathes continuously: one cycle swells it, a slower one squashes and turns it, so
  // it reads as alive rather than as a spinning image. Listening makes both faster and wider.
  const live = stage === 'recording';
  useEffect(() => {
    if (!moves) {
      cancelAnimation(pulse);
      cancelAnimation(morph);
      pulse.value = 0;
      morph.value = 0.5;
      return;
    }
    pulse.value = withRepeat(
      withTiming(1, { duration: live ? 1300 : 2400, easing: Easing.inOut(Easing.quad) }), -1, true,
    );
    morph.value = withRepeat(
      withTiming(1, { duration: live ? 2000 : 3700, easing: Easing.inOut(Easing.ease) }), -1, true,
    );
    return () => { cancelAnimation(pulse); cancelAnimation(morph); };
  }, [moves, live, pulse, morph]);

  const orb = useAnimatedStyle(() => {
    const swell = live ? 0.1 : 0.055;
    const squash = live ? 0.075 : 0.04;
    const turn = live ? 34 : 14;
    return {
      transform: [
        { scale: 1 + pulse.value * swell },
        { scaleX: 1 + (morph.value - 0.5) * squash },
        { scaleY: 1 - (morph.value - 0.5) * squash },
        { rotate: `${-18 + morph.value * turn}deg` },
      ],
    };
  });

  // A soft halo breathing against the orb, so the pulse reads even at a glance.
  const halo = useAnimatedStyle(() => ({
    opacity: 0.10 + pulse.value * (live ? 0.3 : 0.16),
    transform: [{ scale: 1.06 + pulse.value * (live ? 0.22 : 0.12) }],
  }));

  const start = useCallback(async () => {
    if (!topic.trim()) { toast.show('Give it a topic first.'); return; }
    try {
      const perm = await Audio.requestPermissionsAsync();
      if (!perm.granted) { toast.show('Microphone access is needed to record.'); return; }
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const { recording: rec } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY,
      );
      recording.current = rec;
      setElapsed(0);
      setStage('recording');
      feel.medium();
      timer.current = setInterval(() => setElapsed(e => e + 1), 1000);
    } catch {
      toast.show('Could not start recording.');
    }
  }, [topic, toast]);

  const finish = useCallback(async () => {
    const rec = recording.current;
    if (!rec) return;
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    feel.light();
    setStage('processing');
    try {
      await rec.stopAndUnloadAsync();
      const uri = rec.getURI();
      recording.current = null;
      if (!uri) throw new Error('No recording');
      const session = await submitSpeakingSession({
        uri,
        topic: topic.trim(),
        audience,
        targetSeconds: target,
        actualSeconds: elapsed,
      });
      setResult(session);
      setStage('results');
      feel.success();
      load();
    } catch (err: any) {
      toast.show(String(err?.message ?? err).replace(/^API \d+: /, '').slice(0, 120));
      setStage('setup');
    }
  }, [topic, audience, target, elapsed, toast, load]);

  const cancel = useCallback(async () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    try { await recording.current?.stopAndUnloadAsync(); } catch { /* already stopped */ }
    recording.current = null;
    setStage('setup');
  }, []);

  const openEvaluation = useCallback(async (id: number, title: string) => {
    sheet.open(title, () => <EvaluationSheet id={id} />);
  }, [sheet]);

  const refresh = useCallback(async () => { setRefreshing(true); await load(); setRefreshing(false); }, [load]);

  // --- recording ---
  if (stage === 'recording' || stage === 'processing') {
    const over = elapsed > target;
    return (
      <Screen contextKey={`speak-${stage}`} scroll={false}>
        <FlowTop step={`${AUDIENCE_LABEL[audience]} · ${targetLabel(target)}`} onBack={cancel} />
        <Title numberOfLines={2}>{topic}</Title>
        <View style={s.stage}>
          <View style={s.orbWrap}>
            <Animated.View pointerEvents="none" style={[s.halo, { backgroundColor: c.accent }, halo]} />
            <Animated.View style={orb}><VoiceOrb /></Animated.View>
          </View>
          <Animated.Text style={[s.clock, { color: over ? c.warm : c.fg }]}>
            {stage === 'processing' ? 'Listening back…' : clock(elapsed)}
          </Animated.Text>
          <Small>{stage === 'processing' ? 'Transcribing and scoring' : `Target ${targetLabel(target)}${over ? ' · over' : ''}`}</Small>
        </View>
        {stage === 'recording' ? (
          <Button full label="Finish and evaluate" icon="stop" haptic="light" onPress={finish} />
        ) : null}
      </Screen>
    );
  }

  // --- results ---
  if (stage === 'results' && result) {
    return (
      <Screen contextKey="speak-results" onRefresh={refresh} refreshing={refreshing}>
        <FlowTop step="How it landed" onBack={() => { setResult(null); setStage('setup'); }} />
        <Title numberOfLines={2}>{result.topic}</Title>
        <Body style={{ marginTop: 10 }}>
          {AUDIENCE_LABEL[result.audience] ?? result.audience} · {clock(result.actual_seconds)}
        </Body>
        <Evaluation evaluation={result.evaluation} transcript={result.transcript} />
        <Button full kind="quiet" label="Explain something else" style={{ marginTop: 10 }}
          onPress={() => { setResult(null); setTopic(''); setStage('setup'); }} />
      </Screen>
    );
  }

  // --- setup ---
  return (
    <Screen contextKey="speak" onRefresh={refresh} refreshing={refreshing}>
      <TopBar label="Speak · Space to think" onProfile={() => navigation.navigate('Me')} />
      <Title>A thought,{'\n'}<Em>out loud.</Em></Title>
      <Body style={{ marginTop: 12 }}>
        Explain an idea to someone specific. You get it back scored, with the lines that worked and
        the ones that didn’t.
      </Body>

      <View style={s.stageSmall}>
        <View style={s.orbWrap}>
          <Animated.View pointerEvents="none" style={[s.haloSmall, { backgroundColor: c.accent }, halo]} />
          <Animated.View style={orb}><VoiceOrb size={120} /></Animated.View>
        </View>
      </View>

      <Eyebrow>What are you explaining?</Eyebrow>
      <TextInput
        style={[s.input, { backgroundColor: c.panel, borderColor: c.line, color: c.fg }]}
        value={topic}
        onChangeText={setTopic}
        placeholder="Stochastic volatility, in plain terms"
        placeholderTextColor={c.muted}
        multiline
      />
      {suggestions.length && !topic ? (
        <View style={s.suggestions}>
          {suggestions.slice(0, 3).map(sg => (
            <Pressable
              key={sg.topic}
              accessibilityRole="button"
              onPress={() => { feel.selection(); setTopic(sg.topic); }}
              style={[s.suggestion, { backgroundColor: c.soft }]}
            >
              <Small style={{ color: c.accent }} numberOfLines={1}>{sg.topic}</Small>
            </Pressable>
          ))}
        </View>
      ) : null}

      <Eyebrow style={{ marginTop: 20 }}>Who is listening?</Eyebrow>
      <Options
        values={AUDIENCES.map(a => a.id)}
        selected={audience}
        onSelect={setAudience}
        labels={id => AUDIENCE_LABEL[id]}
      />
      <Small style={{ marginTop: -10 }}>{AUDIENCES.find(a => a.id === audience)?.sub}</Small>

      <Eyebrow style={{ marginTop: 20 }}>How long have you got?</Eyebrow>
      <Options values={TARGETS} selected={target} onSelect={setTarget} labels={targetLabel} />

      <Button full label="Start explaining" icon="mic" haptic="soft" onPress={start} />
      <InlineButton
        label="Or just talk it through with the coach"
        onPress={() => navigation.navigate('Train', { screen: 'CoachVoice' })}
        style={{ alignSelf: 'center' }}
      />

      {stats?.total_sessions ? (
        <>
          <Section title="Your practice" trailing={<Small>{stats.total_sessions} sessions</Small>} />
          <Body>
            {Math.round(stats.total_minutes)} minutes recorded
            {stats.avg_scores?.overall_score ? ` · average ${Math.round(stats.avg_scores.overall_score)}` : ''}
            {stats.recent_trend ? ` · ${stats.recent_trend.improving ? 'improving' : 'holding steady'}` : ''}
          </Body>
        </>
      ) : null}

      <Section title="Pick up a thread" />
      {sessions.length ? sessions.map((sess, i) => (
        <Pressable
          key={sess.id}
          accessibilityRole="button"
          accessibilityLabel={`${sess.topic}. ${sess.evaluation ? `Scored ${Math.round(sess.evaluation.overall_score)}` : 'Not scored'}. Open the evaluation.`}
          onPress={() => { feel.selection(); openEvaluation(sess.id, sess.topic); }}
          style={[s.sessionRow, { borderTopColor: i === 0 ? 'transparent' : c.line }]}
        >
          <View style={{ flex: 1 }}>
            <Animated.Text style={[s.sessionTitle, { color: c.fg }]} numberOfLines={1}>{sess.topic}</Animated.Text>
            <Small style={{ marginTop: 4 }}>
              {AUDIENCE_LABEL[sess.audience] ?? sess.audience} · {prettyDate(sess.session_date?.slice(0, 10))} · {clock(sess.actual_seconds ?? 0)}
            </Small>
          </View>
          {sess.evaluation ? (
            <Animated.Text style={[s.score, { color: scoreColor(sess.evaluation.overall_score, c) }]}>
              {Math.round(sess.evaluation.overall_score)}
            </Animated.Text>
          ) : <Small>—</Small>}
          <Ionicons name="chevron-forward" size={16} color={c.muted} />
        </Pressable>
      )) : (
        <Body>No recorded sessions yet.</Body>
      )}
    </Screen>
  );
}

/** Loads one past session and shows its evaluation. */
function EvaluationSheet({ id }: { id: number }) {
  const [session, setSession] = useState<SpeakingSessionFull | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    getSpeakingSession(id).then(setSession).catch(() => setError(true));
  }, [id]);

  if (error) return <Body>Could not load that evaluation.</Body>;
  if (!session) return <Body>Opening…</Body>;

  return (
    <View>
      <Small>
        {AUDIENCE_LABEL[session.audience] ?? session.audience} · {prettyDate(session.session_date?.slice(0, 10))} · {clock(session.actual_seconds ?? 0)}
      </Small>
      <Evaluation evaluation={session.evaluation} transcript={session.transcript} compact />
    </View>
  );
}

function scoreColor(score: number, c: { green: string; warm: string; muted: string }) {
  return score >= 70 ? c.green : score >= 50 ? c.warm : c.muted;
}

/** The scored result: an overall mark, the five dimensions, fillers and quoted feedback. */
function Evaluation({
  evaluation, transcript, compact,
}: {
  evaluation: SpeakingEvaluation | null;
  transcript?: string;
  compact?: boolean;
}) {
  const { c } = useTheme();
  const sheet = useSheet();

  if (!evaluation) {
    return (
      <Notice icon="alert-circle-outline">
        This session has no evaluation. The recording was saved but not scored.
      </Notice>
    );
  }

  const fillers = Object.entries(evaluation.filler_words ?? {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  return (
    <View>
      <View style={s.scoreRow}>
        <View>
          <Small>Overall</Small>
          <Animated.Text style={[s.bigScore, { color: scoreColor(evaluation.overall_score, c) }]}>
            {Math.round(evaluation.overall_score)}
          </Animated.Text>
        </View>
        <Small style={{ flex: 1, textAlign: 'right', maxWidth: 190 }}>{evaluation.pause_assessment}</Small>
      </View>

      {DIMENSIONS.map(d => {
        const value = Number(evaluation[d.key] ?? 0);
        return (
          <View key={d.key} style={s.dimension}>
            <Small style={{ width: 92, color: c.fg }}>{d.label}</Small>
            <View style={[s.bar, { backgroundColor: c.panel2 }]}>
              <View style={{ width: `${Math.max(0, Math.min(100, value))}%`, height: '100%', borderRadius: 3, backgroundColor: scoreColor(value, c) }} />
            </View>
            <Small style={{ width: 28, textAlign: 'right' }}>{Math.round(value)}</Small>
          </View>
        );
      })}

      {evaluation.commentary ? (
        <Panel style={{ marginTop: 18, backgroundColor: c.bg, borderRadius: 18, padding: 17 }}>
          <Body style={{ color: c.fg }}>{evaluation.commentary}</Body>
        </Panel>
      ) : null}

      <Section title="Filler" trailing={<Small>{evaluation.filler_count} in total</Small>} />
      {fillers.length ? fillers.map(([word, n], i) => (
        <DetailRow key={word} label={`“${word}”` } value={`${n}×`} last={i === fillers.length - 1} />
      )) : <Body>None worth counting.</Body>}

      {evaluation.specific_feedback?.length ? (
        <>
          <Section title="Line by line" />
          {evaluation.specific_feedback.slice(0, compact ? 3 : 6).map((f, i) => (
            <View key={i} style={[s.feedback, { borderLeftColor: f.type === 'strength' ? c.green : c.warm }]}>
              <Body style={{ color: c.fg, fontFamily: fonts.serif, fontSize: 15 }}>“{f.quote}”</Body>
              <Small style={{ marginTop: 6 }}>{f.feedback}</Small>
            </View>
          ))}
        </>
      ) : null}

      {transcript ? (
        <Button
          full
          kind="quiet"
          label="Read the transcript"
          style={{ marginTop: 14 }}
          onPress={() => sheet.open('What you said.', () => <Body style={{ color: c.fg }}>{transcript}</Body>)}
        />
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  stage: { alignItems: 'center', paddingVertical: 40, gap: 18 },
  stageSmall: { alignItems: 'center', paddingVertical: 18 },
  orbWrap: { alignItems: 'center', justifyContent: 'center' },
  halo: { position: 'absolute', width: 151, height: 151, borderRadius: 76 },
  haloSmall: { position: 'absolute', width: 120, height: 120, borderRadius: 60 },
  clock: { fontFamily: fonts.serif, fontSize: 52, letterSpacing: -1 },

  input: {
    borderWidth: 1, borderRadius: radius.button, paddingHorizontal: 14, paddingVertical: 12,
    fontFamily: fonts.regular, fontSize: 16, marginTop: 8, minHeight: 52, maxHeight: 120,
  },
  suggestions: { gap: 6, marginTop: 8 },
  suggestion: { borderRadius: radius.chip, paddingVertical: 10, paddingHorizontal: 12, minHeight: 40, justifyContent: 'center' },

  sessionRow: { flexDirection: 'row', alignItems: 'center', gap: 12, borderTopWidth: 1, paddingVertical: 16 },
  sessionTitle: { fontFamily: fonts.medium, fontSize: 13.5 },
  score: { fontFamily: fonts.serif, fontSize: 24 },

  scoreRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, marginVertical: 18 },
  bigScore: { fontFamily: fonts.serif, fontSize: 57, lineHeight: 57, letterSpacing: -1 },
  dimension: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 7 },
  bar: { flex: 1, height: 6, borderRadius: 3, overflow: 'hidden' },
  feedback: { borderLeftWidth: 2, paddingLeft: 14, paddingVertical: 4, marginBottom: 16 },
});
