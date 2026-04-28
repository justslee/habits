/**
 * CoachCard — secondary coach mention card with serif italic line + ASK ›.
 * Tapping opens the coach chat. Used on NorthStar / Me — quieter than CoachHero.
 *
 * Ported from `tabs.jsx` `CoachCard` in the design canvas.
 */

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { colors, fonts, radius, spacing } from '../theme';

interface Props {
  /** Section heading shown above the card. Defaults to "Coach". */
  heading?: string;
  /** CTA shown in the section header (top-right). */
  cta?: string;
  /** The serif italic line — short, focused. */
  line: React.ReactNode;
  /** Timestamp / context byline. */
  ts?: string;
  /** Tap handler — opens coach chat. */
  onPress?: () => void;
}

export default function CoachCard({
  heading = 'Coach',
  cta = 'ASK COACH',
  line,
  ts = 'NOW',
  onPress,
}: Props) {
  return (
    <View>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{heading}</Text>
        <TouchableOpacity onPress={onPress}>
          <Text style={styles.sectionMore}>{cta} ↗</Text>
        </TouchableOpacity>
      </View>
      <TouchableOpacity activeOpacity={0.92} onPress={onPress} style={styles.card}>
        <Text style={styles.line}>{line}</Text>
        <View style={styles.bottomRow}>
          <Text style={styles.ts}>↑ COACH · {ts}</Text>
          <View style={styles.askPill}>
            <Text style={styles.askText}>ASK ›</Text>
          </View>
        </View>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    
    marginTop: 22,
    marginBottom: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: {
    fontFamily: fonts.serifItalic,
    fontSize: 22,
    color: colors.text,
    letterSpacing: -0.5,
  },
  sectionMore: {
    fontFamily: fonts.mono,
    fontSize: 10,
    color: colors.textTertiary,
    letterSpacing: 1.6,
  },
  card: {
    
    marginBottom: 14,
    paddingVertical: 16,
    paddingHorizontal: 18,
    borderRadius: radius.xl,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
  },
  line: {
    fontFamily: fonts.serifItalic,
    fontSize: 19,
    lineHeight: 26,
    color: colors.text,
  },
  bottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
  },
  ts: {
    fontFamily: fonts.mono,
    fontSize: 10,
    color: colors.textTertiary,
    letterSpacing: 1.6,
  },
  askPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.accent,
  },
  askText: {
    fontFamily: fonts.mono,
    fontSize: 10,
    color: colors.accent,
    letterSpacing: 1.6,
  },
});
