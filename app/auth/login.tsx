import { useState, useEffect } from 'react';
import { View, Text, TextInput, Pressable, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import SnipeWordmark from '../../components/SnipeWordmark';
import { useGoogleAuth } from '../../lib/googleAuth';

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [resetSent, setResetSent] = useState(false);
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

  const handleForgotPassword = async () => {
    if (!email.trim()) {
      setError('Enter your email address first');
      return;
    }
    setError('');
    try {
      const { sendPasswordResetEmail } = await import('firebase/auth');
      const { auth } = await import('../../lib/firebase');
      await sendPasswordResetEmail(auth, email);
      setResetSent(true);
    } catch (e: any) {
      if (e?.code === 'auth/invalid-email') {
        setError('Invalid email address');
      } else if (e?.code === 'auth/user-not-found') {
        setResetSent(true);
      } else {
        setError(e?.message || 'Failed to send reset email');
      }
    }
  };

  const handleLogin = async () => {
    setError('');
    setLoading(true);

    try {
      const { signInWithEmailAndPassword } = await import('firebase/auth');
      const { auth } = await import('../../lib/firebase');
      await signInWithEmailAndPassword(auth, email, password);
      await redirectAfterAuth();
    } catch (e: any) {
      console.log('[SNIPE] Login error:', e?.code, e?.message);
      if (e?.code === 'auth/user-not-found' || e?.code === 'auth/invalid-credential') {
        setError('Invalid email or password');
      } else if (e?.code === 'auth/wrong-password') {
        setError('Invalid email or password');
      } else if (e?.code === 'auth/invalid-email') {
        setError('Invalid email address');
      } else if (e?.code === 'auth/too-many-requests') {
        setError('Too many attempts. Try again later.');
      } else {
        setError(e?.message || 'Sign in failed');
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

          <Pressable onPress={handleForgotPassword} style={{ alignSelf: 'flex-end', marginTop: -8 }}>
            <Text style={{ fontFamily: 'Urbanist_400Regular', fontSize: 13, color: '#888888' }}>
              Forgot password?
            </Text>
          </Pressable>

          {resetSent ? (
            <Text style={{ fontFamily: 'Urbanist_400Regular', fontSize: 14, color: '#22C55E', textAlign: 'center' }}>
              Password reset email sent. Check your inbox.
            </Text>
          ) : null}

          {error ? (
            <Text style={{ fontFamily: 'Urbanist_400Regular', fontSize: 14, color: '#EF4444', textAlign: 'center' }}>
              {error}
            </Text>
          ) : null}

          <Pressable
            onPress={handleLogin}
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
              {loading ? 'Signing in...' : 'Sign In'}
            </Text>
          </Pressable>

          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 16 }}>
            <View style={{ flex: 1, height: 1, backgroundColor: '#222222' }} />
            <Text style={{ fontFamily: 'Urbanist_400Regular', fontSize: 13, color: '#888888', marginHorizontal: 12 }}>or</Text>
            <View style={{ flex: 1, height: 1, backgroundColor: '#222222' }} />
          </View>

         

          <Pressable onPress={() => router.push('/auth/signup')} style={{ alignItems: 'center', marginTop: 16 }}>
            <Text style={{ fontFamily: 'Urbanist_400Regular', fontSize: 14, color: '#888888' }}>
              Don't have an account?{' '}
              <Text style={{ color: '#FFFFFF' }}>Sign up</Text>
            </Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
