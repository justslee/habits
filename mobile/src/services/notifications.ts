/**
 * Push notification service — TASK-016
 *
 * Handles Expo push notification registration and local scheduling
 * for weekly review delivery.
 */

import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';

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
export async function scheduleDailyReview(): Promise<string | null> {
  // Cancel existing daily review notifications
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  for (const notif of scheduled) {
    if (notif.content.data?.screen === 'DailyReview') {
      await Notifications.cancelScheduledNotificationAsync(notif.identifier);
    }
  }

  const id = await Notifications.scheduleNotificationAsync({
    content: {
      title: '📋 Daily Review',
      body: "Time to complete your daily review. How did today go?",
      data: { screen: 'DailyReview' },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour: 22,
      minute: 0,
    },
  });

  return id;
}

/**
 * Send an immediate local notification (for testing or on-demand delivery).
 */
