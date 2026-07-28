/**
 * BottomSheet — generic slide-up sheet with backdrop, drag handle, and scroll lock.
 * Mirrors the `Sheet` primitive from the design canvas (home-extras.jsx).
 */

import React, { useEffect, useRef, useCallback } from 'react';
import {
  Animated,
  Easing,
  Keyboard,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  Dimensions,
} from 'react-native';
import KeyboardAvoider from './KeyboardAvoider';
import { colors, spacing } from '../theme';

interface Props {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
  /** Override max height (default 88% of screen). */
  maxHeightPct?: number;
  /**
   * Keep the newest content in view — scrolls to the end when content grows or the
   * keyboard opens. Use for chat-style sheets where the latest message matters.
   */
  stickToBottom?: boolean;
}

export default function BottomSheet({
  visible,
  onClose,
  children,
  maxHeightPct = 0.88,
  stickToBottom = false,
}: Props) {
  const slide = useRef(new Animated.Value(1)).current;
  const fade = useRef(new Animated.Value(0)).current;
  const screenH = Dimensions.get('window').height;
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(slide, { toValue: 0, duration: 320, easing: Easing.bezier(0.2, 0.7, 0.2, 1), useNativeDriver: true }),
        Animated.timing(fade, { toValue: 1, duration: 200, useNativeDriver: true }),
      ]).start();
    } else {
      slide.setValue(1);
      fade.setValue(0);
    }
  }, [visible, slide, fade]);

  const scrollToEnd = useCallback(() => {
    requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
  }, []);

  // Lifting the sheet above the keyboard isn't enough on its own — the newest
  // content also has to be scrolled back into view once the visible area shrinks.
  useEffect(() => {
    if (!visible || !stickToBottom) return;
    const sub = Keyboard.addListener('keyboardDidShow', scrollToEnd);
    return () => sub.remove();
  }, [visible, stickToBottom, scrollToEnd]);

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <Animated.View style={[styles.backdrop, { opacity: fade }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        {/* passThrough keeps tap-to-dismiss working on the empty area above the sheet */}
        <KeyboardAvoider style={styles.avoider} passThrough>
          <Animated.View
            style={[
              styles.sheet,
              {
                maxHeight: screenH * maxHeightPct,
                transform: [{ translateY: slide.interpolate({ inputRange: [0, 1], outputRange: [0, screenH] }) }],
              },
            ]}
          >
            <View style={styles.handle} />
            <ScrollView
              ref={scrollRef}
              contentContainerStyle={styles.content}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              onContentSizeChange={stickToBottom ? scrollToEnd : undefined}
            >
              {children}
            </ScrollView>
          </Animated.View>
        </KeyboardAvoider>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  avoider: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.line,
    alignSelf: 'center',
    marginBottom: spacing.md,
  },
  content: {
    paddingBottom: 100,
  },
});
