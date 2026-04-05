/**
 * SpeakingScreen — Record yourself explaining concepts, get AI evaluation.
 *
 * Flow: Pick topic → Record → Transcribe + Evaluate → View results
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput, StyleSheet,
  Alert, Animated, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';
import { Ionicons } from '@expo/vector-icons';
import { API_URL, apiHeaders } from '../api/client';
import { haptic } from '../utils/haptics';
import { colors, spacing, typography, radius } from '../theme';
import ScreenBackground from '../components/ScreenBackground';
import { Skeleton, SkeletonRow } from '../components/Skeleton';
import { usePressScale } from '../hooks/usePressScale';

interface TopicSuggestion {
  topic: string;
  source: string;
  concept_id: number | null;
}

interface EvalResult {
  clarity_score: number;
  accuracy_score: number;
  structure_score: number;
  conciseness_score: number;
  confidence_score: number;
  overall_score: number;
  filler_words: Record<string, number>;
  filler_count: number;
  specific_feedback: Array<{ quote: string; feedback: string; type: string }>;
  pause_assessment: string;
  commentary: string;
}

interface SessionResult {
  id: number;
  topic: string;
  audience: string;
  actual_seconds: number;
  transcript: string;
  session_date: string;
  evaluation: EvalResult | null;
}

interface SpeakingStats {
  total_sessions: number;
  total_minutes: number;
  avg_scores: Record<string, number> | null;
  recent_trend: { recent_avg: number; early_avg: number; delta: number; improving: boolean } | null;
}

type ScreenState = 'setup' | 'recording' | 'processing' | 'results' | 'history';

const AUDIENCES = [
  { id: 'junior_analyst', label: 'Junior Analyst' },
  { id: 'lp_meeting', label: 'LP Meeting' },
  { id: 'technical_peer', label: 'Technical Peer' },
  { id: 'podcast', label: 'Podcast' },
  { id: 'general', label: 'General' },
];

const TARGETS = [
  { seconds: 120, label: '2 min' },
  { seconds: 180, label: '3 min' },
  { seconds: 300, label: '5 min' },
];

const SCORE_DIMENSIONS = [
  { key: 'clarity_score', label: 'Clarity', icon: 'eye-outline' },
  { key: 'accuracy_score', label: 'Accuracy', icon: 'checkmark-circle-outline' },
  { key: 'structure_score', label: 'Structure', icon: 'git-branch-outline' },
  { key: 'conciseness_score', label: 'Conciseness', icon: 'resize-outline' },
  { key: 'confidence_score', label: 'Confidence', icon: 'shield-outline' },
] as const;

export default function SpeakingScreen() {
  const insets = useSafeAreaInsets();
  const [screenState, setScreenState] = useState<ScreenState>('setup');
  const [topic, setTopic] = useState('');
  const [audience, setAudience] = useState('general');
  const [targetSeconds, setTargetSeconds] = useState(180);
  const [suggestions, setSuggestions] = useState<TopicSuggestion[]>([]);
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [result, setResult] = useState<SessionResult | null>(null);
  const [expandedFeedback, setExpandedFeedback] = useState<number | null>(null);
  const [showTranscript, setShowTranscript] = useState(false);
  const [pastSessions, setPastSessions] = useState<SessionResult[]>([]);
  const [stats, setStats] = useState<SpeakingStats | null>(null);
  const [expandedPast, setExpandedPast] = useState<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [pulseAnim] = useState(new Animated.Value(1));
  const recordBtnScale = usePressScale(0.95);

  // Fetch suggestions on mount
  useEffect(() => {
    (async () => {
      try {
        const resp = await fetch(`${API_URL}/api/v1/speaking/topics/suggest`, { headers: apiHeaders() });
        if (resp.ok) setSuggestions(await resp.json());
      } catch {}
    })();
  }, []);

  // Pulse animation during recording
  useEffect(() => {
    if (screenState === 'recording') {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.15, duration: 600, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
        ])
      );
      loop.start();
      return () => loop.stop();
    }
  }, [screenState]);

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const startRecording = async () => {
    if (!topic.trim()) return Alert.alert('Required', 'Enter a topic first.');
    try {
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') return Alert.alert('Permission needed', 'Microphone access required.');

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const { recording: rec } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      setRecording(rec);
      setElapsed(0);
      setScreenState('recording');
      haptic.medium();

      timerRef.current = setInterval(() => {
        setElapsed(prev => prev + 1);
      }, 1000);
    } catch (err) {
      console.warn('Failed to start recording:', err);
      Alert.alert('Error', 'Could not start recording.');
    }
  };

  const stopRecording = async () => {
    if (!recording) return;
    if (timerRef.current) clearInterval(timerRef.current);
    haptic.success();
    setScreenState('processing');

    try {
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      setRecording(null);

      if (!uri) throw new Error('No recording URI');

      // Upload and evaluate
      const formData = new FormData();
      formData.append('audio', {
        uri,
        type: 'audio/m4a',
        name: 'recording.m4a',
      } as any);
      formData.append('topic', topic.trim());
      formData.append('audience', audience);
      formData.append('target_seconds', targetSeconds.toString());
      formData.append('actual_seconds', elapsed.toString());

      const resp = await fetch(`${API_URL}/api/v1/speaking/sessions`, {
        method: 'POST',
        headers: {
          ...apiHeaders(),
          'Content-Type': 'multipart/form-data',
        },
        body: formData,
      });

      if (resp.ok) {
        const data = await resp.json();
        setResult(data);
        setScreenState('results');
      } else {
        const err = await resp.text();
        console.warn('Upload failed:', err);
        Alert.alert('Error', 'Failed to process recording.');
        setScreenState('setup');
      }
    } catch (err) {
      console.warn('Recording error:', err);
      Alert.alert('Error', 'Something went wrong.');
      setScreenState('setup');
    }
  };

  const loadHistory = async () => {
    try {
      const [sessResp, statsResp] = await Promise.all([
        fetch(`${API_URL}/api/v1/speaking/sessions?limit=20`, { headers: apiHeaders() }),
        fetch(`${API_URL}/api/v1/speaking/stats`, { headers: apiHeaders() }),
      ]);
      if (sessResp.ok) setPastSessions(await sessResp.json());
      if (statsResp.ok) setStats(await statsResp.json());
    } catch {}
    setScreenState('history');
  };

  const scoreColor = (score: number) =>
    score >= 70 ? colors.success : score >= 50 ? colors.warning : colors.error;

  const resetToSetup = () => {
    setTopic(''); setResult(null); setScreenState('setup');
    setExpandedFeedback(null); setShowTranscript(false);
  };

  // ===== SETUP =====
  if (screenState === 'setup') {
    return (
      <ScreenBackground>
      <ScrollView style={st.scroll} contentContainerStyle={[st.container, { paddingTop: insets.top + spacing.sm }]} keyboardShouldPersistTaps="handled">
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={st.screenTitle}>Speak</Text>
          <TouchableOpacity onPress={loadHistory} style={st.historyBtn}>
            <Ionicons name="time-outline" size={18} color={colors.accent} />
            <Text style={st.historyBtnText}>History</Text>
          </TouchableOpacity>
        </View>

        <Text style={st.label}>WHAT ARE YOU EXPLAINING?</Text>
        <TextInput
          style={st.input}
          placeholder="e.g. Itô's Lemma, Black-Scholes intuition..."
          placeholderTextColor={colors.textTertiary}
          value={topic}
          onChangeText={setTopic}
        />

        {suggestions.length > 0 && !topic && (
          <View style={st.suggestionsBox}>
            <Text style={st.suggestLabel}>FROM YOUR WEEK</Text>
            {suggestions.slice(0, 5).map((s, i) => (
              <TouchableOpacity key={i} style={st.suggestionChip}
                onPress={() => { haptic.light(); setTopic(s.topic); }}>
                <Ionicons name={s.source === 'concept' ? 'bulb-outline' : 'checkbox-outline'}
                  size={14} color={colors.accent} />
                <Text style={st.suggestionText} numberOfLines={1}>{s.topic}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        <Text style={st.label}>AUDIENCE</Text>
        <View style={st.chipRow}>
          {AUDIENCES.map(a => (
            <TouchableOpacity key={a.id}
              style={[st.chip, audience === a.id && st.chipActive]}
              onPress={() => { haptic.light(); setAudience(a.id); }}>
              <Text style={[st.chipText, audience === a.id && st.chipTextActive]}>{a.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={st.label}>TARGET TIME</Text>
        <View style={st.chipRow}>
          {TARGETS.map(t => (
            <TouchableOpacity key={t.seconds}
              style={[st.chip, targetSeconds === t.seconds && st.chipActive]}
              onPress={() => { haptic.light(); setTargetSeconds(t.seconds); }}>
              <Text style={[st.chipText, targetSeconds === t.seconds && st.chipTextActive]}>{t.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Animated.View style={recordBtnScale.animStyle}>
          <TouchableOpacity style={st.recordBtn} onPress={startRecording}
            onPressIn={recordBtnScale.onPressIn} onPressOut={recordBtnScale.onPressOut}>
            <Ionicons name="mic" size={24} color={colors.text} />
            <Text style={st.recordBtnText}>Start Recording</Text>
          </TouchableOpacity>
        </Animated.View>
      </ScrollView>
      </ScreenBackground>
    );
  }

  // ===== RECORDING =====
  if (screenState === 'recording') {
    const overTarget = elapsed > targetSeconds;
    return (
      <ScreenBackground>
      <View style={[st.centerScreen, { paddingTop: insets.top }]}>
        <Text style={st.recordingTopic} numberOfLines={2}>{topic}</Text>

        <Animated.View style={[st.micRing, { transform: [{ scale: pulseAnim }] }]}>
          <View style={st.micInner}>
            <Ionicons name="mic" size={48} color="#EF4444" />
          </View>
        </Animated.View>

        <Text style={[st.timerText, overTarget && { color: colors.warning }]}>
          {formatTime(elapsed)}
        </Text>
        <Text style={st.timerTarget}>target: {formatTime(targetSeconds)}</Text>

        <TouchableOpacity style={st.stopBtn} onPress={stopRecording}>
          <View style={st.stopSquare} />
          <Text style={st.stopBtnText}>Stop</Text>
        </TouchableOpacity>
      </View>
      </ScreenBackground>
    );
  }

  // ===== PROCESSING =====
  if (screenState === 'processing') {
    return (
      <ScreenBackground>
      <View style={st.centerScreen}>
        <Skeleton width={64} height={64} borderRadius={32} style={{ marginBottom: spacing.md }} />
        <Text style={st.processingTitle}>Transcribing & evaluating...</Text>
        <Text style={st.processingSub}>This takes 15-30 seconds</Text>
      </View>
      </ScreenBackground>
    );
  }

  // ===== HISTORY =====
  if (screenState === 'history') {
    return (
      <ScreenBackground>
      <ScrollView style={st.scroll} contentContainerStyle={[st.container, { paddingTop: insets.top + spacing.sm }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.lg }}>
          <TouchableOpacity onPress={() => setScreenState('setup')}>
            <Ionicons name="arrow-back" size={22} color={colors.accent} />
          </TouchableOpacity>
          <Text style={st.screenTitle}>Speaking History</Text>
        </View>

        {stats && stats.total_sessions > 0 && (
          <View style={st.statsCard}>
            <View style={st.statsRow}>
              <View style={st.statItem}>
                <Text style={st.statValue}>{stats.total_sessions}</Text>
                <Text style={st.statLabel}>Sessions</Text>
              </View>
              <View style={st.statItem}>
                <Text style={st.statValue}>{Math.round(stats.total_minutes)}m</Text>
                <Text style={st.statLabel}>Practice</Text>
              </View>
              {stats.avg_scores && (
                <View style={st.statItem}>
                  <Text style={[st.statValue, { color: scoreColor(stats.avg_scores.overall) }]}>
                    {Math.round(stats.avg_scores.overall)}
                  </Text>
                  <Text style={st.statLabel}>Avg Score</Text>
                </View>
              )}
            </View>
            {stats.recent_trend && (
              <View style={st.trendRow}>
                <Ionicons
                  name={stats.recent_trend.improving ? 'trending-up' : 'trending-down'}
                  size={16}
                  color={stats.recent_trend.improving ? colors.success : colors.error}
                />
                <Text style={{
                  ...typography.caption,
                  color: stats.recent_trend.improving ? colors.success : colors.error,
                }}>
                  {stats.recent_trend.improving ? '+' : ''}{stats.recent_trend.delta.toFixed(1)} pts vs early sessions
                </Text>
              </View>
            )}

            {/* Dimension averages */}
            {stats.avg_scores && (
              <View style={{ marginTop: spacing.md }}>
                {SCORE_DIMENSIONS.map(d => (
                  <View key={d.key} style={st.dimRow}>
                    <Ionicons name={d.icon as any} size={14} color={colors.textTertiary} />
                    <Text style={st.dimLabel}>{d.label}</Text>
                    <View style={st.dimBarTrack}>
                      <View style={[st.dimBarFill, {
                        width: `${stats.avg_scores![d.key.replace('_score', '')]}%` as any,
                        backgroundColor: scoreColor(stats.avg_scores![d.key.replace('_score', '')]),
                      }]} />
                    </View>
                    <Text style={[st.dimValue, { color: scoreColor(stats.avg_scores![d.key.replace('_score', '')]) }]}>
                      {Math.round(stats.avg_scores![d.key.replace('_score', '')])}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

        {pastSessions.map(s => (
          <PastSessionCard
            key={s.id}
            session={s}
            isExpanded={expandedPast === s.id}
            onToggle={() => { haptic.light(); setExpandedPast(expandedPast === s.id ? null : s.id); }}
            scoreColor={scoreColor}
            formatTime={formatTime}
          />
        ))}

        {pastSessions.length === 0 && (
          <View style={{ alignItems: 'center', paddingVertical: spacing.xxl }}>
            <Ionicons name="mic-off-outline" size={48} color={colors.textTertiary} />
            <Text style={{ ...typography.body, color: colors.textTertiary, marginTop: spacing.md }}>
              No speaking sessions yet
            </Text>
          </View>
        )}
      </ScrollView>
      </ScreenBackground>
    );
  }

  // ===== RESULTS =====
  if (screenState === 'results' && result) {
    const ev = result.evaluation;
    return (
      <ScreenBackground>
      <ScrollView style={st.scroll} contentContainerStyle={[st.container, { paddingTop: insets.top + spacing.sm }]}>
        {/* Back button */}
        <TouchableOpacity onPress={resetToSetup} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: spacing.md }}>
          <Ionicons name="arrow-back" size={22} color={colors.accent} />
          <Text style={{ ...typography.bodyBold, color: colors.accent, marginLeft: spacing.xs }}>Back</Text>
        </TouchableOpacity>
        {ev ? (
          <>
            {/* Overall score */}
            <View style={st.overallScoreContainer}>
              <View style={[st.overallRing, { borderColor: scoreColor(ev.overall_score) }]}>
                <Text style={[st.overallScore, { color: scoreColor(ev.overall_score) }]}>
                  {ev.overall_score}
                </Text>
              </View>
              <Text style={st.overallLabel}>Overall Score</Text>
              <Text style={st.topicLabel}>{result.topic}</Text>
            </View>

            {/* Dimension scores */}
            <View style={st.card}>
              {SCORE_DIMENSIONS.map(d => {
                const score = ev[d.key as keyof EvalResult] as number;
                return (
                  <View key={d.key} style={st.dimRow}>
                    <Ionicons name={d.icon as any} size={14} color={colors.textTertiary} />
                    <Text style={st.dimLabel}>{d.label}</Text>
                    <View style={st.dimBarTrack}>
                      <View style={[st.dimBarFill, {
                        width: `${score}%` as any,
                        backgroundColor: scoreColor(score),
                      }]} />
                    </View>
                    <Text style={[st.dimValue, { color: scoreColor(score) }]}>{score}</Text>
                  </View>
                );
              })}
            </View>

            {/* Filler words */}
            {ev.filler_count > 0 && (
              <View style={st.card}>
                <Text style={st.cardLabel}>
                  FILLER WORDS · <Text style={{ color: colors.error }}>{ev.filler_count}</Text>
                </Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
                  {Object.entries(ev.filler_words)
                    .filter(([, count]) => (count as number) > 0)
                    .sort(([, a], [, b]) => (b as number) - (a as number))
                    .map(([word, count]) => (
                      <View key={word} style={st.fillerChip}>
                        <Text style={st.fillerWord}>"{word}"</Text>
                        <Text style={st.fillerCount}>×{count as number}</Text>
                      </View>
                    ))}
                </View>
              </View>
            )}

            {/* Pause Assessment */}
            {ev.pause_assessment ? (
              <View style={st.card}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: spacing.sm }}>
                  <Ionicons name="pause-circle-outline" size={14} color={colors.warning} />
                  <Text style={st.cardLabel}>PAUSE ANALYSIS</Text>
                </View>
                <Text style={st.commentaryText}>{ev.pause_assessment}</Text>
              </View>
            ) : null}

            {/* Commentary */}
            <View style={st.card}>
              <Text style={st.cardLabel}>HONEST MIRROR</Text>
              <Text style={st.commentaryText}>{ev.commentary}</Text>
            </View>

            {/* Specific feedback */}
            {ev.specific_feedback.length > 0 && (
              <View style={st.card}>
                <Text style={st.cardLabel}>SPECIFIC FEEDBACK</Text>
                {ev.specific_feedback.map((fb, i) => (
                  <TouchableOpacity key={i} style={st.feedbackItem}
                    onPress={() => { haptic.light(); setExpandedFeedback(expandedFeedback === i ? null : i); }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: 4 }}>
                      <Ionicons
                        name={fb.type === 'strength' ? 'checkmark-circle' : 'alert-circle'}
                        size={14}
                        color={fb.type === 'strength' ? colors.success : colors.warning}
                      />
                      <Text style={st.feedbackType}>{fb.type === 'strength' ? 'Strength' : 'Improve'}</Text>
                    </View>
                    <Text style={st.feedbackQuote}>"{fb.quote}"</Text>
                    {(expandedFeedback === i || ev.specific_feedback.length <= 3) && (
                      <Text style={st.feedbackText}>{fb.feedback}</Text>
                    )}
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* Transcript toggle */}
            <TouchableOpacity style={st.card}
              onPress={() => setShowTranscript(!showTranscript)}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text style={st.cardLabel}>TRANSCRIPT</Text>
                <Ionicons name={showTranscript ? 'chevron-up' : 'chevron-down'}
                  size={16} color={colors.textTertiary} />
              </View>
              {showTranscript && (
                <Text style={st.transcriptText}>{result.transcript}</Text>
              )}
            </TouchableOpacity>
          </>
        ) : (
          <View style={{ alignItems: 'center', paddingVertical: spacing.xxl }}>
            <Ionicons name="checkmark-circle" size={48} color={colors.success} />
            <Text style={{ ...typography.bodyBold, color: colors.text, marginTop: spacing.md }}>
              Session recorded
            </Text>
            <Text style={{ ...typography.caption, color: colors.textTertiary }}>
              Evaluation unavailable
            </Text>
          </View>
        )}

        <View style={{ flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg }}>
          <TouchableOpacity style={[st.secondaryBtn, { flex: 1 }]} onPress={loadHistory}>
            <Text style={st.secondaryBtnText}>History</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[st.recordBtn, { flex: 1 }]} onPress={resetToSetup}>
            <Text style={st.recordBtnText}>New Session</Text>
          </TouchableOpacity>
        </View>
        <View style={{ height: 40 }} />
      </ScrollView>
      </ScreenBackground>
    );
  }

  return null;
}

