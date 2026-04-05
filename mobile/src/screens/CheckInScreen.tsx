import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, ScrollView, TouchableOpacity, StyleSheet,
  Alert, Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { createEntry, API_URL, apiHeaders } from '../api/client';
import { colors, spacing, typography, radius } from '../theme';
import { haptic } from '../utils/haptics';
import ScreenBackground from '../components/ScreenBackground';
import { Skeleton } from '../components/Skeleton';

interface TodoSummary {
  completed: number;
  total: number;
  totalMinutes: number;
}

interface EvalResult {
  pillar_id: number;
  pillar_name: string;
  depth_score: number;
  relevance_score: number;
  one_percent_better: boolean;
  verdict_explanation: string;
  commentary: string;
  time_invested_minutes: number;
}

interface EndOfDayResponse {
  evaluated: number;
  results: EvalResult[];
  reflection_applied: boolean;
}

type ScreenState = 'form' | 'evaluating' | 'results';

export default function CheckInScreen() {
  const [focus, setFocus] = useState(5);
  const [energy, setEnergy] = useState(5);
  const [takeaway, setTakeaway] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [screenState, setScreenState] = useState<ScreenState>('form');
  const [evalResponse, setEvalResponse] = useState<EndOfDayResponse | null>(null);
  const [expandedPillar, setExpandedPillar] = useState<number | null>(null);
  const [todoSummary, setTodoSummary] = useState<TodoSummary>({ completed: 0, total: 0, totalMinutes: 0 });
  const [pulseAnim] = useState(new Animated.Value(0.3));
  const slideAnim = useRef(new Animated.Value(0)).current;
  const resultsAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    (async () => {
      try {
        const resp = await fetch(`${API_URL}/api/v1/daily/todos`, { headers: apiHeaders() });
        if (resp.ok) {
          const todos = await resp.json();
          const completed = todos.filter((t: any) => t.completed);
          setTodoSummary({
            completed: completed.length,
            total: todos.length,
            totalMinutes: completed.reduce((sum: number, t: any) => sum + (t.estimated_minutes || 0), 0),
          });
        }
      } catch (err) {
        console.warn('Failed to fetch todos:', err);
      }
    })();
  }, []);

  // Slide-out animation when form submits
  useEffect(() => {
    if (screenState === 'evaluating') {
      slideAnim.setValue(0);
      Animated.spring(slideAnim, {
        toValue: 1,
        damping: 20,
        stiffness: 100,
        useNativeDriver: true,
      }).start();
    }
  }, [screenState === 'evaluating']);

  // Fade-in animation when results arrive
  useEffect(() => {
    if (screenState === 'results') {
      resultsAnim.setValue(0);
      Animated.spring(resultsAnim, {
        toValue: 1,
        damping: 20,
        stiffness: 100,
        useNativeDriver: true,
      }).start();
      haptic.success();
    }
  }, [screenState === 'results']);

  // Pulse animation for evaluating state
  useEffect(() => {
    if (screenState === 'evaluating') {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 0.3, duration: 800, useNativeDriver: true }),
        ])
      );
      loop.start();
      return () => loop.stop();
    }
  }, [screenState]);

  const formatTime = (mins: number) => {
    if (mins === 0) return '0m';
    if (mins < 60) return `${mins}m`;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  };

  const handleSubmit = async () => {
    if (!takeaway.trim()) return Alert.alert('Required', 'Add a key takeaway from today.');
    haptic.medium();
    setSubmitting(true);
    try {
      // Save the reflection entry
      await createEntry({
        description: `Daily reflection — ${todoSummary.completed}/${todoSummary.total} todos completed`,
        time_invested_minutes: todoSummary.totalMinutes || 30,
        pillar_tags: [],
        difficulty_rating: focus,
        energy_level: energy,
        key_takeaway: takeaway.trim(),
      });

      // Check if there are pillar-linked completed todos to evaluate
      if (todoSummary.completed > 0) {
        setScreenState('evaluating');
        try {
          const resp = await fetch(`${API_URL}/api/v1/daily/end-of-day`, {
            method: 'POST',
            headers: apiHeaders(),
          });
          if (resp.ok) {
            const data: EndOfDayResponse = await resp.json();
            setEvalResponse(data);
            setScreenState('results');
          } else {
            // Eval failed but reflection was saved
            setScreenState('results');
            setEvalResponse({ evaluated: 0, results: [], reflection_applied: true });
          }
        } catch (err) {
          console.warn('End-of-day eval failed:', err);
          setScreenState('results');
          setEvalResponse({ evaluated: 0, results: [], reflection_applied: true });
        }
      } else {
        // No pillar todos — just show simple success
        setScreenState('results');
        setEvalResponse({ evaluated: 0, results: [], reflection_applied: true });
      }
    } catch (err: unknown) {
      console.warn('CheckIn submit error:', err);
      Alert.alert('Failed', err instanceof Error ? err.message : 'Unknown error');
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setFocus(5); setEnergy(5); setTakeaway('');
    setScreenState('form'); setEvalResponse(null);
    setExpandedPillar(null); setSubmitting(false);
    slideAnim.setValue(0);
    resultsAnim.setValue(0);
  };

  const onePercentCount = evalResponse?.results.filter(r => r.one_percent_better).length ?? 0;
  const totalEvaluated = evalResponse?.results.length ?? 0;

  // ===== EVALUATING STATE =====
  if (screenState === 'evaluating') {
    return (
      <View style={s.centerContainer}>
        <Animated.View style={[s.evalRing, { opacity: pulseAnim }]}>
          <Ionicons name="analytics-outline" size={40} color={colors.accent} />
        </Animated.View>
        <Text style={s.evalTitle}>Evaluating your day...</Text>
        <Text style={s.evalSub}>The Honest Mirror is reviewing your work</Text>
      </View>
    );
  }

  // ===== RESULTS STATE =====
  if (screenState === 'results') {
    const resultsTranslateY = resultsAnim.interpolate({ inputRange: [0, 1], outputRange: [30, 0] });
    const resultsOpacity = resultsAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });

    return (
      <ScrollView style={s.scroll} contentContainerStyle={s.resultsContainer}>
        <Animated.View style={{ opacity: resultsOpacity, transform: [{ translateY: resultsTranslateY }] }}>
        {totalEvaluated > 0 ? (
          <>
            {/* Summary header */}
            <View style={s.resultsSummary}>
              <Text style={s.resultsEmoji}>
                {onePercentCount === totalEvaluated ? '🔥' : onePercentCount > 0 ? '📈' : '😤'}
              </Text>
              <Text style={s.resultsTitle}>
                {onePercentCount === totalEvaluated
                  ? '1% better across the board'
                  : onePercentCount > 0
                    ? `1% better in ${onePercentCount}/${totalEvaluated} pillars`
                    : 'No growth today — dig deeper tomorrow'}
              </Text>
            </View>

            {/* Per-pillar eval cards */}
            {evalResponse!.results.map(result => {
              const isExpanded = expandedPillar === result.pillar_id;
              const scoreColor = result.depth_score >= 60 ? colors.success
                : result.depth_score >= 40 ? colors.warning : colors.error;

              return (
                <TouchableOpacity
                  key={result.pillar_id}
                  style={s.evalCard}
                  onPress={() => {
                    haptic.light();
                    setExpandedPillar(isExpanded ? null : result.pillar_id);
                  }}
                  activeOpacity={0.7}
                >
                  {/* Card header */}
                  <View style={s.evalCardHeader}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.evalPillarName}>{result.pillar_name}</Text>
                      <Text style={s.evalTime}>{formatTime(result.time_invested_minutes)}</Text>
                    </View>
                    <View style={s.evalScoreCol}>
                      <View style={[s.depthRing, { borderColor: scoreColor }]}>
                        <Text style={[s.depthScore, { color: scoreColor }]}>{result.depth_score}</Text>
                      </View>
                      {result.one_percent_better ? (
                        <View style={s.verdictBadgeYes}>
                          <Ionicons name="arrow-up" size={10} color={colors.success} />
                          <Text style={s.verdictTextYes}>1%</Text>
                        </View>
                      ) : (
                        <View style={s.verdictBadgeNo}>
                          <Text style={s.verdictTextNo}>flat</Text>
                        </View>
                      )}
                    </View>
                  </View>

                  {/* Verdict explanation (always visible) */}
                  <Text style={s.verdictExplanation}>{result.verdict_explanation}</Text>

                  {/* Expanded commentary */}
                  {isExpanded && (
                    <View style={s.commentaryBox}>
                      <Text style={s.commentaryLabel}>HONEST MIRROR</Text>
                      <Text style={s.commentaryText}>{result.commentary}</Text>
                    </View>
                  )}

                  {/* Expand hint */}
                  <View style={s.expandHint}>
                    <Ionicons
                      name={isExpanded ? 'chevron-up' : 'chevron-down'}
                      size={14}
                      color={colors.textTertiary}
                    />
                  </View>
                </TouchableOpacity>
              );
            })}
          </>
        ) : (
          /* No evals — simple reflection saved */
          <View style={s.simpleSuccess}>
            <View style={s.successRing}>
              <Ionicons name="checkmark" size={40} color={colors.success} />
            </View>
            <Text style={s.successTitle}>Reflection Saved</Text>
            <Text style={s.successSub}>
              {todoSummary.completed === 0
                ? 'No pillar-linked todos completed today'
                : 'Your reflection has been logged'}
            </Text>
          </View>
        )}

        <TouchableOpacity style={s.doneBtn} onPress={() => { haptic.light(); resetForm(); }}>
          <Text style={s.doneBtnText}>Done</Text>
        </TouchableOpacity>
        </Animated.View>
      </ScrollView>
    );
  }

  // ===== FORM STATE =====
  const formTranslateY = slideAnim.interpolate({ inputRange: [0, 1], outputRange: [0, -50] });
  const formOpacity = slideAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });

  return (
    <ScreenBackground>
    <ScrollView style={s.scroll} contentContainerStyle={s.container} keyboardShouldPersistTaps="handled">
      <Animated.View style={{ opacity: formOpacity, transform: [{ translateY: formTranslateY }] }}>
      {/* Today's Progress Summary */}
      <View style={s.summaryCard}>
        <View style={s.summaryRow}>
          <View style={s.summaryItem}>
            <Text style={s.summaryValue}>{todoSummary.completed}/{todoSummary.total}</Text>
            <Text style={s.summaryLabel}>Todos Done</Text>
          </View>
          <View style={s.summaryDivider} />
          <View style={s.summaryItem}>
            <Text style={s.summaryValue}>{formatTime(todoSummary.totalMinutes)}</Text>
            <Text style={s.summaryLabel}>Time Logged</Text>
          </View>
        </View>
      </View>

      {/* Focus */}
      <Text style={s.label}>FOCUS  <Text style={{ color: colors.accent }}>{focus}</Text>/10</Text>
      <View style={s.sliderTrack}>
        {[1,2,3,4,5,6,7,8,9,10].map(n => (
          <TouchableOpacity key={n} style={[s.sliderSegment,
            focus >= n && { backgroundColor: colors.accent },
            n === 1 && { borderTopLeftRadius: 6, borderBottomLeftRadius: 6 },
            n === 10 && { borderTopRightRadius: 6, borderBottomRightRadius: 6 },
          ]} onPress={() => { haptic.light(); setFocus(n); }} testID={`focus-${n}`} />
        ))}
      </View>

      {/* Energy */}
      <Text style={s.label}>ENERGY  <Text style={{ color: colors.success }}>{energy}</Text>/10</Text>
      <View style={s.sliderTrack}>
        {[1,2,3,4,5,6,7,8,9,10].map(n => (
          <TouchableOpacity key={n} style={[s.sliderSegment,
            energy >= n && { backgroundColor: colors.success },
            n === 1 && { borderTopLeftRadius: 6, borderBottomLeftRadius: 6 },
            n === 10 && { borderTopRightRadius: 6, borderBottomRightRadius: 6 },
          ]} onPress={() => { haptic.light(); setEnergy(n); }} testID={`energy-${n}`} />
        ))}
      </View>

      {/* Key Takeaway */}
      <Text style={s.label}>KEY TAKEAWAY</Text>
      <TextInput style={s.input}
        placeholder="Most important thing from today"
        placeholderTextColor={colors.textTertiary}
        value={takeaway} onChangeText={setTakeaway} testID="takeaway-input" />

      {/* Submit */}
      <TouchableOpacity style={[s.primaryBtn, submitting && { opacity: 0.5 }]}
        onPress={handleSubmit} disabled={submitting} testID="submit-btn">
        {submitting ? <Skeleton width={120} height={18} /> : <Text style={s.primaryBtnText}>Save Reflection</Text>}
      </TouchableOpacity>

      <View style={{ height: 24 }} />
      </Animated.View>
    </ScrollView>
    </ScreenBackground>
  );
}

