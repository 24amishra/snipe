// lib/firestore.ts — Firestore CRUD service layer for Snipe

import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  addDoc,
  collection,
  query,
  where,
  getDocs,
  serverTimestamp,
  arrayUnion,
  increment,
  Timestamp,
} from 'firebase/firestore';
import { db } from './firebase';
import { getTodayDateString } from './gameUtils';

// ─── Types ───────────────────────────────────────────────────────────

export interface CategoryStats {
  correct: number;
  total: number;
  totalTime: number;
}

export interface UserProfile {
  uid: string;
  username: string;
  email: string;
  createdAt: Timestamp;
  totalWins: number;
  currentStreak: number;
  gamesPlayed: number;
  lastPlayedDate: string;
  groupIds: string[];
  notificationsEnabled: boolean;
  categoryStats: Record<string, CategoryStats>;
}

export interface QuestionEntry {
  questionId: string;
  category: string;
  correct: boolean;
  timeRemaining: number;
  pointsEarned: number;
  selectedAnswer: string | null;
}

export interface GameResult {
  userId: string;
  date: string;
  score: number;
  completedAt: Timestamp;
  questions: QuestionEntry[];
}

export interface GroupDoc {
  name: string;
  createdBy: string;
  createdAt: Timestamp;
  inviteCode: string;
  memberIds: string[];
  memberCount: number;
}

export interface LeaderboardEntry {
  userId: string;
  username: string;
  totalScore: number;
  wins: number;
  currentStreak: number;
  gamesPlayed: number;
  avgPct: number;
  lastUpdated: Timestamp;
}

// ─── Users ───────────────────────────────────────────────────────────

export async function createUserProfile(
  uid: string,
  username: string,
  email: string,
): Promise<void> {
  await setDoc(doc(db, 'users', uid), {
    uid,
    username,
    email,
    createdAt: serverTimestamp(),
    totalWins: 0,
    currentStreak: 0,
    gamesPlayed: 0,
    lastPlayedDate: '',
    groupIds: [],
    notificationsEnabled: false,
    categoryStats: {},
  });
}

export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  const snap = await getDoc(doc(db, 'users', uid));
  if (!snap.exists()) return null;
  return snap.data() as UserProfile;
}

export async function updateUsername(uid: string, newUsername: string): Promise<void> {
  await updateDoc(doc(db, 'users', uid), { username: newUsername });
}

export async function checkUsernameAvailable(username: string): Promise<boolean> {
  const q = query(collection(db, 'users'), where('username', '==', username));
  const snap = await getDocs(q);
  return snap.empty;
}

// ─── Game Results ────────────────────────────────────────────────────

export async function saveGameResult(
  userId: string,
  date: string,
  score: number,
  questions: QuestionEntry[],
): Promise<void> {
  // 1. Write the gameResults document
  await addDoc(collection(db, 'gameResults'), {
    userId,
    date,
    score,
    completedAt: serverTimestamp(),
    questions,
  });

  // 2. Update aggregated user stats
  const userRef = doc(db, 'users', userId);
  const userSnap = await getDoc(userRef);
  if (!userSnap.exists()) return;

  const userData = userSnap.data() as UserProfile;

  // Build category stat increments
  const updatedCategoryStats: Record<string, CategoryStats> = { ...userData.categoryStats };
  for (const q of questions) {
    const cat = q.category;
    if (!updatedCategoryStats[cat]) {
      updatedCategoryStats[cat] = { correct: 0, total: 0, totalTime: 0 };
    }
    updatedCategoryStats[cat].total += 1;
    if (q.correct) updatedCategoryStats[cat].correct += 1;
    updatedCategoryStats[cat].totalTime += 8 - q.timeRemaining; // time spent
  }

  // Streak logic
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split('T')[0];
  const newStreak =
    userData.lastPlayedDate === yesterdayStr
      ? userData.currentStreak + 1
      : userData.lastPlayedDate === date
        ? userData.currentStreak // already played today (shouldn't happen but safe)
        : 1;

  await updateDoc(userRef, {
    gamesPlayed: increment(1),
    currentStreak: newStreak,
    lastPlayedDate: date,
    categoryStats: updatedCategoryStats,
  });

  // 3. Update leaderboard entries in every group the user belongs to
  for (const groupId of userData.groupIds) {
    await updateLeaderboardEntry(groupId, userId, userData.username, {
      score,
      questions,
      newStreak,
      newGamesPlayed: userData.gamesPlayed + 1,
    });
  }
}

export async function getUserGameForDate(
  userId: string,
  date: string,
): Promise<GameResult | null> {
  const q = query(
    collection(db, 'gameResults'),
    where('userId', '==', userId),
    where('date', '==', date),
  );
  const snap = await getDocs(q);
  if (snap.empty) return null;
  return snap.docs[0].data() as GameResult;
}

// ─── Questions ──────────────────────────────────────────────────────

export interface QuizQuestion {
  id: string;
  category: string;
  question: string;
  choices: string[];
  answer: string;
}

export async function getTodayQuestions(date: string): Promise<QuizQuestion[]> {
  const snap = await getDoc(doc(db, 'dailyQuestions', date));
  if (!snap.exists()) return [];
  const data = snap.data();
  return (data.questions ?? []) as QuizQuestion[];
}

// ─── Admin: Question Bank ───────────────────────────────────────────

export async function addQuestionToBank(q: Omit<QuizQuestion, 'id'>): Promise<string> {
  const docRef = await addDoc(collection(db, 'questionBank'), {
    category: q.category,
    question: q.question,
    choices: q.choices,
    answer: q.answer,
    createdAt: serverTimestamp(),
  });
  return docRef.id;
}

