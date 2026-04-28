/**
 * NorthStarCard — pinned vision card with glowing star icon and italic line.
 * Ported from `home-extras.jsx` `NorthStar` in the design canvas.
 */

import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Easing, TouchableOpacity } from 'react-native';
import Svg, { Defs, RadialGradient, Stop, Circle, Path } from 'react-native-svg';
import { colors, fonts, radius, spacing } from '../theme';

interface Props {
  /** The vision/mantra line. */
  line: string;
  /** Eyebrow label (default "NORTH STAR"). */
  eyebrow?: string;
  /** Footer hint (default revise prompt). */
  footer?: string;
  /** Tap handler — typically opens an edit sheet. */
  onPress?: () => void;
}

export default function NorthStarCard({
  line,
  eyebrow = 'NORTH STAR · 2026',
  footer = 'EVERY DAILY HABIT ROLLS UP TO THIS · TAP TO REVISE',
  onPress,
}: Props) {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1500, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 1500, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  return (
    <TouchableOpacity activeOpacity={0.92} onPress={onPress} style={styles.wrap}>
      <Animated.View
        style={[
          styles.statusDot,
          { opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }) },
        ]}
      />
      <View style={styles.headRow}>
        <View style={styles.starWrap}>
          <Svg width={18} height={18} viewBox="0 0 24 24">
            <Defs>
              <RadialGradient id="ns-glow" cx="50%" cy="50%" r="50%">
                <Stop offset="0%" stopColor={colors.accent} stopOpacity="0.6" />
                <Stop offset="100%" stopColor={colors.accent} stopOpacity="0" />
              </RadialGradient>
            </Defs>
            <Circle cx="12" cy="12" r="11" fill="url(#ns-glow)" />
            <Path
              d="M12 2 L13.2 10.8 L22 12 L13.2 13.2 L12 22 L10.8 13.2 L2 12 L10.8 10.8 Z"
              fill={colors.accent}
              stroke={colors.bg}
              strokeWidth={0.4}
              strokeLinejoin="round"
            />
            <Circle cx="12" cy="12" r="1.6" fill={colors.bg} />
          </Svg>
        </View>
        <Text style={styles.eyebrow}>{eyebrow}</Text>
      </View>
      <Text style={styles.line}>{line}</Text>
      <Text style={styles.footer}>{footer}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  wrap: {
    
    marginTop: 4,
    marginBottom: 14,
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 16,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.accent,
    backgroundColor: 'rgba(155,138,232,0.06)',
    position: 'relative',
  },
  statusDot: {
    position: 'absolute',
    top: 16,
    right: 16,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.accent,
  },
  headRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  starWrap: { width: 18, height: 18 },
  eyebrow: {
    fontFamily: fonts.mono,
    fontSize: 9,
    color: colors.accent,
    letterSpacing: 2.2,
  },
  line: {
    fontFamily: fonts.serifItalic,
    fontSize: 21,
    lineHeight: 28,
    color: colors.text,
    marginTop: 10,
    letterSpacing: -0.3,
  },
  footer: {
    fontFamily: fonts.mono,
    fontSize: 9,
    color: colors.textTertiary,
    letterSpacing: 1.6,
    marginTop: 12,
  },
});
