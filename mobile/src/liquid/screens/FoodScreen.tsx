/**
 * Food — one coherent journey rather than ten screens.
 *
 * pantry → meal deck → coverage → store comparison → cart review → approval. Each stage shows
 * where you are and offers a real way back; detail opens in sheets. The deck stops when there
 * is enough food, not after a fixed number of cards.
 *
 * Payment is a product boundary: building a cart, reviewing the exact basket, and approving it
 * are separate deliberate steps, and approval is bound to one reviewed basket by the server.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as LocalAuthentication from 'expo-local-authentication';
import {
  Bag, BagsResponse, CartTask, FoodCycle, FoodDeck, FoodPlan, FoodRecipe, PantryEntry, SpendSummary,
  approveBags, approveCart, buildBags, buildPlan, createCycle, getBags, getCarts, getCurrentCycle,
  getDeck, getFoodRecipes, getPantry, getPlan, getSpend, placeCart, putPantry, runCart, swipeCard,
} from '../../api/client';
import { useTheme } from '../theme';
import { useRefreshOn } from '../refresh';
import { fonts, gesture, radius } from '../tokens';
import { T, m } from '../motion';
import { feel } from '../haptics';
import { Screen } from '../ui/Screen';
import { Body, Em, Eyebrow, Small, Subtitle, Title } from '../ui/Text';
import { Button, InlineButton, Options } from '../ui/Button';
import { Badge, CalendarNote, Coverage, DetailRow, FlowTop, Notice, Panel, Section, TopBar } from '../ui/Surfaces';
import { Bowl } from '../ui/Sculpture';
import { useSheet } from '../ui/Sheet';
import { useToast } from '../ui/Toast';
import { prettyDate } from '../ui/Chart';
import { RecipeSheet } from '../sheets/RecipeSheet';

type Stage = 'home' | 'pantry' | 'deck' | 'plan' | 'bags' | 'review' | 'receipt' | 'spend' | 'book';
const PANTRY_STATES: PantryEntry['state'][] = ['plenty', 'some', 'gone'];
const PANTRY_LABEL: Record<string, string> = { plenty: 'Have', some: 'Low', gone: 'Need' };
const money = (n: number) => `$${n.toFixed(2)}`;

export default function FoodScreen({ navigation }: any) {
  const { c } = useTheme();
  const toast = useToast();
  const [stage, setStage] = useState<Stage>('home');
  const [cycle, setCycle] = useState<FoodCycle | null>(null);
  const [deck, setDeck] = useState<FoodDeck | null>(null);
  const [plan, setPlan] = useState<FoodPlan | null>(null);
  const [pantry, setPantry] = useState<PantryEntry[]>([]);
  const [bags, setBags] = useState<BagsResponse | null>(null);
  const [carts, setCarts] = useState<CartTask[]>([]);
  const [spend, setSpend] = useState<SpendSummary | null>(null);
  const [recipes, setRecipes] = useState<FoodRecipe[]>([]);
  const [store, setStore] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const cy = await getCurrentCycle().catch(() => null);
    setCycle(cy);
    const [sp, pa, rc] = await Promise.allSettled([getSpend(), getPantry(), getFoodRecipes()]);
    if (sp.status === 'fulfilled') setSpend(sp.value);
    if (pa.status === 'fulfilled') setPantry(pa.value);
    if (rc.status === 'fulfilled') setRecipes(rc.value);
    if (!cy) return;
    const [dk, pl, bg, ct] = await Promise.allSettled([
      getDeck(cy.id), getPlan(cy.id), getBags(cy.id), getCarts(cy.id),
    ]);
    if (dk.status === 'fulfilled') setDeck(dk.value);
    if (pl.status === 'fulfilled') setPlan(pl.value);
    if (bg.status === 'fulfilled') setBags(bg.value);
    if (ct.status === 'fulfilled') setCarts(ct.value);
  }, []);

  useEffect(() => { load(); }, [load]);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  // A sheet never blurs the screen, so a coach change has to say so itself.
  useRefreshOn(load);
  const refresh = useCallback(async () => { setRefreshing(true); await load(); setRefreshing(false); }, [load]);

  const go = useCallback((next: Stage) => { feel.selection(); setStage(next); }, []);

  const startCycle = useCallback(async () => {
    setBusy(true);
    try {
      const cy = await createCycle({});
      setCycle(cy);
      await load();
      go('pantry');
    } catch (err: any) {
      toast.show(String(err?.message ?? err).replace(/^API \d+: /, '').replace(/^\{"detail":"|"\}$/g, ''));
    } finally { setBusy(false); }
  }, [load, go, toast]);

  const props = {
    cycle, deck, plan, pantry, bags, carts, spend, recipes, store, setStore, busy, setBusy,
    go, load, setDeck, setPlan, setPantry, setBags, setCarts, startCycle,
  };

  return (
    <Screen contextKey={`food-${stage}`} onRefresh={refresh} refreshing={refreshing}>
      {stage === 'home' ? <Home {...props} /> : null}
      {stage === 'pantry' ? <Pantry {...props} /> : null}
      {stage === 'deck' ? <Deck {...props} /> : null}
      {stage === 'plan' ? <PlanView {...props} /> : null}
      {stage === 'bags' ? <Bags {...props} /> : null}
      {stage === 'review' ? <Review {...props} /> : null}
      {stage === 'receipt' ? <Receipt {...props} /> : null}
      {stage === 'spend' ? <Spend {...props} /> : null}
      {stage === 'book' ? <Book {...props} /> : null}
    </Screen>
  );
}

// --- Home -------------------------------------------------------------------

function Home({ cycle, deck, plan, spend, recipes, go, startCycle, busy }: any) {
  const { c } = useTheme();
  const ready = !!plan?.meals?.length;
  const covered = plan?.covered_days ?? 0;
  const eating = cycle?.eating_days ?? 0;

  return (
    <>
      <TopBar label="Food · Your two-week kitchen" />
      <Title>Eat well.{'\n'}<Em>Think less.</Em></Title>

      <View style={[s.cover, { backgroundColor: c.artBg }]}>
        <Eyebrow style={{ color: c.artFg }}>
          {ready ? 'Tonight · from your plan' : 'Your kitchen'}
        </Eyebrow>
        <Subtitle style={{ color: c.artFg, maxWidth: 220, marginTop: 9 }}>
          {ready ? 'A little heat.\nA lot of comfort.' : 'A plan, and\nno more thinking.'}
        </Subtitle>
        <View style={s.bowl}><Bowl /></View>
        <Small style={{ color: c.artFg, marginTop: 12 }}>
          {ready ? `${plan.meals[0].recipe.title} · reheat in a pan` : 'Start a cycle to fill the fridge'}
        </Small>
      </View>

      <Panel style={{ marginTop: 17 }}>
        <View style={s.rowBetween}>
          <Eyebrow>{cycle ? `${prettyDate(cycle.start_date)} – ${prettyDate(cycle.end_date)}` : 'No cycle yet'}</Eyebrow>
          <Badge>{ready ? 'Plan ready' : cycle ? 'In progress' : 'Next grocery run'}</Badge>
        </View>
        <Subtitle style={{ marginTop: 12 }}>
          {ready ? 'Your kitchen is covered.' : cycle ? `${eating} days to feed you.` : 'Two weeks, sorted.'}
        </Subtitle>
        <Body style={{ marginTop: 8 }}>
          {cycle
            ? `${eating * 2} lunches and dinners. A few familiar recipes, made in batches.`
            : 'Pick a handful of recipes once, then cook twice and eat all fortnight.'}
        </Body>
        {cycle ? (
          <CalendarNote>
            {cycle.travel_days.length} days away · {cycle.eat_out_days} days eating out
          </CalendarNote>
        ) : null}
        <Button
          full
          label={ready ? 'See your plan' : cycle ? 'Continue your plan' : busy ? 'Starting…' : 'Plan my groceries'}
          disabled={busy}
          onPress={() => (ready ? go('plan') : cycle ? go('pantry') : startCycle())}
        />
      </Panel>

      <Section title="Your recipe book" trailing={<InlineButton label="Open" icon="arrow-forward" onPress={() => go('book')} />} />
      <Body>
        {recipes.filter((r: FoodRecipe) => r.times_cooked > 0).length} cooked ·{' '}
        {recipes.length} saved. Every one keeps its ingredients and its method.
      </Body>

      <Section title="The kitchen ledger" trailing={<InlineButton label="View spend" icon="arrow-forward" onPress={() => go('spend')} />} />
      <View style={s.rowBetween}>
        <Body>This cycle</Body>
        <Animated.Text style={{ fontFamily: fonts.serif, fontSize: 22, color: c.fg }}>
          {money(spend?.current?.total ?? spend?.average_total ?? 0)}
        </Animated.Text>
      </View>
    </>
  );
}

// --- Pantry -----------------------------------------------------------------

function Pantry({ pantry, setPantry, go, cycle }: any) {
  const { c } = useTheme();
  const toast = useToast();

  const cycleState = useCallback(async (entry: PantryEntry) => {
    const next = PANTRY_STATES[(PANTRY_STATES.indexOf(entry.state) + 1) % 3];
    feel.selection();
    setPantry((prev: PantryEntry[]) => prev.map(p => (p.ingredient_id === entry.ingredient_id ? { ...p, state: next } : p)));
    try {
      await putPantry([{ ingredient_id: entry.ingredient_id, state: next }]);
    } catch {
      toast.show('That didn’t save.');
    }
  }, [setPantry, toast]);

  return (
    <>
      <FlowTop step="01 · A quick pantry check" onBack={() => go('home')} />
      <Title>Start with{'\n'}<Em>what’s here.</Em></Title>
      <Body style={{ marginTop: 12 }}>Just the ingredients that change this plan.</Body>

      <View style={{ marginTop: 14 }}>
        {pantry.slice(0, 12).map((p: PantryEntry) => (
          <View key={p.ingredient_id} style={[s.pantryRow, { borderBottomColor: c.line }]}>
            <Body style={{ flex: 1, color: c.fg, fontSize: 14 }}>{p.name}</Body>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${p.name}: ${PANTRY_LABEL[p.state] ?? p.state}. Tap to change.`}
              onPress={() => cycleState(p)}
              style={[s.pantryState, { backgroundColor: p.state === 'gone' ? c.panel2 : c.soft }]}
            >
              <Small style={{ color: p.state === 'gone' ? c.muted : c.accent, fontSize: 12 }}>
                {PANTRY_LABEL[p.state] ?? p.state}
              </Small>
              <Ionicons name="chevron-down" size={12} color={p.state === 'gone' ? c.muted : c.accent} />
            </Pressable>
          </View>
        ))}
        {!pantry.length ? <Body>No pantry staples tracked yet.</Body> : null}
      </View>

      <Small style={{ marginTop: 22 }}>Tap to cycle: Have → Low → Need</Small>
      {cycle ? (
        <CalendarNote>Calendar · {cycle.travel_days.length} travel days excluded</CalendarNote>
      ) : null}
      <Button full label="Find my meals" iconAfter="arrow-forward" onPress={() => go('deck')} />
    </>
  );
}

// --- Deck -------------------------------------------------------------------

function Deck({ cycle, deck, setDeck, go, load }: any) {
  const { c, moves } = useTheme();
  const sheet = useSheet();
  const toast = useToast();
  const x = useSharedValue(0);
  const rot = useSharedValue(0);
  const opacity = useSharedValue(1);
  const [busy, setBusy] = useState(false);
  const shownAt = useRef(Date.now());

  const card: FoodRecipe | undefined = deck?.cards?.[0];
  useEffect(() => { shownAt.current = Date.now(); }, [card?.id]);

  const commit = useCallback(async (keep: boolean) => {
    if (!cycle || !card || busy) return;
    setBusy(true);
    feel[keep ? 'light' : 'selection']();
    try {
      const next = await swipeCard(cycle.id, {
        recipe_id: card.id,
        decision: keep ? 'keep' : 'skip',
        dwell_ms: Date.now() - shownAt.current,
      });
      setDeck(next);
      x.value = 0; rot.value = 0; opacity.value = 1;
      if (next.enough) {
        toast.show('Enough food. You can stop choosing.');
        await load();
        go('plan');
      }
    } catch (err: any) {
      toast.show(String(err?.message ?? err).replace(/^API \d+: /, ''));
      x.value = 0; rot.value = 0; opacity.value = 1;
    } finally { setBusy(false); }
  }, [cycle, card, busy, setDeck, x, rot, opacity, toast, load, go]);

  const fly = useCallback((keep: boolean) => {
    if (!moves) { commit(keep); return; }
    x.value = withTiming(keep ? 110 : -110, T.cardRelease);
    rot.value = withTiming(keep ? 9 : -9, T.cardRelease);
    opacity.value = withTiming(0, T.cardRelease, done => { if (done) runOnJS(commit)(keep); });
  }, [moves, commit, x, rot, opacity]);

  const pan = Gesture.Pan()
    .activeOffsetX([-gesture.horizontalIntent, gesture.horizontalIntent])
    .failOffsetY([-gesture.cancelMove, gesture.cancelMove])
    .onUpdate(e => {
      x.value = Math.max(-gesture.maxFollow, Math.min(gesture.maxFollow, e.translationX));
      rot.value = x.value / 19;
    })
    .onEnd(e => {
      if (Math.abs(e.translationX) > gesture.commit && Math.abs(e.translationX) > Math.abs(e.translationY) * 1.3) {
        runOnJS(fly)(e.translationX > 0);
        return;
      }
      x.value = withTiming(0, T.selectionSlow);
      rot.value = withTiming(0, T.selectionSlow);
    });

  const cardStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }, { rotate: `${rot.value}deg` }],
    opacity: opacity.value,
  }));

  const covered = deck ? deck.kept.length : 0;
  const target = deck?.eating_days ?? 0;

  if (!deck) return <><FlowTop step="02 · Find your favourites" onBack={() => go('pantry')} /><Body>Loading the deck…</Body></>;

  if (!card) {
    return (
      <>
        <FlowTop step="02 · Your taste, your pace" onBack={() => go('pantry')} />
        <Title>Nothing quite{'\n'}<Em>right?</Em></Title>
        <Body style={{ marginTop: 12 }}>
          {deck.kept.length} recipe{deck.kept.length === 1 ? '' : 's'} kept. Revisit what you skipped, or go with
          what you have.
        </Body>
        <Button full label="Use what I’ve kept" style={{ marginTop: 22 }} onPress={() => go('plan')} />
      </>
    );
  }

  return (
    <>
      <FlowTop step="02 · Find your familiar favourites" onBack={() => go('pantry')} />
      <View style={s.rowBetween}>
        <Title style={{ marginBottom: 0 }}>A good <Em>fit?</Em></Title>
        <Small>{deck.coverage} / {target} days covered</Small>
      </View>
      <Coverage total={Math.max(1, target)} filled={deck.coverage} />

      <GestureDetector gesture={pan}>
        <Animated.View style={[s.recipe, { backgroundColor: c.panel }, cardStyle]}>
          <View style={[s.recipeArt, { backgroundColor: c.artBg }]}>
            <Eyebrow style={{ color: c.artFg }}>{card.source_site ?? 'Recipe'}{card.rating ? ` · ${card.rating.toFixed(1)}★` : ''}</Eyebrow>
            <View style={s.bowlSmall}><Bowl size={120} /></View>
            <Animated.Text style={[s.recipeArtWord, { color: c.artFg }]} numberOfLines={1}>
              {(card.protein_source ?? card.cuisine ?? 'Home cooking').replace(/^./, ch => ch.toUpperCase())}
            </Animated.Text>
          </View>
          <View style={{ padding: 18, paddingHorizontal: 20 }}>
            <Animated.Text style={[s.recipeTitle, { color: c.fg }]}>{card.title}</Animated.Text>
            <Body style={{ marginTop: 10, marginBottom: 15 }} numberOfLines={3}>
              {card.notes
                ?? `${(card.cuisine ?? 'Familiar').replace(/^./, ch => ch.toUpperCase())} · ${card.reheat} reheat · cooks ${card.servings} servings.`}
            </Body>
            <View style={[s.recipeStats, { borderTopColor: c.line }]}>
              <Stat value={`${card.prep_minutes} min`} label="active prep" />
              <Stat value={card.protein_g_per_serving ? `${Math.round(card.protein_g_per_serving)} g` : '—'} label="protein" />
              <Stat value={String(card.servings)} label="servings" />
            </View>
          </View>
        </Animated.View>
      </GestureDetector>

      <View style={s.deckActions}>
        <Button kind="secondary" label="Not this time" icon="close" disabled={busy} onPress={() => fly(false)} style={{ flex: 1 }} />
        <Button label="Yes, please" icon="checkmark" haptic="light" disabled={busy} onPress={() => fly(true)} style={{ flex: 1.4 }} />
      </View>
      <View style={s.rowBetween}>
        <Small>Swipe right to keep, left to skip</Small>
        <InlineButton
          label="Recipe details"
          icon="arrow-forward"
          onPress={() => sheet.open(card.title, () => <RecipeSheet recipe={card} />)}
        />
      </View>
      {deck.learned?.length ? <Small style={{ marginTop: 10 }}>Learning: {deck.learned.join(' · ')}</Small> : null}
    </>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  const { c } = useTheme();
  return (
    <View>
      <Animated.Text style={{ fontFamily: fonts.medium, fontSize: 15, color: c.fg, marginBottom: 2 }}>{value}</Animated.Text>
      <Small>{label}</Small>
    </View>
  );
}

// --- Plan -------------------------------------------------------------------

function PlanView({ cycle, plan, go, load }: any) {
  const { c } = useTheme();
  const sheet = useSheet();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const make = useCallback(async () => {
    if (!cycle) return;
    setBusy(true);
    try { await buildPlan(cycle.id); await load(); } catch { toast.show('Could not build the plan.'); }
    finally { setBusy(false); }
  }, [cycle, load, toast]);

  if (!plan?.meals?.length) {
    return (
      <>
        <FlowTop step="03 · Your two-week plan" onBack={() => go('deck')} />
        <Title>Ready when{'\n'}<Em>you are.</Em></Title>
        <Button full label={busy ? 'Building…' : 'Build the plan'} disabled={busy} style={{ marginTop: 22 }} onPress={make} />
      </>
    );
  }

  const servings = plan.meals.reduce((n: number, m: any) => n + (m.servings ?? 0), 0);

  return (
    <>
      <FlowTop step="03 · Your two-week plan" onBack={() => go('home')} />
      <Badge icon="checkmark">Enough food. You can stop choosing.</Badge>
      <Title style={{ marginTop: 19 }}>A few favourites.{'\n'}<Em>More free time.</Em></Title>
      <Body style={{ marginTop: 12 }}>
        {plan.meals.length} recipes · {servings} servings · {plan.covered_days} days of lunch and dinner.
      </Body>
      <Small style={{ marginTop: 8 }}>
        No cooking while you're away. The {cycle.travel_days.length} travel day
        {cycle.travel_days.length === 1 ? '' : 's'} and {cycle.eat_out_days} night
        {cycle.eat_out_days === 1 ? '' : 's'} out are left out of the plan, and a batch never spans
        a trip, so nothing is left to spoil.
      </Small>

      <View style={s.miniDays}>
        {Array.from({ length: 14 }, (_, i) => {
          const date = new Date(`${cycle.start_date}T12:00:00Z`);
          date.setUTCDate(date.getUTCDate() + i);
          const iso = date.toISOString().slice(0, 10);
          const away = cycle.travel_days.includes(iso);
          return (
            <View
              key={iso}
              style={{
                flex: 1, height: 24, borderRadius: 6,
                backgroundColor: away ? c.panel2 : c.soft,
                opacity: away ? 0.6 : 1,
              }}
            />
          );
        })}
      </View>
      <View style={s.rowBetween}>
        <Small>{prettyDate(cycle.start_date)}</Small>
        <Small>{prettyDate(cycle.end_date)}</Small>
      </View>

      <View style={{ marginVertical: 20 }}>
        {plan.meals.map((meal: any, i: number) => (
          <View key={meal.id} style={[s.planMeal, { borderBottomColor: c.line }]}>
            <Animated.Text style={[s.planIndex, { color: c.muted }]}>{String(i + 1).padStart(2, '0')}</Animated.Text>
            <View style={{ flex: 1 }}>
              <Body style={{ color: c.fg }}>{meal.recipe.title}</Body>
              <Small style={{ marginTop: 4 }}>
                {meal.servings} portions · {meal.status === 'cooked' ? 'cooked' : i === 1 ? 'freeze the base' : 'pan reheat'}
              </Small>
            </View>
            <InlineButton
              label="Details"
              onPress={() => sheet.open(meal.recipe.title, () => <RecipeSheet recipe={meal.recipe} />)}
            />
          </View>
        ))}
      </View>

      <Small>Batch in two sessions. Freeze later-week portions.</Small>
      <Button full label="Find my groceries" iconAfter="arrow-forward" style={{ marginTop: 22 }} onPress={() => go('bags')} />
    </>
  );
}

// --- Bags -------------------------------------------------------------------

function Bags({ cycle, bags, setBags, store, setStore, go, busy, setBusy }: any) {
  const { c } = useTheme();
  const toast = useToast();

  const build = useCallback(async () => {
    if (!cycle) return;
    setBusy(true);
    try { setBags(await buildBags(cycle.id)); } catch { toast.show('Could not build the bags.'); }
    finally { setBusy(false); }
  }, [cycle, setBags, setBusy, toast]);

  const list: Bag[] = bags?.bags ?? [];

  return (
    <>
      <FlowTop step="04 · One good grocery run" onBack={() => go('plan')} />
      <Title>Good ingredients.{'\n'}<Em>A better basket.</Em></Title>
      <Body style={{ marginTop: 12 }}>
        Compare the delivered total. Pantry staples you already have are deducted.
      </Body>

      {list.length ? list.map((bag, i) => (
        <Pressable
          key={bag.store}
          accessibilityRole="button"
          accessibilityState={{ selected: store === i }}
          onPress={() => { feel.selection(); setStore(i); }}
          style={[
            s.store,
            { backgroundColor: c.panel, borderColor: store === i ? c.accent : c.line },
          ]}
        >
          <View style={{ flex: 1 }}>
            <Animated.Text style={[s.storeName, { color: c.fg }]}>{bag.name}</Animated.Text>
            <Small style={{ marginTop: 2 }}>{bag.items.length} items · {money(bag.delivery_fee)} delivery</Small>
          </View>
          <Animated.Text style={[s.storeName, { color: c.fg }]}>{money(bag.goods_total + bag.delivery_fee)}</Animated.Text>
          <Small style={{ width: '100%', marginTop: 6 }}>
            {store === i ? '✓ ' : ''}
            {bag.short ? `${money(bag.shortfall)} under the ${money(bag.minimum)} minimum` : 'Meets the store minimum'}
          </Small>
        </Pressable>
      )) : (
        <Button full label={busy ? 'Building…' : 'Build my bags'} disabled={busy} style={{ marginTop: 20 }} onPress={build} />
      )}

      {list.length ? (
        <>
          <Small style={{ marginTop: 22 }}>Prices are the store’s; verify in the live cart.</Small>
          <Button full label="Build my cart" iconAfter="arrow-forward" style={{ marginTop: 22 }} onPress={() => go('review')} />
          <Notice icon="bag-handle-outline">
            Cart building stops before checkout. You review every item and the final total.
          </Notice>
        </>
      ) : null}
    </>
  );
}

// --- Review and approval ----------------------------------------------------

function Review({ cycle, bags, carts, store, go, load }: any) {
  const { c } = useTheme();
  const sheet = useSheet();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const bag: Bag | undefined = bags?.bags?.[store];
  const cart: CartTask | undefined = carts?.find((t: CartTask) => t.store === bag?.store) ?? carts?.[0];

  // Approving the bags is what creates the cart tasks; running one fills in the real basket.
  const prepare = useCallback(async () => {
    if (!cycle || !bag) return;
    setBusy(true);
    try {
      await approveBags(cycle.id);
      const tasks = await getCarts(cycle.id);
      const mine = tasks.find(t => t.store === bag.store) ?? tasks[0];
      if (mine && mine.status === 'queued') await runCart(mine.id);
      await load();
      toast.show('Cart built. Review every item before approving.');
    } catch (err: any) {
      toast.show(String(err?.message ?? err).replace(/^API \d+: /, ''));
    } finally { setBusy(false); }
  }, [cycle, bag, load, toast]);

  const approve = useCallback(() => {
    if (!cart) return;
    sheet.open('One order.\nOnly with you.', () => (
      <ApprovalSheet cart={cart} onDone={async () => { await load(); go('receipt'); }} />
    ));
  }, [cart, sheet, load, go]);

  if (!bag) {
    return (
      <>
        <FlowTop step="05 · Review before paying" onBack={() => go('bags')} />
        <Body>Choose a store first.</Body>
      </>
    );
  }

  const lines = cart?.cart_lines ?? [];
  const total = cart?.cart_total ?? (bag.goods_total + bag.delivery_fee);

  return (
    <>
      <FlowTop step="05 · Review before paying" onBack={() => go('bags')} />
      <Badge icon="bag-handle-outline">{cart ? `Cart ${cart.status.replace('_', ' ')}` : 'Not built yet'} · {bag.name}</Badge>
      <Title style={{ marginTop: 18 }}>Your basket.{'\n'}<Em>Your call.</Em></Title>

      <Animated.Text style={[s.money, { color: c.fg }]}>{money(total)}</Animated.Text>
      <Small>One delivery · all-in total</Small>

      <Panel style={{ marginVertical: 20, paddingVertical: 4, paddingHorizontal: 18 }}>
        {(lines.length ? lines : bag.items.map(it => ({
          name: it.name, qty: it.packs, line_total: it.line_total,
        }))).slice(0, 12).map((l: any, i: number) => (
          <View key={`${l.name}-${i}`} style={s.moneyRow}>
            <Small style={{ flex: 1 }}>{l.name}{l.qty ? ` × ${l.qty}` : ''}</Small>
            <Small>{money(l.line_total ?? 0)}</Small>
          </View>
        ))}
        <View style={[s.moneyRow, { borderTopWidth: 1, borderTopColor: c.line, paddingVertical: 16 }]}>
          <Body style={{ flex: 1, color: c.fg }}>Total to approve</Body>
          <Body style={{ color: c.fg, fontFamily: fonts.medium }}>{money(total)}</Body>
        </View>
      </Panel>

      <Notice icon="shield-checkmark-outline">
        Approval covers this basket once. A change to items, delivery or price needs your review again.
      </Notice>

      {!cart || cart.status === 'queued' || cart.status === 'building' ? (
        <Button full label={busy ? 'Building…' : 'Build this cart'} disabled={busy} onPress={prepare} />
      ) : (
        <Button full label="Review payment approval" iconAfter="arrow-forward" onPress={approve} />
      )}
      <Button full kind="quiet" label="Change store" onPress={() => go('bags')} />
    </>
  );
}

/**
 * The payment gate. Visual confirmation is backed by server enforcement: approval mints a
 * short-lived single-use token bound to this basket, and placing consumes it. Device
 * authentication is required and an uncertain result never becomes a second order.
 */
