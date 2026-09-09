/**
 * FoodDeckScreen — swipe right to keep, left to skip. The deck stops as soon as the kept
 * meals cover the cycle's eating days; one spare on request. Every swipe reports what
 * the planner learned.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, PanResponder, ScrollView, StyleSheet, Text, TouchableOpacity, View, Dimensions } from 'react-native';
import { colors, fonts, radius, spacing, typography } from '../../theme';
import { FoodDeck, FoodRecipe, buildPlan, getDeck, swipeCard } from '../../api/client';
import { haptic } from '../../utils/haptics';
import ScreenBackground from '../../components/ScreenBackground';

const W = Dimensions.get('window').width;
const THRESHOLD = 110;

function artColor(r: FoodRecipe) {
  return `hsl(${r.hue ?? 260} 45% 30%)`;
}

export default function FoodDeckScreen({ navigation, route }: any) {
  const cycleId: number = route.params.cycleId;
  const [deck, setDeck] = useState<FoodDeck | null>(null);
  const [busy, setBusy] = useState(false);
  const [spare, setSpare] = useState(false);
  const shownAt = useRef(Date.now());
  const pos = useRef(new Animated.ValueXY()).current;

  const load = useCallback(async (withSpare = false) => {
    try {
      const d = await getDeck(cycleId, withSpare);
      setDeck(d);
      shownAt.current = Date.now();
    } catch (err) {
      console.warn('deck load', err);
    }
  }, [cycleId]);

  useEffect(() => { load(false); }, [load]);

  const decide = useCallback(async (decision: 'keep' | 'skip') => {
    if (!deck || !deck.cards.length || busy) return;
    setBusy(true);
    const card = deck.cards[0];
    decision === 'keep' ? haptic.success() : haptic.light();
    try {
      const next = await swipeCard(cycleId, { recipe_id: card.id, decision, dwell_ms: Date.now() - shownAt.current, spare });
      pos.setValue({ x: 0, y: 0 });
      setDeck(next);
      if (decision === 'keep') setSpare(false);
      shownAt.current = Date.now();
    } catch (err) {
      console.warn('swipe', err);
      pos.setValue({ x: 0, y: 0 });
    } finally {
      setBusy(false);
    }
  }, [deck, busy, cycleId, spare, pos]);

  const fling = useCallback((decision: 'keep' | 'skip') => {
    Animated.timing(pos, { toValue: { x: decision === 'keep' ? W * 1.3 : -W * 1.3, y: 0 }, duration: 220, useNativeDriver: true })
      .start(() => decide(decision));
  }, [pos, decide]);

  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 8 && Math.abs(g.dx) > Math.abs(g.dy),
      onPanResponderMove: Animated.event([null, { dx: pos.x, dy: pos.y }], { useNativeDriver: false }),
      onPanResponderRelease: (_, g) => {
        if (g.dx > THRESHOLD) fling('keep');
        else if (g.dx < -THRESHOLD) fling('skip');
        else Animated.spring(pos, { toValue: { x: 0, y: 0 }, useNativeDriver: true, friction: 6 }).start();
      },
    }),
  ).current;

  const rotate = pos.x.interpolate({ inputRange: [-W, 0, W], outputRange: ['-18deg', '0deg', '18deg'] });
  const keepOpacity = pos.x.interpolate({ inputRange: [0, 90], outputRange: [0, 1], extrapolate: 'clamp' });
  const skipOpacity = pos.x.interpolate({ inputRange: [-90, 0], outputRange: [1, 0], extrapolate: 'clamp' });

  const finishPlan = useCallback(async () => {
    haptic.medium();
    try {
      await buildPlan(cycleId);
      navigation.replace('FoodPlan', { cycleId });
    } catch (err) {
      console.warn('build plan', err);
    }
  }, [cycleId, navigation]);

  if (!deck) return <ScreenBackground><View style={s.center}><Text style={s.help}>Shuffling the deck…</Text></View></ScreenBackground>;

  const done = deck.cards.length === 0;
  const pct = Math.min(1, deck.coverage / Math.max(1, deck.eating_days));

  if (done) {
    return (
      <ScreenBackground>
        <ScrollView contentContainerStyle={s.container}>
          <Text style={typography.eyebrow}>STEP 2 · {deck.enough ? 'ENOUGH FOR THE CYCLE' : 'DECK EXHAUSTED'}</Text>
          <Text style={s.title}>{deck.kept.length} meal{deck.kept.length === 1 ? '' : 's'}, {deck.coverage} of {deck.eating_days} days</Text>
          <View style={s.card}>
            {deck.kept.map((r, i) => (
              <View key={r.id} style={[s.row, i > 0 && { borderTopWidth: 1, borderTopColor: colors.line }]}>
                <View style={{ flex: 1 }}>
                  <Text style={s.rowK}>{r.title}</Text>
                  <Text style={s.rowSub}>{r.prep_days} days · {r.reheat} · {r.protein_g_per_serving ?? '—'} g</Text>
                </View>
                <Text style={[s.pill, r.status === 'proven' ? { color: colors.success } : { color: colors.accentLight }]}>{r.status === 'proven' ? 'PROVEN' : 'NEW'}</Text>
              </View>
            ))}
            {!deck.kept.length && <Text style={s.help}>You skipped everything. Go back and keep a few.</Text>}
          </View>
          <Text style={s.help}>
            {deck.enough
              ? `Covered. The deck stopped here on purpose: 14 days minus travel and eat-out days is ${deck.eating_days}.`
              : `${deck.eating_days - deck.coverage} day${deck.eating_days - deck.coverage === 1 ? '' : 's'} still open · they default to eating out.`}
          </Text>
          {deck.learned.length > 0 && (
            <View style={s.card}><Text style={typography.eyebrow}>LEARNED</Text><Text style={s.learned}>{deck.learned.join(' · ')}</Text></View>
          )}
          <TouchableOpacity style={s.btn} onPress={finishPlan} disabled={!deck.kept.length} activeOpacity={0.9}>
            <Text style={s.btnText}>Build the plan</Text>
          </TouchableOpacity>
          {!deck.exhausted && deck.enough && (
            <TouchableOpacity style={s.ghost} onPress={() => { haptic.light(); setSpare(true); load(true); }}>
              <Text style={s.ghostText}>Keep one spare · {deck.remaining_count} left</Text>
            </TouchableOpacity>
          )}
          <View style={{ height: 120 }} />
        </ScrollView>
      </ScreenBackground>
    );
  }

  const [top, under] = deck.cards;
  return (
    <ScreenBackground>
      <View style={s.container}>
        <Text style={typography.eyebrow}>STEP 2 · {deck.coverage} OF {deck.eating_days} DAYS COVERED · {deck.remaining_count} CARDS LEFT</Text>
        <View style={s.bar}><View style={[s.barFill, { width: `${pct * 100}%` }]} /></View>

        <View style={s.deck}>
          {under && <View style={[s.cardFace, s.under]}><Card r={under} /></View>}
          <Animated.View
            {...pan.panHandlers}
            style={[s.cardFace, { transform: [{ translateX: pos.x }, { translateY: pos.y }, { rotate }] }]}
          >
            <Card r={top} />
            <Animated.Text style={[s.stamp, s.stampKeep, { opacity: keepOpacity }]}>KEEP</Animated.Text>
            <Animated.Text style={[s.stamp, s.stampSkip, { opacity: skipOpacity }]}>SKIP</Animated.Text>
          </Animated.View>
        </View>

        <View style={s.btns}>
          <TouchableOpacity style={[s.deckBtn, { borderColor: colors.error }]} onPress={() => fling('skip')} disabled={busy}>
            <Text style={[s.deckBtnText, { color: colors.error }]}>✕  Skip</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.deckBtn, { borderColor: colors.success }]} onPress={() => fling('keep')} disabled={busy}>
            <Text style={[s.deckBtnText, { color: colors.success }]}>Keep  ✓</Text>
          </TouchableOpacity>
        </View>
        <Text style={[s.help, { textAlign: 'center' }]}>{deck.learned.length ? `Learned: ${deck.learned.join(' · ')}` : 'Drag the card or use the buttons. Purple chips are essential ingredients.'}</Text>
      </View>
    </ScreenBackground>
  );
}

function Card({ r }: { r: FoodRecipe }) {
  return (
    <View style={s.cardInner}>
      <View style={[s.art, { backgroundColor: artColor(r) }]}>
        <Text style={s.src}>{(r.source_site || 'own').toUpperCase()}{r.rating ? ` · ${r.rating.toFixed(1)}` : ''}</Text>
      </View>
      <View style={s.body}>
        <Text style={s.cardTitle}>{r.title}</Text>
        <Text style={s.meta}>{r.status === 'proven' ? `PROVEN · COOKED ${r.times_cooked}×` : 'NEW CANDIDATE'} · {(r.cuisine || '').toUpperCase()}</Text>
        <View style={s.stats}>
          <Stat v={String(r.total_minutes)} l="min" />
          <Stat v={`${r.protein_g_per_serving ?? '—'}g`} l="protein" />
          <Stat v={`${r.prep_days}d`} l="keeps" />
          <Stat v={r.reheat} l="reheat" />
        </View>
        <View style={s.chips}>
          {r.ingredients.map(i => (
            <View key={i.id} style={[s.chip, i.essential && s.chipEss]}>
              <Text style={[s.chipText, i.essential && { color: colors.accentLight }]}>{i.name}</Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

function Stat({ v, l }: { v: string; l: string }) {
  return (
    <View style={s.stat}><Text style={s.statV}>{v}</Text><Text style={s.statL}>{l.toUpperCase()}</Text></View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: spacing.md, paddingTop: spacing.md, paddingBottom: 110 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  title: { ...typography.serifLarge, marginTop: 4, marginBottom: 10 },
  help: { fontFamily: fonts.regular, fontSize: 12.5, color: colors.textSecondary, lineHeight: 17, marginTop: 8 },
  learned: { fontFamily: fonts.mono, fontSize: 12, color: colors.accentLight, marginTop: 6 },
  bar: { height: 4, borderRadius: 2, backgroundColor: colors.input, marginTop: 8, marginBottom: 10, overflow: 'hidden' },
  barFill: { height: 4, backgroundColor: colors.accent },
  deck: { flex: 1, position: 'relative', marginBottom: 12 },
  cardFace: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, borderRadius: 22, overflow: 'hidden', backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line },
  under: { transform: [{ scale: 0.96 }, { translateY: 10 }], opacity: 0.7 },
  cardInner: { flex: 1 },
  art: { height: 150, justifyContent: 'flex-end', padding: 14 },
  src: { fontFamily: fonts.mono, fontSize: 10, letterSpacing: 1.2, color: 'rgba(255,255,255,0.85)' },
  body: { flex: 1, padding: 14 },
  cardTitle: { ...typography.serifTitle, fontSize: 26 },
  meta: { fontFamily: fonts.mono, fontSize: 10, letterSpacing: 0.8, color: colors.textSecondary, marginTop: 2, marginBottom: 10 },
  stats: { flexDirection: 'row', gap: 6, marginBottom: 10 },
  stat: { flex: 1, backgroundColor: colors.input, borderRadius: 10, paddingVertical: 8, alignItems: 'center' },
  statV: { fontFamily: fonts.mono, fontSize: 15, color: colors.text },
  statL: { fontFamily: fonts.mono, fontSize: 8, letterSpacing: 1, color: colors.textTertiary, marginTop: 2 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 'auto' },
  chip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: colors.input, borderWidth: 1, borderColor: colors.line },
  chipEss: { borderColor: colors.borderFocus },
  chipText: { fontFamily: fonts.regular, fontSize: 11, color: colors.textSecondary },
  stamp: { position: 'absolute', top: 18, fontFamily: fonts.mono, fontSize: 18, letterSpacing: 2, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 3, borderRadius: 8 },
  stampKeep: { left: 16, color: colors.success, borderColor: colors.success, transform: [{ rotate: '-12deg' }] },
  stampSkip: { right: 16, color: colors.error, borderColor: colors.error, transform: [{ rotate: '12deg' }] },
  btns: { flexDirection: 'row', gap: 10 },
  deckBtn: { flex: 1, borderRadius: 14, paddingVertical: 13, alignItems: 'center', borderWidth: 1, backgroundColor: colors.card },
  deckBtnText: { fontFamily: fonts.semibold, fontSize: 14 },
  card: { backgroundColor: colors.card, borderRadius: 18, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 14, paddingVertical: 6, marginBottom: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9 },
  rowK: { fontFamily: fonts.medium, fontSize: 14, color: colors.text },
  rowSub: { fontFamily: fonts.regular, fontSize: 11.5, color: colors.textTertiary, marginTop: 1 },
  pill: { fontFamily: fonts.mono, fontSize: 9.5, letterSpacing: 1 },
  btn: { backgroundColor: colors.accent, borderRadius: radius.md, paddingVertical: 15, alignItems: 'center', marginTop: 12 },
  btnText: { fontFamily: fonts.semibold, fontSize: 15, color: colors.bg },
  ghost: { alignItems: 'center', paddingVertical: 12 },
  ghostText: { fontFamily: fonts.medium, fontSize: 13, color: colors.accentLight },
});
