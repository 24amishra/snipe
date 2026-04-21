import { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { sendEmailVerification, signOut } from 'firebase/auth';
import { auth } from '../../lib/firebase';
import { createUserProfile } from '../../lib/firestore';
import SnipeWordmark from '../../components/SnipeWordmark';

export default function Verify() {
  const router = useRouter();
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const handleResend = async () => {
    setError('');
    setMessage('');
    setLoading(true);
    try {
      const user = auth.currentUser;
      if (user) {
        await sendEmailVerification(user);
        setMessage('Verification email sent!');
      }
    } catch (e: any) {
      if (e?.code === 'auth/too-many-requests') {
        setError('Too many attempts. Please wait a few minutes before trying again.');
      } else {
        setError(e?.message || 'Failed to resend email');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleCheckVerified = async () => {
    setError('');
    setMessage('');
    setLoading(true);
    try {
      const user = auth.currentUser;
      if (user) {
        await user.reload();
        if (user.emailVerified) {
          // Force token refresh so Firestore rules see email_verified = true
          await user.getIdToken(true);
          // Create user profile now that email is verified
          const pendingUsername = await AsyncStorage.getItem('snipe_pending_username');
          if (pendingUsername) {
            await createUserProfile(user.uid, pendingUsername, user.email || '');
            await AsyncStorage.removeItem('snipe_pending_username');
          }
          router.replace('/(tabs)');
        } else {
          setError('Email not yet verified');
        }
      }
    } catch (e: any) {
      setError(e?.message || 'Failed to check verification');
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      router.replace('/auth/login');
    } catch (e: any) {
      setError(e?.message || 'Failed to sign out');
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#000000' }}>
      <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 24 }}>
        <View style={{ alignItems: 'center', marginBottom: 60 }}>
          <SnipeWordmark size="lg" />
        </View>

        <Text
          style={{
            fontFamily: 'Urbanist_700Bold',
            fontSize: 24,
            color: '#FFFFFF',
            textAlign: 'center',
            marginBottom: 12,
          }}
        >
          Verify your email
        </Text>

        <Text
          style={{
            fontFamily: 'Urbanist_400Regular',
            fontSize: 16,
            color: '#888888',
            textAlign: 'center',
            marginBottom: 40,
            lineHeight: 24,
          }}
        >
          We sent a verification link to your email. Please check your inbox and click the link to continue.
        </Text>

        {error ? (
          <Text style={{ fontFamily: 'Urbanist_400Regular', fontSize: 14, color: '#EF4444', textAlign: 'center', marginBottom: 16 }}>
            {error}
          </Text>
        ) : null}

        {message ? (
          <Text style={{ fontFamily: 'Urbanist_400Regular', fontSize: 14, color: '#22C55E', textAlign: 'center', marginBottom: 16 }}>
            {message}
          </Text>
        ) : null}

        <View style={{ gap: 12 }}>
          <Pressable
            onPress={handleCheckVerified}
            disabled={loading}
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: 20,
              paddingVertical: 18,
              alignItems: 'center',
              opacity: loading ? 0.6 : 1,
            }}
          >
            <Text style={{ fontFamily: 'Urbanist_700Bold', fontSize: 18, color: '#000000' }}>
              I've verified
            </Text>
          </Pressable>

          <Pressable
            onPress={handleResend}
            disabled={loading}
            style={{
              backgroundColor: '#000000',
              borderWidth: 1,
              borderColor: '#222222',
              borderRadius: 20,
              paddingVertical: 18,
              alignItems: 'center',
              opacity: loading ? 0.6 : 1,
            }}
          >
            <Text style={{ fontFamily: 'Urbanist_700Bold', fontSize: 18, color: '#FFFFFF' }}>
              Resend email
            </Text>
          </Pressable>

          <Pressable onPress={handleSignOut} style={{ alignItems: 'center', marginTop: 16 }}>
            <Text style={{ fontFamily: 'Urbanist_400Regular', fontSize: 14, color: '#888888' }}>
              Back to sign in
            </Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}
