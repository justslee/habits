/**
 * DailyQuoteCard — italic-serif quote with mono attribution.
 * Ported from `home-extras.jsx` `DailyQuote` in the design canvas.
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, fonts, radius } from '../theme';

const QUOTES: Array<{ q: string; a: string }> = [
  { q: 'We are what we repeatedly do. Excellence, then, is not an act, but a habit.', a: 'ARISTOTLE' },
  { q: 'Discipline equals freedom.', a: 'JOCKO WILLINK' },
  { q: 'The cave you fear to enter holds the treasure you seek.', a: 'JOSEPH CAMPBELL' },
  { q: 'Compounding is the eighth wonder of the world. He who understands it, earns it.', a: 'ATTRIB. EINSTEIN' },
  { q: 'You do not rise to the level of your goals. You fall to the level of your systems.', a: 'JAMES CLEAR' },
];

interface Props {
  /** Pin a specific quote. Otherwise uses the day-of-month modulo. */
  quote?: { q: string; a: string };
}

export default function DailyQuoteCard({ quote }: Props) {
  const today = quote ?? QUOTES[new Date().getDate() % QUOTES.length];
  return (
    <View style={styles.wrap}>
      <Text style={styles.quote}>“{today.q}”</Text>
      <Text style={styles.attr}>— {today.a}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    
    marginBottom: 14,
    paddingVertical: 16,
    paddingHorizontal: 18,
    borderRadius: radius.xl,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
  },
  quote: {
    fontFamily: fonts.serifItalic,
    fontSize: 18,
    lineHeight: 24,
    color: colors.text,
  },
  attr: {
    marginTop: 10,
    fontFamily: fonts.mono,
    fontSize: 10,
    color: colors.textTertiary,
    letterSpacing: 1.8,
  },
});
