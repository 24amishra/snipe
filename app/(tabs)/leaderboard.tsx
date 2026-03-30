import { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, ScrollView, Modal, Pressable, Share, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { useAnimatedStyle, useSharedValue, withTiming, Easing } from 'react-native-reanimated';
import { useLocalSearchParams } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import * as Clipboard from 'expo-clipboard';
import SkeletonLoader from '../../components/SkeletonLoader';
import LeaderboardTable from '../../components/LeaderboardTable';
import { getUserGroups, getGroupLeaderboard, joinGroup } from '../../lib/firestore';
import { auth } from '../../lib/firebase';
import { getGroupDoc, buildInviteLink, removeMember } from '../../lib/groupUtils';
import { haveScoresDropped } from '../../lib/gameUtils';

interface GroupWithLeaderboard {
  id: string;
  name: string;
  ownerId: string;
  inviteCode: string;
  entries: Array<{ userId: string; username: string; score: number; wins: number; streak: number; avgPct: number }>;
}

export default function LeaderboardTab() {
  const { groupId: focusGroupId } = useLocalSearchParams<{ groupId?: string }>();
  const [loading, setLoading] = useState(true);
  const [groups, setGroups] = useState<GroupWithLeaderboard[]>([]);
  const opacity = useSharedValue(0);
  const translateX = useSharedValue(-40);
  const scrollRef = useRef<ScrollView>(null);
  const groupLayoutsRef = useRef<Record<string, number>>({});

  // Invite bottom sheet state
  const [inviteGroup, setInviteGroup] = useState<GroupWithLeaderboard | null>(null);
  const [copied, setCopied] = useState(false);

  // Remove member bottom sheet state
  const [removeTarget, setRemoveTarget] = useState<{ groupId: string; groupName: string; userId: string; username: string } | null>(null);
  const [removing, setRemoving] = useState(false);

  // Join group modal state
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [joinLoading, setJoinLoading] = useState(false);
  const [joinError, setJoinError] = useState('');
  const [joinSuccess, setJoinSuccess] = useState(false);

  // Bottom sheet animation
  const inviteTranslateY = useSharedValue(300);
  const removeTranslateY = useSharedValue(300);

  const currentUserId = auth.currentUser?.uid ?? '';
  const [scoresReleased, setScoresReleased] = useState(haveScoresDropped());

  // Poll score release status every second
  useEffect(() => {
    const interval = setInterval(() => setScoresReleased(haveScoresDropped()), 1000);
    return () => clearInterval(interval);
  }, []);

  // Slide in from left on every tab focus
  useFocusEffect(
    useCallback(() => {
      opacity.value = 0;
      translateX.value = -40;
      opacity.value = withTiming(1, { duration: 300, easing: Easing.out(Easing.ease) });
      translateX.value = withTiming(0, { duration: 300, easing: Easing.out(Easing.ease) });
    }, [])
  );

  // Reload groups + leaderboard data every time the tab is focused
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      const load = async () => {
        try {
          const uid = auth.currentUser?.uid;
          if (uid) {
            const userGroups = await getUserGroups(uid);
            const groupsWithLb: GroupWithLeaderboard[] = await Promise.all(
              userGroups.map(async (g) => {
                const [lb, groupDoc] = await Promise.all([
                  getGroupLeaderboard(g.id),
                  getGroupDoc(g.id),
                ]);
                return {
                  id: g.id,
                  name: g.name,
                  ownerId: groupDoc?.createdBy ?? '',
                  inviteCode: groupDoc?.inviteCode ?? '',
                  entries: lb.map((e) => ({
                    userId: e.userId,
                    username: e.username,
                    score: e.totalScore,
                    wins: e.wins,
                    streak: e.currentStreak,
                    avgPct: e.avgPct,
                  })),
                };
              }),
            );
            if (!cancelled) setGroups(groupsWithLb);
          }
        } catch (e) {
          console.log('[SNIPE] Error loading leaderboard:', e);
        }
        if (!cancelled) {
          setLoading(false);
        }
      };
      load();
      return () => { cancelled = true; };
    }, [])
  );

  // Scroll to focused group after loading
  useEffect(() => {
    if (!loading && focusGroupId) {
      setTimeout(() => {
        const y = groupLayoutsRef.current[focusGroupId];
        if (y != null && scrollRef.current) {
          scrollRef.current.scrollTo({ y, animated: true });
        }
      }, 300);
    }
  }, [loading, focusGroupId]);

  const fadeStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateX: translateX.value }],
  }));

  const inviteSheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: inviteTranslateY.value }],
  }));

  const removeSheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: removeTranslateY.value }],
  }));

  // ─── Invite Bottom Sheet ─────────────────────────────────────────────

  const openInviteSheet = (group: GroupWithLeaderboard) => {
    setInviteGroup(group);
    setCopied(false);
    inviteTranslateY.value = 300;
    setTimeout(() => {
      inviteTranslateY.value = withTiming(0, { duration: 250 });
    }, 50);
  };

  const closeInviteSheet = () => {
    inviteTranslateY.value = withTiming(300, { duration: 200 });
    setTimeout(() => setInviteGroup(null), 200);
  };

  const sharingRef = useRef(false);
  const handleShareInvite = async () => {
    if (!inviteGroup || sharingRef.current) return;
    sharingRef.current = true;
    try {
      const link = buildInviteLink(inviteGroup.id, inviteGroup.inviteCode);
      await Share.share({ message: `Join my trivia group on Snipe\n${link}` });
    } catch (e) {
      // user dismissed or share failed
    } finally {
      sharingRef.current = false;
    }
  };

  const handleCopyLink = async () => {
    if (!inviteGroup) return;
    const link = buildInviteLink(inviteGroup.id, inviteGroup.inviteCode);
    await Clipboard.setStringAsync(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // ─── Remove Member Bottom Sheet ──────────────────────────────────────

  const openRemoveSheet = (groupId: string, groupName: string, userId: string, username: string) => {
    setRemoveTarget({ groupId, groupName, userId, username });
    setRemoving(false);
    removeTranslateY.value = 300;
    setTimeout(() => {
      removeTranslateY.value = withTiming(0, { duration: 250 });
    }, 50);
  };

  const closeRemoveSheet = () => {
    removeTranslateY.value = withTiming(300, { duration: 200 });
    setTimeout(() => setRemoveTarget(null), 200);
  };

  const handleRemoveMember = async () => {
    if (!removeTarget) return;
    setRemoving(true);
    try {
      await removeMember(removeTarget.groupId, removeTarget.userId);
      // Optimistic update: remove the member from local state
      setGroups((prev) =>
        prev.map((g) =>
          g.id === removeTarget.groupId
            ? { ...g, entries: g.entries.filter((e) => e.userId !== removeTarget.userId) }
            : g
        )
      );
      closeRemoveSheet();
    } catch (e) {
      console.log('[SNIPE] Error removing member:', e);
      setRemoving(false);
    }
  };

  // ─── Join Group ────────────────────────────────────────────────────────

  const openJoinModal = () => {
    setJoinCode('');
    setJoinError('');
    setJoinSuccess(false);
    setShowJoinModal(true);
  };

  const closeJoinModal = () => {
    setShowJoinModal(false);
    setJoinCode('');
    setJoinError('');
    setJoinLoading(false);
    setJoinSuccess(false);
  };

  const handleJoinGroup = async () => {
    setJoinLoading(true);
    setJoinError('');
    try {
      const uid = auth.currentUser?.uid;
      if (!uid) throw new Error('Not signed in');
      const result = await joinGroup(uid, joinCode.trim());
      if (!result) {
        setJoinError('Invalid invite code');
        setJoinLoading(false);
        return;
      }
      setJoinSuccess(true);
      // Reload leaderboard data
      const userGroups = await getUserGroups(uid);
      const groupsWithLb: GroupWithLeaderboard[] = await Promise.all(
        userGroups.map(async (g) => {
          const [lb, groupDoc] = await Promise.all([
            getGroupLeaderboard(g.id),
            getGroupDoc(g.id),
          ]);
          return {
            id: g.id,
            name: g.name,
            ownerId: groupDoc?.createdBy ?? '',
            inviteCode: groupDoc?.inviteCode ?? '',
            entries: lb.map((e) => ({
              userId: e.userId,
              username: e.username,
              score: e.totalScore,
              wins: e.wins,
              streak: e.currentStreak,
              avgPct: e.avgPct,
            })),
          };
        }),
      );
      setGroups(groupsWithLb);
      setTimeout(closeJoinModal, 1000);
    } catch (e) {
      console.log('[SNIPE] Error joining group:', e);
      setJoinError('Failed to join group');
    } finally {
      setJoinLoading(false);
    }
  };

  // ─── Render ──────────────────────────────────────────────────────────

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#000000' }}>
        <ScrollView style={{ paddingHorizontal: 20, paddingTop: 16 }}>
          <View style={{ marginBottom: 32 }}>
            <SkeletonLoader width={160} height={28} borderRadius={8} />
          </View>

          {[0, 1].map((groupIdx) => (
            <View key={groupIdx} style={{ marginBottom: 40 }}>
              <SkeletonLoader width={140} height={22} borderRadius={8} />
              <View style={{ height: 1, backgroundColor: '#1A1A1A', marginVertical: 12 }} />
              {[0, 1, 2, 3, 4].map((rowIdx) => (
                <View key={rowIdx} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 12 }}>
                  <SkeletonLoader width={24} height={24} borderRadius={4} />
                  <SkeletonLoader width={100} height={18} borderRadius={6} />
                  <View style={{ flex: 1 }} />
                  <SkeletonLoader width={36} height={16} borderRadius={4} />
                  <SkeletonLoader width={36} height={16} borderRadius={4} />
                  <SkeletonLoader width={36} height={16} borderRadius={4} />
                </View>
              ))}
            </View>
          ))}
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#000000' }}>
      <Animated.ScrollView ref={scrollRef as any} style={[{ paddingHorizontal: 20, paddingTop: 16 }, fadeStyle]}>
        <Text
          style={{
            fontFamily: 'Urbanist_700Bold',
            fontSize: 28,
            color: '#FFFFFF',
            marginBottom: 32,
          }}
        >
          Leaderboard
        </Text>

        {groups.length === 0 ? (
          <View style={{ alignItems: 'center', paddingTop: 60 }}>
            <Text style={{ fontFamily: 'Urbanist_400Regular', fontSize: 16, color: '#888888', textAlign: 'center', marginBottom: 24 }}>
              Join a group to see a leaderboard.
            </Text>
            <Pressable
              onPress={openJoinModal}
              style={{
                backgroundColor: '#FFFFFF',
                borderRadius: 16,
                paddingVertical: 16,
                paddingHorizontal: 32,
                alignItems: 'center',
              }}
            >
              <Text style={{ fontFamily: 'Urbanist_700Bold', fontSize: 16, color: '#000000' }}>
                Join Group
              </Text>
            </Pressable>
          </View>
        ) : (
          groups.map((group) => {
            const isOwner = group.ownerId === currentUserId;
            return (
              <View
                key={group.id}
                onLayout={(e) => { groupLayoutsRef.current[group.id] = e.nativeEvent.layout.y; }}
              >
                <LeaderboardTable
                  groupName={group.name}
                  entries={group.entries}
                  isOwner={isOwner}
                  currentUserId={currentUserId}
                  scoresReleased={scoresReleased}
                  onInvite={() => openInviteSheet(group)}
                  onRemoveMember={(userId, username) => openRemoveSheet(group.id, group.name, userId, username)}
                />
              </View>
            );
          })
        )}
      </Animated.ScrollView>

      {/* ─── Invite Members Bottom Sheet ─────────────────────────────── */}
      <Modal visible={inviteGroup !== null} transparent>
        <Pressable
          onPress={closeInviteSheet}
          style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.85)' }}
        >
          <Animated.View style={[inviteSheetStyle]}>
            <Pressable
              onPress={() => {}}
              style={{
                backgroundColor: '#0F0F0F',
                borderTopLeftRadius: 24,
                borderTopRightRadius: 24,
                padding: 24,
              }}
            >
              {/* Drag handle */}
              <View style={{ alignItems: 'center', marginBottom: 16 }}>
                <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: '#FFFFFF' }} />
              </View>

              <Text style={{ fontFamily: 'Urbanist_700Bold', fontSize: 20, color: '#FFFFFF', marginBottom: 8 }}>
                Invite to {inviteGroup?.name}
              </Text>
              <Text style={{ fontFamily: 'Urbanist_400Regular', fontSize: 14, color: '#888888', marginBottom: 20 }}>
                Anyone with this link can join.
              </Text>

              {/* Invite link display */}
              <View style={{ backgroundColor: '#111111', borderRadius: 16, padding: 16, marginBottom: 20 }}>
                <Text
                  numberOfLines={1}
                  style={{ fontFamily: 'Urbanist_400Regular', fontSize: 13, color: '#888888' }}
                >
                  {inviteGroup ? buildInviteLink(inviteGroup.id, inviteGroup.inviteCode) : ''}
                </Text>
              </View>

              {/* Share button */}
              <Pressable
                onPress={handleShareInvite}
                style={{
                  backgroundColor: '#FFFFFF',
                  borderRadius: 16,
                  paddingVertical: 16,
                  alignItems: 'center',
                  marginBottom: 12,
                }}
              >
                <Text style={{ fontFamily: 'Urbanist_700Bold', fontSize: 16, color: '#000000' }}>
                  Share Invite Link
                </Text>
              </Pressable>

              {/* Copy link button */}
              <Pressable
                onPress={handleCopyLink}
                style={{
                  backgroundColor: '#000000',
                  borderWidth: 1,
                  borderColor: '#FFFFFF',
                  borderRadius: 16,
                  paddingVertical: 16,
                  alignItems: 'center',
                  marginBottom: 20,
                }}
              >
                <Text style={{ fontFamily: 'Urbanist_700Bold', fontSize: 16, color: '#FFFFFF' }}>
                  {copied ? 'Copied \u2713' : 'Copy Link'}
                </Text>
              </Pressable>

              {/* Fallback invite code */}
              <Text style={{ fontFamily: 'Urbanist_400Regular', fontSize: 12, color: '#888888', textAlign: 'center' }}>
                Invite code: {inviteGroup?.inviteCode}
              </Text>
            </Pressable>
          </Animated.View>
        </Pressable>
      </Modal>

      {/* ─── Remove Member Bottom Sheet ──────────────────────────────── */}
      <Modal visible={removeTarget !== null} transparent>
        <Pressable
          onPress={closeRemoveSheet}
          style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.85)' }}
        >
          <Animated.View style={[removeSheetStyle]}>
            <Pressable
              onPress={() => {}}
              style={{
                backgroundColor: '#0F0F0F',
                borderTopLeftRadius: 24,
                borderTopRightRadius: 24,
                padding: 24,
              }}
            >
              {/* Drag handle */}
              <View style={{ alignItems: 'center', marginBottom: 16 }}>
                <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: '#FFFFFF' }} />
              </View>

              <Text style={{ fontFamily: 'Urbanist_700Bold', fontSize: 20, color: '#FFFFFF', marginBottom: 8 }}>
                Remove {removeTarget?.username}?
              </Text>
              <Text style={{ fontFamily: 'Urbanist_400Regular', fontSize: 14, color: '#888888', marginBottom: 24 }}>
                They'll lose access to {removeTarget?.groupName} and won't appear on this leaderboard.
              </Text>

              {/* Remove button */}
              <Pressable
                onPress={handleRemoveMember}
                disabled={removing}
                style={{
                  backgroundColor: '#EF4444',
                  borderRadius: 16,
                  paddingVertical: 16,
                  alignItems: 'center',
                  marginBottom: 12,
                  opacity: removing ? 0.6 : 1,
                }}
              >
                <Text style={{ fontFamily: 'Urbanist_700Bold', fontSize: 16, color: '#FFFFFF' }}>
                  {removing ? 'Removing...' : 'Remove'}
                </Text>
              </Pressable>

              {/* Cancel button */}
              <Pressable
                onPress={closeRemoveSheet}
                style={{
                  backgroundColor: '#111111',
                  borderRadius: 16,
                  paddingVertical: 16,
                  alignItems: 'center',
                }}
              >
                <Text style={{ fontFamily: 'Urbanist_700Bold', fontSize: 16, color: '#FFFFFF' }}>
                  Cancel
                </Text>
              </Pressable>
            </Pressable>
          </Animated.View>
        </Pressable>
      </Modal>

      {/* ─── Join Group Modal ────────────────────────────────────────── */}
      <Modal visible={showJoinModal} transparent animationType="slide">
        <Pressable onPress={closeJoinModal} style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.85)' }}>
          <Pressable onPress={() => {}} style={{ backgroundColor: '#0F0F0F', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24 }}>
            <View style={{ alignItems: 'center', marginBottom: 16 }}>
              <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: '#FFFFFF' }} />
            </View>
            <Text style={{ fontFamily: 'Urbanist_700Bold', fontSize: 20, color: '#FFFFFF', marginBottom: 20 }}>
              Join Group
            </Text>
            {!joinSuccess ? (
              <>
                <TextInput
                  placeholder="Invite code"
                  placeholderTextColor="#888888"
                  value={joinCode}
                  onChangeText={setJoinCode}
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
                {joinError ? (
                  <Text style={{ fontFamily: 'Urbanist_400Regular', fontSize: 13, color: '#EF4444', marginBottom: 8 }}>{joinError}</Text>
                ) : null}
                <Pressable
                  onPress={handleJoinGroup}
                  disabled={joinLoading || !joinCode.trim()}
                  style={{
                    backgroundColor: '#FFFFFF',
                    borderRadius: 16,
                    paddingVertical: 16,
                    alignItems: 'center',
                    opacity: joinLoading || !joinCode.trim() ? 0.5 : 1,
                  }}
                >
                  <Text style={{ fontFamily: 'Urbanist_700Bold', fontSize: 16, color: '#000000' }}>
                    {joinLoading ? 'Joining...' : 'Join'}
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
    </SafeAreaView>
  );
}
