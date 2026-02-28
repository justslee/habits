/**
 * GPS Run Tracking Service — Phase 3
 *
 * Handles background location tracking, distance/pace calculation,
 * and split detection.
 */

import { Platform } from 'react-native';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';

const LOCATION_TASK = 'background-run-tracking';

export interface GpsPoint {
  latitude: number;
  longitude: number;
  altitude: number | null;
  timestamp: number;
}

export interface RunState {
  isTracking: boolean;
  isPaused: boolean;
  startTime: number;
  elapsedMs: number;
  pausedMs: number;
  distanceMiles: number;
  currentPaceSeconds: number | null; // sec/mile
  currentSpeedMph: number;
  elevationGainFt: number;
  points: GpsPoint[];
  splits: SplitData[];
  /** Elapsed time at the last mile boundary (for accurate split calculation). */
  lastSplitElapsedMs: number;
  /** Elevation at the last mile boundary. */
  lastSplitElevationFt: number;
  /** Auto-pause tracking. */
  autoPausedAt: number | null;
}

export interface SplitData {
  mileNumber: number;
  paceSeconds: number;
  elevationChangeFt: number;
}

const METERS_TO_MILES = 0.000621371;
const METERS_TO_FEET = 3.28084;

/**
 * Calculate distance between two GPS points using Haversine formula.
 */