export async function getAllBankQuestions(): Promise<QuizQuestion[]> {
  const snap = await getDocs(collection(db, 'questionBank'));
  return snap.docs.map((d) => ({
    id: d.id,
    ...(d.data() as Omit<QuizQuestion, 'id'>),
  }));
}

export async function setDailyQuestions(date: string, questions: QuizQuestion[]): Promise<void> {
  await setDoc(doc(db, 'dailyQuestions', date), { questions });
}

// ─── Groups ──────────────────────────────────────────────────────────

function generateInviteCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export async function createGroup(
  userId: string,
  groupName: string,
): Promise<{ groupId: string; inviteCode: string }> {
  const inviteCode = generateInviteCode();

  const groupRef = await addDoc(collection(db, 'groups'), {
    name: groupName,
    createdBy: userId,
    createdAt: serverTimestamp(),
    inviteCode,
    memberIds: [userId],
    memberCount: 1,
  });

  // Add group to user's groupIds
  await updateDoc(doc(db, 'users', userId), {
    groupIds: arrayUnion(groupRef.id),
  });

  // Create initial leaderboard entry for the creator
  const userSnap = await getDoc(doc(db, 'users', userId));
  const username = userSnap.exists() ? (userSnap.data() as UserProfile).username : 'unknown';

  await setDoc(doc(db, 'groups', groupRef.id, 'leaderboard', userId), {
    userId,
    username,
    totalScore: 0,
    wins: 0,
    currentStreak: 0,
    gamesPlayed: 0,
    avgPct: 0,
    lastUpdated: serverTimestamp(),
  });

  return { groupId: groupRef.id, inviteCode };
}

export async function joinGroup(
  userId: string,
  inviteCode: string,
): Promise<{ groupId: string; groupName: string } | null> {
  const q = query(collection(db, 'groups'), where('inviteCode', '==', inviteCode));
  const snap = await getDocs(q);
  if (snap.empty) return null;

  const groupDoc = snap.docs[0];
  const groupId = groupDoc.id;
  const groupData = groupDoc.data() as GroupDoc;

  // Already a member?
  if (groupData.memberIds.includes(userId)) {
    return { groupId, groupName: groupData.name };
  }

  // Add user to group
  await updateDoc(doc(db, 'groups', groupId), {
    memberIds: arrayUnion(userId),
    memberCount: increment(1),
  });

  // Add group to user's groupIds
  await updateDoc(doc(db, 'users', userId), {
    groupIds: arrayUnion(groupId),
  });

  // Create leaderboard entry
  const userSnap = await getDoc(doc(db, 'users', userId));
  const username = userSnap.exists() ? (userSnap.data() as UserProfile).username : 'unknown';

  await setDoc(doc(db, 'groups', groupId, 'leaderboard', userId), {
    userId,
    username,
    totalScore: 0,
    wins: 0,
    currentStreak: 0,
    gamesPlayed: 0,
    avgPct: 0,
    lastUpdated: serverTimestamp(),
  });

  return { groupId, groupName: groupData.name };
}

export async function getGroupLeaderboard(groupId: string): Promise<LeaderboardEntry[]> {
  const snap = await getDocs(collection(db, 'groups', groupId, 'leaderboard'));
  const entries = snap.docs.map((d) => d.data() as LeaderboardEntry);
  // Sort by totalScore descending
  entries.sort((a, b) => b.totalScore - a.totalScore);
  return entries;
}

export async function getUserGroups(
  userId: string,
): Promise<Array<{ id: string; name: string; memberCount: number }>> {
  const q = query(collection(db, 'groups'), where('memberIds', 'array-contains', userId));
  const snap = await getDocs(q);
  return snap.docs.map((d) => {
    const data = d.data() as GroupDoc;
    return { id: d.id, name: data.name, memberCount: data.memberCount };
  });
}

// ─── Leaderboard Update (internal) ──────────────────────────────────

async function updateLeaderboardEntry(
  groupId: string,
  userId: string,
  username: string,
  result: {
    score: number;
    questions: QuestionEntry[];
    newStreak: number;
    newGamesPlayed: number;
  },
): Promise<void> {
  const entryRef = doc(db, 'groups', groupId, 'leaderboard', userId);
  const entrySnap = await getDoc(entryRef);

  const correctCount = result.questions.filter((q) => q.correct).length;
  const totalQuestions = result.questions.length;

  if (entrySnap.exists()) {
    const existing = entrySnap.data() as LeaderboardEntry;
    const newTotalScore = existing.totalScore + result.score;
    const oldTotalCorrect = Math.round((existing.avgPct / 100) * existing.gamesPlayed * 7);
    const newTotalCorrect = oldTotalCorrect + correctCount;
    const newTotalQuestions = existing.gamesPlayed * 7 + totalQuestions;
    const newAvgPct = newTotalQuestions > 0 ? Math.round((newTotalCorrect / newTotalQuestions) * 100) : 0;

    await updateDoc(entryRef, {
      totalScore: newTotalScore,
      currentStreak: result.newStreak,
      gamesPlayed: result.newGamesPlayed,
      avgPct: newAvgPct,
      lastUpdated: serverTimestamp(),
    });
  } else {
    const avgPct = totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : 0;
    await setDoc(entryRef, {
      userId,
      username,
      totalScore: result.score,
      wins: 0,
      currentStreak: result.newStreak,
      gamesPlayed: 1,
      avgPct,
      lastUpdated: serverTimestamp(),
    });
  }
}