function ApprovalSheet({ cart, onDone }: { cart: CartTask; onDone: () => void }) {
  const { c } = useTheme();
  const sheet = useSheet();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const authorize = useCallback(async () => {
    setBusy(true);
    try {
      const hardware = await LocalAuthentication.hasHardwareAsync();
      const enrolled = await LocalAuthentication.isEnrolledAsync();
      let ok = true;
      if (hardware && enrolled) {
        const res = await LocalAuthentication.authenticateAsync({
          promptMessage: `Approve ${cart.name} · $${(cart.cart_total ?? 0).toFixed(2)}`,
          cancelLabel: 'Cancel',
        });
        ok = res.success;
      } else {
        toast.show('No device authentication available. Approval needs it.');
        ok = false;
      }
      if (!ok) { setBusy(false); return; }
      const { token } = await approveCart(cart.id, true);
      await placeCart(cart.id, token);
      feel.success();
      sheet.close();
      onDone();
    } catch (err: any) {
      toast.show(String(err?.message ?? err).replace(/^API \d+: /, ''));
    } finally { setBusy(false); }
  }, [cart, sheet, toast, onDone]);

  return (
    <View>
      <View style={[s.confirmMark, { backgroundColor: c.soft }]}>
        <Ionicons name="scan-outline" size={27} color={c.accent} />
      </View>
      <Body>{cart.name} · one delivery</Body>
      <Animated.Text style={[s.money, { color: c.fg, fontSize: 49 }]}>${(cart.cart_total ?? 0).toFixed(2)}</Animated.Text>
      <Body>Approve this reviewed basket once, using device authentication.</Body>
      <Notice icon="lock-closed-outline">
        One use. It expires after approval. An uncertain order result is never retried automatically.
      </Notice>
      <Button full label={busy ? 'Waiting…' : 'Approve with Face ID'} haptic="none" disabled={busy} onPress={authorize} />
      <Button full kind="quiet" label="Keep reviewing" onPress={sheet.close} />
    </View>
  );
}