const s = StyleSheet.create({
  scroll: { flex: 1 },
  container: { padding: spacing.lg, paddingTop: spacing.md },

  // === Summary card ===
  summaryCard: {
    backgroundColor: colors.input, borderRadius: radius.lg,
    padding: spacing.lg, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.md,
  },
  summaryRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  summaryItem: { flex: 1, alignItems: 'center' },
  summaryValue: { ...typography.title1, color: colors.text, fontSize: 28 },
  summaryLabel: { ...typography.caption, color: colors.textTertiary, marginTop: 2 },
  summaryDivider: { width: 1, height: 36, backgroundColor: colors.border, marginHorizontal: spacing.md },

  // === Form ===
  label: {
    ...typography.micro, color: colors.textTertiary, textTransform: 'uppercase',
    marginBottom: spacing.sm, marginTop: spacing.md,
  },
  input: {
    backgroundColor: colors.input, color: colors.text, borderRadius: radius.md,
    padding: spacing.md, fontSize: 15, borderWidth: 1, borderColor: colors.border,
  },
  sliderTrack: { flexDirection: 'row', gap: 3, marginBottom: spacing.xs },
  sliderSegment: { flex: 1, height: 28, backgroundColor: colors.input },
  primaryBtn: {
    backgroundColor: colors.accent, borderRadius: radius.lg,
    paddingVertical: 18, alignItems: 'center', marginTop: spacing.lg,
  },
  primaryBtnText: { ...typography.bodyBold, color: colors.text },

  // === Evaluating state ===
  centerContainer: {
    flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', padding: spacing.xxl,
  },
  evalRing: {
    width: 88, height: 88, borderRadius: 44, backgroundColor: colors.accent + '15',
    borderWidth: 2, borderColor: colors.accent + '40',
    alignItems: 'center', justifyContent: 'center', marginBottom: spacing.lg,
  },
  evalTitle: { ...typography.title1, color: colors.text, marginBottom: spacing.sm, textAlign: 'center' },
  evalSub: { ...typography.body, color: colors.textSecondary, textAlign: 'center' },

  // === Results state ===
  resultsContainer: { padding: spacing.lg, paddingTop: spacing.md },
  resultsSummary: { alignItems: 'center', marginBottom: spacing.lg },
  resultsEmoji: { fontSize: 48, marginBottom: spacing.sm },
  resultsTitle: { ...typography.title2 || typography.bodyBold, color: colors.text, textAlign: 'center', fontSize: 18 },

  // === Eval card ===
  evalCard: {
    backgroundColor: colors.input, borderRadius: radius.lg,
    padding: spacing.lg, borderWidth: 1, borderColor: colors.border,
    marginBottom: spacing.md,
  },
  evalCardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm },
  evalPillarName: { ...typography.bodyBold, color: colors.text, fontSize: 16 },
  evalTime: { ...typography.caption, color: colors.textTertiary, marginTop: 2 },
  evalScoreCol: { alignItems: 'center', gap: 4 },
  depthRing: {
    width: 48, height: 48, borderRadius: 24, borderWidth: 3,
    alignItems: 'center', justifyContent: 'center', backgroundColor: 'transparent',
  },
  depthScore: { fontSize: 16, fontWeight: '700', fontVariant: ['tabular-nums'] as any },
  verdictBadgeYes: {
    flexDirection: 'row', alignItems: 'center', gap: 2,
    backgroundColor: colors.success + '18', borderRadius: radius.pill,
    paddingHorizontal: 8, paddingVertical: 2,
  },
  verdictTextYes: { fontSize: 11, fontWeight: '700', color: colors.success },
  verdictBadgeNo: {
    backgroundColor: colors.textTertiary + '18', borderRadius: radius.pill,
    paddingHorizontal: 8, paddingVertical: 2,
  },
  verdictTextNo: { fontSize: 11, fontWeight: '600', color: colors.textTertiary },
  verdictExplanation: { ...typography.body, color: colors.textSecondary, fontSize: 13, lineHeight: 18 },

  // === Expanded commentary ===
  commentaryBox: {
    marginTop: spacing.md, paddingTop: spacing.md,
    borderTopWidth: 1, borderTopColor: colors.border,
  },
  commentaryLabel: {
    ...typography.micro, color: colors.accent, textTransform: 'uppercase',
    marginBottom: spacing.xs, letterSpacing: 1,
  },
  commentaryText: { ...typography.body, color: colors.text, fontSize: 13, lineHeight: 20 },
  expandHint: { alignItems: 'center', marginTop: spacing.sm },

  // === Simple success ===
  simpleSuccess: { alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.xxl },
  successRing: {
    width: 88, height: 88, borderRadius: 44, backgroundColor: colors.success + '15',
    borderWidth: 2, borderColor: colors.success + '40',
    alignItems: 'center', justifyContent: 'center', marginBottom: spacing.lg,
  },
  successTitle: { ...typography.title1, color: colors.text, marginBottom: spacing.sm },
  successSub: { ...typography.body, color: colors.textSecondary, textAlign: 'center' },

  // === Done button ===
  doneBtn: {
    backgroundColor: colors.accent, borderRadius: radius.lg,
    paddingVertical: 18, alignItems: 'center', marginTop: spacing.lg,
  },
  doneBtnText: { ...typography.bodyBold, color: colors.text },
});
