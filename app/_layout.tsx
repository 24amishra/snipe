import { useEffect } from 'react';
import { Platform } from 'react-native';
import { Stack } from 'expo-router';
import Head from 'expo-router/head';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import {
  useFonts,
  Urbanist_400Regular,
  Urbanist_700Bold,
  Urbanist_800ExtraBold,
} from '@expo-google-fonts/urbanist';
import { Analytics } from '@vercel/analytics/react';
import { requestNotificationPermissions, scheduleDailyPlayReminder } from '../lib/notifications';
import "../global.css";

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Urbanist_400Regular,
    Urbanist_700Bold,
    Urbanist_800ExtraBold,
  });

  useEffect(() => {
    if (fontsLoaded) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded]);

  useEffect(() => {
    // Request notification permissions on first launch after login
    async function setupNotifications() {
      const granted = await requestNotificationPermissions();
      if (granted) {
        // TODO: Skip if user already played today (check Firestore)
        await scheduleDailyPlayReminder();
      }
    }
    setupNotifications();
  }, []);

  if (!fontsLoaded) {
    return null;
  }

  return (
    <>
      {Platform.OS === 'web' && (
        <Head>
          <link rel="manifest" href="/manifest.json" />
          <meta name="theme-color" content="#000000" />
        </Head>
      )}
      {Platform.OS === 'web' && <Analytics />}
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: '#000000' },
          animation: 'fade',
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="auth" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="join" />
        <Stack.Screen name="admin" />
        <Stack.Screen
          name="game/index"
          options={{
            presentation: 'fullScreenModal',
            animation: 'fade',
          }}
        />
      </Stack>
    </>
  );
}
