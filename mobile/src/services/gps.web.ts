/**
 * GPS Service — Web stub (no location tracking on web)
 */

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
  currentPaceSeconds: number | null;
  currentSpeedMph: number;
  elevationGainFt: number;
  points: GpsPoint[];
  splits: SplitData[];
  lastSplitElapsedMs: number;
  lastSplitElevationFt: number;
  autoPausedAt: number | null;
}

export interface SplitData {
  mileNumber: number;
  paceSeconds: number;
  elevationChangeFt: number;
}

export async function requestLocationPermissions(): Promise<boolean> {
  return false;
}

export function createRunState(): RunState {
  return {
    isTracking: false, isPaused: false, startTime: 0, elapsedMs: 0, pausedMs: 0,
    distanceMiles: 0, currentPaceSeconds: null, currentSpeedMph: 0, elevationGainFt: 0,
    points: [], splits: [], lastSplitElapsedMs: 0, lastSplitElevationFt: 0, autoPausedAt: null,
  };
}

export function processGpsPoint(state: RunState, _point: GpsPoint): RunState {
  return state;
}

export function formatPace(seconds: number | null): string {
  if (!seconds || seconds <= 0 || seconds > 3600) return '--:--';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function formatDuration(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export async function startBackgroundTracking(): Promise<void> {}
export async function stopBackgroundTracking(): Promise<void> {}

export async function watchLocation(
  _onPoint: (point: GpsPoint) => void,
): Promise<{ remove: () => void }> {
  return { remove: () => {} };
}

export function consumeBackgroundPoints(): GpsPoint[] {
  return [];
}
