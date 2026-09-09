/**
 * CustomTabBar — floating pill tab bar with backdrop fill + custom SVG glyphs.
 * Direct port of the canvas `Tabbar` from `app.jsx` + the icon SVG paths.
 *
 * Active tab: solid INK background with BG-colored stroke.
 * Inactive tab: textTertiary stroke, transparent background.
 */

import React from 'react';
import {
  View, TouchableOpacity, StyleSheet,
} from 'react-native';
import Svg, { Path, Circle, Rect } from 'react-native-svg';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { colors } from '../theme';
import { haptic } from '../utils/haptics';

interface IconProps {
  color: string;
  size?: number;
}

function HomeIcon({ color, size = 18 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M3 12 12 3l9 9M5 10v10h14V10" />
    </Svg>
  );
}

function RunIcon({ color, size = 18 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
      <Circle cx={12} cy={5} r={2} />
      <Path d="M9 22l3-7 4 3 3-4M9 9l3 3-2 4" />
    </Svg>
  );
}

function MicIcon({ color, size = 18 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
      <Rect x={9} y={3} width={6} height={12} rx={3} />
      <Path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
    </Svg>
  );
}

function StarIcon({ color, size = 18 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.7-5.2-2.7-5.2 2.7 1-5.7L3.5 9.2l5.9-.9z" />
    </Svg>
  );
}

function MeIcon({ color, size = 18 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
      <Circle cx={12} cy={8} r={4} />
      <Path d="M4 21a8 8 0 0 1 16 0" />
    </Svg>
  );
}

function BowlIcon({ color, size = 18 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M3 11h18a9 9 0 0 1-18 0zM8 11c0-3 1.5-5 4-6M14 5l3-2" />
    </Svg>
  );
}

const ICONS: Record<string, (p: IconProps) => React.ReactElement> = {
  Daily:     props => <HomeIcon {...props} />,
  Train:     props => <RunIcon {...props} />,
  Speak:     props => <MicIcon {...props} />,
  NorthStar: props => <StarIcon {...props} />,
  Food:      props => <BowlIcon {...props} />,
  Me:        props => <MeIcon {...props} />,
};

export default function CustomTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  return (
    <View style={styles.outerWrap} pointerEvents="box-none">
      <View style={styles.bar}>
        {state.routes.map((route, index) => {
          const focused = state.index === index;
          const onPress = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });
            if (!focused && !event.defaultPrevented) {
              haptic.light();
              navigation.navigate(route.name as never);
            }
          };

          const IconRenderer = ICONS[route.name];
          const color = focused ? colors.bg : colors.textTertiary;

          return (
            <TouchableOpacity
              key={route.key}
              onPress={onPress}
              activeOpacity={0.85}
              style={[styles.tab, focused && styles.tabActive]}
            >
              {IconRenderer ? <IconRenderer color={color} /> : null}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  outerWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 12,
    paddingBottom: 12,
    paddingTop: 6,
    backgroundColor: 'transparent',
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 4,
    padding: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(20,20,30,0.92)',
    borderWidth: 1,
    borderColor: colors.line,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
  },
  tabActive: {
    backgroundColor: colors.text,
  },
});
