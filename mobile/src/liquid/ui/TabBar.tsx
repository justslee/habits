/**
 * The tab dock and the assistant entry above it.
 *
 * Six labelled destinations in the revised order, with a selection background that slides
 * continuously between them in 240 ms. Navigation is the one place the design spends depth:
 * an inset top highlight and a soft drop shadow, over an opaque panel. Content panels stay flat
 * and readable. The assistant entry is always present and takes its wording from the tab.
 */

import React, { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useTheme } from '../theme';
import { ASSISTANT_LABEL, TABS, fonts, radius } from '../tokens';
import { T, m } from '../motion';
import { feel } from '../haptics';
import { Orb } from './Sculpture';
import { useSheet } from './Sheet';
import { AssistantSheet } from '../sheets/AssistantSheet';

const TAB_COUNT = TABS.length;

export function LiquidTabBar({ state, navigation }: BottomTabBarProps) {
  const { c, moves } = useTheme();
  const insets = useSafeAreaInsets();
  const sheet = useSheet();
  const [width, setWidth] = React.useState(0);
  const index = useSharedValue(state.index);

  useEffect(() => {
    index.value = withTiming(state.index, m(moves, T.selectionSlow));
  }, [state.index, moves, index]);

  const cell = width > 0 ? (width - 8) / TAB_COUNT : 0;
  const pill = useAnimatedStyle(() => ({ transform: [{ translateX: index.value * cell }] }));
  const current = state.routes[state.index]?.name ?? 'Daily';

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

      <View
        style={[s.nav, { backgroundColor: c.panel, borderColor: c.line, shadowColor: c.shadow }]}
        onLayout={e => setWidth(e.nativeEvent.layout.width)}
      >
        <Animated.View
          pointerEvents="none"
          style={[s.pill, { width: cell, backgroundColor: c.soft }, pill]}
        />
        {state.routes.map((route, i) => {
          const tab = TABS.find(t => t.key === route.name) ?? TABS[i];
          const focused = state.index === i;
          return (
            <Pressable
              key={route.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={tab.a11y ?? tab.label}
              onPress={() => {
                const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
                if (focused || event.defaultPrevented) return;
                feel.selection();
                navigation.navigate(route.name);
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
      </View>
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
    padding: 4,
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 1,
    shadowRadius: 16,
    elevation: 8,
  },
  pill: { position: 'absolute', top: 4, bottom: 4, left: 4, borderRadius: radius.navPill },
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
});
