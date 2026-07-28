/**
 * MeScreen — profile + identity + connections + preferences + account.
 * Ported from `profile.jsx` `MeTab` in the design canvas.
 *
 * Connections shows the real, opt-in Whoop integration status and lets the
 * user connect/disconnect via the backend OAuth flow.
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, RefreshControl, Alert,
} from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, radius, spacing } from '../theme';
import {
  getDashboardStats, DashboardStats,
  getIntegrationStatus, integrationAuthorizeUrl, disconnectIntegration,
} from '../api/client';
import { haptic } from '../utils/haptics';
import ScreenBackground from '../components/ScreenBackground';
import Topbar from '../components/Topbar';

interface SectionRow {
  k: string;
  v: string;
  kind: 'link' | 'status';
  good?: boolean;
  onPress?: () => void;
}

interface Section {
  h: string;
  items: SectionRow[];
}

export default function MeScreen() {
  const insets = useSafeAreaInsets();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [whoopConnected, setWhoopConnected] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const st = await getIntegrationStatus();
      setWhoopConnected(!!st.whoop);
    } catch (err) {
      console.warn('MeScreen integration status error:', err);
    }
  }, []);

  const fetchStats = useCallback(async () => {
    try {
      const s = await getDashboardStats();
      setStats(s);
    } catch (err) {
      console.warn('MeScreen stats error:', err);
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchStats(); fetchStatus(); }, [fetchStats, fetchStatus]);

  const connectWhoop = useCallback(async () => {
    haptic.medium();
    try {
      // Opens the backend OAuth consent flow; when the browser session ends we
      // re-check status (the callback stores tokens server-side).
      await WebBrowser.openAuthSessionAsync(integrationAuthorizeUrl('whoop'));
    } catch (err) {
      console.warn('Whoop connect error:', err);
    }
    fetchStatus();
  }, [fetchStatus]);

  const disconnectWhoop = useCallback(() => {
    Alert.alert('Disconnect Whoop', 'Stop showing Whoop recovery/strain in the app?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Disconnect', style: 'destructive',
        onPress: async () => {
          haptic.medium();
          try { await disconnectIntegration('whoop'); } catch (e) { console.warn(e); }
          fetchStatus();
        },
      },
    ]);
  }, [fetchStatus]);

  // Stats — pulled from real dashboard data with sensible fallbacks
  const longestStreak = stats?.streaks?.length
    ? Math.max(...stats.streaks.map(s => s.longest_streak ?? 0))
    : 0;
  const currentStreak = stats?.streaks?.length
    ? Math.max(...stats.streaks.map(s => s.current_streak ?? 0))
    : 0;
  const lifetimeHours = stats?.hours?.all_time ?? 0;
  const pillarsTracked = stats?.pillar_breakdown?.length ?? 5;

  const statCards = [
    { l: 'PILLARS', v: String(pillarsTracked), sub: 'tracked' },
    { l: 'DEEP HRS', v: String(Math.round(lifetimeHours)), sub: 'lifetime' },
    { l: 'STREAK', v: `${currentStreak}d`, sub: longestStreak > 0 ? `best ${longestStreak}d` : 'best —' },
    { l: 'JOINED', v: 'Oct', sub: '2024' },
  ];

  const sections: Section[] = [
    {
      h: 'Identity',
      items: [
        { k: 'Vision · 2026', v: 'Edit', kind: 'link' },
        { k: 'Pillars · 5', v: 'Manage', kind: 'link' },
        { k: 'Anti-goals', v: '—', kind: 'link' },
      ],
    },
    {
      h: 'Connections',
      items: [
        whoopConnected
          ? { k: 'Whoop', v: 'Connected · tap to disconnect', kind: 'status', good: true, onPress: disconnectWhoop }
          : { k: 'Whoop', v: 'Connect', kind: 'link', onPress: connectWhoop },
      ],
    },
    {
      h: 'Preferences',
      items: [
        { k: 'Theme', v: 'Ink', kind: 'link' },
        { k: 'Notifications', v: 'Daily 6:30', kind: 'link' },
        { k: 'Units', v: 'Imperial', kind: 'link' },
      ],
    },
    {
      h: 'Account',
      items: [
        { k: 'Export data', v: '→', kind: 'link' },
        { k: 'Sign out', v: '→', kind: 'link' },
      ],
    },
  ];

  return (
    <ScreenBackground>
      <ScrollView
        style={s.scroll}
        contentContainerStyle={[s.container, { paddingTop: insets.top + spacing.md }]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); fetchStats(); }}
            tintColor={colors.accent}
          />
        }
      >
        {/* Topbar with brand mark */}
        <View style={{ marginHorizontal: -spacing.md }}>
          <Topbar title="Profile" caption="OPERATOR · J. SLEE" />
        </View>

        {/* Identity hero card */}
        <View style={s.heroCard}>
          <LinearGradient
            colors={[colors.accent, '#7B5CD2']}
            style={s.avatarLarge}
          >
            <Text style={s.avatarLargeText}>js</Text>
          </LinearGradient>
          <Text style={s.name}>Operator</Text>
          <Text style={s.metaLine}>
            DAY {Math.max(1, currentStreak)} · KEEPING THE WORD
          </Text>

          {/* 4-stat grid */}
          <View style={s.statGrid}>
            {statCards.map((c, i) => (
              <View key={i} style={[s.statCell, i > 0 && { borderLeftWidth: 1, borderLeftColor: colors.line }]}>
                <Text style={s.statLabel}>{c.l}</Text>
                <Text style={s.statValue}>{c.v}</Text>
                <Text style={s.statSub}>{c.sub}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Sections */}
        {sections.map((sec, si) => (
          <View key={si} style={{ marginTop: 16 }}>
            <Text style={s.sectionEyebrow}>{sec.h.toUpperCase()}</Text>
            <View style={s.sectionCard}>
              {sec.items.map((it, i) => (
                <TouchableOpacity
                  key={i}
                  activeOpacity={0.85}
                  onPress={it.onPress}
                  style={[s.row, i > 0 && { borderTopWidth: 1, borderTopColor: colors.line }]}
                >
                  <Text style={s.rowLabel}>{it.k}</Text>
                  {it.kind === 'status' ? (
                    <Text
                      style={[
                        s.statusText,
                        { color: it.good ? colors.recoveryGreen : colors.textTertiary },
                      ]}
                    >
                      {it.good ? '● ' : '○ '}{it.v.toUpperCase()}
                    </Text>
                  ) : (
                    <Text style={s.rowValue}>{it.v}</Text>
                  )}
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ))}

        <View style={{ height: 80 }} />
      </ScrollView>
    </ScreenBackground>
  );
}

const s = StyleSheet.create({
  scroll: { flex: 1 },
  container: {
    paddingHorizontal: spacing.md,
    paddingBottom: 140,
  },

  topbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 0,
    paddingTop: 8,
    paddingBottom: 12,
  },
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  brandDot: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
    backgroundColor: colors.accent,
  },
  brandText: {
    fontFamily: fonts.serifItalic,
    fontSize: 22,
    color: colors.text,
    letterSpacing: -0.5,
  },
  avatarSmall: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarSmallText: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: colors.text,
  },

  heroCard: {
    marginTop: 4,
    marginBottom: 18,
    paddingTop: 24,
    paddingBottom: 20,
    paddingHorizontal: 18,
    borderRadius: 22,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
  },
  avatarLarge: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLargeText: {
    fontFamily: fonts.serifItalic,
    fontSize: 38,
    color: colors.bg,
  },
  name: {
    fontFamily: fonts.serifItalic,
    fontSize: 28,
    color: colors.text,
    letterSpacing: -0.5,
    marginTop: 14,
  },
  metaLine: {
    fontFamily: fonts.mono,
    fontSize: 10,
    color: colors.textTertiary,
    letterSpacing: 1.8,
    marginTop: 4,
  },
  statGrid: {
    flexDirection: 'row',
    width: '100%',
    marginTop: 22,
    paddingTop: 18,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  statCell: {
    flex: 1,
    alignItems: 'center',
  },
  statLabel: {
    fontFamily: fonts.mono,
    fontSize: 9,
    color: colors.textTertiary,
    letterSpacing: 1.6,
  },
  statValue: {
    fontFamily: fonts.mono,
    fontSize: 18,
    color: colors.text,
    letterSpacing: -0.5,
    marginTop: 4,
  },
  statSub: {
    fontFamily: fonts.mono,
    fontSize: 9,
    color: colors.textTertiary,
    letterSpacing: 1.2,
    marginTop: 2,
  },

  sectionEyebrow: {
    fontFamily: fonts.mono,
    fontSize: 9,
    color: colors.textTertiary,
    letterSpacing: 2.2,
    marginBottom: 8,
    paddingLeft: 4,
  },
  sectionCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  rowLabel: {
    fontFamily: fonts.regular,
    fontSize: 14,
    color: colors.text,
  },
  rowValue: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: colors.textTertiary,
    letterSpacing: 1.4,
  },
  statusText: {
    fontFamily: fonts.mono,
    fontSize: 10,
    letterSpacing: 1.4,
  },
});
