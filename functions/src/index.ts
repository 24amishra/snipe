import { initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions";
import { Expo, ExpoPushMessage } from "expo-server-sdk";

initializeApp();
const db = getFirestore();

interface QuestionEntry {
  questionId: string;
  category: string;
  correct: boolean;
  timeRemaining: number;
  pointsEarned: number;
  selectedAnswer: string | null;
}

interface GameResult {
  userId: string;
  date: string;
  score: number;
  questions: QuestionEntry[];
}

interface GroupDoc {
  memberIds: string[];
}

interface UserProfile {
  username: string;
  groupIds: string[];
  pushToken?: string | null;
  notificationsEnabled?: boolean;
  currentStreak: number;
  gamesPlayed: number;
  lastPlayedDate: string;
  categoryStats: Record<string, { correct: number; total: number; totalTime: number }>;
}

interface LeaderboardEntry {
  userId: string;
  username: string;
  totalScore: number;
  wins: number;
  currentStreak: number;
  gamesPlayed: number;
  avgPct: number;
  avgSpeed: number;
  categoryStats: Record<string, { correct: number; total: number }>;
}

// ─── Helpers (duplicated from client — Cloud Functions can't import from lib/) ──

const CATEGORIES = [
  "Sports",
  "History",
  "Science",
  "Entertainment",
  "Music",
  "Current Events",
  "Other",
] as const;

type Category = (typeof CATEGORIES)[number];

const CATEGORY_LOOKUP: Record<string, Category> = {};
for (const cat of CATEGORIES) {
  CATEGORY_LOOKUP[cat.toLowerCase()] = cat;
}

function normalizeCategory(raw: string): Category {
  return CATEGORY_LOOKUP[raw.toLowerCase().trim()] ?? "Other";
}

function scoreForQuestion(correct: boolean, timeRemaining: number): number {
  if (!correct) return 0;
  return 100 + Math.floor(timeRemaining * 6);
}

/**
 * Returns the current "game day" date string in EST.
 * After noon EST, returns tomorrow's date (next day's questions are live).
 */
function getGameDateString(): string {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const hourFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    hour12: false,
  });
  const estHour = parseInt(hourFormatter.format(now), 10);

  if (estHour >= 12) {
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    return formatter.format(tomorrow);
  }
  return formatter.format(now);
}

/**
 * Returns yesterday's date string in EST (for streak calculation).
 */
function getYesterdayDateStringEST(): string {
  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(yesterday);
}

// ─── Leaderboard Update (Admin SDK version) ─────────────────────────

async function updateLeaderboardEntryAdmin(
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
  const entryRef = db.doc(`groups/${groupId}/leaderboard/${userId}`);
  const entrySnap = await entryRef.get();

  const correctCount = result.questions.filter((q) => q.correct).length;
  const totalQuestions = result.questions.length;

  // Compute avg speed for this game (seconds spent per question)
  const gameAvgSpeed =
    totalQuestions > 0
      ? result.questions.reduce((sum, q) => sum + (8 - q.timeRemaining), 0) /
        totalQuestions
      : 0;

  // Build per-category stats for this game
  const gameCategoryStats: Record<string, { correct: number; total: number }> =
    {};
  for (const q of result.questions) {
    const cat = normalizeCategory(q.category);
    if (!gameCategoryStats[cat]) {
      gameCategoryStats[cat] = { correct: 0, total: 0 };
    }
    gameCategoryStats[cat].total += 1;
    if (q.correct) gameCategoryStats[cat].correct += 1;
  }

  if (entrySnap.exists) {
    const existing = entrySnap.data() as LeaderboardEntry;
    const newTotalScore = existing.totalScore + result.score;
    const oldTotalCorrect = Math.round(
      (existing.avgPct / 100) * existing.gamesPlayed * 7,
    );
    const newTotalCorrect = oldTotalCorrect + correctCount;
    const newTotalQuestions = existing.gamesPlayed * 7 + totalQuestions;
    const newAvgPct =
      newTotalQuestions > 0
        ? Math.round((newTotalCorrect / newTotalQuestions) * 100)
        : 0;

    // Weighted running average for speed
    const oldTotalQs = existing.gamesPlayed * 7;
    const newAvgSpeed =
      oldTotalQs + totalQuestions > 0
        ? ((existing.avgSpeed ?? 0) * oldTotalQs +
            gameAvgSpeed * totalQuestions) /
          (oldTotalQs + totalQuestions)
        : 0;

    // Merge category stats
    const mergedCategoryStats: Record<
      string,
      { correct: number; total: number }
    > = {
      ...(existing.categoryStats ?? {}),
    };
    for (const [cat, stats] of Object.entries(gameCategoryStats)) {
      if (!mergedCategoryStats[cat]) {
        mergedCategoryStats[cat] = { correct: 0, total: 0 };
      }
      mergedCategoryStats[cat].correct += stats.correct;
      mergedCategoryStats[cat].total += stats.total;
    }

    await entryRef.update({
      totalScore: newTotalScore,
      currentStreak: result.newStreak,
      gamesPlayed: result.newGamesPlayed,
      avgPct: newAvgPct,
      avgSpeed: Math.round(newAvgSpeed * 10) / 10,
      categoryStats: mergedCategoryStats,
      lastUpdated: FieldValue.serverTimestamp(),
    });
  } else {
    const avgPct =
      totalQuestions > 0
        ? Math.round((correctCount / totalQuestions) * 100)
        : 0;
    await entryRef.set({
      userId,
      username,
      totalScore: result.score,
      wins: 0,
      currentStreak: result.newStreak,
      gamesPlayed: 1,
      avgPct,
      avgSpeed: Math.round(gameAvgSpeed * 10) / 10,
      categoryStats: gameCategoryStats,
      lastUpdated: FieldValue.serverTimestamp(),
    });
  }
}

