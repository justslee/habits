/**
 * The ritual row: swipe horizontally to complete, hold for options, or just tap.
 *
 * Gesture values are the prototype's: the row follows the finger up to 125pt, a hold is
 * recognised at 500 ms and cancelled by 9pt of movement, and a release past 65pt commits.
 * A cancelled gesture restores the row and never commits. Every gesture has a visible
 * alternative, so the row is also a plain button and carries an options control.
 */

import React, { useCallback } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme';
import { fonts, gesture, radius } from '../tokens';
import { T, m } from '../motion';
import { feel } from '../haptics';
import { Small } from './Text';

export interface SwipeRowProps {
  title: string;
  subtitle?: string;
  tail?: string;
  done: boolean;
  onToggle: () => void;
  onOptions: () => void;
}

export function SwipeRow({ title, subtitle, tail, done, onToggle, onOptions }: SwipeRowProps) {
  const { c, moves } = useTheme();
  const x = useSharedValue(0);

  const commit = useCallback(() => { onToggle(); }, [onToggle]);
  const hold = useCallback(() => { feel.soft(); onOptions(); }, [onOptions]);

  const pan = Gesture.Pan()
    .maxPointers(1)
    .activeOffsetX([-gesture.horizontalIntent, gesture.horizontalIntent])
    .failOffsetY([-gesture.cancelMove, gesture.cancelMove])
    .onUpdate(e => {
      x.value = Math.max(-gesture.maxFollow, Math.min(gesture.maxFollow, e.translationX));
    })
    .onEnd(e => {
      const far = Math.abs(e.translationX) > gesture.commit
        && Math.abs(e.translationX) > Math.abs(e.translationY) * 1.3;
      x.value = moves ? withTiming(0, T.selectionSlow) : 0;
      if (far) runOnJS(commit)();
    })
    .onFinalize(() => { x.value = moves ? withTiming(0, T.selectionSlow) : 0; });

  const longPress = Gesture.LongPress()
    .minDuration(gesture.hold)
    .maxDistance(gesture.cancelMove)
    .onStart(() => { runOnJS(hold)(); });

  const composed = Gesture.Simultaneous(pan, longPress);
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));

  return (
    <View style={[s.shell, { backgroundColor: c.soft }]}>
      <View style={s.label} pointerEvents="none">
        <Ionicons name="checkmark" size={14} color={c.accent} />
        <Animated.Text style={[s.labelText, { color: c.accent }]}>{done ? 'Undo' : 'Done'}</Animated.Text>
      </View>
      <GestureDetector gesture={composed}>
        <Animated.View style={[s.sliding, { backgroundColor: c.bg }, style]}>
          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: done }}
            accessibilityLabel={`${title}, ${done ? 'completed' : 'not completed'}`}
            accessibilityActions={[{ name: 'magicTap', label: 'Options' }]}
            onAccessibilityAction={onOptions}
            onPress={onToggle}
            style={s.row}
          >
            <View style={[s.check, { borderColor: done ? 'transparent' : c.line, backgroundColor: done ? c.soft : c.panel }]}>
              {done ? <Ionicons name="checkmark" size={15} color={c.accent} /> : null}
            </View>
            <View style={{ flex: 1 }}>
              <Animated.Text style={[s.title, { color: done ? c.muted : c.fg }]}>{title}</Animated.Text>
              {subtitle ? <Small style={{ marginTop: 2 }}>{subtitle}</Small> : null}
            </View>
            {tail ? <Small>{tail}</Small> : null}
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Options for ${title}`}
            onPress={() => { feel.selection(); onOptions(); }}
            style={[s.more, { backgroundColor: c.bg }]}
            hitSlop={6}
          >
            <Ionicons name="ellipsis-horizontal" size={16} color={c.muted} />
          </Pressable>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

const s = StyleSheet.create({
  shell: { borderRadius: radius.habit, marginBottom: 4, overflow: 'hidden' },
  label: { ...StyleSheet.absoluteFillObject, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 18 },
  labelText: { fontFamily: fonts.regular, fontSize: 12 },
  sliding: { flexDirection: 'row', alignItems: 'stretch' },
  row: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 13, paddingVertical: 9, paddingHorizontal: 2, minHeight: 57 },
  check: { width: 28, height: 28, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: fonts.medium, fontSize: 14, lineHeight: 14 * 1.4 },
  more: { width: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
});
