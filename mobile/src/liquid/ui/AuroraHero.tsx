/**
 * North Star's aurora header.
 *
 * Two layers of the same still drift on 22- and 17-second alternating cycles; the text never
 * moves. Ink gets the aurora at night; Pearl gets first light, the hour before dawn when the
 * guiding star is the last one out — the same subject in the opposite key, so the header belongs
 * to the page beneath it. A gradient over the image keeps the type legible either way. Motion
 * stops when the screen is not focused, when Reduce Motion or Quiet is on, or when the owner
 * presses pause. Both are moving stills, not video, and the info action says so.
 */

import React, { useEffect } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  Easing, cancelAnimation, useAnimatedStyle, useSharedValue, withRepeat, withTiming,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { AURORA, AURORA_PEARL, fonts } from '../tokens';
import { useTheme } from '../theme';
import { feel } from '../haptics';

const NIGHT = require('../../../assets/aurora-north-star.jpg');
const DAWN = require('../../../assets/north-first-light.jpg');

/** The scrim runs dark-to-dark over the aurora and light-to-light over first light. */
const VEIL: Record<'ink' | 'pearl', [string, string, string, string]> = {
  ink: ['rgba(6,18,27,0.07)', 'rgba(6,18,27,0.02)', 'rgba(7,20,27,0.85)', 'rgba(12,23,28,0.91)'],
  pearl: ['rgba(247,239,228,0.04)', 'rgba(247,239,228,0.10)', 'rgba(243,238,229,0.72)', 'rgba(238,233,223,0.92)'],
};

export function AuroraHero({
  compact, title, titleLength = 0, eyebrow, caption, playing, onTogglePlay, onInfo, focused,
}: {
  compact: boolean;
  title: React.ReactNode;
  /** Characters in the title, so a long mantra can size itself down. */
  titleLength?: number;
  eyebrow?: string;
  caption?: string;
  playing: boolean;
  onTogglePlay: () => void;
  onInfo: () => void;
  focused: boolean;
}) {
  const { moves, look } = useTheme();
  const a = look === 'pearl' ? AURORA_PEARL : AURORA;
  const image = look === 'pearl' ? DAWN : NIGHT;
  const insets = useSafeAreaInsets();
  const drift = useSharedValue(0);
  const curtain = useSharedValue(0);
  const active = playing && moves && focused;

  useEffect(() => {
    if (!active) {
      cancelAnimation(drift);
      cancelAnimation(curtain);
      return;
    }
    drift.value = withRepeat(withTiming(1, { duration: 22000, easing: Easing.inOut(Easing.ease) }), -1, true);
    curtain.value = withRepeat(withTiming(1, { duration: 17000, easing: Easing.inOut(Easing.ease) }), -1, true);
    return () => { cancelAnimation(drift); cancelAnimation(curtain); };
  }, [active, drift, curtain]);

  const back = useAnimatedStyle(() => ({
    transform: [
      { scale: 1.07 + drift.value * 0.07 },
      { translateX: -3 + drift.value * 8 },
      { translateY: -2 + drift.value * 5 },
    ],
  }));
  const veil = useAnimatedStyle(() => ({
    opacity: 0.18,
    transform: [
      { scale: 1.1 + curtain.value * 0.05 },
      { translateX: 5 - curtain.value * 11 },
      { translateY: -4 + curtain.value * 7 },
    ],
  }));

  return (
    <View style={[s.hero, { backgroundColor: a.bg, minHeight: (compact ? 173 : 350) + insets.top, paddingTop: insets.top + 18 }]}>
      <Animated.View style={[StyleSheet.absoluteFill, back]}>
        <Image
          source={image}
          style={s.photo}
          resizeMode="cover"
          accessible
          accessibilityLabel={
            look === 'pearl'
              ? 'An illustrated dawn sky with a single guiding star over a low ridge and still water'
              : 'Photographic-style northern lights above mountains and a still lake; AI-generated'
          }
        />
      </Animated.View>
      <Animated.View style={[StyleSheet.absoluteFill, veil]} pointerEvents="none">
        <Image source={image} style={s.photo} resizeMode="cover" accessibilityElementsHidden />
      </Animated.View>
      <LinearGradient
        pointerEvents="none"
        colors={VEIL[look]}
        locations={[0.04, 0.25, 0.67, 1]}
        style={StyleSheet.absoluteFill}
      />

      <View style={s.top}>
        <View style={s.wordmark}>
          <Ionicons name="sparkles" size={21} color={a.wordmarkStar} />
          <Animated.Text style={[s.wordmarkText, { color: a.fg }]}>North Star</Animated.Text>
        </View>
        <View style={s.actions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={playing ? 'Pause aurora motion' : 'Play aurora motion'}
            onPress={() => { feel.selection(); onTogglePlay(); }}
            style={[s.action, { backgroundColor: a.actionBg, borderColor: a.actionLine }]}
          >
            <Ionicons name={playing ? 'pause' : 'play'} size={16} color={a.actionFg} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="About the aurora image"
            onPress={() => onInfo()}
            style={[s.action, { backgroundColor: a.actionBg, borderColor: a.actionLine }]}
          >
            <Ionicons name="information" size={16} color={a.actionFg} />
          </Pressable>
        </View>
      </View>

      <View style={[s.mantra, { marginTop: compact ? 22 : 79 }]}>
        {eyebrow ? <Animated.Text style={[s.eyebrow, { color: a.eyebrow }]}>{eyebrow.toUpperCase()}</Animated.Text> : null}
        <Animated.Text
          style={[
            s.title,
            { color: a.fg },
            // A long real mantra sets its own size so the header stays a header.
            compact
              ? { fontSize: 31, lineHeight: 31 * 1.13 }
              : titleLength > 150
                ? { fontSize: 25, lineHeight: 25 * 1.2 }
                : titleLength > 100
                  ? { fontSize: 28, lineHeight: 28 * 1.16 }
                  : { fontSize: 32, lineHeight: 32 * 1.13 },
          ]}
        >
          {title}
        </Animated.Text>
        {caption ? <Animated.Text style={[s.caption, { color: a.caption }]}>{caption}</Animated.Text> : null}
      </View>
    </View>
  );
}

export const auroraStyles = StyleSheet.create({
  em: { fontFamily: fonts.serifItalic, color: AURORA.em },
});

const s = StyleSheet.create({
  hero: {
    overflow: 'hidden',
    paddingHorizontal: 24,
    paddingBottom: 24,
    justifyContent: 'space-between',
  },
  photo: { width: '100%', height: '100%' },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 14 },
  wordmark: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  wordmarkText: { fontFamily: fonts.serif, fontSize: 28, letterSpacing: -0.6 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  action: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  mantra: { maxWidth: 350 },
  eyebrow: { fontFamily: fonts.regular, fontSize: 11, letterSpacing: 1.65, marginBottom: 12 },
  title: { fontFamily: fonts.serif, lineHeight: 32 * 1.13, letterSpacing: -0.6 },
  caption: { fontFamily: fonts.regular, fontSize: 11, marginTop: 12, lineHeight: 11 * 1.5 },
});
