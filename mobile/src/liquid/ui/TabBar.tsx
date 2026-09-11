/**
 * The tab dock and the assistant entry above it.
 *
 * Selection is a lens rather than a pill: a glass bubble that magnifies the tab beneath it.
 * It can be dragged along the dock, so you can slide between destinations without lifting your
 * finger and watch each one swell as it passes under the glass. Releasing snaps to the nearest
 * tab and navigates there. Tapping a tab still works exactly as before, and every destination
 * keeps its own hit target, so the gesture is a shortcut rather than the only way through.
 *
 * The magnification is real, not a scaled icon: the lens clips a second copy of the whole row
 * and scales it about the lens centre, which is why labels stretch and clip at the rim the way
 * they would under glass.
 */

import React, { useCallback, useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  SharedValue,
  interpolate,
  interpolateColor,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { CommonActions } from '@react-navigation/native';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useTheme } from '../theme';
import { ASSISTANT_LABEL, TABS, fonts, radius } from '../tokens';
import { T, SPRING, m } from '../motion';
import { feel } from '../haptics';
import { Orb } from './Sculpture';
import { useSheet } from './Sheet';
import { AssistantSheet } from '../sheets/AssistantSheet';

const TAB_COUNT = TABS.length;

/** How much the glass enlarges what sits under it. Enough to read as a lens, not a zoom. */
const MAG = 1.28;
/** The bubble's diameter. Slightly taller than the dock, so it bulges the way a drop would. */
const LENS_D = 74;
/** Padding inside the dock, matching the nav's own. */
const PAD = 4;
/** The dock's hairline, which shifts the content box in by the same amount. */
const BORDER = 1;
/** Where the first cell begins, measured from the dock's outer edge. */
const INSET = PAD + BORDER;

interface Glass {
  rim: string;
  rimInner: string;
  sheen: readonly [string, string, string];
  specular: string;
  fringeWarm: string;
  fringeCool: string;
  tint: string;
}

/** The glass itself: a rim, a sheen, and the faint colour fringe a real lens throws. */
const GLASS: Record<'ink' | 'pearl', Glass> = {
  ink: {
    rim: 'rgba(222,213,247,0.46)',
    rimInner: 'rgba(255,255,255,0.20)',
    sheen: ['rgba(255,255,255,0.26)', 'rgba(255,255,255,0.05)', 'rgba(0,0,0,0.14)'] as const,
    specular: 'rgba(255,255,255,0.16)',
    fringeWarm: 'rgba(232,178,112,0.34)',
    fringeCool: 'rgba(146,190,240,0.34)',
    tint: 'rgba(189,175,225,0.13)',
  },
  pearl: {
    rim: 'rgba(101,88,133,0.30)',
    rimInner: 'rgba(255,255,255,0.85)',
    sheen: ['rgba(255,255,255,0.80)', 'rgba(255,255,255,0.16)', 'rgba(96,86,120,0.13)'] as const,
    specular: 'rgba(255,255,255,0.78)',
    fringeWarm: 'rgba(206,142,74,0.30)',
    fringeCool: 'rgba(106,152,212,0.30)',
    tint: 'rgba(101,88,133,0.08)',
  },
};

