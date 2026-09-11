/**
 * TrainHomeScreen — Segmented Training Hub (Lift | Run | Plan)
 *
 * Unified training experience merging workouts and runs into one tab.
 * Each segment shows focused content with today's activity hero card,
 * recent sessions, and navigation to deeper screens.
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  RefreshControl,
} from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Skeleton, SkeletonRow, SkeletonStatCard } from '../components/Skeleton';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, typography, radius, fonts } from '../theme';
import { haptic } from '../utils/haptics';
import {
  getRecentTraining, deleteWorkout, restoreWorkout, deleteRun, restoreRun, TrainingItem,
} from '../api/client';
import SwipeableRow from '../components/SwipeableRow';
import UndoToast from '../components/UndoToast';
import ScreenBackground from '../components/ScreenBackground';
import SegmentedSwitch from '../components/SegmentedSwitch';
import CoachHero from '../components/CoachHero';
import CoachSheet from '../components/CoachSheet';
import Topbar from '../components/Topbar';
import SessionListCard from '../components/SessionListCard';
import ProgramToday from '../components/ProgramToday';
import ProgramWeek from '../components/ProgramWeek';
import ProgramOverview from '../components/ProgramOverview';

type Segment = 'today' | 'week' | 'program' | 'history';

const SEGMENTS: { key: Segment; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'today',   label: 'Today',   icon: 'sunny-outline' },
  { key: 'week',    label: 'Week',    icon: 'calendar-outline' },
  { key: 'program', label: 'Program', icon: 'golf-outline' },
  { key: 'history', label: 'History', icon: 'time-outline' },
];

export default function TrainHomeScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const [segment, setSegment] = useState<Segment>('today');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Data
  const [recentTraining, setRecentTraining] = useState<TrainingItem[]>([]);

  const [coachOpen, setCoachOpen] = useState(false);

  // Undo toast
  const [undoToast, setUndoToast] = useState<{
    visible: boolean; message: string; itemId: number;
    itemType: 'workout' | 'run'; snapshot: TrainingItem | null;
  }>({ visible: false, message: '', itemId: 0, itemType: 'workout', snapshot: null });

  const fetchData = useCallback(async () => {
    try {
      const [training] = await Promise.allSettled([getRecentTraining(14)]);
      if (training.status === 'fulfilled') setRecentTraining(training.value);
    } catch (err) {
      console.warn('TrainHome fetch error:', err);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Re-fetch when screen comes into focus
  useEffect(() => {
    const unsub = navigation?.addListener?.('focus', fetchData);
    return unsub;
  }, [navigation, fetchData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  }, [fetchData]);

  const handleDelete = async (item: TrainingItem) => {
    setRecentTraining(prev => prev.filter(t => !(t.id === item.id && t.type === item.type)));
    haptic.light();
    const label = item.type === 'workout'
      ? `${item.label} deleted`
      : `${item.detail} deleted`;
    setUndoToast({ visible: true, message: label, itemId: item.id, itemType: item.type, snapshot: item });
    try {
      if (item.type === 'workout') await deleteWorkout(item.id);
      else await deleteRun(item.id);
      fetchData();
    } catch (err) {
      console.warn('Delete failed:', err);
      setRecentTraining(prev => [...prev, item].sort((a, b) => b.date.localeCompare(a.date)));
      setUndoToast(prev => ({ ...prev, visible: false }));
    }
  };

  const handleUndo = async () => {
    const { itemId, itemType, snapshot } = undoToast;
    setUndoToast(prev => ({ ...prev, visible: false }));
    if (!snapshot) return;
    try {
      if (itemType === 'workout') await restoreWorkout(itemId);
      else await restoreRun(itemId);
      setRecentTraining(prev => [...prev, snapshot].sort((a, b) => b.date.localeCompare(a.date)));
      fetchData();
    } catch (err) {
      console.warn('Restore failed:', err);
    }
  };

  const liftItems = recentTraining.filter(t => t.type === 'workout');
  const runItems = recentTraining.filter(t => t.type === 'run');

  // --- Segment content ---

  const renderHistorySegment = () => (
    <>
      <View style={{ paddingHorizontal: spacing.md }}>
        {liftItems.length > 0 ? (
          <SessionListCard
            sessions={liftItems.slice(0, 8).map(item => {
              const dateStr = new Date(item.date + 'T12:00:00');
              const detail = (item as any).detail as string | undefined;
              const vol = detail?.match(/([\d,]+)\s*lb/)?.[1];
              const lifts = detail?.match(/(\d+)\s*lifts?/)?.[1];
              return {
                id: item.id,
                day: dateStr.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase(),
                when: dateStr.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
                title: item.day_type && /^S\d$/.test(item.day_type) ? `Session ${item.day_type.slice(1)}` : item.day_type || 'Workout',
                metrics: [vol ? `${vol} lb` : '—', lifts ? `${lifts} lifts` : '—', item.rpe != null ? `RPE ${item.rpe}` : '—'] as [string, string, string],
                active: false,
              };
            })}
            labels={['VOLUME', 'LIFTS', 'RPE']}
            onPress={s => navigation?.navigate?.('WorkoutDetail', { sessionId: Number(s.id) })}
          />
        ) : (
          <View style={styles.emptyState}>
            <Ionicons name="barbell-outline" size={40} color={colors.textTertiary} />
            <Text style={styles.emptyText}>No sessions yet</Text>
            <Text style={styles.emptySubtext}>Start today's session from the Today tab</Text>
          </View>
        )}
        {runItems.length > 0 && (
          <View style={{ marginTop: spacing.md }}>
            <Text style={[typography.eyebrow, { marginBottom: 6 }]}>RUNS</Text>
            {runItems.slice(0, 8).map(item => (
              <SwipeableRow key={`run-${item.id}`} onDelete={() => handleDelete(item)}>
                <View style={styles.runRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.runTitle}>{item.label}</Text>
                    <Text style={styles.runMeta}>{new Date(item.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} · {item.detail}</Text>
                  </View>
                  {item.rpe != null && <Text style={styles.runMeta}>RPE {item.rpe}</Text>}
                </View>
              </SwipeableRow>
            ))}
          </View>
        )}
        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 18, marginTop: spacing.md }}>
          <TouchableOpacity style={styles.seeAllBtn} onPress={() => navigation?.navigate?.('WorkoutHistory')}><Text style={styles.seeAllText}>ALL SESSIONS</Text></TouchableOpacity>
          <TouchableOpacity style={styles.seeAllBtn} onPress={() => navigation?.navigate?.('RunHistory')}><Text style={styles.seeAllText}>ALL RUNS</Text></TouchableOpacity>
          <TouchableOpacity style={styles.seeAllBtn} onPress={() => navigation?.navigate?.('LogRun')}><Text style={styles.seeAllText}>LOG A RUN</Text></TouchableOpacity>
        </View>
      </View>
    </>
  );

  if (loading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top + 40, padding: spacing.lg }]}>
        <View style={{ flexDirection: 'row', gap: 12, marginBottom: spacing.lg }}>
          <SkeletonStatCard />
          <SkeletonStatCard />
          <SkeletonStatCard />
        </View>
        <Skeleton width="100%" height={120} borderRadius={radius.lg} style={{ marginBottom: spacing.md }} />
        <SkeletonRow />
        <SkeletonRow />
        <SkeletonRow />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ScreenBackground>
      <ScrollView
        style={styles.container}
        contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: 140, flexGrow: 1 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />
        }
      >
        {/* Topbar with brand mark */}
        <Topbar
          title="Train"
          caption="GOLF PERFORMANCE · SEP 2026 → SPRING 2027"
        />

        {/* Segmented switch */}
        <View style={{ paddingHorizontal: spacing.md, marginBottom: spacing.md }}>
          <SegmentedSwitch
            segments={SEGMENTS.map(s => ({ key: s.key, label: s.label }))}
            value={segment}
            onChange={setSegment}
          />
        </View>

        {/* Segment Content — each segment provides its own CoachHero */}
        {segment === 'today' && (
          <ProgramToday navigation={navigation} onAsk={() => { haptic.medium(); setCoachOpen(true); }} />
        )}
        {segment === 'week' && <ProgramWeek navigation={navigation} />}
        {segment === 'program' && <ProgramOverview navigation={navigation} />}
        {segment === 'history' && renderHistorySegment()}
      </ScrollView>

      <UndoToast
        visible={undoToast.visible}
        message={undoToast.message}
        onUndo={handleUndo}
        onDismiss={() => setUndoToast(prev => ({ ...prev, visible: false }))}
      />

      <CoachSheet
        visible={coachOpen}
        onClose={() => setCoachOpen(false)}
        seed="I've got today's session, the week and your last sets in front of me. Ask, or tell me what's changing — I'll re-plan the week."

      />
      </ScreenBackground>
    </GestureHandlerRootView>
  );
}


