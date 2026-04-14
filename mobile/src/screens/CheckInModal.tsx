import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, ScrollView, TouchableOpacity, StyleSheet,
  Modal, Animated, Dimensions, Platform, KeyboardAvoidingView, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { createEntry, API_URL, apiHeaders } from '../api/client';
import { colors, spacing, typography, radius } from '../theme';
import { haptic } from '../utils/haptics';
import { Skeleton } from '../components/Skeleton';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const SHEET_HEIGHT = SCREEN_HEIGHT * 0.92;

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

type SheetState = 'form' | 'evaluating' | 'results';

interface Props {
  visible: boolean;
  onClose: () => void;
}

export default function CheckInModal({ visible, onClose }: Props) {
  const [focus, setFocus] = useState(5);
  const [energy, setEnergy] = useState(5);
  const [takeaway, setTakeaway] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sheetState, setSheetState] = useState<SheetState>('form');
  const [evalResponse, setEvalResponse] = useState<EndOfDayResponse | null>(null);
  const [expandedPillar, setExpandedPillar] = useState<number | null>(null);
  const [todoSummary, setTodoSummary] = useState<TodoSummary>({ completed: 0, total: 0, totalMinutes: 0 });

  const slideAnim = useRef(new Animated.Value(SHEET_HEIGHT)).current;
  const backdropAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(0.3)).current;
  const resultsAnim = useRef(new Animated.Value(0)).current;

  // Fetch todo summary when modal opens
  useEffect(() => {
    if (!visible) return;
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
        console.warn('Failed to fetch todos for check-in:', err);
      }
    })();
  }, [visible]);

  // Sheet open/close animation
  useEffect(() => {
    if (visible) {
      slideAnim.setValue(SHEET_HEIGHT);
      backdropAnim.setValue(0);
      Animated.parallel([
        Animated.spring(slideAnim, {
          toValue: 0,
          damping: 28,
          stiffness: 220,
          useNativeDriver: true,
        }),
        Animated.timing(backdropAnim, {
          toValue: 1,
          duration: 280,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible]);

  // Pulse animation while evaluating
  useEffect(() => {
    if (sheetState === 'evaluating') {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 0.3, duration: 800, useNativeDriver: true }),
        ])
      );
      loop.start();
      return () => loop.stop();
    }
  }, [sheetState]);

  // Fade-in animation when results arrive
  useEffect(() => {
    if (sheetState === 'results') {
      resultsAnim.setValue(0);
      Animated.spring(resultsAnim, {
        toValue: 1,
        damping: 20,
        stiffness: 100,
        useNativeDriver: true,
      }).start();
      haptic.success();
    }
  }, [sheetState]);

  const resetState = () => {
    setFocus(5);
    setEnergy(5);
    setTakeaway('');
    setSheetState('form');
    setEvalResponse(null);
    setExpandedPillar(null);
    setSubmitting(false);
  };

  const handleClose = () => {
    Animated.parallel([
      Animated.spring(slideAnim, {
        toValue: SHEET_HEIGHT,
        damping: 28,
        stiffness: 220,
        useNativeDriver: true,
      }),
      Animated.timing(backdropAnim, {
        toValue: 0,
        duration: 220,
        useNativeDriver: true,
      }),
    ]).start(() => {
      onClose();
      setTimeout(resetState, 50);
    });
  };

  const handleSubmit = async () => {
    if (!takeaway.trim()) {
      return Alert.alert('Required', 'Add a key takeaway from today.');
    }
    haptic.medium();
    setSubmitting(true);
    try {
      await createEntry({
        description: `Daily reflection — ${todoSummary.completed}/${todoSummary.total} todos completed`,
        time_invested_minutes: todoSummary.totalMinutes || 30,
        pillar_tags: [],
        difficulty_rating: focus,
        energy_level: energy,
        key_takeaway: takeaway.trim(),
      });

      if (todoSummary.completed > 0) {
        setSheetState('evaluating');
        try {
          const resp = await fetch(`${API_URL}/api/v1/daily/end-of-day`, {
            method: 'POST',
            headers: apiHeaders(),
          });
          if (resp.ok) {
            const data: EndOfDayResponse = await resp.json();
            setEvalResponse(data);
            setSheetState('results');
          } else {
            setSheetState('results');
            setEvalResponse({ evaluated: 0, results: [], reflection_applied: true });
          }
        } catch (err) {
          console.warn('End-of-day eval failed:', err);
          setSheetState('results');
          setEvalResponse({ evaluated: 0, results: [], reflection_applied: true });
        }
      } else {
        setSheetState('results');
        setEvalResponse({ evaluated: 0, results: [], reflection_applied: true });
      }
    } catch (err: unknown) {
      console.warn('CheckIn submit error:', err);
      Alert.alert('Failed', err instanceof Error ? err.message : 'Unknown error');
      setSubmitting(false);
    }
  };

  const formatTime = (mins: number) => {
    if (mins === 0) return '0m';
    if (mins < 60) return `${mins}m`;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  };

  const onePercentCount = evalResponse?.results.filter(r => r.one_percent_better).length ?? 0;
  const totalEvaluated = evalResponse?.results.length ?? 0;

  // ===== EVALUATING STATE =====
  const renderEvaluating = () => (
    <View style={m.evalCenter}>
      <Animated.Text style={[m.evalEmoji, { opacity: pulseAnim }]}>🔍</Animated.Text>
      <Text style={m.evalTitle}>Evaluating your day...</Text>
      <Text style={m.evalSub}>The Honest Mirror is reviewing your work</Text>
    </View>
  );

  // ===== RESULTS STATE =====
  const renderResults = () => {
    const translateY = resultsAnim.interpolate({ inputRange: [0, 1], outputRange: [30, 0] });
    const opacity = resultsAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });

    return (
      <Animated.View style={{ flex: 1, opacity, transform: [{ translateY }] }}>
        <ScrollView
          contentContainerStyle={m.resultsContent}
          showsVerticalScrollIndicator={false}
        >
          {totalEvaluated > 0 ? (
            <>
              <View style={m.resultsSummary}>
                <Text style={m.resultsEmoji}>
                  {onePercentCount === totalEvaluated ? '🔥' : onePercentCount > 0 ? '📈' : '😤'}
                </Text>
                <Text style={m.resultsTitle}>
                  {onePercentCount === totalEvaluated
                    ? '1% better across the board'
                    : onePercentCount > 0
                      ? `1% better in ${onePercentCount}/${totalEvaluated} pillars`
                      : 'No growth today — dig deeper tomorrow'}
                </Text>
              </View>

              {evalResponse!.results.map(result => {
                const isExpanded = expandedPillar === result.pillar_id;
                const scoreColor = result.depth_score >= 60 ? colors.success
                  : result.depth_score >= 40 ? colors.warning : colors.error;

                return (
                  <TouchableOpacity
                    key={result.pillar_id}
                    style={m.evalCard}
                    onPress={() => { haptic.light(); setExpandedPillar(isExpanded ? null : result.pillar_id); }}
                    activeOpacity={0.7}
                  >
                    <View style={m.evalCardHeader}>
                      <View style={{ flex: 1 }}>
                        <Text style={m.evalPillarName}>{result.pillar_name}</Text>
                        <Text style={m.evalTime}>{formatTime(result.time_invested_minutes)}</Text>
                      </View>
                      <View style={m.evalScoreCol}>
                        <View style={[m.depthRing, { borderColor: scoreColor }]}>
                          <Text style={[m.depthScore, { color: scoreColor }]}>{result.depth_score}</Text>
                        </View>
                        {result.one_percent_better ? (
                          <View style={m.verdictBadgeYes}>
                            <Ionicons name="arrow-up" size={10} color={colors.success} />
                            <Text style={m.verdictTextYes}>1%</Text>
                          </View>
                        ) : (
                          <View style={m.verdictBadgeNo}>
                            <Text style={m.verdictTextNo}>flat</Text>
                          </View>
                        )}
                      </View>
                    </View>

                    <Text style={m.verdictExplanation}>{result.verdict_explanation}</Text>

                    {isExpanded && (
                      <View style={m.commentaryBox}>
                        <Text style={m.commentaryLabel}>HONEST MIRROR</Text>
                        <Text style={m.commentaryText}>{result.commentary}</Text>
                      </View>
                    )}

                    <View style={m.expandHint}>
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
            <View style={m.simpleSuccess}>
              <View style={m.successRing}>
                <Ionicons name="checkmark" size={40} color={colors.success} />
              </View>
              <Text style={m.successTitle}>Reflection Saved</Text>
              <Text style={m.successSub}>
                {todoSummary.completed === 0
                  ? 'No pillar-linked todos completed today'
                  : 'Your reflection has been logged'}
              </Text>
            </View>
          )}

          <TouchableOpacity style={m.doneBtn} onPress={handleClose}>
            <Text style={m.doneBtnText}>Done</Text>
          </TouchableOpacity>

          <View style={{ height: 32 }} />
        </ScrollView>
      </Animated.View>
    );
  };

  // ===== FORM STATE =====
  const renderForm = () => (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={m.formContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Summary strip */}
        <View style={m.summaryStrip}>
          <View style={m.summaryCard}>
            <Text style={m.summaryValue}>{todoSummary.completed}/{todoSummary.total}</Text>
            <Text style={m.summaryLabel}>Items Done</Text>
          </View>
          <View style={m.summaryCard}>
            <Text style={m.summaryValue}>{formatTime(todoSummary.totalMinutes)}</Text>
            <Text style={m.summaryLabel}>Time Logged</Text>
          </View>
        </View>

        {/* Key Takeaway — first */}
        <Text style={m.label}>KEY TAKEAWAY</Text>
        <TextInput
          style={m.takeawayInput}
          placeholder="What's the one thing worth remembering?"
          placeholderTextColor={colors.textTertiary}
          value={takeaway}
          onChangeText={setTakeaway}
          multiline
          numberOfLines={4}
          textAlignVertical="top"
          testID="takeaway-input"
        />

        {/* Focus slider */}
        <Text style={m.label}>
          FOCUS{'  '}<Text style={{ color: colors.accent }}>{focus}</Text>/10
        </Text>
        <View style={m.sliderTrack}>
          {[1,2,3,4,5,6,7,8,9,10].map(n => (
            <TouchableOpacity
              key={n}
              style={[
                m.sliderSegment,
                focus >= n && { backgroundColor: colors.accent },
                n === 1 && { borderTopLeftRadius: 6, borderBottomLeftRadius: 6 },
                n === 10 && { borderTopRightRadius: 6, borderBottomRightRadius: 6 },
              ]}
              onPress={() => { haptic.light(); setFocus(n); }}
              testID={`focus-${n}`}
            />
          ))}
        </View>

        {/* Energy slider */}
        <Text style={m.label}>
          ENERGY{'  '}<Text style={{ color: colors.success }}>{energy}</Text>/10
        </Text>
        <View style={m.sliderTrack}>
          {[1,2,3,4,5,6,7,8,9,10].map(n => (
            <TouchableOpacity
              key={n}
              style={[
                m.sliderSegment,
                energy >= n && { backgroundColor: colors.success },
                n === 1 && { borderTopLeftRadius: 6, borderBottomLeftRadius: 6 },
                n === 10 && { borderTopRightRadius: 6, borderBottomRightRadius: 6 },
              ]}
              onPress={() => { haptic.light(); setEnergy(n); }}
              testID={`energy-${n}`}
            />
          ))}
        </View>

        {/* Save button */}
        <TouchableOpacity
          style={[m.saveBtn, submitting && { opacity: 0.5 }]}
          onPress={handleSubmit}
          disabled={submitting}
          testID="submit-btn"
        >
          {submitting
            ? <Skeleton width={120} height={18} />
            : <Text style={m.saveBtnText}>Save Reflection</Text>
          }
        </TouchableOpacity>

        <View style={{ height: 32 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={handleClose}
      statusBarTranslucent
    >
      {/* Dim backdrop */}
      <Animated.View
        style={[StyleSheet.absoluteFillObject, m.backdrop, { opacity: backdropAnim }]}
        pointerEvents="none"
      />

      {/* Tap area above sheet to dismiss */}
      <TouchableOpacity
        style={m.dismissArea}
        activeOpacity={1}
        onPress={handleClose}
      />

      {/* Bottom sheet */}
      <Animated.View style={[m.sheet, { transform: [{ translateY: slideAnim }] }]}>
        {/* Drag handle */}
        <View style={m.dragHandleRow}>
          <View style={m.dragHandle} />
        </View>

        {sheetState === 'evaluating' && renderEvaluating()}
        {sheetState === 'results' && renderResults()}
        {sheetState === 'form' && renderForm()}
      </Animated.View>
    </Modal>
  );
}

const m = StyleSheet.create({
  backdrop: {
    backgroundColor: 'rgba(0,0,0,0.65)',
  },
  dismissArea: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: SHEET_HEIGHT,
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: SHEET_HEIGHT,
    backgroundColor: colors.card,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: 'hidden',
  },
  dragHandleRow: {
    alignItems: 'center',
    paddingTop: 12,
    paddingBottom: 4,
  },
  dragHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.textTertiary + '50',
  },

  // ===== Form =====
  formContent: { padding: spacing.lg, paddingTop: spacing.sm },
  label: {
    ...typography.micro,
    color: colors.textTertiary,
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
    marginTop: spacing.md,
  },
  takeawayInput: {
    backgroundColor: colors.input,
    color: colors.text,
    borderRadius: radius.md,
    padding: spacing.md,
    fontSize: 15,
    borderWidth: 1,
    borderColor: colors.border,
    minHeight: 100,
    textAlignVertical: 'top',
    lineHeight: 22,
  },
  sliderTrack: { flexDirection: 'row', gap: 3, marginBottom: spacing.xs },
  sliderSegment: { flex: 1, height: 36, backgroundColor: colors.input },
  saveBtn: {
    backgroundColor: colors.accent,
    borderRadius: radius.lg,
    paddingVertical: 18,
    alignItems: 'center',
    marginTop: spacing.lg,
  },
  saveBtnText: { ...typography.bodyBold, color: colors.text },

  // ===== Summary strip =====
  summaryStrip: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.sm },
  summaryCard: {
    flex: 1,
    backgroundColor: colors.input,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    alignItems: 'center',
  },
  summaryValue: { ...typography.title2, color: colors.text, fontSize: 26 },
  summaryLabel: { ...typography.caption, color: colors.textTertiary, marginTop: 2 },

  // ===== Evaluating =====
  evalCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xxl,
  },
  evalEmoji: { fontSize: 60, marginBottom: spacing.lg },
  evalTitle: { ...typography.title2, color: colors.text, marginBottom: spacing.sm, textAlign: 'center' },
  evalSub: { ...typography.body, color: colors.textSecondary, textAlign: 'center' },

  // ===== Results =====
  resultsContent: { padding: spacing.lg, paddingTop: spacing.sm },
  resultsSummary: { alignItems: 'center', marginBottom: spacing.lg },
  resultsEmoji: { fontSize: 48, marginBottom: spacing.sm },
  resultsTitle: { ...typography.bodyBold, color: colors.text, textAlign: 'center', fontSize: 18 },

  evalCard: {
    backgroundColor: colors.input,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
  },
  evalCardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm },
  evalPillarName: { ...typography.bodyBold, color: colors.text, fontSize: 16 },
  evalTime: { ...typography.caption, color: colors.textTertiary, marginTop: 2 },
  evalScoreCol: { alignItems: 'center', gap: 4 },
  depthRing: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  depthScore: { fontSize: 16, fontWeight: '700', fontVariant: ['tabular-nums'] as any },
  verdictBadgeYes: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: colors.success + '18',
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  verdictTextYes: { fontSize: 11, fontWeight: '700', color: colors.success },
  verdictBadgeNo: {
    backgroundColor: colors.textTertiary + '18',
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  verdictTextNo: { fontSize: 11, fontWeight: '600', color: colors.textTertiary },
  verdictExplanation: { ...typography.body, color: colors.textSecondary, fontSize: 13, lineHeight: 18 },
  commentaryBox: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  commentaryLabel: {
    ...typography.micro,
    color: colors.accent,
    textTransform: 'uppercase',
    marginBottom: spacing.xs,
    letterSpacing: 1,
  },
  commentaryText: { ...typography.body, color: colors.text, fontSize: 13, lineHeight: 20 },
  expandHint: { alignItems: 'center', marginTop: spacing.sm },

  simpleSuccess: { alignItems: 'center', paddingVertical: spacing.xxl },
  successRing: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: colors.success + '15',
    borderWidth: 2,
    borderColor: colors.success + '40',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  successTitle: { ...typography.title1, color: colors.text, marginBottom: spacing.sm },
  successSub: { ...typography.body, color: colors.textSecondary, textAlign: 'center' },

  doneBtn: {
    backgroundColor: colors.accent,
    borderRadius: radius.lg,
    paddingVertical: 18,
    alignItems: 'center',
    marginTop: spacing.lg,
  },
  doneBtnText: { ...typography.bodyBold, color: colors.text },
});