// ─── submitGameResult — Server-side scoring callable ────────────────

interface AnswerInput {
  questionId: string;
  selectedAnswer: string | null;
  timeRemaining: number;
}

interface QuizQuestion {
  id: string;
  category: string;
  question: string;
  choices: string[];
  answer: string;
}

export const submitGameResult = onCall(async (request) => {
  // 1. Auth check
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Must be logged in to submit a game result.");
  }
  const uid = request.auth.uid;

  // 2. Input validation
  const { date, answers } = request.data as {
    date: string;
    answers: AnswerInput[];
  };

  if (!date || typeof date !== "string") {
    throw new HttpsError("invalid-argument", "Missing or invalid date.");
  }

  if (!Array.isArray(answers) || answers.length !== 7) {
    throw new HttpsError("invalid-argument", "Must submit exactly 7 answers.");
  }

  // Validate date matches current game day
  const currentGameDate = getGameDateString();
  if (date !== currentGameDate) {
    throw new HttpsError(
      "failed-precondition",
      `Date mismatch: expected ${currentGameDate}, got ${date}.`,
    );
  }

  // Clamp timeRemaining to [0, 8]
  for (const a of answers) {
    a.timeRemaining = Math.max(0, Math.min(8, a.timeRemaining));
  }

  // 3. Duplicate guard
  const existingResults = await db
    .collection("gameResults")
    .where("userId", "==", uid)
    .where("date", "==", date)
    .limit(1)
    .get();

  if (!existingResults.empty) {
    throw new HttpsError("already-exists", "Already played today.");
  }

  // 4. Fetch daily questions
  const dailyQSnap = await db.doc(`dailyQuestions/${date}`).get();
  if (!dailyQSnap.exists) {
    throw new HttpsError("not-found", "No questions found for this date.");
  }
  const dailyQuestions = (dailyQSnap.data()!.questions ?? []) as QuizQuestion[];

  // Build lookup by questionId
  const questionMap = new Map<string, QuizQuestion>();
  for (const q of dailyQuestions) {
    questionMap.set(q.id, q);
  }

  // 5. Server-side scoring
  let totalScore = 0;
  const questionEntries: QuestionEntry[] = [];

  for (const a of answers) {
    const q = questionMap.get(a.questionId);
    if (!q) {
      throw new HttpsError(
        "invalid-argument",
        `Unknown questionId: ${a.questionId}`,
      );
    }

    const correct = a.selectedAnswer !== null && a.selectedAnswer === q.answer;
    const points = scoreForQuestion(correct, a.timeRemaining);
    totalScore += points;

    questionEntries.push({
      questionId: a.questionId,
      category: q.category,
      correct,
      timeRemaining: a.timeRemaining,
      pointsEarned: points,
      selectedAnswer: a.selectedAnswer,
    });
  }

  // 6. Write gameResults doc
  await db.collection("gameResults").add({
    userId: uid,
    date,
    score: totalScore,
    completedAt: FieldValue.serverTimestamp(),
    questions: questionEntries,
  });

  // 7. Update user profile
  const userRef = db.doc(`users/${uid}`);
  const userSnap = await userRef.get();
  if (!userSnap.exists) {
    logger.warn(`No user doc for uid ${uid}, skipping profile update.`);
    return { score: totalScore, questions: questionEntries };
  }

  const userData = userSnap.data() as UserProfile;

  // Build category stat increments
  const updatedCategoryStats: Record<
    string,
    { correct: number; total: number; totalTime: number }
  > = { ...userData.categoryStats };
  for (const q of questionEntries) {
    const cat = normalizeCategory(q.category);
    if (!updatedCategoryStats[cat]) {
      updatedCategoryStats[cat] = { correct: 0, total: 0, totalTime: 0 };
    }
    updatedCategoryStats[cat].total += 1;
    if (q.correct) updatedCategoryStats[cat].correct += 1;
    updatedCategoryStats[cat].totalTime += 8 - q.timeRemaining;
  }

  // Streak logic (EST-aware)
  const yesterdayStr = getYesterdayDateStringEST();
  const newStreak =
    userData.lastPlayedDate === yesterdayStr
      ? userData.currentStreak + 1
      : userData.lastPlayedDate === date
        ? userData.currentStreak
        : 1;

  await userRef.update({
    gamesPlayed: FieldValue.increment(1),
    currentStreak: newStreak,
    lastPlayedDate: date,
    categoryStats: updatedCategoryStats,
  });

  // 8. Update leaderboard entries in every group (parallel, fault-tolerant)
  const groupIds = userData.groupIds ?? [];
  const leaderboardUpdates = groupIds.map((groupId) =>
    updateLeaderboardEntryAdmin(groupId, uid, userData.username, {
      score: totalScore,
      questions: questionEntries,
      newStreak,
      newGamesPlayed: userData.gamesPlayed + 1,
    }).catch((err) =>
      logger.error(`Leaderboard update failed for group ${groupId}:`, err),
    ),
  );
  await Promise.all(leaderboardUpdates);

  // 9. Update dailyStats
  const dailyStatsRef = db.doc(`dailyStats/${date}`);
  const dailyStatsSnap = await dailyStatsRef.get();
  if (dailyStatsSnap.exists) {
    await dailyStatsRef.update({
      totalScore: FieldValue.increment(totalScore),
      playerCount: FieldValue.increment(1),
    });
  } else {
    await dailyStatsRef.set({
      totalScore: totalScore,
      playerCount: 1,
    });
  }

  // 10. Return score and question entries to client
  logger.info(`submitGameResult: uid=${uid}, date=${date}, score=${totalScore}`);
  return { score: totalScore, questions: questionEntries };
});

