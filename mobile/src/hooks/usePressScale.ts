import { useRef } from 'react';
import { Animated } from 'react-native';

/**
 * Returns scale transform + pressIn/pressOut handlers for micro-animation.
 * Usage: <TouchableOpacity style={animStyle} onPressIn={onPressIn} onPressOut={onPressOut} />
 */
export function usePressScale(min = 0.96) {
  const scale = useRef(new Animated.Value(1)).current;

  const onPressIn = () => {
    Animated.timing(scale, { toValue: min, duration: 100, useNativeDriver: true }).start();
  };

  const onPressOut = () => {
    Animated.spring(scale, { toValue: 1, damping: 15, stiffness: 150, useNativeDriver: true }).start();
  };

  const animStyle = { transform: [{ scale }] };

  return { animStyle, onPressIn, onPressOut };
}
