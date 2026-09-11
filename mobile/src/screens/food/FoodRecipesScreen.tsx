/**
 * FoodRecipesScreen — the catalogue: proven, candidates, retired. Find new recipes on the
 * web (Maangchi and Just One Cookbook first). Retire or restore by hand; flip essentials.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Linking, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { colors, fonts, radius, spacing, typography } from '../../theme';
import { DiscoverResult, FoodRecipe, discoverRecipes, getFoodRecipes, getFoodSettings, patchEssential, patchFoodSettings, patchRecipe } from '../../api/client';
import { haptic } from '../../utils/haptics';
import ScreenBackground from '../../components/ScreenBackground';

const STATUS_COLOR = { proven: colors.success, candidate: colors.accentLight, retired: colors.textTertiary } as const;

export default function FoodRecipesScreen() {
  const [recipes, setRecipes] = useState<FoodRecipe[]>([]);
  const [open, setOpen] = useState<number | null>(null);
  const [finding, setFinding] = useState(false);
  const [last, setLast] = useState<DiscoverResult | null>(null);
  const [brief, setBrief] = useState('');
  const [briefSaved, setBriefSaved] = useState('');

  const load = useCallback(() => { getFoodRecipes().then(setRecipes).catch(err => console.warn('recipes', err)); }, []);
  useEffect(() => { load(); getFoodSettings().then(s => { setBrief(s.discovery_prompt || ''); setBriefSaved(s.discovery_prompt || ''); }).catch(() => {}); }, [load]);

  const saveBrief = useCallback(async () => {
    try { const s = await patchFoodSettings({ discovery_prompt: brief }); setBriefSaved(s.discovery_prompt || ''); haptic.success(); } catch (err) { console.warn(err); }
  }, [brief]);

  const find = useCallback(async () => {
    haptic.medium();
    setFinding(true);
    try {
      const out = await discoverRecipes(6);
      setLast(out);
      load();
      haptic.success();
    } catch (err: any) {
      Alert.alert('Discovery failed', String(err?.message || err));
    } finally {
      setFinding(false);
    }
  }, [load]);

  const setStatus = useCallback(async (r: FoodRecipe, status: FoodRecipe['status']) => {
    haptic.light();
    try { const u = await patchRecipe(r.id, { status }); setRecipes(prev => prev.map(x => (x.id === u.id ? u : x))); } catch (err) { console.warn(err); }
  }, []);

  const flip = useCallback(async (r: FoodRecipe, riId: number, essential: boolean) => {
    haptic.selection();
    try { const u = await patchEssential(r.id, riId, essential); setRecipes(prev => prev.map(x => (x.id === u.id ? u : x))); } catch (err) { console.warn(err); }
  }, []);

  const groups: [string, FoodRecipe[]][] = [
    ['PROVEN', recipes.filter(r => r.status === 'proven')],
    ['NEW CANDIDATES', recipes.filter(r => r.status === 'candidate')],
    ['RETIRED', recipes.filter(r => r.status === 'retired')],
  ];

  return (
    <ScreenBackground>
      <ScrollView contentContainerStyle={s.container}>
        <Text style={typography.eyebrow}>{recipes.length} RECIPES · MAANGCHI AND JUST ONE COOKBOOK FIRST</Text>
        <Text style={s.title}>Recipes</Text>

        <View style={s.card}>
          <Text style={typography.eyebrow}>WHAT TO LOOK FOR · YOUR STANDING BRIEF</Text>
          <TextInput
            value={brief}
            onChangeText={setBrief}
            multiline
            placeholder="e.g. more Japanese this month, dishes like the ones at Cote, no seafood, one-pot only…"
            placeholderTextColor={colors.textTertiary}
            style={s.input}
          />
          {brief !== briefSaved && <TouchableOpacity style={s.ghostBtn} onPress={saveBrief}><Text style={s.ghostBtnT}>Save brief</Text></TouchableOpacity>}
        </View>
        <TouchableOpacity style={s.btn} onPress={find} disabled={finding} activeOpacity={0.9}>
          <Text style={s.btnText}>{finding ? 'Searching the web…' : 'Find new recipes'}</Text>
        </TouchableOpacity>
        <Text style={s.help}>The model searches the web with your brief and taste profile, reads the pages, and returns recipes normalised for the planner: ≤ 12 essential ingredients, ≤ 90 minutes, batchable. New ones join the deck at 30 %.</Text>
        {last && (
          <View style={s.card}>
            <Text style={typography.eyebrow}>LAST SEARCH · {last.checked} PAGES CHECKED · {last.skipped} SKIPPED</Text>
            {last.added.length ? last.added.map(a => <Text key={a.id} style={s.body}>+ {a.title} <Text style={s.sub}>· {a.source}{a.rating ? ` · ${a.rating.toFixed(1)}` : ''} · {a.ingredients} ingredients</Text></Text>) : <Text style={s.sub}>Nothing new that fits. Try again next week; the search follows your taste profile.</Text>}
            {(last.log || []).filter(l => l.outcome !== 'added').slice(0, 8).map((l, i) => (
              <Text key={i} style={s.sub}>{l.outcome} · {l.title || l.url.replace(/^https?:\/\/(www\.)?/, '').slice(0, 48)}{l.detail ? ` · ${l.detail}` : ''}</Text>
            ))}
          </View>
        )}

        {groups.map(([label, list]) => list.length > 0 && (
          <View key={label}>
            <Text style={[typography.eyebrow, { marginTop: 14, marginBottom: 8 }]}>{label} · {list.length}</Text>
            {list.map(r => (
              <View key={r.id} style={s.card}>
                <TouchableOpacity onPress={() => setOpen(open === r.id ? null : r.id)} activeOpacity={0.85} style={s.head}>
                  <View style={[s.swatch, { backgroundColor: `hsl(${r.hue ?? 260} 45% 35%)` }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={s.body}>{r.title}</Text>
                    <Text style={s.sub}>{r.source_site || 'own'}{r.rating ? ` · ${r.rating.toFixed(1)}` : ''} · {r.total_minutes} min · {r.protein_g_per_serving ?? '—'} g · keeps {r.prep_days}d · {r.reheat}{r.times_cooked ? ` · cooked ${r.times_cooked}×` : ''}</Text>
                  </View>
                  <Text style={[s.pill, { color: STATUS_COLOR[r.status] }]}>{r.status.toUpperCase()}</Text>
                </TouchableOpacity>
                {open === r.id && (
                  <View style={{ marginTop: 10 }}>
                    <Text style={[typography.eyebrow, { marginBottom: 6 }]}>INGREDIENTS · TAP TO FLIP ESSENTIAL</Text>
                    <View style={s.chips}>
                      {r.ingredients.map(i => (
                        <TouchableOpacity key={i.id} onPress={() => flip(r, i.id, !i.essential)} style={[s.chip, i.essential && s.chipEss]}>
                          <Text style={[s.chipText, i.essential && { color: colors.accentLight }]}>{i.name}{i.quantity ? ` · ${i.quantity}${i.unit ? ' ' + i.unit : ''}` : ''}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                    {r.ingredients.some(i => i.essential_reason) && <Text style={s.sub}>{r.ingredients.filter(i => i.essential && i.essential_reason).map(i => `${i.name}: ${i.essential_reason}`).join(' · ')}</Text>}
                    <View style={{ flexDirection: 'row', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                      {r.source_url && <TouchableOpacity style={s.ghostBtn} onPress={() => Linking.openURL(r.source_url!)}><Text style={s.ghostBtnT}>Open recipe</Text></TouchableOpacity>}
                      {r.status !== 'retired' && <TouchableOpacity style={s.ghostBtn} onPress={() => setStatus(r, 'retired')}><Text style={[s.ghostBtnT, { color: colors.error }]}>Retire</Text></TouchableOpacity>}
                      {r.status === 'retired' && <TouchableOpacity style={s.ghostBtn} onPress={() => setStatus(r, 'candidate')}><Text style={s.ghostBtnT}>Restore</Text></TouchableOpacity>}
                      {r.status === 'candidate' && <TouchableOpacity style={s.ghostBtn} onPress={() => setStatus(r, 'proven')}><Text style={[s.ghostBtnT, { color: colors.success }]}>Mark proven</Text></TouchableOpacity>}
                    </View>
                  </View>
                )}
              </View>
            ))}
          </View>
        ))}
        <View style={{ height: 120 }} />
      </ScrollView>
    </ScreenBackground>
  );
}

const s = StyleSheet.create({
  container: { paddingHorizontal: spacing.md, paddingTop: spacing.md, paddingBottom: 140 },
  title: { ...typography.serifLarge, marginTop: 4, marginBottom: 12 },
  body: { fontFamily: fonts.medium, fontSize: 14.5, color: colors.text },
  sub: { fontFamily: fonts.regular, fontSize: 11.5, color: colors.textTertiary, marginTop: 2, lineHeight: 16 },
  help: { fontFamily: fonts.regular, fontSize: 12.5, color: colors.textSecondary, lineHeight: 17, marginTop: 8, marginBottom: 6 },
  card: { backgroundColor: colors.card, borderRadius: 16, borderWidth: 1, borderColor: colors.line, padding: 12, marginBottom: 8 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  swatch: { width: 34, height: 34, borderRadius: 10 },
  pill: { fontFamily: fonts.mono, fontSize: 9, letterSpacing: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginBottom: 6 },
  chip: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, backgroundColor: colors.input, borderWidth: 1, borderColor: colors.line },
  chipEss: { borderColor: colors.borderFocus },
  chipText: { fontFamily: fonts.regular, fontSize: 11, color: colors.textSecondary },
  input: { backgroundColor: colors.input, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 10, color: colors.text, fontFamily: fonts.regular, fontSize: 13, minHeight: 70, marginTop: 8, textAlignVertical: 'top' },
  btn: { backgroundColor: colors.accent, borderRadius: radius.md, paddingVertical: 14, alignItems: 'center' },
  btnText: { fontFamily: fonts.semibold, fontSize: 15, color: colors.bg },
  ghostBtn: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: colors.accentMuted },
  ghostBtnT: { fontFamily: fonts.semibold, fontSize: 12, color: colors.accentLight },
});
