import { useState, useEffect } from 'react';
import { View, Text, ScrollView, Pressable, Modal, TextInput, Switch } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronRight } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import AsyncStorage from '@react-native-async-storage/async-storage';
import SkeletonLoader from '../../components/SkeletonLoader';
import StatCard from '../../components/StatCard';
import { cancelAllNotifications, requestNotificationPermissions, scheduleDailyPlayReminder } from '../../lib/notifications';
import { getUserProfile, updateUsername, checkUsernameAvailable, type UserProfile } from '../../lib/firestore';
import { auth } from '../../lib/firebase';

export default function AccountTab() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [notifLoading, setNotifLoading] = useState(true);
  const [showEditUsername, setShowEditUsername] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [editUsername, setEditUsername] = useState('');
  const [usernameError, setUsernameError] = useState('');
  const [usernameSaving, setUsernameSaving] = useState(false);
  const opacity = useSharedValue(0);

  const displayUsername = profile?.username ?? '';
  const displayEmail = profile?.email ?? '';
  const displayWins = profile?.totalWins ?? 0;
  const displayCategories = profile?.categoryStats
    ? Object.entries(profile.categoryStats).map(([name, stats]) => ({
        name,
        accuracy: stats.total > 0 ? stats.correct / stats.total : 0,
        avgTime: stats.total > 0 ? Math.round((stats.totalTime / stats.total) * 10) / 10 : 0,
      }))
    : [];

  // Fetch user profile from Firestore
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const uid = auth.currentUser?.uid;
        if (uid) {
          const p = await getUserProfile(uid);
          if (!cancelled && p) {
            setProfile(p);
            setEditUsername(p.username);
          }
        }
      } catch (e) {
        console.log('[SNIPE] Error fetching profile:', e);
      }
      if (!cancelled) {
        setLoading(false);
        opacity.value = withTiming(1, { duration: 200 });
      }
    };
    load();
    return () => { cancelled = true; };
  }, []);

  // Load notification preference
  useEffect(() => {
    AsyncStorage.getItem('snipe_notifications_enabled').then((val) => {
      if (val === 'true') setNotificationsEnabled(true);
      setTimeout(() => setNotifLoading(false), 300);
    }).catch(() => setNotifLoading(false));
  }, []);

  const handleNotificationToggle = async (value: boolean) => {
    setNotificationsEnabled(value);
    await AsyncStorage.setItem('snipe_notifications_enabled', value.toString());
    if (value) {
      await requestNotificationPermissions();
      await scheduleDailyPlayReminder();
    } else {
      await cancelAllNotifications();
    }
  };

  const handleLogout = async () => {
    try {
      // TODO: Firebase signOut
      const { signOut } = await import('firebase/auth');
      const { auth } = await import('../../lib/firebase');
      await signOut(auth);
    } catch (e) {
      console.log('[SNIPE] Firebase not configured — mock logout');
    }
    await cancelAllNotifications();
    router.replace('/auth/login');
  };

  const fadeStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#000000' }}>
        <ScrollView style={{ paddingHorizontal: 20, paddingTop: 16 }}>
          <SkeletonLoader width={160} height={28} borderRadius={8} />
          <View style={{ marginTop: 8 }}>
            <SkeletonLoader width={200} height={16} borderRadius={6} />
          </View>
          <View style={{ height: 1, backgroundColor: '#1A1A1A', marginVertical: 24 }} />
          {[0, 1, 2, 3, 4].map((i) => (
            <View key={i} style={{ marginBottom: 12 }}>
              <SkeletonLoader width={'100%' as any} height={80} borderRadius={20} />
            </View>
          ))}
          <View style={{ marginTop: 12 }}>
            {[0, 1, 2].map((i) => (
              <View key={i} style={{ marginBottom: 8 }}>
                <SkeletonLoader width={'100%' as any} height={48} borderRadius={12} />
              </View>
            ))}
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#000000' }}>
      <Animated.ScrollView style={[{ paddingHorizontal: 20, paddingTop: 16 }, fadeStyle]}>
        {/* Profile */}
        <Text
          style={{ fontFamily: 'Urbanist_700Bold', fontSize: 28, color: '#FFFFFF' }}
          numberOfLines={1}
          ellipsizeMode="tail"
        >
          {displayUsername}
        </Text>
        <Text style={{ fontFamily: 'Urbanist_400Regular', fontSize: 14, color: '#888888', marginTop: 4 }}>
          {displayEmail}
        </Text>
        <View style={{
          backgroundColor: '#1A1A1A',
          borderRadius: 100,
          paddingHorizontal: 12,
          paddingVertical: 6,
          alignSelf: 'flex-start',
          marginTop: 12,
        }}>
          <Text style={{ fontFamily: 'Urbanist_400Regular', fontSize: 13, color: '#FFFFFF' }}>
            {displayWins} wins
          </Text>
        </View>

        <View style={{ height: 1, backgroundColor: '#1A1A1A', marginVertical: 24 }} />

        {/* Stats */}
        <Text style={{
          fontFamily: 'Urbanist_700Bold',
          fontSize: 12,
          color: '#888888',
          letterSpacing: 2,
          textTransform: 'uppercase',
          marginBottom: 16,
        }}>
          YOUR STATS
        </Text>
        {displayCategories.map((cat) => (
          <StatCard key={cat.name} name={cat.name} accuracy={cat.accuracy} avgTime={cat.avgTime} />
        ))}

        <View style={{ height: 1, backgroundColor: '#1A1A1A', marginVertical: 24 }} />

        {/* Settings */}
        <Text style={{
          fontFamily: 'Urbanist_700Bold',
          fontSize: 12,
          color: '#888888',
          letterSpacing: 2,
          textTransform: 'uppercase',
          marginBottom: 16,
        }}>
          SETTINGS
        </Text>

        <Pressable
          onPress={() => setShowEditUsername(true)}
          style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 16 }}
        >
          <Text style={{ fontFamily: 'Urbanist_400Regular', fontSize: 16, color: '#FFFFFF' }}>Edit Username</Text>
          <ChevronRight color="#444444" size={20} />
        </Pressable>

        <Pressable
          onPress={() => setShowChangePassword(true)}
          style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 16 }}
        >
          <Text style={{ fontFamily: 'Urbanist_400Regular', fontSize: 16, color: '#FFFFFF' }}>Change Password</Text>
          <ChevronRight color="#444444" size={20} />
        </Pressable>

        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 16 }}>
          <Text style={{ fontFamily: 'Urbanist_400Regular', fontSize: 16, color: '#FFFFFF' }}>Notifications</Text>
          {notifLoading ? (
            <SkeletonLoader width={51} height={31} borderRadius={16} />
          ) : (
            <Switch
              value={notificationsEnabled}
              onValueChange={handleNotificationToggle}
              trackColor={{ false: '#222222', true: '#22C55E' }}
              thumbColor="#FFFFFF"
            />
          )}
        </View>

        <Pressable
          onPress={() => { /* skeleton no-op */ }}
          style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 16 }}
        >
          <Text style={{ fontFamily: 'Urbanist_400Regular', fontSize: 16, color: '#FFFFFF' }}>Privacy Policy</Text>
          <ChevronRight color="#444444" size={20} />
        </Pressable>

        {auth.currentUser?.email === 'admin@gmail.com' && (
          <Pressable
            onPress={() => router.push('/admin')}
            style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 16 }}
          >
            <Text style={{ fontFamily: 'Urbanist_400Regular', fontSize: 16, color: '#FFFFFF' }}>Manage Quiz</Text>
            <ChevronRight color="#444444" size={20} />
          </Pressable>
        )}

        <Pressable onPress={handleLogout} style={{ paddingVertical: 16, marginTop: 8 }}>
          <Text style={{ fontFamily: 'Urbanist_400Regular', fontSize: 16, color: '#EF4444' }}>Log Out</Text>
        </Pressable>

        <View style={{ height: 60 }} />
      </Animated.ScrollView>

      {/* Edit Username Modal */}
      <Modal visible={showEditUsername} transparent animationType="slide">
        <Pressable onPress={() => setShowEditUsername(false)} style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.7)' }}>
          <Pressable onPress={() => {}} style={{ backgroundColor: '#111111', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24 }}>
            <Text style={{ fontFamily: 'Urbanist_700Bold', fontSize: 20, color: '#FFFFFF', marginBottom: 20 }}>
              Edit Username
            </Text>
            <TextInput
              placeholder="New username"
              placeholderTextColor="#888888"
              value={editUsername}
              onChangeText={setEditUsername}
              maxLength={12}
              autoCapitalize="none"
              style={{
                fontFamily: 'Urbanist_400Regular',
                fontSize: 16,
                color: '#FFFFFF',
                borderWidth: 1,
                borderColor: '#222222',
                borderRadius: 16,
                paddingHorizontal: 20,
                paddingVertical: 16,
                marginBottom: 8,
              }}
            />
            <Text style={{ fontFamily: 'Urbanist_400Regular', fontSize: 12, color: '#888888', marginBottom: 16, marginLeft: 4 }}>
              {editUsername} ({editUsername.length}/12)
            </Text>
            {usernameError ? (
              <Text style={{ fontFamily: 'Urbanist_400Regular', fontSize: 13, color: '#EF4444', marginBottom: 8, marginLeft: 4 }}>
                {usernameError}
              </Text>
            ) : null}
            <Pressable
              onPress={async () => {
                setUsernameError('');
                const trimmed = editUsername.trim();
                if (!trimmed) { setUsernameError('Username cannot be empty'); return; }
                if (trimmed === displayUsername) { setShowEditUsername(false); return; }

                setUsernameSaving(true);
                try {
                  const available = await checkUsernameAvailable(trimmed);
                  if (!available) { setUsernameError('Username is already taken'); setUsernameSaving(false); return; }

                  const uid = auth.currentUser?.uid;
                  if (uid) {
                    await updateUsername(uid, trimmed);
                    setProfile((prev) => prev ? { ...prev, username: trimmed } : prev);
                  }
                  setShowEditUsername(false);
                } catch (e) {
                  console.log('[SNIPE] Error updating username:', e);
                  setUsernameError('Failed to update username');
                } finally {
                  setUsernameSaving(false);
                }
              }}
              disabled={usernameSaving}
              style={{
                backgroundColor: '#FFFFFF',
                borderRadius: 16,
                paddingVertical: 16,
                alignItems: 'center',
                opacity: usernameSaving ? 0.5 : 1,
              }}
            >
              <Text style={{ fontFamily: 'Urbanist_700Bold', fontSize: 16, color: '#000000' }}>
                {usernameSaving ? 'Saving...' : 'Save'}
              </Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Change Password Modal */}
      <Modal visible={showChangePassword} transparent animationType="slide">
        <Pressable onPress={() => setShowChangePassword(false)} style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.7)' }}>
          <Pressable onPress={() => {}} style={{ backgroundColor: '#111111', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24 }}>
            <Text style={{ fontFamily: 'Urbanist_700Bold', fontSize: 20, color: '#FFFFFF', marginBottom: 20 }}>
              Change Password
            </Text>
            <TextInput
              placeholder="New password"
              placeholderTextColor="#888888"
              secureTextEntry
              style={{
                fontFamily: 'Urbanist_400Regular',
                fontSize: 16,
                color: '#FFFFFF',
                borderWidth: 1,
                borderColor: '#222222',
                borderRadius: 16,
                paddingHorizontal: 20,
                paddingVertical: 16,
                marginBottom: 16,
              }}
            />
            <Pressable
              onPress={() => {
                // TODO: Update password in Firebase Auth
                console.log('[SNIPE] Password change requested');
                setShowChangePassword(false);
              }}
              style={{
                backgroundColor: '#FFFFFF',
                borderRadius: 16,
                paddingVertical: 16,
                alignItems: 'center',
              }}
            >
              <Text style={{ fontFamily: 'Urbanist_700Bold', fontSize: 16, color: '#000000' }}>Update Password</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}
