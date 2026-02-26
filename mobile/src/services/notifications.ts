/**
 * Push notification service — TASK-016
 *
 * Handles Expo push notification registration and local scheduling
 * for weekly review delivery.
 */

import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';

// Configure notification handler
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/**
 * Register for push notifications and return the Expo push token.
 */
export async function registerForPushNotifications(): Promise<string | null> {
  if (!Device.isDevice) {
    console.log('Push notifications require a physical device');
    return null;
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    console.log('Push notification permission not granted');
    return null;
  }

  const tokenData = await Notifications.getExpoPushTokenAsync();
  return tokenData.data;
}

/**
 * Schedule weekly review notification for Sunday evening.
 * Uses local notification scheduling so it works offline.
 */
export async function scheduleWeeklyReviewReminder(): Promise<string | null> {
  // Cancel existing weekly review notifications
  await cancelWeeklyReviewReminder();

  const id = await Notifications.scheduleNotificationAsync({
    content: {
      title: '📊 Weekly Review Ready',
      body: "Your weekly review is in. Let's see how you did.",
      data: { screen: 'WeeklyReview' },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
      weekday: 1, // Sunday (1=Sun in Expo)
      hour: 20,
      minute: 0,
    },
  });

  return id;
}

/**
 * Cancel scheduled weekly review notifications.
 */
export async function cancelWeeklyReviewReminder(): Promise<void> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  for (const notif of scheduled) {
    if (notif.content.data?.screen === 'WeeklyReview') {
      await Notifications.cancelScheduledNotificationAsync(notif.identifier);
    }
  }
}

/**
 * Send an immediate local notification (for testing or on-demand delivery).
 */
export async function sendLocalNotification(
  title: string,
  body: string,
  data?: Record<string, unknown>,
): Promise<void> {
  await Notifications.scheduleNotificationAsync({
    content: { title, body, data },
    trigger: null, // immediate
  });
}
