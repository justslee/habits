/**
 * The stage every destination renders into.
 *
 * Padding matches the prototype's `.h-stage`. Changing context — a different tab, segment or
 * flow step — fades and lifts the content once in 170 ms; ordinary state updates inside a
 * screen do not replay it, which is the point of `contextKey`.
 */

import React, { useEffect, useRef } from 'react';
import { RefreshControl, ScrollView, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme';
import { T, m } from '../motion';

export function Screen({
  children,
  contextKey,
  onRefresh,
  refreshing,
  scroll = true,
  edgeToEdge,
  style,
}: {
  children: React.ReactNode;
  /** Changing this value replays the context transition. */
  contextKey?: string;
  onRefresh?: () => void;
  refreshing?: boolean;
  scroll?: boolean;
  /** Skip horizontal padding, for screens with a full-bleed header. */
  edgeToEdge?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const { c, moves } = useTheme();
  const insets = useSafeAreaInsets();
  const opacity = useSharedValue(1);
  const y = useSharedValue(0);
  const previous = useRef(contextKey);

  useEffect(() => {
    if (previous.current === contextKey) return;
    previous.current = contextKey;
    if (!moves) return;
    opacity.value = 0.72;
    y.value = 4;
    opacity.value = withTiming(1, T.context);
    y.value = withTiming(0, T.context);
  }, [contextKey, moves, opacity, y]);

  const animated = useAnimatedStyle(() => ({ opacity: opacity.value, transform: [{ translateY: y.value }] }));

  const body = (
    <Animated.View style={[{ flex: scroll ? 0 : 1 }, animated]}>
      {children}
    </Animated.View>
  );

  if (!scroll) {
    return (
      <View style={[s.root, { backgroundColor: c.bg, paddingTop: edgeToEdge ? 0 : insets.top + 13 }, !edgeToEdge && s.pad, style]}>
        {body}
      </View>
    );
  }

  return (
    <ScrollView
      style={[s.root, { backgroundColor: c.bg }, style]}
      contentContainerStyle={[
        // An edge-to-edge screen owns its own top inset, so its header can run under the status bar.
        { paddingTop: edgeToEdge ? 0 : insets.top + 13, paddingBottom: 32 },
        !edgeToEdge && s.pad,
      ]}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="interactive"
      automaticallyAdjustKeyboardInsets
      refreshControl={
        onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={c.accent} /> : undefined
      }
    >
      {body}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  pad: { paddingHorizontal: 23 },
});
