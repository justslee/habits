/**
 * FoodPlanScreen — the 14-day strip with travel days greyed, meals spanning the days
 * they cover, and "cooked it / skipped" per meal (which feeds the learning loop).
 */

import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors, fonts, radius, spacing, typography } from '../../theme';
import { FoodPlan, completeCycle, getPlan, markCooked } from '../../api/client';
import { haptic } from '../../utils/haptics';
import ScreenBackground from '../../components/ScreenBackground';

const DOW = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function addDays(iso: string, n: number) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d + n);
  return dt.toISOString().slice(0, 10);
}

export default function FoodPlanScreen({ navigation, route }: any) {
  const cycleId: number = route.params.cycleId;
  const [plan, setPlan] = useState<FoodPlan | null>(null);

  const load = useCallback(() => { getPlan(cycleId).then(setPlan).catch(err => console.warn('plan load', err)); }, [cycleId]);
  useEffect(() => { load(); }, [load]);

  const cooked = useCallback(async (mealId: number, ok: boolean) => {
    ok ? haptic.success() : haptic.light();
    try { setPlan(await markCooked(cycleId, mealId, ok ? { cooked: true, rating: 1 } : { cooked: false })); }
    catch (err) { console.warn('cooked', err); }
  }, [cycleId]);

  const finish = useCallback(async () => {
    haptic.medium();
    try { await completeCycle(cycleId); navigation.popToTop(); }
    catch (err) { console.warn('complete', err); }
  }, [cycleId, navigation]);

  if (!plan) return <ScreenBackground><View style={s.center}><Text style={s.help}>Laying out the strip…</Text></View></ScreenBackground>;

  const { cycle } = plan;
  const travel = new Set(cycle.travel_days);
  const today = new Date().toISOString().slice(0, 10);
  const days = Array.from({ length: 14 }, (_, i) => {
    const iso = addDays(cycle.start_date, i);
    const meal = plan.meals.find(m => m.days_covered.includes(iso));
    return { iso, i, travel: travel.has(iso), meal, cook: meal?.cook_date === iso, today: iso === today };
  });
  const startDow = new Date(cycle.start_date + 'T00:00:00').getDay();

  const cell = (d: typeof days[number]) => (
    <View key={d.iso} style={[s.day, d.travel && s.dayTravel, d.cook && s.dayCook, d.today && s.dayToday]}>
      <Text style={s.dayD}>{DOW[(startDow + d.i) % 7]} {Number(d.iso.slice(-2))}</Text>
      {d.travel ? <Text style={s.dayTravelT}>✈</Text>
        : d.meal ? <View style={[s.dayMeal, { backgroundColor: `hsl(${d.meal.recipe.hue ?? 260} 55% 68%)` }]}><Text style={s.dayMealT} numberOfLines={2}>{d.cook ? '🍳 ' : ''}{d.meal.recipe.title.split(' ')[0]}</Text></View>
        : <Text style={s.dayOpen}>—</Text>}
    </View>
  );

  return (
    <ScreenBackground>
      <ScrollView contentContainerStyle={s.container}>
        <Text style={typography.eyebrow}>STEP 3 · {cycle.start_date} – {cycle.end_date}</Text>
        <Text style={s.title}>The next two weeks</Text>
        <View style={s.strip}>{days.slice(0, 7).map(cell)}</View>
        <View style={s.strip}>{days.slice(7).map(cell)}</View>

        <View style={s.card}>
          <Row k="Eating days" sub={`14 − ${cycle.travel_days.length} travel − ${cycle.eat_out_days} eat-out`} v={String(cycle.eating_days)} />
          <Row k="Covered by meals" sub={plan.open_days ? `${plan.open_days} open · eat out or keep one more` : 'fully covered'} v={String(plan.covered_days)} />
          <Row k="Cook sessions" sub="🍳 marks the cook day" v={String(plan.meals.length)} />
        </View>

        <Text style={[typography.eyebrow, { marginBottom: 8 }]}>MEALS</Text>
        {plan.meals.map(m => (
          <View key={m.id} style={s.meal}>
            <View style={{ flex: 1 }}>
              <Text style={s.mealT}>{m.recipe.title}</Text>
              <Text style={s.mealSub}>Cook {m.cook_date} · {m.days_covered.length} days · {m.recipe.reheat} · {m.recipe.protein_g_per_serving ?? '—'} g</Text>
            </View>
            {m.status === 'planned' ? (
              <View style={{ flexDirection: 'row', gap: 6 }}>
                <TouchableOpacity style={[s.mini, { borderColor: colors.success }]} onPress={() => cooked(m.id, true)}><Text style={[s.miniT, { color: colors.success }]}>Cooked 👍</Text></TouchableOpacity>
                <TouchableOpacity style={[s.mini, { borderColor: colors.line }]} onPress={() => cooked(m.id, false)}><Text style={s.miniT}>Skipped</Text></TouchableOpacity>
              </View>
            ) : (
              <Text style={[s.pill, { color: m.status === 'cooked' ? colors.success : colors.textTertiary }]}>{m.status.toUpperCase()}</Text>
            )}
          </View>
        ))}

        <TouchableOpacity style={s.btn} onPress={() => { haptic.medium(); navigation.navigate('FoodBags', { cycleId }); }} activeOpacity={0.9}>
          <Text style={s.btnText}>Build bags</Text>
        </TouchableOpacity>

        <TouchableOpacity style={s.ghost} onPress={() => navigation.navigate('FoodDeck', { cycleId })}><Text style={s.ghostText}>Back to the deck</Text></TouchableOpacity>
        <TouchableOpacity style={s.ghost} onPress={finish}><Text style={[s.ghostText, { color: colors.textTertiary }]}>Close this cycle</Text></TouchableOpacity>
        <View style={{ height: 120 }} />
      </ScrollView>
    </ScreenBackground>
  );
}