/**
 * Runs daily at 12pm EST (game-day cutover).
 * Determines the winner in each group for the game day that just ended,
 * increments their `wins` on the group leaderboard, and increments
 * `totalWins` on their user profile.
 *
 * Tie-break: if two players have the same score, the one who spent less
 * total time (sum of 8 - timeRemaining across all questions) wins.
 */
export const awardDailyWinners = onSchedule(
  {
    schedule: "every day 12:00",
    timeZone: "America/New_York",
  },
  async () => {
    // The game day that just ended is today's date in EST.
    // At 12pm EST the day flips, so the day that just concluded is the
    // current calendar date in the America/New_York timezone.
    const now = new Date();
    const estDateStr = now.toLocaleDateString("en-CA", {
      timeZone: "America/New_York",
    }); // "YYYY-MM-DD"

    logger.info(`awardDailyWinners running for date: ${estDateStr}`);

    // ── Idempotency guard ────────────────────────────────────────────
    const guardRef = db.doc(`dailyWinners/${estDateStr}`);
    const guardSnap = await guardRef.get();
    if (guardSnap.exists) {
      logger.info(`Already awarded winners for ${estDateStr}. Skipping.`);
      return;
    }

    // ── Fetch all groups ─────────────────────────────────────────────
    const groupsSnap = await db.collection("groups").get();
    if (groupsSnap.empty) {
      logger.info("No groups found. Nothing to do.");
      await guardRef.set({ processedAt: FieldValue.serverTimestamp(), winners: {} });
      return;
    }

    // ── Fetch ALL game results for today in one query ────────────────
    // This replaces the N+1 pattern (one query per member per group)
    const allResultsSnap = await db
      .collection("gameResults")
      .where("date", "==", estDateStr)
      .get();

    // Build a map: userId → { score, totalTime }
    type MemberResult = { userId: string; score: number; totalTime: number };
    const resultsByUser = new Map<string, MemberResult>();
    for (const doc of allResultsSnap.docs) {
      const result = doc.data() as GameResult;
      if (resultsByUser.has(result.userId)) continue; // first result wins (shouldn't have dupes)
      const totalTime = (result.questions ?? []).reduce(
        (sum, q) => sum + (8 - q.timeRemaining),
        0,
      );
      resultsByUser.set(result.userId, {
        userId: result.userId,
        score: result.score,
        totalTime,
      });
    }

    // Track wins per userId across all groups
    const winsPerUser: Record<string, number> = {};
    const winnersMap: Record<string, string> = {}; // groupId → winnerId
    const batch = db.batch();

    for (const groupDoc of groupsSnap.docs) {
      const groupId = groupDoc.id;
      const groupData = groupDoc.data() as GroupDoc;
      const memberIds = groupData.memberIds ?? [];

      if (memberIds.length === 0) continue;

      // Look up each member's result from the pre-fetched map
      const memberResults: MemberResult[] = [];
      for (const memberId of memberIds) {
        const r = resultsByUser.get(memberId);
        if (r) memberResults.push(r);
      }

      if (memberResults.length === 0) continue;

      // Sort: highest score first, then lowest totalTime (faster) wins ties
      memberResults.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return a.totalTime - b.totalTime;
      });

      const winner = memberResults[0];

      // Skip if the best score is 0 (no one really played)
      if (winner.score === 0) continue;

      // Batch the leaderboard win increment
      const leaderboardRef = db.doc(
        `groups/${groupId}/leaderboard/${winner.userId}`,
      );
      batch.update(leaderboardRef, { wins: FieldValue.increment(1) });

      winnersMap[groupId] = winner.userId;
      winsPerUser[winner.userId] = (winsPerUser[winner.userId] ?? 0) + 1;
    }

    // Batch the user profile win increments
    for (const [userId, count] of Object.entries(winsPerUser)) {
      const userRef = db.doc(`users/${userId}`);
      batch.update(userRef, { totalWins: FieldValue.increment(count) });
    }

    // Commit all writes in one batch
    await batch.commit();

    // ── Write idempotency guard ──────────────────────────────────────
    await guardRef.set({
      processedAt: FieldValue.serverTimestamp(),
      winners: winnersMap,
    });

    logger.info(
      `Awarded wins for ${estDateStr}: ${Object.keys(winnersMap).length} group(s), ` +
        `${Object.keys(winsPerUser).length} unique winner(s).`,
    );
  },
);

