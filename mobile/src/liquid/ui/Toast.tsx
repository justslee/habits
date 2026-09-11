/**
 * The undo toast. Every reversible action that completes immediately offers Undo here for six
 * seconds; everything else offers Dismiss. It sits above the tab dock, never over it.
 */

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeOut, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useTheme } from '../theme';
import { fonts } from '../tokens';
import { T, m } from '../motion';
import { feel } from '../haptics';

interface ToastApi {
  /** Show a message. Passing `undo` turns the action into an Undo. */
  show: (message: string, undo?: () => void) => void;
  hide: () => void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) throw new Error('useToast must be used inside ToastProvider');
  return api;
}

export function ToastProvider({ children, bottom = 151 }: { children: React.ReactNode; bottom?: number }) {
  const [toast, setToast] = useState<{ message: string; undo?: () => void } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hide = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setToast(null);
  }, []);

  const show = useCallback((message: string, undo?: () => void) => {
    if (timer.current) clearTimeout(timer.current);
    setToast({ message, undo });
    timer.current = setTimeout(() => setToast(null), 6000);
  }, []);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const api = useMemo(() => ({ show, hide }), [show, hide]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      {toast ? <ToastBar bottom={bottom} message={toast.message} undo={toast.undo} onDone={hide} /> : null}
    </ToastContext.Provider>
  );
}

function ToastBar({
  message, undo, onDone, bottom,
}: {
  message: string;
  undo?: () => void;
  onDone: () => void;
  bottom: number;
}) {
  const { c, moves } = useTheme();
  const y = useSharedValue(moves ? 8 : 0);
  const opacity = useSharedValue(moves ? 0 : 1);

  useEffect(() => {
    y.value = withTiming(0, m(moves, T.selectionSlow));
    opacity.value = withTiming(1, m(moves, T.selectionSlow));
  }, [moves, y, opacity]);

  const style = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }], opacity: opacity.value }));

  return (
    <Animated.View
      accessibilityLiveRegion="polite"
      exiting={moves ? FadeOut.duration(160) : undefined}
      style={[s.toast, { backgroundColor: c.fg, shadowColor: c.shadow, bottom }, style]}
    >
      <Animated.Text style={[s.text, { color: c.bg }]} numberOfLines={2}>{message}</Animated.Text>
      <Pressable
        accessibilityRole="button"
        onPress={() => { if (undo) { feel.selection(); undo(); } onDone(); }}
        hitSlop={8}
      >
        <Animated.Text style={[s.action, { color: c.bg }]}>{undo ? 'Undo' : 'Dismiss'}</Animated.Text>
      </Pressable>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  toast: {
    position: 'absolute',
    left: 22,
    right: 22,
    zIndex: 12,
    borderRadius: 18,
    paddingVertical: 9,
    paddingHorizontal: 14,
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 1,
    shadowRadius: 24,
    elevation: 12,
  },
  text: { fontFamily: fonts.regular, fontSize: 12, flex: 1, lineHeight: 12 * 1.4 },
  action: { fontFamily: fonts.medium, fontSize: 12, textDecorationLine: 'underline' },
});
