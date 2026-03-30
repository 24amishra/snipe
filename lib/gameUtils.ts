// lib/gameUtils.ts

export interface QuestionResult {
  correct: boolean;
  timeRemaining: number; // seconds remaining out of 8 when answered
}

export interface GameSession {
  currentQuestionIndex: number; // which question they were on when they left
  results: QuestionResult[];    // answers recorded so far
  date: string;                 // today's date string e.g. "2026-03-27"
}

// Tiered speed scoring:
//   0–3s elapsed (5–8s remaining) → 1.5x → 150 pts
//   3–6s elapsed (2–5s remaining) → 1.25x → 125 pts
//   6–8s elapsed (0–2s remaining) → 1.0x → 100 pts
//   wrong / timeout → 0 pts
// Max per question: 150. Max total (7 questions): 1050.
export function scoreForQuestion(correct: boolean, timeRemaining: number): number {
  if (!correct) return 0;
  const elapsed = 8 - timeRemaining;
  if (elapsed <= 3) return 150;
  if (elapsed <= 6) return 125;
  return 100;
}

export function calculateScore(results: QuestionResult[]): number {
  return results.reduce((total, r) => total + scoreForQuestion(r.correct, r.timeRemaining), 0);
}

export function getMidnightCountdown(): string {
  const now = new Date();
  const midnight = new Date();
  midnight.setHours(24, 0, 0, 0);
  const diff = midnight.getTime() - now.getTime();
  const h = Math.floor(diff / 3600000).toString().padStart(2, '0');
  const m = Math.floor((diff % 3600000) / 60000).toString().padStart(2, '0');
  const s = Math.floor((diff % 60000) / 1000).toString().padStart(2, '0');
  return `${h}:${m}:${s}`;
}

// Returns the current "game day" date string.
// The game day flips at 8pm EST — after 8pm EST, this returns tomorrow's date
// because that's when the next day's questions go live.
export function getTodayDateString(): string {
  const now = new Date();
  const estNow = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  if (estNow.getHours() >= 20) {
    estNow.setDate(estNow.getDate() + 1);
  }
  const y = estNow.getFullYear();
  const m = String(estNow.getMonth() + 1).padStart(2, '0');
  const d = String(estNow.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// Quiz drops every day at 8pm EST. It stays open until the next 8pm drop.
// The quiz is always available — if you haven't played, you can play.
export function isQuizWindowOpen(): boolean {
  return true;
}

// Scores are always visible after completing the quiz.
// The next quiz still drops at 8pm EST.
export function haveScoresDropped(): boolean {
  return true;
}

// Countdown to next 8pm EST (next quiz drop / score release)
export function getNextQuizCountdown(): string {
  const now = new Date();
  // Get "now" in EST
  const estNow = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const estHour = estNow.getHours();

  // Target: today 8pm EST if before 8pm, otherwise tomorrow 8pm EST
  let targetEST = new Date(estNow);

  if (estHour < 20) {
    targetEST.setHours(20, 0, 0, 0);
  } else {
    targetEST.setDate(targetEST.getDate() + 1);
    targetEST.setHours(20, 0, 0, 0);
  }

  const diff = targetEST.getTime() - estNow.getTime();
  if (diff <= 0) return '00:00:00';

  const h = Math.floor(diff / 3600000).toString().padStart(2, '0');
  const m = Math.floor((diff % 3600000) / 60000).toString().padStart(2, '0');
  const s = Math.floor((diff % 60000) / 1000).toString().padStart(2, '0');
  return `${h}:${m}:${s}`;
}