const styles = StyleSheet.create({
  runRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 12, backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.line, marginBottom: 6 },
  runTitle: { fontFamily: fonts.medium, fontSize: 13.5, color: colors.text },
  runMeta: { fontFamily: fonts.mono, fontSize: 10.5, color: colors.textTertiary, marginTop: 2 },
  container: { flex: 1 },

  screenTitle: {
    fontFamily: fonts.serifItalic, fontSize: 30, color: colors.text,
    letterSpacing: -0.6,
    paddingHorizontal: spacing.lg, marginBottom: spacing.md,
  },

  // Segmented control
  segmentRow: {
    flexDirection: 'row', marginHorizontal: spacing.lg,
    backgroundColor: colors.card, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border,
    padding: 3, marginBottom: spacing.lg,
  },
  segmentBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: spacing.sm + 2, borderRadius: radius.sm, gap: 6,
  },
  segmentBtnActive: {
    backgroundColor: colors.accentMuted,
  },
  segmentText: { ...typography.caption, color: colors.textTertiary },
  segmentTextActive: { color: colors.accent, fontWeight: '700' },

  // Hero card
  heroCard: {
    marginHorizontal: spacing.lg, marginBottom: spacing.lg,
    backgroundColor: colors.card, borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.border, padding: spacing.lg,
  },
  heroHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm },
  heroIndicator: { width: 8, height: 8, borderRadius: 4, marginRight: spacing.sm },
  heroLabel: { ...typography.micro, color: colors.textTertiary },
  heroTitle: { ...typography.title2, color: colors.text, marginBottom: spacing.xs },
  heroMeta: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.md },
  heroMetaText: { ...typography.caption, color: colors.textSecondary },
  heroCta: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  heroCtaText: { ...typography.bodyBold, color: colors.accent },

  // Section
  sectionTitle: {
    fontFamily: fonts.mono, fontSize: 10, color: colors.textTertiary, letterSpacing: 1.8,
    paddingHorizontal: spacing.lg, marginBottom: spacing.xs, marginTop: spacing.sm,
  },
  swipeHint: {
    ...typography.micro, color: colors.textTertiary,
    paddingHorizontal: spacing.lg, marginBottom: spacing.sm,
    fontSize: 10, opacity: 0.6,
  },

  // Session cards
  sessionCard: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: spacing.md, paddingHorizontal: spacing.lg,
    marginHorizontal: spacing.lg, marginBottom: spacing.sm,
    backgroundColor: colors.card, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border,
  },
  sessionLeft: { marginRight: spacing.md },
  sessionIcon: {
    width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center',
  },
  sessionCenter: { flex: 1 },
  sessionTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: 2 },
  sessionLabel: { fontSize: 16, fontWeight: '600', color: colors.text },
  typeBadge: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4 },
  typeBadgeText: { fontSize: 9, fontWeight: '700', letterSpacing: 0.5 },
  prBadge: { fontSize: 11 },
  sessionDate: { ...typography.caption, color: colors.textTertiary },
  sessionRight: { alignItems: 'flex-end' },
  sessionDetail: { ...typography.caption, color: colors.textSecondary, textAlign: 'right' },
  sessionRpe: { ...typography.micro, color: colors.textTertiary },

  // See all button
  seeAllBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    marginHorizontal: spacing.lg, marginTop: spacing.sm, marginBottom: spacing.md,
    paddingVertical: spacing.md, gap: spacing.sm,
  },
  seeAllText: { fontFamily: fonts.mono, fontSize: 11, color: colors.accent, letterSpacing: 1.8 },

  // ── Lift view (canvas)
  liftVolumeGrid: {
    flexDirection: 'row',
    gap: 14,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  liftVolumeLabel: {
    fontFamily: fonts.mono,
    fontSize: 9,
    color: colors.textTertiary,
    letterSpacing: 1.8,
    marginBottom: 6,
  },
  liftVolumeNum: {
    fontFamily: fonts.mono,
    fontSize: 28,
    color: colors.text,
    letterSpacing: -0.6,
  },
  liftVolumeUnit: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: colors.textTertiary,
  },
  openWorkoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 14,
    backgroundColor: colors.accent,
    borderRadius: radius.lg,
  },
  openWorkoutBtnText: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: colors.bg,
    letterSpacing: 2.2,
  },
  openWorkoutMeta: {
    fontFamily: fonts.mono,
    fontSize: 9,
    color: colors.textTertiary,
    letterSpacing: 1.4,
    textAlign: 'center',
    marginTop: 8,
  },

  // ── Run view (canvas)
  runStartFlex: {
    flex: 1,
    paddingVertical: 15,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  runStartFlexText: {
    fontFamily: fonts.mono,
    fontSize: 12,
    color: colors.bg,
    letterSpacing: 2,
  },

  // ── Plan view (canvas)
  planRibbon: {
    flexDirection: 'row',
    gap: 3,
    marginTop: 4,
  },
  planRibbonCell: {
    flex: 1,
    height: 26,
    borderRadius: 2,
  },
  planRibbonLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  planRibbonLabel: {
    fontFamily: fonts.mono,
    fontSize: 9,
    color: colors.textTertiary,
    letterSpacing: 1.4,
  },
  planSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginHorizontal: spacing.md,
    marginTop: 22,
    marginBottom: 10,
  },
  planSectionTitle: {
    fontFamily: fonts.serifItalic,
    fontSize: 22,
    color: colors.text,
    letterSpacing: -0.5,
  },
  planSectionMore: {
    fontFamily: fonts.mono,
    fontSize: 10,
    color: colors.textTertiary,
    letterSpacing: 1.6,
  },
  planDaysCard: {
    marginHorizontal: spacing.md,
    borderRadius: radius.xl,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    overflow: 'hidden',
  },
  planDayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  planDayName: {
    fontFamily: fonts.mono,
    fontSize: 11,
    letterSpacing: 1.4,
    width: 38,
  },
  planDayWorkout: {
    flex: 1,
    fontFamily: fonts.regular,
    fontSize: 14,
    color: colors.text,
  },
  planDayTarget: {
    fontFamily: fonts.mono,
    fontSize: 10,
    color: colors.textTertiary,
    letterSpacing: 1,
    width: 80,
    textAlign: 'right',
  },
  planDayDone: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  planDayDoneDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.bg,
  },

  // Nav buttons
  navButtons: { marginTop: spacing.md, gap: spacing.sm },
  navBtn: {
    flexDirection: 'row', alignItems: 'center',
    marginHorizontal: spacing.lg, paddingVertical: spacing.md, paddingHorizontal: spacing.lg,
    backgroundColor: colors.card, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border, gap: spacing.md,
  },
  navBtnText: { ...typography.body, color: colors.text, flex: 1 },

  // Calendar-style plan
  weekChip: {
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.sm,
    borderWidth: 1, borderColor: colors.border, marginRight: 4,
    backgroundColor: colors.card, alignItems: 'center', minWidth: 40,
  },
  weekChipNum: { fontSize: 11, color: colors.textSecondary, fontWeight: '600' },
  weekChipProgress: { fontSize: 9, color: colors.textTertiary, marginTop: 1 },

  calDayCard: {
    flex: 1, flexDirection: 'row', alignItems: 'center', marginBottom: 6,
    paddingVertical: 10, paddingHorizontal: spacing.sm,
    backgroundColor: colors.card, borderRadius: radius.sm,
    borderWidth: 1, borderColor: colors.border,
  },
  calDayLeft: { width: 36, alignItems: 'center' },
  calDayName: { fontSize: 12, fontWeight: '600', color: colors.text },
  calDayDate: { fontSize: 10, color: colors.textTertiary, marginTop: 1 },
  calDayCenter: { flex: 1, marginLeft: spacing.sm },
  calTypeBadge: { paddingHorizontal: 5, paddingVertical: 1, borderRadius: 3 },
  calTypeBadgeText: { fontSize: 8, fontWeight: '700', letterSpacing: 0.5 },

  // Run segment
  runCard: {
    backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1,
    borderColor: colors.border, padding: spacing.lg, marginBottom: spacing.md,
  },
  runStartBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: spacing.sm, paddingVertical: 18, borderRadius: radius.md,
    backgroundColor: colors.accent, marginBottom: spacing.sm,
    marginHorizontal: spacing.lg,
  },
  runStartText: { ...typography.title3, color: '#fff' },
  runPlanContext: {
    ...typography.caption, color: colors.textTertiary, textAlign: 'center',
    marginBottom: spacing.md,
  },
  runQuickRow: {
    flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg,
    marginHorizontal: spacing.lg,
  },
  runQuickBtn: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingVertical: spacing.md, backgroundColor: colors.card,
    borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
    gap: 4,
  },
  runQuickLabel: { ...typography.micro, color: colors.textSecondary, fontWeight: '600' },

  // Week stats
  weekStatsRow: {
    flexDirection: 'row', marginHorizontal: spacing.lg,
    marginBottom: spacing.lg, gap: spacing.md,
  },
  weekStat: {
    flex: 1, backgroundColor: colors.card, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border,
    padding: spacing.md, alignItems: 'center',
  },
  weekStatValue: { fontSize: 22, fontWeight: '700', color: colors.text, fontVariant: ['tabular-nums'] },
  weekStatLabel: { ...typography.micro, color: colors.textTertiary, marginTop: 2 },

  // Plan segment
  planHeader: {
    marginHorizontal: spacing.lg, marginBottom: spacing.lg,
  },
  planTitle: { ...typography.title3, color: colors.text },
  planSubtitle: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },

  weekGrid: {
    flexDirection: 'row', marginHorizontal: spacing.lg,
    backgroundColor: colors.card, borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.border,
    padding: spacing.sm, marginBottom: spacing.lg,
  },
  weekGridFull: {
    flexDirection: 'row', marginHorizontal: spacing.lg,
    backgroundColor: colors.card, borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.border,
    padding: spacing.sm, marginBottom: spacing.lg,
  },
  weekDay: {
    flex: 1, alignItems: 'center', paddingVertical: spacing.sm,
    borderRadius: radius.sm,
  },
  weekDayFull: {
    flex: 1, alignItems: 'center', paddingVertical: spacing.sm,
    borderRadius: radius.sm, gap: 3,
  },
  weekDayToday: { backgroundColor: colors.accentMuted },
  weekDayTodayFull: { backgroundColor: colors.accentMuted },
  weekDayIcon: {
    width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
  },
  weekDayName: { ...typography.micro, color: colors.textTertiary, marginBottom: 4 },
  weekDayNameToday: { color: colors.accent },
  weekDayType: { ...typography.micro, color: colors.textSecondary, fontSize: 9 },
  weekDayMiles: { ...typography.micro, color: colors.text, fontSize: 10, marginTop: 2 },
  weekDayStatus: { fontSize: 12, marginTop: 4 },

  weekSummaryCard: {
    marginHorizontal: spacing.lg,
    backgroundColor: colors.card, borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.border,
    padding: spacing.lg, marginBottom: spacing.lg,
  },
  weekSummaryRow: { flexDirection: 'row', justifyContent: 'space-around', marginTop: spacing.md },
  weekSummaryStat: { alignItems: 'center' },
  weekSummaryValue: { fontSize: 18, fontWeight: '700', color: colors.text, fontVariant: ['tabular-nums'] },
  weekSummaryLabel: { ...typography.micro, color: colors.textTertiary, marginTop: 2 },

  // Empty state
  emptyState: { alignItems: 'center', paddingTop: 60, gap: spacing.sm },
  emptyText: { ...typography.title3, color: colors.textSecondary },
  emptySubtext: { ...typography.caption, color: colors.textTertiary },
});
