// lib/notifications.ts

import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from './firebase';
import { auth } from './firebase';

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

// Register the device push token with Firestore for server-side delivery
async function registerPushToken(): Promise<void> {
  if (Platform.OS === 'web') return;
  const uid = auth.currentUser?.uid;
  if (!uid) return;

  try {
    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId: '0b8ecf82-5b85-43de-a85f-7f03d7b1c996',
    });
    await updateDoc(doc(db, 'users', uid), {
      pushToken: tokenData.data,
      notificationsEnabled: true,
    });
  } catch (e) {
    console.log('[SNIPE] Could not register push token:', e);
  }
}

// Request notification permissions and save status to Firestore
export async function requestNotificationPermissions(): Promise<boolean> {
  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    const granted = finalStatus === 'granted';

    // Sync permission status + push token to Firestore
    const uid = auth.currentUser?.uid;
    if (uid) {
      if (granted) {
        await registerPushToken();
      } else {
        await updateDoc(doc(db, 'users', uid), {
          notificationsEnabled: false,
          pushToken: null,
        });
      }
    }

    return granted;
  } catch (e) {
    console.log('[SNIPE] Notifications not available on this platform');
    return false;
  }
}

// Schedule the single daily notification at 12:15 PM
// Call this on app launch if user has granted permissions
export async function scheduleDailyNotification(): Promise<void> {
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();

    await Notifications.scheduleNotificationAsync({
      content: {
        title: "Today's game is live.",
        body: 'Take a look at where you stand ➡️',
        sound: false,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour: 12,
        minute: 15,
      },
    });
  } catch (e) {
    console.log('[SNIPE] Could not schedule daily notification:', e);
  }
}

// Cancel all scheduled notifications and clear push token from Firestore
export async function cancelAllNotifications(): Promise<void> {
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
    const uid = auth.currentUser?.uid;
    if (uid) {
      await updateDoc(doc(db, 'users', uid), {
        notificationsEnabled: false,
        pushToken: null,
      });
    }
  } catch (e) {
    console.log('[SNIPE] Could not cancel notifications:', e);
  }
}