export function LiquidTabBar({ state, navigation }: BottomTabBarProps) {
  const { c, moves, look } = useTheme();
  const insets = useSafeAreaInsets();
  const sheet = useSheet();
  const [size, setSize] = React.useState({ w: 0, h: 0 });
  /** Where the lens sits, in tab units. Fractional while dragging. */
  const pos = useSharedValue(state.index);
  /** 0 at rest, 1 while a finger is on the glass. */
  const held = useSharedValue(0);
  /** The tab the lens was last over, so crossing one can be felt rather than only seen. */
  const nearest = useSharedValue(state.index);

  const glass = GLASS[look === 'pearl' ? 'pearl' : 'ink'];
  const cell = size.w > 0 ? (size.w - INSET * 2) / TAB_COUNT : 0;
  const current = state.routes[state.index]?.name ?? 'Daily';

  // Follow navigation that happened elsewhere: a tap, a back gesture, a deep link.
  useEffect(() => {
    if (held.value) return;
    nearest.value = state.index;
    pos.value = moves
      ? withSpring(state.index, SPRING)
      : withTiming(state.index, m(moves, T.selectionSlow));
  }, [state.index, moves, pos, held, nearest]);

  /**
   * Jump to a tab. The dispatch names its target navigator explicitly, as React Navigation's own
   * tab bar does: a bare navigate() resolves against whatever is focused, which is not this
   * navigator when the call arrives from a gesture rather than a press handler.
   */
  const go = useCallback(
    (i: number) => {
      const route = state.routes[i];
      if (!route || i === state.index) return;
      const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
      if (event.defaultPrevented) return;
      navigation.dispatch({
        ...CommonActions.navigate({ name: route.name, merge: true }),
        target: state.key,
      });
    },
    [navigation, state.routes, state.index, state.key],
  );

  const tick = useCallback(() => feel.selection(), []);

  /**
   * A drag ends on a tab, and the tab underneath the finger also sees a press. Without this the
   * two race and the press wins, sending you back where you started. The flag outlives the
   * gesture by a beat because the press lands after the gesture has already finished.
   */
  const dragging = React.useRef(false);
  const beginDrag = useCallback(() => { dragging.current = true; }, []);
  const endDrag = useCallback(() => {
    setTimeout(() => { dragging.current = false; }, 320);
  }, []);

  const pan = Gesture.Pan()
    .maxPointers(1)
    .activeOffsetX([-8, 8])
    .failOffsetY([-16, 16])
    .onStart(() => {
      held.value = withTiming(1, T.press);
      runOnJS(beginDrag)();
    })
    .onUpdate(e => {
      if (cell <= 0) return;
      const raw = (e.x - INSET) / cell - 0.5;
      pos.value = Math.min(TAB_COUNT - 1, Math.max(0, raw));
      const near = Math.round(pos.value);
      if (near !== nearest.value) {
        nearest.value = near;
        runOnJS(tick)();
      }
    })
    .onEnd(() => {
      const target = Math.round(pos.value);
      // Quiet mode keeps the change immediate but drops the spring's overshoot.
      pos.value = moves ? withSpring(target, SPRING) : withTiming(target, T.selection);
      runOnJS(go)(target);
    })
    .onFinalize(() => {
      held.value = withTiming(0, T.context);
      runOnJS(endDrag)();
    });

  // The bubble's own geometry: it rides the dock horizontally and lifts a little when held.
  const lens = useAnimatedStyle(() => {
    const cx = INSET + (pos.value + 0.5) * cell;
    return {
      left: cx - LENS_D / 2,
      transform: [
        { translateY: interpolate(held.value, [0, 1], [0, -5]) },
        { scale: interpolate(held.value, [0, 1], [1, 1.07]) },
      ],
      shadowOpacity: interpolate(held.value, [0, 1], [0.5, 0.9]),
    };
  });

  // The magnified copy, scaled about the lens centre. RN scales about a view's own centre, so
  // the translation compensates for that before placing the enlarged row behind the glass.
  const magnified = useAnimatedStyle(() => {
    const cx = INSET + (pos.value + 0.5) * cell;
    const cy = size.h / 2;
    return {
      transform: [
        { translateX: (MAG - 1) * (size.w / 2) - MAG * cx + LENS_D / 2 },
        { translateY: (MAG - 1) * (size.h / 2) - MAG * cy + LENS_D / 2 },
        { scale: MAG },
      ],
    };
  });

  return (
    <View style={[s.footer, { backgroundColor: c.bg, paddingBottom: Math.max(insets.bottom, 11) }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={ASSISTANT_LABEL[current] ?? 'Assistant'}
        onPress={() => sheet.open('A little help.', () => <AssistantSheet tab={current} />)}
        style={({ pressed }) => [
          s.assistant,
          { backgroundColor: c.panel, borderColor: c.line },
          pressed && { opacity: 0.85 },
        ]}
      >
        <Orb />
        <Animated.Text style={[s.assistantLabel, { color: c.muted }]} numberOfLines={1}>
          {ASSISTANT_LABEL[current] ?? 'A little help with your day'}
        </Animated.Text>
        <Ionicons name="pulse" size={16} color={c.muted} />
      </Pressable>

      <GestureDetector gesture={pan}>
        <View
          style={[s.nav, { backgroundColor: c.panel, borderColor: c.line, shadowColor: c.shadow }]}
          onLayout={e => {
            const { width, height } = e.nativeEvent.layout;
            setSize(prev => (prev.w === width && prev.h === height ? prev : { w: width, h: height }));
          }}
        >
          {state.routes.map((route, i) => {
            const tab = TABS.find(t => t.key === route.name) ?? TABS[i];
            const focused = state.index === i;
            return (
              <Pressable
                key={route.key}
                accessibilityRole="tab"
                accessibilityState={{ selected: focused }}
                accessibilityLabel={tab.a11y ?? tab.label}
                accessibilityHint="Drag along the bar to move between tabs"
                onPress={() => {
                  if (focused || dragging.current) return;
                  feel.selection();
                  go(i);
                }}
                style={s.tab}
              >
                <Ionicons name={tab.icon as never} size={18} color={focused ? c.accent : c.muted} />
                <Animated.Text style={[s.tabLabel, { color: focused ? c.accent : c.muted }]} numberOfLines={1}>
                  {tab.label}
                </Animated.Text>
              </Pressable>
            );
          })}

          {cell > 0 ? (
            <Animated.View
              pointerEvents="none"
              style={[
                s.lens,
                { top: size.h / 2 - LENS_D / 2, borderColor: glass.rim, shadowColor: c.shadow },
                lens,
              ]}
            >
              <Animated.View
                style={[s.copy, { width: size.w, height: size.h, backgroundColor: c.panel }, magnified]}
              >
                {state.routes.map((route, i) => {
                  const tab = TABS.find(t => t.key === route.name) ?? TABS[i];
                  return <LensTab key={route.key} tab={tab} index={i} pos={pos} />;
                })}
              </Animated.View>

              <View style={[StyleSheet.absoluteFill, { backgroundColor: glass.tint }]} pointerEvents="none" />
              <LinearGradient
                colors={glass.sheen}
                locations={[0, 0.52, 1]}
                style={StyleSheet.absoluteFill}
                pointerEvents="none"
              />
              {/* A catch-light, angled as if the room's light were up and to the left. */}
              <View style={s.specular} pointerEvents="none">
                <LinearGradient
                  colors={[glass.specular, 'rgba(255,255,255,0)']}
                  start={{ x: 0.2, y: 0 }}
                  end={{ x: 0.9, y: 1 }}
                  style={StyleSheet.absoluteFill}
                />
              </View>

              {/* The colour fringe a real lens throws, offset a hair each way at the rim. */}
              <View style={[s.fringe, { borderColor: glass.fringeCool, left: -1.5 }]} pointerEvents="none" />
              <View style={[s.fringe, { borderColor: glass.fringeWarm, left: 1.5 }]} pointerEvents="none" />
              <View style={[s.rimInner, { borderColor: glass.rimInner }]} pointerEvents="none" />
            </Animated.View>
          ) : null}
        </View>
      </GestureDetector>
    </View>
  );
}

/**
 * One tab inside the lens. It takes the accent as the glass passes over it, so the colour
 * follows the finger continuously instead of jumping when navigation commits.
 */
function LensTab({
  tab,
  index,
  pos,
}: {
  tab: (typeof TABS)[number];
  index: number;
  pos: SharedValue<number>;
}) {
  const { c } = useTheme();
  const label = useAnimatedStyle(() => ({
    color: interpolateColor(Math.abs(pos.value - index), [0, 0.6], [c.accent, c.muted]),
  }));
  // Ionicons takes a colour prop rather than an animated style, so the tint is a cross-fade
  // between two copies of the same glyph.
  const lit = useAnimatedStyle(() => ({
    opacity: interpolate(Math.abs(pos.value - index), [0, 0.6], [1, 0], 'clamp'),
  }));

  return (
    <View style={s.tab}>
      <View style={s.glyph}>
        <Ionicons name={tab.icon as never} size={18} color={c.muted} />
        <Animated.View style={[StyleSheet.absoluteFill, lit]}>
          <Ionicons name={tab.icon as never} size={18} color={c.accent} />
        </Animated.View>
      </View>
      <Animated.Text style={[s.tabLabel, label]} numberOfLines={1}>
        {tab.label}
      </Animated.Text>
    </View>
  );
}

const s = StyleSheet.create({
  footer: { paddingTop: 8, paddingHorizontal: 11 },
  assistant: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    borderWidth: 1,
    borderRadius: 24,
    paddingVertical: 8,
    paddingHorizontal: 14,
    minHeight: 46,
    marginBottom: 10,
  },
  assistantLabel: { flex: 1, fontFamily: fonts.regular, fontSize: 12 },
  nav: {
    flexDirection: 'row',
    borderWidth: 1,
    borderRadius: radius.nav,
    padding: PAD,
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 1,
    shadowRadius: 16,
    elevation: 8,
  },
  tab: {
    flex: 1,
    minHeight: 54,
    paddingTop: 7,
    paddingBottom: 6,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  tabLabel: { fontFamily: fonts.medium, fontSize: 11, lineHeight: 11 * 1.05 },
  glyph: { width: 18, height: 18 },
  lens: {
    position: 'absolute',
    width: LENS_D,
    height: LENS_D,
    borderRadius: LENS_D / 2,
    borderWidth: 1,
    overflow: 'hidden',
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 12,
    elevation: 12,
  },
  specular: {
    position: 'absolute',
    top: LENS_D * 0.09,
    left: LENS_D * 0.18,
    width: LENS_D * 0.46,
    height: LENS_D * 0.19,
    borderRadius: LENS_D * 0.23,
    overflow: 'hidden',
    transform: [{ rotate: '-22deg' }],
  },
  fringe: {
    position: 'absolute',
    top: 0,
    width: LENS_D,
    height: LENS_D,
    borderRadius: LENS_D / 2,
    borderWidth: 1.5,
  },
  copy: { position: 'absolute', top: 0, left: 0, flexDirection: 'row', padding: INSET },
  rimInner: {
    position: 'absolute',
    top: 1,
    left: 1,
    width: LENS_D - 4,
    height: LENS_D - 4,
    borderRadius: (LENS_D - 4) / 2,
    borderWidth: 1,
  },
});
