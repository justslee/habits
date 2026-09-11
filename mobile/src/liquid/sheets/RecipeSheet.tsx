/**
 * A recipe in full: what goes in it, how it is made, and how it keeps.
 *
 * Ingredients and quantities come from the discovery pass. The method is fetched once from the
 * recipe's own source page and kept, so it is labelled as a summary and always carries a link to
 * the original. Nothing here is invented: if the source cannot be read, the sheet says so rather
 * than filling in a plausible method.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Linking, Pressable, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { FoodRecipe, fetchRecipeMethod } from '../../api/client';
import { useTheme } from '../theme';
import { fonts } from '../tokens';
import { feel } from '../haptics';
import { Body, Eyebrow, Small } from '../ui/Text';
import { Button } from '../ui/Button';
import { DetailRow, Notice, Section } from '../ui/Surfaces';
import { useToast } from '../ui/Toast';
import { prettyDate } from '../ui/Chart';

/** Sources often number their own steps; the list already does, so drop the duplicate. */
const unnumber = (step: string) => step.replace(/^\s*\d+\s*[.)]\s*/, '');
const title = (v?: string | null) => (v ? v.replace(/^./, ch => ch.toUpperCase()) : '');

const amount = (q: number | null, u: string | null) =>
  q == null ? (u ?? '') : `${Number.isInteger(q) ? q : q.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')}${u ? ` ${u}` : ''}`;

