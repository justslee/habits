/**
 * SwipeableRow — swipe-left-to-delete wrapper (P5-5).
 *
 * Wraps any child and reveals a red trash background on swipe left.
 * Fires `onDelete` when the user crosses the threshold or taps the button.
 */
import React, { useRef } from 'react';
import {
  Animated,
  StyleSheet,
  Text,
  View,
  I18nManager,
} from 'react-native';
import { RectButton } from 'react-native-gesture-handler';
import Swipeable from 'react-native-gesture-handler/Swipeable';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, typography, radius } from '../theme';

interface SwipeableRowProps {
  children: React.ReactNode;
  onDelete: () => void;
  /** Override the action label (default: "Delete") */
  label?: string;
  /** If true, the row is disabled (won't swipe) */
  disabled?: boolean;
}

export default function SwipeableRow({
  children,
  onDelete,
  label = 'Delete',
  disabled = false,
}: SwipeableRowProps) {
  const swipeableRef = useRef<Swipeable>(null);

  const renderRightActions = (
    progress: Animated.AnimatedInterpolation<number>,
    dragX: Animated.AnimatedInterpolation<number>,
  ) => {
    const scale = progress.interpolate({
      inputRange: [0, 1],
      outputRange: [0.5, 1],
      extrapolate: 'clamp',
    });
    const opacity = progress.interpolate({
      inputRange: [0, 1],
      outputRange: [0, 1],
      extrapolate: 'clamp',
    });

    return (
      <RectButton
        style={styles.rightAction}
        onPress={() => {
          swipeableRef.current?.close();
          onDelete();
        }}
      >
        <Animated.View style={[styles.actionContent, { transform: [{ scale }], opacity }]}>
          <Ionicons name="trash-outline" size={20} color="#fff" />
          <Text style={styles.actionText}>{label}</Text>
        </Animated.View>
      </RectButton>
    );
  };

  if (disabled) {
    return <>{children}</>;
  }

  return (
    <Swipeable
      ref={swipeableRef}
      friction={2}
      overshootFriction={8}
      rightThreshold={80}
      renderRightActions={renderRightActions}
      onSwipeableOpen={(direction) => {
        if (direction === 'right') {
          onDelete();
          swipeableRef.current?.close();
        }
      }}
    >
      {children}
    </Swipeable>
  );
}

const styles = StyleSheet.create({
  rightAction: {
    backgroundColor: colors.error,
    justifyContent: 'center',
    alignItems: 'flex-end',
    borderRadius: radius.lg,
    marginLeft: spacing.sm,
  },
  actionContent: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    gap: spacing.xs,
  },
  actionText: {
    color: '#fff',
    ...typography.micro,
  },
});
