/**
 * FoodSpendScreen — the ledger: this cycle vs the last six by store, per serving,
 * protein per dollar, budget line.
 */

import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, fonts, spacing, typography } from '../../theme';
import { SpendSummary, getSpend } from '../../api/client';
import ScreenBackground from '../../components/ScreenBackground';

const money = (n: number | null | undefined) => `$${(n ?? 0).toFixed(2)}`;
const STORE_COLOR: Record<string, string> = { hmart: colors.accent, wf: colors.info, weg: colors.warning };
const STORE_LABEL: Record<string, string> = { hmart: 'H Mart', wf: 'Whole Foods', weg: 'Wegmans' };

export default function FoodSpendScreen() {
  const [data, setData] = useState<SpendSummary | null>(null);
  useEffect(() => { getSpend().then(setData).catch(err => console.warn('spend', err)); }, []);

  if (!data) return <ScreenBackground><View style={s.center}><Text style={s.help}>Adding it up…</Text></View></ScreenBackground>;
  const cur = data.current;
  const max = Math.max(1, ...data.history.map(h => h.total), cur?.total ?? 0);

  return (
    <ScreenBackground>
      <ScrollView contentContainerStyle={s.container}>
        <Text style={typography.eyebrow}>LEDGER</Text>
        <Text style={s.title}>Spend</Text>

        <View style={s.card}>
          <Text style={typography.eyebrow}>THIS CYCLE</Text>
          <Text style={s.hero}>{money(cur?.total)}</Text>
          <Text style={s.help}>{money(cur?.goods)} groceries · {money(cur?.fees)} fees · {money(cur?.per_eating_day)} per eating day · {cur?.orders ?? 0} order{cur?.orders === 1 ? '' : 's'}</Text>
          <Row k="Per serving" sub="bag items allocated to the meals that used them" v={money(cur?.per_serving)} />
          <Row k="Protein per dollar" sub="what you're optimising for" v={cur?.protein_g_per_dollar != null ? `${cur.protein_g_per_dollar} g/$` : '—'} />
          <Row k="Budget line" sub={`${money(data.budget_per_cycle)} per cycle`} v={cur ? `${cur.vs_budget >= 0 ? '−' : '+'}${money(Math.abs(cur.vs_budget))}` : '—'} color={cur && cur.vs_budget < 0 ? colors.warning : colors.success} />
        </View>

        {cur && cur.per_meal.length > 0 && (
          <View style={s.card}>
            <Text style={typography.eyebrow}>PER MEAL</Text>
            {cur.per_meal.map(m => <Row key={m.meal_id} k={m.title} sub={`${money(m.per_serving)} per serving${m.protein_g_per_dollar != null ? ` · ${m.protein_g_per_dollar} g/$` : ''}`} v={money(m.cost)} />)}
          </View>
        )}

        <View style={s.card}>
          <Text style={typography.eyebrow}>LAST CYCLES · BY STORE</Text>
          <View style={s.legend}>
            {Object.keys(STORE_LABEL).map(k => <Text key={k} style={s.legendT}><Text style={{ color: STORE_COLOR[k] }}>■</Text> {STORE_LABEL[k]}</Text>)}
          </View>
          <View style={s.chart}>
            {data.history.map(h => (
              <View key={h.cycle_id} style={s.col}>
                <View style={s.colBars}>
                  {Object.entries(h.by_store).map(([st, v]) => <View key={st} style={{ height: `${(v / max) * 100}%`, backgroundColor: STORE_COLOR[st] || colors.textTertiary }} />)}
                  {h.fees > 0 && <View style={{ height: `${(h.fees / max) * 100}%`, backgroundColor: colors.line }} />}
                </View>
                <Text style={s.colL}>{h.label}</Text>
              </View>
            ))}
            {!data.history.length && <Text style={s.help}>No completed cycles yet.</Text>}
          </View>
          <Row k="Average per cycle" v={money(data.average_total)} />
        </View>
        <View style={{ height: 120 }} />
      </ScrollView>
    </ScreenBackground>
  );
}

function Row({ k, sub, v, color }: { k: string; sub?: string; v: string; color?: string }) {
  return (
    <View style={s.row}>
      <View style={{ flex: 1 }}><Text style={s.rowK}>{k}</Text>{sub ? <Text style={s.rowSub}>{sub}</Text> : null}</View>
      <Text style={[s.rowV, color ? { color } : null]}>{v}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  container: { paddingHorizontal: spacing.md, paddingTop: spacing.md, paddingBottom: 140 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  title: { ...typography.serifLarge, marginTop: 4, marginBottom: 12 },
  help: { fontFamily: fonts.regular, fontSize: 12.5, color: colors.textSecondary, lineHeight: 17, marginTop: 6 },
  card: { backgroundColor: colors.card, borderRadius: 18, borderWidth: 1, borderColor: colors.line, padding: 14, marginBottom: 12 },
  hero: { fontFamily: fonts.monoMedium, fontSize: 40, letterSpacing: -1.5, color: colors.text, marginTop: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.line, marginTop: 4 },
  rowK: { fontFamily: fonts.medium, fontSize: 14, color: colors.text },
  rowSub: { fontFamily: fonts.regular, fontSize: 11, color: colors.textTertiary, marginTop: 1 },
  rowV: { fontFamily: fonts.mono, fontSize: 14, color: colors.text },
  legend: { flexDirection: 'row', gap: 12, marginTop: 8, marginBottom: 6 },
  legendT: { fontFamily: fonts.mono, fontSize: 10, color: colors.textSecondary },
  chart: { flexDirection: 'row', gap: 8, height: 130, alignItems: 'flex-end', marginBottom: 6 },
  col: { flex: 1, height: '100%', justifyContent: 'flex-end' },
  colBars: { flex: 1, justifyContent: 'flex-end', gap: 2 },
  colL: { fontFamily: fonts.mono, fontSize: 9, color: colors.textTertiary, textAlign: 'center', marginTop: 4 },
});