function PastSessionCard({ session: s, isExpanded, onToggle, scoreColor, formatTime }: {
  session: SessionResult; isExpanded: boolean; onToggle: () => void;
  scoreColor: (n: number) => string; formatTime: (s: number) => string;
}) {
  const { animStyle, onPressIn, onPressOut } = usePressScale(0.97);
  const ev = s.evaluation;
  return (
    <Animated.View style={animStyle}>
      <TouchableOpacity style={st.pastCard} onPress={onToggle} activeOpacity={0.7}
        onPressIn={onPressIn} onPressOut={onPressOut}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ flex: 1 }}>
            <Text style={st.pastTopic} numberOfLines={1}>{s.topic}</Text>
            <Text style={st.pastMeta}>{s.session_date} {'\u00B7'} {formatTime(s.actual_seconds || 0)}</Text>
          </View>
          {ev && (
            <View style={[st.pastScoreBadge, { borderColor: scoreColor(ev.overall_score) }]}>
              <Text style={[st.pastScoreText, { color: scoreColor(ev.overall_score) }]}>
                {ev.overall_score}
              </Text>
            </View>
          )}
        </View>
        {isExpanded && ev && (
          <View style={{ marginTop: spacing.md }}>
            <View style={{ marginBottom: spacing.md }}>
              {SCORE_DIMENSIONS.map(d => {
                const score = ev[d.key as keyof EvalResult] as number;
                return score != null ? (
                  <View key={d.key} style={st.dimRow}>
                    <Ionicons name={d.icon as any} size={14} color={colors.textTertiary} />
                    <Text style={st.dimLabel}>{d.label}</Text>
                    <View style={st.dimBarTrack}>
                      <View style={[st.dimBarFill, {
                        width: `${score}%` as any,
                        backgroundColor: scoreColor(score),
                      }]} />
                    </View>
                    <Text style={[st.dimValue, { color: scoreColor(score) }]}>{score}</Text>
                  </View>
                ) : null;
              })}
            </View>
            <Text style={st.commentaryText}>{ev.commentary}</Text>
            {ev.specific_feedback.slice(0, 3).map((fb: any, i: number) => (
              <View key={i} style={st.feedbackItem}>
                <Text style={st.feedbackQuote}>"{fb.quote}"</Text>
                <Text style={st.feedbackText}>{fb.feedback}</Text>
              </View>
            ))}
          </View>
        )}
      </TouchableOpacity>
    </Animated.View>
  );
}

