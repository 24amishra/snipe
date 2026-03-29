import { Text, View, Pressable } from 'react-native';

interface QuestionCardProps {
  question: string;
  choices: string[];
  onAnswer: (choice: string) => void;
}

export default function QuestionCard({ question, choices, onAnswer }: QuestionCardProps) {
  return (
    <View style={{ flex: 1, justifyContent: 'center', gap: 24, paddingHorizontal: 20 }}>
      <View
        style={{
          backgroundColor: '#0F0F0F',
          borderRadius: 20,
          padding: 28,
          minHeight: 180,
          justifyContent: 'center',
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
          {question}
        </Text>
      </View>

      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        {choices.map((choice, index) => (
          <Pressable
            key={index}
            onPress={() => onAnswer(choice)}
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
    </View>
  );
}
