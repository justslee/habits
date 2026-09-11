/**
 * Liquid haptics — the feedback table from DESIGN-NOTES.md, in one place.
 *
 * Rules carried over from the prototype: a selection tick fires only when the value actually
 * changed, and is throttled to ~65 ms so a drag across a chart or heatmap does not buzz
 * continuously. Success fires only on confirmed completion. Haptics complement visible
 * feedback; nothing depends on them, and they are silently unavailable on web.
 */

import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';
import { gesture } from './tokens';

const on = Platform.OS === 'ios' || Platform.OS === 'android';
let lastTick = 0;

const impact = (style: Haptics.ImpactFeedbackStyle) => {
  if (on) Haptics.impactAsync(style).catch(() => {});
};

export const feel = {
  /** Moving between destinations, segments, ranges, units, chart lines. */
  selection: () => {
    if (on) Haptics.selectionAsync().catch(() => {});
  },
  /** A selection tick during a drag: throttled, and only when the value changed. */
  tick: () => {
    const now = Date.now();
    if (now - lastTick < gesture.cueThrottle) return;
    lastTick = now;
    if (on) Haptics.selectionAsync().catch(() => {});
  },
  /** A sheet opening or settling closed; a recognised hold. */
  soft: () => impact(Haptics.ImpactFeedbackStyle.Soft),
  /** A committed change: a ritual completed, a set logged, an adjustment applied. */
  light: () => impact(Haptics.ImpactFeedbackStyle.Light),
  medium: () => impact(Haptics.ImpactFeedbackStyle.Medium),
  /** Only after confirmed completion. Never for an uncertain result. */
  success: () => {
    if (on) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  },
  warning: () => {
    if (on) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
  },
  error: () => {
    if (on) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
  },
};
