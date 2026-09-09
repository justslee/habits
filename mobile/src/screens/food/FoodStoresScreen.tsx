/**
 * FoodStoresScreen — H Mart Manhattan, Whole Foods via Amazon, Wegmans via DoorDash, plus
 * any DoorDash grocer with a deal. Minimums, fees, deals, enable/disable, supervised flag.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { colors, fonts, radius, spacing, typography } from '../../theme';
import { MerchantData, createMerchant, getMerchants, patchMerchant, scanDeals } from '../../api/client';
import { haptic } from '../../utils/haptics';
import ScreenBackground from '../../components/ScreenBackground';

const money = (n: number) => `$${n.toFixed(2)}`;
const CHANNEL = { site: 'own site', doordash: 'DoorDash', amazon: 'Amazon' } as const;

export default function FoodStoresScreen() {
  const [stores, setStores] = useState<MerchantData[]>([]);
  const [scanning, setScanning] = useState(false);
  const [adding, setAdding] = useState({ name: '', minimum: '', fee: '', deal_text: '', deal_value: '', deal_min: '' });
  const [showAdd, setShowAdd] = useState(false);

  const load = useCallback(() => { getMerchants().then(setStores).catch(err => console.warn('stores', err)); }, []);
  useEffect(() => { load(); }, [load]);

  const patch = useCallback(async (m: MerchantData, p: Partial<MerchantData>) => {
    haptic.selection();
    try { const u = await patchMerchant(m.store, p); setStores(prev => prev.map(x => (x.store === u.store ? u : x))); } catch (err) { console.warn(err); }
  }, []);

  const editDeal = useCallback((m: MerchantData) => {
    Alert.prompt?.('Deal', `${m.name} · "$10 off $50" or blank to clear`, async (text) => {
      const mm = /\$?(\d+(?:\.\d+)?)\s*off\s*\$?(\d+(?:\.\d+)?)?/i.exec(text || '');
      await patch(m, { deal_text: text || null, deal_value: mm ? Number(mm[1]) : 0, deal_min: mm && mm[2] ? Number(mm[2]) : 0 });
    }, 'plain-text', m.deal_text || '');
  }, [patch]);

  const scan = useCallback(async () => {
    haptic.medium();
    setScanning(true);
    try {
      const out = await scanDeals();
      if (out.mode === 'dry_run') Alert.alert('Browser not enabled', out.note || 'Set the executor to Playwright on the Mac to scan DoorDash for deals.');
      else Alert.alert('Deals found', out.deals.length ? out.deals.map((d: any) => `${d.name}: ${d.text}`).join('\n') : 'No quality grocers with a deal right now.');
      load();
    } catch (err: any) {
      Alert.alert('Scan failed', String(err?.message || err));
    } finally {
      setScanning(false);
    }
  }, [load]);

  const add = useCallback(async () => {
    if (!adding.name.trim()) return;
    haptic.medium();
    try {
      await createMerchant({
        store: adding.name.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 20), name: `${adding.name.trim()} · DoorDash`, channel: 'doordash',
        minimum: Number(adding.minimum) || 0, delivery_fee: Number(adding.fee) || 0, deal_text: adding.deal_text || undefined,
        deal_value: Number(adding.deal_value) || 0, deal_min: Number(adding.deal_min) || 0,
      });
      setAdding({ name: '', minimum: '', fee: '', deal_text: '', deal_value: '', deal_min: '' });
      setShowAdd(false);
      load();
    } catch (err: any) {
      Alert.alert('Could not add', String(err?.message || err));
    }
  }, [adding, load]);

  return (
    <ScreenBackground>
      <ScrollView contentContainerStyle={s.container} keyboardShouldPersistTaps="handled">
        <Text style={typography.eyebrow}>{stores.filter(x => x.enabled).length} ENABLED · DEALS LOWER A BAG'S EFFECTIVE COST</Text>
        <Text style={s.title}>Stores</Text>

        {stores.map(m => (
          <View key={m.store} style={[s.card, !m.enabled && { opacity: 0.55 }]}>
            <View style={s.head}>
              <View style={{ flex: 1 }}>
                <Text style={s.body}>{m.name}</Text>
                <Text style={s.sub}>{m.location || CHANNEL[m.channel]} · via {CHANNEL[m.channel]} · {m.quality_tier === 'high' ? 'quality' : 'standard'} tier</Text>
                <Text style={s.sub}>Min {money(m.minimum)} · fee {m.delivery_fee ? money(m.delivery_fee) : 'free'} · {m.supervised ? 'supervised' : 'unattended'}</Text>
              </View>
              <Switch value={m.enabled} onValueChange={v => patch(m, { enabled: v })} trackColor={{ true: colors.accent, false: colors.line }} />
            </View>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              <TouchableOpacity style={[s.ghostBtn, m.deal_active && { backgroundColor: 'rgba(118,201,156,0.16)' }]} onPress={() => editDeal(m)}>
                <Text style={[s.ghostBtnT, m.deal_active && { color: colors.success }]}>{m.deal_active ? `Deal · ${m.deal_text}` : 'Add a deal'}</Text>
              </TouchableOpacity>
              {!m.supervised && <TouchableOpacity style={s.ghostBtn} onPress={() => patch(m, { supervised: true })}><Text style={s.ghostBtnT}>Re-supervise</Text></TouchableOpacity>}
              {m.supervised && <TouchableOpacity style={s.ghostBtn} onPress={() => Alert.alert('Go unattended?', `The agent will press Place Order at ${m.name} itself after your Face ID approval.`, [{ text: 'Cancel', style: 'cancel' }, { text: 'Yes', style: 'destructive', onPress: () => patch(m, { supervised: false }) }])}><Text style={[s.ghostBtnT, { color: colors.warning }]}>Go unattended</Text></TouchableOpacity>}
            </View>
          </View>
        ))}

        <TouchableOpacity style={s.btn} onPress={scan} disabled={scanning} activeOpacity={0.9}><Text style={s.btnText}>{scanning ? 'Scanning DoorDash…' : 'Scan DoorDash for grocer deals'}</Text></TouchableOpacity>
        <Text style={s.help}>Looks for quality grocers (Wegmans, Whole Foods, Citarella, Eataly, Westside Market…) with a promo. Needs the browser executor on the Mac.</Text>

        <TouchableOpacity style={s.ghost} onPress={() => setShowAdd(v => !v)}><Text style={s.ghostText}>{showAdd ? 'Cancel' : 'Add a DoorDash store by hand'}</Text></TouchableOpacity>
        {showAdd && (
          <View style={s.card}>
            <TextInput value={adding.name} onChangeText={v => setAdding(a => ({ ...a, name: v }))} placeholder="Store name (e.g. Citarella)" placeholderTextColor={colors.textTertiary} style={s.input} />
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TextInput value={adding.minimum} onChangeText={v => setAdding(a => ({ ...a, minimum: v }))} placeholder="Minimum $" keyboardType="decimal-pad" placeholderTextColor={colors.textTertiary} style={[s.input, { flex: 1 }]} />
              <TextInput value={adding.fee} onChangeText={v => setAdding(a => ({ ...a, fee: v }))} placeholder="Fee $" keyboardType="decimal-pad" placeholderTextColor={colors.textTertiary} style={[s.input, { flex: 1 }]} />
            </View>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TextInput value={adding.deal_value} onChangeText={v => setAdding(a => ({ ...a, deal_value: v }))} placeholder="$ off" keyboardType="decimal-pad" placeholderTextColor={colors.textTertiary} style={[s.input, { flex: 1 }]} />
              <TextInput value={adding.deal_min} onChangeText={v => setAdding(a => ({ ...a, deal_min: v }))} placeholder="on orders over $" keyboardType="decimal-pad" placeholderTextColor={colors.textTertiary} style={[s.input, { flex: 2 }]} />
            </View>
            <TouchableOpacity style={s.btn} onPress={add} activeOpacity={0.9}><Text style={s.btnText}>Add store</Text></TouchableOpacity>
          </View>
        )}
        <View style={{ height: 120 }} />
      </ScrollView>
    </ScreenBackground>
  );
}

const s = StyleSheet.create({
  container: { paddingHorizontal: spacing.md, paddingTop: spacing.md, paddingBottom: 140 },
  title: { ...typography.serifLarge, marginTop: 4, marginBottom: 12 },
  body: { fontFamily: fonts.semibold, fontSize: 15, color: colors.text },
  sub: { fontFamily: fonts.regular, fontSize: 11.5, color: colors.textTertiary, marginTop: 2 },
  help: { fontFamily: fonts.regular, fontSize: 12.5, color: colors.textSecondary, lineHeight: 17, marginTop: 8 },
  card: { backgroundColor: colors.card, borderRadius: 16, borderWidth: 1, borderColor: colors.line, padding: 14, marginBottom: 10 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  input: { backgroundColor: colors.input, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 10, color: colors.text, fontFamily: fonts.regular, fontSize: 13, marginBottom: 8 },
  btn: { backgroundColor: colors.accent, borderRadius: radius.md, paddingVertical: 14, alignItems: 'center', marginTop: 6 },
  btnText: { fontFamily: fonts.semibold, fontSize: 15, color: colors.bg },
  ghost: { alignItems: 'center', paddingVertical: 12 },
  ghostText: { fontFamily: fonts.medium, fontSize: 13, color: colors.accentLight },
  ghostBtn: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: colors.accentMuted },
  ghostBtnT: { fontFamily: fonts.semibold, fontSize: 12, color: colors.accentLight },
});
