import { useState, useEffect } from 'react';
import { View, Text, ScrollView, Pressable, Modal, TextInput, Switch } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronRight } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import AsyncStorage from '@react-native-async-storage/async-storage';
import SkeletonLoader from '../../components/SkeletonLoader';
import StatCard from '../../components/StatCard';
import { cancelAllNotifications, requestNotificationPermissions, scheduleDailyNotification } from '../../lib/notifications';
import { getUserProfile, updateUsername, checkUsernameAvailable, getWeeklyStats, getTodayMissedQuestions, type UserProfile, type WeeklyStats, type MissedQuestion } from '../../lib/firestore';
import MissedQuestionsCarousel from '../../components/MissedQuestionsCarousel';
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
  const [weeklyStats, setWeeklyStats] = useState<WeeklyStats | null>(null);
  const [missedQuestions, setMissedQuestions] = useState<MissedQuestion[] | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showReauthModal, setShowReauthModal] = useState(false);
  const [reauthPassword, setReauthPassword] = useState('');
  const [reauthError, setReauthError] = useState('');
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
          const missed = await getTodayMissedQuestions(uid);
          if (!cancelled) {
            setMissedQuestions(missed);
          }
          // Check admin custom claim
          const tokenResult = await auth.currentUser?.getIdTokenResult();
          if (!cancelled && tokenResult?.claims?.admin === true) {
            setIsAdmin(true);
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

  // Fetch weekly stats
  useEffect(() => {
    let cancelled = false;
    const loadWeekly = async () => {
      try {
        const uid = auth.currentUser?.uid;
        if (!uid || !profile) return;
        const stats = await getWeeklyStats(uid, profile.groupIds ?? []);
        if (!cancelled) setWeeklyStats(stats);
      } catch (e) {
        console.log('[SNIPE] Error fetching weekly stats:', e);
      }
    };
    if (profile) loadWeekly();
    return () => { cancelled = true; };
  }, [profile]);

  const handleNotificationToggle = async (value: boolean) => {
    setNotificationsEnabled(value);
    await AsyncStorage.setItem('snipe_notifications_enabled', value.toString());
    if (value) {
      await requestNotificationPermissions();
      await scheduleDailyNotification();
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

  const performAccountDeletion = async () => {
    setDeleting(true);
    try {
      const { deleteUser } = await import('firebase/auth');
      const { auth } = await import('../../lib/firebase');
      const user = auth.currentUser;
      if (user) {
        await deleteUser(user);
      }
      await cancelAllNotifications();
      router.replace('/auth/login');
    } catch (e: any) {
      if (e?.code === 'auth/requires-recent-login') {
        setDeleting(false);
        setReauthPassword('');
        setReauthError('');
        setShowReauthModal(true);
      } else {
        console.log('[SNIPE] Error deleting account:', e);
        setDeleting(false);
        setShowDeleteConfirm(false);
        setReauthError('Failed to delete account. Please try again.');
        setShowReauthModal(true);
      }
    }
  };

  const handleReauthAndDelete = async () => {
    if (!reauthPassword.trim()) {
      setReauthError('Please enter your password');
      return;
    }
    setDeleting(true);
    setReauthError('');
    try {
      const { reauthenticateWithCredential, EmailAuthProvider, deleteUser } = await import('firebase/auth');
      const { auth } = await import('../../lib/firebase');
      const user = auth.currentUser;
      if (!user || !user.email) throw new Error('No user');
      const credential = EmailAuthProvider.credential(user.email, reauthPassword);
      await reauthenticateWithCredential(user, credential);
      await deleteUser(user);
      setShowReauthModal(false);
      await cancelAllNotifications();
      router.replace('/auth/login');
    } catch (e: any) {
      setDeleting(false);
      if (e?.code === 'auth/wrong-password' || e?.code === 'auth/invalid-credential') {
        setReauthError('Incorrect password');
      } else {
        console.log('[SNIPE] Reauth delete error:', e);
        setReauthError('Failed to delete account. Please try again.');
      }
    }
  };

  const handleDeleteAccount = () => {
    setShowDeleteConfirm(true);
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

        {/* Today's Review */}
        <View style={{ height: 1, backgroundColor: '#1A1A1A', marginVertical: 24 }} />
        <Text style={{
          fontFamily: 'Urbanist_700Bold',
          fontSize: 12,
          color: '#888888',
          letterSpacing: 2,
          textTransform: 'uppercase',
          marginBottom: 16,
        }}>
          TODAY'S REVIEW
        </Text>
        {missedQuestions === null ? (
          <Pressable
            onPress={() => router.push('/game')}
            style={{
              borderWidth: 1,
              borderColor: '#1A1A1A',
              borderRadius: 20,
              padding: 20,
              alignItems: 'center',
            }}
          >
            <Text style={{ fontFamily: 'Urbanist_400Regular', fontSize: 14, color: '#FFFFFF' }}>
              Play the game first
            </Text>
          </Pressable>
        ) : missedQuestions.length === 0 ? (
          <View style={{
            borderWidth: 1,
            borderColor: '#1A1A1A',
            borderRadius: 20,
            padding: 20,
            alignItems: 'center',
          }}>
            <Text style={{ fontFamily: 'Urbanist_400Regular', fontSize: 14, color: '#888888' }}>
              No missed questions
            </Text>
          </View>
        ) : (
          <MissedQuestionsCarousel missedQuestions={missedQuestions} />
        )}

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

        {/* Weekly Stats */}
        <Text style={{
          fontFamily: 'Urbanist_700Bold',
          fontSize: 12,
          color: '#888888',
          letterSpacing: 2,
          textTransform: 'uppercase',
          marginBottom: 16,
        }}>
          THIS WEEK
        </Text>

        {!weeklyStats ? (
          <View style={{ gap: 10, marginBottom: 0 }}>
            <SkeletonLoader width={'100%' as any} height={56} borderRadius={12} />
            <SkeletonLoader width={'100%' as any} height={56} borderRadius={12} />
            <SkeletonLoader width={'100%' as any} height={56} borderRadius={12} />
          </View>
        ) : weeklyStats.gamesThisWeek === 0 ? (
          <View style={{
            borderWidth: 1,
            borderColor: '#1A1A1A',
            borderRadius: 12,
            padding: 20,
            alignItems: 'center',
          }}>
            <Text style={{ fontFamily: 'Urbanist_400Regular', fontSize: 14, color: '#888888' }}>
              No games played this week yet.
            </Text>
          </View>
        ) : (
          <View style={{ gap: 10 }}>
            {/* Score */}
            <View style={{
              backgroundColor: '#0A0A0A',
              borderWidth: 1,
              borderColor: '#1A1A1A',
              borderRadius: 12,
              padding: 16,
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}>
              <View>
                <Text style={{ fontFamily: 'Urbanist_400Regular', fontSize: 12, color: '#888888', marginBottom: 4 }}>
                  Score
                </Text>
                <Text style={{ fontFamily: 'Urbanist_700Bold', fontSize: 20, color: '#FFFFFF' }}>
                  {weeklyStats.score.avg} <Text style={{ fontFamily: 'Urbanist_400Regular', fontSize: 13, color: '#888888' }}>avg</Text>
                </Text>
              </View>
              {weeklyStats.score.delta !== null && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Text style={{
                    fontFamily: 'Urbanist_700Bold',
                    fontSize: 13,
                    color: weeklyStats.score.delta > 0 ? '#22C55E' : weeklyStats.score.delta < 0 ? '#EF4444' : '#888888',
                  }}>
                    {weeklyStats.score.delta > 0 ? '+' : ''}{weeklyStats.score.delta} from last week
                  </Text>
                  <Text style={{
                    fontSize: 14,
                    color: weeklyStats.score.delta > 0 ? '#22C55E' : weeklyStats.score.delta < 0 ? '#EF4444' : '#888888',
                  }}>
                    {weeklyStats.score.delta > 0 ? '\u2191' : weeklyStats.score.delta < 0 ? '\u2193' : ''}
                  </Text>
                </View>
              )}
            </View>

            {/* Speed */}
            <View style={{
              backgroundColor: '#0A0A0A',
              borderWidth: 1,
              borderColor: '#1A1A1A',
              borderRadius: 12,
              padding: 16,
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}>
              <View>
                <Text style={{ fontFamily: 'Urbanist_400Regular', fontSize: 12, color: '#888888', marginBottom: 4 }}>
                  Speed
                </Text>
                <Text style={{ fontFamily: 'Urbanist_700Bold', fontSize: 20, color: '#FFFFFF' }}>
                  {weeklyStats.speed.avg}s <Text style={{ fontFamily: 'Urbanist_400Regular', fontSize: 13, color: '#888888' }}>avg</Text>
                </Text>
              </View>
              {weeklyStats.speed.delta !== null && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Text style={{
                    fontFamily: 'Urbanist_700Bold',
                    fontSize: 13,
                    color: weeklyStats.speed.delta < 0 ? '#22C55E' : weeklyStats.speed.delta > 0 ? '#EF4444' : '#888888',
                  }}>
                    {weeklyStats.speed.delta > 0 ? '+' : ''}{weeklyStats.speed.delta}s from last week
                  </Text>
                  <Text style={{
                    fontSize: 14,
                    color: weeklyStats.speed.delta < 0 ? '#22C55E' : weeklyStats.speed.delta > 0 ? '#EF4444' : '#888888',
                  }}>
                    {weeklyStats.speed.delta < 0 ? '\u2191' : weeklyStats.speed.delta > 0 ? '\u2193' : ''}
                  </Text>
                </View>
              )}
            </View>

            {/* Rank */}
            <View style={{
              backgroundColor: '#0A0A0A',
              borderWidth: 1,
              borderColor: '#1A1A1A',
              borderRadius: 12,
              padding: 16,
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}>
              <View>
                <Text style={{ fontFamily: 'Urbanist_400Regular', fontSize: 12, color: '#888888', marginBottom: 4 }}>
                  Rank in group
                </Text>
                <Text style={{ fontFamily: 'Urbanist_700Bold', fontSize: 20, color: '#FFFFFF' }}>
                  {weeklyStats.rank.current !== null ? `#${weeklyStats.rank.current}` : '\u2014'}
                </Text>
              </View>
              {weeklyStats.rank.current !== null && weeklyStats.rank.previous !== null && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Text style={{
                    fontFamily: 'Urbanist_700Bold',
                    fontSize: 13,
                    color: weeklyStats.rank.current < weeklyStats.rank.previous
                      ? '#22C55E'
                      : weeklyStats.rank.current > weeklyStats.rank.previous
                        ? '#EF4444'
                        : '#888888',
                  }}>
                    was #{weeklyStats.rank.previous} last week
                  </Text>
                  <Text style={{
                    fontSize: 14,
                    color: weeklyStats.rank.current < weeklyStats.rank.previous
                      ? '#22C55E'
                      : weeklyStats.rank.current > weeklyStats.rank.previous
                        ? '#EF4444'
                        : '#888888',
                  }}>
                    {weeklyStats.rank.current < weeklyStats.rank.previous
                      ? '\u2191'
                      : weeklyStats.rank.current > weeklyStats.rank.previous
                        ? '\u2193'
                        : ''}
                  </Text>
                </View>
              )}
            </View>
          </View>
        )}

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
          onPress={() => router.push('/privacy')}
          style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 16 }}
        >
          <Text style={{ fontFamily: 'Urbanist_400Regular', fontSize: 16, color: '#FFFFFF' }}>Privacy Policy</Text>
          <ChevronRight color="#444444" size={20} />
        </Pressable>


        {isAdmin && (
          <Pressable
            onPress={() => router.push('/admin')}
            style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 16 }}
          >
            <Text style={{ fontFamily: 'Urbanist_400Regular', fontSize: 16, color: '#FFFFFF' }}>Manage Quiz</Text>
            <ChevronRight color="#444444" size={20} />
          </Pressable>
        )}

        <Pressable onPress={handleDeleteAccount} disabled={deleting} style={{ paddingVertical: 16, marginTop: 8, opacity: deleting ? 0.5 : 1 }}>
          <Text style={{ fontFamily: 'Urbanist_400Regular', fontSize: 16, color: '#EF4444' }}>
            {deleting ? 'Deleting...' : 'Delete Account'}
          </Text>
        </Pressable>

        <Pressable onPress={handleLogout} style={{ paddingVertical: 16 }}>
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

      {/* Delete Account Confirmation Modal */}
      <Modal visible={showDeleteConfirm} transparent animationType="fade">
        <Pressable onPress={() => setShowDeleteConfirm(false)} style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.7)' }}>
          <Pressable onPress={() => {}} style={{ backgroundColor: '#111111', borderRadius: 20, padding: 24, marginHorizontal: 32, width: '85%', maxWidth: 340 }}>
            <Text style={{ fontFamily: 'Urbanist_700Bold', fontSize: 20, color: '#FFFFFF', marginBottom: 12 }}>
              Delete Account
            </Text>
            <Text style={{ fontFamily: 'Urbanist_400Regular', fontSize: 14, color: '#888888', marginBottom: 24, lineHeight: 20 }}>
              Are you sure? This will permanently delete your account and all your data. This action cannot be undone.
            </Text>
            <Pressable
              onPress={() => {
                setShowDeleteConfirm(false);
                performAccountDeletion();
              }}
              style={{
                backgroundColor: '#EF4444',
                borderRadius: 16,
                paddingVertical: 16,
                alignItems: 'center',
                marginBottom: 10,
              }}
            >
              <Text style={{ fontFamily: 'Urbanist_700Bold', fontSize: 16, color: '#FFFFFF' }}>Delete</Text>
            </Pressable>
            <Pressable
              onPress={() => setShowDeleteConfirm(false)}
              style={{
                borderWidth: 1,
                borderColor: '#333333',
                borderRadius: 16,
                paddingVertical: 16,
                alignItems: 'center',
              }}
            >
              <Text style={{ fontFamily: 'Urbanist_700Bold', fontSize: 16, color: '#FFFFFF' }}>Cancel</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Re-authenticate for Account Deletion Modal */}
      <Modal visible={showReauthModal} transparent animationType="slide">
        <Pressable onPress={() => { setShowReauthModal(false); setReauthError(''); }} style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.7)' }}>
          <Pressable onPress={() => {}} style={{ backgroundColor: '#111111', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24 }}>
            <Text style={{ fontFamily: 'Urbanist_700Bold', fontSize: 20, color: '#FFFFFF', marginBottom: 8 }}>
              Confirm Deletion
            </Text>
            <Text style={{ fontFamily: 'Urbanist_400Regular', fontSize: 14, color: '#888888', marginBottom: 20 }}>
              For security, please enter your password to delete your account.
            </Text>
            <TextInput
              placeholder="Password"
              placeholderTextColor="#888888"
              value={reauthPassword}
              onChangeText={setReauthPassword}
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
            {reauthError ? (
              <Text style={{ fontFamily: 'Urbanist_400Regular', fontSize: 13, color: '#EF4444', marginBottom: 12, marginLeft: 4 }}>
                {reauthError}
              </Text>
            ) : null}
            <Pressable
              onPress={handleReauthAndDelete}
              disabled={deleting}
              style={{
                backgroundColor: '#EF4444',
                borderRadius: 16,
                paddingVertical: 16,
                alignItems: 'center',
                opacity: deleting ? 0.5 : 1,
              }}
            >
              <Text style={{ fontFamily: 'Urbanist_700Bold', fontSize: 16, color: '#FFFFFF' }}>
                {deleting ? 'Deleting...' : 'Delete My Account'}
              </Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}
