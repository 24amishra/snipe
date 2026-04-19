import { useState, useEffect } from 'react';
import { View, Text, Pressable, ActivityIndicator, Platform, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { auth } from '../lib/firebase';
import { joinGroup } from '../lib/firestore';
import { getGroupDoc } from '../lib/groupUtils';

type JoinState = 'loading' | 'success' | 'already_member' | 'invalid' | 'download';

// TODO: Replace with your real App Store ID from App Store Connect
const APP_STORE_URL = 'https://apps.apple.com/app/snipe/6761794679';
const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=app.snipe.trivia';

function detectMobileOS(): 'ios' | 'android' | 'desktop' {
  if (typeof navigator === 'undefined') return 'desktop';
  const ua = navigator.userAgent || '';
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  return 'desktop';
}

export default function JoinScreen() {
  const { groupId, code } = useLocalSearchParams<{ groupId?: string; code?: string }>();
  const router = useRouter();
  const [state, setState] = useState<JoinState>('loading');
  const [groupName, setGroupName] = useState('');

  useEffect(() => {
    const attempt = async () => {
      // Web: user doesn't have the app — redirect to app store
      if (Platform.OS === 'web') {
        const os = detectMobileOS();
        if (os === 'ios') {
          window.location.href = APP_STORE_URL;
          return;
        }
        if (os === 'android') {
          window.location.href = PLAY_STORE_URL;
          return;
        }
        // Desktop browser — show download prompt
        setState('download');
        return;
      }

      // Native app flow
      if (!code) {
        setState('invalid');
        return;
      }

      // Check auth FIRST — Firestore rules require authentication
      const uid = auth.currentUser?.uid;
      if (!uid) {
        // Not logged in — save pending invite and redirect to login
        await AsyncStorage.setItem('snipe_pending_invite', JSON.stringify({ groupId, code }));
        router.replace('/auth/login');
        return;
      }

      try {
        // Validate the invite link
        if (groupId) {
          const groupDoc = await getGroupDoc(groupId);
          if (!groupDoc || groupDoc.inviteCode !== code) {
            setState('invalid');
            return;
          }
          setGroupName(groupDoc.name);

          // Check if already a member
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

        {state === 'download' && (
          <>
            <Text style={{ fontFamily: 'Urbanist_700Bold', fontSize: 28, color: '#FFFFFF', textAlign: 'center', marginBottom: 12 }}>
              Get Snipe
            </Text>
            <Text style={{ fontFamily: 'Urbanist_400Regular', fontSize: 16, color: '#888888', textAlign: 'center', marginBottom: 32 }}>
              Download Snipe to join this group.
            </Text>
            <Pressable
              onPress={() => Linking.openURL(APP_STORE_URL)}
              style={{
                backgroundColor: '#FFFFFF',
                borderRadius: 16,
                paddingVertical: 16,
                paddingHorizontal: 40,
                alignItems: 'center',
                marginBottom: 12,
                width: '100%',
              }}
            >
              <Text style={{ fontFamily: 'Urbanist_700Bold', fontSize: 16, color: '#000000' }}>
                Download for iPhone
              </Text>
            </Pressable>
            <Pressable
              onPress={() => Linking.openURL(PLAY_STORE_URL)}
              style={{
                backgroundColor: '#000000',
                borderWidth: 1,
                borderColor: '#333333',
                borderRadius: 16,
                paddingVertical: 16,
                paddingHorizontal: 40,
                alignItems: 'center',
                width: '100%',
              }}
            >
              <Text style={{ fontFamily: 'Urbanist_700Bold', fontSize: 16, color: '#FFFFFF' }}>
                Download for Android
              </Text>
            </Pressable>
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
              onPress={() => router.replace('/(tabs)')}
              style={{
                backgroundColor: '#22C55E',
                borderRadius: 16,
                paddingVertical: 16,
                paddingHorizontal: 40,
                alignItems: 'center',
              }}
            >
              <Text style={{ fontFamily: 'Urbanist_700Bold', fontSize: 16, color: '#FFFFFF' }}>
                Go Home
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
