import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet, Platform, Alert,
  Animated as RNAnimated, Modal,
} from 'react-native';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import {
  RunState, GpsPoint, createRunState, processGpsPoint, formatPace, formatDuration,
  requestLocationPermissions, startBackgroundTracking, stopBackgroundTracking,
} from '../services/gps';
import { getTodayRun, TodayRunData, getPostRunFeedback } from '../api/client';
import MapView from '../components/MapView';
import { colors, spacing, typography, radius } from '../theme';

const RUN_TYPE_COLORS: Record<string, string> = {
  easy: '#3B82F6', tempo: '#F59E0B', intervals: '#EF4444',
  long: '#22C55E', recovery: '#6B7280', fartlek: '#EC4899', progression: '#8B5CF6',
};

type Phase = 'pre' | 'countdown' | 'active' | 'paused' | 'rpe' | 'summary';

export default function RunScreen() {
  const [phase, setPhase] = useState<Phase>('pre');
  const [runState, setRunState] = useState<RunState>(createRunState);
  const [permissionGranted, setPermissionGranted] = useState(false);
  const [todayRun, setTodayRun] = useState<TodayRunData | null>(null);
  const [countdownNum, setCountdownNum] = useState(3);
  const [selectedRPE, setSelectedRPE] = useState(5);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [savedRunId, setSavedRunId] = useState<number | null>(null);
  const countdownScale = useRef(new RNAnimated.Value(1)).current;
  const locationSub = useRef<Location.LocationSubscription | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stateRef = useRef(runState);
  stateRef.current = runState;

  useEffect(() => {
    requestLocationPermissions().then(setPermissionGranted);
    getTodayRun().then(setTodayRun).catch(() => {});
    return () => { locationSub.current?.remove(); if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  // --- Countdown ---
  const startCountdown = useCallback(() => {
    if (!permissionGranted) { Alert.alert('Permission Required', 'Location access needed.'); return; }
    setPhase('countdown');
    setCountdownNum(3);
    let count = 3;
    const iv = setInterval(() => {
      count--;
      if (count <= 0) {
        clearInterval(iv);
        beginTracking();
      } else {
        setCountdownNum(count);
        RNAnimated.sequence([
          RNAnimated.timing(countdownScale, { toValue: 1.3, duration: 150, useNativeDriver: true }),
          RNAnimated.timing(countdownScale, { toValue: 1, duration: 150, useNativeDriver: true }),
        ]).start();
      }
    }, 1000);
  }, [permissionGranted]);

  // --- Tracking ---
  const beginTracking = useCallback(async () => {
    const now = Date.now();
    setRunState(s => ({ ...s, isTracking: true, isPaused: false, startTime: now, elapsedMs: 0 }));
    setPhase('active');

    locationSub.current = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 3000, distanceInterval: 5 },
      loc => {
        const point: GpsPoint = { latitude: loc.coords.latitude, longitude: loc.coords.longitude, altitude: loc.coords.altitude, timestamp: loc.timestamp };
        setRunState(prev => processGpsPoint(prev, point));
      },
    );
    try { await startBackgroundTracking(); } catch {}

    timerRef.current = setInterval(() => {
      setRunState(prev => prev.isTracking && !prev.isPaused ? { ...prev, elapsedMs: Date.now() - prev.startTime } : prev);
    }, 1000);
  }, []);

  const handlePause = () => {
    setRunState(s => ({ ...s, isPaused: !s.isPaused }));
    setPhase(phase === 'paused' ? 'active' : 'paused');
  };

  const handleStop = () => {
    locationSub.current?.remove(); locationSub.current = null;
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    stopBackgroundTracking().catch(() => {});
    if (stateRef.current.distanceMiles < 0.1) { resetToPreRun(); return; }
    setPhase('rpe');
  };

  const saveRun = async () => {
    const state = stateRef.current;
    try {
      const resp = await fetch(`${process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8000'}/api/v1/runs/`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          distance_miles: Math.round(state.distanceMiles * 100) / 100,
          duration_seconds: Math.round(state.elapsedMs / 1000),
          elevation_gain_ft: Math.round(state.elevationGainFt),
          run_type: todayRun?.planned_run?.run_type || 'easy',
          rpe: selectedRPE,
          planned_run_id: todayRun?.planned_run?.id || null,
          gps_polyline: JSON.stringify(state.points.map(p => ({ lat: p.latitude, lng: p.longitude, alt: p.altitude, t: p.timestamp }))),
          splits: state.splits.map(sp => ({ mile_number: sp.mileNumber, pace_seconds: sp.paceSeconds, elevation_change_ft: sp.elevationChangeFt })),
        }),
      });
      if (resp.ok) {
        const data = await resp.json();
        setSavedRunId(data.id);
        // Get AI feedback
        try {
          const fb = await getPostRunFeedback(data.id);
          setFeedback(fb.feedback);
        } catch { setFeedback(null); }
      }
    } catch {}
    setPhase('summary');
  };

  const resetToPreRun = () => {
    setRunState(createRunState());
    setPhase('pre');
    setFeedback(null);
    setSavedRunId(null);
    setSelectedRPE(5);
    getTodayRun().then(setTodayRun).catch(() => {});
  };

  const { distanceMiles, currentPaceSeconds, elapsedMs, elevationGainFt, splits, points } = runState;
  const lastPoint = points.length > 0 ? points[points.length - 1] : null;
  const planned = todayRun?.planned_run;
  const runTypeColor = RUN_TYPE_COLORS[planned?.run_type || 'easy'] || colors.accent;

  // Parse structure
  let segments: any[] = [];
  if (planned?.structure) {
    try { segments = JSON.parse(planned.structure); } catch {}
  }

  // === PRE-RUN ===
  if (phase === 'pre') {
    return (
      <ScrollView style={s.container} contentContainerStyle={s.preContent}>
        <Text style={s.screenTitle}>Run</Text>

        {planned ? (
          <View style={[s.card, { borderColor: runTypeColor + '40' }]}>
            <View style={s.todayHeader}>
              <View style={[s.typeBadge, { backgroundColor: runTypeColor + '20' }]}>
                <Text style={[s.typeBadgeText, { color: runTypeColor }]}>{planned.run_type.toUpperCase()}</Text>
              </View>
              {todayRun?.plan_name && (
                <Text style={s.planWeek}>
                  {todayRun.plan_name} · Week {todayRun.week_number}/{todayRun.total_weeks}
                </Text>
              )}
            </View>

            {planned.description && <Text style={s.runDescription}>{planned.description}</Text>}

            <View style={s.targetRow}>
              {planned.target_distance_miles && (
                <View style={s.targetStat}>
                  <Text style={s.targetValue}>{planned.target_distance_miles}</Text>
                  <Text style={s.targetLabel}>MILES</Text>
                </View>
              )}
              {planned.target_pace_seconds && (
                <View style={s.targetStat}>
                  <Text style={s.targetValue}>{formatPace(planned.target_pace_seconds)}</Text>
                  <Text style={s.targetLabel}>PACE</Text>
                </View>
              )}
              {planned.target_duration_minutes && (
                <View style={s.targetStat}>
                  <Text style={s.targetValue}>{planned.target_duration_minutes}</Text>
                  <Text style={s.targetLabel}>MIN</Text>
                </View>
              )}
            </View>

            {/* Segment timeline */}
            {segments.length > 0 && (
              <View style={s.segmentTimeline}>
                <Text style={s.segmentLabel}>STRUCTURE</Text>
                {segments.map((seg: any, i: number) => (
                  <View key={i} style={s.segmentRow}>
                    <View style={[s.segmentDot, {
                      backgroundColor: seg.type === 'warmup' || seg.type === 'cooldown' ? colors.textTertiary
                        : seg.type === 'work' ? runTypeColor : colors.info
                    }]} />
                    <Text style={s.segmentText}>
                      {seg.type === 'warmup' ? 'Warm up' : seg.type === 'cooldown' ? 'Cool down' : seg.type === 'work' ? 'Work' : seg.type}
                      {seg.minutes ? ` · ${seg.minutes}min` : ''}
                      {seg.pace ? ` · ${seg.pace}` : ''}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        ) : (
          <View style={s.card}>
            <Text style={s.noRunTitle}>No planned run today</Text>
            <Text style={s.noRunSub}>Start a free run or create a training plan</Text>
          </View>
        )}

        <TouchableOpacity style={[s.startBtn, { backgroundColor: runTypeColor }]} onPress={startCountdown}>
          <Ionicons name="play" size={28} color="#fff" />
          <Text style={s.startBtnText}>{planned ? 'Start Run' : 'Free Run'}</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  // === COUNTDOWN ===
  if (phase === 'countdown') {
    return (
      <View style={s.countdownContainer}>
        <RNAnimated.Text style={[s.countdownNum, { transform: [{ scale: countdownScale }] }]}>
          {countdownNum}
        </RNAnimated.Text>
        <Text style={s.countdownLabel}>GET READY</Text>
      </View>
    );
  }

  // === RPE PROMPT ===
  if (phase === 'rpe') {
    return (
      <View style={s.rpeContainer}>
        <Text style={s.rpeTitle}>How did it feel?</Text>
        <Text style={s.rpeSubtitle}>{distanceMiles.toFixed(2)} mi · {formatDuration(elapsedMs)}</Text>

        <View style={s.rpeGrid}>
          {[1,2,3,4,5,6,7,8,9,10].map(n => (
            <TouchableOpacity key={n}
              style={[s.rpeBtn, selectedRPE === n && { backgroundColor: colors.accent, borderColor: colors.accent }]}
              onPress={() => setSelectedRPE(n)}>
              <Text style={[s.rpeBtnText, selectedRPE === n && { color: '#fff' }]}>{n}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={s.rpeLabels}>
          <Text style={s.rpeLabelText}>Easy</Text>
          <Text style={s.rpeLabelText}>Max effort</Text>
        </View>

        <TouchableOpacity style={s.saveBtn} onPress={saveRun}>
          <Text style={s.saveBtnText}>Save Run</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // === POST-RUN SUMMARY ===
  if (phase === 'summary') {
    const state = stateRef.current;
    return (
      <ScrollView style={s.container} contentContainerStyle={s.summaryContent}>
        <Text style={s.summaryTitle}>Run Complete</Text>

        <View style={s.summaryHero}>
          <Text style={s.heroDistance}>{state.distanceMiles.toFixed(2)}</Text>
          <Text style={s.heroUnit}>miles</Text>
        </View>

        <View style={s.summaryStats}>
          <View style={s.summaryStat}>
            <Text style={s.summaryStatValue}>{formatDuration(state.elapsedMs)}</Text>
            <Text style={s.summaryStatLabel}>TIME</Text>
          </View>
          <View style={s.summaryStatDivider} />
          <View style={s.summaryStat}>
            <Text style={s.summaryStatValue}>{formatPace(state.distanceMiles > 0 ? Math.round(state.elapsedMs / 1000 / state.distanceMiles) : 0)}</Text>
            <Text style={s.summaryStatLabel}>AVG PACE</Text>
          </View>
          <View style={s.summaryStatDivider} />
          <View style={s.summaryStat}>
            <Text style={s.summaryStatValue}>{Math.round(state.elevationGainFt)}</Text>
            <Text style={s.summaryStatLabel}>ELEV</Text>
          </View>
        </View>

        {state.splits.length > 0 && (
          <View style={s.card}>
            <Text style={s.cardLabel}>SPLITS</Text>
            {state.splits.map(sp => (
              <View key={sp.mileNumber} style={s.splitRow}>
                <Text style={s.splitMile}>Mile {sp.mileNumber}</Text>
                <Text style={s.splitPace}>{formatPace(sp.paceSeconds)}</Text>
              </View>
            ))}
          </View>
        )}

        {feedback && (
          <View style={s.card}>
            <Text style={s.cardLabel}>COACH FEEDBACK</Text>
            <Text style={s.feedbackText}>{feedback}</Text>
          </View>
        )}

        <TouchableOpacity style={s.doneBtn} onPress={resetToPreRun}>
          <Text style={s.doneBtnText}>Done</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  // === ACTIVE / PAUSED ===
  return (
    <View style={s.container}>
      {/* Map */}
      {lastPoint ? (
        <MapView style={s.map}
          region={{ latitude: lastPoint.latitude, longitude: lastPoint.longitude, latitudeDelta: 0.01, longitudeDelta: 0.01 }}
          showsUserLocation mapType="standard" />
      ) : (
        <View style={s.mapPlaceholder}>
          <Ionicons name="navigate" size={32} color={colors.accent} />
          <Text style={s.mapPlaceholderText}>Acquiring GPS...</Text>
        </View>
      )}

      {/* Stats bottom sheet */}
      <View style={s.statsSheet}>
        <View style={s.mainMetric}>
          <Text style={s.bigDistance}>{distanceMiles.toFixed(2)}</Text>
          <Text style={s.bigUnit}>mi</Text>
        </View>

        <View style={s.metricsRow}>
          <View style={s.metric}>
            <Text style={s.metricValue}>{formatDuration(elapsedMs)}</Text>
            <Text style={s.metricLabel}>TIME</Text>
          </View>
          <View style={s.metricDivider} />
          <View style={s.metric}>
            <Text style={s.metricValue}>{formatPace(currentPaceSeconds)}</Text>
            <Text style={s.metricLabel}>PACE</Text>
          </View>
          <View style={s.metricDivider} />
          <View style={s.metric}>
            <Text style={s.metricValue}>{Math.round(elevationGainFt)}'</Text>
            <Text style={s.metricLabel}>ELEV</Text>
          </View>
        </View>

        {/* Recent splits */}
        {splits.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: spacing.md }}>
            {splits.slice(-5).map(sp => (
              <View key={sp.mileNumber} style={s.liveChip}>
                <Text style={s.liveChipMile}>{sp.mileNumber}</Text>
                <Text style={s.liveChipPace}>{formatPace(sp.paceSeconds)}</Text>
              </View>
            ))}
          </ScrollView>
        )}

        <View style={s.controls}>
          <TouchableOpacity style={s.controlBtn} onPress={handlePause}>
            <Ionicons name={phase === 'paused' ? 'play' : 'pause'} size={28} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity style={[s.controlBtn, s.stopControl]} onPress={handleStop}>
            <Ionicons name="stop" size={28} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },

  // Pre-run
  preContent: { padding: spacing.lg, paddingTop: Platform.OS === 'ios' ? 68 : 48 },
  screenTitle: { ...typography.title1, color: colors.text, marginBottom: spacing.lg },

  card: {
    backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1,
    borderColor: colors.border, padding: spacing.lg, marginBottom: spacing.md,
  },
  cardLabel: { ...typography.micro, color: colors.textTertiary, textTransform: 'uppercase', marginBottom: spacing.md },

  todayHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.md },
  typeBadge: { paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: radius.pill },
  typeBadgeText: { ...typography.micro, fontWeight: '700' },
  planWeek: { ...typography.caption, color: colors.textTertiary },

  runDescription: { ...typography.body, color: colors.textSecondary, marginBottom: spacing.lg, lineHeight: 22 },

  targetRow: { flexDirection: 'row', justifyContent: 'space-around' },
  targetStat: { alignItems: 'center' },
  targetValue: { fontSize: 28, fontWeight: '700', color: colors.text, fontVariant: ['tabular-nums'] },
  targetLabel: { ...typography.micro, color: colors.textTertiary, marginTop: 4 },

  segmentTimeline: { marginTop: spacing.lg, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.md },
  segmentLabel: { ...typography.micro, color: colors.textTertiary, marginBottom: spacing.sm },
  segmentRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  segmentDot: { width: 8, height: 8, borderRadius: 4 },
  segmentText: { ...typography.caption, color: colors.textSecondary },

  noRunTitle: { ...typography.title3, color: colors.text, marginBottom: spacing.xs },
  noRunSub: { ...typography.body, color: colors.textTertiary },

  startBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
    paddingVertical: 18, borderRadius: radius.lg, marginTop: spacing.md,
  },
  startBtnText: { ...typography.bodyBold, color: '#fff', fontSize: 17 },

  // Countdown
  countdownContainer: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  countdownNum: { fontSize: 120, fontWeight: '200', color: colors.accent },
  countdownLabel: { ...typography.micro, color: colors.textTertiary, marginTop: spacing.md, letterSpacing: 3 },

  // Active
  map: { flex: 1 },
  mapPlaceholder: { flex: 1, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  mapPlaceholderText: { ...typography.caption, color: colors.textTertiary },

  statsSheet: {
    backgroundColor: colors.bg, padding: spacing.lg,
    paddingBottom: Platform.OS === 'ios' ? 44 : spacing.lg,
    borderTopWidth: 1, borderTopColor: colors.border,
  },
  mainMetric: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', marginBottom: spacing.md },
  bigDistance: { fontSize: 56, fontWeight: '200', color: colors.text, letterSpacing: -2, fontVariant: ['tabular-nums'] },
  bigUnit: { ...typography.title3, color: colors.textTertiary, marginLeft: spacing.sm },

  metricsRow: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', marginBottom: spacing.md },
  metric: { alignItems: 'center', flex: 1 },
  metricDivider: { width: 1, height: 24, backgroundColor: colors.border },
  metricValue: { fontSize: 18, fontWeight: '600', color: colors.text, fontVariant: ['tabular-nums'] },
  metricLabel: { ...typography.micro, color: colors.textTertiary, marginTop: 2 },

  liveChip: {
    backgroundColor: colors.card, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: spacing.md, paddingVertical: spacing.xs, marginRight: spacing.sm,
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
  },
  liveChipMile: { ...typography.micro, color: colors.textTertiary },
  liveChipPace: { ...typography.bodyBold, color: colors.accent },

  controls: { flexDirection: 'row', justifyContent: 'center', gap: spacing.xl },
  controlBtn: {
    backgroundColor: colors.cardElevated, borderRadius: 36, width: 72, height: 72,
    alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border,
  },
  stopControl: { backgroundColor: colors.error, borderColor: colors.error },

  // RPE
  rpeContainer: { flex: 1, backgroundColor: colors.bg, padding: spacing.lg, paddingTop: Platform.OS === 'ios' ? 120 : 80, alignItems: 'center' },
  rpeTitle: { ...typography.title1, color: colors.text, marginBottom: spacing.sm },
  rpeSubtitle: { ...typography.body, color: colors.textSecondary, marginBottom: spacing.xl },
  rpeGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  rpeBtn: {
    width: 56, height: 56, borderRadius: 28, backgroundColor: colors.card,
    alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border,
  },
  rpeBtnText: { ...typography.title3, color: colors.textSecondary },
  rpeLabels: { flexDirection: 'row', justifyContent: 'space-between', width: '100%', paddingHorizontal: spacing.lg, marginBottom: spacing.xl },
  rpeLabelText: { ...typography.micro, color: colors.textTertiary },
  saveBtn: { backgroundColor: colors.accent, borderRadius: radius.lg, paddingVertical: 18, paddingHorizontal: spacing.xxl },
  saveBtnText: { ...typography.bodyBold, color: '#fff' },

  // Summary
  summaryContent: { padding: spacing.lg, paddingTop: Platform.OS === 'ios' ? 68 : 48, alignItems: 'center' },
  summaryTitle: { ...typography.micro, color: colors.success, letterSpacing: 2, textTransform: 'uppercase', marginBottom: spacing.lg },
  summaryHero: { flexDirection: 'row', alignItems: 'baseline', marginBottom: spacing.xl },
  heroDistance: { fontSize: 72, fontWeight: '200', color: colors.text, fontVariant: ['tabular-nums'] },
  heroUnit: { ...typography.title2, color: colors.textTertiary, marginLeft: spacing.sm },
  summaryStats: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.xl, width: '100%', justifyContent: 'space-around' },
  summaryStat: { alignItems: 'center' },
  summaryStatValue: { fontSize: 20, fontWeight: '600', color: colors.text, fontVariant: ['tabular-nums'] },
  summaryStatLabel: { ...typography.micro, color: colors.textTertiary, marginTop: 4 },
  summaryStatDivider: { width: 1, height: 28, backgroundColor: colors.border },

  splitRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  splitMile: { ...typography.body, color: colors.textSecondary },
  splitPace: { ...typography.bodyBold, color: colors.text },

  feedbackText: { ...typography.body, color: colors.textSecondary, lineHeight: 22 },

  doneBtn: { backgroundColor: colors.accent, borderRadius: radius.lg, paddingVertical: 18, paddingHorizontal: spacing.xxl, marginTop: spacing.lg },
  doneBtnText: { ...typography.bodyBold, color: '#fff' },
});
