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
// The game day flips at 12pm EST — after noon EST, this returns tomorrow's date
// because that's when the next day's questions go live.
export function getTodayDateString(): string {
  const now = new Date();
  const estNow = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  if (estNow.getHours() >= 12) {
    estNow.setDate(estNow.getDate() + 1);
  }
  const y = estNow.getFullYear();
  const m = String(estNow.getMonth() + 1).padStart(2, '0');
  const d = String(estNow.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// Quiz drops every day at 12pm EST. It stays open until the next 12pm drop.
// The quiz is always available — if you haven't played, you can play.
export function isQuizWindowOpen(): boolean {
  return true;
}

// Scores are always visible after completing the quiz.
// The next quiz still drops at 12pm EST.
export function haveScoresDropped(): boolean {
  return true;
}

// Returns the Mon–Sun date range for a given week (0 = current week, 1 = last week, etc.)
export function getWeekDateRange(weeksAgo: number = 0): { start: string; end: string; dates: string[] } {
  const now = new Date();
  const estNow = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));

  // Find Monday of current week
  const day = estNow.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  const diffToMonday = day === 0 ? -6 : 1 - day;

  const monday = new Date(estNow);
  monday.setDate(estNow.getDate() + diffToMonday - weeksAgo * 7);
  monday.setHours(0, 0, 0, 0);

  const dates: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    dates.push(`${y}-${m}-${dd}`);
  }

  return { start: dates[0], end: dates[6], dates };
}

// Countdown to next 12pm EST (next quiz drop / score release)
export function getNextQuizCountdown(): string {
  const now = new Date();
  // Get "now" in EST
  const estNow = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const estHour = estNow.getHours();

  // Target: today 12pm EST if before noon, otherwise tomorrow 12pm EST
  let targetEST = new Date(estNow);

  if (estHour < 12) {
    targetEST.setHours(12, 0, 0, 0);
  } else {
    targetEST.setDate(targetEST.getDate() + 1);
    targetEST.setHours(12, 0, 0, 0);
  }

  const diff = targetEST.getTime() - estNow.getTime();
  if (diff <= 0) return '00:00:00';

  const h = Math.floor(diff / 3600000).toString().padStart(2, '0');
  const m = Math.floor((diff % 3600000) / 60000).toString().padStart(2, '0');
  const s = Math.floor((diff % 60000) / 1000).toString().padStart(2, '0');
  return `${h}:${m}:${s}`;
}
