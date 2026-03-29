import { View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useEffect } from 'react';

interface SkeletonLoaderProps {
  width: number | string;
  height: number;
  borderRadius: number;
}

export default function SkeletonLoader({ width, height, borderRadius }: SkeletonLoaderProps) {
  const opacity = useSharedValue(0.15);

  useEffect(() => {
    opacity.value = withRepeat(
      withTiming(0.5, { duration: 900 }),
      -1,
      true
    );
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      style={[
        {
          width: typeof width === 'string' ? width as any : width,
          height,
          borderRadius,
          backgroundColor: '#1A1A1A',
        },
        animatedStyle,
      ]}
    />
  );
}
