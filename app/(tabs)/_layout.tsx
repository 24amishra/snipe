import { useEffect, useState, useRef } from 'react';
import { Tabs, useRouter } from 'expo-router';
import { Target, BarChart2, User } from 'lucide-react-native';
import { View } from 'react-native';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../../lib/firebase';
import { requestNotificationPermissions, scheduleDailyNotification } from '../../lib/notifications';

export default function TabLayout() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const notifSetup = useRef(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (!user) {
        router.replace('/auth/login');
      } else {
        setReady(true);
      }
    });
    return unsubscribe;
  }, []);

  // Setup notifications only after auth is confirmed
  useEffect(() => {
    if (!ready || notifSetup.current) return;
    notifSetup.current = true;
    async function setup() {
      const granted = await requestNotificationPermissions();
      if (granted) {
        await scheduleDailyNotification();
      }
    }
    setup();
  }, [ready]);

  if (!ready) {
    return <View style={{ flex: 1, backgroundColor: '#000000' }} />;
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        tabBarActiveTintColor: '#FFFFFF',
        tabBarInactiveTintColor: '#444444',
        tabBarStyle: {
          backgroundColor: '#000000',
          borderTopWidth: 1,
          borderTopColor: '#1A1A1A',
          height: 60,
          paddingBottom: 8,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          tabBarIcon: ({ color, size }) => <Target color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="leaderboard"
        options={{
          tabBarIcon: ({ color, size }) => <BarChart2 color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="account"
        options={{
          tabBarIcon: ({ color, size }) => <User color={color} size={size} />,
        }}
      />
    </Tabs>
  );
}
