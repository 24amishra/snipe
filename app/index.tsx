import { useEffect } from 'react';
import { useRouter } from 'expo-router';
import { View } from 'react-native';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../lib/firebase';

export default function Index() {
  const router = useRouter();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        router.replace('/(tabs)');
      } else {
        router.replace('/auth/login');
      }
    });
    return unsubscribe;
  }, []);

  return <View style={{ flex: 1, backgroundColor: '#000000' }} />;
}
