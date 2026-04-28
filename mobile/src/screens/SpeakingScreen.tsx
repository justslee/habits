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
import Svg, { Path, Circle, Defs, LinearGradient as SvgLG, Stop } from 'react-native-svg';
import { API_URL, apiHeaders } from '../api/client';
import { haptic } from '../utils/haptics';
import { colors, spacing, typography, radius, fonts } from '../theme';
import ScreenBackground from '../components/ScreenBackground';
import { Skeleton, SkeletonRow } from '../components/Skeleton';
import { usePressScale } from '../hooks/usePressScale';
import Topbar from '../components/Topbar';

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
  { id: 'lp_meeting', label: 'LP / Investor', sub: 'Skeptical · 90s patience' },
  { id: 'junior_analyst', label: 'Junior Analyst', sub: 'Internal · jargon ok' },
  { id: 'podcast', label: 'Podcast', sub: 'No technical chops' },
  { id: 'technical_peer', label: 'Technical Peer', sub: 'Deep · precise terms' },
  { id: 'general', label: 'General audience', sub: 'Zero context · be human' },
];

const TARGETS = [
  { seconds: 30, label: '30s' },
  { seconds: 60, label: '1m' },
  { seconds: 120, label: '2m' },
  { seconds: 180, label: '3m' },
  { seconds: 300, label: '5m' },
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

  // Fetch suggestions and stats on mount
  useEffect(() => {
    (async () => {
      try {
        const [topicResp, statsResp] = await Promise.all([
          fetch(`${API_URL}/api/v1/speaking/topics/suggest`, { headers: apiHeaders() }),
          fetch(`${API_URL}/api/v1/speaking/stats`, { headers: apiHeaders() }),
        ]);
        if (topicResp.ok) setSuggestions(await topicResp.json());
        if (statsResp.ok) setStats(await statsResp.json());
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
    const sessionLabel = `SESSION ${String((stats?.total_sessions ?? 0) + 1).padStart(3, '0')} · DAILY REP`;
    const targetLabel = targetSeconds < 60 ? `${targetSeconds}s` : `${Math.round(targetSeconds / 60)} MIN`;
    return (
      <ScreenBackground>
      <ScrollView style={st.scroll} contentContainerStyle={[st.container, { paddingTop: insets.top + spacing.sm }]} keyboardShouldPersistTaps="handled">
        {/* Topbar with brand mark */}
        <Topbar
          title="Speak"
          caption={sessionLabel}
          right={
            <TouchableOpacity onPress={loadHistory} style={st.historyBtn}>
              <Ionicons name="time-outline" size={18} color={colors.accent} />
              <Text style={st.historyBtnText}>History</Text>
            </TouchableOpacity>
          }
        />


        {/* Topic hero */}
        <View style={st.topicHero}>
          <View style={st.topicPill}>
            <Text style={st.topicPillText}>DAILY · {targetLabel}</Text>
          </View>
          <Text style={st.heroEyebrow}>WHAT ARE YOU SAYING?</Text>
          <TextInput
            style={st.topicInput}
            placeholder="One sentence. The thing you have to nail."
            placeholderTextColor={colors.textTertiary}
            value={topic}
            onChangeText={setTopic}
            multiline
          />
          {suggestions.length > 0 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={st.recentChipsScroll}
              contentContainerStyle={st.recentChipsRow}
            >
              {suggestions.slice(0, 6).map((s, i) => (
                <TouchableOpacity
                  key={i}
                  style={st.recentChip}
                  onPress={() => { haptic.light(); setTopic(s.topic); }}
                >
                  <Text style={st.recentChipText} numberOfLines={1}>{s.topic}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
        </View>

        {/* Audience picker — 2 column grid */}
        <View style={st.sectionRow}>
          <Text style={st.sectionTitleSerif}>Audience</Text>
          <Text style={st.sectionMore}>WHO ARE YOU TALKING TO?</Text>
        </View>
        <View style={st.audienceGrid}>
          {AUDIENCES.map(a => {
            const active = audience === a.id;
            return (
              <TouchableOpacity
                key={a.id}
                style={[st.audienceCard, active && st.audienceCardActive]}
                onPress={() => { haptic.light(); setAudience(a.id); }}
              >
                <Text style={[st.audienceLabel, active && { color: colors.accent }]}>{a.label}</Text>
                <Text style={st.audienceSub}>{a.sub}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Duration + record orb */}
        <View style={st.recordCard}>
          <View style={st.recordCardHeader}>
            <Text style={st.eyebrow}>TARGET DURATION</Text>
            <Text style={st.recordCardValue}>{targetLabel}</Text>
          </View>
          <View style={st.durationRow}>
            {TARGETS.map(t => {
              const active = targetSeconds === t.seconds;
              return (
                <TouchableOpacity
                  key={t.seconds}
                  style={[st.durationChip, active && st.durationChipActive]}
                  onPress={() => { haptic.light(); setTargetSeconds(t.seconds); }}
                >
                  <Text style={[st.durationChipText, active && st.durationChipTextActive]}>{t.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Animated.View style={[recordBtnScale.animStyle, st.orbWrap]}>
            <TouchableOpacity
              style={st.recordOrb}
              onPress={startRecording}
              onPressIn={recordBtnScale.onPressIn}
              onPressOut={recordBtnScale.onPressOut}
              activeOpacity={0.85}
            >
              <View style={st.recordOrbCenter} />
            </TouchableOpacity>
            <Text style={st.recordOrbHint}>TAP · GO</Text>
          </Animated.View>

          {/* Static waveform preview */}
          <View style={st.waveformRow}>
            {Array.from({ length: 36 }).map((_, i) => (
              <View
                key={i}
                style={[
                  st.waveBar,
                  { height: 6 + Math.abs(Math.sin(i * 0.7)) * 22 },
                ]}
              />
            ))}
          </View>
        </View>
        <View style={{ height: 40 }} />
      </ScrollView>
      </ScreenBackground>
    );
  }

  // ===== RECORDING =====
  if (screenState === 'recording') {
    const overTarget = elapsed > targetSeconds;
    return (
      <ScreenBackground>
      <View style={[st.centerScreen, { paddingTop: insets.top + spacing.lg, paddingHorizontal: spacing.lg }]}>
        {/* REC pill at top */}
        <View style={st.recPillRow}>
          <View style={st.recDot} />
          <Text style={st.recPillText}>REC · {(audience || 'GENERAL').toUpperCase()}</Text>
        </View>

        {/* Topic in serif italic */}
        <Text style={st.recordingTopicSerif} numberOfLines={3}>"{topic}"</Text>

        {/* 220px ring with elapsed + target */}
        <Animated.View style={[st.recordRingWrap, { transform: [{ scale: pulseAnim }] }]}>
          <View style={[st.recordRing, overTarget && { borderColor: colors.warn }]}>
            <Text style={st.recordEyebrow}>ELAPSED</Text>
            <Text style={[st.recordTimer, overTarget && { color: colors.warn }]}>
              {formatTime(elapsed)}
            </Text>
            <Text style={st.recordTarget}>/ {formatTime(targetSeconds)} TARGET</Text>
          </View>
        </Animated.View>

        {/* Live waveform */}
        <View style={st.liveWaveform}>
          {Array.from({ length: 40 }).map((_, i) => {
            const phase = i * 0.35 + elapsed * 1.2;
            const amp = 0.25 + 0.75 * Math.abs(Math.sin(phase) + 0.5 * Math.sin(phase * 2.3));
            return (
              <View
                key={i}
                style={[
                  st.liveWaveBar,
                  { height: 6 + amp * 44, opacity: 0.4 + amp * 0.6 },
                ]}
              />
            );
          })}
        </View>

        {/* Pace hint */}
        <Text style={st.recordHint}>
          {elapsed < 10 ? 'OPEN WITH THE VERB'
            : elapsed < 30 ? "YOU'RE WARMING UP — STAY WITH IT"
            : elapsed < targetSeconds * 0.6 ? 'GOOD PACE · KEEP CLAIMS TIGHT'
            : elapsed < targetSeconds ? 'LAND THE NEXT MILESTONE'
            : 'OVER TARGET · WRAP IT'}
        </Text>

        {/* 84px stop button */}
        <TouchableOpacity style={st.recordStopBtn} onPress={stopRecording} activeOpacity={0.85}>
          <View style={st.recordStopInner} />
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

  // ===== HISTORY ===== — direct port of canvas SpeakHistory
  if (screenState === 'history') {
    const sessionsForList = pastSessions.slice(0, 14);
    const series = sessionsForList.slice().reverse().map(s => s.evaluation?.overall_score ?? 50);
    const sparkMin = series.length > 0 ? Math.min(...series) : 0;
    const sparkMax = series.length > 0 ? Math.max(...series) : 100;
    const sparkW = 320, sparkH = 60;

    const dims = [
      { key: 'confidence', l: 'Confidence' },
      { key: 'clarity',    l: 'Clarity' },
      { key: 'accuracy',   l: 'Accuracy' },
      { key: 'structure',  l: 'Structure' },
      { key: 'conciseness',l: 'Conciseness' },
    ];

    return (
      <ScreenBackground>
        <ScrollView
          style={st.scroll}
          contentContainerStyle={[st.container, { paddingTop: insets.top + spacing.sm }]}
        >
          {/* Topbar — Speak / HISTORY + ← BACK */}
          <Topbar
            title="Speak"
            caption="HISTORY"
            right={
              <TouchableOpacity
                onPress={() => setScreenState('setup')}
                style={st.historyBackBtn}
              >
                <Text style={st.historyBackText}>← BACK</Text>
              </TouchableOpacity>
            }
          />

          {/* Stats hero — N SESSIONS · M MIN, big serif AVG, ↗ trend, sparkline */}
          {stats && stats.total_sessions > 0 ? (
            <View style={st.histHero}>
              <Text style={st.histHeroEyebrow}>
                {stats.total_sessions} SESSIONS · {Math.round(stats.total_minutes)} MIN
              </Text>
              <View style={st.histHeroRow}>
                <Text style={st.histHeroAvg}>
                  {stats.avg_scores ? Math.round(stats.avg_scores.overall) : '—'}
                </Text>
                <Text style={st.histHeroAvgLabel}>AVG SCORE</Text>
                {stats.recent_trend && (
                  <Text style={[
                    st.histHeroTrend,
                    { color: stats.recent_trend.improving ? colors.recoveryGreen : colors.error },
                  ]}>
                    {stats.recent_trend.improving ? '↗ +' : '↘ '}
                    {Math.abs(stats.recent_trend.delta).toFixed(1)}
                  </Text>
                )}
              </View>

              {/* Sparkline */}
              {series.length > 1 && (
                <Svg width="100%" height={sparkH} viewBox={`0 0 ${sparkW} ${sparkH}`} style={{ marginTop: 14 }}>
                  <Defs>
                    <SvgLG id="sparkFill" x1="0" y1="0" x2="0" y2="1">
                      <Stop offset="0" stopColor={colors.accent} stopOpacity="0.5" />
                      <Stop offset="1" stopColor={colors.accent} stopOpacity="0" />
                    </SvgLG>
                  </Defs>
                  {(() => {
                    const pts = series.map((v, i) => {
                      const x = (i / Math.max(1, series.length - 1)) * sparkW;
                      const y = sparkH - ((v - sparkMin + 5) / Math.max(1, sparkMax - sparkMin + 10)) * (sparkH - 10);
                      return [x, y] as [number, number];
                    });
                    const linePath = pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`).join(' ');
                    const areaPath = `${linePath} L ${sparkW} ${sparkH} L 0 ${sparkH} Z`;
                    return (
                      <>
                        <Path d={areaPath} fill="url(#sparkFill)" />
                        <Path d={linePath} fill="none" stroke={colors.accent} strokeWidth={2}
                          strokeLinecap="round" strokeLinejoin="round" />
                        {pts.map(([x, y], i) => (
                          <Circle
                            key={i}
                            cx={x}
                            cy={y}
                            r={i === pts.length - 1 ? 4 : 2}
                            fill={i === pts.length - 1 ? colors.accent : colors.bg}
                            stroke={colors.accent}
                            strokeWidth={1.5}
                          />
                        ))}
                      </>
                    );
                  })()}
                </Svg>
              )}
            </View>
          ) : null}

          {/* What's improving — dimension averages with thin bars */}
          {stats?.avg_scores && (
            <>
              <View style={st.histSection}>
                <Text style={st.histSectionTitle}>What's improving</Text>
                <Text style={st.histSectionMore}>30-DAY AVG</Text>
              </View>
              <View style={st.histDimCard}>
                {dims.map((d, i) => {
                  const v = Math.round(stats.avg_scores![d.key] ?? 0);
                  const c = scoreColor(v);
                  // Trend delta — derived from recent_trend if available
                  const delta = stats.recent_trend
                    ? Math.round(stats.recent_trend.delta * (d.key === 'confidence' ? 1.4 : d.key === 'clarity' ? 1.0 : 0.6))
                    : 0;
                  const up = delta >= 0;
                  return (
                    <View key={d.key} style={[
                      st.histDimRow,
                      i < dims.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.line },
                    ]}>
                      <Text style={st.histDimLabel}>{d.l}</Text>
                      <View style={st.histDimBarTrack}>
                        <View style={[st.histDimBarFill, { width: `${v}%`, backgroundColor: c }]} />
                      </View>
                      <Text style={[st.histDimVal, { color: c }]}>{v}</Text>
                      <Text style={[
                        st.histDimDelta,
                        { color: up ? colors.recoveryGreen : colors.error },
                      ]}>
                        {up ? '+' : ''}{delta}
                      </Text>
                    </View>
                  );
                })}
              </View>
            </>
          )}

          {/* Sessions list */}
          {sessionsForList.length > 0 && (
            <>
              <View style={st.histSection}>
                <Text style={st.histSectionTitle}>Sessions</Text>
                <Text style={st.histSectionMore}>{sessionsForList.length} RECENT</Text>
              </View>
              <View style={{ marginHorizontal: spacing.md }}>
                {sessionsForList.map((s, i) => {
                  const score = s.evaluation?.overall_score ?? 0;
                  const c = scoreColor(score);
                  const m = Math.floor(s.actual_seconds / 60);
                  const sec = s.actual_seconds % 60;
                  const dateStr = (() => {
                    const d = new Date(s.session_date);
                    const today = new Date();
                    const yday = new Date(today.getTime() - 86400000);
                    if (d.toDateString() === today.toDateString())
                      return `TODAY · ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
                    if (d.toDateString() === yday.toDateString())
                      return `YESTERDAY · ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
                    return `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase()} · ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
                  })();
                  // Delta — diff vs previous session
                  const prev = sessionsForList[i + 1];
                  const delta = prev?.evaluation?.overall_score != null
                    ? score - prev.evaluation.overall_score
                    : null;

                  return (
                    <TouchableOpacity
                      key={s.id}
                      activeOpacity={0.85}
                      onPress={() => {
                        haptic.light();
                        setResult(s);
                        setScreenState('results');
                      }}
                      style={st.histSessionCard}
                    >
                      <View style={[st.histScoreChip, { borderColor: c, backgroundColor: c + '14' }]}>
                        <Text style={[st.histScoreChipText, { color: c }]}>{score}</Text>
                      </View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text numberOfLines={1} style={st.histSessionTopic}>{s.topic}</Text>
                        <Text style={st.histSessionMeta}>
                          {dateStr} · {(s.audience || '').toUpperCase()} · {m}:{String(sec).padStart(2, '0')}
                        </Text>
                      </View>
                      <Text style={[
                        st.histSessionDelta,
                        delta == null ? { color: colors.textTertiary }
                          : delta > 0 ? { color: colors.recoveryGreen }
                          : delta < 0 ? { color: colors.error }
                          : { color: colors.textTertiary },
                      ]}>
                        {delta == null ? '·' : delta > 0 ? `+${delta}` : delta < 0 ? `${delta}` : '·'}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </>
          )}

          {pastSessions.length === 0 && (
            <View style={{ alignItems: 'center', paddingVertical: spacing.xxl }}>
              <Ionicons name="mic-off-outline" size={48} color={colors.textTertiary} />
              <Text style={{ fontFamily: fonts.regular, fontSize: 14, color: colors.textTertiary, marginTop: spacing.md }}>
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
  container: { paddingHorizontal: spacing.md, paddingBottom: 140 },
  centerScreen: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xxl },
  screenTitle: { ...typography.title1, color: colors.text },

  // Setup hero
  headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.md, paddingHorizontal: spacing.xs },
  screenTitleSerif: { fontFamily: fonts.serifItalic, fontSize: 32, color: colors.text, letterSpacing: -0.7 },
  eyebrow: { fontFamily: fonts.mono, fontSize: 10, color: colors.textTertiary, letterSpacing: 1.8, marginTop: 2 },
  topicHero: {
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.card,
    padding: 22,
    marginBottom: spacing.md,
    overflow: 'hidden',
  },
  topicPill: {
    alignSelf: 'flex-end',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: 'rgba(15,15,24,0.55)',
    marginBottom: spacing.sm,
  },
  topicPillText: { fontFamily: fonts.mono, fontSize: 10, color: colors.textSecondary, letterSpacing: 1.6 },
  heroEyebrow: { fontFamily: fonts.mono, fontSize: 10, color: colors.textTertiary, letterSpacing: 1.8 },
  topicInput: {
    marginTop: 12,
    minHeight: 64,
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: 'rgba(15,15,24,0.6)',
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    color: colors.text,
    fontFamily: fonts.serifItalic,
    fontSize: 19,
    lineHeight: 26,
    textAlignVertical: 'top',
  },
  recentChipsScroll: { marginTop: 10 },
  recentChipsRow: { gap: 6, paddingBottom: 4 },
  recentChip: {
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: 'transparent',
  },
  recentChipText: { fontFamily: fonts.mono, fontSize: 11, color: colors.textTertiary, letterSpacing: 0.4 },

  // Sections
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
  sectionTitleSerif: { fontFamily: fonts.serifItalic, fontSize: 22, color: colors.text, letterSpacing: -0.5 },
  sectionMore: { fontFamily: fonts.mono, fontSize: 10, color: colors.textTertiary, letterSpacing: 1.6 },

  // Audience grid
  audienceGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: spacing.md,
  },
  audienceCard: {
    flexBasis: '48%',
    flexGrow: 1,
    padding: 14,
    borderRadius: radius.lg,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
  },
  audienceCardActive: {
    backgroundColor: 'rgba(155,138,232,0.10)',
    borderColor: colors.accent,
  },
  audienceLabel: { fontFamily: fonts.serifItalic, fontSize: 18, color: colors.text, letterSpacing: -0.4 },
  audienceSub: { fontFamily: fonts.mono, fontSize: 9, color: colors.textTertiary, letterSpacing: 1.4, marginTop: 4 },

  // Record card
  recordCard: {
    padding: 18,
    borderRadius: radius.xl,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
  },
  recordCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 10,
  },
  recordCardValue: { fontFamily: fonts.mono, fontSize: 14, color: colors.accent, letterSpacing: 0.4 },
  durationRow: { flexDirection: 'row', gap: 6, marginBottom: 24 },
  durationChip: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: 'transparent',
    alignItems: 'center',
  },
  durationChipActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  durationChipText: { fontFamily: fonts.mono, fontSize: 11, color: colors.textSecondary, letterSpacing: 1 },
  durationChipTextActive: { color: colors.bg },
  orbWrap: { alignItems: 'center', marginBottom: 16 },
  recordOrb: {
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 1.5,
    borderColor: colors.accent,
    backgroundColor: 'rgba(155,138,232,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  recordOrbCenter: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.accent,
  },
  recordOrbHint: { fontFamily: fonts.mono, fontSize: 11, color: colors.textTertiary, letterSpacing: 1.8, marginTop: 12 },
  waveformRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    height: 28,
  },
  waveBar: { width: 3, borderRadius: 2, backgroundColor: colors.line },

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
  // ── History view (canvas SpeakHistory port) ──
  historyBackBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.line,
  },
  historyBackText: {
    fontFamily: fonts.mono,
    fontSize: 10,
    color: colors.textSecondary,
    letterSpacing: 1.4,
  },

  histHero: {
    paddingHorizontal: 22,
    paddingTop: 22,
    paddingBottom: 22,
    borderRadius: radius.xl,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    marginTop: spacing.md,
  },
  histHeroEyebrow: {
    fontFamily: fonts.mono,
    fontSize: 9,
    color: colors.textTertiary,
    letterSpacing: 2.2,
  },
  histHeroRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 14,
    marginTop: 10,
  },
  histHeroAvg: {
    fontFamily: fonts.serifItalic,
    fontSize: 56,
    color: colors.text,
    letterSpacing: -2,
    lineHeight: 56,
  },
  histHeroAvgLabel: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: colors.textTertiary,
    letterSpacing: 1.6,
  },
  histHeroTrend: {
    marginLeft: 'auto',
    fontFamily: fonts.mono,
    fontSize: 12,
    letterSpacing: 0.8,
  },

  histSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 22,
    marginBottom: 10,
  },
  histSectionTitle: {
    fontFamily: fonts.serifItalic,
    fontSize: 22,
    color: colors.text,
    letterSpacing: -0.5,
  },
  histSectionMore: {
    fontFamily: fonts.mono,
    fontSize: 10,
    color: colors.textTertiary,
    letterSpacing: 1.6,
  },

  histDimCard: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
  },
  histDimRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
  },
  histDimLabel: {
    fontFamily: fonts.serifItalic,
    fontSize: 14,
    color: colors.text,
    width: 110,
    letterSpacing: -0.1,
  },
  histDimBarTrack: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(15,15,24,0.6)',
    overflow: 'hidden',
  },
  histDimBarFill: {
    height: '100%',
    borderRadius: 2,
  },
  histDimVal: {
    fontFamily: fonts.mono,
    fontSize: 13,
    width: 28,
    textAlign: 'right',
    letterSpacing: -0.3,
  },
  histDimDelta: {
    fontFamily: fonts.mono,
    fontSize: 9,
    width: 30,
    textAlign: 'right',
    letterSpacing: 1.2,
  },

  histSessionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginBottom: 8,
    borderRadius: 14,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
  },
  histScoreChip: {
    width: 44,
    height: 44,
    borderRadius: 12,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  histScoreChipText: {
    fontFamily: fonts.mono,
    fontSize: 17,
    letterSpacing: -0.3,
  },
  histSessionTopic: {
    fontFamily: fonts.serifItalic,
    fontSize: 15,
    color: colors.text,
    letterSpacing: -0.1,
  },
  histSessionMeta: {
    fontFamily: fonts.mono,
    fontSize: 9,
    color: colors.textTertiary,
    letterSpacing: 1.4,
    marginTop: 3,
  },
  histSessionDelta: {
    fontFamily: fonts.mono,
    fontSize: 10,
    width: 32,
    textAlign: 'right',
    letterSpacing: 0.6,
  },

  historyBtn: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.xs,
    padding: spacing.sm, borderRadius: radius.md,
  },
  historyBtnText: { ...typography.caption, color: colors.accent, fontWeight: '600' },

  // Recording
  recPillRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 999, borderWidth: 1, borderColor: 'rgba(155,138,232,0.4)',
    backgroundColor: 'rgba(155,138,232,0.08)',
  },
  recDot: {
    width: 6, height: 6, borderRadius: 3, backgroundColor: colors.accent,
  },
  recPillText: {
    fontFamily: fonts.mono, fontSize: 10, color: colors.accent, letterSpacing: 1.8,
  },
  recordingTopicSerif: {
    fontFamily: fonts.serifItalic, fontSize: 22, color: colors.text,
    letterSpacing: -0.3, lineHeight: 28, textAlign: 'center', marginTop: 18,
  },
  recordRingWrap: {
    marginTop: 28, alignItems: 'center', justifyContent: 'center',
  },
  recordRing: {
    width: 220, height: 220, borderRadius: 110,
    borderWidth: 2.5, borderColor: colors.accent,
    alignItems: 'center', justifyContent: 'center',
  },
  recordEyebrow: {
    fontFamily: fonts.mono, fontSize: 10, color: colors.textTertiary, letterSpacing: 1.8,
  },
  recordTimer: {
    fontFamily: fonts.monoMedium, fontSize: 52, color: colors.text,
    letterSpacing: -0.5, lineHeight: 56, marginTop: 6,
  },
  recordTarget: {
    fontFamily: fonts.mono, fontSize: 10, color: colors.textTertiary,
    letterSpacing: 1.8, marginTop: 8,
  },
  liveWaveform: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 3, marginTop: 22, height: 56,
  },
  liveWaveBar: {
    width: 3, backgroundColor: colors.accent, borderRadius: 2,
  },
  recordHint: {
    fontFamily: fonts.mono, fontSize: 11, color: colors.textTertiary,
    letterSpacing: 1.6, marginTop: 18, textAlign: 'center',
  },
  recordStopBtn: {
    width: 84, height: 84, borderRadius: 42,
    backgroundColor: colors.accent,
    alignItems: 'center', justifyContent: 'center',
    marginTop: 32,
  },
  recordStopInner: {
    width: 26, height: 26, borderRadius: 4, backgroundColor: colors.bg,
  },
  recordingTopic: {
    fontFamily: fonts.serifItalic,
    fontSize: 22,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.xl,
    letterSpacing: -0.4,
  },
  micRing: {
    width: 140, height: 140, borderRadius: 70,
    backgroundColor: 'rgba(155,138,232,0.12)', borderWidth: 2, borderColor: 'rgba(155,138,232,0.38)',
    alignItems: 'center', justifyContent: 'center',
  },
  micInner: {
    width: 100, height: 100, borderRadius: 50,
    backgroundColor: 'rgba(155,138,232,0.20)', alignItems: 'center', justifyContent: 'center',
  },
  timerText: { ...typography.title1, color: colors.text, fontSize: 48, marginTop: spacing.xl, fontVariant: ['tabular-nums'] as any },
  timerTarget: { ...typography.caption, color: colors.textTertiary, marginTop: spacing.xs },
  stopBtn: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.accent, borderRadius: radius.lg,
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
  overallScore: { fontFamily: fonts.serifItalic, fontSize: 56, letterSpacing: -1.5, lineHeight: 56 },
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
