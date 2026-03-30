import { useState, useEffect, useCallback } from 'react';
import { View, Text, Pressable, ScrollView, Modal, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Plus, Users, Info } from 'lucide-react-native';
import SnipeWordmark from '../../components/SnipeWordmark';
import SkeletonLoader from '../../components/SkeletonLoader';
import { getMidnightCountdown, getTodayDateString, isQuizWindowOpen, getNextQuizCountdown } from '../../lib/gameUtils';
import { createGroup, joinGroup, getUserGroups, getUserGameForDate } from '../../lib/firestore';
import { auth } from '../../lib/firebase';

export default function TodayTab() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [hasPlayedToday, setHasPlayedToday] = useState(false);
  const [countdown, setCountdown] = useState(getNextQuizCountdown());
  const [quizOpen, setQuizOpen] = useState(isQuizWindowOpen());
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [modalInput, setModalInput] = useState('');
  const [modalLoading, setModalLoading] = useState(false);
  const [modalSuccess, setModalSuccess] = useState(false);
  const [modalError, setModalError] = useState('');
  const [userGroups, setUserGroups] = useState<Array<{ id: string; name: string; memberCount: number }>>([]);

  // Reload user data (played status + groups) every time the tab is focused
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      const load = async () => {
        try {
          const uid = auth.currentUser?.uid;
          if (uid) {
            const [todayGame, groups] = await Promise.all([
              getUserGameForDate(uid, getTodayDateString()),
              getUserGroups(uid),
            ]);
            if (!cancelled) {
              if (todayGame) setHasPlayedToday(true);
              setUserGroups(groups);
            }
          }
        } catch (e) {
          console.log('[SNIPE] Error loading today tab:', e);
        }
        if (!cancelled) setLoading(false);
      };
      load();
      return () => { cancelled = true; };
    }, [])
  );

  // Countdown timer + quiz window check
  useEffect(() => {
    const interval = setInterval(() => {
      setQuizOpen(isQuizWindowOpen());
      setCountdown(getNextQuizCountdown());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Listen for game completion via global flag
  useEffect(() => {
    const checkGameComplete = () => {
      if ((global as any).__snipeGameComplete) {
        setHasPlayedToday(true);
        (global as any).__snipeGameComplete = false;
      }
    };
    const interval = setInterval(checkGameComplete, 500);
    return () => clearInterval(interval);
  }, []);

  const handleCreateGroup = async () => {
    setModalLoading(true);
    setModalSuccess(false);
    setModalError('');
    try {
      const uid = auth.currentUser?.uid;
      if (!uid) throw new Error('Not signed in');
      const result = await createGroup(uid, modalInput.trim());
      setUserGroups((prev) => [...prev, { id: result.groupId, name: modalInput.trim(), memberCount: 1 }]);
      setModalSuccess(true);
    } catch (e: any) {
      console.log('[SNIPE] Error creating group:', e);
      setModalError('Failed to create group');
    } finally {
      setModalLoading(false);
    }
  };

  const handleJoinGroup = async () => {
    setModalLoading(true);
    setModalSuccess(false);
    setModalError('');
    try {
      const uid = auth.currentUser?.uid;
      if (!uid) throw new Error('Not signed in');
      const result = await joinGroup(uid, modalInput.trim());
      if (!result) {
        setModalError('Invalid invite code');
        setModalLoading(false);
        return;
      }
      setUserGroups((prev) => {
        if (prev.some((g) => g.id === result.groupId)) return prev;
        return [...prev, { id: result.groupId, name: result.groupName, memberCount: 0 }];
      });
      setModalSuccess(true);
    } catch (e: any) {
      console.log('[SNIPE] Error joining group:', e);
      setModalError('Failed to join group');
    } finally {
      setModalLoading(false);
    }
  };

  const closeModal = () => {
    setShowCreateModal(false);
    setShowJoinModal(false);
    setModalInput('');
    setModalLoading(false);
    setModalSuccess(false);
    setModalError('');
  };

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#000000' }}>
        <View style={{ paddingHorizontal: 20, paddingTop: 16 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 40 }}>
            <SkeletonLoader width={100} height={28} borderRadius={8} />
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <SkeletonLoader width={36} height={36} borderRadius={18} />
              <SkeletonLoader width={36} height={36} borderRadius={18} />
            </View>
          </View>
          <SkeletonLoader width={120} height={16} borderRadius={8} />
          <View style={{ marginTop: 32 }}>
            <SkeletonLoader width={'100%' as any} height={64} borderRadius={20} />
          </View>
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 32 }}>
            <SkeletonLoader width={100} height={36} borderRadius={20} />
            <SkeletonLoader width={100} height={36} borderRadius={20} />
            <SkeletonLoader width={100} height={36} borderRadius={20} />
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#000000' }}>
      <View style={{ flex: 1, paddingHorizontal: 20, paddingTop: 16 }}>
        {/* Header */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 40 }}>
          <SnipeWordmark size="md" />
          <View style={{ flexDirection: 'row', gap: 16 }}>
            <Pressable onPress={() => setShowAbout(true)}>
              <Info color="#888888" size={22} />
            </Pressable>
            <Pressable onPress={() => { setShowCreateModal(true); setModalSuccess(false); }}>
              <Plus color="#FFFFFF" size={24} />
            </Pressable>
            <Pressable onPress={() => { setShowJoinModal(true); setModalSuccess(false); }}>
              <Users color="#FFFFFF" size={24} />
            </Pressable>
          </View>
        </View>

        {/* Date */}
        <Text style={{ fontFamily: 'Urbanist_400Regular', fontSize: 14, color: '#888888', marginBottom: 32 }}>
          {today}
        </Text>

        {/* Quiz available: anyone who hasn't played today can play */}
        {!hasPlayedToday ? (
          <View>
            <Pressable
              onPress={() => router.push('/game')}
              style={{
                backgroundColor: '#FFFFFF',
                borderRadius: 20,
                paddingVertical: 20,
                alignItems: 'center',
              }}
            >
              <Text style={{ fontFamily: 'Urbanist_700Bold', fontSize: 22, color: '#000000' }}>
                PLAY
              </Text>
            </Pressable>
            <Text style={{ fontFamily: 'Urbanist_400Regular', fontSize: 13, color: '#888888', textAlign: 'center', marginTop: 14 }}>
              7 questions · 8 seconds each
            </Text>
          </View>
        ) : (
          <View style={{ alignItems: 'center' }}>
            <Text style={{ fontFamily: 'Urbanist_400Regular', fontSize: 14, color: '#888888', marginBottom: 8 }}>
               next quiz  in
            </Text>
            <Text style={{ fontFamily: 'Urbanist_700Bold', fontSize: 48, color: '#FFFFFF', fontVariant: ['tabular-nums'] }}>
              {countdown}
            </Text>
          </View>
        )}

        {/* Your Groups */}
        <Text style={{
          fontFamily: 'Urbanist_700Bold',
          fontSize: 12,
          color: '#888888',
          letterSpacing: 2,
          textTransform: 'uppercase',
          marginTop: 40,
          marginBottom: 14,
        }}>
          YOUR GROUPS
        </Text>
        <View style={{ gap: 10 }}>
          {userGroups.length === 0 ? (
            <Pressable
              onPress={() => { setShowJoinModal(true); setModalSuccess(false); }}
              style={{
                backgroundColor: '#FFFFFF',
                borderRadius: 100,
                paddingHorizontal: 20,
                paddingVertical: 14,
                alignItems: 'center',
              }}
            >
              <Text style={{ fontFamily: 'Urbanist_700Bold', fontSize: 15, color: '#000000' }}>
                Join Group
              </Text>
            </Pressable>
          ) : (
            userGroups.map((group) => (
              <Pressable
                key={group.id}
                onPress={() => router.push({ pathname: '/(tabs)/leaderboard', params: { groupId: group.id } })}
                style={{
                  backgroundColor: '#FFFFFF',
                  borderRadius: 100,
                  paddingHorizontal: 20,
                  paddingVertical: 14,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <Text style={{ fontFamily: 'Urbanist_700Bold', fontSize: 15, color: '#000000' }}>
                  {group.name}
                </Text>
                {group.memberCount > 0 && (
                  <Text style={{ fontFamily: 'Urbanist_400Regular', fontSize: 13, color: '#666666' }}>
                    {group.memberCount} members
                  </Text>
                )}
              </Pressable>
            ))
          )}
        </View>

      </View>

      {/* Create Group Modal */}
      <Modal visible={showCreateModal} transparent animationType="slide">
        <Pressable onPress={closeModal} style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.7)' }}>
          <Pressable onPress={() => {}} style={{ backgroundColor: '#111111', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24 }}>
            <Text style={{ fontFamily: 'Urbanist_700Bold', fontSize: 20, color: '#FFFFFF', marginBottom: 20 }}>
              Create Group
            </Text>
            {!modalSuccess ? (
              <>
                <TextInput
                  placeholder="Group name"
                  placeholderTextColor="#888888"
                  value={modalInput}
                  onChangeText={setModalInput}
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
                {modalError ? (
                  <Text style={{ fontFamily: 'Urbanist_400Regular', fontSize: 13, color: '#EF4444', marginBottom: 8 }}>{modalError}</Text>
                ) : null}
                <Pressable
                  onPress={handleCreateGroup}
                  disabled={modalLoading || !modalInput.trim()}
                  style={{
                    backgroundColor: '#FFFFFF',
                    borderRadius: 16,
                    paddingVertical: 16,
                    alignItems: 'center',
                    opacity: modalLoading || !modalInput.trim() ? 0.5 : 1,
                  }}
                >
                  <Text style={{ fontFamily: 'Urbanist_700Bold', fontSize: 16, color: '#000000' }}>
                    {modalLoading ? 'Creating...' : 'Create'}
                  </Text>
                </Pressable>
              </>
            ) : (
              <Text style={{ fontFamily: 'Urbanist_400Regular', fontSize: 16, color: '#22C55E', textAlign: 'center', paddingVertical: 20 }}>
                Group created successfully!
              </Text>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      {/* Join Group Modal */}
      <Modal visible={showJoinModal} transparent animationType="slide">
        <Pressable onPress={closeModal} style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.7)' }}>
          <Pressable onPress={() => {}} style={{ backgroundColor: '#111111', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24 }}>
            <Text style={{ fontFamily: 'Urbanist_700Bold', fontSize: 20, color: '#FFFFFF', marginBottom: 20 }}>
              Join Group
            </Text>
            {!modalSuccess ? (
              <>
                <TextInput
                  placeholder="Invite code"
                  placeholderTextColor="#888888"
                  value={modalInput}
                  onChangeText={setModalInput}
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
                    marginBottom: 16,
                  }}
                />
                {modalError ? (
                  <Text style={{ fontFamily: 'Urbanist_400Regular', fontSize: 13, color: '#EF4444', marginBottom: 8 }}>{modalError}</Text>
                ) : null}
                <Pressable
                  onPress={handleJoinGroup}
                  disabled={modalLoading || !modalInput.trim()}
                  style={{
                    backgroundColor: '#FFFFFF',
                    borderRadius: 16,
                    paddingVertical: 16,
                    alignItems: 'center',
                    opacity: modalLoading || !modalInput.trim() ? 0.5 : 1,
                  }}
                >
                  <Text style={{ fontFamily: 'Urbanist_700Bold', fontSize: 16, color: '#000000' }}>
                    {modalLoading ? 'Joining...' : 'Join'}
                  </Text>
                </Pressable>
              </>
            ) : (
              <Text style={{ fontFamily: 'Urbanist_400Regular', fontSize: 16, color: '#22C55E', textAlign: 'center', paddingVertical: 20 }}>
                Joined group successfully!
              </Text>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      {/* About Modal */}
      <Modal visible={showAbout} transparent animationType="fade">
        <Pressable onPress={() => setShowAbout(false)} style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.85)', paddingHorizontal: 24 }}>
          <Pressable onPress={() => {}} style={{ backgroundColor: '#111111', borderRadius: 20, padding: 28, width: '100%', borderWidth: 1, borderColor: '#1A1A1A' }}>
            <Text style={{ fontFamily: 'Urbanist_700Bold', fontSize: 22, color: '#FFFFFF', marginBottom: 16 }}>
              About Snipe
            </Text>
            <Text style={{ fontFamily: 'Urbanist_400Regular', fontSize: 15, color: '#CCCCCC', lineHeight: 24 }}>
              Snipe is a speed-based trivia game designed to be played with your group chat. Seven questions, eight seconds each. One daily champion. Track your accuracy and speed across five categories — questions drop every day at 8PM EST.
            </Text>
            <Pressable
              onPress={() => setShowAbout(false)}
              style={{ backgroundColor: '#FFFFFF', borderRadius: 16, paddingVertical: 14, alignItems: 'center', marginTop: 24 }}
            >
              <Text style={{ fontFamily: 'Urbanist_700Bold', fontSize: 16, color: '#000000' }}>Got it</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}