function Receipt({ carts, go }: any) {
  const { c } = useTheme();
  const placed = carts?.find((t: CartTask) => t.status === 'placed');
  return (
    <>
      <FlowTop step="Your grocery run" onBack={() => go('home')} />
      <View style={[s.confirmMark, { backgroundColor: c.soft }]}>
        <Ionicons name="checkmark" size={27} color={c.accent} />
      </View>
      <Title>Taken care of.{'\n'}<Em>Back to your day.</Em></Title>
      <Body style={{ marginTop: 12 }}>
        {placed ? 'Order placed. Spending updates when the receipt is confirmed.' : 'Nothing placed yet.'}
      </Body>
      {placed ? (
        <Panel style={{ marginVertical: 20, paddingVertical: 4, paddingHorizontal: 18 }}>
          <View style={s.moneyRow}>
            <Small style={{ flex: 1 }}>{placed.name}</Small>
            <Small>{placed.status}</Small>
          </View>
          <View style={[s.moneyRow, { borderTopWidth: 1, borderTopColor: c.line, paddingVertical: 16 }]}>
            <Body style={{ flex: 1, color: c.fg }}>Total</Body>
            <Body style={{ color: c.fg, fontFamily: fonts.medium }}>{money(placed.order?.total ?? placed.cart_total ?? 0)}</Body>
          </View>
        </Panel>
      ) : null}
      <Button full label="Back to my meals" onPress={() => go('plan')} />
      <Button full kind="quiet" label="See grocery spending" onPress={() => go('spend')} />
    </>
  );
}

