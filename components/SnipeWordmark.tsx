import { Text, View } from 'react-native';

interface SnipeWordmarkProps {
  size?: 'sm' | 'md' | 'lg';
}

export default function SnipeWordmark({ size = 'md' }: SnipeWordmarkProps) {
  const fontSize = size === 'lg' ? 48 : size === 'md' ? 28 : 20;
  return (
    <View>
      <Text
        style={{
          fontFamily: 'Urbanist_800ExtraBold',
          fontSize,
          color: '#FFFFFF',
        }}
      >
        SNIPE
      </Text>
    </View>
  );
}
