import { useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, Dimensions, NativeSyntheticEvent, NativeScrollEvent } from 'react-native';
import type { MissedQuestion } from '../lib/firestore';

const TIME_PER_QUESTION = 10;
const AUTO_CYCLE_MS = 4000;

interface Props {
  missedQuestions: MissedQuestion[];
}

export default function MissedQuestionsCarousel({ missedQuestions }: Props) {
  const scrollRef = useRef<ScrollView>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cardWidth = Dimensions.get('window').width - 40; // 20px padding each side

  const startAutoCycle = () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (missedQuestions.length <= 1) return;
    intervalRef.current = setInterval(() => {
      setActiveIndex((prev) => {
        const next = (prev + 1) % missedQuestions.length;
        scrollRef.current?.scrollTo({ x: next * cardWidth, animated: true });
        return next;
      });
    }, AUTO_CYCLE_MS);
  };

  useEffect(() => {
    startAutoCycle();
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [missedQuestions.length, cardWidth]);

  const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const index = Math.round(e.nativeEvent.contentOffset.x / cardWidth);
    if (index >= 0 && index < missedQuestions.length) {
      setActiveIndex(index);
      // Reset auto-cycle timer so it doesn't jump right after a manual swipe
      startAutoCycle();
    }
  };

  if (missedQuestions.length === 0) return null;

  return (
    <View>
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={handleScroll}
        decelerationRate="fast"
        snapToInterval={cardWidth}
        contentContainerStyle={{ gap: 0 }}
      >
        {missedQuestions.map((q, i) => {
          const speed = Math.round((TIME_PER_QUESTION - q.timeRemaining) * 10) / 10;
          const isTimeout = q.selectedAnswer === 'No answer';

          return (
            <View
              key={q.questionId}
              style={{
                width: cardWidth,
                backgroundColor: '#0F0F0F',
                borderRadius: 20,
                padding: 20,
              }}
            >
              <Text style={{
                fontFamily: 'Urbanist_700Bold',
                fontSize: 11,
                color: '#888888',
                letterSpacing: 1.5,
                textTransform: 'uppercase',
                marginBottom: 8,
              }}>
                {q.category}
              </Text>

              <Text style={{
                fontFamily: 'Urbanist_700Bold',
                fontSize: 16,
                color: '#FFFFFF',
                marginBottom: 16,
                lineHeight: 22,
              }}>
                {q.questionText}
              </Text>

              <View style={{ marginBottom: 8 }}>
                <Text style={{ fontFamily: 'Urbanist_400Regular', fontSize: 13, color: '#888888' }}>
                  You answered:
                </Text>
                <Text style={{
                  fontFamily: 'Urbanist_700Bold',
                  fontSize: 14,
                  color: isTimeout ? '#888888' : '#EF4444',
                  marginTop: 2,
                }}>
                  {q.selectedAnswer}
                </Text>
              </View>

              <View style={{ marginBottom: 12 }}>
                <Text style={{ fontFamily: 'Urbanist_400Regular', fontSize: 13, color: '#888888' }}>
                  Correct answer:
                </Text>
                <Text style={{
                  fontFamily: 'Urbanist_700Bold',
                  fontSize: 14,
                  color: '#22C55E',
                  marginTop: 2,
                }}>
                  {q.correctAnswer}
                </Text>
              </View>

              <Text style={{ fontFamily: 'Urbanist_400Regular', fontSize: 12, color: '#888888' }}>
                Speed: {speed}s
              </Text>
            </View>
          );
        })}
      </ScrollView>

      {/* Dot indicators */}
      {missedQuestions.length > 1 && (
        <View style={{ flexDirection: 'row', justifyContent: 'center', marginTop: 12, gap: 6 }}>
          {missedQuestions.map((_, i) => (
            <View
              key={i}
              style={{
                width: 6,
                height: 6,
                borderRadius: 3,
                backgroundColor: i === activeIndex ? '#FFFFFF' : '#333333',
              }}
            />
          ))}
        </View>
      )}
    </View>
  );
}
