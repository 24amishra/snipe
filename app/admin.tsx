import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  Alert,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ChevronLeft, ChevronRight, Check, Plus, X, Trash2 } from 'lucide-react-native';
import { auth } from '../lib/firebase';
import {
  getAllBankQuestions,
  addQuestionToBank,
  setDailyQuestions,
  getTodayQuestions,
  type QuizQuestion,
} from '../lib/firestore';
import { CATEGORIES } from '../lib/constants';
import { getTodayDateString } from '../lib/gameUtils';

function formatDate(d: Date): string {
  return d.toISOString().split('T')[0];
}

function friendlyDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-');
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${months[parseInt(m, 10) - 1]} ${parseInt(d, 10)}, ${y}`;
}

export default function AdminScreen() {
  const router = useRouter();

  // Gate: redirect non-admin users
  useEffect(() => {
    if (auth.currentUser?.email !== 'admin@gmail.com') {
      router.replace('/(tabs)');
    }
  }, []);

  // Date state — default to next game day (the one after the currently live day)
  const [selectedDate, setSelectedDate] = useState(() => {
    const currentGameDay = getTodayDateString(); // already accounts for 12pm EST flip
    const next = new Date(currentGameDay + 'T00:00:00');
    next.setDate(next.getDate() + 1);
    return formatDate(next);
  });

  // Data
  const [dailyQs, setDailyQs] = useState<QuizQuestion[]>([]);
  const [bankQuestions, setBankQuestions] = useState<QuizQuestion[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [filterCategory, setFilterCategory] = useState<string | null>(null);

  // Add form state
  const [formCategory, setFormCategory] = useState('');
  const [formQuestion, setFormQuestion] = useState('');
  const [formChoices, setFormChoices] = useState(['', '', '', '']);
  const [formAnswer, setFormAnswer] = useState<number | null>(null);
  const [formSaving, setFormSaving] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [daily, bank] = await Promise.all([
        getTodayQuestions(selectedDate),
        getAllBankQuestions(),
      ]);
      setDailyQs(daily);
      setBankQuestions(bank);
    } catch (e) {
      console.log('[SNIPE] Admin load error:', e);
    }
    setLoading(false);
  }, [selectedDate]);

  useEffect(() => {
    loadData();
    setSelectedIds(new Set());
  }, [loadData]);

  const shiftDate = (days: number) => {
    const d = new Date(selectedDate + 'T00:00:00');
    d.setDate(d.getDate() + days);
    setSelectedDate(formatDate(d));
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        if (next.size >= 7) return prev;
        next.add(id);
      }
      return next;
    });
  };

  const handlePublish = async () => {
    if (selectedIds.size !== 7) return;
    setPublishing(true);
    try {
      const selected = bankQuestions.filter((q) => selectedIds.has(q.id));
      await setDailyQuestions(selectedDate, selected);
      Alert.alert('Published!', `7 questions set for ${friendlyDate(selectedDate)}`);
      setDailyQs(selected);
      setSelectedIds(new Set());
    } catch (e) {
      console.log('[SNIPE] Publish error:', e);
      Alert.alert('Error', 'Failed to publish questions');
    }
    setPublishing(false);
  };

  const handleClearDaily = async () => {
    try {
      await setDailyQuestions(selectedDate, []);
      setDailyQs([]);
      Alert.alert('Cleared', `Questions removed for ${friendlyDate(selectedDate)}`);
    } catch (e) {
      Alert.alert('Error', 'Failed to clear questions');
    }
  };

  const handleAddQuestion = async () => {
    const trimmedCategory = formCategory.trim();
    const trimmedQuestion = formQuestion.trim();
    const trimmedChoices = formChoices.map((c) => c.trim());

    if (!trimmedCategory || !trimmedQuestion) {
      Alert.alert('Missing fields', 'Category and question are required');
      return;
    }
    if (trimmedChoices.some((c) => !c)) {
      Alert.alert('Missing fields', 'All 4 choices are required');
      return;
    }
    if (formAnswer === null) {
      Alert.alert('Missing answer', 'Tap a choice to mark it as the correct answer');
      return;
    }

    setFormSaving(true);
    try {
      const newId = await addQuestionToBank({
        category: trimmedCategory,
        question: trimmedQuestion,
        choices: trimmedChoices,
        answer: trimmedChoices[formAnswer],
      });
      setBankQuestions((prev) => [
        { id: newId, category: trimmedCategory, question: trimmedQuestion, choices: trimmedChoices, answer: trimmedChoices[formAnswer!] },
        ...prev,
      ]);
      // Reset form
      setFormCategory('');
      setFormQuestion('');
      setFormChoices(['', '', '', '']);
      setFormAnswer(null);
      setShowAddForm(false);
    } catch (e) {
      console.log('[SNIPE] Add question error:', e);
      Alert.alert('Error', 'Failed to add question');
    }
    setFormSaving(false);
  };

  const filteredBank = filterCategory
    ? bankQuestions.filter((q) => q.category === filterCategory)
    : bankQuestions;

  if (auth.currentUser?.email !== 'admin@gmail.com') {
    return null;
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#000000' }}>
      <ScrollView style={{ flex: 1, paddingHorizontal: 20 }}>
        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingTop: 16, paddingBottom: 20 }}>
          <Pressable onPress={() => router.back()} style={{ padding: 4, marginRight: 12 }}>
            <ChevronLeft color="#FFFFFF" size={24} />
          </Pressable>
          <Text style={{ fontFamily: 'Urbanist_700Bold', fontSize: 24, color: '#FFFFFF', flex: 1 }}>
            Admin
          </Text>
        </View>

        {/* Date Selector */}
        <View style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#111111',
          borderRadius: 16,
          padding: 16,
          marginBottom: 24,
          borderWidth: 1,
          borderColor: '#1A1A1A',
        }}>
          <Pressable onPress={() => shiftDate(-1)} style={{ padding: 8 }}>
            <ChevronLeft color="#FFFFFF" size={20} />
          </Pressable>
          <Text style={{ fontFamily: 'Urbanist_700Bold', fontSize: 18, color: '#FFFFFF', marginHorizontal: 16 }}>
            {friendlyDate(selectedDate)}
          </Text>
          <Pressable onPress={() => shiftDate(1)} style={{ padding: 8 }}>
            <ChevronRight color="#FFFFFF" size={20} />
          </Pressable>
        </View>

        {loading ? (
          <ActivityIndicator color="#FFFFFF" size="large" style={{ marginTop: 40 }} />
        ) : (
          <>
            {/* Section A — Daily Questions */}
            <View style={{ marginBottom: 32 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <Text style={{ fontFamily: 'Urbanist_700Bold', fontSize: 12, color: '#888888', letterSpacing: 2, textTransform: 'uppercase' }}>
                  QUESTIONS FOR {friendlyDate(selectedDate).toUpperCase()}
                </Text>
                {dailyQs.length > 0 && (
                  <Pressable onPress={handleClearDaily} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Trash2 color="#EF4444" size={14} />
                    <Text style={{ fontFamily: 'Urbanist_400Regular', fontSize: 13, color: '#EF4444' }}>Clear</Text>
                  </Pressable>
                )}
              </View>

              {dailyQs.length === 0 ? (
                <View style={{
                  backgroundColor: '#111111',
                  borderRadius: 16,
                  padding: 24,
                  alignItems: 'center',
                  borderWidth: 1,
                  borderColor: '#1A1A1A',
                }}>
                  <Text style={{ fontFamily: 'Urbanist_400Regular', fontSize: 15, color: '#666666' }}>
                    No questions set
                  </Text>
                </View>
              ) : (
                dailyQs.map((q, i) => (
                  <View key={q.id + '-daily-' + i} style={{
                    backgroundColor: '#111111',
                    borderRadius: 16,
                    padding: 16,
                    marginBottom: 8,
                    borderWidth: 1,
                    borderColor: '#1A1A1A',
                  }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                      <View style={{ backgroundColor: '#1A1A1A', borderRadius: 100, paddingHorizontal: 10, paddingVertical: 4 }}>
                        <Text style={{ fontFamily: 'Urbanist_400Regular', fontSize: 12, color: '#888888' }}>
                          {q.category}
                        </Text>
                      </View>
                      <Text style={{ fontFamily: 'Urbanist_400Regular', fontSize: 12, color: '#444444', marginLeft: 8 }}>
                        #{i + 1}
                      </Text>
                    </View>
                    <Text style={{ fontFamily: 'Urbanist_400Regular', fontSize: 14, color: '#FFFFFF', marginBottom: 4 }} numberOfLines={2}>
                      {q.question}
                    </Text>
                    <Text style={{ fontFamily: 'Urbanist_400Regular', fontSize: 12, color: '#22C55E' }}>
                      Answer: {q.answer}
                    </Text>
                  </View>
                ))
              )}
            </View>

            {/* Section B — Question Bank */}
            <View style={{ marginBottom: 32 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <Text style={{ fontFamily: 'Urbanist_700Bold', fontSize: 12, color: '#888888', letterSpacing: 2, textTransform: 'uppercase' }}>
                  QUESTION BANK
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <View style={{ backgroundColor: '#1A1A1A', borderRadius: 100, paddingHorizontal: 10, paddingVertical: 4 }}>
                    <Text style={{ fontFamily: 'Urbanist_700Bold', fontSize: 12, color: selectedIds.size === 7 ? '#22C55E' : '#FFFFFF' }}>
                      {selectedIds.size}/7 selected
                    </Text>
                  </View>
                  <Pressable onPress={() => setShowAddForm(true)} style={{ padding: 4 }}>
                    <Plus color="#FFFFFF" size={20} />
                  </Pressable>
                </View>
              </View>

              {/* Category filter pills */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
                <Pressable
                  onPress={() => setFilterCategory(null)}
                  style={{
                    backgroundColor: filterCategory === null ? '#FFFFFF' : '#1A1A1A',
                    borderRadius: 100,
                    paddingHorizontal: 14,
                    paddingVertical: 6,
                    marginRight: 8,
                  }}
                >
                  <Text style={{
                    fontFamily: 'Urbanist_400Regular',
                    fontSize: 13,
                    color: filterCategory === null ? '#000000' : '#888888',
                  }}>
                    All
                  </Text>
                </Pressable>
                {CATEGORIES.map((cat) => (
                  <Pressable
                    key={cat}
                    onPress={() => setFilterCategory(filterCategory === cat ? null : cat)}
                    style={{
                      backgroundColor: filterCategory === cat ? '#FFFFFF' : '#1A1A1A',
                      borderRadius: 100,
                      paddingHorizontal: 14,
                      paddingVertical: 6,
                      marginRight: 8,
                    }}
                  >
                    <Text style={{
                      fontFamily: 'Urbanist_400Regular',
                      fontSize: 13,
                      color: filterCategory === cat ? '#000000' : '#888888',
                    }}>
                      {cat}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>

              {filteredBank.length === 0 ? (
                <View style={{
                  backgroundColor: '#111111',
                  borderRadius: 16,
                  padding: 24,
                  alignItems: 'center',
                  borderWidth: 1,
                  borderColor: '#1A1A1A',
                }}>
                  <Text style={{ fontFamily: 'Urbanist_400Regular', fontSize: 15, color: '#666666' }}>
                    No questions in bank
                  </Text>
                </View>
              ) : (
                filteredBank.map((q) => {
                  const isSelected = selectedIds.has(q.id);
                  return (
                    <Pressable
                      key={q.id}
                      onPress={() => toggleSelect(q.id)}
                      style={{
                        backgroundColor: '#111111',
                        borderRadius: 16,
                        padding: 16,
                        marginBottom: 8,
                        borderWidth: 1,
                        borderColor: isSelected ? '#22C55E' : '#1A1A1A',
                        flexDirection: 'row',
                        alignItems: 'flex-start',
                      }}
                    >
                      {/* Checkbox */}
                      <View style={{
                        width: 24,
                        height: 24,
                        borderRadius: 6,
                        borderWidth: 2,
                        borderColor: isSelected ? '#22C55E' : '#333333',
                        backgroundColor: isSelected ? '#22C55E' : 'transparent',
                        alignItems: 'center',
                        justifyContent: 'center',
                        marginRight: 12,
                        marginTop: 2,
                      }}>
                        {isSelected && <Check color="#000000" size={14} />}
                      </View>
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                          <View style={{ backgroundColor: '#1A1A1A', borderRadius: 100, paddingHorizontal: 10, paddingVertical: 4 }}>
                            <Text style={{ fontFamily: 'Urbanist_400Regular', fontSize: 12, color: '#888888' }}>
                              {q.category}
                            </Text>
                          </View>
                        </View>
                        <Text style={{ fontFamily: 'Urbanist_400Regular', fontSize: 14, color: '#FFFFFF', marginBottom: 4 }} numberOfLines={2}>
                          {q.question}
                        </Text>
                        <Text style={{ fontFamily: 'Urbanist_400Regular', fontSize: 12, color: '#22C55E' }}>
                          Answer: {q.answer}
                        </Text>
                      </View>
                    </Pressable>
                  );
                })
              )}

              {/* Publish Button */}
              <Pressable
                onPress={handlePublish}
                disabled={selectedIds.size !== 7 || publishing}
                style={{
                  backgroundColor: selectedIds.size === 7 ? '#FFFFFF' : '#222222',
                  borderRadius: 16,
                  paddingVertical: 16,
                  alignItems: 'center',
                  marginTop: 16,
                  opacity: publishing ? 0.5 : 1,
                }}
              >
                <Text style={{
                  fontFamily: 'Urbanist_700Bold',
                  fontSize: 16,
                  color: selectedIds.size === 7 ? '#000000' : '#666666',
                }}>
                  {publishing ? 'Publishing...' : `Publish to ${friendlyDate(selectedDate)}`}
                </Text>
              </Pressable>
            </View>
          </>
        )}

        <View style={{ height: 60 }} />
      </ScrollView>

      {/* Add Question Modal */}
      <Modal visible={showAddForm} transparent animationType="slide">
        <Pressable onPress={() => setShowAddForm(false)} style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.7)' }}>
          <Pressable onPress={() => {}} style={{ backgroundColor: '#111111', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, maxHeight: '85%' }}>
            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <Text style={{ fontFamily: 'Urbanist_700Bold', fontSize: 20, color: '#FFFFFF' }}>
                  Add Question
                </Text>
                <Pressable onPress={() => setShowAddForm(false)} style={{ padding: 4 }}>
                  <X color="#888888" size={20} />
                </Pressable>
              </View>

              {/* Category */}
              <Text style={{ fontFamily: 'Urbanist_400Regular', fontSize: 13, color: '#888888', marginBottom: 8 }}>Category</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
                {CATEGORIES.map((cat) => (
                  <Pressable
                    key={cat}
                    onPress={() => setFormCategory(cat)}
                    style={{
                      backgroundColor: formCategory === cat ? '#FFFFFF' : '#1A1A1A',
                      borderRadius: 100,
                      paddingHorizontal: 16,
                      paddingVertical: 8,
                    }}
                  >
                    <Text style={{
                      fontFamily: 'Urbanist_400Regular',
                      fontSize: 14,
                      color: formCategory === cat ? '#000000' : '#888888',
                    }}>
                      {cat}
                    </Text>
                  </Pressable>
                ))}
              </View>

              {/* Question */}
              <Text style={{ fontFamily: 'Urbanist_400Regular', fontSize: 13, color: '#888888', marginBottom: 6 }}>Question</Text>
              <TextInput
                placeholder="Enter question text..."
                placeholderTextColor="#444444"
                value={formQuestion}
                onChangeText={setFormQuestion}
                multiline
                style={{
                  fontFamily: 'Urbanist_400Regular',
                  fontSize: 16,
                  color: '#FFFFFF',
                  borderWidth: 1,
                  borderColor: '#222222',
                  borderRadius: 12,
                  paddingHorizontal: 16,
                  paddingVertical: 14,
                  marginBottom: 16,
                  minHeight: 80,
                  textAlignVertical: 'top',
                }}
              />

              {/* Choices */}
              <Text style={{ fontFamily: 'Urbanist_400Regular', fontSize: 13, color: '#888888', marginBottom: 6 }}>
                Choices (tap to mark correct answer)
              </Text>
              {formChoices.map((choice, i) => (
                <Pressable
                  key={i}
                  onPress={() => setFormAnswer(i)}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    marginBottom: 8,
                  }}
                >
                  <View style={{
                    width: 24,
                    height: 24,
                    borderRadius: 12,
                    borderWidth: 2,
                    borderColor: formAnswer === i ? '#22C55E' : '#333333',
                    backgroundColor: formAnswer === i ? '#22C55E' : 'transparent',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginRight: 10,
                  }}>
                    {formAnswer === i && <Check color="#000000" size={12} />}
                  </View>
                  <TextInput
                    placeholder={`Choice ${i + 1}`}
                    placeholderTextColor="#444444"
                    value={choice}
                    onChangeText={(text) => {
                      const next = [...formChoices];
                      next[i] = text;
                      setFormChoices(next);
                    }}
                    style={{
                      flex: 1,
                      fontFamily: 'Urbanist_400Regular',
                      fontSize: 16,
                      color: '#FFFFFF',
                      borderWidth: 1,
                      borderColor: formAnswer === i ? '#22C55E' : '#222222',
                      borderRadius: 12,
                      paddingHorizontal: 16,
                      paddingVertical: 12,
                    }}
                  />
                </Pressable>
              ))}

              {/* Submit */}
              <Pressable
                onPress={handleAddQuestion}
                disabled={formSaving}
                style={{
                  backgroundColor: '#FFFFFF',
                  borderRadius: 16,
                  paddingVertical: 16,
                  alignItems: 'center',
                  marginTop: 16,
                  opacity: formSaving ? 0.5 : 1,
                }}
              >
                <Text style={{ fontFamily: 'Urbanist_700Bold', fontSize: 16, color: '#000000' }}>
                  {formSaving ? 'Adding...' : 'Add to Bank'}
                </Text>
              </Pressable>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}
