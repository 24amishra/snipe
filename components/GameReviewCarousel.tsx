import { useRef, useState } from 'react';
import { View, Text, ScrollView, Dimensions, NativeSyntheticEvent, NativeScrollEvent } from 'react-native';
import type { ReviewQuestion } from '../lib/firestore';

const TIME_PER_QUESTION = 8;

interface Props {
  reviewQuestions: ReviewQuestion[];
}

export default function GameReviewCarousel({ reviewQuestions }: Props) {
  const scrollRef = useRef<ScrollView>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const cardWidth = Dimensions.get('window').width - 40;

  const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const index = Math.round(e.nativeEvent.contentOffset.x / cardWidth);
    if (index >= 0 && index < reviewQuestions.length) {
      setActiveIndex(index);
    }
  };

  if (reviewQuestions.length === 0) return null;

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
      >
        {reviewQuestions.map((q) => {
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
              {/* Category + correct/wrong indicator */}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <Text style={{
                  fontFamily: 'Urbanist_700Bold',
                  fontSize: 11,
                  color: '#888888',
                  letterSpacing: 1.5,
                  textTransform: 'uppercase',
                }}>
                  {q.category}
                </Text>
                <Text style={{
                  fontFamily: 'Urbanist_700Bold',
                  fontSize: 11,
                  color: q.correct ? '#22C55E' : '#EF4444',
                }}>
                  {q.correct ? 'CORRECT' : 'WRONG'}
                </Text>
              </View>

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
                  color: q.correct ? '#22C55E' : isTimeout ? '#888888' : '#EF4444',
                  marginTop: 2,
                }}>
                  {q.selectedAnswer}
                </Text>
              </View>

              {!q.correct && (
                <View style={{ marginBottom: 8 }}>
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
              )}

              <Text style={{ fontFamily: 'Urbanist_400Regular', fontSize: 12, color: '#888888', marginTop: 4 }}>
                Speed: {speed}s
              </Text>
            </View>
          );
        })}
      </ScrollView>

      {/* Dot indicators — colored green/red */}
      {reviewQuestions.length > 1 && (
        <View style={{ flexDirection: 'row', justifyContent: 'center', marginTop: 12, gap: 6 }}>
          {reviewQuestions.map((q, i) => (
            <View
              key={i}
              style={{
                width: 6,
                height: 6,
                borderRadius: 3,
                backgroundColor: i === activeIndex
                  ? (q.correct ? '#22C55E' : '#EF4444')
                  : '#333333',
              }}
            />
          ))}
        </View>
      )}
    </View>
  );
}
