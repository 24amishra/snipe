# Snipe - CLAUDE.md

## What is Snipe?
Speed-based daily trivia game. Seven questions, eight seconds each, one daily champion per group. Questions drop at 12PM EST. Players compete on leaderboards within friend groups.

## Tech Stack
- **Runtime**: Expo SDK 55, React Native 0.83, React 19.2
- **Navigation**: Expo Router (file-based, under `app/`)
- **Styling**: NativeWind v4 + inline styles (no StyleSheet.create)
- **Backend**: Firebase (Auth, Firestore, Realtime Database, Cloud Functions)
- **Font**: Urbanist via @expo-google-fonts/urbanist
- **Animations**: react-native-reanimated v4

## Project Structure
```
app/
  (tabs)/          # Main tab navigation
    index.tsx      # Today tab - daily game status
    leaderboard.tsx # Leaderboard tab - group rankings
    account.tsx    # Account tab - profile & stats
    _layout.tsx    # Tab navigator config
  auth/
    login.tsx      # Email/password login + forgot password
    signup.tsx     # Account creation
  game/
    index.tsx      # Game play screen
  admin.tsx        # Admin panel
  join.tsx         # Group invite deep link handler
  index.tsx        # Root redirect

components/
  LeaderboardTable.tsx  # Sortable leaderboard with Today/All Time views
  QuestionCard.tsx      # Trivia question display
  SkeletonLoader.tsx    # Loading placeholder (reanimated pulse)
  SnipeWordmark.tsx     # Logo component
  StatCard.tsx          # Stats display card
  TimerBar.tsx          # Countdown timer for questions

lib/
  firebase.ts      # Firebase app init, exports auth/db/rtdb
  firestore.ts     # All Firestore CRUD operations and types
  constants.ts     # Categories, abbreviations
  gameUtils.ts     # Date helpers, score release logic
  googleAuth.ts    # Google OAuth setup
  groupUtils.ts    # Group doc helpers, invite links, member removal
  notifications.ts # Push notification setup

functions/         # Firebase Cloud Functions (Node.js 22)
  src/index.ts     # awardDailyWinners (runs daily at 12PM EST)
```

## Commands
```bash
npm run start          # Start Expo dev server
npm run web            # Start web dev server
npm run ios            # Start iOS simulator
npm run android        # Start Android emulator
npm run build:web      # Export web build to dist/
```

## Key Architecture Decisions

### Styling
- All screens use **inline styles**, not StyleSheet.create
- Dark theme: black background (#000000), white text (#FFFFFF), gray accents (#888888)
- Urbanist_700Bold for headings/buttons, Urbanist_400Regular for body text
- Border radius: 16px for inputs/cards, 20px for buttons, 12px for table containers

### Authentication
- Firebase Auth with email/password
- Firebase calls wrapped in try/catch with mock navigation fallback
- Dynamic imports: `await import('firebase/auth')` in handlers
- Forgot password uses Firebase's `sendPasswordResetEmail`

### Data Flow
- **Game sessions**: Persisted in AsyncStorage (key: "snipe_session")
- **Game completion signal**: `(global as any).__snipeGameComplete` flag polled by Today tab
- **Leaderboard data**: Fetched on every tab focus via useFocusEffect (no caching yet)
- **Score release**: `haveScoresDropped()` polled every 1s to check if 12PM EST has passed

### Firestore Schema
- `users/{uid}` — UserProfile (username, streak, stats, groupIds)
- `gameResults/{auto}` — GameResult (userId, date, score, questions[])
- `dailyQuestions/{date}` — { questions: QuizQuestion[] }
- `groups/{groupId}` — GroupDoc (name, memberIds, inviteCode)
- `groups/{groupId}/leaderboard/{userId}` — LeaderboardEntry (totalScore, wins, streak, categoryStats)
- `questionBank/{auto}` — QuizQuestion source pool

### Key Types (lib/firestore.ts)
- `UserProfile` — user account data, groupIds[], categoryStats
- `GameResult` — single game play record with QuestionEntry[]
- `LeaderboardEntry` — per-user-per-group aggregate stats (totalScore, wins, currentStreak, avgSpeed, categoryStats)
- `TodayEntry` — today's score for leaderboard display (score, avgSpeed, categoryStats)
- `GroupDoc` — group metadata (memberIds, inviteCode)

## Conventions

### Code Style
- TypeScript throughout, no `any` except Firebase error catches
- Functional components with hooks only
- Inline styles per project spec — do not refactor to StyleSheet.create
- Import Firebase modules dynamically in handlers when needed
- Use `normalizeCategory()` from constants.ts when working with category strings

### Component Patterns
- Skeleton loading: 1200ms artificial delay with SkeletonLoader pulse animation
- Bottom sheets: Modal + Animated.View with translateY shared value
- Error messages: red (#EF4444), success messages: green (#22C55E)
- Tab data loading: useFocusEffect with cancelled flag for cleanup

### Things to Watch
- `getGroupTodayScores()` has an N+1 query pattern (sequential per-member reads) — known perf issue
- No caching between tab switches — leaderboard refetches everything on focus
- `saveGameResult()` updates leaderboard entries sequentially per group
- Firebase config uses EXPO_PUBLIC_* env vars (public/client-side keys)

## NativeWind Setup (do not break)
- `metro.config.js`: wraps with `withNativeWind`
- `tailwind.config.js`: must include `presets: [require("nativewind/preset")]`
- `global.css`: contains tailwind directives
- `babel.config.js`: must include `nativewind/babel` preset
- `package.json` main: must be `"expo-router/entry"`

## Deployment
- **Web**: Vercel (vercel.json configured) + Firebase Hosting
- **Mobile**: Managed Expo workflow, no native dirs committed. Would need eas.json + bundle IDs for production builds.
