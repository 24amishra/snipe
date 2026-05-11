import { Text, View, Pressable } from 'react-native';

interface StatCardProps {
  name: string;
  accuracy: number;
  avgTime: number;
  correct?: number;
  total?: number;
  onPress?: () => void;
}

export default function StatCard({ name, accuracy, avgTime, correct, total, onPress }: StatCardProps) {
  const pct = Math.round(accuracy * 100);

  const content = (
    <View
      style={{
        backgroundColor: '#0F0F0F',
        borderRadius: 20,
        padding: 20,
        marginBottom: 12,
      }}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <View>
          <Text
            style={{
              fontFamily: 'Urbanist_700Bold',
              fontSize: 16,
              color: '#FFFFFF',
            }}
          >
            {name}
          </Text>
          {correct !== undefined && total !== undefined && (
            <Text
              style={{
                fontFamily: 'Urbanist_400Regular',
                fontSize: 12,
                color: '#888888',
                marginTop: 2,
              }}
            >
              {correct} of {total}
            </Text>
          )}
        </View>
        <Text
          style={{
            fontFamily: 'Urbanist_400Regular',
            fontSize: 13,
            color: '#888888',
          }}
        >
          avg {avgTime}s
        </Text>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View
          style={{
            flex: 1,
            height: 6,
            backgroundColor: '#222222',
            borderRadius: 3,
            overflow: 'hidden',
          }}
        >
          <View
            style={{
              width: `${pct}%`,
              height: '100%',
              backgroundColor: '#FFFFFF',
              borderRadius: 3,
            }}
          />
        </View>
        <Text
          style={{
            fontFamily: 'Urbanist_400Regular',
            fontSize: 14,
            color: '#FFFFFF',
            width: 40,
            textAlign: 'right',
          }}
        >
          {pct}%
        </Text>
      </View>

      {onPress && (
        <Text
          style={{
            fontFamily: 'Urbanist_400Regular',
            fontSize: 11,
            color: '#888888',
            textAlign: 'right',
            marginTop: 10,
          }}
        >
          more info →
        </Text>
      )}
    </View>
  );

  if (onPress) {
    return (
      <Pressable onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
        {content}
      </Pressable>
    );
  }

  return content;
}
