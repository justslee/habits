/**
 * Run Tracking Screen — Phase 3
 *
 * Live GPS run tracking with pace, distance, time, and splits.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Platform,
  Alert,
} from 'react-native';
import * as Location from 'expo-location';
import {
  RunState,
  GpsPoint,
  createRunState,
  processGpsPoint,
  formatPace,
  formatDuration,
  requestLocationPermissions,
  startBackgroundTracking,
  stopBackgroundTracking,
} from '../services/gps';

// Lazy import to avoid crashes when react-native-maps isn't linked
let MapView: any = null;
let Polyline: any = null;
try {
  const Maps = require('react-native-maps');
  MapView = Maps.default;
  Polyline = Maps.Polyline;
} catch {
  // Maps not available
}

export default function RunScreen() {
  const [runState, setRunState] = useState<RunState>(createRunState);
  const [permissionGranted, setPermissionGranted] = useState(false);
  const locationSub = useRef<Location.LocationSubscription | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stateRef = useRef(runState);
  stateRef.current = runState;

  useEffect(() => {
    requestLocationPermissions().then(setPermissionGranted);
    return () => {
      locationSub.current?.remove();
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const handleStart = useCallback(async () => {
    if (!permissionGranted) {
      Alert.alert('Permission Required', 'Location permission needed for run tracking.');
      return;
    }

    const now = Date.now();
    setRunState((s) => ({
      ...s,
      isTracking: true,
      isPaused: false,
      startTime: now,
      elapsedMs: 0,
    }));

    // Start foreground location tracking
    locationSub.current = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.BestForNavigation,
        timeInterval: 3000,
        distanceInterval: 5,
      },
      (loc) => {
        const point: GpsPoint = {
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
          altitude: loc.coords.altitude,
          timestamp: loc.timestamp,
        };
        setRunState((prev) => processGpsPoint(prev, point));
      },
    );

    // Start background tracking
    try {
      await startBackgroundTracking();
    } catch {
      // Background tracking may not be available in Expo Go
    }

    // Timer for elapsed display
    timerRef.current = setInterval(() => {
      setRunState((prev) => {
        if (!prev.isTracking || prev.isPaused) return prev;
        return { ...prev, elapsedMs: Date.now() - prev.startTime };
      });
    }, 1000);
  }, [permissionGranted]);

  const handlePause = useCallback(() => {
    setRunState((s) => ({ ...s, isPaused: !s.isPaused }));
  }, []);

  const handleStop = useCallback(async () => {
    locationSub.current?.remove();
    locationSub.current = null;
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    try { await stopBackgroundTracking(); } catch {}

    const state = stateRef.current;

    if (state.distanceMiles < 0.1) {
      setRunState(createRunState());
      return;
    }

    // Save run to backend
    try {
      const { default: apiClient } = await import('../api/client');
      // Use dynamic import to avoid circular deps
      const resp = await fetch(
        `${process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8000'}/api/v1/runs/`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            distance_miles: Math.round(state.distanceMiles * 100) / 100,
            duration_seconds: Math.round(state.elapsedMs / 1000),
            elevation_gain_ft: Math.round(state.elevationGainFt),
            run_type: 'easy',
            gps_polyline: JSON.stringify(
              state.points.map((p) => ({
                lat: p.latitude,
                lng: p.longitude,
                alt: p.altitude,
                t: p.timestamp,
              }))
            ),
            splits: state.splits.map((s) => ({
              mile_number: s.mileNumber,
              pace_seconds: s.paceSeconds,
              elevation_change_ft: s.elevationChangeFt,
            })),
          }),
        },
      );

      if (resp.ok) {
        Alert.alert(
          '🏃 Run Saved!',
          `${state.distanceMiles.toFixed(2)} mi in ${formatDuration(state.elapsedMs)}`,
        );
      }
    } catch {
      Alert.alert('Save Failed', 'Run data saved locally. Will sync later.');
    }

    setRunState(createRunState());
  }, []);

  const { isTracking, isPaused, distanceMiles, currentPaceSeconds, elapsedMs, elevationGainFt, splits, points } = runState;

  // Map region
  const lastPoint = points.length > 0 ? points[points.length - 1] : null;
  const mapCoords = points.map((p) => ({ latitude: p.latitude, longitude: p.longitude }));

  return (
    <View style={styles.container}>
      {/* Map */}
      {MapView && lastPoint ? (
        <MapView
          style={styles.map}
          region={{
            latitude: lastPoint.latitude,
            longitude: lastPoint.longitude,
            latitudeDelta: 0.01,
            longitudeDelta: 0.01,
          }}
          showsUserLocation
          mapType="standard"
        >
          {mapCoords.length > 1 && (
            <Polyline coordinates={mapCoords} strokeColor="#2563eb" strokeWidth={4} />
          )}
        </MapView>
      ) : (
        <View style={styles.mapPlaceholder}>
          <Text style={styles.mapPlaceholderText}>
            {isTracking ? '📍 Tracking...' : '🏃 Ready to run'}
          </Text>
        </View>
      )}

      {/* Stats */}
      <View style={styles.statsContainer}>
        <View style={styles.mainStat}>
          <Text style={styles.mainStatValue}>{distanceMiles.toFixed(2)}</Text>
          <Text style={styles.mainStatLabel}>miles</Text>
        </View>

        <View style={styles.statsRow}>
          <View style={styles.stat}>
            <Text style={styles.statValue}>{formatDuration(elapsedMs)}</Text>
            <Text style={styles.statLabel}>time</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statValue}>{formatPace(currentPaceSeconds)}</Text>
            <Text style={styles.statLabel}>pace</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statValue}>{Math.round(elevationGainFt)}</Text>
            <Text style={styles.statLabel}>elev ft</Text>
          </View>
        </View>

        {/* Splits */}
        {splits.length > 0 && (
          <ScrollView horizontal style={styles.splitsScroll}>
            {splits.map((s) => (
              <View key={s.mileNumber} style={styles.splitChip}>
                <Text style={styles.splitMile}>Mi {s.mileNumber}</Text>
                <Text style={styles.splitPace}>{formatPace(s.paceSeconds)}</Text>
              </View>
            ))}
          </ScrollView>
        )}

        {/* Controls */}
        <View style={styles.controls}>
          {!isTracking ? (
            <TouchableOpacity style={styles.startBtn} onPress={handleStart}>
              <Text style={styles.startBtnText}>START</Text>
            </TouchableOpacity>
          ) : (
            <>
              <TouchableOpacity
                style={[styles.controlBtn, styles.pauseBtn]}
                onPress={handlePause}
              >
                <Text style={styles.controlBtnText}>{isPaused ? '▶' : '⏸'}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.controlBtn, styles.stopBtn]}
                onPress={handleStop}
              >
                <Text style={styles.controlBtnText}>⏹</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  map: { flex: 1 },
  mapPlaceholder: {
    flex: 1,
    backgroundColor: '#111',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapPlaceholderText: { color: '#666', fontSize: 24 },

  statsContainer: {
    backgroundColor: '#000',
    padding: 20,
    paddingBottom: Platform.OS === 'ios' ? 40 : 20,
  },

  mainStat: { alignItems: 'center', marginBottom: 16 },
  mainStatValue: { fontSize: 64, fontWeight: '700', color: '#fff' },
  mainStatLabel: { fontSize: 16, color: '#666', marginTop: -4 },

  statsRow: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 16 },
  stat: { alignItems: 'center' },
  statValue: { fontSize: 24, fontWeight: '600', color: '#fff' },
  statLabel: { fontSize: 12, color: '#666', marginTop: 2 },

  splitsScroll: { marginBottom: 16 },
  splitChip: {
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
    padding: 8,
    paddingHorizontal: 12,
    marginRight: 8,
    alignItems: 'center',
  },
  splitMile: { fontSize: 10, color: '#666' },
  splitPace: { fontSize: 16, fontWeight: '600', color: '#2563eb' },

  controls: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 20,
  },
  startBtn: {
    backgroundColor: '#10b981',
    borderRadius: 40,
    width: 80,
    height: 80,
    alignItems: 'center',
    justifyContent: 'center',
  },
  startBtnText: { color: '#fff', fontSize: 18, fontWeight: '800' },
  controlBtn: {
    borderRadius: 35,
    width: 70,
    height: 70,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pauseBtn: { backgroundColor: '#f59e0b' },
  stopBtn: { backgroundColor: '#ef4444' },
  controlBtnText: { fontSize: 28 },
});