export function RecipeSheet({ recipe: initial }: { recipe: FoodRecipe }) {
  const { c } = useTheme();
  const toast = useToast();
  const [recipe, setRecipe] = useState<FoodRecipe>(initial);
  const [busy, setBusy] = useState(false);
  const method = recipe.method;
  // A recipe you wrote down yourself has no source to summarise from or defer to.
  const ownRecipe = !recipe.source_url && (!recipe.source_site || recipe.source_site === 'own');

  const load = useCallback(async (refresh = false) => {
    setBusy(true);
    try {
      const full = await fetchRecipeMethod(recipe.id, refresh);
      setRecipe(full);
      if (!full.method?.steps?.length) toast.show('The source page could not be read.');
      else feel.light();
    } catch (err: any) {
      toast.show(String(err?.message ?? err).replace(/^API \d+: /, '').slice(0, 120));
    } finally { setBusy(false); }
  }, [recipe.id, toast]);

  // Fetch the method the first time this recipe is opened, then it is cached server-side.
  useEffect(() => {
    if (!initial.method?.steps?.length && !ownRecipe) load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const provenance = ownRecipe
    ? 'Your own recipe, as you recorded it.'
    : method?.source_note
      ? `${method.source_note} The method is a summary; the original is the recipe.`
      : `Quantities as recorded from ${title(recipe.source_site) || 'the source'}.`;

  const essential = recipe.ingredients.filter(i => i.essential);
  const optional = recipe.ingredients.filter(i => !i.essential);

  return (
    <View>
      <Small>
        {[title(recipe.cuisine), title(recipe.protein_source)].filter(Boolean).join(' · ') || 'Recipe'}
        {recipe.rating ? ` · ${recipe.rating.toFixed(1)}★` : ''}
      </Small>

      <View style={s.stats}>
        <Stat value={`${recipe.prep_minutes}`} unit="min" label="hands on" />
        <Stat value={`${recipe.total_minutes}`} unit="min" label="in total" />
        <Stat value={`${recipe.servings}`} label="servings" />
        <Stat
          value={recipe.protein_g_per_serving ? `${Math.round(recipe.protein_g_per_serving)}` : '—'}
          unit={recipe.protein_g_per_serving ? 'g' : undefined}
          label="protein each"
        />
      </View>

      {recipe.times_cooked ? (
        <Small style={{ color: c.accent }}>
          Cooked {recipe.times_cooked} time{recipe.times_cooked === 1 ? '' : 's'}
          {recipe.last_cooked ? `, last on ${prettyDate(recipe.last_cooked)}` : ''}
          {recipe.user_rating ? ` · you rated it ${recipe.user_rating}/5` : ''}
        </Small>
      ) : (
        <Small>Not cooked yet.</Small>
      )}

      <Section title="What goes in" trailing={<Small>{recipe.ingredients.length} things</Small>} />
      {essential.map((i, n) => (
        <DetailRow
          key={i.id}
          label={i.name}
          sub={i.essential_reason ?? undefined}
          value={amount(i.quantity, i.unit)}
          last={n === essential.length - 1 && !optional.length}
        />
      ))}
      {optional.length ? (
        <>
          <Small style={{ marginTop: 14, marginBottom: 2 }}>Nice to have, not needed</Small>
          {optional.map((i, n) => (
            <DetailRow key={i.id} label={i.name} value={amount(i.quantity, i.unit)} last={n === optional.length - 1} />
          ))}
        </>
      ) : null}

      <Section
        title="How to make it"
        trailing={method?.steps?.length ? <Small>{method.steps.length} steps</Small> : null}
      />
      {busy && !method?.steps?.length ? (
        <Body>Reading the method from {title(recipe.source_site) || 'the source'}…</Body>
      ) : method?.steps?.length ? (
        <>
          {method.steps.map((step, i) => (
            <View key={i} style={s.step}>
              <Animated.Text style={[s.stepNum, { color: c.accent }]}>{String(i + 1).padStart(2, '0')}</Animated.Text>
              <Body style={{ flex: 1, color: c.fg, lineHeight: 20 }}>{unnumber(step)}</Body>
            </View>
          ))}
          {method.equipment?.length ? (
            <Small style={{ marginTop: 10 }}>You'll want: {method.equipment.join(', ')}.</Small>
          ) : null}
        </>
      ) : (
        <Notice icon="alert-circle-outline">
          {ownRecipe
            ? 'No method written down yet. Add the steps the next time you cook it.'
            : recipe.source_url
              ? 'No method saved yet. Open the original below, or try again.'
              : 'No method saved yet. This recipe has no source page to read.'}
        </Notice>
      )}

      <Section title="Keeping it" />
      <DetailRow label="Reheat" value={title(recipe.reheat)} />
      <DetailRow label="Keeps" value={`about ${recipe.prep_days} days`} last={!method?.make_ahead} />
      {method?.make_ahead ? <Body style={{ marginTop: 12 }}>{method.make_ahead}</Body> : null}

      {recipe.notes ? (
        <>
          <Section title="Why this one" />
          <Body>{recipe.notes}</Body>
        </>
      ) : null}

      {recipe.source_url ? (
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={`Open the original recipe on ${title(recipe.source_site) || 'its source'}`}
          onPress={() => { feel.selection(); Linking.openURL(recipe.source_url!); }}
          style={s.source}
        >
          <Ionicons name="open-outline" size={15} color={c.accent} />
          <Small style={{ color: c.accent, flex: 1 }}>
            Read the original on {title(recipe.source_site) || 'the source site'}
          </Small>
        </Pressable>
      ) : null}
      <Small style={{ marginTop: 10 }}>{provenance}</Small>
      {method?.steps?.length ? (
        <Button full kind="quiet" label={busy ? 'Re-reading…' : 'Re-read the method'} disabled={busy} onPress={() => load(true)} />
      ) : recipe.source_url ? (
        <Button full kind="quiet" label={busy ? 'Reading…' : 'Try again'} disabled={busy} onPress={() => load(true)} />
      ) : null}
    </View>
  );
}

function Stat({ value, unit, label }: { value: string; unit?: string; label: string }) {
  const { c } = useTheme();
  return (
    <View style={{ flex: 1, minWidth: 70 }}>
      <Animated.Text style={[s.statValue, { color: c.fg }]}>
        {value}
        {unit ? <Animated.Text style={[s.statUnit, { color: c.muted }]}> {unit}</Animated.Text> : null}
      </Animated.Text>
      <Small>{label}</Small>
    </View>
  );
}

const s = StyleSheet.create({
  stats: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 14, gap: 10, marginTop: 16, marginBottom: 12 },
  statValue: { fontFamily: fonts.serif, fontSize: 26, lineHeight: 30 },
  statUnit: { fontFamily: fonts.serif, fontSize: 15 },
  step: { flexDirection: 'row', gap: 12, paddingVertical: 9 },
  stepNum: { fontFamily: fonts.serif, fontSize: 17, width: 26, lineHeight: 22 },
  source: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 18, minHeight: 44 },
});
