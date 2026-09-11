/**
 * Liquid buttons. Every one compresses to 0.975 in 150 ms on press, so the response starts
 * with the touch rather than after it. Compression is removed under Quiet or Reduce Motion.
 * Minimum target height is 44 points throughout.
 */

import React, { useCallback } from 'react';
import { Pressable, StyleProp, StyleSheet, TextStyle, View, ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useMoves, useTheme } from '../theme';
import { fonts, radius } from '../tokens';
import { T, m } from '../motion';
import { feel } from '../haptics';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function usePressScale(active = true) {
  const moves = useMoves();
  const scale = useSharedValue(1);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const onPressIn = useCallback(() => {
    if (active && moves) scale.value = withTiming(0.975, T.press);
  }, [active, moves, scale]);
  const onPressOut = useCallback(() => {
    scale.value = withTiming(1, m(moves, T.press));
  }, [moves, scale]);
  return { style, onPressIn, onPressOut };
}

type Kind = 'primary' | 'secondary' | 'quiet';

interface Props {
  label?: string;
  onPress?: () => void;
  kind?: Kind;
  full?: boolean;
  disabled?: boolean;
  /** Ionicons name shown before the label. */
  icon?: keyof typeof Ionicons.glyphMap;
  /** Ionicons name shown after the label. */
  iconAfter?: keyof typeof Ionicons.glyphMap;
  /** Rotate the trailing icon, for the design's ↗ arrow. */
  iconAfterRotate?: number;
  /** Haptic fired on press. Defaults to a selection tick. */
  haptic?: 'selection' | 'light' | 'soft' | 'success' | 'none';
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  accessibilityLabel?: string;
  children?: React.ReactNode;
}

export function Button({
  label, onPress, kind = 'primary', full, disabled, icon, iconAfter, iconAfterRotate,
  haptic = 'selection', style, textStyle, accessibilityLabel, children,
}: Props) {
  const { c } = useTheme();
  const press = usePressScale(!disabled);

  const bg = kind === 'primary' ? c.fg : kind === 'secondary' ? c.soft : 'transparent';
  const fg = kind === 'primary' ? c.bg : kind === 'secondary' ? c.accent : c.muted;

  const handle = useCallback(() => {
    if (disabled) return;
    if (haptic !== 'none') feel[haptic]();
    onPress?.();
  }, [disabled, haptic, onPress]);

  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={handle}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      style={[
        s.base,
        { backgroundColor: bg },
        kind === 'quiet' && s.quiet,
        full && s.full,
        disabled && { opacity: 0.45 },
        press.style,
        style,
      ]}
    >
      {icon ? <Ionicons name={icon} size={16} color={fg} /> : null}
      {label ? <Animated.Text style={[s.label, { color: fg }, textStyle]}>{label}</Animated.Text> : null}
      {children}
      {iconAfter ? (
        <Ionicons
          name={iconAfter}
          size={16}
          color={fg}
          style={iconAfterRotate ? { transform: [{ rotate: `${iconAfterRotate}deg` }] } : undefined}
        />
      ) : null}
    </AnimatedPressable>
  );
}

/** The round 44pt icon button. */
export function IconButton({
  icon, onPress, accessibilityLabel, size = 44, background, color, style, haptic = 'selection',
}: {
  icon: keyof typeof Ionicons.glyphMap;
  onPress?: () => void;
  accessibilityLabel: string;
  size?: number;
  background?: string;
  color?: string;
  style?: StyleProp<ViewStyle>;
  haptic?: 'selection' | 'light' | 'soft' | 'none';
}) {
  const { c } = useTheme();
  const press = usePressScale();
  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={() => { if (haptic !== 'none') feel[haptic](); onPress?.(); }}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      style={[
        {
          width: size, height: size, borderRadius: size / 2,
          alignItems: 'center', justifyContent: 'center',
          backgroundColor: background ?? c.panel2,
        },
        press.style,
        style,
      ]}
    >
      <Ionicons name={icon} size={18} color={color ?? c.fg} />
    </AnimatedPressable>
  );
}

/** A small text-only action, 44pt tall for touch. */
export function InlineButton({
  label, onPress, icon, color, style,
}: {
  label: string;
  onPress?: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
  color?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const { c } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() => { feel.selection(); onPress?.(); }}
      style={({ pressed }) => [s.inline, pressed && { opacity: 0.6 }, style]}
    >
      <Animated.Text style={[s.inlineLabel, { color: color ?? c.muted }]}>{label}</Animated.Text>
      {icon ? <Ionicons name={icon} size={14} color={color ?? c.muted} /> : null}
    </Pressable>
  );
}

/** A row of selectable chips, as in the prototype's `.h-options`. */
export function Options<T extends string | number>({
  values, selected, onSelect, labels, multi,
}: {
  values: readonly T[];
  selected: T | T[];
  onSelect: (v: T) => void;
  labels?: (v: T) => string;
  multi?: boolean;
}) {
  const { c } = useTheme();
  const isOn = (v: T) => (multi && Array.isArray(selected) ? selected.includes(v) : selected === v);
  return (
    <View style={s.options}>
      {values.map(v => {
        const on = isOn(v);
        return (
          <Pressable
            key={String(v)}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            onPress={() => { feel.selection(); onSelect(v); }}
            style={({ pressed }) => [
              s.chip,
              { backgroundColor: on ? c.soft : c.bg, borderColor: on ? c.accent : c.line },
              pressed && { opacity: 0.75 },
            ]}
          >
            <Animated.Text style={[s.chipLabel, { color: on ? c.accent : c.fg }]}>
              {labels ? labels(v) : String(v)}
            </Animated.Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  base: {
    borderRadius: radius.button,
    paddingVertical: 13,
    paddingHorizontal: 17,
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    alignSelf: 'flex-start',
  },
  quiet: { paddingVertical: 10, paddingHorizontal: 2, minHeight: 44 },
  full: { alignSelf: 'stretch', width: '100%' },
  label: { fontFamily: fonts.medium, fontSize: 13, lineHeight: 13 * 1.3 },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 5, minHeight: 44, paddingVertical: 6 },
  inlineLabel: { fontFamily: fonts.regular, fontSize: 11 },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginVertical: 19 },
  chip: {
    borderWidth: 1,
    paddingVertical: 11,
    paddingHorizontal: 13,
    borderRadius: radius.chip,
    minHeight: 44,
    justifyContent: 'center',
  },
  chipLabel: { fontFamily: fonts.regular, fontSize: 12 },
});