function Spend({ spend, go }: any) {
  const { c } = useTheme();
  const months: { label: string; total: number }[] = (spend?.history ?? []).map((h: any) => ({ label: h.label, total: h.total }));
  const max = Math.max(1, ...months.map(m => m.total));
  return (
    <>
      <FlowTop step="The kitchen ledger" onBack={() => go('home')} />
      <Title>Good food.{'\n'}<Em>Money well spent.</Em></Title>
      <Eyebrow style={{ marginTop: 18 }}>This cycle</Eyebrow>
      <Animated.Text style={[s.money, { color: c.fg }]}>{money(spend?.current?.total ?? 0)}</Animated.Text>
      <Body>
        {spend?.current?.orders ?? 0} orders this cycle · {money(spend?.average_total ?? 0)} average ·
        budget {money(spend?.budget_per_cycle ?? 0)}
      </Body>

      {months.length ? (
        <View style={s.bars}>
          {months.slice(-6).map(mn => (
            <View key={mn.label} style={s.bar}>
              <Small>${Math.round(mn.total)}</Small>
              <View style={{ width: '100%', height: (mn.total / max) * 110, borderRadius: 8, backgroundColor: c.panel2 }} />
              <Small>{mn.label}</Small>
            </View>
          ))}
        </View>
      ) : null}

      <Section title="Past cycles" trailing={<Small>All-in totals</Small>} />
      {(spend?.history ?? []).slice(0, 8).map((h: any) => (
        <DetailRow key={h.cycle_id} label={h.label} sub={`${money(h.goods)} goods · ${money(h.fees)} fees`} value={money(h.total)} />
      ))}
      {!(spend?.history ?? []).length ? <Body>No completed cycles yet.</Body> : null}
      <Small style={{ marginTop: 16 }}>Spending is recorded only from confirmed receipts.</Small>
    </>
  );
}

