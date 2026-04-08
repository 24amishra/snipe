import { initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { logger } from "firebase-functions";

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
