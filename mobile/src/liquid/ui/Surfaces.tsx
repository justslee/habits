/**
 * Liquid surfaces: the hero, panels, rows, badges, notices and the switch.
 * Paddings, radii and rules are the prototype's values.
 */

import React from 'react';
import { Pressable, StyleProp, StyleSheet, TextStyle, View, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated from 'react-native-reanimated';
import { useTheme } from '../theme';
import { fonts, radius, type } from '../tokens';
import { feel } from '../haptics';
import { Body, Eyebrow, SectionHeading, Small, Strong } from './Text';
import { usePressScale } from './Button';
import { Sculpture } from './Sculpture';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/** The screen's top line: an eyebrow and the profile mark. */
export function TopBar({ label, onProfile }: { label: string; onProfile?: () => void }) {
  const { c } = useTheme();
  return (
    <View style={s.top}>
      <Eyebrow style={{ flex: 1 }}>{label}</Eyebrow>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Open your profile"
        onPress={() => { feel.selection(); onProfile?.(); }}
        style={[s.avatar, { backgroundColor: c.panel, borderColor: c.line }]}
      >
        <Animated.Text style={[s.avatarLetter, { color: c.accent }]}>J</Animated.Text>
      </Pressable>
    </View>
  );
}

/** A staged flow's back arrow and step label. */
export function FlowTop({ step, onBack }: { step: string; onBack: () => void }) {
  const { c } = useTheme();
  return (
    <View style={s.flowTop}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Back"
        onPress={() => { feel.selection(); onBack(); }}
        style={[s.flowBack, { backgroundColor: c.panel }]}
      >
        <Ionicons name="arrow-back" size={18} color={c.fg} />
      </Pressable>
      <Animated.Text style={[s.flowStep, { color: c.muted }]}>{step.toUpperCase()}</Animated.Text>
    </View>
  );
}

/**
 * The hero card. Holds the next action, with the sculpture bleeding off the right edge.
 * `onHold` gives the whole card the 500 ms hold that opens the adjust sheet.
 */
export function Hero({
  children, compact, sculpture = true, onHold, style,
}: {
  children: React.ReactNode;
  compact?: boolean;
  sculpture?: boolean;
  onHold?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const { c } = useTheme();
  return (
    <Pressable
      onLongPress={onHold ? () => { feel.soft(); onHold(); } : undefined}
      delayLongPress={500}
      disabled={!onHold}
      accessibilityHint={onHold ? 'Hold to adjust today’s session' : undefined}
      style={[
        s.hero,
        { backgroundColor: c.panel },
        compact && { minHeight: 174, padding: 18, paddingHorizontal: 20 },
        style,
      ]}
    >
      {sculpture ? (
        <Sculpture
          size={compact ? 174 : 197}
          style={{ position: 'absolute', right: compact ? -58 : -71, top: compact ? 13 : 17 }}
        />
      ) : null}
      {children}
    </Pressable>
  );
}

/** The row under a hero: primary action on the left, icon action on the right. */
export function HeroActions({ children, compact }: { children: React.ReactNode; compact?: boolean }) {
  return <View style={[s.heroBottom, compact && { marginTop: 16 }]}>{children}</View>;
}

/** A plain rounded panel. */
export function Panel({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const { c } = useTheme();
  return <View style={[s.panel, { backgroundColor: c.panel }, style]}>{children}</View>;
}

/** `h-section`: a serif heading with an optional trailing element. */
export function Section({
  title, trailing, style,
}: {
  title?: string;
  trailing?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[s.section, style]}>
      {title ? <SectionHeading style={{ flex: 1 }}>{title}</SectionHeading> : <View style={{ flex: 1 }} />}
      {trailing}
    </View>
  );
}

/** A tappable list row with a title, subtitle and chevron. */
export function GoalRow({
  title, subtitle, icon = 'arrow-up-right', onPress, first,
}: {
  title: string;
  subtitle?: string;
  icon?: 'arrow-up-right' | 'chevron-forward' | 'none';
  onPress?: () => void;
  first?: boolean;
}) {
  const { c } = useTheme();
  const press = usePressScale();
  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={subtitle ? `${title}. ${subtitle}` : title}
      onPress={() => { feel.selection(); onPress?.(); }}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      style={[s.goal, { borderTopColor: first ? 'transparent' : c.line }, press.style]}
    >
      <View style={{ flex: 1 }}>
        <Strong>{title}</Strong>
        {subtitle ? <Small style={{ marginTop: 4 }}>{subtitle}</Small> : null}
      </View>
      {icon !== 'none' ? (
        <Ionicons
          name={icon === 'arrow-up-right' ? 'arrow-forward' : 'chevron-forward'}
          size={16}
          color={c.muted}
          style={icon === 'arrow-up-right' ? { transform: [{ rotate: '-45deg' }] } : undefined}
        />
      ) : null}
    </AnimatedPressable>
  );
}

/** A label/value row separated by a hairline. */
export function DetailRow({
  label, sub, value, valueNode, last, onPress,
}: {
  label: string;
  sub?: string;
  value?: string;
  valueNode?: React.ReactNode;
  last?: boolean;
  onPress?: () => void;
}) {
  const { c } = useTheme();
  const content = (
    <>
      <View style={{ flex: 1 }}>
        <Animated.Text style={[s.detailLabel, { color: c.fg }]}>{label}</Animated.Text>
        {sub ? <Small style={{ marginTop: 3 }}>{sub}</Small> : null}
      </View>
      {valueNode ?? (value ? <Animated.Text style={[s.detailValue, { color: c.muted }]}>{value}</Animated.Text> : null)}
    </>
  );
  const style = [s.detailRow, { borderBottomColor: last ? 'transparent' : c.line }];
  return onPress ? (
    <Pressable accessibilityRole="button" onPress={() => { feel.selection(); onPress(); }} style={style}>
      {content}
    </Pressable>
  ) : (
    <View style={style}>{content}</View>
  );
}

/** The small accent pill. */
export function Badge({ children, icon }: { children: React.ReactNode; icon?: keyof typeof Ionicons.glyphMap }) {
  const { c } = useTheme();
  return (
    <View style={[s.badge, { backgroundColor: c.soft }]}>
      {icon ? <Ionicons name={icon} size={12} color={c.accent} /> : null}
      <Animated.Text style={[s.badgeText, { color: c.accent }]}>{children}</Animated.Text>
    </View>
  );
}

/** A quiet explanatory note with a leading icon. */
export function Notice({ icon, children }: { icon: keyof typeof Ionicons.glyphMap; children: React.ReactNode }) {
  const { c } = useTheme();
  return (
    <View style={s.notice}>
      <Ionicons name={icon} size={14} color={c.muted} style={{ marginTop: 2 }} />
      <Small style={{ flex: 1, lineHeight: 11 * 1.6 }}>{children}</Small>
    </View>
  );
}

/** Centred hint text under a gesture surface. */
export function Hint({ children }: { children: React.ReactNode }) {
  return <Small style={s.hint}>{children}</Small>;
}

/** A calendar line: icon plus a sentence. */
export function CalendarNote({ children }: { children: React.ReactNode }) {
  const { c } = useTheme();
  return (
    <View style={s.calendarNote}>
      <Ionicons name="calendar-outline" size={14} color={c.muted} />
      <Small style={{ flex: 1 }}>{children}</Small>
    </View>
  );
}

/** The switch from the refinement pass: a 42×25 track with a 19pt thumb. */
export function Switch({
  value, onValueChange, label, sub,
}: {
  value: boolean;
  onValueChange: (v: boolean) => void;
  label: string;
  sub?: string;
}) {
  const { c } = useTheme();
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      accessibilityLabel={label}
      onPress={() => { feel.light(); onValueChange(!value); }}
      style={s.switchRow}
    >
      <View style={{ flex: 1 }}>
        <Animated.Text style={[s.switchLabel, { color: c.fg }]}>{label}</Animated.Text>
        {sub ? <Small style={{ marginTop: 3 }}>{sub}</Small> : null}
      </View>
      <View style={[s.track, { backgroundColor: value ? c.accent : c.panel2 }]}>
        <View
          style={[
            s.thumb,
            { backgroundColor: value ? c.bg : c.muted, transform: [{ translateX: value ? 17 : 0 }] },
          ]}
        />
      </View>
    </Pressable>
  );
}

