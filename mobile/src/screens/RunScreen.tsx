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
import {
  CoachConfig, createCoachState, coachTick, getCurrentSegment,
  announceStart, announceFinish, PlannedSegment,
} from '../services/audioCoach';
import { getTodayRun, TodayRunData, getPostRunFeedback } from '../api/client';
import MapView from '../components/MapView';
import PacePolyline from '../components/PacePolyline';
import { colors, spacing, typography, radius } from '../theme';

const RUN_TYPE_COLORS: Record<string, string> = {
  easy: '#3B82F6', tempo: '#F59E0B', intervals: '#EF4444',
  long: '#22C55E', recovery: '#6B7280', fartlek: '#EC4899', progression: '#8B5CF6',
};

type Phase = 'pre' | 'countdown' | 'active' | 'paused' | 'rpe' | 'summary';

export default function RunScreen({ navigation }: any) {
  const [phase, setPhase] = useState<Phase>('pre');
  const [runState, setRunState] = useState<RunState>(createRunState);
  const [permissionGranted, setPermissionGranted] = useState(false);
  const [todayRun, setTodayRun] = useState<TodayRunData | null>(null);
  const [countdownNum, setCountdownNum] = useState(3);
  const [selectedRPE, setSelectedRPE] = useState(5);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [savedRunId, setSavedRunId] = useState<number | null>(null);
  const [isPR, setIsPR] = useState(false);
  const [prType, setPRType] = useState<string | null>(null);
  const [audioCoachEnabled, setAudioCoachEnabled] = useState(true);
  const countdownScale = useRef(new RNAnimated.Value(1)).current;
  const locationSub = useRef<Location.LocationSubscription | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stateRef = useRef(runState);
  stateRef.current = runState;
  const coachStateRef = useRef(createCoachState());
  const coachConfigRef = useRef<CoachConfig>({
    enabled: true, targetPaceSeconds: null, runType: 'easy', segments: [], targetDistanceMiles: null,
  });

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

    // Configure audio coach
    coachStateRef.current = createCoachState();
    coachConfigRef.current = {
      enabled: audioCoachEnabled,
      targetPaceSeconds: planned?.target_pace_seconds || null,
      runType: planned?.run_type || 'easy',
      segments: segments as PlannedSegment[],
      targetDistanceMiles: planned?.target_distance_miles || null,
    };
    announceStart(coachConfigRef.current);

    locationSub.current = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 3000, distanceInterval: 5 },
      loc => {
        const point: GpsPoint = { latitude: loc.coords.latitude, longitude: loc.coords.longitude, altitude: loc.coords.altitude, timestamp: loc.timestamp };
        setRunState(prev => {
          const updated = processGpsPoint(prev, point);
          // Run audio coach on each GPS tick
          coachStateRef.current = coachTick(updated, coachConfigRef.current, coachStateRef.current);
          return updated;
        });
      },
    );
    try { await startBackgroundTracking(); } catch {}

    timerRef.current = setInterval(() => {
      setRunState(prev => {
        if (!prev.isTracking || prev.isPaused) return prev;
        const updated = { ...prev, elapsedMs: Date.now() - prev.startTime };
        // Also tick coach on timer (for segment transitions based on time)
        coachStateRef.current = coachTick(updated, coachConfigRef.current, coachStateRef.current);
        return updated;
      });
    }, 1000);
  }, [audioCoachEnabled, planned, segments]);

  const handlePause = () => {
    setRunState(s => ({ ...s, isPaused: !s.isPaused }));
    setPhase(phase === 'paused' ? 'active' : 'paused');
  };

  const handleStop = () => {
    locationSub.current?.remove(); locationSub.current = null;
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    stopBackgroundTracking().catch(() => {});
    if (stateRef.current.distanceMiles < 0.1) { resetToPreRun(); return; }
    announceFinish(stateRef.current);
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
          setIsPR(fb.is_pr);
          setPRType(fb.pr_type || null);
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
    setIsPR(false);
    setPRType(null);
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
        <View style={s.preHeader}>
          <Text style={s.screenTitle}>Run</Text>
          <TouchableOpacity onPress={() => navigation?.navigate?.('RunHistory')} style={s.historyBtn}>
            <Ionicons name="time-outline" size={20} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

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

        {/* Audio Coach Toggle */}
        <TouchableOpacity
          style={s.coachToggle}
          onPress={() => setAudioCoachEnabled(!audioCoachEnabled)}
        >
          <Ionicons
            name={audioCoachEnabled ? 'volume-high' : 'volume-mute'}
            size={20}
            color={audioCoachEnabled ? colors.accent : colors.textTertiary}
          />
          <Text style={[s.coachToggleText, !audioCoachEnabled && { color: colors.textTertiary }]}>
            Audio Coach {audioCoachEnabled ? 'On' : 'Off'}
          </Text>
        </TouchableOpacity>

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
    const avgPace = state.distanceMiles > 0 ? Math.round(state.elapsedMs / 1000 / state.distanceMiles) : 0;
    const firstPoint = state.points.length > 0 ? state.points[0] : null;
    const bestSplit = state.splits.length > 0
      ? state.splits.reduce((best, sp) => sp.paceSeconds < best.paceSeconds ? sp : best, state.splits[0])
      : null;

    return (
      <ScrollView style={s.container} contentContainerStyle={s.summaryContent}>
        {/* PR Badge */}
        {isPR && (
          <View style={s.prBanner}>
            <Ionicons name="trophy" size={20} color="#F59E0B" />
            <Text style={s.prBannerText}>
              New {prType?.replace('_', ' ').toUpperCase()} PR!
            </Text>
            <Ionicons name="trophy" size={20} color="#F59E0B" />
          </View>
        )}

        <Text style={s.summaryTitle}>
          {isPR ? 'PERSONAL RECORD' : 'RUN COMPLETE'}
        </Text>

        {/* Hero distance */}
        <View style={s.summaryHero}>
          <Text style={s.heroDistance}>{state.distanceMiles.toFixed(2)}</Text>
          <Text style={s.heroUnit}>miles</Text>
        </View>

        {/* Stat trio */}
        <View style={s.summaryStats}>
          <View style={s.summaryStat}>
            <Text style={s.summaryStatValue}>{formatDuration(state.elapsedMs)}</Text>
            <Text style={s.summaryStatLabel}>TIME</Text>
          </View>
          <View style={s.summaryStatDivider} />
          <View style={s.summaryStat}>
            <Text style={s.summaryStatValue}>{formatPace(avgPace)}</Text>
            <Text style={s.summaryStatLabel}>AVG PACE</Text>
          </View>
          <View style={s.summaryStatDivider} />
          <View style={s.summaryStat}>
            <Text style={s.summaryStatValue}>{Math.round(state.elevationGainFt)}'</Text>
            <Text style={s.summaryStatLabel}>ELEV GAIN</Text>
          </View>
        </View>

        {/* Route map with pace coloring */}
        {firstPoint && state.points.length > 2 && Platform.OS !== 'web' && (
          <View style={s.summaryMapContainer}>
            <MapView
              style={s.summaryMap}
              region={{
                latitude: firstPoint.latitude, longitude: firstPoint.longitude,
                latitudeDelta: 0.02, longitudeDelta: 0.02,
              }}
              scrollEnabled={false} zoomEnabled={false}
              pitchEnabled={false} rotateEnabled={false}
              mapType="standard"
            >
              <PacePolyline
                points={state.points}
                targetPaceSeconds={planned?.target_pace_seconds || null}
                strokeWidth={5}
              />
            </MapView>
          </View>
        )}

        {/* Splits table */}
        {state.splits.length > 0 && (
          <View style={[s.card, { width: '100%' }]}>
            <Text style={s.cardLabel}>SPLITS</Text>
            {state.splits.map(sp => {
              const isBest = bestSplit && sp.mileNumber === bestSplit.mileNumber;
              const paceDeviation = avgPace > 0 ? sp.paceSeconds - avgPace : 0;
              return (
                <View key={sp.mileNumber} style={s.splitRow}>
                  <Text style={s.splitMile}>Mile {sp.mileNumber}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    {isBest && <Ionicons name="flash" size={14} color="#F59E0B" />}
                    <Text style={[
                      s.splitPace,
                      paceDeviation < -5 && { color: '#10B981' },
                      paceDeviation > 10 && { color: '#EF4444' },
                    ]}>
                      {formatPace(sp.paceSeconds)}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {/* Coach feedback */}
        {feedback && (
          <View style={[s.card, { width: '100%' }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: spacing.md }}>
              <Ionicons name="chatbubble-ellipses" size={16} color={colors.accent} />
              <Text style={s.cardLabel}>COACH</Text>
            </View>
            <Text style={s.feedbackText}>{feedback}</Text>
          </View>
        )}

        {/* RPE pill */}
        <View style={s.rpeSummaryPill}>
          <Text style={s.rpeSummaryText}>RPE {selectedRPE}/10</Text>
        </View>

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
          showsUserLocation mapType="standard"
        >
          <PacePolyline
            points={points}
            targetPaceSeconds={planned?.target_pace_seconds || null}
          />
        </MapView>
      ) : (
        <View style={s.mapPlaceholder}>
          <Ionicons name="navigate" size={32} color={colors.accent} />
          <Text style={s.mapPlaceholderText}>Acquiring GPS...</Text>
        </View>
      )}

      {/* Segment progress bar */}
      {segments.length > 0 && phase === 'active' && (() => {
        const totalMin = segments.reduce((sum: number, seg: any) => sum + (seg.minutes || 0), 0);
        const { index: segIdx, segment: curSeg, segmentElapsedMs, segmentRemainingMs } = getCurrentSegment(
          segments as PlannedSegment[], elapsedMs,
        );
        const segProgress = curSeg ? segmentElapsedMs / (curSeg.minutes * 60 * 1000) : 0;
        return (
          <View style={s.segProgressContainer}>
            <View style={s.segProgressBar}>
              {segments.map((seg: any, i: number) => {
                const widthPct = totalMin > 0 ? (seg.minutes / totalMin) * 100 : 0;
                const segColor = seg.type === 'warmup' || seg.type === 'cooldown' ? colors.textTertiary
                  : seg.type === 'work' ? runTypeColor : colors.info;
                const isActive = i === segIdx;
                const isDone = i < segIdx;
                return (
                  <View key={i} style={[s.segBlock, { width: `${widthPct}%` as any }]}>
                    <View style={[
                      s.segFill,
                      { backgroundColor: segColor, opacity: isDone ? 1 : isActive ? 0.8 : 0.25 },
                      isActive && { width: `${Math.min(segProgress * 100, 100)}%` as any },
                      isDone && { width: '100%' },
                      !isDone && !isActive && { width: '100%' },
                    ]} />
                  </View>
                );
              })}
            </View>
            {curSeg && (
              <Text style={s.segProgressLabel}>
                {curSeg.type === 'warmup' ? 'WARM UP' : curSeg.type === 'cooldown' ? 'COOL DOWN' : curSeg.type.toUpperCase()}
                {'  '}
                {Math.ceil((segmentRemainingMs || 0) / 1000)}s left
              </Text>
            )}
          </View>
        );
      })()}

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
  preHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.lg },
  screenTitle: { ...typography.title1, color: colors.text },
  historyBtn: { padding: spacing.sm },

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

  coachToggle: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
    paddingVertical: spacing.md, marginTop: spacing.sm,
  },
  coachToggleText: { ...typography.caption, color: colors.accent },

  startBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
    paddingVertical: 18, borderRadius: radius.lg, marginTop: spacing.sm,
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

  segProgressContainer: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, backgroundColor: colors.bg },
  segProgressBar: { flexDirection: 'row', height: 6, borderRadius: 3, overflow: 'hidden', gap: 2 },
  segBlock: { height: '100%', borderRadius: 3, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.05)' },
  segFill: { height: '100%', borderRadius: 3 },
  segProgressLabel: { ...typography.micro, color: colors.textTertiary, marginTop: 4, textAlign: 'center' },

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
  prBanner: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: 'rgba(245, 158, 11, 0.1)', borderRadius: radius.pill,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, marginBottom: spacing.md,
    borderWidth: 1, borderColor: 'rgba(245, 158, 11, 0.3)',
  },
  prBannerText: { fontSize: 14, fontWeight: '700', color: '#F59E0B', letterSpacing: 1 },
  summaryTitle: { ...typography.micro, color: colors.success, letterSpacing: 2, textTransform: 'uppercase', marginBottom: spacing.lg },
  summaryHero: { flexDirection: 'row', alignItems: 'baseline', marginBottom: spacing.xl },
  heroDistance: { fontSize: 72, fontWeight: '200', color: colors.text, fontVariant: ['tabular-nums'] },
  heroUnit: { ...typography.title2, color: colors.textTertiary, marginLeft: spacing.sm },
  summaryStats: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.xl, width: '100%', justifyContent: 'space-around' },
  summaryStat: { alignItems: 'center' },
  summaryStatValue: { fontSize: 20, fontWeight: '600', color: colors.text, fontVariant: ['tabular-nums'] },
  summaryStatLabel: { ...typography.micro, color: colors.textTertiary, marginTop: 4 },
  summaryStatDivider: { width: 1, height: 28, backgroundColor: colors.border },
  summaryMapContainer: {
    width: '100%', height: 200, borderRadius: radius.lg, overflow: 'hidden',
    marginBottom: spacing.lg, borderWidth: 1, borderColor: colors.border,
  },
  summaryMap: { width: '100%', height: '100%' },
  rpeSummaryPill: {
    backgroundColor: colors.card, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, marginBottom: spacing.md,
  },
  rpeSummaryText: { ...typography.caption, color: colors.textSecondary },

  splitRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  splitMile: { ...typography.body, color: colors.textSecondary },
  splitPace: { ...typography.bodyBold, color: colors.text },

  feedbackText: { ...typography.body, color: colors.textSecondary, lineHeight: 22 },

  doneBtn: { backgroundColor: colors.accent, borderRadius: radius.lg, paddingVertical: 18, paddingHorizontal: spacing.xxl, marginTop: spacing.lg },
  doneBtnText: { ...typography.bodyBold, color: '#fff' },
});
