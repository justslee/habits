/**
 * Audio Run Coach — P4-021
 *
 * Provides spoken cues during runs via expo-speech:
 * - Segment transitions (warmup → work → cooldown)
 * - Mile split announcements
 * - Pace drift warnings
 * - Interval countdowns
 * - Halfway + final mile notifications
 *
 * Designed to mix with music (doesn't pause audio).
 * Works with screen locked via background location task.
 */

import * as Speech from 'expo-speech';
import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';
import { RunState, SplitData, formatPace, formatDuration } from './gps';

export interface PlannedSegment {
  type: string; // warmup, work, cooldown, recovery
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
  countdownAnnounced: Set<number>; // seconds remaining that were announced
}

const VOICE_CONFIG = {
  language: 'en-US',
  pitch: 1.0,
  rate: Platform.OS === 'ios' ? 0.52 : 0.9,
  // iOS: mixWithOthers is default behavior for Speech
};

// Minimum 30s between pace warnings to avoid nagging
const PACE_WARNING_COOLDOWN_MS = 30000;

// Pace tolerance: ±15 seconds per mile before warning
const PACE_TOLERANCE_SECONDS = 15;

export function createCoachState(): CoachState {
  return {
    lastAnnouncedMile: 0,
    lastSegmentIndex: -1,
    announcedHalfway: false,
    announcedFinalMile: false,
    lastPaceWarningTime: 0,
    segmentStartTime: 0,
    countdownAnnounced: new Set(),
  };
}

function speak(text: string): void {
  // Stop any current speech before new announcement
  Speech.stop();
  Speech.speak(text, VOICE_CONFIG);
}

function hapticMile(): void {
  try {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  } catch {}
}

function hapticSegment(): void {
  try {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
  } catch {}
}

/**
 * Get current segment based on elapsed time.
 */
export function getCurrentSegment(
  segments: PlannedSegment[],
  elapsedMs: number,
): { index: number; segment: PlannedSegment | null; segmentElapsedMs: number; segmentRemainingMs: number } {
  if (segments.length === 0) return { index: -1, segment: null, segmentElapsedMs: 0, segmentRemainingMs: 0 };

  let accumulated = 0;
  for (let i = 0; i < segments.length; i++) {
    const segMs = segments[i].minutes * 60 * 1000;
    if (elapsedMs < accumulated + segMs) {
      return {
        index: i,
        segment: segments[i],
        segmentElapsedMs: elapsedMs - accumulated,
        segmentRemainingMs: accumulated + segMs - elapsedMs,
      };
    }
    accumulated += segMs;
  }

  // Past all segments
  return {
    index: segments.length - 1,
    segment: segments[segments.length - 1],
    segmentElapsedMs: elapsedMs - accumulated,
    segmentRemainingMs: 0,
  };
}

/**
 * Format pace for speech (e.g., "8 thirty" for 8:30).
 */
function speakPace(seconds: number): string {
  if (!seconds || seconds <= 0) return '';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (s === 0) return `${m} minute`;
  if (s < 10) return `${m} oh ${s}`;
  return `${m} ${s}`;
}

/**
 * Main coach tick — call this on every GPS update or timer tick.
 * Returns the updated coach state.
 */