/** Segmented progress ticks, as used by the meal deck and the set tracker. */
export function Coverage({ total, filled, height = 4 }: { total: number; filled: number; height?: number }) {
  const { c } = useTheme();
  return (
    <View style={[s.coverage, { gap: height > 4 ? 7 : 5 }]}>
      {Array.from({ length: total }, (_, i) => (
        <View
          key={i}
          style={{ flex: 1, height, borderRadius: 4, backgroundColor: i < filled ? c.accent : c.panel2 }}
        />
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 22 },
  avatar: {
    width: 36, height: 36, borderRadius: 18, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarLetter: { fontFamily: fonts.serif, fontSize: 22, marginTop: -2 },

  flowTop: { flexDirection: 'row', alignItems: 'center', gap: 11, marginBottom: 20 },
  flowBack: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  flowStep: { fontFamily: fonts.regular, fontSize: 11, letterSpacing: 1.2 },

  hero: { borderRadius: radius.hero, padding: 21, overflow: 'hidden', minHeight: 188, justifyContent: 'flex-start' },
  heroBottom: { marginTop: 22, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },

  panel: { borderRadius: radius.panel, padding: 19 },

  section: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 22, marginBottom: 9 },

  goal: { flexDirection: 'row', alignItems: 'center', gap: 12, borderTopWidth: 1, paddingVertical: 18 },

  detailRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, borderBottomWidth: 1, paddingVertical: 15 },
  detailLabel: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 13 * 1.45 },
  detailValue: { fontFamily: fonts.regular, fontSize: 13 },

  badge: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 6, paddingHorizontal: 9, borderRadius: radius.badge, alignSelf: 'flex-start' },
  badgeText: { fontFamily: fonts.regular, fontSize: 11, lineHeight: 11 * 1.3 },

  notice: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', marginVertical: 18 },
  hint: { textAlign: 'center', marginTop: 8, lineHeight: 11 * 1.4 },
  calendarNote: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14, marginBottom: 18 },

  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 20, minHeight: 54, marginVertical: 12 },
  switchLabel: { fontFamily: fonts.regular, fontSize: 13 },
  track: { width: 42, height: 25, borderRadius: 20, padding: 3, justifyContent: 'center' },
  thumb: { width: 19, height: 19, borderRadius: 10 },

  coverage: { flexDirection: 'row', marginVertical: 11 },
});

export const surfaceStyles = s;
