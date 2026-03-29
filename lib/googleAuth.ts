// lib/googleAuth.ts — Google Sign-In via expo-auth-session + Firebase

import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import { GoogleAuthProvider, signInWithCredential } from 'firebase/auth';
import { auth } from './firebase';

// Complete auth session on native
WebBrowser.maybeCompleteAuthSession();

// Get this from Firebase Console → Authentication → Sign-in method → Google → Web client ID
const WEB_CLIENT_ID = '132441623910-noq8nqhqrseo9s5hmapou7m88hbg0rce.apps.googleusercontent.com';

export function useGoogleAuth() {
  const [request, response, promptAsync] = Google.useIdTokenAuthRequest({
    clientId: WEB_CLIENT_ID,
  });

  const signInWithGoogle = async (): Promise<{ uid: string; email: string; displayName: string | null } | null> => {
    const result = await promptAsync();

    if (result.type !== 'success') return null;

    const idToken = result.params.id_token;
    const credential = GoogleAuthProvider.credential(idToken);
    const userCred = await signInWithCredential(auth, credential);

    return {
      uid: userCred.user.uid,
      email: userCred.user.email ?? '',
      displayName: userCred.user.displayName,
    };
  };

  return { request, response, signInWithGoogle };
}