const s = StyleSheet.create({
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },

  cover: { borderRadius: 24, overflow: 'hidden', paddingVertical: 18, paddingHorizontal: 20, minHeight: 163, marginTop: 19, marginBottom: 16 },
  bowl: { position: 'absolute', right: -32, top: 22 },
  bowlSmall: { position: 'absolute', right: -20, top: 14 },

  pantryRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingVertical: 17, borderBottomWidth: 1 },
  pantryState: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 14, paddingVertical: 10, paddingHorizontal: 12, minWidth: 90, minHeight: 44, justifyContent: 'center' },

  recipe: { borderRadius: 25, overflow: 'hidden', marginTop: 21, marginBottom: 11 },
  recipeArt: { minHeight: 148, padding: 16, paddingHorizontal: 19, justifyContent: 'space-between', overflow: 'hidden' },
  recipeTitle: { fontFamily: fonts.serif, fontSize: 34, lineHeight: 34, letterSpacing: -0.6 },
  recipeArtWord: { fontFamily: fonts.medium, fontSize: 31, letterSpacing: -1, lineHeight: 40, maxWidth: 220 },
  recipeStats: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: 14, borderTopWidth: 1, gap: 8 },
  deckActions: { flexDirection: 'row', gap: 9, marginTop: 18 },

  miniDays: { flexDirection: 'row', gap: 4, marginTop: 17, marginBottom: 7 },
  planMeal: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 17, borderBottomWidth: 1 },
  planIndex: { fontFamily: fonts.serif, fontSize: 24, width: 34 },

  store: { borderWidth: 1, borderRadius: 19, padding: 16, marginTop: 10, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 7 },
  storeName: { fontFamily: fonts.medium, fontSize: 18, letterSpacing: -0.5 },

  money: { fontFamily: fonts.serif, fontSize: 61, lineHeight: 61, letterSpacing: -2, marginVertical: 13 },
  moneyRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingVertical: 10 },
  confirmMark: { width: 62, height: 62, borderRadius: 21, alignItems: 'center', justifyContent: 'center', marginVertical: 18 },

  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: 13, height: 150, marginVertical: 30 },
  bar: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', gap: 7 },

  bookRow: { flexDirection: 'row', alignItems: 'center', gap: 12, borderTopWidth: 1, paddingVertical: 16 },
  bookMark: { width: 4, height: 34, borderRadius: 2 },
  bookTitle: { fontFamily: fonts.medium, fontSize: 15 },
});

