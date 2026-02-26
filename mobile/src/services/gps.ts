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
  distanceMiles: number;
  currentPaceSeconds: number | null; // sec/mile
  elevationGainFt: number;
  points: GpsPoint[];
  splits: SplitData[];
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
export function createRunState(): RunState {
  return {
    isTracking: false,
    isPaused: false,
    startTime: 0,
    elapsedMs: 0,
    distanceMiles: 0,
    currentPaceSeconds: null,
    elevationGainFt: 0,
    points: [],
    splits: [],
  };
}

/**
 * Process a new GPS point and update run state.
 */
export function processGpsPoint(state: RunState, point: GpsPoint): RunState {
  const newState = { ...state };
  const prevPoint = state.points.length > 0 ? state.points[state.points.length - 1] : null;

  newState.points = [...state.points, point];

  if (prevPoint) {
    // Distance
    const distMeters = haversineMeters(
      prevPoint.latitude, prevPoint.longitude,
      point.latitude, point.longitude,
    );
    newState.distanceMiles = state.distanceMiles + distMeters * METERS_TO_MILES;

    // Elevation gain
    if (point.altitude !== null && prevPoint.altitude !== null) {
      const elevDiff = (point.altitude - prevPoint.altitude) * METERS_TO_FEET;
      if (elevDiff > 0) {
        newState.elevationGainFt = state.elevationGainFt + elevDiff;
      }
    }

    // Current pace (rolling ~30 second window)
    const recentPoints = newState.points.filter(
      (p) => point.timestamp - p.timestamp < 30000 && point.timestamp - p.timestamp > 0
    );
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

  // Elapsed time
  if (state.startTime > 0 && !state.isPaused) {
    newState.elapsedMs = point.timestamp - state.startTime;
  }

  // Split detection
  const prevMile = Math.floor(state.distanceMiles);
  const currentMile = Math.floor(newState.distanceMiles);
  if (currentMile > prevMile && currentMile > 0) {
    // Crossed a mile boundary
    const splitPace = newState.elapsedMs > 0
      ? Math.round((newState.elapsedMs / 1000) / newState.distanceMiles)
      : 0;

    // Calculate this split's pace more precisely using points near mile boundaries
    const splitData: SplitData = {
      mileNumber: currentMile,
      paceSeconds: splitPace,
      elevationChangeFt: 0, // simplified for now
    };
    newState.splits = [...state.splits, splitData];
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
    accuracy: Location.Accuracy.BestForNavigation,
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