const st = StyleSheet.create({
  scroll: { flex: 1 },
  container: { padding: spacing.lg },
  centerScreen: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xxl },
  screenTitle: { ...typography.title1, color: colors.text },

  // Setup
  label: {
    ...typography.micro, color: colors.textTertiary, textTransform: 'uppercase',
    marginBottom: spacing.sm, marginTop: spacing.lg,
  },
  input: {
    backgroundColor: colors.input, color: colors.text, borderRadius: radius.md,
    padding: spacing.md, fontSize: 15, borderWidth: 1, borderColor: colors.border,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderRadius: radius.pill, backgroundColor: colors.input,
    borderWidth: 1, borderColor: colors.border,
  },
  chipActive: { backgroundColor: colors.accentMuted, borderColor: colors.accent },
  chipText: { ...typography.caption, color: colors.textTertiary },
  chipTextActive: { color: colors.accent },
  suggestionsBox: { marginTop: spacing.md },
  suggestLabel: { ...typography.micro, color: colors.textTertiary, marginBottom: spacing.sm },
  suggestionChip: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  suggestionText: { ...typography.body, color: colors.text, flex: 1, fontSize: 14 },
  historyBtn: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.xs,
    padding: spacing.sm, borderRadius: radius.md,
  },
  historyBtnText: { ...typography.caption, color: colors.accent, fontWeight: '600' },

  // Recording
  recordingTopic: { ...typography.bodyBold, color: colors.textSecondary, textAlign: 'center', marginBottom: spacing.xl },
  micRing: {
    width: 140, height: 140, borderRadius: 70,
    backgroundColor: '#EF444415', borderWidth: 2, borderColor: '#EF444440',
    alignItems: 'center', justifyContent: 'center',
  },
  micInner: {
    width: 100, height: 100, borderRadius: 50,
    backgroundColor: '#EF444420', alignItems: 'center', justifyContent: 'center',
  },
  timerText: { ...typography.title1, color: colors.text, fontSize: 48, marginTop: spacing.xl, fontVariant: ['tabular-nums'] as any },
  timerTarget: { ...typography.caption, color: colors.textTertiary, marginTop: spacing.xs },
  stopBtn: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: '#EF4444', borderRadius: radius.lg,
    paddingHorizontal: spacing.xl, paddingVertical: spacing.md, marginTop: spacing.xxl,
  },
  stopSquare: { width: 14, height: 14, borderRadius: 2, backgroundColor: '#fff' },
  stopBtnText: { ...typography.bodyBold, color: '#fff' },

  // Processing
  processingTitle: { ...typography.title2 || typography.bodyBold, color: colors.text, marginTop: spacing.lg },
  processingSub: { ...typography.caption, color: colors.textTertiary, marginTop: spacing.xs },

  // Results
  overallScoreContainer: { alignItems: 'center', marginBottom: spacing.lg },
  overallRing: {
    width: 80, height: 80, borderRadius: 40, borderWidth: 4,
    alignItems: 'center', justifyContent: 'center',
  },
  overallScore: { fontSize: 32, fontWeight: '800', fontVariant: ['tabular-nums'] as any },
  overallLabel: { ...typography.caption, color: colors.textTertiary, marginTop: spacing.xs },
  topicLabel: { ...typography.bodyBold, color: colors.text, marginTop: spacing.sm, textAlign: 'center' },

  card: {
    backgroundColor: colors.input, borderRadius: radius.lg,
    padding: spacing.lg, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.md,
  },
  cardLabel: {
    ...typography.micro, color: colors.textTertiary, textTransform: 'uppercase',
    marginBottom: spacing.sm, letterSpacing: 0.5,
  },

  // Dimensions
  dimRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  dimLabel: { ...typography.caption, color: colors.textSecondary, width: 80 },
  dimBarTrack: { flex: 1, height: 6, backgroundColor: colors.card, borderRadius: 3 },
  dimBarFill: { height: 6, borderRadius: 3 },
  dimValue: { fontSize: 13, fontWeight: '700', width: 28, textAlign: 'right', fontVariant: ['tabular-nums'] as any },

  // Filler words
  fillerChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: colors.error + '15', borderRadius: radius.pill,
    paddingHorizontal: spacing.md, paddingVertical: spacing.xs,
  },
  fillerWord: { ...typography.caption, color: colors.error, fontStyle: 'italic' },
  fillerCount: { ...typography.caption, color: colors.error, fontWeight: '700' },

  // Feedback
  commentaryText: { ...typography.body, color: colors.text, fontSize: 14, lineHeight: 20 },
  feedbackItem: {
    paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  feedbackType: { ...typography.micro, color: colors.textTertiary, textTransform: 'uppercase' },
  feedbackQuote: { ...typography.body, color: colors.textSecondary, fontStyle: 'italic', fontSize: 13, marginBottom: 4 },
  feedbackText: { ...typography.body, color: colors.text, fontSize: 13, lineHeight: 18 },
  transcriptText: { ...typography.body, color: colors.textSecondary, fontSize: 13, lineHeight: 20, marginTop: spacing.sm },

  // Buttons
  recordBtn: {
    backgroundColor: colors.accent, borderRadius: radius.lg,
    paddingVertical: 18, alignItems: 'center', marginTop: spacing.xl,
    flexDirection: 'row', justifyContent: 'center', gap: spacing.sm,
  },
  recordBtnText: { ...typography.bodyBold, color: colors.text },
  secondaryBtn: {
    backgroundColor: colors.input, borderRadius: radius.lg,
    paddingVertical: 18, alignItems: 'center', borderWidth: 1, borderColor: colors.border,
  },
  secondaryBtnText: { ...typography.bodyBold, color: colors.textSecondary },

  // History
  statsCard: {
    backgroundColor: colors.input, borderRadius: radius.lg,
    padding: spacing.lg, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.lg,
  },
  statsRow: { flexDirection: 'row', justifyContent: 'space-around' },
  statItem: { alignItems: 'center' },
  statValue: { ...typography.title1, color: colors.text, fontSize: 24 },
  statLabel: { ...typography.micro, color: colors.textTertiary, marginTop: 2 },
  trendRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, justifyContent: 'center', marginTop: spacing.md },

  pastCard: {
    backgroundColor: colors.input, borderRadius: radius.lg,
    padding: spacing.lg, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.sm,
  },
  pastTopic: { ...typography.bodyBold, color: colors.text },
  pastMeta: { ...typography.caption, color: colors.textTertiary, marginTop: 2 },
  pastScoreBadge: {
    width: 40, height: 40, borderRadius: 20, borderWidth: 2,
    alignItems: 'center', justifyContent: 'center',
  },
  pastScoreText: { fontSize: 14, fontWeight: '700' },
});