function Row({ k, sub, v }: { k: string; sub?: string; v: string }) {
  return (
    <View style={s.row}>
      <View style={{ flex: 1 }}><Text style={s.rowK}>{k}</Text>{sub ? <Text style={s.rowSub}>{sub}</Text> : null}</View>
      <Text style={s.rowV}>{v}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  container: { paddingHorizontal: spacing.md, paddingTop: spacing.md, paddingBottom: 140 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  title: { ...typography.serifLarge, marginTop: 4, marginBottom: 12 },
  help: { fontFamily: fonts.regular, fontSize: 12.5, color: colors.textSecondary, lineHeight: 17, marginTop: 6 },
  strip: { flexDirection: 'row', gap: 4, marginBottom: 4 },
  day: { flex: 1, minHeight: 60, borderRadius: 9, backgroundColor: colors.input, borderWidth: 1, borderColor: colors.line, padding: 4, alignItems: 'center' },
  dayTravel: { opacity: 0.55 },
  dayCook: { borderColor: colors.borderFocus },
  dayToday: { borderColor: colors.accent },
  dayD: { fontFamily: fonts.mono, fontSize: 9, color: colors.textTertiary, marginBottom: 3 },
  dayTravelT: { color: colors.textTertiary, fontSize: 12 },
  dayOpen: { color: colors.textTertiary, fontSize: 11 },
  dayMeal: { borderRadius: 5, paddingHorizontal: 3, paddingVertical: 3, width: '100%' },
  dayMealT: { fontFamily: fonts.semibold, fontSize: 8.5, color: colors.bg, textAlign: 'center' },
  card: { backgroundColor: colors.card, borderRadius: 18, borderWidth: 1, borderColor: colors.line, padding: 14, marginTop: 10, marginBottom: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.line },
  rowK: { fontFamily: fonts.medium, fontSize: 14, color: colors.text },
  rowSub: { fontFamily: fonts.regular, fontSize: 11.5, color: colors.textTertiary, marginTop: 1 },
  rowV: { fontFamily: fonts.mono, fontSize: 15, color: colors.text },
  meal: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.line, padding: 12, marginBottom: 8 },
  mealT: { fontFamily: fonts.semibold, fontSize: 14, color: colors.text },
  mealSub: { fontFamily: fonts.regular, fontSize: 11, color: colors.textTertiary, marginTop: 2 },
  mini: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 5 },
  miniT: { fontFamily: fonts.medium, fontSize: 11, color: colors.textSecondary },
  pill: { fontFamily: fonts.mono, fontSize: 9.5, letterSpacing: 1 },
  btn: { backgroundColor: colors.accent, borderRadius: radius.md, paddingVertical: 15, alignItems: 'center', marginTop: 12 },
  btnText: { fontFamily: fonts.semibold, fontSize: 15, color: colors.bg },
  ghost: { alignItems: 'center', paddingVertical: 10 },
  ghostText: { fontFamily: fonts.medium, fontSize: 13, color: colors.accentLight },
});
