import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyBBNXJouutJl0_IX3EOmFyrG8FZ9DL7Eng",
  authDomain: "snipe-a8330.firebaseapp.com",
  databaseURL: "https://snipe-a8330-default-rtdb.firebaseio.com",
  projectId: "snipe-a8330",
  storageBucket: "snipe-a8330.firebasestorage.app",
  messagingSenderId: "132441623910",
  appId: "1:132441623910:web:c2749a6d02031c33f48ca7",
  measurementId: "G-9KZPC4JZTS",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const today = new Date().toISOString().split('T')[0];

const questions = [
  {
    id: "1",
    category: "Pop Culture",
    question: "Which artist released the album \"Midnights\" in 2022?",
    choices: ["Beyonce", "Taylor Swift", "Billie Eilish", "Olivia Rodrigo"],
    answer: "Taylor Swift",
  },
  {
    id: "2",
    category: "History",
    question: "In what year did the Berlin Wall fall?",
    choices: ["1987", "1989", "1991", "1993"],
    answer: "1989",
  },
  {
    id: "3",
    category: "Current Events",
    question: "Which country hosted the 2024 Summer Olympics?",
    choices: ["Japan", "USA", "France", "Australia"],
    answer: "France",
  },
  {
    id: "4",
    category: "Sports",
    question: "Who won the 2024 NBA Championship?",
    choices: ["Celtics", "Heat", "Lakers", "Warriors"],
    answer: "Celtics",
  },
  {
    id: "5",
    category: "Science",
    question: "What is the chemical symbol for gold?",
    choices: ["Go", "Gd", "Au", "Ag"],
    answer: "Au",
  },
  {
    id: "6",
    category: "Pop Culture",
    question: "Which show features a character named Walter White?",
    choices: ["Succession", "Breaking Bad", "The Wire", "Ozark"],
    answer: "Breaking Bad",
  },
  {
    id: "7",
    category: "History",
    question: "Who was the first person to walk on the moon?",
    choices: ["Buzz Aldrin", "Yuri Gagarin", "Neil Armstrong", "John Glenn"],
    answer: "Neil Armstrong",
  },
];

console.log(`Seeding dailyQuestions/${today} with ${questions.length} questions...`);

try {
  await setDoc(doc(db, 'dailyQuestions', today), { questions });
  console.log('Done — document created successfully.');
} catch (e) {
  console.error('Error writing to Firestore:', e.message);
  console.log('\nIf you get a permission error, make sure your Firestore rules allow writes.');
  console.log('You can temporarily set rules to: allow read, write: if true;');
}

process.exit(0);
