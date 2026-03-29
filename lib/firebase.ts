// lib/firebase.ts

import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getDatabase } from 'firebase/database';

const firebaseConfig = {
  apiKey: "AIzaSyBBNXJouutJl0_IX3EOmFyrG8FZ9DL7Eng",
  authDomain: "snipe-a8330.firebaseapp.com",
  databaseURL: "https://snipe-a8330-default-rtdb.firebaseio.com",
  projectId: "snipe-a8330",
  storageBucket: "snipe-a8330.firebasestorage.app",
  messagingSenderId: "132441623910",
  appId: "1:132441623910:web:c2749a6d02031c33f48ca7",
  measurementId: "G-9KZPC4JZTS"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const rtdb = getDatabase(app);
