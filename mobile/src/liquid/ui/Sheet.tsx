/**
 * The liquid bottom sheet.
 *
 * Direct manipulation is limited to the handle so sheet contents stay scrollable. The handle
 * tracks the finger, damps upward travel to 14%, and settles back after an incomplete drag.
 * It dismisses after a 65pt drag or a shorter drag released with enough downward velocity.
 * Opening a second sheet cancels the obsolete one. A soft impact marks opening and settling closed.
 *
 * `useSheet().open(title, render)` mirrors the prototype's `openSheet(title, body)`.
 */

import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  runOnJS, useAnimatedStyle, useSharedValue, withTiming,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme';
import { gesture, radius, type } from '../tokens';
import { SPRING, T, m } from '../motion';
import { feel } from '../haptics';

interface SheetRequest {
  title: string;
  render: () => React.ReactNode;
}

interface SheetApi {
  open: (title: string, render: () => React.ReactNode) => void;
  close: () => void;
}

const SheetContext = createContext<SheetApi | null>(null);

export function useSheet(): SheetApi {
  const api = useContext(SheetContext);
  if (!api) throw new Error('useSheet must be used inside SheetProvider');
  return api;
}

export function SheetProvider({ children }: { children: React.ReactNode }) {
  const [request, setRequest] = useState<SheetRequest | null>(null);
  const [leaving, setLeaving] = useState(false);

  const open = useCallback((title: string, render: () => React.ReactNode) => {
    setLeaving(false);
    setRequest({ title, render });
    feel.soft();
  }, []);

  const close = useCallback(() => setLeaving(true), []);
  const finished = useCallback(() => { setRequest(null); setLeaving(false); }, []);

  const api = useMemo(() => ({ open, close }), [open, close]);

  return (
    <SheetContext.Provider value={api}>
      {children}
      {request ? (
        <SheetSurface
          key={request.title}
          title={request.title}
          leaving={leaving}
          onRequestClose={close}
          onExited={finished}
        >
          {request.render()}
        </SheetSurface>
      ) : null}
    </SheetContext.Provider>
  );
}

function SheetSurface({
  title, children, leaving, onRequestClose, onExited,
}: {
  title: string;
  children: React.ReactNode;
  leaving: boolean;
  onRequestClose: () => void;
  onExited: () => void;
}) {
  const { c, moves } = useTheme();
  const y = useSharedValue(moves ? 28 : 0);
  const scale = useSharedValue(moves ? 0.985 : 1);
  const opacity = useSharedValue(1);
  const dragging = useSharedValue(false);
  const exiting = useRef(false);

  // Entrance: 260 ms on the settle curve.
  React.useEffect(() => {
    y.value = withTiming(0, m(moves, T.sheet));
    scale.value = withTiming(1, m(moves, T.sheet));
  }, [moves, y, scale]);

  // Exit: the panel leaves downward while the scrim fades, then the sheet unmounts.
  React.useEffect(() => {
    if (!leaving || exiting.current) return;
    exiting.current = true;
    feel.soft();
    if (!moves) { onExited(); return; }
    opacity.value = withTiming(0, T.sheetExit);
    y.value = withTiming(y.value + 80, T.sheetExit, done => {
      if (done) runOnJS(onExited)();
    });
  }, [leaving, moves, onExited, opacity, y]);

  const dismiss = useCallback(() => onRequestClose(), [onRequestClose]);

  const pan = Gesture.Pan()
    .maxPointers(1)
    .onBegin(() => { dragging.value = true; })
    .onUpdate(e => {
      // Upward travel is damped so the sheet resists being pulled past its rest position.
      y.value = e.translationY >= 0 ? e.translationY : e.translationY * 0.14;
    })
    .onEnd(e => {
      dragging.value = false;
      const far = e.translationY > gesture.commit;
      const flick = e.translationY > gesture.flickMinDrag && e.velocityY / 1000 > gesture.flickVelocity;
      if (far || flick) {
        runOnJS(dismiss)();
        return;
      }
      y.value = moves ? withTiming(0, T.selection) : 0;
    })
    .onFinalize(() => { dragging.value = false; });

  const panelStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: y.value }, { scale: scale.value }],
  }));
  const layerStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Modal transparent animationType="none" visible onRequestClose={dismiss} statusBarTranslucent>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <Animated.View style={[s.layer, { backgroundColor: c.scrim }, layerStyle]}>
          <Pressable style={s.scrimTap} onPress={dismiss} accessibilityLabel="Close sheet" accessibilityRole="button" />
          <Animated.View style={[s.sheet, { backgroundColor: c.panel, shadowColor: c.shadow }, panelStyle]}>
            <GestureDetector gesture={pan}>
              <View style={s.handleZone} accessible accessibilityRole="adjustable" accessibilityLabel="Drag down to close">
                <View style={[s.handle, { backgroundColor: c.line }]} />
              </View>
            </GestureDetector>
            <View style={s.head}>
              <Animated.Text style={[type.sheetHeading, { color: c.fg, flex: 1 }]}>{title}</Animated.Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close"
                onPress={dismiss}
                style={[s.close, { backgroundColor: c.panel2 }]}
              >
                <Ionicons name="close" size={18} color={c.fg} />
              </Pressable>
            </View>
            <ScrollView
              style={{ maxHeight: 460 }}
              contentContainerStyle={{ paddingBottom: 24 }}
              showsVerticalScrollIndicator={false}
            >
              {children}
            </ScrollView>
          </Animated.View>
        </Animated.View>
      </GestureHandlerRootView>
    </Modal>
  );
}

const s = StyleSheet.create({
  layer: { flex: 1, justifyContent: 'flex-end' },
  scrimTap: { ...StyleSheet.absoluteFillObject },
  sheet: {
    paddingTop: 8,
    paddingHorizontal: 23,
    paddingBottom: 34,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    shadowOffset: { width: 0, height: -12 },
    shadowOpacity: 1,
    shadowRadius: 30,
    elevation: 24,
  },
  handleZone: { alignSelf: 'center', width: 96, height: 44, alignItems: 'center', justifyContent: 'center' },
  handle: { width: 62, height: 4, borderRadius: 4 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 18 },
  close: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
});
