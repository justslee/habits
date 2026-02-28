/**
 * Route Discovery — discover loop routes from your current location.
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import MapView, { Polyline } from '../components/MapView';
import { discoverRoutes, saveDiscoveredRoute, DiscoveredRoute } from '../api/client';
import { colors, spacing, typography, radius, cardStyle } from '../theme';
import { haptic } from '../utils/haptics';

const DISTANCE_OPTIONS = [
  { label: '1 mi', value: 1 },
  { label: '2 mi', value: 2 },
  { label: '5K', value: 3.1 },
  { label: '5 mi', value: 5 },
  { label: '10K', value: 6.2 },
  { label: '10 mi', value: 10 },
];

const DIFFICULTY_COLORS: Record<string, string> = {
  easy: colors.success,
  moderate: colors.warning,
  hilly: colors.error,
};

export default function RouteSuggestionsScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const [distance, setDistance] = useState(3.1);
  const [routes, setRoutes] = useState<DiscoveredRoute[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savingIdx, setSavingIdx] = useState<number | null>(null);
  const [savedIdxs, setSavedIdxs] = useState<Set<number>>(new Set());
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);

  const getLocation = useCallback(async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setError('Location permission required');
        return null;
      }
      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const c = { lat: loc.coords.latitude, lng: loc.coords.longitude };
      setCoords(c);
      return c;
    } catch {
      setError('Could not get location');
      return null;
    }
  }, []);

  const discover = useCallback(async (distMiles: number) => {
    setLoading(true);
    setError(null);
    setRoutes([]);
    setSavedIdxs(new Set());

    let loc = coords;
    if (!loc) {
      loc = await getLocation();
      if (!loc) { setLoading(false); return; }
    }

    try {
      const resp = await discoverRoutes(loc.lat, loc.lng, distMiles);
      setRoutes(resp.routes);
      if (resp.routes.length === 0) {
        setError('No routes found for this distance. Try a different distance.');
      }
    } catch (err: any) {
      const msg = err?.message || '';
      if (msg.includes('503')) {
        setError('Route engine offline. Start GraphHopper first.');
      } else {
        setError('Failed to discover routes. Check connection.');
      }
    }
    setLoading(false);
  }, [coords, getLocation]);

  useEffect(() => {
    discover(distance);
  }, []);

  const onDistanceChange = (val: number) => {
    setDistance(val);
    haptic.light();
    discover(val);
  };

  const saveRoute = async (route: DiscoveredRoute, idx: number) => {
    setSavingIdx(idx);
    try {
      await saveDiscoveredRoute(route);
      haptic.success();
      setSavedIdxs(prev => new Set(prev).add(idx));
    } catch {
      haptic.error();
    }
    setSavingIdx(null);
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: 40 }}
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation?.goBack?.()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Discover Routes</Text>
      </View>

      {/* Distance Selector */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.pillRow}
      >
        {DISTANCE_OPTIONS.map(opt => (
          <TouchableOpacity
            key={opt.value}
            style={[styles.pill, distance === opt.value && styles.pillActive]}
            onPress={() => onDistanceChange(opt.value)}
          >
            <Text style={[styles.pillText, distance === opt.value && styles.pillTextActive]}>
              {opt.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Loading State */}
      {loading && (
        <View style={styles.loadingContainer}>
          {[0, 1, 2].map(i => (
            <View key={i} style={styles.skeletonCard}>
              <View style={styles.skeletonMap} />
              <View style={styles.skeletonLines}>
                <View style={[styles.skeletonBar, { width: '70%' }]} />
                <View style={[styles.skeletonBar, { width: '90%' }]} />
                <View style={[styles.skeletonBar, { width: '50%' }]} />
              </View>
            </View>
          ))}
          <ActivityIndicator size="large" color={colors.accent} style={{ marginTop: spacing.md }} />
          <Text style={styles.loadingText}>Finding routes near you...</Text>
        </View>
      )}

      {/* Error State */}
      {error && !loading && (
        <View style={styles.errorContainer}>
          <Ionicons name="compass-outline" size={48} color={colors.textTertiary} />
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={() => discover(distance)}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Route Cards */}
      {!loading && routes.map((route, idx) => {
        const diffColor = DIFFICULTY_COLORS[route.difficulty] || colors.textTertiary;
        const isSaved = savedIdxs.has(idx);

        // Calculate map region from polyline
        const lats = route.polyline.map(p => p.lat);
        const lngs = route.polyline.map(p => p.lng);
        const minLat = Math.min(...lats);
        const maxLat = Math.max(...lats);
        const minLng = Math.min(...lngs);
        const maxLng = Math.max(...lngs);
        const padding = 0.002;

        return (
          <View key={idx} style={styles.routeCard}>
            {/* Mini Map */}
            {Platform.OS !== 'web' && route.polyline.length > 1 && (
              <MapView
                style={styles.miniMap}
                scrollEnabled={false}
                zoomEnabled={false}
                rotateEnabled={false}
                pitchEnabled={false}
                initialRegion={{
                  latitude: (minLat + maxLat) / 2,
                  longitude: (minLng + maxLng) / 2,
                  latitudeDelta: (maxLat - minLat) + padding,
                  longitudeDelta: (maxLng - minLng) + padding,
                }}
              >
                <Polyline
                  coordinates={route.polyline.map(p => ({ latitude: p.lat, longitude: p.lng }))}
                  strokeColor={colors.accent}
                  strokeWidth={3}
                />
              </MapView>
            )}

            {/* Route Info */}
            <View style={styles.routeInfo}>
              <Text style={styles.routeName}>{route.name}</Text>
              <Text style={styles.routeDesc}>{route.description}</Text>

              {/* Stats Row */}
              <View style={styles.statsRow}>
                <View style={styles.stat}>
                  <Ionicons name="resize-outline" size={14} color={colors.textSecondary} />
                  <Text style={styles.statText}>{route.distance_miles.toFixed(1)} mi</Text>
                </View>
                <View style={styles.stat}>
                  <Ionicons name="trending-up-outline" size={14} color={colors.textSecondary} />
                  <Text style={styles.statText}>{route.elevation_gain_ft} ft</Text>
                </View>
                <View style={styles.stat}>
                  <Ionicons name="time-outline" size={14} color={colors.textSecondary} />
                  <Text style={styles.statText}>{route.estimated_time_minutes} min</Text>
                </View>
                <View style={[styles.diffBadge, { backgroundColor: diffColor + '20' }]}>
                  <Text style={[styles.diffText, { color: diffColor }]}>{route.difficulty}</Text>
                </View>
              </View>

              {/* Street Names */}
              {route.street_names.length > 0 && (
                <Text style={styles.streets} numberOfLines={1}>
                  {route.street_names.join(' · ')}
                </Text>
              )}
            </View>

            {/* Save Button */}
            <TouchableOpacity
              style={[styles.saveBtn, isSaved && styles.saveBtnSaved]}
              onPress={() => saveRoute(route, idx)}
              disabled={isSaved || savingIdx === idx}
            >
              {savingIdx === idx ? (
                <ActivityIndicator size="small" color={colors.accent} />
              ) : (
                <>
                  <Ionicons
                    name={isSaved ? 'checkmark' : 'bookmark-outline'}
                    size={16}
                    color={isSaved ? colors.success : colors.accent}
                  />
                  <Text style={[styles.saveBtnText, isSaved && { color: colors.success }]}>
                    {isSaved ? 'Saved' : 'Save'}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },

  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.lg, marginBottom: spacing.md,
  },
  backBtn: { marginRight: spacing.md },
  title: { ...typography.title1, color: colors.text },

  pillRow: {
    paddingHorizontal: spacing.lg, gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  pill: {
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderRadius: radius.xl, backgroundColor: colors.card,
    borderWidth: 1, borderColor: colors.border,
  },
  pillActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  pillText: { ...typography.caption, color: colors.textSecondary, fontWeight: '600' },
  pillTextActive: { color: '#fff' },

  loadingContainer: { alignItems: 'center', paddingHorizontal: spacing.lg },
  skeletonCard: {
    ...cardStyle, marginBottom: spacing.md, width: '100%',
    marginHorizontal: spacing.lg,
  },
  skeletonMap: {
    height: 150, backgroundColor: colors.input, borderRadius: radius.sm,
    marginBottom: spacing.md,
  },
  skeletonLines: { gap: spacing.sm },
  skeletonBar: {
    height: 12, backgroundColor: colors.input, borderRadius: radius.sm,
  },
  loadingText: {
    ...typography.caption, color: colors.textTertiary, marginTop: spacing.sm,
  },

  errorContainer: {
    alignItems: 'center', paddingTop: 60, gap: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  errorText: { ...typography.body, color: colors.textSecondary, textAlign: 'center' },
  retryBtn: {
    paddingHorizontal: spacing.lg, paddingVertical: spacing.sm,
    backgroundColor: colors.accent, borderRadius: radius.sm,
  },
  retryText: { ...typography.bodyBold, color: '#fff' },

  routeCard: {
    ...cardStyle, marginHorizontal: spacing.lg, marginBottom: spacing.md,
    overflow: 'hidden',
  },
  miniMap: { height: 150, borderRadius: radius.sm, marginBottom: spacing.md },
  routeInfo: { paddingBottom: spacing.sm },
  routeName: { ...typography.title3, color: colors.text, marginBottom: 4 },
  routeDesc: { ...typography.caption, color: colors.textSecondary, marginBottom: spacing.md },

  statsRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.sm },
  stat: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  statText: { ...typography.caption, color: colors.textSecondary, fontWeight: '600' },
  diffBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.sm },
  diffText: { fontSize: 11, fontWeight: '700', textTransform: 'capitalize' },

  streets: { ...typography.micro, color: colors.textTertiary },

  saveBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: spacing.xs, marginTop: spacing.md,
    paddingVertical: spacing.sm, borderRadius: radius.sm,
    backgroundColor: colors.accentMuted, borderWidth: 1, borderColor: colors.accent + '30',
  },
  saveBtnSaved: { backgroundColor: colors.success + '15', borderColor: colors.success + '30' },
  saveBtnText: { ...typography.caption, color: colors.accent, fontWeight: '700' },
});
