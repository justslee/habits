/**
 * FoodPantryScreen — gone / some / plenty per ingredient. Pre-filled from shelf life.
 * Saves on Continue and hands off to the deck when a cycle is in progress.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors, fonts, radius, spacing, typography } from '../../theme';
import { PantryEntry, getPantry, putPantry } from '../../api/client';
import { haptic } from '../../utils/haptics';
import ScreenBackground from '../../components/ScreenBackground';

const STATES: PantryEntry['state'][] = ['gone', 'some', 'plenty'];
const STATE_COLOR: Record<PantryEntry['state'], string> = { gone: colors.error, some: colors.accent, plenty: colors.success };

export default function FoodPantryScreen({ navigation, route }: any) {
  const cycleId: number | undefined = route?.params?.cycleId;
  const [items, setItems] = useState<PantryEntry[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => { getPantry().then(setItems).catch(err => console.warn('pantry load', err)); }, []);

  const set = useCallback((id: number, state: PantryEntry['state']) => {
    haptic.selection();
    setItems(prev => prev.map(p => (p.ingredient_id === id ? { ...p, state } : p)));
  }, []);

  const save = useCallback(async () => {
    haptic.medium();
    setSaving(true);
    try {
      await putPantry(items.map(p => ({ ingredient_id: p.ingredient_id, state: p.state })));
      if (cycleId) navigation.replace('FoodDeck', { cycleId });
      else navigation.goBack();
    } catch (err) {
      console.warn('pantry save', err);
    } finally {
      setSaving(false);
    }
  }, [items, cycleId, navigation]);

  return (
    <ScreenBackground>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={s.container}>
        <Text style={typography.eyebrow}>STEP 1 · LAST BAG + STAPLES</Text>
        <Text style={s.title}>What's still here?</Text>
        <Text style={s.help}>Pre-filled from shelf life. Tap to correct. Plenty means skip it this cycle, some means buy half.</Text>
        <View style={s.card}>
          {items.map((p, i) => (
            <View key={p.ingredient_id} style={[s.row, i > 0 && { borderTopWidth: 1, borderTopColor: colors.line }]}>
              <View style={{ flex: 1 }}>
                <Text style={s.name}>{p.name}</Text>
                <Text style={s.sub}>{p.shelf_stable ? 'shelf-stable' : 'perishable'}{p.last_confirmed ? ` · confirmed ${p.last_confirmed}` : ''}</Text>
              </View>
              <View style={s.seg}>
                {STATES.map(st => {
                  const on = p.state === st;
                  return (
                    <TouchableOpacity key={st} onPress={() => set(p.ingredient_id, st)} style={[s.segBtn, on && { backgroundColor: STATE_COLOR[st], borderColor: STATE_COLOR[st] }]}>
                      <Text style={[s.segText, on && { color: colors.bg }]}>{st}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          ))}
          {!items.length && <Text style={s.help}>Loading pantry…</Text>}
        </View>
        <TouchableOpacity style={s.btn} onPress={save} disabled={saving || !items.length} activeOpacity={0.9}>
          <Text style={s.btnText}>{saving ? 'Saving…' : cycleId ? 'Continue to meals' : 'Save'}</Text>
        </TouchableOpacity>
        <View style={{ height: 120 }} />
      </ScrollView>
    </ScreenBackground>
  );
}

const s = StyleSheet.create({
  container: { paddingHorizontal: spacing.md, paddingTop: spacing.md, paddingBottom: 140 },
  title: { ...typography.serifLarge, marginTop: 4, marginBottom: 6 },
  help: { fontFamily: fonts.regular, fontSize: 13, color: colors.textSecondary, lineHeight: 18, marginBottom: 14 },
  card: { backgroundColor: colors.card, borderRadius: 18, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 14, marginBottom: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  name: { fontFamily: fonts.medium, fontSize: 14, color: colors.text },
  sub: { fontFamily: fonts.regular, fontSize: 11, color: colors.textTertiary, marginTop: 1 },
  seg: { flexDirection: 'row', gap: 4 },
  segBtn: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: 999, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.input },
  segText: { fontFamily: fonts.mono, fontSize: 10, color: colors.textTertiary, textTransform: 'uppercase', letterSpacing: 0.5 },
  btn: { backgroundColor: colors.accent, borderRadius: radius.md, paddingVertical: 15, alignItems: 'center' },
  btnText: { fontFamily: fonts.semibold, fontSize: 15, color: colors.bg },
});
