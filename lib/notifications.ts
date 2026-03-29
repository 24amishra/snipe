// lib/notifications.ts
// TODO: Configure push notification credentials in app.json (iOS: enableBackgroundRemoteNotifications, Android: useNextNotificationsApi)
// TODO: Register device push token with Firestore for server-side delivery at scale

import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

// Set how notifications appear when app is in foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

// Request notification permissions from the user
export async function requestNotificationPermissions(): Promise<boolean> {
  // TODO: Save permission status to Firestore user record
  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    return finalStatus === 'granted';
  } catch (e) {
    console.log('[SNIPE] Notifications not available on this platform');
    return false;
  }
}

// Schedule a local notification for midnight score drop
// Call this when the user completes their daily game
export async function scheduleMidnightScoreNotification(): Promise<void> {
  // TODO: Replace with server-sent push notification once backend is live
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();

    const midnight = new Date();
    midnight.setHours(24, 0, 0, 0);

    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Scores are in.',
        body: 'See where you landed on the leaderboard.',
        sound: false,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: midnight,
      },
    });
  } catch (e) {
    console.log('[SNIPE] Could not schedule midnight notification:', e);
  }
}

// Schedule a daily play reminder at 12:00 PM
// Call this on app launch if user has granted permissions
export async function scheduleDailyPlayReminder(): Promise<void> {
  // TODO: Make reminder time configurable per user in settings
  // TODO: Cancel this if user has already played today
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: "Today's game is live.",
        body: "You've got until 8PM. Don't let your streak die.",
        sound: false,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour: 12,
        minute: 0,
      },
    });
  } catch (e) {
    console.log('[SNIPE] Could not schedule daily reminder:', e);
  }
}

// Cancel all scheduled notifications (e.g. on logout)
export async function cancelAllNotifications(): Promise<void> {
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
  } catch (e) {
    console.log('[SNIPE] Could not cancel notifications:', e);
  }
}