/**
 * The recipe book: everything you have cooked, and everything waiting to be. Each one opens in
 * full, with its ingredients and its method.
 */
function Book({ recipes, go }: any) {
  const { c } = useTheme();
  const sheet = useSheet();
  const all: FoodRecipe[] = recipes ?? [];
  const cooked = all
    .filter(r => r.times_cooked > 0)
    .sort((a, b) => (b.last_cooked ?? '').localeCompare(a.last_cooked ?? ''));
  const rest = all.filter(r => !r.times_cooked).sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
  // Opening on an empty shelf tells you nothing; start wherever there is something to read.
  const [query, setQuery] = useState<'cooked' | 'all'>(cooked.length ? 'cooked' : 'all');
  const shown = query === 'cooked' ? cooked : all;

  const open = (r: FoodRecipe) => { feel.selection(); sheet.open(r.title, () => <RecipeSheet recipe={r} />); };

  return (
    <>
      <FlowTop step="Your recipe book" onBack={() => go('home')} />
      <Title>What you{'\n'}<Em>actually cook.</Em></Title>
      <Body style={{ marginTop: 12 }}>
        {cooked.length} cooked, {rest.length} still to try. Open one for its ingredients and method.
      </Body>

      <Options
        values={['cooked', 'all'] as const}
        selected={query}
        onSelect={setQuery}
        labels={(v: string) => (v === 'cooked' ? `Cooked (${cooked.length})` : `Everything (${all.length})`)}
      />

      {shown.length ? shown.map((r, i) => (
        <Pressable
          key={r.id}
          accessibilityRole="button"
          accessibilityLabel={`${r.title}. ${r.times_cooked ? `Cooked ${r.times_cooked} times.` : 'Not cooked yet.'} Open the recipe.`}
          onPress={() => open(r)}
          style={[s.bookRow, { borderTopColor: i === 0 ? 'transparent' : c.line }]}
        >
          <View style={[s.bookMark, { backgroundColor: r.times_cooked ? c.accent : c.panel2 }]} />
          <View style={{ flex: 1 }}>
            <Animated.Text style={[s.bookTitle, { color: c.fg }]} numberOfLines={1}>{r.title}</Animated.Text>
            <Small style={{ marginTop: 3 }} numberOfLines={1}>
              {[
                r.cuisine ? r.cuisine.replace(/^./, ch => ch.toUpperCase()) : null,
                `${r.total_minutes} min`,
                `${r.servings} servings`,
                r.times_cooked ? `cooked ${r.times_cooked}×` : null,
                r.last_cooked ? prettyDate(r.last_cooked) : null,
              ].filter(Boolean).join(' · ')}
            </Small>
          </View>
          {r.user_rating ? <Small style={{ color: c.accent }}>{r.user_rating}/5</Small> : null}
          <Ionicons name="chevron-forward" size={16} color={c.muted} />
        </Pressable>
      )) : (
        <Body style={{ marginTop: 16 }}>
          {query === 'cooked' ? 'Nothing cooked yet. Finish a meal and it lands here.' : 'No recipes saved yet.'}
        </Body>
      )}
    </>
  );
}
