/**
 * DailyReviewIsland — Dynamic Island-style nudge that floats under the status bar
 * after the daily review hour. Tap to expand → tap again or "Start" to open the
 * full DailyReviewSheet.
 *
 * Ported from `daily-review-sheet.jsx` `DailyReviewIsland` in the design canvas.
 * Real iOS Live Activity APIs aren't used here — this is a pure JS visual.
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableWithoutFeedback,
  TouchableOpacity,
  Animated,
  Easing,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, fonts } from '../theme';

interface Pillar {
  id: number;
  short: string;
  color: string;
  touched: boolean;
}

interface Props {
  /** Hide the island. */
  dismissed?: boolean;
  /** Tap to open the full sheet. */
  onOpen: () => void;
  /** Dismiss for the day. */
  onDismiss: () => void;
  /** Time label, e.g. "10:00 PM · day 247". */
  meta?: string;
  /** Pillar dot strip preview. */
  pillars?: Pillar[];
}

export default function DailyReviewIsland({
  dismissed,
  onOpen,
  onDismiss,
  meta = '10:00 PM',
  pillars,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const slide = useRef(new Animated.Value(-12)).current;
  const fade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (dismissed) {
      slide.setValue(-12);
      fade.setValue(0);
      return;
    }
    Animated.parallel([
      Animated.timing(slide, { toValue: 0, duration: 480, easing: Easing.bezier(0.2, 0.8, 0.2, 1), useNativeDriver: true }),
      Animated.timing(fade, { toValue: 1, duration: 320, useNativeDriver: true }),
    ]).start();
  }, [dismissed, slide, fade]);

  if (dismissed) return null;

  const closed = pillars?.filter(p => p.touched).length ?? 0;
  const total = pillars?.length ?? 0;

  return (
    <Animated.View
      style={[
        styles.wrap,
        {
          opacity: fade,
          transform: [{ translateY: slide }],
        },
      ]}
    >
      <TouchableWithoutFeedback
        onPress={() => {
          if (!expanded) setExpanded(true);
          else onOpen();
        }}
      >
        <View style={[styles.bg, expanded ? styles.bgExpanded : styles.bgCollapsed]}>
          {expanded ? (
            <View style={styles.expanded}>
              <View style={styles.expandedTop}>
                <View style={styles.headLeft}>
                  <LinearGradient
                    colors={[colors.accent, colors.accent2]}
                    style={styles.iconBox}
                  >
                    <Ionicons name="moon" size={14} color={colors.bg} />
                  </LinearGradient>
                  <View style={{ minWidth: 0 }}>
                    <Text style={styles.title}>Daily Review</Text>
                    <Text style={styles.meta}>{meta}</Text>
                  </View>
                </View>
                <View style={styles.btnRow}>
                  <Pressable style={styles.laterBtn} onPress={onDismiss}>
                    <Text style={styles.laterText}>Later</Text>
                  </Pressable>
                  <TouchableOpacity style={styles.startBtn} onPress={onOpen}>
                    <Text style={styles.startText}>Start</Text>
                  </TouchableOpacity>
                </View>
              </View>
              {pillars && pillars.length > 0 && (
                <View style={styles.dotStrip}>
                  {pillars.map(p => (
                    <View
                      key={p.id}
                      style={{
                        flex: 1,
                        height: 4,
                        borderRadius: 2,
                        backgroundColor: p.touched ? p.color : 'rgba(255,255,255,0.12)',
                      }}
                    />
                  ))}
                  <Text style={styles.closedCount}>{closed}/{total}</Text>
                </View>
              )}
            </View>
          ) : (
            <View style={styles.collapsed}>
              <LinearGradient
                colors={[colors.accent, colors.accent2]}
                style={styles.iconBoxSmall}
              >
                <Ionicons name="moon" size={11} color={colors.bg} />
              </LinearGradient>
              <Text style={styles.collapsedTitle}>Review</Text>
              <View style={styles.collapsedDot} />
              <Text style={styles.collapsedTime}>{meta}</Text>
            </View>
          )}
        </View>
      </TouchableWithoutFeedback>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignSelf: 'center',
    marginTop: 6,
    marginBottom: 4,
    zIndex: 60,
  },
  bg: {
    backgroundColor: '#000',
    overflow: 'hidden',
  },
  bgCollapsed: {
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 14,
    paddingLeft: 8,
  },
  bgExpanded: {
    borderRadius: 28,
    paddingVertical: 14,
    paddingHorizontal: 14,
    paddingLeft: 16,
    minWidth: 320,
  },
  expanded: { gap: 10 },
  expandedTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  headLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  iconBox: {
    width: 30, height: 30, borderRadius: 8,
    alignItems: 'center', justifyContent: 'center',
  },
  iconBoxSmall: {
    width: 22, height: 22, borderRadius: 6,
    alignItems: 'center', justifyContent: 'center',
  },
  title: { fontFamily: fonts.semibold, fontSize: 13, color: '#fff', lineHeight: 14 },
  meta: { fontFamily: fonts.mono, fontSize: 10, color: 'rgba(255,255,255,0.62)', letterSpacing: 0.4, marginTop: 2 },

  btnRow: { flexDirection: 'row', gap: 6 },
  laterBtn: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  laterText: { fontFamily: fonts.medium, fontSize: 11, color: 'rgba(255,255,255,0.7)' },
  startBtn: {
    backgroundColor: colors.accent,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  startText: { fontFamily: fonts.semibold, fontSize: 11, color: colors.bg },

  dotStrip: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  closedCount: {
    fontFamily: fonts.mono,
    fontSize: 10,
    color: 'rgba(255,255,255,0.62)',
    letterSpacing: 0.4,
    marginLeft: 6,
  },

  collapsed: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  collapsedTitle: { fontFamily: fonts.semibold, fontSize: 12, color: '#fff' },
  collapsedDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: colors.accent },
  collapsedTime: { fontFamily: fonts.mono, fontSize: 11, color: 'rgba(255,255,255,0.7)', letterSpacing: 0.4 },
});
