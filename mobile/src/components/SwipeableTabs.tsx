/**
 * SwipeableTabs — Swipeable horizontal tab view using Reanimated + Gesture Handler.
 *
 * Usage:
 *   <SwipeableTabs
 *     tabs={[{ key: 'a', label: 'Tab A' }, { key: 'b', label: 'Tab B' }]}
 *     activeTab="a"
 *     onTabChange={(key) => setTab(key)}
 *     renderHeader={(tabs, activeTab, onTabPress) => <YourTabBar />}  // optional custom header
 *   >
 *     {(tab) => tab === 'a' ? <ScreenA /> : <ScreenB />}
 *   </SwipeableTabs>
 */

import React, { useCallback, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useSharedValue, useAnimatedStyle, withTiming, runOnJS,
  Easing,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { colors, spacing, typography, radius } from '../theme';
import { haptic } from '../utils/haptics';

export interface TabDef {
  key: string;
  label: string;
  icon?: string;
}

interface Props {
  tabs: TabDef[];
  activeTab: string;
  onTabChange: (key: string) => void;
  children: (activeTab: string) => React.ReactNode;
  /** If true, don't render the default tab bar (use your own above) */
  hideTabBar?: boolean;
  /** Show icons instead of text labels (uses tab.icon) */
  iconOnly?: boolean;
}

const SWIPE_THRESHOLD = 50;
const TIMING_CONFIG = { duration: 250, easing: Easing.out(Easing.cubic) };

export default function SwipeableTabs({ tabs, activeTab, onTabChange, children, hideTabBar, iconOnly }: Props) {
  const { width: screenWidth } = useWindowDimensions();
  const activeIndex = tabs.findIndex(t => t.key === activeTab);
  const translateX = useSharedValue(-activeIndex * screenWidth);
  const startX = useSharedValue(0);

  useEffect(() => {
    translateX.value = withTiming(-activeIndex * screenWidth, TIMING_CONFIG);
  }, [activeIndex, screenWidth]);

  const goTo = useCallback((index: number) => {
    if (index >= 0 && index < tabs.length) {
      haptic.selection();
      onTabChange(tabs[index].key);
    }
  }, [tabs, onTabChange]);

  const panGesture = Gesture.Pan()
    .activeOffsetX([-15, 15])
    .failOffsetY([-10, 10])
    .onStart(() => {
      startX.value = translateX.value;
    })
    .onUpdate((e) => {
      const next = startX.value + e.translationX;
      // Clamp with rubber band at edges
      const minX = -(tabs.length - 1) * screenWidth;
      if (next > 0) {
        translateX.value = next * 0.3;
      } else if (next < minX) {
        translateX.value = minX + (next - minX) * 0.3;
      } else {
        translateX.value = next;
      }
    })
    .onEnd((e) => {
      const currentIdx = Math.round(-startX.value / screenWidth);
      if (e.translationX < -SWIPE_THRESHOLD && currentIdx < tabs.length - 1) {
        runOnJS(goTo)(currentIdx + 1);
      } else if (e.translationX > SWIPE_THRESHOLD && currentIdx > 0) {
        runOnJS(goTo)(currentIdx - 1);
      } else {
        translateX.value = withTiming(-currentIdx * screenWidth, TIMING_CONFIG);
      }
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  // Indicator animated style
  const indicatorStyle = useAnimatedStyle(() => {
    const tabWidth = screenWidth / tabs.length;
    const progress = -translateX.value / screenWidth;
    return {
      width: tabWidth - spacing.lg * 2,
      transform: [{ translateX: progress * tabWidth + spacing.lg }],
    };
  });

  return (
    <View style={{ flex: 1 }}>
      {/* Tab Bar */}
      {!hideTabBar && (
        <View style={s.tabBar}>
          <View style={s.tabRow}>
            {tabs.map((tab, i) => {
              const active = tab.key === activeTab;
              return (
                <TouchableOpacity
                  key={tab.key}
                  style={s.tab}
                  onPress={() => goTo(i)}
                  activeOpacity={0.7}
                >
                  {iconOnly && tab.icon ? (
                    <Ionicons
                      name={tab.icon as any}
                      size={22}
                      color={active ? colors.accent : colors.textTertiary}
                    />
                  ) : (
                    <Text style={[s.tabText, active && s.tabTextActive]}>
                      {tab.label}
                    </Text>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
          <Animated.View style={[s.indicator, indicatorStyle]} />
        </View>
      )}

      {/* Swipeable Content */}
      <GestureDetector gesture={panGesture}>
        <Animated.View style={[s.pager, { width: screenWidth * tabs.length }, animatedStyle]}>
          {tabs.map((tab) => (
            <View key={tab.key} style={{ width: screenWidth, flex: 1 }}>
              {children(tab.key)}
            </View>
          ))}
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

const s = StyleSheet.create({
  tabBar: {
    backgroundColor: 'transparent',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingTop: spacing.xs,
    marginBottom: spacing.md,
  },
  tabRow: {
    flexDirection: 'row',
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.sm + 2,
  },
  tabText: {
    ...typography.caption,
    color: colors.textTertiary,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  tabTextActive: {
    color: colors.accent,
  },
  indicator: {
    height: 2,
    backgroundColor: colors.accent,
    borderRadius: 1,
    position: 'absolute',
    bottom: 0,
  },
  pager: {
    flex: 1,
    flexDirection: 'row',
  },
});
