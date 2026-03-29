import { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, Pressable, Dimensions, AppState } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  runOnJS,
  Easing,
} from 'react-native-reanimated';
import AsyncStorage from '@react-native-async-storage/async-storage';
import SnipeWordmark from '../../components/SnipeWordmark';
import SkeletonLoader from '../../components/SkeletonLoader';
import TimerBar from '../../components/TimerBar';
import { calculateScore, scoreForQuestion, getMidnightCountdown, getTodayDateString } from '../../lib/gameUtils';
import type { QuestionResult, GameSession } from '../../lib/gameUtils';
import { scheduleMidnightScoreNotification } from '../../lib/notifications';
import { saveGameResult, getTodayQuestions, type QuestionEntry, type QuizQuestion } from '../../lib/firestore';
import { auth } from '../../lib/firebase';

const SCREEN_WIDTH = Dimensions.get('window').width;
const TOTAL_QUESTIONS = 7;
const TIME_PER_QUESTION = 8; // seconds

type GamePhase = 'loading' | 'no_questions' | 'ready' | 'resume' | 'playing' | 'gameover';

export default function GameScreen() {
  const router = useRouter();
  const [phase, setPhase] = useState<GamePhase>('loading');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [results, setResults] = useState<QuestionResult[]>([]);
  const [timerKey, setTimerKey] = useState(0);
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [timerRunning, setTimerRunning] = useState(false);
  const [countdown, setCountdown] = useState(getMidnightCountdown());
  const [finalScore, setFinalScore] = useState(0);
  const timerStartRef = useRef<number>(0);
  const hasAnsweredRef = useRef(false);
  const isTransitioningRef = useRef(false);

  // Animation values
  const readyOverlayOpacity = useSharedValue(1);
  const questionTranslateX = useSharedValue(0);
  const questionOpacity = useSharedValue(1);

  // Check for saved session on mount
  useEffect(() => {
    checkForSavedSession();
  }, []);

  const checkForSavedSession = async () => {
    try {
      const today = getTodayDateString();
      const fetched = await getTodayQuestions(today);

      if (fetched.length === 0) {
        setPhase('no_questions');
        return;
      }

      setQuestions(fetched);

      const savedSession = await AsyncStorage.getItem('snipe_session');
      if (savedSession) {
        const session: GameSession = JSON.parse(savedSession);
        if (session.date === today && session.currentQuestionIndex < TOTAL_QUESTIONS) {
          setCurrentIndex(session.currentQuestionIndex);
          setResults(session.results);
          setPhase('resume');
          return;
        }
        await AsyncStorage.removeItem('snipe_session');
      }
    } catch (e) {
      console.log('[SNIPE] Error reading session:', e);
      setPhase('no_questions');
      return;
    }
    setPhase('ready');
  };

  // Save session when leaving mid-game
  useEffect(() => {
    const handleAppState = async (nextAppState: string) => {
      if (nextAppState === 'background' && phase === 'playing' && currentIndex < TOTAL_QUESTIONS) {
        await saveSessionOnExit();
      }
    };

    const sub = AppState.addEventListener('change', handleAppState);
    return () => sub.remove();
  }, [phase, currentIndex, results]);

  // Cleanup: save session if unmounting during play
  useEffect(() => {
    return () => {
      if (phase === 'playing' && currentIndex < TOTAL_QUESTIONS) {
        saveSessionOnExit();
      }
    };
  }, [phase, currentIndex, results]);

  const saveSessionOnExit = async () => {
    const updatedResults = [...results];
    // Current question counts as wrong
    if (currentIndex < TOTAL_QUESTIONS && updatedResults.length <= currentIndex) {
      updatedResults.push({ correct: false, timeRemaining: 0 });
    }
    const session: GameSession = {
      currentQuestionIndex: Math.min(currentIndex + 1, TOTAL_QUESTIONS),
      results: updatedResults,
      date: getTodayDateString(),
    };
    try {
      await AsyncStorage.setItem('snipe_session', JSON.stringify(session));
    } catch (e) {
      console.log('[SNIPE] Error saving session:', e);
    }
  };

  // Countdown timer for game over phase
  useEffect(() => {
    if (phase !== 'gameover') return;
    const interval = setInterval(() => setCountdown(getMidnightCountdown()), 1000);
    return () => clearInterval(interval);
  }, [phase]);

  const handleReady = () => {
    readyOverlayOpacity.value = withTiming(0, { duration: 300 });
    setTimeout(() => {
      // 2-second skeleton pulse before questions appear
      setTimeout(() => {
        setPhase('playing');
        startTimer();
      }, 2000);
    }, 300);
  };

  const handleResume = () => {
    setPhase('playing');
    startTimer();
  };

  const startTimer = () => {
    timerStartRef.current = Date.now();
    hasAnsweredRef.current = false;
    isTransitioningRef.current = false;
    setTimerRunning(true);
    setTimerKey((k) => k + 1);
  };

  const handleTimerComplete = useCallback(() => {
    if (hasAnsweredRef.current || isTransitioningRef.current) return;
    // Time elapsed — auto-advance with no answer
    handleAnswer(null);
  }, [currentIndex, results, questions]);

  const handleAnswer = useCallback((choice: string | null) => {
    if (hasAnsweredRef.current || isTransitioningRef.current) return;
    const question = questions[currentIndex];
    if (!question) return;
    hasAnsweredRef.current = true;
    isTransitioningRef.current = true;
    setTimerRunning(false);

    const elapsed = (Date.now() - timerStartRef.current) / 1000;
    const timeRemaining = Math.max(0, TIME_PER_QUESTION - elapsed);
    const correct = choice !== null && choice === question.answer;

    const newResult: QuestionResult & { selectedAnswer: string | null } = { correct, timeRemaining, selectedAnswer: choice };
    const updatedResults = [...results, newResult];

    // Slide out current question
    questionTranslateX.value = withTiming(-SCREEN_WIDTH, {
      duration: 200,
      easing: Easing.out(Easing.ease),
    });

    setTimeout(() => {
      const nextIndex = currentIndex + 1;

      if (nextIndex >= TOTAL_QUESTIONS) {
        // Game complete
        const score = calculateScore(updatedResults);
        setFinalScore(score);
        setResults(updatedResults);
        AsyncStorage.removeItem('snipe_session');
        scheduleMidnightScoreNotification();
        (global as any).__snipeGameComplete = true;
        setPhase('gameover');

        // Persist to Firestore
        const userId = auth.currentUser?.uid;
        if (userId) {
          const questionEntries: QuestionEntry[] = updatedResults.map((r, i) => {
            const q = questions[i];
            const pointsEarned = scoreForQuestion(r.correct, r.timeRemaining);
            return {
              questionId: q.id,
              category: q.category,
              correct: r.correct,
              timeRemaining: r.timeRemaining,
              pointsEarned,
              selectedAnswer: (r as any).selectedAnswer ?? null,
            };
          });
          saveGameResult(userId, getTodayDateString(), score, questionEntries).catch((err) =>
            console.log('[SNIPE] Error saving game result:', err),
          );
        }
        return;
      }

      // Prepare next question from right
      questionTranslateX.value = SCREEN_WIDTH;
      setCurrentIndex(nextIndex);
      setResults(updatedResults);

      // Slide in next question
      requestAnimationFrame(() => {
        questionTranslateX.value = withTiming(0, {
          duration: 200,
          easing: Easing.out(Easing.ease),
        });
        // Start new timer
        timerStartRef.current = Date.now();
        hasAnsweredRef.current = false;
        isTransitioningRef.current = false;
        setTimerRunning(true);
        setTimerKey((k) => k + 1);
      });
    }, 220);
  }, [currentIndex, results, questions]);

  const questionAnimStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: questionTranslateX.value }],
  }));

  const readyOverlayStyle = useAnimatedStyle(() => ({
    opacity: readyOverlayOpacity.value,
  }));

  const handleGoHome = () => {
    router.replace('/(tabs)');
  };

  // Phase: Loading (checking session)
  if (phase === 'loading') {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#000000', justifyContent: 'center', alignItems: 'center' }}>
        <SkeletonLoader width={120} height={32} borderRadius={8} />
      </SafeAreaView>
    );
  }

  // Phase: No questions available
  if (phase === 'no_questions') {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#000000', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24 }}>
        <Text style={{ fontFamily: 'Urbanist_700Bold', fontSize: 28, color: '#FFFFFF', marginBottom: 12, textAlign: 'center' }}>
          No quiz today
        </Text>
        <Text style={{ fontFamily: 'Urbanist_400Regular', fontSize: 16, color: '#888888', textAlign: 'center', marginBottom: 32 }}>
          Today's questions aren't available yet. Check back later.
        </Text>
        <Pressable
          onPress={handleGoHome}
          style={{
            backgroundColor: '#FFFFFF',
            borderRadius: 20,
            paddingVertical: 18,
            width: '100%',
            alignItems: 'center',
          }}
        >
          <Text style={{ fontFamily: 'Urbanist_700Bold', fontSize: 18, color: '#000000' }}>
            Go Home
          </Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  // Phase: Resume prompt
  if (phase === 'resume') {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#000000', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24 }}>
        <Text style={{ fontFamily: 'Urbanist_700Bold', fontSize: 32, color: '#FFFFFF', marginBottom: 16 }}>
          Resume game
        </Text>
        <Text style={{ fontFamily: 'Urbanist_400Regular', fontSize: 16, color: '#888888', marginBottom: 8 }}>
          Question {currentIndex + 1} of {TOTAL_QUESTIONS}
        </Text>
        <Text style={{ fontFamily: 'Urbanist_400Regular', fontSize: 13, color: '#888888', textAlign: 'center', marginBottom: 40, paddingHorizontal: 20 }}>
          You left this game early. Your last question was marked wrong.
        </Text>
        <Pressable
          onPress={handleResume}
          style={{
            backgroundColor: '#22C55E',
            borderRadius: 20,
            paddingVertical: 18,
            paddingHorizontal: 48,
            width: '100%',
            alignItems: 'center',
          }}
        >
          <Text style={{ fontFamily: 'Urbanist_700Bold', fontSize: 18, color: '#FFFFFF' }}>
            CONTINUE
          </Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  // Phase: Ready screen
  if (phase === 'ready') {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#000000' }}>
        {/* Background skeletons */}
        <View style={{ flex: 1, paddingHorizontal: 20, paddingTop: 80, gap: 12 }}>
          <SkeletonLoader width={'100%' as any} height={180} borderRadius={20} />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
            <View style={{ width: '48%' }}><SkeletonLoader width={'100%' as any} height={72} borderRadius={16} /></View>
            <View style={{ width: '48%' }}><SkeletonLoader width={'100%' as any} height={72} borderRadius={16} /></View>
            <View style={{ width: '48%' }}><SkeletonLoader width={'100%' as any} height={72} borderRadius={16} /></View>
            <View style={{ width: '48%' }}><SkeletonLoader width={'100%' as any} height={72} borderRadius={16} /></View>
          </View>
        </View>

        {/* Ready overlay */}
        <Animated.View
          style={[
            {
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(0,0,0,0.85)',
              justifyContent: 'center',
              alignItems: 'center',
              paddingHorizontal: 24,
            },
            readyOverlayStyle,
          ]}
        >
          <View style={{ marginBottom: 60 }}>
            <SnipeWordmark size="lg" />
          </View>
          <Pressable
            onPress={handleReady}
            style={{
              backgroundColor: '#22C55E',
              borderRadius: 20,
              paddingVertical: 20,
              width: '100%',
              alignItems: 'center',
            }}
          >
            <Text style={{ fontFamily: 'Urbanist_700Bold', fontSize: 20, color: '#FFFFFF' }}>
              READY TO BEGIN
            </Text>
          </Pressable>
        </Animated.View>
      </SafeAreaView>
    );
  }

  // Phase: Game Over
  if (phase === 'gameover') {
    const answeredCount = results.filter((r) => r.correct || r.timeRemaining > 0).length;

    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#000000', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24 }}>
        <Text style={{ fontFamily: 'Urbanist_700Bold', fontSize: 72, color: '#FFFFFF', marginBottom: 16 }}>
          {finalScore}
        </Text>
        <Text style={{ fontFamily: 'Urbanist_400Regular', fontSize: 16, color: '#888888', marginBottom: 8 }}>
          {results.length} / {TOTAL_QUESTIONS} answered
        </Text>
        <Text style={{ fontFamily: 'Urbanist_400Regular', fontSize: 13, color: '#888888', marginBottom: 32 }}>
          scores drop at midnight
        </Text>
        <Text style={{ fontFamily: 'Urbanist_700Bold', fontSize: 40, color: '#FFFFFF', fontVariant: ['tabular-nums'], marginBottom: 48 }}>
          {countdown}
        </Text>
        <Pressable
          onPress={handleGoHome}
          style={{
            backgroundColor: '#FFFFFF',
            borderRadius: 20,
            paddingVertical: 18,
            width: '100%',
            alignItems: 'center',
          }}
        >
          <Text style={{ fontFamily: 'Urbanist_700Bold', fontSize: 18, color: '#000000' }}>
            back to home
          </Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  // Phase: Active game (playing)
  const currentQuestion = questions[currentIndex];
  if (!currentQuestion) return null;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#000000' }}>
      <View style={{ flex: 1, paddingTop: 16 }}>
        {/* Progress indicator */}
        <Text style={{ fontFamily: 'Urbanist_400Regular', fontSize: 14, color: '#FFFFFF', textAlign: 'center', marginBottom: 16 }}>
          {currentIndex + 1} / {TOTAL_QUESTIONS}
        </Text>

        {/* Timer bar */}
        <View style={{ paddingHorizontal: 20, marginBottom: 24 }}>
          <TimerBar
            duration={TIME_PER_QUESTION * 1000}
            isRunning={timerRunning}
            onComplete={handleTimerComplete}
            resetKey={timerKey}
          />
        </View>

        {/* Question + Answers */}
        <Animated.View style={[{ flex: 1, paddingHorizontal: 20 }, questionAnimStyle]}>
          {/* Question card */}
          <View
            style={{
              backgroundColor: '#0F0F0F',
              borderRadius: 20,
              padding: 28,
              minHeight: 180,
              justifyContent: 'center',
              marginBottom: 24,
            }}
          >
            <Text
              style={{
                fontFamily: 'Urbanist_700Bold',
                fontSize: 22,
                color: '#FFFFFF',
                lineHeight: 32,
              }}
            >
              {currentQuestion.question}
            </Text>
          </View>

          {/* Answer choices - 2x2 grid */}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
            {currentQuestion.choices.map((choice, idx) => (
              <Pressable
                key={idx}
                onPress={() => handleAnswer(choice)}
                style={{
                  width: '48%',
                  backgroundColor: '#111111',
                  borderRadius: 16,
                  borderWidth: 1,
                  borderColor: '#222222',
                  padding: 20,
                  alignItems: 'center',
                  justifyContent: 'center',
                  minHeight: 72,
                }}
              >
                <Text
                  style={{
                    fontFamily: 'Urbanist_400Regular',
                    fontSize: 16,
                    color: '#FFFFFF',
                    textAlign: 'center',
                  }}
                  numberOfLines={2}
                >
                  {choice}
                </Text>
              </Pressable>
            ))}
          </View>
        </Animated.View>
      </View>
    </SafeAreaView>
  );
}
