/**
 * Route Library — P4-062
 *
 * Browse saved routes, select one before starting a run.
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, RefreshControl, Alert, Animated,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, typography, radius, fonts } from '../theme';
import { haptic } from '../utils/haptics';
import { API_URL, apiHeaders } from '../api/client';
import ScreenBackground from '../components/ScreenBackground';
import ActivityListCard from '../components/ActivityListCard';
import EmptyState from '../components/EmptyState';
import { usePressScale } from '../hooks/usePressScale';

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
  const insets = useSafeAreaInsets();
  const [routes, setRoutes] = useState<RouteItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchRoutes = useCallback(async () => {
    try {
      const resp = await fetch(`${API_URL}/api/v1/routes/`, { headers: apiHeaders() });
      if (resp.ok) setRoutes(await resp.json());
    } catch (err) {
      console.warn('RouteLibrary fetch error:', err);
    }
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
            await fetch(`${API_URL}/api/v1/routes/${id}`, { method: 'DELETE', headers: apiHeaders() });
            setRoutes(prev => prev.filter(r => r.id !== id));
            haptic.success();
          } catch (err) {
            console.warn('RouteLibrary delete error:', err);
          }
        },
      },
    ]);
  };

  return (
    <ScreenBackground>
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingTop: 12 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
    >
      <View style={{ paddingHorizontal: spacing.md, marginBottom: spacing.md }}>
        <Text style={{ fontFamily: fonts.mono, fontSize: 9, color: colors.textTertiary, letterSpacing: 2.2 }}>SAVED · ROUTES</Text>
        <Text style={{ fontFamily: fonts.serifItalic, fontSize: 28, color: colors.text, letterSpacing: -0.6, marginTop: 4 }}>Routes</Text>
      </View>

      {routes.length === 0 && !loading && (
        <EmptyState
          icon="map-outline"
          title="No saved routes"
          subtitle="Routes from your runs will appear here"
        />
      )}

      {routes.map(route => (
        <RouteCard key={route.id} route={route} onLongPress={() => deleteRoute(route.id, route.name)} />
      ))}

      <View style={{ height: 40 }} />
    </ScrollView>
    </ScreenBackground>
  );
}

function RouteCard({ route, onLongPress }: { route: RouteItem; onLongPress: () => void }) {
  const { animStyle, onPressIn, onPressOut } = usePressScale(0.97);
  const tags = route.tags ? route.tags.split(',').map(t => t.trim()) : [];

  const subtitleParts = [`${route.distance_miles.toFixed(1)} mi`];
  if (route.elevation_gain_ft != null && route.elevation_gain_ft > 0) {
    subtitleParts.push(`${Math.round(route.elevation_gain_ft)} ft elev`);
  }

  return (
    <Animated.View style={animStyle}>
      <TouchableOpacity
        activeOpacity={0.7}
        onLongPress={onLongPress}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        style={{ marginHorizontal: spacing.lg }}
      >
        <ActivityListCard
          accentColor={colors.accent}
          title={route.name}
          subtitle={subtitleParts.join(' \u2022 ')}
          metric={route.best_time_seconds != null ? fmtDuration(route.best_time_seconds) : undefined}
          metricLabel={route.best_time_seconds != null ? 'BEST' : undefined}
          metricColor={colors.success}
          icon="map-outline"
        >
          {(tags.length > 0 || route.times_run > 0) && (
            <View style={styles.tagRow}>
              {route.times_run > 0 && (
                <View style={styles.tag}>
                  <Text style={styles.tagText}>{route.times_run} run{route.times_run !== 1 ? 's' : ''}</Text>
                </View>
              )}
              {tags.map(tag => (
                <View key={tag} style={styles.tag}>
                  <Text style={styles.tagText}>{tag}</Text>
                </View>
              ))}
            </View>
          )}
        </ActivityListCard>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg, marginBottom: spacing.lg },
  backBtn: { marginRight: spacing.md },
  title: { ...typography.title1, color: colors.text },

  tagRow: { flexDirection: 'row', gap: 4, marginTop: 4 },
  tag: {
    backgroundColor: colors.bg, paddingHorizontal: 6, paddingVertical: 1,
    borderRadius: 4, borderWidth: 1, borderColor: colors.border,
  },
  tagText: { fontSize: 9, color: colors.textTertiary, letterSpacing: 0.3 },
});
