import { initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
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

interface UserProfile {
  username: string;
  groupIds: string[];
  pushToken?: string | null;
  notificationsEnabled?: boolean;
}

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
