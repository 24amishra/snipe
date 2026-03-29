import { Text, View } from 'react-native';

interface StatCardProps {
  name: string;
  accuracy: number;
  avgTime: number;
}

export default function StatCard({ name, accuracy, avgTime }: StatCardProps) {
  const pct = Math.round(accuracy * 100);

  return (
    <View
      style={{
        backgroundColor: '#0F0F0F',
        borderRadius: 20,
        padding: 20,
        marginBottom: 12,
      }}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <Text
          style={{
            fontFamily: 'Urbanist_700Bold',
            fontSize: 16,
            color: '#FFFFFF',
          }}
        >
          {name}
        </Text>
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
    </View>
  );
}