// ─── Push Notifications on Leaderboard Displacement ──────────────────

const expo = new Expo();

/**
 * Triggered when a new gameResult document is created.
 * Checks if the submitting user displaced anyone on the leaderboard
 * in any of their groups, and sends push notifications to displaced users.
 */
export const onGameResultCreated = onDocumentCreated(
  "gameResults/{resultId}",
  async (event) => {
    const snap = event.data;
    if (!snap) return;

    const newResult = snap.data() as GameResult;
    const { userId, date, score } = newResult;

    // Skip if score is 0 — no displacement possible
    if (score === 0) return;

    // Look up submitting user's profile
    const userSnap = await db.doc(`users/${userId}`).get();
    if (!userSnap.exists) return;
    const userProfile = userSnap.data() as UserProfile;
    const username = userProfile.username ?? "Someone";
    const groupIds = userProfile.groupIds ?? [];

    if (groupIds.length === 0) return;

    // Compute avgSpeed for the new result
    const newTotalTime = (newResult.questions ?? []).reduce(
      (sum, q) => sum + (8 - q.timeRemaining),
      0,
    );
    const newAvgSpeed =
      newResult.questions.length > 0
        ? newTotalTime / newResult.questions.length
        : 0;

    // Collect all displaced user IDs across groups
    const displacedUserIds = new Set<string>();

    for (const groupId of groupIds) {
      const groupSnap = await db.doc(`groups/${groupId}`).get();
      if (!groupSnap.exists) continue;
      const groupData = groupSnap.data() as GroupDoc;
      const memberIds = groupData.memberIds ?? [];

      if (memberIds.length === 0) continue;

      // Fetch today's game results for all members (chunked)
      type ScoredMember = { userId: string; score: number; avgSpeed: number };
      const todayResults: ScoredMember[] = [];

      const chunks: string[][] = [];
      for (let i = 0; i < memberIds.length; i += 30) {
        chunks.push(memberIds.slice(i, i + 30));
      }

      await Promise.all(
        chunks.map(async (chunk) => {
          const qSnap = await db
            .collection("gameResults")
            .where("userId", "in", chunk)
            .where("date", "==", date)
            .get();
          for (const d of qSnap.docs) {
            const r = d.data() as GameResult;
            const totalTime = (r.questions ?? []).reduce(
              (sum, q) => sum + (8 - q.timeRemaining),
              0,
            );
            const avgSpd =
              r.questions.length > 0 ? totalTime / r.questions.length : 0;
            todayResults.push({
              userId: r.userId,
              score: r.score,
              avgSpeed: avgSpd,
            });
          }
        }),
      );

      // Deduplicate (keep first occurrence per user)
      const seenUsers = new Set<string>();
      const deduped = todayResults.filter((r) => {
        if (seenUsers.has(r.userId)) return false;
        seenUsers.add(r.userId);
        return true;
      });

      // Compute "before" ranking: all results except the new one
      const before = deduped
        .filter((r) => r.userId !== userId)
        .sort((a, b) => {
          if (b.score !== a.score) return b.score - a.score;
          return a.avgSpeed - b.avgSpeed;
        });

      // Compute "after" ranking: include the new result
      const after = [...before, { userId, score, avgSpeed: newAvgSpeed }].sort(
        (a, b) => {
          if (b.score !== a.score) return b.score - a.score;
          return a.avgSpeed - b.avgSpeed;
        },
      );

      // Build rank maps
      const rankBefore = new Map<string, number>();
      before.forEach((r, i) => rankBefore.set(r.userId, i + 1));

      const rankAfter = new Map<string, number>();
      after.forEach((r, i) => rankAfter.set(r.userId, i + 1));

      // Find displaced users (rank number got worse = increased)
      for (const [memberId, oldRank] of rankBefore) {
        if (memberId === userId) continue;
        const newRank = rankAfter.get(memberId);
        if (newRank !== undefined && newRank > oldRank) {
          displacedUserIds.add(memberId);
        }
      }
    }

    if (displacedUserIds.size === 0) return;

    // Fetch push tokens for displaced users
    const messages: ExpoPushMessage[] = [];
    const tokenFetches = Array.from(displacedUserIds).map(async (uid) => {
      const uSnap = await db.doc(`users/${uid}`).get();
      if (!uSnap.exists) return;
      const uData = uSnap.data() as UserProfile;
      if (uData.notificationsEnabled === false) return;
      if (!uData.pushToken || !Expo.isExpoPushToken(uData.pushToken)) return;
      messages.push({
        to: uData.pushToken,
        title: "You've been passed!",
        body: `${username} just beat your score. See where you rank now.`,
        data: { type: "leaderboard_change" },
        sound: "default",
      });
    });
    await Promise.all(tokenFetches);

    if (messages.length === 0) return;

    // Send notifications in chunks
    const chunks2 = expo.chunkPushNotifications(messages);
    for (const chunk of chunks2) {
      try {
        await expo.sendPushNotificationsAsync(chunk);
      } catch (err) {
        logger.error("Failed to send push notifications:", err);
      }
    }

    logger.info(
      `Sent ${messages.length} displacement notification(s) for user ${userId} on ${date}.`,
    );
  },
);
