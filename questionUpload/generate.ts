/**
 * Snipe Question Generator & Uploader
 *
 * Generates 42 trivia questions (7 days × 6/day) using Claude and uploads
 * them to the Firebase questionBank collection.
 *
 * Usage:
 *   1. Copy .env.example to .env and fill in your keys
 *   2. npm install
 *   3. npm run generate
 */

import 'dotenv/config';
import Anthropic from '@anthropic-ai/sdk';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, collection, addDoc, serverTimestamp, writeBatch, doc } from 'firebase/firestore';
import { SYSTEM_PROMPT } from './prompt.js';

// ─── Types ────────────────────────────────────────────────────────────

interface Question {
  category: string;
  question: string;
  choices: string[];
  answer: string;
}

const VALID_CATEGORIES = ['Sports', 'History', 'Science', 'Entertainment', 'Music'];

const EXPECTED_COUNTS: Record<string, number> = {
  Sports: 7,
  History: 14,
  Science: 7,
  Entertainment: 7,
  Music: 7,
};

// ─── Firebase Init ────────────────────────────────────────────────────

async function initFirebase() {
  const app = initializeApp({
    apiKey: process.env.FIREBASE_API_KEY,
    authDomain: process.env.FIREBASE_AUTH_DOMAIN,
    projectId: process.env.FIREBASE_PROJECT_ID,
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.FIREBASE_APP_ID,
  });

  const auth = getAuth(app);
  const db = getFirestore(app);

  const email = process.env.FIREBASE_ADMIN_EMAIL;
  const password = process.env.FIREBASE_ADMIN_PASSWORD;

  if (!email || !password) {
    throw new Error('Missing FIREBASE_ADMIN_EMAIL or FIREBASE_ADMIN_PASSWORD in .env');
  }

  console.log(`Signing in as ${email}...`);
  await signInWithEmailAndPassword(auth, email, password);
  console.log('Authenticated.\n');

  return db;
}

// ─── Validation ───────────────────────────────────────────────────────

function validateQuestions(questions: Question[]): { valid: Question[]; errors: string[] } {
  const errors: string[] = [];
  const valid: Question[] = [];

  if (questions.length !== 42) {
    errors.push(`Expected 42 questions, got ${questions.length}`);
  }

  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    const prefix = `Q${i + 1}`;

    if (!VALID_CATEGORIES.includes(q.category)) {
      errors.push(`${prefix}: Invalid category "${q.category}"`);
      continue;
    }
    if (!q.question || q.question.trim().length === 0) {
      errors.push(`${prefix}: Missing question text`);
      continue;
    }
    if (!Array.isArray(q.choices) || q.choices.length !== 4) {
      errors.push(`${prefix}: Must have exactly 4 choices, got ${q.choices?.length}`);
      continue;
    }
    if (!q.answer || !q.choices.includes(q.answer)) {
      errors.push(`${prefix}: Answer "${q.answer}" not found in choices`);
      continue;
    }

    valid.push(q);
  }

  // Check category distribution
  const counts: Record<string, number> = {};
  for (const q of valid) {
    counts[q.category] = (counts[q.category] || 0) + 1;
  }
  for (const [cat, expected] of Object.entries(EXPECTED_COUNTS)) {
    const actual = counts[cat] || 0;
    if (actual !== expected) {
      errors.push(`Category "${cat}": expected ${expected}, got ${actual}`);
    }
  }

  return { valid, errors };
}

// ─── Generate Questions via Claude ────────────────────────────────────

async function generateQuestions(): Promise<Question[]> {
  const client = new Anthropic();

  console.log('Generating 42 questions via Claude...\n');

  const response = await client.messages.create({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 16000,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: 'Generate 42 trivia questions for the next 7 days. Return only the JSON array.',
      },
    ],
  });

  const text = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('');

  // Strip markdown code fences if present
  const cleaned = text.replace(/^```(?:json)?\s*\n?/m, '').replace(/\n?```\s*$/m, '').trim();

  const parsed = JSON.parse(cleaned);
  const questions: Question[] = Array.isArray(parsed) ? parsed : parsed.questions;

  if (!Array.isArray(questions)) {
    throw new Error('Claude response did not contain a valid question array');
  }

  return questions;
}

// ─── Upload to Firebase ───────────────────────────────────────────────

async function uploadQuestions(db: ReturnType<typeof getFirestore>, questions: Question[]) {
  const bankRef = collection(db, 'questionBank');

  // Firestore batches are limited to 500 ops — 42 is well within that
  const batch = writeBatch(db);

  for (const q of questions) {
    const ref = doc(bankRef);
    batch.set(ref, {
      category: q.category,
      question: q.question,
      choices: q.choices,
      answer: q.answer,
      createdAt: serverTimestamp(),
    });
  }

  await batch.commit();
}

// ─── Main ─────────────────────────────────────────────────────────────

async function main() {
  // Generate
  const questions = await generateQuestions();

  // Validate
  const { valid, errors } = validateQuestions(questions);

  if (errors.length > 0) {
    console.log('Validation issues:');
    for (const e of errors) console.log(`  - ${e}`);
    console.log();
  }

  // Print summary
  const counts: Record<string, number> = {};
  for (const q of valid) {
    counts[q.category] = (counts[q.category] || 0) + 1;
  }
  console.log('Category breakdown:');
  for (const [cat, count] of Object.entries(counts).sort()) {
    console.log(`  ${cat}: ${count}`);
  }
  console.log(`\nTotal valid questions: ${valid.length}\n`);

  if (valid.length === 0) {
    console.log('No valid questions to upload. Exiting.');
    process.exit(1);
  }

  // Preview first question
  console.log('Sample question:');
  console.log(`  [${valid[0].category}] ${valid[0].question}`);
  console.log(`  Choices: ${valid[0].choices.join(' | ')}`);
  console.log(`  Answer: ${valid[0].answer}\n`);

  // Upload to Firebase
  const db = await initFirebase();
  console.log(`Uploading ${valid.length} questions to questionBank...`);
  await uploadQuestions(db, valid);
  console.log('Done! All questions uploaded successfully.');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
