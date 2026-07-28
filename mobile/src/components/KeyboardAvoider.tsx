/**
 * KeyboardAvoider — one canonical keyboard-avoidance wrapper for the whole app.
 *
 * Screens had drifted into three different ad-hoc configurations (and five screens
 * with text inputs had none at all), so the keyboard covered content inconsistently.
 * Wrap any screen or sheet that contains a TextInput in this.
 *
 * `offset` maps to keyboardVerticalOffset — set it to the height of any fixed
 * chrome above the avoided area (e.g. a navigation header).
 */

import React from 'react';
import { KeyboardAvoidingView, Platform, StyleProp, ViewStyle } from 'react-native';

interface Props {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Height of fixed chrome above the input area (e.g. a nav header). */
  offset?: number;
  /** Let touches fall through empty space to siblings underneath (used by sheets). */
  passThrough?: boolean;
}

export default function KeyboardAvoider({ children, style, offset = 0, passThrough }: Props) {
  return (
    <KeyboardAvoidingView
      style={style ?? { flex: 1 }}
      // iOS needs explicit padding; on Android the window softInputMode already resizes.
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={offset}
      pointerEvents={passThrough ? 'box-none' : undefined}
    >
      {children}
    </KeyboardAvoidingView>
  );
}
