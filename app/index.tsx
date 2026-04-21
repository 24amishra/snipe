import { useEffect } from 'react';
import { useRouter } from 'expo-router';
import { View } from 'react-native';
import { onAuthStateChanged } from 'firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { auth } from '../lib/firebase';

export default function Index() {
  const router = useRouter();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        // Only require verification for new signups (pending username means they just signed up)
        const pendingUsername = await AsyncStorage.getItem('snipe_pending_username');
        if (!user.emailVerified && pendingUsername) {
          router.replace('/auth/verify');
        } else {
          router.replace('/(tabs)');
        }
      } else {
        router.replace('/auth/login');
      }
    });
    return unsubscribe;
  }, []);

  return <View style={{ flex: 1, backgroundColor: '#000000' }} />;
}