export function coachTick(
  runState: RunState,
  config: CoachConfig,
  state: CoachState,
): CoachState {
  if (!config.enabled) return state;

  const newState = { ...state, countdownAnnounced: new Set(state.countdownAnnounced) };
  const now = Date.now();

  // === 1. MILE SPLIT ANNOUNCEMENTS ===
  const currentMile = Math.floor(runState.distanceMiles);
  if (currentMile > state.lastAnnouncedMile && currentMile > 0) {
    newState.lastAnnouncedMile = currentMile;
    hapticMile();

    const lastSplit = runState.splits.length > 0
      ? runState.splits[runState.splits.length - 1]
      : null;

    const avgPace = runState.distanceMiles > 0
      ? Math.round(runState.elapsedMs / 1000 / runState.distanceMiles)
      : 0;

    let msg = `Mile ${currentMile}. `;
    if (lastSplit) {
      msg += `${speakPace(lastSplit.paceSeconds)} pace. `;
    }
    msg += `Total time ${formatDurationForSpeech(runState.elapsedMs)}. `;

    // Compare to target if available
    if (config.targetPaceSeconds && lastSplit) {
      const diff = lastSplit.paceSeconds - config.targetPaceSeconds;
      if (diff < -PACE_TOLERANCE_SECONDS) {
        msg += `You're running fast. Ease up. `;
      } else if (diff > PACE_TOLERANCE_SECONDS) {
        msg += `Pick it up a little. `;
      } else {
        msg += `Right on target. `;
      }
    }

    speak(msg);
  }

  // === 2. SEGMENT TRANSITIONS ===
  if (config.segments.length > 0) {
    const { index, segment, segmentRemainingMs } = getCurrentSegment(
      config.segments,
      runState.elapsedMs,
    );

    if (index !== state.lastSegmentIndex && index >= 0 && segment) {
      newState.lastSegmentIndex = index;
      newState.countdownAnnounced = new Set();
      newState.segmentStartTime = now;
      hapticSegment();

      let msg = '';
      switch (segment.type) {
        case 'warmup':
          msg = `Warm up. ${segment.minutes} minutes. Easy pace, get loose.`;
          break;
        case 'cooldown':
          msg = `Cool down. ${segment.minutes} minutes. Bring it down, easy pace.`;
          break;
        case 'work':
          msg = `Go time. ${segment.minutes} minutes${segment.pace ? ` at ${segment.pace} pace` : ''}. Let's work.`;
          break;
        case 'recovery':
          msg = `Recovery. ${segment.minutes} minutes. Catch your breath.`;
          break;
        default:
          msg = `${segment.type}. ${segment.minutes} minutes.`;
      }
      speak(msg);
    }

    // Interval countdowns (30s, 10s remaining in segment)
    if (segment && (segment.type === 'work' || segment.type === 'recovery')) {
      const remainSec = Math.round(segmentRemainingMs / 1000);

      if (remainSec <= 30 && remainSec > 28 && !newState.countdownAnnounced.has(30)) {
        newState.countdownAnnounced.add(30);
        speak('30 seconds.');
      }
      if (remainSec <= 10 && remainSec > 8 && !newState.countdownAnnounced.has(10)) {
        newState.countdownAnnounced.add(10);
        speak('10 seconds.');
      }
    }
  }

  // === 3. PACE DRIFT WARNINGS (easy runs only) ===
  if (
    config.runType === 'easy' &&
    config.targetPaceSeconds &&
    runState.currentPaceSeconds &&
    runState.distanceMiles > 0.3 && // Wait until GPS stabilizes
    now - state.lastPaceWarningTime > PACE_WARNING_COOLDOWN_MS
  ) {
    const diff = runState.currentPaceSeconds - config.targetPaceSeconds;
    if (diff < -20) {
      // Running too fast for an easy run
      newState.lastPaceWarningTime = now;
      speak("Slow down. This is an easy run. Keep it conversational.");
    }
  }

  // === 4. HALFWAY NOTIFICATION ===
  if (
    !state.announcedHalfway &&
    config.targetDistanceMiles &&
    config.targetDistanceMiles > 1 &&
    runState.distanceMiles >= config.targetDistanceMiles / 2
  ) {
    newState.announcedHalfway = true;
    const remaining = (config.targetDistanceMiles - runState.distanceMiles).toFixed(1);
    speak(`Halfway. ${remaining} miles to go.`);
  }

  // === 5. FINAL MILE NOTIFICATION ===
  if (
    !state.announcedFinalMile &&
    config.targetDistanceMiles &&
    config.targetDistanceMiles > 2 &&
    runState.distanceMiles >= config.targetDistanceMiles - 1
  ) {
    newState.announcedFinalMile = true;
    speak("Last mile. Finish strong.");
  }

  return newState;
}

function formatDurationForSpeech(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;

  if (h > 0) {
    return `${h} hour${h > 1 ? 's' : ''} ${m} minutes`;
  }
  if (m > 0) {
    return `${m} minute${m > 1 ? 's' : ''} ${s > 0 ? ` ${s} seconds` : ''}`;
  }
  return `${s} seconds`;
}

/**
 * Announce run start.
 */
export function announceStart(config: CoachConfig): void {
  if (!config.enabled) return;

  let msg = "Let's go. ";
  if (config.targetDistanceMiles) {
    msg += `${config.targetDistanceMiles} miles. `;
  }
  if (config.runType && config.runType !== 'easy') {
    msg += `${config.runType} run. `;
  }
  if (config.targetPaceSeconds) {
    msg += `Target pace ${speakPace(config.targetPaceSeconds)}. `;
  }
  speak(msg);
}

/**
 * Announce run complete.
 */
export function announceFinish(runState: RunState): void {
  hapticMile();
  const avgPace = runState.distanceMiles > 0
    ? Math.round(runState.elapsedMs / 1000 / runState.distanceMiles)
    : 0;

  speak(
    `Run complete. ${runState.distanceMiles.toFixed(1)} miles in ${formatDurationForSpeech(runState.elapsedMs)}. ` +
    `Average pace ${speakPace(avgPace)}. Nice work.`
  );
}
