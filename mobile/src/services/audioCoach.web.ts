/**
 * Audio Coach — Web stub (no speech/haptics on web)
 */

export interface PlannedSegment {
  type: string;
  minutes: number;
  pace?: string;
}

export interface CoachConfig {
  enabled: boolean;
  targetPaceSeconds: number | null;
  runType: string;
  segments: PlannedSegment[];
  targetDistanceMiles: number | null;
}

interface CoachState {
  lastAnnouncedMile: number;
  lastSegmentIndex: number;
  announcedHalfway: boolean;
  announcedFinalMile: boolean;
  lastPaceWarningTime: number;
  segmentStartTime: number;
  countdownAnnounced: Set<number>;
}

export function createCoachState(): CoachState {
  return {
    lastAnnouncedMile: 0, lastSegmentIndex: -1, announcedHalfway: false,
    announcedFinalMile: false, lastPaceWarningTime: 0, segmentStartTime: 0,
    countdownAnnounced: new Set(),
  };
}

export function getCurrentSegment(
  segments: PlannedSegment[], elapsedMs: number,
): { index: number; segment: PlannedSegment | null; segmentElapsedMs: number; segmentRemainingMs: number } {
  if (segments.length === 0) return { index: -1, segment: null, segmentElapsedMs: 0, segmentRemainingMs: 0 };
  let accumulated = 0;
  for (let i = 0; i < segments.length; i++) {
    const segMs = segments[i].minutes * 60 * 1000;
    if (elapsedMs < accumulated + segMs) {
      return { index: i, segment: segments[i], segmentElapsedMs: elapsedMs - accumulated, segmentRemainingMs: accumulated + segMs - elapsedMs };
    }
    accumulated += segMs;
  }
  return { index: segments.length - 1, segment: segments[segments.length - 1], segmentElapsedMs: 0, segmentRemainingMs: 0 };
}

export function coachTick(_runState: any, _config: CoachConfig, state: CoachState): CoachState {
  return state;
}

export function announceStart(_config: CoachConfig): void {}
export function announceFinish(_runState: any): void {}
