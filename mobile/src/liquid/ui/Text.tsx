/**
 * Liquid typography. Instrument Serif carries the editorial voice; DM Sans carries the
 * interface. `Em` is the accent italic used inside titles, exactly as the prototype's <em>.
 */

import React from 'react';
import { StyleProp, Text as RNText, TextProps, TextStyle } from 'react-native';
import { useColors } from '../theme';
import { fonts, type } from '../tokens';

type P = TextProps & { style?: StyleProp<TextStyle>; children?: React.ReactNode };

/** The big serif screen title. 46px, tight. */
export function Title({ style, ...rest }: P) {
  const c = useColors();
  return <RNText {...rest} style={[type.title, { color: c.fg }, style]} />;
}

/** Daily's slightly smaller, more open title. */
export function DailyTitle({ style, ...rest }: P) {
  const c = useColors();
  return <RNText {...rest} style={[type.dailyTitle, { color: c.fg }, style]} />;
}

/** Serif subtitle inside heroes and cards. */
export function Subtitle({ style, ...rest }: P) {
  const c = useColors();
  return <RNText {...rest} style={[type.subtitle, { color: c.fg }, style]} />;
}

/** Section heading — 25px serif. */
export function SectionHeading({ style, ...rest }: P) {
  const c = useColors();
  return <RNText {...rest} style={[type.sectionHeading, { color: c.fg }, style]} />;
}

/** The accent italic run inside a title. */
export function Em({ style, ...rest }: P) {
  const c = useColors();
  return <RNText {...rest} style={[{ fontFamily: fonts.serifItalic, color: c.accent }, style]} />;
}

/** Uppercase tracked label. */
export function Eyebrow({ style, ...rest }: P) {
  const c = useColors();
  return (
    <RNText
      {...rest}
      style={[type.eyebrow, { color: c.muted, textTransform: 'uppercase' }, style]}
    />
  );
}

/** 13px body copy, muted. */
export function Body({ style, ...rest }: P) {
  const c = useColors();
  return <RNText {...rest} style={[type.body, { color: c.muted }, style]} />;
}

/** 11px supporting copy. */
export function Small({ style, ...rest }: P) {
  const c = useColors();
  return <RNText {...rest} style={[type.small, { color: c.muted }, style]} />;
}

/** Foreground-weight inline text (the prototype's <b> inside rows). */
export function Strong({ style, ...rest }: P) {
  const c = useColors();
  return <RNText {...rest} style={[{ fontFamily: fonts.medium, fontSize: 14, color: c.fg }, style]} />;
}

/** Large serif figure — totals, counts, money. */
export function Figure({ style, ...rest }: P) {
  const c = useColors();
  return <RNText {...rest} style={[type.money, { color: c.fg }, style]} />;
}
