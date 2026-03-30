import { useState } from 'react';
import { View, Text, TextInput, Pressable, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import SnipeWordmark from '../../components/SnipeWordmark';
import { useGoogleAuth } from '../../lib/googleAuth';
import { createUserProfile, getUserProfile } from '../../lib/firestore';

export default function Signup() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { request: googleRequest, signInWithGoogle } = useGoogleAuth();

  const redirectAfterAuth = async () => {
    const pending = await AsyncStorage.getItem('snipe_pending_invite');
    if (pending) {
      await AsyncStorage.removeItem('snipe_pending_invite');
      const { groupId, code } = JSON.parse(pending);
      router.replace(`/join?groupId=${groupId}&code=${code}`);
    } else {
      router.replace('/(tabs)');
    }
  };

  const handleSignup = async () => {
    setError('');

    if (username.length > 12) {
      setError('Username must be 12 characters or less');
      return;
    }

    if (!username.trim()) {
      setError('Username is required');
      return;
    }

    setLoading(true);

    try {
      const { createUserWithEmailAndPassword } = await import('firebase/auth');
      const { auth } = await import('../../lib/firebase');
      const { createUserProfile, checkUsernameAvailable } = await import('../../lib/firestore');

      // Check username uniqueness
      const available = await checkUsernameAvailable(username.trim());
      if (!available) {
        setError('Username is already taken');
        setLoading(false);
        return;
      }

      const cred = await createUserWithEmailAndPassword(auth, email, password);
      await createUserProfile(cred.user.uid, username.trim(), email);
      await redirectAfterAuth();
    } catch (e: any) {
      console.log('[SNIPE] Signup error:', e?.message);
      if (e?.code === 'auth/email-already-in-use') {
        setError('Email is already in use');
      } else if (e?.code === 'auth/weak-password') {
        setError('Password must be at least 6 characters');
      } else {
        // Mock auth fallback
        await redirectAfterAuth();
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#000000' }}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 24 }}
      >
        <View style={{ alignItems: 'center', marginBottom: 60 }}>
          <SnipeWordmark size="lg" />
        </View>

        <View style={{ gap: 16 }}>
          <View>
            <TextInput
              placeholder="Username"
              placeholderTextColor="#888888"
              value={username}
              onChangeText={setUsername}
              maxLength={12}
              autoCapitalize="none"
              style={{
                fontFamily: 'Urbanist_400Regular',
                fontSize: 16,
                color: '#FFFFFF',
                backgroundColor: '#000000',
                borderWidth: 1,
                borderColor: '#222222',
                borderRadius: 16,
                paddingHorizontal: 20,
                paddingVertical: 18,
              }}
            />
            <Text
              style={{
                fontFamily: 'Urbanist_400Regular',
                fontSize: 12,
                color: '#888888',
                marginTop: 6,
                marginLeft: 4,
              }}
            >
              {username || 'username'} ({username.length}/12)
            </Text>
          </View>

          <TextInput
            placeholder="Email"
            placeholderTextColor="#888888"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            style={{
              fontFamily: 'Urbanist_400Regular',
              fontSize: 16,
              color: '#FFFFFF',
              backgroundColor: '#000000',
              borderWidth: 1,
              borderColor: '#222222',
              borderRadius: 16,
              paddingHorizontal: 20,
              paddingVertical: 18,
            }}
          />

          <TextInput
            placeholder="Password"
            placeholderTextColor="#888888"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            style={{
              fontFamily: 'Urbanist_400Regular',
              fontSize: 16,
              color: '#FFFFFF',
              backgroundColor: '#000000',
              borderWidth: 1,
              borderColor: '#222222',
              borderRadius: 16,
              paddingHorizontal: 20,
              paddingVertical: 18,
            }}
          />

          {error ? (
            <Text style={{ fontFamily: 'Urbanist_400Regular', fontSize: 14, color: '#EF4444', textAlign: 'center' }}>
              {error}
            </Text>
          ) : null}

          <Pressable
            onPress={handleSignup}
            disabled={loading}
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: 20,
              paddingVertical: 18,
              alignItems: 'center',
              marginTop: 8,
              opacity: loading ? 0.6 : 1,
            }}
          >
            <Text
              style={{
                fontFamily: 'Urbanist_700Bold',
                fontSize: 18,
                color: '#000000',
              }}
            >
              {loading ? 'Creating account...' : 'Create Account'}
            </Text>
          </Pressable>

          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 16 }}>
            <View style={{ flex: 1, height: 1, backgroundColor: '#222222' }} />
            <Text style={{ fontFamily: 'Urbanist_400Regular', fontSize: 13, color: '#888888', marginHorizontal: 12 }}>or</Text>
            <View style={{ flex: 1, height: 1, backgroundColor: '#222222' }} />
          </View>

          <Pressable
            onPress={async () => {
              setError('');
              setLoading(true);
              try {
                const result = await signInWithGoogle();
                if (result) {
                  // Check if user profile already exists (returning Google user)
                  const existing = await getUserProfile(result.uid);
                  if (!existing) {
                    // New Google user — create profile using display name or email prefix
                    const autoUsername = (result.displayName || result.email.split('@')[0]).slice(0, 12);
                    await createUserProfile(result.uid, autoUsername, result.email);
                  }
                  await redirectAfterAuth();
                }
              } catch (e: any) {
                console.log('[SNIPE] Google sign-up error:', e?.message);
                setError('Google sign-in failed');
              } finally {
                setLoading(false);
              }
            }}
            disabled={loading || !googleRequest}
            style={{
              backgroundColor: '#000000',
              borderRadius: 20,
              paddingVertical: 18,
              alignItems: 'center',
              borderWidth: 1,
              borderColor: '#333333',
              marginTop: 12,
              opacity: loading || !googleRequest ? 0.5 : 1,
            }}
          >
            <Text
              style={{
                fontFamily: 'Urbanist_700Bold',
                fontSize: 18,
                color: '#FFFFFF',
              }}
            >
              Continue with Google
            </Text>
          </Pressable>

          <Pressable onPress={() => router.back()} style={{ alignItems: 'center', marginTop: 16 }}>
            <Text style={{ fontFamily: 'Urbanist_400Regular', fontSize: 14, color: '#888888' }}>
              Already have an account?{' '}
              <Text style={{ color: '#FFFFFF' }}>Sign in</Text>
            </Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
