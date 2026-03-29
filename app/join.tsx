import { useState, useEffect } from 'react';
import { View, Text, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { auth } from '../lib/firebase';
import { joinGroup } from '../lib/firestore';
import { getGroupDoc } from '../lib/groupUtils';

type JoinState = 'loading' | 'success' | 'already_member' | 'invalid';

export default function JoinScreen() {
  const { groupId, code } = useLocalSearchParams<{ groupId?: string; code?: string }>();
  const router = useRouter();
  const [state, setState] = useState<JoinState>('loading');
  const [groupName, setGroupName] = useState('');

  useEffect(() => {
    const attempt = async () => {
      if (!code) {
        setState('invalid');
        return;
      }

      const uid = auth.currentUser?.uid;
      if (!uid) {
        // Not logged in — redirect to login, then they can re-open the link
        router.replace('/auth/login');
        return;
      }

      try {
        // If we have a groupId, check membership first
        if (groupId) {
          const groupDoc = await getGroupDoc(groupId);
          if (!groupDoc) {
            setState('invalid');
            return;
          }
          setGroupName(groupDoc.name);
          if (groupDoc.memberIds.includes(uid)) {
            setState('already_member');
            return;
          }
        }

        // Attempt to join via invite code
        const result = await joinGroup(uid, code);
        if (!result) {
          setState('invalid');
          return;
        }

        setGroupName(result.groupName);

        // Check if joinGroup returned because they were already a member
        // (joinGroup returns the group info even if already a member)
        if (groupId) {
          const groupDoc = await getGroupDoc(groupId);
          if (groupDoc && groupDoc.memberIds.includes(uid)) {
            // We just added them, but let's check the count changed
            // If we already set already_member above we won't reach here
            setState('success');
            return;
          }
        }

        setState('success');
      } catch (e) {
        console.log('[SNIPE] Error joining group via link:', e);
        setState('invalid');
      }
    };

    attempt();
  }, [groupId, code]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#000000' }}>
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32 }}>
        {state === 'loading' && (
          <>
            <ActivityIndicator size="large" color="#FFFFFF" style={{ marginBottom: 16 }} />
            <Text style={{ fontFamily: 'Urbanist_400Regular', fontSize: 16, color: '#888888' }}>
              Joining group...
            </Text>
          </>
        )}

        {state === 'success' && (
          <>
            <Text style={{ fontFamily: 'Urbanist_700Bold', fontSize: 28, color: '#FFFFFF', textAlign: 'center', marginBottom: 12 }}>
              You're in!
            </Text>
            <Text style={{ fontFamily: 'Urbanist_400Regular', fontSize: 16, color: '#888888', textAlign: 'center', marginBottom: 32 }}>
              You've joined {groupName}.
            </Text>
            <Pressable
              onPress={() => router.replace('/(tabs)/leaderboard')}
              style={{
                backgroundColor: '#22C55E',
                borderRadius: 16,
                paddingVertical: 16,
                paddingHorizontal: 40,
                alignItems: 'center',
              }}
            >
              <Text style={{ fontFamily: 'Urbanist_700Bold', fontSize: 16, color: '#FFFFFF' }}>
                View Leaderboard
              </Text>
            </Pressable>
          </>
        )}

        {state === 'already_member' && (
          <>
            <Text style={{ fontFamily: 'Urbanist_700Bold', fontSize: 28, color: '#FFFFFF', textAlign: 'center', marginBottom: 12 }}>
              Already a member
            </Text>
            <Text style={{ fontFamily: 'Urbanist_400Regular', fontSize: 16, color: '#888888', textAlign: 'center', marginBottom: 32 }}>
              You're already in {groupName}.
            </Text>
            <Pressable
              onPress={() => router.replace('/(tabs)/leaderboard')}
              style={{
                backgroundColor: '#FFFFFF',
                borderRadius: 16,
                paddingVertical: 16,
                paddingHorizontal: 40,
                alignItems: 'center',
              }}
            >
              <Text style={{ fontFamily: 'Urbanist_700Bold', fontSize: 16, color: '#000000' }}>
                View Leaderboard
              </Text>
            </Pressable>
          </>
        )}

        {state === 'invalid' && (
          <>
            <Text style={{ fontFamily: 'Urbanist_700Bold', fontSize: 28, color: '#FFFFFF', textAlign: 'center', marginBottom: 12 }}>
              Invalid link
            </Text>
            <Text style={{ fontFamily: 'Urbanist_400Regular', fontSize: 16, color: '#888888', textAlign: 'center', marginBottom: 32 }}>
              This invite link is expired or doesn't exist.
            </Text>
            <Pressable
              onPress={() => router.replace('/(tabs)')}
              style={{
                backgroundColor: '#FFFFFF',
                borderRadius: 16,
                paddingVertical: 16,
                paddingHorizontal: 40,
                alignItems: 'center',
              }}
            >
              <Text style={{ fontFamily: 'Urbanist_700Bold', fontSize: 16, color: '#000000' }}>
                Go Home
              </Text>
            </Pressable>
          </>
        )}
      </View>
    </SafeAreaView>
  );
}
