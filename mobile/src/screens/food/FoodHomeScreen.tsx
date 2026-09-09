/**
 * FoodHomeScreen — the Food tab landing: current cycle, tonight, pantry, taste profile.
 * Drives the two-week loop: pantry check → deck → plan (bags and carts arrive in later phases).
 */

import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View, RefreshControl } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts, radius, spacing, typography } from '../../theme';
import {
  FoodCycle, FoodPlan, PantryEntry, TasteEntry,
  createCycle, getCurrentCycle, getPantry, getPlan, getTaste,
} from '../../api/client';
import { haptic } from '../../utils/haptics';
import ScreenBackground from '../../components/ScreenBackground';
import Topbar from '../../components/Topbar';

function fmt(d: string) {
  const [y, m, day] = d.split('-').map(Number);
  return new Date(y, m - 1, day).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function FoodHomeScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const [cycle, setCycle] = useState<FoodCycle | null>(null);
  const [plan, setPlan] = useState<FoodPlan | null>(null);
  const [pantry, setPantry] = useState<PantryEntry[]>([]);
  const [taste, setTaste] = useState<TasteEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [c, p, t] = await Promise.all([getCurrentCycle(), getPantry(), getTaste()]);
      setCycle(c);
      setPantry(p);
      setTaste(t.profile);
      setPlan(c && c.status !== 'deck' ? await getPlan(c.id) : null);
    } catch (err) {
      console.warn('FoodHome load error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => navigation?.addListener?.('focus', load), [navigation, load]);

  const startCycle = useCallback(async () => {
    haptic.medium();
    try {
      const c = await createCycle({ eat_out_days: 2 });
      setCycle(c);
      navigation.navigate('FoodPantry', { cycleId: c.id });
    } catch (err) {
      console.warn('start cycle error:', err);
    }
  }, [navigation]);

  const today = new Date().toISOString().slice(0, 10);
  const tonight = plan?.meals.find(m => m.days_covered.includes(today) && m.status !== 'skipped')
    ?? plan?.meals.find(m => m.status === 'planned');
  const gone = pantry.filter(p => p.state === 'gone').length;
  const some = pantry.filter(p => p.state === 'some').length;
  const plenty = pantry.filter(p => p.state === 'plenty').length;

  const cta = !cycle
    ? { label: 'Start a two-week cycle', onPress: startCycle }
    : cycle.status === 'deck'
      ? { label: 'Continue picking meals', onPress: () => navigation.navigate('FoodDeck', { cycleId: cycle.id }) }
      : { label: 'See the plan', onPress: () => navigation.navigate('FoodPlan', { cycleId: cycle.id }) };

  return (
    <ScreenBackground>
      <ScrollView
        style={s.scroll}
        contentContainerStyle={[s.container, { paddingTop: insets.top + spacing.md }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.accent} />}
      >
        <View style={{ marginHorizontal: -spacing.md }}>
          <Topbar
            title="Food"
            caption={cycle ? `CYCLE · ${fmt(cycle.start_date).toUpperCase()} – ${fmt(cycle.end_date).toUpperCase()} · ${cycle.status.toUpperCase()}` : 'NO CYCLE YET'}
          />
        </View>

        <View style={s.card}>
          <Text style={s.lbl}>TONIGHT</Text>
          {tonight ? (
            <>
              <Text style={s.big}>{tonight.recipe.title}</Text>
              <Text style={s.help}>Reheat: {tonight.recipe.reheat} · {tonight.recipe.protein_g_per_serving ?? '—'} g protein · leftovers for lunch</Text>
            </>
          ) : (
            <>
              <Text style={s.body}>{loading ? 'Loading…' : 'Nothing planned yet'}</Text>
              <Text style={s.help}>Check the pantry, pick meals, and the strip fills itself.</Text>
            </>
          )}
        </View>

        <View style={s.card}>
          <Text style={s.lbl}>THIS CYCLE</Text>
          <Row k="Meals kept" sub={plan?.meals.map(m => m.recipe.title).join(' · ') || (cycle ? 'pick them in the deck' : '—')} v={String(plan?.meals.length ?? 0)} />
          <Row k="Eating days" sub={cycle ? `14 − ${cycle.travel_days.length} travel − ${cycle.eat_out_days} eat-out` : 'travel from Google Calendar (coming)'} v={String(cycle?.eating_days ?? '—')} />
          <Row k="Covered" sub={plan ? (plan.open_days ? `${plan.open_days} open · eat out or keep one more` : 'fully covered') : '—'} v={String(plan?.covered_days ?? '—')} />
        </View>

        <TouchableOpacity style={s.card} activeOpacity={0.85} onPress={() => navigation.navigate('FoodPantry', { cycleId: cycle?.id })}>
          <Text style={s.lbl}>PANTRY</Text>
          <Text style={s.body}>{gone} gone · {some} running low · {plenty} plenty</Text>
          <Text style={s.help}>Tap to update</Text>
        </TouchableOpacity>

        <View style={s.card}>
          <Text style={s.lbl}>TASTE PROFILE · LEARNED</Text>
          <View style={s.chips}>
            {taste.map(t => (
              <View key={t.feature} style={s.chip}><Text style={s.chipText}>{t.label} {t.weight >= 0 ? '+' : ''}{t.weight.toFixed(2)}</Text></View>
            ))}
          </View>
          <Text style={s.help}>Moves a little with every swipe and every "cooked it" tap. Never flips on one signal.</Text>
        </View>

        <TouchableOpacity style={s.btn} onPress={cta.onPress} activeOpacity={0.9}>
          <Text style={s.btnText}>{cta.label}</Text>
        </TouchableOpacity>
        <View style={{ height: 120 }} />
      </ScrollView>
    </ScreenBackground>
  );
}

function Row({ k, sub, v }: { k: string; sub?: string; v: string }) {
  return (
    <View style={s.row}>
      <View style={{ flex: 1 }}>
        <Text style={s.rowK}>{k}</Text>
        {sub ? <Text style={s.rowSub} numberOfLines={2}>{sub}</Text> : null}
      </View>
      <Text style={s.rowV}>{v}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  scroll: { flex: 1 },
  container: { paddingHorizontal: spacing.md, paddingBottom: 140 },
  card: { backgroundColor: colors.card, borderRadius: 18, borderWidth: 1, borderColor: colors.line, padding: 16, marginBottom: 12 },
  lbl: { ...typography.eyebrow, marginBottom: 8 },
  big: { fontFamily: fonts.semibold, fontSize: 19, color: colors.text },
  body: { fontFamily: fonts.medium, fontSize: 15, color: colors.text },
  help: { fontFamily: fonts.regular, fontSize: 12, color: colors.textSecondary, marginTop: 4, lineHeight: 17 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, borderTopWidth: 1, borderTopColor: colors.line },
  rowK: { fontFamily: fonts.medium, fontSize: 14, color: colors.text },
  rowSub: { fontFamily: fonts.regular, fontSize: 11.5, color: colors.textTertiary, marginTop: 1 },
  rowV: { fontFamily: fonts.mono, fontSize: 15, color: colors.text },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999, backgroundColor: colors.input, borderWidth: 1, borderColor: colors.borderFocus },
  chipText: { fontFamily: fonts.mono, fontSize: 11, color: colors.accentLight },
  btn: { backgroundColor: colors.accent, borderRadius: radius.md, paddingVertical: 15, alignItems: 'center', marginTop: 4 },
  btnText: { fontFamily: fonts.semibold, fontSize: 15, color: colors.bg },
});