function haversineMeters(
  lat1: number, lon1: number,
  lat2: number, lon2: number,
): number {
  const R = 6371000; // Earth radius in meters
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Request location permissions.
 */
export async function requestLocationPermissions(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  const { status: fg } = await Location.requestForegroundPermissionsAsync();
  if (fg !== 'granted') return false;

  const { status: bg } = await Location.requestBackgroundPermissionsAsync();
  return bg === 'granted';
}

/**
 * Create a new empty run state.
 */
/** Speed threshold for auto-pause in mph (~0.5 m/s walking pace). */
const AUTO_PAUSE_SPEED_MPH = 1.0;
/** Minimum speed to resume from auto-pause. */
const AUTO_RESUME_SPEED_MPH = 1.5;

export function createRunState(): RunState {
  return {
    isTracking: false,
    isPaused: false,
    startTime: 0,
    elapsedMs: 0,
    pausedMs: 0,
    distanceMiles: 0,
    currentPaceSeconds: null,
    currentSpeedMph: 0,
    elevationGainFt: 0,
    points: [],
    splits: [],
    lastSplitElapsedMs: 0,
    lastSplitElevationFt: 0,
    autoPausedAt: null,
  };
}

/**
 * Process a new GPS point and update run state.
 */
export function processGpsPoint(state: RunState, point: GpsPoint): RunState {
  const newState = { ...state };
  const prevPoint = state.points.length > 0 ? state.points[state.points.length - 1] : null;

  // Mutate the points array in-place to avoid O(n) copy every GPS tick
  state.points.push(point);
  newState.points = state.points;

  if (prevPoint) {
    // Distance
    const distMeters = haversineMeters(
      prevPoint.latitude, prevPoint.longitude,
      point.latitude, point.longitude,
    );

    // Instantaneous speed (mph)
    const dtSec = (point.timestamp - prevPoint.timestamp) / 1000;
    const speedMph = dtSec > 0 ? (distMeters * METERS_TO_MILES) / (dtSec / 3600) : 0;
    newState.currentSpeedMph = speedMph;

    // Auto-pause detection
    if (state.autoPausedAt === null && speedMph < AUTO_PAUSE_SPEED_MPH && state.points.length > 5) {
      // Trigger auto-pause
      newState.autoPausedAt = point.timestamp;
    } else if (state.autoPausedAt !== null && speedMph > AUTO_RESUME_SPEED_MPH) {
      // Resume from auto-pause — accumulate paused time
      newState.pausedMs = state.pausedMs + (point.timestamp - state.autoPausedAt);
      newState.autoPausedAt = null;
    }

    // Only accumulate distance when not auto-paused
    if (state.autoPausedAt === null) {
      newState.distanceMiles = state.distanceMiles + distMeters * METERS_TO_MILES;
    }

    // Elevation gain (always track)
    if (point.altitude !== null && prevPoint.altitude !== null) {
      const elevDiff = (point.altitude - prevPoint.altitude) * METERS_TO_FEET;
      if (elevDiff > 0) {
        newState.elevationGainFt = state.elevationGainFt + elevDiff;
      }
    }

    // Current pace (rolling ~30 second window) — scan from end to avoid O(n) filter
    const recentPoints: GpsPoint[] = [];
    for (let i = newState.points.length - 2; i >= 0; i--) {
      const dt = point.timestamp - newState.points[i].timestamp;
      if (dt > 30000) break;
      if (dt > 0) recentPoints.unshift(newState.points[i]);
    }
    if (recentPoints.length > 0) {
      const first = recentPoints[0];
      const segDist = haversineMeters(
        first.latitude, first.longitude,
        point.latitude, point.longitude,
      ) * METERS_TO_MILES;
      const segTime = (point.timestamp - first.timestamp) / 1000;
      if (segDist > 0.01) {
        newState.currentPaceSeconds = Math.round(segTime / segDist);
      }
    }
  }

  // Elapsed time (subtract accumulated paused time)
  if (state.startTime > 0 && !state.isPaused) {
    newState.elapsedMs = point.timestamp - state.startTime - newState.pausedMs;
  }

  // Split detection — calculate pace for THIS mile only
  const prevMile = Math.floor(state.distanceMiles);
  const currentMile = Math.floor(newState.distanceMiles);
  if (currentMile > prevMile && currentMile > 0) {
    const splitElapsedMs = newState.elapsedMs - state.lastSplitElapsedMs;
    // Each split is exactly 1 mile, so pace = time for that mile
    const splitPace = Math.round(splitElapsedMs / 1000);
    const splitElevChange = newState.elevationGainFt - state.lastSplitElevationFt;

    const splitData: SplitData = {
      mileNumber: currentMile,
      paceSeconds: splitPace,
      elevationChangeFt: Math.round(splitElevChange),
    };
    newState.splits = [...state.splits, splitData];
    newState.lastSplitElapsedMs = newState.elapsedMs;
    newState.lastSplitElevationFt = newState.elevationGainFt;
  }

  return newState;
}

/**
 * Format seconds as M:SS pace.
 */
export function formatPace(seconds: number | null): string {
  if (!seconds || seconds <= 0 || seconds > 3600) return '--:--';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/**
 * Format milliseconds as H:MM:SS or MM:SS.
 */
export function formatDuration(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/**
 * Define background location task.
 */
// Only define background task on native (crashes on web)
if (Platform.OS !== 'web') {
  TaskManager.defineTask(LOCATION_TASK, ({ data, error }: any) => {
    if (error) return;
    if (data?.locations) {
      const locations = data.locations as Location.LocationObject[];
      (globalThis as any).__backgroundLocations = [
        ...((globalThis as any).__backgroundLocations || []),
        ...locations.map((l: Location.LocationObject) => ({
          latitude: l.coords.latitude,
          longitude: l.coords.longitude,
          altitude: l.coords.altitude,
          timestamp: l.timestamp,
        })),
      ];
    }
  });
}

/**
 * Start background location tracking.
 */
export async function startBackgroundTracking(): Promise<void> {
  if (Platform.OS === 'web') return;
  await Location.startLocationUpdatesAsync(LOCATION_TASK, {
    accuracy: Location.Accuracy.High,
    timeInterval: 3000,
    distanceInterval: 5, // meters
    showsBackgroundLocationIndicator: true,
    foregroundService: {
      notificationTitle: 'Run in progress',
      notificationBody: 'Tracking your run...',
    },
  });
}

/**
 * Stop background location tracking.
 */
export async function stopBackgroundTracking(): Promise<void> {
  if (Platform.OS === 'web') return;
  const isTracking = await TaskManager.isTaskRegisteredAsync(LOCATION_TASK);
  if (isTracking) {
    await Location.stopLocationUpdatesAsync(LOCATION_TASK);
  }
}

/**
 * Subscribe to foreground location updates.
 * Returns a subscription handle — call .remove() to unsubscribe.
 */
export async function watchLocation(
  onPoint: (point: GpsPoint) => void,
): Promise<{ remove: () => void }> {
  if (Platform.OS === 'web') return { remove: () => {} };
  const sub = await Location.watchPositionAsync(
    { accuracy: Location.Accuracy.High, timeInterval: 3000, distanceInterval: 5 },
    loc => {
      onPoint({
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
        altitude: loc.coords.altitude,
        timestamp: loc.timestamp,
      });
    },
  );
  return sub;
}

/**
 * Consume any background location points that were collected while the screen was locked.
 * Returns the points and clears the buffer.
 */
export function consumeBackgroundPoints(): GpsPoint[] {
  const pts = (globalThis as any).__backgroundLocations || [];
  (globalThis as any).__backgroundLocations = [];
  return pts;
}
