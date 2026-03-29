import { View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  cancelAnimation,
  Easing,
} from 'react-native-reanimated';
import { useEffect } from 'react';

interface TimerBarProps {
  duration: number; // in milliseconds
  isRunning: boolean;
  onComplete?: () => void;
  resetKey: number; // change this to reset the timer
}

export default function TimerBar({ duration, isRunning, onComplete, resetKey }: TimerBarProps) {
  const progress = useSharedValue(1);

  useEffect(() => {
    cancelAnimation(progress);
    progress.value = 1;

    if (isRunning) {
      progress.value = withTiming(0, {
        duration,
        easing: Easing.linear,
      });

      const timeout = setTimeout(() => {
        onComplete?.();
      }, duration);

      return () => clearTimeout(timeout);
    }
  }, [resetKey, isRunning]);

  const animatedStyle = useAnimatedStyle(() => ({
    width: `${progress.value * 100}%`,
  }));

  return (
    <View
      style={{
        width: '100%',
        height: 4,
        backgroundColor: '#222222',
        borderRadius: 2,
      }}
    >
      <Animated.View
        style={[
          {
            height: '100%',
            backgroundColor: '#FFFFFF',
            borderRadius: 2,
          },
          animatedStyle,
        ]}
      />
    </View>
  );
}
