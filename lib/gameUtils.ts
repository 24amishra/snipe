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

// Time-proportional scoring:
//   Correct: 100 base + floor(timeRemaining × 6) speed bonus
//   Wrong / timeout: 0 pts
//   Max speed bonus: 48 (at 8s remaining). Max per question: 148.
//   Max total (7 questions): 1036.
//   Correctness always wins: 2 perfect (296) < 3 slow (300).
export function scoreForQuestion(correct: boolean, timeRemaining: number): number {
  if (!correct) return 0;
  return 100 + Math.floor(timeRemaining * 6);
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
  // Use Intl.DateTimeFormat for reliable timezone handling on all platforms (Hermes/JSC/V8)
  // toLocaleString round-tripping breaks on iOS/Android native runtimes
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const hourFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: 'numeric',
    hour12: false,
  });
  const estHour = parseInt(hourFormatter.format(now), 10);

  if (estHour >= 12) {
    // After noon EST — advance to next day
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    return formatter.format(tomorrow);
  }
  return formatter.format(now);
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
  // Get current EST date reliably across all platforms
  const estDateStr = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  const [y, mo, da] = estDateStr.split('-').map(Number);
  const estNow = new Date(y, mo - 1, da);

  // Find Monday of current week
  const day = estNow.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  const diffToMonday = day === 0 ? -6 : 1 - day;

  const monday = new Date(estNow);
  monday.setDate(estNow.getDate() + diffToMonday - weeksAgo * 7);

  const dates: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const yr = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    dates.push(`${yr}-${m}-${dd}`);
  }

  return { start: dates[0], end: dates[6], dates };
}

// Countdown to next 12pm EST (next quiz drop / score release)
export function getNextQuizCountdown(): string {
  const now = new Date();
  // Get EST hour/minute/second reliably across all platforms
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hour12: false,
  }).formatToParts(now);

  const estHour = parseInt(parts.find(p => p.type === 'hour')?.value ?? '0', 10);
  const estMin = parseInt(parts.find(p => p.type === 'minute')?.value ?? '0', 10);
  const estSec = parseInt(parts.find(p => p.type === 'second')?.value ?? '0', 10);

  // Seconds until next 12pm EST
  const nowSeconds = estHour * 3600 + estMin * 60 + estSec;
  const targetSeconds = 12 * 3600;
  let diff = targetSeconds - nowSeconds;
  if (diff <= 0) diff += 24 * 3600; // already past noon, count to tomorrow noon

  const h = Math.floor(diff / 3600).toString().padStart(2, '0');
  const m = Math.floor((diff % 3600) / 60).toString().padStart(2, '0');
  const s = (diff % 60).toString().padStart(2, '0');
  return `${h}:${m}:${s}`;
}
