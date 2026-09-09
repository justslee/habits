/**
 * FoodCartsScreen — carts as the executor read them back, one Face ID approval per cart,
 * supervised hand-off ("press Place Order on the Mac, then confirm"), rejection, receipts.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import { colors, fonts, radius, spacing, typography } from '../../theme';
import {
  CartTask, FoodSettingsData, approveCart, confirmPlaced, getCarts, getFoodSettings, patchFoodSettings, placeCart, rejectCart, runCart,
} from '../../api/client';
import { haptic } from '../../utils/haptics';
import ScreenBackground from '../../components/ScreenBackground';

const money = (n: number | null | undefined) => `$${(n ?? 0).toFixed(2)}`;
const STATUS_COLOR: Record<CartTask['status'], string> = {
  queued: colors.textTertiary, building: colors.textSecondary, needs_review: colors.warning, approved: colors.accentLight,
  placing: colors.accentLight, awaiting_human: colors.warning, placed: colors.success, failed: colors.error, rejected: colors.error,
};
const STATUS_TEXT: Record<CartTask['status'], string> = {
  queued: 'Queued', building: 'Building the cart in your browser…', needs_review: 'Cart ready · needs your approval',
  approved: 'Approved · placing', placing: 'Re-checking the total…', awaiting_human: 'Parked on Place Order · press it on the Mac, then confirm',
  placed: 'Order placed · receipt saved', failed: 'Build failed', rejected: 'Rejected · bag reopened',
};

export default function FoodCartsScreen({ navigation, route }: any) {
  const cycleId: number = route.params.cycleId;
  const [carts, setCarts] = useState<CartTask[]>([]);
  const [settings, setSettings] = useState<FoodSettingsData | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    try {
      const [c, s] = await Promise.all([getCarts(cycleId), getFoodSettings()]);
      setCarts(c);
      setSettings(s);
    } catch (err) {
      console.warn('carts', err);
    }
  }, [cycleId]);

  useEffect(() => {
    load();
    timer.current = setInterval(load, 8000); // building carts progress in the background
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [load]);

  const replace = (t: CartTask) => setCarts(prev => prev.map(c => (c.id === t.id ? t : c)));

  const approve = useCallback(async (t: CartTask) => {
    haptic.medium();
    setBusy(t.id);
    try {
      const hw = await LocalAuthentication.hasHardwareAsync();
      const enrolled = hw && (await LocalAuthentication.isEnrolledAsync());
      let ok = false;
      if (enrolled) {
        const res = await LocalAuthentication.authenticateAsync({ promptMessage: `Approve ${money(t.cart_total)} at ${t.name}`, disableDeviceFallback: false });
        ok = res.success;
      } else {
        Alert.alert('Face ID unavailable', 'Approvals require Face ID or a passcode on this device.');
      }
      if (!ok) return;
      const { cart, token } = await approveCart(t.id, true);
      replace(cart);
      const placed = await placeCart(t.id, token);
      replace(placed);
      haptic.success();
    } catch (err: any) {
      haptic.error();
      Alert.alert('Not approved', String(err?.message || err).replace(/^API \d+: /, '').replace(/^\{"detail":"|"\}$/g, ''));
      load();
    } finally {
      setBusy(null);
    }
  }, [load]);

  const reject = useCallback((t: CartTask) => {
    Alert.prompt?.('Reject cart', 'What was wrong? (kept in the audit trail)', async (reason) => {
      try { replace(await rejectCart(t.id, reason)); } catch (err) { console.warn(err); }
    });
    if (!Alert.prompt) rejectCart(t.id).then(replace).catch(console.warn);
  }, []);

  const confirm = useCallback((t: CartTask) => {
    Alert.alert('Did you press Place Order?', 'Only confirm after the store shows the order as placed.', [
      { text: 'Not yet', style: 'cancel' },
      { text: 'Yes, placed', onPress: async () => { try { replace(await confirmPlaced(t.id)); haptic.success(); } catch (err) { console.warn(err); } } },
    ]);
  }, []);

  const toggleKill = useCallback(async (on: boolean) => {
    haptic.warning();
    try { setSettings(await patchFoodSettings({ ordering_enabled: on })); } catch (err) { console.warn(err); }
  }, []);

  const allPlaced = carts.length > 0 && carts.every(c => c.status === 'placed');

  return (
    <ScreenBackground>
      <ScrollView contentContainerStyle={s.container}>
        <Text style={typography.eyebrow}>STEP 5 · {settings?.supervised_cycles_remaining ? `SUPERVISED · ${settings.supervised_cycles_remaining} CYCLE${settings.supervised_cycles_remaining === 1 ? '' : 'S'} LEFT` : 'UNATTENDED'}</Text>
        <Text style={s.title}>Carts &amp; approvals</Text>

        <View style={[s.card, { flexDirection: 'row', alignItems: 'center', gap: 12 }]}>
          <View style={{ flex: 1 }}>
            <Text style={s.rowK}>Ordering {settings?.ordering_enabled ? 'enabled' : 'switched off'}</Text>
            <Text style={s.rowSub}>Kill switch. Off means no cart can be approved or placed, whatever the agent does.</Text>
          </View>
          <Switch value={!!settings?.ordering_enabled} onValueChange={toggleKill} trackColor={{ true: colors.success, false: colors.line }} />
        </View>

        {carts.map(t => (
          <View key={t.id} style={s.card}>
            <View style={s.head}>
              <View style={{ flex: 1 }}>
                <Text style={s.bagName}>{t.name}</Text>
                <Text style={[s.rowSub, { color: STATUS_COLOR[t.status] }]}>{STATUS_TEXT[t.status]}</Text>
              </View>
              <Text style={[s.pill, { color: STATUS_COLOR[t.status] }]}>{t.status.replace('_', ' ').toUpperCase()}</Text>
            </View>

            {t.cart_lines.length > 0 && (
              <View style={s.shot}>
                <View style={s.shotHead}><Text style={s.shotHeadT}>{t.name} · Cart</Text><Text style={s.shotHeadT}>{t.cart_lines.length} items</Text></View>
                {t.cart_lines.map((l, i) => (
                  <View key={i} style={s.shotLine}><Text style={s.shotT} numberOfLines={1}>{l.qty > 1 ? `${l.qty}× ` : ''}{l.product || l.name}</Text><Text style={s.shotT}>{money(l.line_total)}</Text></View>
                ))}
                <View style={s.shotTotal}><Text style={s.shotTotalT}>Total (incl. delivery)</Text><Text style={s.shotTotalT}>{money(t.cart_total)}</Text></View>
              </View>
            )}
            {t.error ? <Text style={[s.rowSub, { color: colors.error }]}>{t.error}</Text> : null}

            {t.status === 'needs_review' && (
              <>
                <TouchableOpacity style={s.btn} onPress={() => approve(t)} disabled={busy === t.id} activeOpacity={0.9}>
                  <Text style={s.btnText}>{busy === t.id ? 'Approving…' : `Approve ${money(t.cart_total)} with Face ID`}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.danger} onPress={() => reject(t)}><Text style={s.dangerText}>Reject</Text></TouchableOpacity>
              </>
            )}
            {t.status === 'approved' && <Text style={s.help}>Single-use token issued for {money(t.cart_total)} · expires {t.approval_expires_at ? new Date(t.approval_expires_at + 'Z').toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'in 15 min'}.</Text>}
            {t.status === 'awaiting_human' && (
              <>
                <Text style={s.help}>The executor re-read the total, then stopped with the cursor on Place Order in your Mac's Habits browser profile. Press it there.</Text>
                <TouchableOpacity style={s.btn} onPress={() => confirm(t)} activeOpacity={0.9}><Text style={s.btnText}>I pressed Place Order</Text></TouchableOpacity>
              </>
            )}
            {t.status === 'placed' && t.order && (
              <Text style={s.help}>Order {t.order.merchant_order_id} · {money(t.order.total)} · {t.order.placed_by === 'human' ? 'placed by you' : 'placed by the agent'}{t.order.delivery_window ? ` · ${t.order.delivery_window}` : ''}. Receipt and screenshots kept.</Text>
            )}
            {(t.status === 'failed' || t.status === 'rejected') && (
              <TouchableOpacity style={s.ghost} onPress={() => runCart(t.id).then(replace).catch(console.warn)}><Text style={s.ghostText}>Rebuild cart</Text></TouchableOpacity>
            )}
            {t.events.length > 0 && <Text style={s.audit}>{t.events.map(e => `${e.ts.slice(11, 16)} ${e.event}${e.detail ? ' · ' + e.detail : ''}`).join('\n')}</Text>}
          </View>
        ))}
        {!carts.length && <Text style={s.help}>No approved bags yet.</Text>}

        <Text style={s.help}>Caps: {money(settings?.per_order_cap)} per order · {money(settings?.per_cycle_cap)} per cycle · one order per store per cycle · approvals expire after {settings?.approval_ttl_minutes ?? 15} min and are bound to the cart total.</Text>

        <TouchableOpacity style={[s.btn, !allPlaced && { opacity: 0.5 }]} onPress={() => navigation.navigate('FoodSpend')} disabled={!allPlaced} activeOpacity={0.9}>
          <Text style={s.btnText}>See spend</Text>
        </TouchableOpacity>
        <View style={{ height: 120 }} />
      </ScrollView>
    </ScreenBackground>
  );
}

const s = StyleSheet.create({
  container: { paddingHorizontal: spacing.md, paddingTop: spacing.md, paddingBottom: 140 },
  title: { ...typography.serifLarge, marginTop: 4, marginBottom: 12 },
  help: { fontFamily: fonts.regular, fontSize: 12.5, color: colors.textSecondary, lineHeight: 17, marginTop: 8 },
  card: { backgroundColor: colors.card, borderRadius: 18, borderWidth: 1, borderColor: colors.line, padding: 14, marginBottom: 12 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  bagName: { fontFamily: fonts.semibold, fontSize: 15, color: colors.text },
  rowK: { fontFamily: fonts.medium, fontSize: 14, color: colors.text },
  rowSub: { fontFamily: fonts.regular, fontSize: 11.5, color: colors.textTertiary, marginTop: 2 },
  pill: { fontFamily: fonts.mono, fontSize: 9, letterSpacing: 1 },
  shot: { backgroundColor: '#FFFFFF', borderRadius: 10, padding: 10, marginTop: 10 },
  shotHead: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  shotHeadT: { fontFamily: fonts.semibold, fontSize: 11.5, color: '#333' },
  shotLine: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, paddingVertical: 3, borderTopWidth: 1, borderTopColor: '#EEE' },
  shotT: { fontFamily: fonts.regular, fontSize: 11.5, color: '#222', flexShrink: 1 },
  shotTotal: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: 6, marginTop: 4, borderTopWidth: 2, borderTopColor: '#333' },
  shotTotalT: { fontFamily: fonts.bold, fontSize: 12, color: '#111' },
  btn: { backgroundColor: colors.accent, borderRadius: radius.md, paddingVertical: 14, alignItems: 'center', marginTop: 12 },
  btnText: { fontFamily: fonts.semibold, fontSize: 15, color: colors.bg },
  danger: { alignItems: 'center', paddingVertical: 10 },
  dangerText: { fontFamily: fonts.medium, fontSize: 13, color: colors.error },
  ghost: { alignItems: 'center', paddingVertical: 10 },
  ghostText: { fontFamily: fonts.medium, fontSize: 13, color: colors.accentLight },
  audit: { fontFamily: fonts.mono, fontSize: 9.5, color: colors.textTertiary, marginTop: 10, lineHeight: 14 },
});
