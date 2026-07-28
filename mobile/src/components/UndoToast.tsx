/**
 * UndoToast — fixed-position toast for soft-delete undo (P5-5).
 *
 * Shows "[Item] deleted — Undo" with a 5-second auto-dismiss.
 * Slides in from the bottom and fades out on dismiss.
 */
import React, { useEffect, useRef, useCallback } from 'react';
import {
  Animated,
  StyleSheet,
  Text,
  TouchableOpacity,
  
} from 'react-native';
import { colors, spacing, typography, radius } from '../theme';

interface UndoToastProps {
  /** e.g. "Entry deleted" or "Workout deleted" */
  message: string;
  /** Called when user taps "Undo" */
  onUndo: () => void;
  /** Called when toast auto-dismisses or user dismisses it */
  onDismiss: () => void;
  /** Auto-dismiss timeout in ms (default: 5000) */
  timeout?: number;
  /** Whether the toast is visible */
  visible: boolean;
}

export default function UndoToast({
  message,
  onUndo,
  onDismiss,
  timeout = 5000,
  visible,
}: UndoToastProps) {
  const translateY = useRef(new Animated.Value(100)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dismiss = useCallback(() => {
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: 100,
        duration: 250,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 0,
        duration: 250,
        useNativeDriver: true,
      }),
    ]).start(() => onDismiss());
  }, [onDismiss, translateY, opacity]);

  useEffect(() => {
    if (visible) {
      // Slide in
      Animated.parallel([
        Animated.spring(translateY, {
          toValue: 0,
          tension: 80,
          friction: 10,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();

      // Auto-dismiss timer
      timerRef.current = setTimeout(dismiss, timeout);
    }

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [visible, timeout, dismiss, translateY, opacity]);

  if (!visible) return null;

  return (
    <Animated.View
      style={[
        styles.container,
        { transform: [{ translateY }], opacity },
      ]}
    >
      <Text style={styles.message} numberOfLines={1}>
        {message}
      </Text>
      <TouchableOpacity
        onPress={() => {
          if (timerRef.current) clearTimeout(timerRef.current);
          onUndo();
        }}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <Text style={styles.undoButton}>Undo</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 100, // above tab bar
    left: spacing.md,
    right: spacing.md,
    backgroundColor: colors.cardElevated,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    // Shadow
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  message: {
    ...typography.body,
    color: colors.text,
    flex: 1,
    marginRight: spacing.md,
  },
  undoButton: {
    ...typography.bodyBold,
    color: colors.accent,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});
