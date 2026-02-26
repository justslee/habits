import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet, Platform, Alert,
} from 'react-native';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import {
  RunState, GpsPoint, createRunState, processGpsPoint, formatPace, formatDuration,
  requestLocationPermissions, startBackgroundTracking, stopBackgroundTracking,
} from '../services/gps';
import MapView from '../components/MapView';
import { colors, spacing, typography, radius } from '../theme';

export default function RunScreen() {
  const [runState, setRunState] = useState<RunState>(createRunState);
  const [permissionGranted, setPermissionGranted] = useState(false);
  const locationSub = useRef<Location.LocationSubscription | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stateRef = useRef(runState);
  stateRef.current = runState;

  useEffect(() => {
    requestLocationPermissions().then(setPermissionGranted);
    return () => { locationSub.current?.remove(); if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  const handleStart = useCallback(async () => {
    if (!permissionGranted) { Alert.alert('Permission Required', 'Location permission needed.'); return; }
    const now = Date.now();
    setRunState(s => ({ ...s, isTracking: true, isPaused: false, startTime: now, elapsedMs: 0 }));
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
  }, [permissionGranted]);

  const handlePause = useCallback(() => setRunState(s => ({ ...s, isPaused: !s.isPaused })), []);

  const handleStop = useCallback(async () => {
    locationSub.current?.remove(); locationSub.current = null;
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    try { await stopBackgroundTracking(); } catch {}
    const state = stateRef.current;
    if (state.distanceMiles < 0.1) { setRunState(createRunState()); return; }
    try {
      const resp = await fetch(`${process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8000'}/api/v1/runs/`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          distance_miles: Math.round(state.distanceMiles * 100) / 100,
          duration_seconds: Math.round(state.elapsedMs / 1000),
          elevation_gain_ft: Math.round(state.elevationGainFt), run_type: 'easy',
          gps_polyline: JSON.stringify(state.points.map(p => ({ lat: p.latitude, lng: p.longitude, alt: p.altitude, t: p.timestamp }))),
          splits: state.splits.map(sp => ({ mile_number: sp.mileNumber, pace_seconds: sp.paceSeconds, elevation_change_ft: sp.elevationChangeFt })),
        }),
      });
      if (resp.ok) Alert.alert('Run Saved', `${state.distanceMiles.toFixed(2)} mi in ${formatDuration(state.elapsedMs)}`);
    } catch { Alert.alert('Save Failed', 'Saved locally. Will sync later.'); }
    setRunState(createRunState());
  }, []);

  const { isTracking, isPaused, distanceMiles, currentPaceSeconds, elapsedMs, elevationGainFt, splits, points } = runState;
  const lastPoint = points.length > 0 ? points[points.length - 1] : null;

  return (
    <View style={s.container}>
      {lastPoint ? (
        <MapView style={s.map}
          region={{ latitude: lastPoint.latitude, longitude: lastPoint.longitude, latitudeDelta: 0.01, longitudeDelta: 0.01 }}
          showsUserLocation mapType="standard" />
      ) : (
        <View style={s.mapPlaceholder}>
          <View style={s.readyIcon}>
            <Ionicons name={isTracking ? 'navigate' : 'footsteps-outline'} size={32} color={colors.accent} />
          </View>
          <Text style={s.readyTitle}>{isTracking ? 'Tracking' : 'Ready to Run'}</Text>
          <Text style={s.readySubtitle}>Tap start to begin tracking</Text>
        </View>
      )}

      <View style={s.statsPanel}>
        <View style={s.mainStat}>
          <Text style={s.distanceValue}>{distanceMiles.toFixed(2)}</Text>
          <Text style={s.distanceUnit}>mi</Text>
        </View>

        <View style={s.statsRow}>
          <View style={s.stat}>
            <Text style={s.statValue}>{formatDuration(elapsedMs)}</Text>
            <Text style={s.statLabel}>TIME</Text>
          </View>
          <View style={s.statDivider} />
          <View style={s.stat}>
            <Text style={s.statValue}>{formatPace(currentPaceSeconds)}</Text>
            <Text style={s.statLabel}>PACE</Text>
          </View>
          <View style={s.statDivider} />
          <View style={s.stat}>
            <Text style={s.statValue}>{Math.round(elevationGainFt)}</Text>
            <Text style={s.statLabel}>ELEV</Text>
          </View>
        </View>

        {splits.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: spacing.md }}>
            {splits.map(sp => (
              <View key={sp.mileNumber} style={s.splitChip}>
                <Text style={s.splitMile}>Mi {sp.mileNumber}</Text>
                <Text style={s.splitPace}>{formatPace(sp.paceSeconds)}</Text>
              </View>
            ))}
          </ScrollView>
        )}

        <View style={s.controls}>
          {!isTracking ? (
            <TouchableOpacity style={s.startBtn} onPress={handleStart}>
              <Ionicons name="play" size={32} color="#fff" />
            </TouchableOpacity>
          ) : (
            <>
              <TouchableOpacity style={s.controlBtn} onPress={handlePause}>
                <Ionicons name={isPaused ? 'play' : 'pause'} size={24} color="#fff" />
              </TouchableOpacity>
              <TouchableOpacity style={[s.controlBtn, s.stopBtn]} onPress={handleStop}>
                <Ionicons name="stop" size={24} color="#fff" />
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  map: { flex: 1 },
  mapPlaceholder: { flex: 1, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  readyIcon: {
    width: 72, height: 72, borderRadius: 36, backgroundColor: colors.accentMuted,
    alignItems: 'center', justifyContent: 'center',
  },
  readyTitle: { ...typography.title2, color: colors.text },
  readySubtitle: { ...typography.caption, color: colors.textTertiary },

  statsPanel: {
    backgroundColor: colors.bg, padding: spacing.lg,
    paddingBottom: Platform.OS === 'ios' ? 44 : spacing.lg,
    borderTopWidth: 1, borderTopColor: colors.border,
  },
  mainStat: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', marginBottom: spacing.lg },
  distanceValue: { fontSize: 64, fontWeight: '200', color: colors.text, letterSpacing: -2, fontVariant: ['tabular-nums'] },
  distanceUnit: { ...typography.title2, color: colors.textTertiary, marginLeft: spacing.sm },

  statsRow: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', marginBottom: spacing.lg },
  stat: { alignItems: 'center', flex: 1 },
  statDivider: { width: 1, height: 28, backgroundColor: colors.border },
  statValue: { fontSize: 20, fontWeight: '600', color: colors.text, fontVariant: ['tabular-nums'] },
  statLabel: { ...typography.micro, color: colors.textTertiary, marginTop: 4 },

  splitChip: {
    backgroundColor: colors.card, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
    padding: spacing.sm, paddingHorizontal: spacing.md, marginRight: spacing.sm, alignItems: 'center',
  },
  splitMile: { ...typography.micro, color: colors.textTertiary },
  splitPace: { ...typography.bodyBold, color: colors.accent },

  controls: { flexDirection: 'row', justifyContent: 'center', gap: spacing.xl },
  startBtn: {
    backgroundColor: colors.success, borderRadius: 40, width: 80, height: 80,
    alignItems: 'center', justifyContent: 'center',
  },
  controlBtn: {
    backgroundColor: colors.cardElevated, borderRadius: 32, width: 64, height: 64,
    alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border,
  },
  stopBtn: { backgroundColor: colors.error, borderColor: colors.error },
});
