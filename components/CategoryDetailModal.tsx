import { View, Text, ScrollView, Pressable, Modal } from 'react-native';
import SkeletonLoader from './SkeletonLoader';
import type { CategoryHistoryQuestion } from '../lib/firestore';

const TIME_PER_QUESTION = 8;

interface Props {
  visible: boolean;
  category: string;
  onClose: () => void;
  questions: CategoryHistoryQuestion[] | null;
}

export default function CategoryDetailModal({ visible, category, onClose, questions }: Props) {
  return (
    <Modal visible={visible} transparent animationType="slide">
      <Pressable onPress={onClose} style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.7)' }}>
        <View onStartShouldSetResponder={() => true} style={{ backgroundColor: '#111111', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, maxHeight: '80%' }}>
          <Text style={{
            fontFamily: 'Urbanist_700Bold',
            fontSize: 20,
            color: '#FFFFFF',
            marginBottom: 4,
          }}>
            {category}
          </Text>
          <Text style={{
            fontFamily: 'Urbanist_400Regular',
            fontSize: 13,
            color: '#888888',
            marginBottom: 20,
          }}>
            Last {questions?.length ?? 7} questions
          </Text>

          {questions === null ? (
            <View style={{ gap: 12 }}>
              {[0, 1, 2].map((i) => (
                <SkeletonLoader key={i} width={'100%' as any} height={100} borderRadius={16} />
              ))}
            </View>
          ) : questions.length === 0 ? (
            <View style={{
              borderWidth: 1,
              borderColor: '#1A1A1A',
              borderRadius: 16,
              padding: 20,
              alignItems: 'center',
            }}>
              <Text style={{ fontFamily: 'Urbanist_400Regular', fontSize: 14, color: '#888888' }}>
                No questions yet
              </Text>
            </View>
          ) : (
            <ScrollView showsVerticalScrollIndicator={false}>
              {questions.map((q, i) => {
                const speed = Math.round((TIME_PER_QUESTION - q.timeRemaining) * 10) / 10;
                const isTimeout = q.selectedAnswer === 'No answer';

                return (
                  <View
                    key={`${q.questionId}-${q.date}`}
                    style={{
                      backgroundColor: '#0F0F0F',
                      borderRadius: 16,
                      padding: 16,
                      marginBottom: i < questions.length - 1 ? 10 : 0,
                    }}
                  >
                    {/* Date + correct/wrong */}
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <Text style={{
                        fontFamily: 'Urbanist_400Regular',
                        fontSize: 11,
                        color: '#888888',
                      }}>
                        {q.date}
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
                      fontSize: 14,
                      color: '#FFFFFF',
                      lineHeight: 20,
                      marginBottom: 10,
                    }}>
                      {q.questionText}
                    </Text>

                    <View style={{ marginBottom: 4 }}>
                      <Text style={{ fontFamily: 'Urbanist_400Regular', fontSize: 12, color: '#888888' }}>
                        You answered:
                      </Text>
                      <Text style={{
                        fontFamily: 'Urbanist_700Bold',
                        fontSize: 13,
                        color: q.correct ? '#22C55E' : isTimeout ? '#888888' : '#EF4444',
                        marginTop: 1,
                      }}>
                        {q.selectedAnswer}
                      </Text>
                    </View>

                    {!q.correct && (
                      <View style={{ marginBottom: 4 }}>
                        <Text style={{ fontFamily: 'Urbanist_400Regular', fontSize: 12, color: '#888888' }}>
                          Correct answer:
                        </Text>
                        <Text style={{
                          fontFamily: 'Urbanist_700Bold',
                          fontSize: 13,
                          color: '#22C55E',
                          marginTop: 1,
                        }}>
                          {q.correctAnswer}
                        </Text>
                      </View>
                    )}

                    <Text style={{ fontFamily: 'Urbanist_400Regular', fontSize: 11, color: '#888888', marginTop: 4 }}>
                      Speed: {speed}s
                    </Text>
                  </View>
                );
              })}
              <View style={{ height: 20 }} />
            </ScrollView>
          )}
        </View>
      </Pressable>
    </Modal>
  );
}
