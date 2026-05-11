import { useEffect, useState } from 'react';
import { Platform, View, Text, Pressable, Linking, Modal } from 'react-native';
import { Stack } from 'expo-router';
import Head from 'expo-router/head';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import * as Updates from 'expo-updates';
import Constants from 'expo-constants';
import {
  useFonts,
  Urbanist_400Regular,
  Urbanist_700Bold,
  Urbanist_800ExtraBold,
} from '@expo-google-fonts/urbanist';
import { Analytics } from '@vercel/analytics/react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import "../global.css";

SplashScreen.preventAutoHideAsync();

const APP_VERSION = Constants.expoConfig?.version ?? '0.0.0';

const IOS_STORE_URL = 'https://apps.apple.com/app/snipe-app/id6745498019';
const ANDROID_STORE_URL = 'https://play.google.com/store/apps/details?id=app.snipe.trivia';

function compareVersions(current: string, min: string): boolean {
  const c = current.split('.').map(Number);
  const m = min.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((c[i] ?? 0) < (m[i] ?? 0)) return true;
    if ((c[i] ?? 0) > (m[i] ?? 0)) return false;
  }
  return false;
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Urbanist_400Regular,
    Urbanist_700Bold,
    Urbanist_800ExtraBold,
  });

  const [needsUpdate, setNeedsUpdate] = useState(false);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    const checkForOTAUpdate = async () => {
      try {
        const update = await Updates.checkForUpdateAsync();
        if (update.isAvailable) {
          await Updates.fetchUpdateAsync();
          await Updates.reloadAsync();
        }
      } catch (e) {
        // Silently fail — don't block the app if update check fails
      }
    };
    checkForOTAUpdate();
  }, []);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    const checkVersion = async () => {
      try {
        const snap = await getDoc(doc(db, 'appConfig', 'forceUpdate'));
        if (!snap.exists()) return;
        const data = snap.data() as { minVersion?: string; enabled?: boolean };
        if (data.enabled && data.minVersion && compareVersions(APP_VERSION, data.minVersion)) {
          setNeedsUpdate(true);
        }
      } catch (e) {
        // Silently fail — don't block the app if Firestore is unreachable
      }
    };
    checkVersion();
  }, []);

  useEffect(() => {
    if (fontsLoaded) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded]);

  if (!fontsLoaded) {
    return null;
  }

  const storeUrl = Platform.OS === 'ios' ? IOS_STORE_URL : ANDROID_STORE_URL;

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

      <Modal visible={needsUpdate} transparent={false} animationType="fade">
        <View style={{ flex: 1, backgroundColor: '#000000', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32 }}>
          <Text style={{ fontFamily: 'Urbanist_700Bold', fontSize: 28, color: '#FFFFFF', textAlign: 'center', marginBottom: 12 }}>
            Update Required
          </Text>
          <Text style={{ fontFamily: 'Urbanist_400Regular', fontSize: 16, color: '#888888', textAlign: 'center', lineHeight: 24, marginBottom: 32 }}>
            A new version of Snipe is available with important fixes. Please update to continue playing.
          </Text>
          <Pressable
            onPress={() => Linking.openURL(storeUrl)}
            style={{ backgroundColor: '#FFFFFF', borderRadius: 20, paddingVertical: 18, paddingHorizontal: 48, alignItems: 'center' }}
          >
            <Text style={{ fontFamily: 'Urbanist_700Bold', fontSize: 18, color: '#000000' }}>
              Update Now
            </Text>
          </Pressable>
        </View>
      </Modal>
    </>
  );
}
