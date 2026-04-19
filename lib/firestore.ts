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
  limit,
  serverTimestamp,
  arrayUnion,
  increment,
  Timestamp,
} from 'firebase/firestore';
import { db } from './firebase';
import { getTodayDateString, getWeekDateRange } from './gameUtils';
import { normalizeCategory } from './constants';

// Remote diagnostic logger — writes to Firestore 'logs' collection
// View in Firebase Console > Firestore > logs
export function logRemote(event: string, data: Record<string, unknown>) {
  addDoc(collection(db, 'logs'), {
    event,
    ...data,
    timestamp: serverTimestamp(),
  }).catch(() => {}); // fire-and-forget, never block the caller
}

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
  pushToken?: string | null;
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
  avgSpeed: number;
  categoryStats: Record<string, { correct: number; total: number }>;
  lastUpdated: Timestamp;
}

export interface TodayEntry {
  userId: string;
  username: string;
  score: number;
  avgSpeed: number;
  categoryStats: Record<string, { correct: number; total: number }>;
}

// ─── Helpers ────────────────────────────────────────────────────────

// Chunk array into groups of N (Firestore 'in' query limit = 30)
function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
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
  _retryCount = 0,
): Promise<void> {
  logRemote('save_start', { userId, date, score, retry: _retryCount });

  // 1. Write the gameResults document
  try {
    await addDoc(collection(db, 'gameResults'), {
      userId,
      date,
      score,
      completedAt: serverTimestamp(),
      questions,
    });
  } catch (err: any) {
    logRemote('save_gameresult_failed', {
      userId, date, score,
      retry: _retryCount,
      error: err?.code ?? err?.message ?? String(err),
    });
    // Retry after 1.5s — handles Firebase Auth token propagation delay on first login
    if (_retryCount < 2) {
      await new Promise((r) => setTimeout(r, 1500));
      return saveGameResult(userId, date, score, questions, _retryCount + 1);
    }
    throw err;
  }

  // 2. Update aggregated user stats
  const userRef = doc(db, 'users', userId);
  const userSnap = await getDoc(userRef);
  if (!userSnap.exists()) {
    logRemote('save_no_user_doc', { userId, date, score });
    return;
  }

  const userData = userSnap.data() as UserProfile;

  if (!userData.groupIds || userData.groupIds.length === 0) {
    logRemote('save_no_groups', { userId, date, score });
  }

  // Build category stat increments
  const updatedCategoryStats: Record<string, CategoryStats> = { ...userData.categoryStats };
  for (const q of questions) {
    const cat = normalizeCategory(q.category);
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

  try {
    await updateDoc(userRef, {
      gamesPlayed: increment(1),
      currentStreak: newStreak,
      lastPlayedDate: date,
      categoryStats: updatedCategoryStats,
    });
  } catch (err: any) {
    logRemote('save_user_update_failed', {
      userId, date, score,
      error: err?.code ?? err?.message ?? String(err),
    });
    throw err;
  }

  // 3. Update leaderboard entries in every group the user belongs to (parallel, fault-tolerant)
  const groupIds = userData.groupIds ?? [];
  const leaderboardUpdates = groupIds.map((groupId) =>
    updateLeaderboardEntry(groupId, userId, userData.username, {
      score,
      questions,
      newStreak,
      newGamesPlayed: userData.gamesPlayed + 1,
    }).catch((err: any) =>
      logRemote('save_leaderboard_failed', {
        userId, date, score, groupId,
        error: err?.code ?? err?.message ?? String(err),
      }),
    ),
  );
  await Promise.all(leaderboardUpdates);

  // 4. Update global daily stats (for app-wide average)
  const dailyStatsRef = doc(db, 'dailyStats', date);
  const dailyStatsSnap = await getDoc(dailyStatsRef);
  if (dailyStatsSnap.exists()) {
    await updateDoc(dailyStatsRef, {
      totalScore: increment(score),
      playerCount: increment(1),
    });
  } else {
    await setDoc(dailyStatsRef, {
      totalScore: score,
      playerCount: 1,
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
    avgSpeed: 0,
    categoryStats: {},
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

  // Create leaderboard entry — backfill with any existing game results
  const userSnap = await getDoc(doc(db, 'users', userId));
  const userData = userSnap.exists() ? (userSnap.data() as UserProfile) : null;
  const username = userData?.username ?? 'unknown';

  // Check if the user already has game results that should count
  const existingGames = await getDocs(
    query(collection(db, 'gameResults'), where('userId', '==', userId)),
  );

  if (existingGames.empty) {
    await setDoc(doc(db, 'groups', groupId, 'leaderboard', userId), {
      userId,
      username,
      totalScore: 0,
      wins: 0,
      currentStreak: 0,
      gamesPlayed: 0,
      avgPct: 0,
      avgSpeed: 0,
      categoryStats: {},
      lastUpdated: serverTimestamp(),
    });
  } else {
    // Backfill: aggregate all past game results into the leaderboard entry
    let totalScore = 0;
    let totalCorrect = 0;
    let totalQuestions = 0;
    let totalTimeSpent = 0;
    const categoryStats: Record<string, { correct: number; total: number }> = {};

    existingGames.docs.forEach((d) => {
      const game = d.data() as GameResult;
      totalScore += game.score;
      for (const q of game.questions) {
        totalQuestions += 1;
        if (q.correct) totalCorrect += 1;
        totalTimeSpent += 8 - q.timeRemaining;
        const cat = normalizeCategory(q.category);
        if (!categoryStats[cat]) categoryStats[cat] = { correct: 0, total: 0 };
        categoryStats[cat].total += 1;
        if (q.correct) categoryStats[cat].correct += 1;
      }
    });

    const gamesPlayed = existingGames.size;
    const avgPct = totalQuestions > 0 ? Math.round((totalCorrect / totalQuestions) * 100) : 0;
    const avgSpeed = totalQuestions > 0 ? Math.round((totalTimeSpent / totalQuestions) * 10) / 10 : 0;

    await setDoc(doc(db, 'groups', groupId, 'leaderboard', userId), {
      userId,
      username,
      totalScore,
      wins: 0,
      currentStreak: userData?.currentStreak ?? 0,
      gamesPlayed,
      avgPct,
      avgSpeed,
      categoryStats,
      lastUpdated: serverTimestamp(),
    });
  }

  return { groupId, groupName: groupData.name };
}

export async function getGroupLeaderboard(groupId: string): Promise<LeaderboardEntry[]> {
  const snap = await getDocs(collection(db, 'groups', groupId, 'leaderboard'));
  const entries = snap.docs.map((d) => d.data() as LeaderboardEntry);
  // Sort by totalScore descending, then by speed (lower = faster = ranks higher)
  entries.sort((a, b) => {
    if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
    return (a.avgSpeed ?? 0) - (b.avgSpeed ?? 0);
  });
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

  // Compute avg speed for this game (seconds spent per question)
  const gameAvgSpeed =
    totalQuestions > 0
      ? result.questions.reduce((sum, q) => sum + (8 - q.timeRemaining), 0) / totalQuestions
      : 0;

  // Build per-category stats for this game
  const gameCategoryStats: Record<string, { correct: number; total: number }> = {};
  for (const q of result.questions) {
    const cat = normalizeCategory(q.category);
    if (!gameCategoryStats[cat]) {
      gameCategoryStats[cat] = { correct: 0, total: 0 };
    }
    gameCategoryStats[cat].total += 1;
    if (q.correct) gameCategoryStats[cat].correct += 1;
  }

  if (entrySnap.exists()) {
    const existing = entrySnap.data() as LeaderboardEntry;
    const newTotalScore = existing.totalScore + result.score;
    const oldTotalCorrect = Math.round((existing.avgPct / 100) * existing.gamesPlayed * 7);
    const newTotalCorrect = oldTotalCorrect + correctCount;
    const newTotalQuestions = existing.gamesPlayed * 7 + totalQuestions;
    const newAvgPct = newTotalQuestions > 0 ? Math.round((newTotalCorrect / newTotalQuestions) * 100) : 0;

    // Weighted running average for speed
    const oldTotalQs = existing.gamesPlayed * 7;
    const newAvgSpeed =
      oldTotalQs + totalQuestions > 0
        ? ((existing.avgSpeed ?? 0) * oldTotalQs + gameAvgSpeed * totalQuestions) /
          (oldTotalQs + totalQuestions)
        : 0;

    // Merge category stats
    const mergedCategoryStats: Record<string, { correct: number; total: number }> = {
      ...(existing.categoryStats ?? {}),
    };
    for (const [cat, stats] of Object.entries(gameCategoryStats)) {
      if (!mergedCategoryStats[cat]) {
        mergedCategoryStats[cat] = { correct: 0, total: 0 };
      }
      mergedCategoryStats[cat].correct += stats.correct;
      mergedCategoryStats[cat].total += stats.total;
    }

    await updateDoc(entryRef, {
      totalScore: newTotalScore,
      currentStreak: result.newStreak,
      gamesPlayed: result.newGamesPlayed,
      avgPct: newAvgPct,
      avgSpeed: Math.round(newAvgSpeed * 10) / 10,
      categoryStats: mergedCategoryStats,
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
      avgSpeed: Math.round(gameAvgSpeed * 10) / 10,
      categoryStats: gameCategoryStats,
      lastUpdated: serverTimestamp(),
    });
  }
}

// ─── Today's Scores ─────────────────────────────────────────────────

export async function getGroupTodayScores(
  groupId: string,
  date: string,
): Promise<TodayEntry[]> {
  // Get all members of the group
  const groupSnap = await getDoc(doc(db, 'groups', groupId));
  if (!groupSnap.exists()) return [];
  const groupData = groupSnap.data() as GroupDoc;

  if (groupData.memberIds.length === 0) return [];

  // Batch-fetch today's game results for all members (chunks of 30)
  const memberChunks = chunkArray(groupData.memberIds, 30);
  const gameResultsByUser = new Map<string, GameResult>();

  const resultPromises = memberChunks.map(async (chunk) => {
    const q = query(
      collection(db, 'gameResults'),
      where('userId', 'in', chunk),
      where('date', '==', date),
    );
    const snap = await getDocs(q);
    for (const d of snap.docs) {
      const result = d.data() as GameResult;
      gameResultsByUser.set(result.userId, result);
    }
  });

  // Fetch all leaderboard entries in one read (for usernames)
  const lbPromise = getDocs(collection(db, 'groups', groupId, 'leaderboard'));

  await Promise.all([...resultPromises, lbPromise]);

  const lbSnap = await lbPromise;
  const usernameMap = new Map<string, string>();
  for (const d of lbSnap.docs) {
    const entry = d.data() as LeaderboardEntry;
    usernameMap.set(entry.userId, entry.username);
  }

  // Build today entries from results
  const todayEntries: TodayEntry[] = [];
  gameResultsByUser.forEach((gameResult, memberId) => {
    const categoryStats: Record<string, { correct: number; total: number }> = {};
    let totalTime = 0;
    for (const q of gameResult.questions) {
      const cat = normalizeCategory(q.category);
      if (!categoryStats[cat]) {
        categoryStats[cat] = { correct: 0, total: 0 };
      }
      categoryStats[cat].total += 1;
      if (q.correct) categoryStats[cat].correct += 1;
      totalTime += 8 - q.timeRemaining;
    }

    const avgSpeed =
      gameResult.questions.length > 0
        ? Math.round((totalTime / gameResult.questions.length) * 10) / 10
        : 0;

    todayEntries.push({
      userId: memberId,
      username: usernameMap.get(memberId) ?? 'unknown',
      score: gameResult.score,
      avgSpeed,
      categoryStats,
    });
  });

  // Sort by score descending, then by speed (lower = faster = ranks higher)
  todayEntries.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.avgSpeed - b.avgSpeed;
  });
  return todayEntries;
}

// ─── Recently Missed Questions ──────────────────────────────────────

export interface MissedQuestion {
  questionId: string;
  date: string;
  category: string;
  questionText: string;
  selectedAnswer: string;
  correctAnswer: string;
  timeRemaining: number;
}

/**
 * Fetches all missed questions from today's game for a user.
 * Returns null if the user hasn't played today (distinct from empty array = played but got all correct).
 * Uses batched query limited to today's date to prevent slow load times.
 */
export async function getTodayMissedQuestions(
  userId: string,
): Promise<MissedQuestion[] | null> {
  const today = getTodayDateString();

  // Single batched query: only fetch today's result for this user
  const q = query(
    collection(db, 'gameResults'),
    where('userId', '==', userId),
    where('date', '==', today),
    limit(1),
  );
  const snap = await getDocs(q);
  if (snap.empty) return null; // hasn't played today

  const result = snap.docs[0].data() as GameResult;
  const wrongEntries = result.questions.filter((e) => !e.correct);
  if (wrongEntries.length === 0) return [];

  // Lazy-load today's questions in a single batch
  const dailyQs = await getTodayQuestions(today);

  const missed: MissedQuestion[] = [];
  for (const wrong of wrongEntries) {
    const matchingQ = dailyQs.find((dq) => dq.id === wrong.questionId);
    if (matchingQ) {
      missed.push({
        questionId: wrong.questionId,
        date: today,
        category: wrong.category,
        questionText: matchingQ.question,
        selectedAnswer: wrong.selectedAnswer ?? 'No answer',
        correctAnswer: matchingQ.answer,
        timeRemaining: wrong.timeRemaining,
      });
    }
  }

  return missed;
}

// ─── Weekly Stats ───────────────────────────────────────────────────

export interface WeeklyStats {
  score: { avg: number; delta: number | null };
  speed: { avg: number; delta: number | null };
  rank: { current: number | null; previous: number | null };
  gamesThisWeek: number;
}

// Batch-fetch game results for multiple users, filtered to specific dates in memory.
// Uses chunked 'in' queries on userId (Firestore doesn't allow two 'in' clauses).
async function getBatchedGamesForDates(
  memberIds: string[],
  dates: string[],
): Promise<Map<string, GameResult[]>> {
  const dateSet = new Set(dates);
  const gamesByUser = new Map<string, GameResult[]>();

  const memberChunks = chunkArray(memberIds, 30);
  await Promise.all(
    memberChunks.map(async (chunk) => {
      const q = query(
        collection(db, 'gameResults'),
        where('userId', 'in', chunk),
      );
      const snap = await getDocs(q);
      for (const d of snap.docs) {
        const result = d.data() as GameResult;
        if (!dateSet.has(result.date)) continue;
        const existing = gamesByUser.get(result.userId) ?? [];
        existing.push(result);
        gamesByUser.set(result.userId, existing);
      }
    }),
  );

  return gamesByUser;
}

function computeWeekAggregates(
  games: GameResult[],
  dates: string[],
): { avgScore: number; avgSpeed: number; totalScore: number; count: number } {
  const dateSet = new Set(dates);
  const weekGames = games.filter((g) => dateSet.has(g.date));
  if (weekGames.length === 0) return { avgScore: 0, avgSpeed: 0, totalScore: 0, count: 0 };

  const totalScore = weekGames.reduce((s, g) => s + g.score, 0);
  let totalTime = 0;
  let totalQuestions = 0;
  for (const game of weekGames) {
    for (const q of game.questions) {
      totalTime += 8 - q.timeRemaining;
      totalQuestions += 1;
    }
  }

  return {
    avgScore: totalScore / weekGames.length,
    avgSpeed: totalQuestions > 0 ? totalTime / totalQuestions : 0,
    totalScore,
    count: weekGames.length,
  };
}

export async function getWeeklyStats(
  userId: string,
  groupIds: string[],
): Promise<WeeklyStats> {
  const thisWeek = getWeekDateRange(0);
  const lastWeek = getWeekDateRange(1);
  const allDates = [...thisWeek.dates, ...lastWeek.dates];

  let userGames: GameResult[];
  let currentRank: number | null = null;
  let previousRank: number | null = null;

  if (groupIds.length > 0) {
    const groupSnap = await getDoc(doc(db, 'groups', groupIds[0]));
    if (groupSnap.exists()) {
      const groupData = groupSnap.data() as GroupDoc;

      // Single batched fetch for all members, filtered to the 14 relevant dates
      const gamesByUser = await getBatchedGamesForDates(groupData.memberIds, allDates);

      // Extract user's own games
      userGames = gamesByUser.get(userId) ?? [];

      // This-week ranking (only members who scored)
      const thisRanking = groupData.memberIds
        .map((id) => ({
          userId: id,
          totalScore: computeWeekAggregates(gamesByUser.get(id) ?? [], thisWeek.dates).totalScore,
        }))
        .filter((r) => r.totalScore > 0)
        .sort((a, b) => b.totalScore - a.totalScore);

      const thisPos = thisRanking.findIndex((r) => r.userId === userId);
      currentRank = thisPos >= 0 ? thisPos + 1 : null;

      // Last-week ranking
      const lastRanking = groupData.memberIds
        .map((id) => ({
          userId: id,
          totalScore: computeWeekAggregates(gamesByUser.get(id) ?? [], lastWeek.dates).totalScore,
        }))
        .filter((r) => r.totalScore > 0)
        .sort((a, b) => b.totalScore - a.totalScore);

      const lastPos = lastRanking.findIndex((r) => r.userId === userId);
      previousRank = lastPos >= 0 ? lastPos + 1 : null;
    } else {
      const gamesByUser = await getBatchedGamesForDates([userId], allDates);
      userGames = gamesByUser.get(userId) ?? [];
    }
  } else {
    const gamesByUser = await getBatchedGamesForDates([userId], allDates);
    userGames = gamesByUser.get(userId) ?? [];
  }

  const thisAgg = computeWeekAggregates(userGames, thisWeek.dates);
  const lastAgg = computeWeekAggregates(userGames, lastWeek.dates);

  const scoreDelta = lastAgg.count > 0 ? Math.round(thisAgg.avgScore - lastAgg.avgScore) : null;
  const speedDelta = lastAgg.count > 0
    ? Math.round((thisAgg.avgSpeed - lastAgg.avgSpeed) * 10) / 10
    : null;

  return {
    score: { avg: Math.round(thisAgg.avgScore), delta: scoreDelta },
    speed: { avg: Math.round(thisAgg.avgSpeed * 10) / 10, delta: speedDelta },
    rank: { current: currentRank, previous: previousRank },
    gamesThisWeek: thisAgg.count,
  };
}

// ─── Daily Stats (Global Average) ───────────────────────────────────

export async function getDailyGlobalAvg(date: string): Promise<number | null> {
  const snap = await getDoc(doc(db, 'dailyStats', date));
  if (!snap.exists()) return null;
  const data = snap.data() as { totalScore: number; playerCount: number };
  if (data.playerCount === 0) return null;
  return Math.round(data.totalScore / data.playerCount);
}

// ─── Group Average for a Date ───────────────────────────────────────

export async function getGroupAvgForDate(
  groupId: string,
  date: string,
): Promise<number | null> {
  const groupSnap = await getDoc(doc(db, 'groups', groupId));
  if (!groupSnap.exists()) return null;
  const groupData = groupSnap.data() as GroupDoc;

  if (groupData.memberIds.length === 0) return null;

  // Batch-fetch game results for all members on this date (chunks of 30)
  const memberChunks = chunkArray(groupData.memberIds, 30);
  let totalScore = 0;
  let playerCount = 0;

  await Promise.all(
    memberChunks.map(async (chunk) => {
      const q = query(
        collection(db, 'gameResults'),
        where('userId', 'in', chunk),
        where('date', '==', date),
      );
      const snap = await getDocs(q);
      for (const d of snap.docs) {
        const gameResult = d.data() as GameResult;
        totalScore += gameResult.score;
        playerCount += 1;
      }
    }),
  );

  if (playerCount === 0) return null;
  return Math.round(totalScore / playerCount);
}
