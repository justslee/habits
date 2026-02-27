/**
 * Shared haptics wrapper — no-ops on web, safe to call anywhere.
 */
import { Platform } from 'react-native';
import * as ExpoHaptics from 'expo-haptics';

export const haptic = {
  light: () => {
    if (Platform.OS !== 'web') ExpoHaptics.impactAsync(ExpoHaptics.ImpactFeedbackStyle.Light).catch(() => {});
  },
  medium: () => {
    if (Platform.OS !== 'web') ExpoHaptics.impactAsync(ExpoHaptics.ImpactFeedbackStyle.Medium).catch(() => {});
  },
  heavy: () => {
    if (Platform.OS !== 'web') ExpoHaptics.impactAsync(ExpoHaptics.ImpactFeedbackStyle.Heavy).catch(() => {});
  },
  success: () => {
    if (Platform.OS !== 'web') ExpoHaptics.notificationAsync(ExpoHaptics.NotificationFeedbackType.Success).catch(() => {});
  },
  warning: () => {
    if (Platform.OS !== 'web') ExpoHaptics.notificationAsync(ExpoHaptics.NotificationFeedbackType.Warning).catch(() => {});
  },
  error: () => {
    if (Platform.OS !== 'web') ExpoHaptics.notificationAsync(ExpoHaptics.NotificationFeedbackType.Error).catch(() => {});
  },
  selection: () => {
    if (Platform.OS !== 'web') ExpoHaptics.selectionAsync().catch(() => {});
  },
};
