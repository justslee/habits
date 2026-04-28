/**
 * CoachHero — hero card where the coach speaks the directive for the screen.
 * Tapping opens the coach chat sheet. Children render below the spoken line for
 * per-tab contextual visuals (map, compound rows, etc.).
 *
 * Ported from `tabs.jsx` `CoachHero` in the design canvas.
 */

import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, Easing } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, fonts, radius, spacing } from '../theme';

interface Props {
  /** Eyebrow pill in the top-left, e.g. "SAT · DOUBLE DAY". */
  pill?: string;
  /** Right-side slot (e.g. a back-to-stack button). */
  topRight?: React.ReactNode;
  /** The spoken directive — short, italic. */
  line: React.ReactNode;
  /** Timestamp / context byline. */
  ts?: string;
  /** Meta strip below the line. */
  meta?: string;
  /** Tap handler — opens coach sheet (provided by parent). */
  onPressAsk?: () => void;
  /** Optional contextual visuals rendered below the spoken line. */
  children?: React.ReactNode;
}

export default function CoachHero({
  pill,
  topRight,
  line,
  ts = 'COACH',
  meta,
  onPressAsk,
  children,
}: Props) {
  // Looping wave on the coach byline icon.
  const wave1 = useRef(new Animated.Value(0.5)).current;
  const wave2 = useRef(new Animated.Value(0.5)).current;
  const wave3 = useRef(new Animated.Value(0.5)).current;

  useEffect(() => {
    const seq = (anim: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(anim, { toValue: 1.3, duration: 450, delay, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(anim, { toValue: 0.5, duration: 450, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ]),
      );
    const a = seq(wave1, 0);
    const b = seq(wave2, 150);
    const c = seq(wave3, 300);
    a.start(); b.start(); c.start();
    return () => { a.stop(); b.stop(); c.stop(); };
  }, [wave1, wave2, wave3]);

  return (
    <TouchableOpacity activeOpacity={0.92} onPress={onPressAsk} style={styles.wrap}>
      <LinearGradient colors={['#1F2030', '#262738']} style={StyleSheet.absoluteFill} />
      {/* Violet bloom — top-right */}
      <LinearGradient
        colors={['rgba(155,138,232,0.22)', 'rgba(155,138,232,0)']}
        start={{ x: 1, y: 0 }}
        end={{ x: 0.4, y: 0.6 }}
        style={styles.bloomTopRight}
        pointerEvents="none"
      />

      {/* Top row: pill + topRight */}
      <View style={styles.topRow}>
        {pill ? (
          <View style={styles.pill}>
            <Text style={styles.pillText}>{pill}</Text>
          </View>
        ) : <View />}
        {topRight}
      </View>

      {/* Coach byline */}
      <View style={styles.bylineRow}>
        <View style={styles.waveRow}>
          <Animated.View style={[styles.waveBar, { height: 5, transform: [{ scaleY: wave1 }] }]} />
          <Animated.View style={[styles.waveBar, { height: 9, transform: [{ scaleY: wave2 }] }]} />
          <Animated.View style={[styles.waveBar, { height: 7, transform: [{ scaleY: wave3 }] }]} />
        </View>
        <Text style={styles.byline}>↗ COACH · {ts}</Text>
      </View>

      {/* Spoken line */}
      <Text style={styles.line}>{line}</Text>

      {/* Meta + ASK */}
      {(meta || onPressAsk) && (
        <View style={styles.bottomRow}>
          {meta ? <Text style={styles.meta}>{meta}</Text> : <View style={{ flex: 1 }} />}
          {onPressAsk && (
            <View style={styles.askPill}>
              <Text style={styles.askText}>ASK ›</Text>
            </View>
          )}
        </View>
      )}

      {/* Contextual children */}
      {children && <View style={styles.children}>{children}</View>}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  wrap: {
    
    marginBottom: spacing.md,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 22,
    paddingTop: 18,
    paddingBottom: 16,
    overflow: 'hidden',
  },
  bloomTopRight: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: '70%',
    height: '70%',
    borderTopRightRadius: radius.xl,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  pill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: 'rgba(15,15,24,0.55)',
  },
  pillText: {
    fontFamily: fonts.mono,
    fontSize: 10,
    color: colors.textSecondary,
    letterSpacing: 1.6,
  },
  bylineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 14,
  },
  waveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    height: 10,
  },
  waveBar: {
    width: 2,
    backgroundColor: colors.accent,
    borderRadius: 1,
  },
  byline: {
    fontFamily: fonts.mono,
    fontSize: 9,
    color: colors.accent,
    letterSpacing: 2.2,
  },
  line: {
    fontFamily: fonts.serifItalic,
    fontSize: 23,
    lineHeight: 30,
    color: colors.text,
    marginTop: 10,
  },
  bottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 14,
    gap: 12,
  },
  meta: {
    fontFamily: fonts.mono,
    fontSize: 10,
    color: colors.textTertiary,
    letterSpacing: 1.4,
    flex: 1,
  },
  askPill: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.accent,
  },
  askText: {
    fontFamily: fonts.mono,
    fontSize: 10,
    color: colors.accent,
    letterSpacing: 1.8,
  },
  children: {
    marginTop: 16,
  },
});
