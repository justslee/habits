/**
 * Route Library — P4-062
 *
 * Browse saved routes, select one before starting a run.
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, Platform, RefreshControl, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, typography, radius } from '../theme';

const API = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8000';

interface RouteItem {
  id: number;
  name: string;
  distance_miles: number;
  elevation_gain_ft: number | null;
  route_type: string | null;
  tags: string | null;
  times_run: number;
  best_time_seconds: number | null;
  last_run_date: string | null;
}

const ROUTE_TYPE_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  loop: 'sync-outline',
  out_and_back: 'swap-horizontal-outline',
  point_to_point: 'arrow-forward-outline',
};

function fmtDuration(s: number): string {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  if (m >= 60) {
    const h = Math.floor(m / 60);
    return `${h}:${(m % 60).toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  }
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

export default function RouteLibraryScreen({ navigation }: any) {
  const [routes, setRoutes] = useState<RouteItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchRoutes = useCallback(async () => {
    try {
      const resp = await fetch(`${API}/api/v1/routes/`);
      if (resp.ok) setRoutes(await resp.json());
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { fetchRoutes(); }, [fetchRoutes]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchRoutes();
    setRefreshing(false);
  }, [fetchRoutes]);

  const deleteRoute = (id: number, name: string) => {
    Alert.alert('Delete Route', `Remove "${name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          try {
            await fetch(`${API}/api/v1/routes/${id}`, { method: 'DELETE' });
            setRoutes(prev => prev.filter(r => r.id !== id));
          } catch {}
        },
      },
    ]);
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
    >
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation?.goBack?.()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Routes</Text>
      </View>

      {routes.length === 0 && !loading && (
        <View style={styles.emptyState}>
          <Ionicons name="map-outline" size={48} color={colors.textTertiary} />
          <Text style={styles.emptyTitle}>No saved routes</Text>
          <Text style={styles.emptySub}>Routes from your runs will appear here</Text>
        </View>
      )}

      {routes.map(route => {
        const typeIcon = ROUTE_TYPE_ICONS[route.route_type || ''] || 'navigate-outline';
        const tags = route.tags ? route.tags.split(',').map(t => t.trim()) : [];

        return (
          <TouchableOpacity
            key={route.id}
            style={styles.routeCard}
            onLongPress={() => deleteRoute(route.id, route.name)}
          >
            <View style={styles.routeIconBox}>
              <Ionicons name={typeIcon} size={22} color={colors.accent} />
            </View>

            <View style={styles.routeInfo}>
              <Text style={styles.routeName}>{route.name}</Text>
              <View style={styles.routeMeta}>
                <Text style={styles.routeDistance}>{route.distance_miles.toFixed(1)} mi</Text>
                {route.elevation_gain_ft != null && route.elevation_gain_ft > 0 && (
                  <Text style={styles.routeElev}>
                    <Ionicons name="trending-up" size={10} color={colors.textTertiary} /> {Math.round(route.elevation_gain_ft)} ft
                  </Text>
                )}
                {route.times_run > 0 && (
                  <Text style={styles.routeRuns}>{route.times_run} run{route.times_run !== 1 ? 's' : ''}</Text>
                )}
              </View>

              {tags.length > 0 && (
                <View style={styles.tagRow}>
                  {tags.map(tag => (
                    <View key={tag} style={styles.tag}>
                      <Text style={styles.tagText}>{tag}</Text>
                    </View>
                  ))}
                </View>
              )}
            </View>

            <View style={styles.routeRight}>
              {route.best_time_seconds != null && (
                <>
                  <Text style={styles.bestTime}>{fmtDuration(route.best_time_seconds)}</Text>
                  <Text style={styles.bestLabel}>BEST</Text>
                </>
              )}
            </View>
          </TouchableOpacity>
        );
      })}

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { paddingTop: Platform.OS === 'ios' ? 60 : 40 },

  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg, marginBottom: spacing.lg },
  backBtn: { marginRight: spacing.md },
  title: { ...typography.title1, color: colors.text },

  emptyState: { alignItems: 'center', paddingTop: 80, gap: spacing.sm },
  emptyTitle: { ...typography.title3, color: colors.textSecondary },
  emptySub: { ...typography.caption, color: colors.textTertiary },

  routeCard: {
    flexDirection: 'row', alignItems: 'center', marginHorizontal: spacing.lg,
    marginBottom: spacing.sm, padding: spacing.md,
    backgroundColor: colors.card, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border,
  },
  routeIconBox: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: colors.accentMuted,
    alignItems: 'center', justifyContent: 'center', marginRight: spacing.md,
  },
  routeInfo: { flex: 1 },
  routeName: { fontSize: 15, fontWeight: '600', color: colors.text, marginBottom: 2 },
  routeMeta: { flexDirection: 'row', gap: spacing.md },
  routeDistance: { ...typography.caption, color: colors.accent, fontWeight: '600' },
  routeElev: { ...typography.caption, color: colors.textTertiary },
  routeRuns: { ...typography.caption, color: colors.textTertiary },
  tagRow: { flexDirection: 'row', gap: 4, marginTop: 4 },
  tag: {
    backgroundColor: colors.bg, paddingHorizontal: 6, paddingVertical: 1,
    borderRadius: 4, borderWidth: 1, borderColor: colors.border,
  },
  tagText: { fontSize: 9, color: colors.textTertiary, letterSpacing: 0.3 },
  routeRight: { alignItems: 'flex-end', marginLeft: spacing.sm },
  bestTime: { fontSize: 14, fontWeight: '600', color: colors.success, fontVariant: ['tabular-nums'] },
  bestLabel: { ...typography.micro, color: colors.textTertiary },
});
