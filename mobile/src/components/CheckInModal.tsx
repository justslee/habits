import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, ScrollView, TouchableOpacity, StyleSheet,
  Alert, Animated, Modal, Dimensions, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { createEntry, API_URL, apiHeaders } from '../api/client';
import { colors, spacing, typography, radius } from '../theme';
import { haptic } from '../utils/haptics';
import { Skeleton } from './Skeleton';

const SCREEN_HEIGHT = Dimensions.get('window').height;
const SHEET_HEIGHT = SCREEN_HEIGHT * 0.92;

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

interface Props {
  visible: boolean;
  onClose: () => void;
  completedCount: number;
  totalCount: number;
  totalMinutes: number;
}

const formatTime = (mins: number) => {
  if (mins === 0) return '0m';
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
};

export default function CheckInModal({
  visible, onClose, completedCount, totalCount, totalMinutes,
}: Props) {
  const insets = useSafeAreaInsets();
  const [internalVisible, setInternalVisible] = useState(false);
  const [focus, setFocus] = useState(5);
  const [energy, setEnergy] = useState(5);
  const [takeaway, setTakeaway] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [screenState, setScreenState] = useState<ScreenState>('form');
  const [evalResponse, setEvalResponse] = useState<EndOfDayResponse | null>(null);
  const [expandedPillar, setExpandedPillar] = useState<number | null>(null);
  const [pulseAnim] = useState(new Animated.Value(0.3));

  const sheetAnim = useRef(new Animated.Value(SHEET_HEIGHT)).current;
  const evalSlideAnim = useRef(new Animated.Value(0)).current;
  const resultsAnim = useRef(new Animated.Value(0)).current;

  // Bottom sheet slide in/out
  useEffect(() => {
    if (visible) {
      setInternalVisible(true);
      sheetAnim.setValue(SHEET_HEIGHT);
      Animated.spring(sheetAnim, {
        toValue: 0,
        damping: 28,
        stiffness: 220,
        useNativeDriver: true,
      }).start();
    } else {
      Animated.spring(sheetAnim, {
        toValue: SHEET_HEIGHT,
        damping: 28,
        stiffness: 220,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) setInternalVisible(false);
      });
    }
  }, [visible]);

  // Slide-out when form submits → evaluating
  useEffect(() => {
    if (screenState === 'evaluating') {
      evalSlideAnim.setValue(0);
      Animated.spring(evalSlideAnim, {
        toValue: 1, damping: 20, stiffness: 100, useNativeDriver: true,
      }).start();
    }
  }, [screenState]);

  // Fade-in when results arrive
  useEffect(() => {
    if (screenState === 'results') {
      resultsAnim.setValue(0);
      Animated.spring(resultsAnim, {
        toValue: 1, damping: 20, stiffness: 100, useNativeDriver: true,
      }).start();
      haptic.success();
    }
  }, [screenState]);

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

  const handleClose = () => {
    setFocus(5); setEnergy(5); setTakeaway('');
    setScreenState('form'); setEvalResponse(null);
    setExpandedPillar(null); setSubmitting(false);
    evalSlideAnim.setValue(0);
    resultsAnim.setValue(0);
    onClose();
  };

  const handleSubmit = async () => {
    if (!takeaway.trim()) return Alert.alert('Required', 'Add a key takeaway from today.');
    haptic.medium();
    setSubmitting(true);
    try {
      await createEntry({
        description: `Daily reflection — ${completedCount}/${totalCount} todos completed`,
        time_invested_minutes: totalMinutes || 30,
        pillar_tags: [],
        difficulty_rating: focus,
        energy_level: energy,
        key_takeaway: takeaway.trim(),
      });

      if (completedCount > 0) {
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
            setScreenState('results');
            setEvalResponse({ evaluated: 0, results: [], reflection_applied: true });
          }
        } catch (err) {
          console.warn('End-of-day eval failed:', err);
          setScreenState('results');
          setEvalResponse({ evaluated: 0, results: [], reflection_applied: true });
        }
      } else {
        setScreenState('results');
        setEvalResponse({ evaluated: 0, results: [], reflection_applied: true });
      }
    } catch (err: unknown) {
      console.warn('CheckIn submit error:', err);
      Alert.alert('Failed', err instanceof Error ? err.message : 'Unknown error');
      setSubmitting(false);
    }
  };

  const onePercentCount = evalResponse?.results.filter(r => r.one_percent_better).length ?? 0;
  const totalEvaluated = evalResponse?.results.length ?? 0;

  const formTranslateY = evalSlideAnim.interpolate({ inputRange: [0, 1], outputRange: [0, -50] });
  const formOpacity = evalSlideAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });
  const resultsTranslateY = resultsAnim.interpolate({ inputRange: [0, 1], outputRange: [30, 0] });
  const resultsOpacity = resultsAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });

  // ===== FORM =====
  const renderForm = () => (
    <Animated.View style={{ opacity: formOpacity, transform: [{ translateY: formTranslateY }] }}>
      {/* Summary strip */}
      <View style={m.summaryStrip}>
        <View style={m.summaryCard}>
          <Text style={m.summaryValue}>{completedCount}/{totalCount}</Text>
          <Text style={m.summaryLabel}>Completed</Text>
        </View>
        <View style={m.summaryCard}>
          <Text style={m.summaryValue}>{formatTime(totalMinutes)}</Text>
          <Text style={m.summaryLabel}>Time Logged</Text>
        </View>
      </View>

      {/* Takeaway — most prominent, first */}
      <Text style={m.fieldLabel}>WHAT'S THE ONE THING WORTH REMEMBERING?</Text>
      <TextInput
        style={m.takeawayInput}
        placeholder="Your key insight from today..."
        placeholderTextColor={colors.textTertiary}
        value={takeaway}
        onChangeText={setTakeaway}
        multiline
        numberOfLines={3}
        textAlignVertical="top"
      />

      {/* Focus slider */}
      <Text style={m.sliderLabel}>
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
          />
        ))}
      </View>

      {/* Energy slider */}
      <Text style={m.sliderLabel}>
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
          />
        ))}
      </View>

      {/* Save */}
      <TouchableOpacity
        style={[m.saveBtn, submitting && { opacity: 0.5 }]}
        onPress={handleSubmit}
        disabled={submitting}
      >
        {submitting
          ? <Skeleton width={140} height={18} />
          : <Text style={m.saveBtnText}>Save Reflection</Text>
        }
      </TouchableOpacity>
    </Animated.View>
  );

  // ===== EVALUATING =====
  const renderEvaluating = () => (
    <View style={m.evalCenter}>
      <Animated.View style={[m.evalRing, { opacity: pulseAnim }]}>
        <Ionicons name="analytics-outline" size={40} color={colors.accent} />
      </Animated.View>
      <Text style={m.evalTitle}>Evaluating your day...</Text>
      <Text style={m.evalSub}>The Honest Mirror is reviewing your work</Text>
    </View>
  );

  // ===== RESULTS =====
  const renderResults = () => (
    <Animated.View style={{ opacity: resultsOpacity, transform: [{ translateY: resultsTranslateY }] }}>
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
            <Text style={m.resultsSub}>Focus: {focus}/10 · Energy: {energy}/10</Text>
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
            {completedCount === 0
              ? 'No pillar-linked todos completed today'
              : 'Your reflection has been logged'}
          </Text>
        </View>
      )}

      <TouchableOpacity style={m.doneBtn} onPress={handleClose}>
        <Text style={m.doneBtnText}>Done</Text>
      </TouchableOpacity>
    </Animated.View>
  );

  return (
    <Modal
      visible={internalVisible}
      transparent
      animationType="none"
      onRequestClose={handleClose}
      statusBarTranslucent
    >
      {/* Backdrop */}
      <TouchableOpacity
        style={m.backdrop}
        activeOpacity={1}
        onPress={screenState === 'form' ? handleClose : undefined}
      />

      {/* Bottom sheet */}
      <Animated.View style={[m.sheet, { transform: [{ translateY: sheetAnim }] }]}>
        {/* Drag handle */}
        <View style={m.dragHandle} />

        {/* Header */}
        <View style={m.sheetHeader}>
          <Text style={m.sheetTitle}>Daily Reflection</Text>
          {screenState !== 'results' && (
            <TouchableOpacity onPress={handleClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={m.cancelText}>Cancel</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Content */}
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView
            style={m.sheetScroll}
            contentContainerStyle={[m.sheetContent, { paddingBottom: insets.bottom + spacing.xl }]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {screenState === 'form' && renderForm()}
            {screenState === 'evaluating' && renderEvaluating()}
            {screenState === 'results' && renderResults()}
          </ScrollView>
        </KeyboardAvoidingView>
      </Animated.View>
    </Modal>
  );
}

const m = StyleSheet.create({
  // Backdrop
  backdrop: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(5,6,15,0.75)',
  },

  // Sheet
  sheet: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    height: SHEET_HEIGHT,
    backgroundColor: colors.card,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: 'hidden',
  },
  dragHandle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: colors.border,
    alignSelf: 'center',
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  sheetTitle: { ...typography.title3, color: colors.text },
  cancelText: { ...typography.body, color: colors.accent },
  sheetScroll: { flex: 1 },
  sheetContent: { padding: spacing.lg },

  // Summary strip
  summaryStrip: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: colors.input,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  summaryValue: { ...typography.title2, color: colors.text },
  summaryLabel: { ...typography.caption, color: colors.textTertiary, marginTop: 2 },

  // Form fields
  fieldLabel: {
    ...typography.micro,
    color: colors.textTertiary,
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
  },
  takeawayInput: {
    backgroundColor: colors.input,
    color: colors.text,
    borderRadius: radius.md,
    padding: spacing.md,
    fontSize: 15,
    borderWidth: 1,
    borderColor: colors.border,
    minHeight: 80,
    marginBottom: spacing.lg,
  },
  sliderLabel: {
    ...typography.micro,
    color: colors.textTertiary,
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
    marginTop: spacing.md,
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
  saveBtnText: { ...typography.bodyBold, color: '#fff' },

  // Evaluating
  evalCenter: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xxl,
  },
  evalRing: {
    width: 88, height: 88, borderRadius: 44,
    backgroundColor: colors.accent + '15',
    borderWidth: 2, borderColor: colors.accent + '40',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  evalTitle: { ...typography.title3, color: colors.text, marginBottom: spacing.sm, textAlign: 'center' },
  evalSub: { ...typography.body, color: colors.textSecondary, textAlign: 'center' },

  // Results summary
  resultsSummary: { alignItems: 'center', marginBottom: spacing.lg },
  resultsEmoji: { fontSize: 48, marginBottom: spacing.sm },
  resultsTitle: { ...typography.title3, color: colors.text, textAlign: 'center', marginBottom: spacing.xs },
  resultsSub: { ...typography.caption, color: colors.textTertiary, textAlign: 'center' },

  // Eval card
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
    width: 48, height: 48, borderRadius: 24, borderWidth: 3,
    alignItems: 'center', justifyContent: 'center',
  },
  depthScore: { fontSize: 16, fontWeight: '700', fontVariant: ['tabular-nums'] as any },
  verdictBadgeYes: {
    flexDirection: 'row', alignItems: 'center', gap: 2,
    backgroundColor: colors.success + '18',
    borderRadius: radius.pill,
    paddingHorizontal: 8, paddingVertical: 2,
  },
  verdictTextYes: { fontSize: 11, fontWeight: '700', color: colors.success },
  verdictBadgeNo: {
    backgroundColor: colors.textTertiary + '18',
    borderRadius: radius.pill,
    paddingHorizontal: 8, paddingVertical: 2,
  },
  verdictTextNo: { fontSize: 11, fontWeight: '600', color: colors.textTertiary },
  verdictExplanation: { ...typography.body, color: colors.textSecondary, fontSize: 13, lineHeight: 18 },
  commentaryBox: {
    marginTop: spacing.md, paddingTop: spacing.md,
    borderTopWidth: 1, borderTopColor: colors.border,
  },
  commentaryLabel: {
    ...typography.micro, color: colors.accent,
    textTransform: 'uppercase', marginBottom: spacing.xs, letterSpacing: 1,
  },
  commentaryText: { ...typography.body, color: colors.text, fontSize: 13, lineHeight: 20 },
  expandHint: { alignItems: 'center', marginTop: spacing.sm },

  // Simple success
  simpleSuccess: {
    alignItems: 'center', justifyContent: 'center',
    paddingVertical: spacing.xxl,
  },
  successRing: {
    width: 88, height: 88, borderRadius: 44,
    backgroundColor: colors.success + '15',
    borderWidth: 2, borderColor: colors.success + '40',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  successTitle: { ...typography.title3, color: colors.text, marginBottom: spacing.sm },
  successSub: { ...typography.body, color: colors.textSecondary, textAlign: 'center' },

  // Done button
  doneBtn: {
    backgroundColor: colors.accent,
    borderRadius: radius.lg,
    paddingVertical: 18,
    alignItems: 'center',
    marginTop: spacing.lg,
  },
  doneBtnText: { ...typography.bodyBold, color: '#fff' },
});
