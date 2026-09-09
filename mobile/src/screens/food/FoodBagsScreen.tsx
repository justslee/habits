/**
 * FoodBagsScreen — per-store bags: items, packs, subtotal vs minimum, waste warnings,
 * budget line. Approve to hand the bag set to the cart builder.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors, fonts, radius, spacing, typography } from '../../theme';
import { Bag, BagsResponse, approveBags, buildBags, getBags } from '../../api/client';
import { haptic } from '../../utils/haptics';
import ScreenBackground from '../../components/ScreenBackground';

const money = (n: number) => `$${n.toFixed(2)}`;

export default function FoodBagsScreen({ navigation, route }: any) {
  const cycleId: number = route.params.cycleId;
  const [data, setData] = useState<BagsResponse | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (rebuild = false) => {
    try {
      const existing = rebuild ? null : await getBags(cycleId);
      setData(existing && existing.bags.length ? existing : await buildBags(cycleId));
    } catch (err) {
      console.warn('bags', err);
    }
  }, [cycleId]);

  useEffect(() => { load(); }, [load]);

  const approve = useCallback(async () => {
    haptic.medium();
    setBusy(true);
    try {
      setData(await approveBags(cycleId));
      navigation.navigate('FoodCarts', { cycleId });
    } catch (err) {
      console.warn('approve bags', err);
    } finally {
      setBusy(false);
    }
  }, [cycleId, navigation]);

  if (!data) return <ScreenBackground><View style={s.center}><Text style={s.help}>Building bags…</Text></View></ScreenBackground>;

  const approved = data.bags.every(b => b.status !== 'proposed');

  return (
    <ScreenBackground>
      <ScrollView contentContainerStyle={s.container}>
        <Text style={typography.eyebrow}>STEP 4 · {data.store_count} STORE{data.store_count === 1 ? '' : 'S'} · {money(data.total)} INCL. FEES</Text>
        <Text style={s.title}>Bags</Text>

        {data.bags.map(b => <BagCard key={b.id} bag={b} />)}

        <View style={s.card}>
          <Row k="Groceries" v={money(data.goods_total)} />
          <Row k="Delivery fees" v={money(data.fees_total)} />
          <Row k="Total" v={money(data.total)} bold />
          <Row k={`Budget line ${money(data.budget_per_cycle)}`} v={data.over_budget > 0 ? `over by ${money(data.over_budget)}` : `under by ${money(data.budget_per_cycle - data.total)}`} color={data.over_budget > 0 ? colors.warning : colors.success} />
        </View>

        <TouchableOpacity style={s.btn} onPress={approve} disabled={busy || approved} activeOpacity={0.9}>
          <Text style={s.btnText}>{approved ? 'Bags approved ✓' : busy ? 'Approving…' : 'Approve bags · build carts'}</Text>
        </TouchableOpacity>
        {approved && (
          <TouchableOpacity style={s.ghost} onPress={() => navigation.navigate('FoodCarts', { cycleId })}><Text style={s.ghostText}>Go to carts</Text></TouchableOpacity>
        )}
        <TouchableOpacity style={s.ghost} onPress={() => { haptic.light(); load(true); }}><Text style={[s.ghostText, { color: colors.textTertiary }]}>Rebuild from the plan and pantry</Text></TouchableOpacity>
        <View style={{ height: 120 }} />
      </ScrollView>
    </ScreenBackground>
  );
}

function BagCard({ bag }: { bag: Bag }) {
  const pct = bag.minimum ? Math.min(1, bag.goods_total / bag.minimum) : 1;
  return (
    <View style={s.card}>
      <View style={s.bagHead}>
        <Text style={s.bagName}>{bag.name}</Text>
        <Text style={s.bagMeta}>{money(bag.goods_total)} / min {money(bag.minimum)}{bag.delivery_fee ? ` · fee ${money(bag.delivery_fee)}` : ' · free delivery'}</Text>
      </View>
      <View style={s.bar}><View style={[s.barFill, { width: `${pct * 100}%`, backgroundColor: bag.short ? colors.warning : colors.accent }]} /></View>
      {bag.short && <Text style={[s.help, { color: colors.warning, marginBottom: 6 }]}>Short of the minimum by {money(bag.shortfall)}. Add staples here or move items.</Text>}
      {bag.items.map((it, i) => (
        <View key={it.ingredient_id} style={[s.row, i > 0 && { borderTopWidth: 1, borderTopColor: colors.line }]}>
          <View style={{ flex: 1 }}>
            <Text style={s.rowK}>{it.name}{it.packs > 1 ? ` ×${it.packs}` : ''}</Text>
            <Text style={s.rowSub}>{it.pack_label} · used in {it.uses} meal{it.uses === 1 ? '' : 's'}{it.moved_from ? ` · moved from ${it.moved_from}` : ''}</Text>
            {it.waste_note ? <Text style={[s.rowSub, { color: colors.warning }]}>{it.waste_note}</Text> : null}
          </View>
          <Text style={s.rowV}>{money(it.line_total)}</Text>
        </View>
      ))}
      {bag.projected_waste > 0 && <Text style={s.help}>Projected waste {money(bag.projected_waste)}</Text>}
    </View>
  );
}

function Row({ k, v, bold, color }: { k: string; v: string; bold?: boolean; color?: string }) {
  return (
    <View style={s.row}>
      <Text style={[s.rowK, bold && { fontFamily: fonts.semibold }]}>{k}</Text>
      <Text style={[s.rowV, color ? { color } : null, bold && { fontFamily: fonts.monoMedium }]}>{v}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  container: { paddingHorizontal: spacing.md, paddingTop: spacing.md, paddingBottom: 140 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  title: { ...typography.serifLarge, marginTop: 4, marginBottom: 12 },
  help: { fontFamily: fonts.regular, fontSize: 12.5, color: colors.textSecondary, lineHeight: 17, marginTop: 6 },
  card: { backgroundColor: colors.card, borderRadius: 18, borderWidth: 1, borderColor: colors.line, padding: 14, marginBottom: 12 },
  bagHead: { marginBottom: 6 },
  bagName: { fontFamily: fonts.semibold, fontSize: 15, color: colors.text },
  bagMeta: { fontFamily: fonts.mono, fontSize: 11, color: colors.textTertiary, marginTop: 2 },
  bar: { height: 5, borderRadius: 3, backgroundColor: colors.input, overflow: 'hidden', marginBottom: 8 },
  barFill: { height: 5 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  rowK: { fontFamily: fonts.medium, fontSize: 14, color: colors.text },
  rowSub: { fontFamily: fonts.regular, fontSize: 11, color: colors.textTertiary, marginTop: 1 },
  rowV: { fontFamily: fonts.mono, fontSize: 14, color: colors.text },
  btn: { backgroundColor: colors.accent, borderRadius: radius.md, paddingVertical: 15, alignItems: 'center', marginTop: 4 },
  btnText: { fontFamily: fonts.semibold, fontSize: 15, color: colors.bg },
  ghost: { alignItems: 'center', paddingVertical: 10 },
  ghostText: { fontFamily: fonts.medium, fontSize: 13, color: colors.accentLight },
});
